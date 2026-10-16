import { AdditiveBlending, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, PlaneGeometry, Vector3, type Node } from 'three/webgpu'
import { cameraPosition, clamp, cos, cross, exp, float, instancedBufferAttribute, max, normalize, positionLocal, select, sin, smoothstep, uniform, uv, vec3 } from 'three/tsl'

/** Streaks in the pool: new ones overwrite the oldest. */
const MAX = 768
/** A streak's length per m/s of its speed (s): the air's motion smeared over a frame or two. */
const EXPOSURE = 0.035

/** A stream of air drawn in toward a point. */
export interface InflowBurst {
  count: number
  /** the point it is drawn to (world) */
  center: Vector3
  /** where the streaks start: a ring of this radius about the centre (m), from `below` to `above` it (m) */
  radius: [number, number]
  below: number
  above: number
  /** how fast the distance to the centre shrinks (1/s: e-folds a second) and the swirl's rate at the start (rad/s, + anticlockwise from above) */
  pull: number
  swirl: number
  life: [number, number]
  /** streak width (m) and brightness */
  width: number
  strength: number
}

/**
 * Air (and the dust and vapour in it) drawn in toward a point and wound
 * round it as it comes: thin, faint streaks of cold light that spiral in,
 * faster as they close (the swirl keeps their speed round the point while
 * the distance shrinks), and go out as they reach it. The singularity's
 * field draws them to the fist; the special's ring to its centre.
 *
 * Each streak's whole path is analytic (its distance e-folds, its angle
 * advances at a constant speed round the point, its height eases to the
 * point's), evaluated in the vertex stage from its birth data: one
 * instanced additive draw of camera-facing quads stretched along the
 * motion, a burst uploads only its slots.
 */
export class Inflow {
  readonly mesh: Mesh
  private readonly time = uniform(0)
  private clock = 0
  private cursor = 0
  private liveUntil = -1
  private readonly a: InstancedBufferAttribute[]
  private readonly A: Float32Array[]

