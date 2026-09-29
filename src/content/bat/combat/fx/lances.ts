import { AdditiveBlending, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, PlaneGeometry, Vector3 } from 'three/webgpu'
import { cameraPosition, clamp, cross, float, instancedBufferAttribute, mix, normalize, positionLocal, pow, select, smoothstep, uniform, uv, vec3 } from 'three/tsl'

/** Pool size: a flurry's lances overwrite the oldest. */
const MAX = 96
/** Seconds the point takes to run out along a lance, and the lance's whole life. */
const RUN = 0.05
const LIFE = 0.2

/**
 * Lances: what a spear's point leaves in the air at a thrust too fast to
 * follow, the exposure's smear of the point driving out. Each is a thin
 * spindle from where the thrust began to where the point went home: the
 * point runs out along it in a few hundredths of a second (the smear grows
 * behind it), and the whole streak fades, thinning from its root, within a
 * fifth of a second. Camera-facing ribbons along the thrust, additive in
 * HDR (bronze-white at the point, cooling to a faint gold at the root), one
 * instanced draw evaluated from birth data.
 */
export class Lances {
  readonly mesh: Mesh
  private readonly time = uniform(0)
  private clock = 0
  private cursor = 0
  private liveUntil = -1
  private readonly a0: InstancedBufferAttribute
  private readonly a1: InstancedBufferAttribute
  private readonly attributes: InstancedBufferAttribute[]

  constructor() {
    const quad = new PlaneGeometry(1, 1)
    quad.translate(0, 0.5, 0)
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
    // a0: root xyz, birth; a1: thrust (direction x length) xyz, width
    const p0 = instancedBufferAttribute(this.a0, 'vec4') as any
    const d0 = instancedBufferAttribute(this.a1, 'vec4') as any
    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false })
    const age = this.time.sub(p0.w)
    const alive = age.greaterThanEqual(0).and(age.lessThan(LIFE))
    const run = clamp(age.div(RUN), 0, 1)
    // the smear reaches as far as the point has run
    const reach = d0.xyz.mul(run.mul(float(2).sub(run)))
    const axis = normalize(vec3(d0.x, d0.y, d0.z))
    const mid = p0.xyz.add(reach.mul(0.5))
    const side = normalize(cross(axis, mid.sub(cameraPosition)).add(vec3(1e-5, 0, 0)))
    const q = positionLocal
    const width = d0.w
    m.positionNode = select(alive, p0.xyz.add(reach.mul(q.y)).add(side.mul(q.x.mul(width))), vec3(0, -1000, 0))
    const fade = pow(clamp(float(1).sub(age.div(LIFE)), 0, 1), 1.6)
    const along = uv().y
    const across = uv().x.sub(0.5).mul(2)
    // a spindle: thickest toward the point, thinning to the root as it fades
    const thick = mix(float(0.15), float(1), pow(along, mix(float(0.6), float(2.2), float(1).sub(fade))))
    const shape = clamp(float(1).sub(across.mul(across).div(thick.mul(thick).add(1e-3))), 0, 1)
    const tip = smoothstep(1, 0.93, along)
    const core = pow(shape, 3)
    const hot = mix(vec3(1.0, 0.62, 0.26), vec3(1.0, 0.9, 0.72), core.mul(along))
    m.colorNode = hot.mul(shape.mul(tip).mul(fade).mul(mix(float(3), float(22), core.mul(along))))
    this.mesh = new Mesh(geometry, m)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 3
  }

  /** A thrust from `from` along `dir` (unit) for `length` m, `width` m across. */
  emit(from: Vector3, dir: Vector3, length: number, width: number): void {
    const i = this.cursor
    this.cursor = (this.cursor + 1) % MAX
    const a0 = this.a0.array as Float32Array
    const a1 = this.a1.array as Float32Array
    a0[i * 4] = from.x
    a0[i * 4 + 1] = from.y
    a0[i * 4 + 2] = from.z
    a0[i * 4 + 3] = this.clock
    a1[i * 4] = dir.x * length
    a1[i * 4 + 1] = dir.y * length
    a1[i * 4 + 2] = dir.z * length
    a1[i * 4 + 3] = width
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
