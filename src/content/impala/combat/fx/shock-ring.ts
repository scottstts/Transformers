import { AdditiveBlending, BufferAttribute, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, Vector3 } from 'three/webgpu'
import { clamp, cos, exp, float, instancedBufferAttribute, mix, positionGeometry, pow, select, sin, smoothstep, uniform, vec2, vec3 } from 'three/tsl'
import { N } from '../../../../rendering/noise.ts'
import { SHOCK_EASE } from './shock-front.ts'

/** Rings at once (the oldest is overwritten), and the band's divisions round its circumference. */
const RINGS = 3
const SEGMENTS = 192

/**
 * A blow's wave going out through the air: a band of the Impala's crimson
 * light at the blade's height, expanding round the robot and slowing as it
 * spreads (eased out over its life), its leading edge white-hot, its body
 * streaked round the circumference, thinning and fading as it goes. One
 * instanced additive draw of open bands evaluated from birth data (centre,
 * height, birth, reach, life): an emit uploads only its own slot.
 */
export class ShockRing {
  readonly mesh: Mesh
  private readonly time = uniform(0)
  private clock = 0
  private cursor = 0
  private liveUntil = -1
  private readonly a0: InstancedBufferAttribute
  private readonly a1: InstancedBufferAttribute

  constructor() {
    const geometry = new InstancedBufferGeometry()
    // an open band: (angle, 0..1 up the band) per vertex
    const verts = new Float32Array((SEGMENTS + 1) * 2 * 3)
    const index: number[] = []
    for (let i = 0; i <= SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2
      verts.set([a, 0, 0, a, 1, 0], i * 6)
      if (i < SEGMENTS) index.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3)
    }
    geometry.setAttribute('position', new BufferAttribute(verts, 3))
    geometry.setIndex(index)
    geometry.instanceCount = RINGS
    const make = (): InstancedBufferAttribute => {
      const a = new InstancedBufferAttribute(new Float32Array(RINGS * 4), 4)
      a.setUsage(DynamicDrawUsage)
      return a
    }
    this.a0 = make()
    this.a1 = make()
    for (let i = 0; i < RINGS; i++) this.a0.array[i * 4 + 3] = 1e9
    // a0: centre xyz (the band's middle height), birth; a1: start radius, reach, life, band height
    const c = instancedBufferAttribute(this.a0, 'vec4') as any
    const r = instancedBufferAttribute(this.a1, 'vec4') as any
    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false })
    const age = this.time.sub(c.w)
    const u = clamp(age.div(r.z), 0, 1)
    const alive = age.greaterThanEqual(0).and(age.lessThan(r.z))
    // eased out: fast off the blade, slowing as it spreads
    const out = float(1).sub(pow(float(1).sub(u), SHOCK_EASE))
    const radius = r.x.add(r.y.sub(r.x).mul(out))
    const height = r.w.mul(mix(float(1), float(0.45), u))
    // (the geometry's own attribute: positionLocal is the placed point once positionNode is set, so in the colour it read the world's height)
    const angle = positionGeometry.x, up = positionGeometry.y
    m.positionNode = select(alive, vec3(c.x.add(cos(angle).mul(radius)), c.y.add(up.sub(0.5).mul(height)), c.z.add(sin(angle).mul(radius))), vec3(0, -1000, 0))
    // across the band: a hot line a little above its middle, its light falling off to both edges
    const line = exp(up.sub(0.58).div(0.07).pow(2).negate())
    const body = exp(up.sub(0.5).div(0.26).pow(2).negate())
    const streaks = N(vec2(angle.mul(7.5), age.mul(0.6).add(c.w))).r
    const torn = smoothstep(u.mul(0.9), u.mul(0.9).add(0.25), streaks)
    const fade = pow(float(1).sub(u), 1.4)
    const hot = mix(vec3(1.0, 0.05, 0.08), vec3(1.0, 0.68, 0.6), line)
    const glow = hot.mul(line.mul(6).add(body.mul(1.4).mul(torn))).mul(fade)
    m.colorNode = select(alive, glow, vec3(0))
    this.mesh = new Mesh(geometry, m)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 3
    this.mesh.visible = false
  }

  /** A wave from `at` (world: the ring's centre at the band's height), growing from `from` to `reach` m over `life` s, `height` m tall. */
  emit(at: Vector3, from: number, reach: number, life: number, height: number): void {
    const i = this.cursor
    this.cursor = (this.cursor + 1) % RINGS
    const a0 = this.a0.array as Float32Array, a1 = this.a1.array as Float32Array
    a0[i * 4] = at.x; a0[i * 4 + 1] = at.y; a0[i * 4 + 2] = at.z; a0[i * 4 + 3] = this.clock
    a1[i * 4] = from; a1[i * 4 + 1] = reach; a1[i * 4 + 2] = life; a1[i * 4 + 3] = height
    for (const a of [this.a0, this.a1]) {
      a.addUpdateRange(i * 4, 4)
      a.needsUpdate = true
    }
    this.liveUntil = Math.max(this.liveUntil, this.clock + life)
    this.mesh.visible = true
  }

  update(dt: number): void {
    this.clock += dt
    this.time.value = this.clock
    this.mesh.visible = this.clock < this.liveUntil
  }

  reset(): void {
    this.liveUntil = -1
    this.mesh.visible = false
  }

  warm(on: boolean): void {
    this.mesh.visible = on || this.clock < this.liveUntil
  }
}
