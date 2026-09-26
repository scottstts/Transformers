import { CylinderGeometry, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshStandardNodeMaterial, type Vector3 } from 'three/webgpu'
import { cameraViewMatrix, color, cos, cross, float, instancedBufferAttribute, max, min, mix, normalLocal, positionLocal, select, sin, smoothstep, sqrt, uniform, vec3 } from 'three/tsl'
import { N } from '../../../../rendering/noise.ts'

/** Pool size: new casings overwrite the oldest. */
const MAX = 220
const GRAVITY = 9.81
/** A casing's size (m): the gun's rounds are cannon calibre at a seven-metre robot's scale. */
const RADIUS = 0.035
const LENGTH = 0.2
/** Seconds a casing lies on the sand, then how long it takes to settle in. */
const REST = 9
const SINK = 1.5

/**
 * Spent brass thrown out of the gun's ejection port: one instanced draw of
 * real cylinders (a bottlenecked case's proportions), each stored once at
 * birth and evaluated in the vertex stage. It flies ballistically, tumbling
 * end over end, and lies where it lands, on its side, until it settles into
 * the sand. Polished brass, darkened at the mouth where the powder burned.
 */
export class Casings {
  readonly mesh: Mesh
  private readonly time = uniform(0)
  private clock = 0
  private cursor = 0
  private liveUntil = -1
  private readonly a0: InstancedBufferAttribute
  private readonly a1: InstancedBufferAttribute
  private readonly a2: InstancedBufferAttribute

  constructor() {
    const shell = new CylinderGeometry(RADIUS, RADIUS * 1.08, LENGTH, 12, 1)
    const geometry = new InstancedBufferGeometry()
    geometry.index = shell.index
    geometry.setAttribute('position', shell.getAttribute('position'))
    geometry.setAttribute('normal', shell.getAttribute('normal'))
    geometry.instanceCount = MAX
    const make = (): InstancedBufferAttribute => {
      const a = new InstancedBufferAttribute(new Float32Array(MAX * 4), 4)
      a.setUsage(DynamicDrawUsage)
      return a
    }
    this.a0 = make() // position, birth
    this.a1 = make() // velocity, seed
    this.a2 = make() // tumble axis (unit), rate (rad/s)
    for (let i = 0; i < MAX; i++) this.a0.array[i * 4 + 3] = -1e9
    const p0 = instancedBufferAttribute(this.a0, 'vec4') as any
    const v0 = instancedBufferAttribute(this.a1, 'vec4') as any
    const spin = instancedBufferAttribute(this.a2, 'vec4') as any
    const age = this.time.sub(p0.w)
    // it lands when its centre comes down to its radius above the sand
    const b = v0.y
    const land = b.add(sqrt(max(b.mul(b).add(float(2 * GRAVITY).mul(max(p0.y.sub(RADIUS), 0))), 0))).div(GRAVITY)
    const flight = min(age, land)
    const flying = p0.y.add(b.mul(age)).sub(age.mul(age).mul(GRAVITY / 2))
    const settle = smoothstep(REST, REST + SINK, age)
    const height = select(age.lessThan(land), flying, float(RADIUS)).sub(settle.mul(RADIUS * 2.2)) as any
    const centre = vec3(p0.x.add(v0.x.mul(flight)), height, p0.z.add(v0.z.mul(flight)))
    // tumbling end over end about its axis; on the sand it lies on its side (the tumble axis is kept horizontal)
    const angle = spin.w.mul(flight)
    const lying = select(age.lessThan(land), angle, float(Math.PI / 2).add(v0.w.mul(0.3)))
    const c = cos(lying), sn = sin(lying)
    const rotate = (v: any): any => {
      const k = spin.xyz
      return v.mul(c).add(cross(k, v).mul(sn)).add(k.mul(k.dot(v)).mul(float(1).sub(c)))
    }
    const alive = age.greaterThanEqual(0).and(age.lessThan(REST + SINK))
    const m = new MeshStandardNodeMaterial()
    m.positionNode = select(alive, rotate(positionLocal).add(centre), vec3(0, -1000, 0))
    m.normalNode = rotate(normalLocal).transformDirection(cameraViewMatrix)
    const mouth = smoothstep(LENGTH * 0.25, LENGTH * 0.5, positionLocal.y)
    const tarnish = N(positionLocal.xz.mul(40).add(v0.w.mul(9))).g
    m.colorNode = mix(mix(color(0xb88b46), color(0xd2a764), tarnish), color(0x4a3820), mouth.mul(0.7))
    m.metalness = 1
    m.roughnessNode = mix(float(0.28), float(0.55), mouth).add(tarnish.mul(0.08))
    this.mesh = new Mesh(geometry, m)
    this.mesh.frustumCulled = false
    this.mesh.castShadow = false
    this.mesh.receiveShadow = true
    this.mesh.visible = false
  }

  /** One casing thrown from `at` with velocity `v` (m/s). */
  eject(at: Vector3, v: Vector3): void {
    const i = this.cursor
    this.cursor = (i + 1) % MAX
    const A0 = this.a0.array as Float32Array, A1 = this.a1.array as Float32Array, A2 = this.a2.array as Float32Array
    A0.set([at.x, at.y, at.z, this.clock], i * 4)
    A1.set([v.x, v.y, v.z, Math.random()], i * 4)
    // tumble about a horizontal axis across its flight, so it lands on its side
    const hx = -v.z, hz = v.x
    const l = Math.hypot(hx, hz) || 1
    A2.set([hx / l, 0, hz / l, (18 + Math.random() * 16) * (Math.random() < 0.5 ? -1 : 1)], i * 4)
    for (const a of [this.a0, this.a1, this.a2]) {
      a.addUpdateRange(i * 4, 4)
      a.needsUpdate = true
    }
    this.liveUntil = this.clock + REST + SINK
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
