import { AdditiveBlending, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, PlaneGeometry, Vector3 } from 'three/webgpu'
import { clamp, cross, float, instancedBufferAttribute, mix, normalize, positionLocal, pow, select, smoothstep, uniform, uv, vec3 } from 'three/tsl'

/** Pool size: a flurry's rings overwrite the oldest. */
const MAX = 48
/** A ring's life (s): it snaps open in the first share of it and fades through the rest. */
const LIFE = 0.22

/**
 * Pierce rings: the air cracking round a spear's point as a thrust goes home
 * faster than sound would carry it, a thin bright ring snapping open in the
 * plane across the thrust and fading as it widens; seen along the thrust it is
 * a halo, from the side a flat shock. Each ring is a disc quad turned square
 * to its thrust in the vertex stage, additive in HDR (white-gold rim, a faint
 * gold wash inside), a few operations a fragment, one instanced draw
 * evaluated from birth data.
 */
export class Rings {
  readonly mesh: Mesh
  private readonly time = uniform(0)
  private clock = 0
  private cursor = 0
  private liveUntil = -1
  private readonly a0: InstancedBufferAttribute
  private readonly a1: InstancedBufferAttribute
  private readonly attributes: InstancedBufferAttribute[]

  constructor() {
    const quad = new PlaneGeometry(2, 2)
    const geometry = new InstancedBufferGeometry()
    geometry.index = quad.index
    geometry.setAttribute('position', quad.getAttribute('position'))
    geometry.setAttribute('uv', quad.getAttribute('uv'))
    geometry.instanceCount = MAX
    const make = (): InstancedBufferAttribute => {
      const a = new InstancedBufferAttribute(new Float32Array(MAX * 4), 4)
      a.setUsage(DynamicDrawUsage)
      return a
    }
    this.a0 = make()
    this.a1 = make()
    this.attributes = [this.a0, this.a1]
    for (let i = 0; i < MAX; i++) this.a0.array[i * 4 + 3] = 1e9
    // a0: centre xyz, birth; a1: thrust direction xyz, final radius
    const c = instancedBufferAttribute(this.a0, 'vec4') as any
    const d = instancedBufferAttribute(this.a1, 'vec4') as any
    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false })
    const age = this.time.sub(c.w)
    const alive = age.greaterThanEqual(0).and(age.lessThan(LIFE))
    const u = clamp(age.div(LIFE), 0, 1)
    // snaps open (an exponential ease), then creeps on
    const radius = d.w.mul(float(1).sub(pow(float(1).sub(u), 3)).mul(0.85).add(0.15))
    const axis = normalize(vec3(d.x, d.y, d.z))
    const side = normalize(cross(axis, vec3(0, 1, 0)).add(vec3(1e-4, 0, 0)))
    const up = cross(side, axis)
    const q = positionLocal
    m.positionNode = select(alive, c.xyz.add(side.mul(q.x.mul(radius))).add(up.mul(q.y.mul(radius))), vec3(0, -1000, 0))
    const r = uv().sub(0.5).mul(2).length()
    // the rim thins as it widens; a faint wash inside it
    const width = mix(float(0.22), float(0.06), u)
    const rim = smoothstep(width, 0, r.sub(0.9).abs())
    const wash = smoothstep(0.9, 0.2, r).mul(0.12).mul(float(1).sub(u))
    const fade = pow(float(1).sub(u), 1.4)
    m.colorNode = mix(vec3(1.0, 0.66, 0.3), vec3(1.0, 0.92, 0.78), rim).mul(rim.mul(7).add(wash)).mul(fade)
    this.mesh = new Mesh(geometry, m)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 3
  }

  /** A ring round `at`, square to the thrust `dir` (unit), opening to `radius` m. */
  emit(at: Vector3, dir: Vector3, radius: number): void {
    const i = this.cursor
    this.cursor = (this.cursor + 1) % MAX
    const a0 = this.a0.array as Float32Array
    const a1 = this.a1.array as Float32Array
    a0[i * 4] = at.x
    a0[i * 4 + 1] = at.y
    a0[i * 4 + 2] = at.z
    a0[i * 4 + 3] = this.clock
    a1[i * 4] = dir.x
    a1[i * 4 + 1] = dir.y
    a1[i * 4 + 2] = dir.z
    a1[i * 4 + 3] = radius
    for (const a of this.attributes) {
      a.addUpdateRange(i * 4, 4)
      a.needsUpdate = true
    }
    this.liveUntil = this.clock + LIFE
    this.mesh.visible = true
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
