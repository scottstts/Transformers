import { AdditiveBlending, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, PlaneGeometry, type Vector3 } from 'three/webgpu'
import { Fn, cameraPosition, clamp, cross, float, instancedBufferAttribute, max, min, mix, normalize, positionLocal, select, sin, smoothstep, uniform, uv, vec2, vec3 } from 'three/tsl'
import { N } from '../../../../rendering/noise.ts'

/** Pool size: new rounds overwrite the oldest. */
const MAX = 160

/** A round from `from` to `to` at `speed` m/s. */
export interface TracerShot {
  from: Vector3
  to: Vector3
  speed: number
  /** streak width (m) and length (the exposure a fast round smears over, m) */
  width: number
  streak: number
  /**
   * 0: a tracer round (burning pyrotechnic: orange-white, gone as it lands);
   * 1: the cannon's slug, which leaves its ionised channel hanging along the
   * whole path, violet-white and flickering, for `linger` seconds
   */
  palette: number
  linger?: number
}

/**
 * Rounds in flight: one instanced draw of streaks, each stored once at birth
 * (its path, speed, width) and evaluated on the GPU. The head runs along the
 * path at the round's speed, the tail a streak's length behind it (a fast
 * round is a smear on film, not a dot); it is gone as it lands. The cannon's
 * slug leaves its channel behind: the whole path glows and flickers, then
 * thins and fades. Drawn additively in HDR.
 */
export class Tracers {
  readonly mesh: Mesh
  private readonly time = uniform(0)
  private clock = 0
  private cursor = 0
  private liveUntil = -1
  private readonly a: InstancedBufferAttribute[]

  constructor() {
    this.a = [0, 1, 2].map(() => {
      const a = new InstancedBufferAttribute(new Float32Array(MAX * 4), 4)
      a.setUsage(DynamicDrawUsage)
      return a
    })
    for (let i = 0; i < MAX; i++) this.a[0].array[i * 4 + 3] = 1e9
    const quad = new PlaneGeometry(1, 1)
    const geometry = new InstancedBufferGeometry()
    geometry.index = quad.index
    geometry.setAttribute('position', quad.getAttribute('position'))
    geometry.setAttribute('uv', quad.getAttribute('uv'))
    geometry.instanceCount = MAX
    // start + birth, end + speed, width, streak, palette, linger
    const [a0, a1, a2] = this.a.map((a) => instancedBufferAttribute(a, 'vec4') as any)
    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false })
    const age = this.time.sub(a0.w)
    const path = a1.xyz.sub(a0.xyz)
    const length = max(path.length(), 1e-3)
    const dir = path.div(length)
    const flight = length.div(max(a1.w, 1))
    const linger = a2.w
    const alive = age.greaterThanEqual(0).and(age.lessThan(flight.add(linger).add(0.02)))
    const head = min(age.mul(a1.w), length)
    // a lingering channel keeps its tail at the muzzle; a tracer's tail follows its head
    const channel = smoothstep(0, 0.5, linger)
    const tail = mix(max(head.sub(a2.y), 0), float(0), channel)
    const landed = age.greaterThan(flight)
    const fade = select(landed, float(1).sub(clamp(age.sub(flight).div(max(linger, 0.02)), 0, 1)), float(1))
    const mid = a0.xyz.add(dir.mul(head.add(tail).mul(0.5)))
    // Plane local x/y span side/dir: their cross must point toward the camera.
    const side = normalize(cross(mid.sub(cameraPosition), dir).add(vec3(1e-5, 0, 0)))
    const q = positionLocal
    const thin = mix(float(1), fade.mul(0.6).add(0.4), channel)
    const span = max(head.sub(tail), 0.01)
    m.positionNode = select(alive, mid.add(dir.mul(q.y.mul(span))).add(side.mul(q.x.mul(a2.x).mul(thin))), vec3(0, -1000, 0))
    m.colorNode = Fn(() => {
      const across = uv().x.sub(0.5).mul(2)
      const along = uv().y
      // A rounded, softly emitting muzzle end; its reach is in metres so a
      // long channel keeps its bright body. Short shots reserve at least 3/4.
      const rootLength = min(span.mul(0.25), max(a2.x.mul(4), 0.6))
      const root = clamp(along.mul(span).div(rootLength), 0, 1)
      const cap = float(1).sub(root).pow(2).mul(channel)
      const core = float(1).sub(across.mul(across)).sub(cap).max(0)
      // a tracer is brightest at its head and fades along the smear; the channel flickers along its length
      const streak = mix(along.pow(1.6), smoothstep(0, 1, root), channel)
      const flicker = N(vec2(along.mul(length.mul(0.35)).add(a0.w.mul(13)), this.time.mul(19))).r
      const shimmer = mix(float(1), flicker.mul(1.3).add(0.2).mul(sin(this.time.mul(90).add(a0.w.mul(7))).mul(0.2).add(0.8)), channel)
      const tracer = mix(vec3(2.2, 0.35, 0.06), vec3(7, 3.4, 1.2), core.pow(3))
      const arc = mix(vec3(1.1, 0.45, 3.4), vec3(5.2, 5, 7.5), core.pow(4))
      return mix(tracer, arc, a2.z).mul(core).mul(streak).mul(shimmer).mul(fade)
    })()
    this.mesh = new Mesh(geometry, m)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 3
    this.mesh.visible = false
  }

  /** A round in flight; returns its flight time (s). */
  fire(s: TracerShot): number {
    const [A0, A1, A2] = this.a.map((a) => a.array as Float32Array)
    const i = this.cursor
    this.cursor = (i + 1) % MAX
    A0.set([s.from.x, s.from.y, s.from.z, this.clock], i * 4)
    A1.set([s.to.x, s.to.y, s.to.z, s.speed], i * 4)
    A2.set([s.width, s.streak, s.palette, s.linger ?? 0], i * 4)
    for (const a of this.a) {
      a.addUpdateRange(i * 4, 4)
      a.needsUpdate = true
    }
    const flight = s.from.distanceTo(s.to) / s.speed
    this.liveUntil = Math.max(this.liveUntil, this.clock + flight + (s.linger ?? 0) + 0.05)
    this.mesh.visible = true
    return flight
  }

  update(dt: number): void {
    this.clock += dt
    this.time.value = this.clock
    this.mesh.visible = this.clock < this.liveUntil
  }

  warm(on: boolean): void {
    this.mesh.visible = on || this.clock < this.liveUntil
  }
}