  constructor() {
    const quad = new PlaneGeometry(1, 1)
    const geometry = new InstancedBufferGeometry()
    geometry.index = quad.index
    geometry.setAttribute('position', quad.getAttribute('position'))
    geometry.setAttribute('uv', quad.getAttribute('uv'))
    geometry.instanceCount = MAX
    this.a = [0, 1, 2].map(() => {
      const a = new InstancedBufferAttribute(new Float32Array(MAX * 4), 4)
      a.setUsage(DynamicDrawUsage)
      return a
    })
    this.A = this.a.map((a) => a.array as Float32Array)
    for (let i = 0; i < MAX; i++) this.A[0][i * 4 + 3] = 1e9
    // a0: centre, birth; a1: start distance, start angle, start height, life; a2: pull, swirl, width, strength
    const [a0, a1, a2] = this.a.map((a) => instancedBufferAttribute(a, 'vec4') as any)
    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false })
    const age = this.time.sub(a0.w) as Node<'float'>
    const life = a1.w as Node<'float'>
    const alive = age.greaterThanEqual(0).and(age.lessThan(life))
    const t = max(age, 0)
    const k = max(a2.x as Node<'float'>, 0.05)
    const decay = exp(k.mul(t).negate())
    const r = (a1.x as Node<'float'>).mul(decay)
    // the speed round the point is held: the angle runs on faster as the distance closes
    const tangential = (a2.y as Node<'float'>).mul(a1.x as Node<'float'>)
    const theta = (a1.y as Node<'float'>).add(tangential.div(a1.x as Node<'float'>).mul(exp(k.mul(t)).sub(1)).div(k))
    const centre = a0.xyz as Node<'vec3'>
    const y = centre.y.add((a1.z as Node<'float'>).sub(centre.y).mul(decay))
    const radial = vec3(cos(theta), 0, sin(theta))
    const tangent = vec3(sin(theta).negate(), 0, cos(theta))
    const at = vec3(centre.x, y, centre.z).add(radial.mul(r))
    const vel = radial.mul(r.mul(k).negate()).add(tangent.mul(tangential)).add(vec3(0, y.sub(centre.y).mul(k).negate(), 0))
    const speed = vel.length()
    const dir = normalize(vel.add(vec3(0, 1e-4, 0)))
    const side = normalize(cross(at.sub(cameraPosition), dir).add(vec3(1e-5, 0, 0)))
    const width = a2.z as Node<'float'>
    const length = speed.mul(EXPOSURE).add(width)
    const q = positionLocal
    m.positionNode = select(alive, at.add(dir.mul(q.y.mul(length))).add(side.mul(q.x.mul(width))), vec3(0, -1000, 0))
    const across = uv().x.sub(0.5).mul(2)
    const along = uv().y
    const shape = float(1).sub(across.mul(across)).mul(smoothstep(0, 0.4, along)).mul(smoothstep(1, 0.6, along))
    const u = clamp(age.div(life), 0, 1)
    // in as it starts, out as it reaches the point or its life ends
    const fade = smoothstep(0, 0.15, u).mul(smoothstep(1, 0.75, u)).mul(smoothstep(0.3, 1.2, r))
    m.colorNode = vec3(0.78, 0.86, 1).mul(shape.mul(fade).mul(a2.w as Node<'float'>).mul(1.6))
    this.mesh = new Mesh(geometry, m)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 3
    this.mesh.visible = false
  }

  emit(b: InflowBurst): void {
    const [A0, A1, A2] = this.A
    const start = this.cursor
    const count = Math.min(b.count, MAX)
    for (let n = 0; n < count; n++) {
      const i = this.cursor
      this.cursor = (this.cursor + 1) % MAX
      const o = i * 4
      const life = b.life[0] + (b.life[1] - b.life[0]) * Math.random()
      A0[o] = b.center.x; A0[o + 1] = b.center.y; A0[o + 2] = b.center.z; A0[o + 3] = this.clock
      A1[o] = b.radius[0] + (b.radius[1] - b.radius[0]) * Math.random()
      A1[o + 1] = Math.random() * Math.PI * 2
      A1[o + 2] = b.center.y - b.below + (b.below + b.above) * Math.random()
      A1[o + 3] = life
      A2[o] = b.pull * (0.8 + 0.4 * Math.random())
      A2[o + 1] = b.swirl * (0.8 + 0.4 * Math.random())
      A2[o + 2] = b.width * (0.7 + 0.6 * Math.random())
      A2[o + 3] = b.strength * (0.6 + 0.8 * Math.random())
      this.liveUntil = Math.max(this.liveUntil, this.clock + life)
    }
    for (const a of this.a) {
      if (start + count <= MAX) a.addUpdateRange(start * 4, count * 4)
      else {
        a.addUpdateRange(start * 4, (MAX - start) * 4)
        a.addUpdateRange(0, (start + count - MAX) * 4)
      }
      a.needsUpdate = true
    }
    this.mesh.visible = true
  }

  update(dt: number): void {
    this.clock += dt
    this.time.value = this.clock
    this.mesh.visible = this.clock < this.liveUntil
  }

  /** Everything let go: the streaks still in the air are cut short. */
  release(): void {
    this.liveUntil = Math.min(this.liveUntil, this.clock + 0.05)
    for (let i = 0; i < MAX; i++) {
      const o = i * 4
      // shorten every live streak's life to end now
      const age = this.clock - this.A[0][o + 3]
      if (age >= 0 && age < this.A[1][o + 3]) this.A[1][o + 3] = Math.max(age + 0.001, 0.001)
    }
    this.a[1].addUpdateRange(0, MAX * 4)
    this.a[1].needsUpdate = true
  }

  reset(): void {
    this.liveUntil = -1
    this.mesh.visible = false
  }

  warm(on: boolean): void {
    this.mesh.visible = on || this.clock < this.liveUntil
  }
}
