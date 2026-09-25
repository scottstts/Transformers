import { AdditiveBlending, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, PlaneGeometry, Vector3 } from 'three/webgpu'
import { Fn, cameraPosition, clamp, cross, exp, float, instancedBufferAttribute, max, mix, normalize, positionLocal, select, smoothstep, uniform, uv, vec3 } from 'three/tsl'

/** Pool size: bursts overwrite the oldest sparks. */
const MAX = 768
/** Streak length per m/s of speed (s): the exposure a spark smears over. */
const EXPOSURE = 0.022
const GRAVITY = 9.8

/** A burst: where, which way and how hard. */
export interface SparkBurst {
  count: number
  at: Vector3
  /** main direction (unit); `spread` 0 a jet along it, 1 a full sphere */
  dir: Vector3
  spread: number
  speed: [number, number]
  life: [number, number]
  /** streak width (m) */
  size: number
  /** velocity decay rate (1/s): high for light embers */
  drag: number
  /** share of gravity: 1 falls, negative rises (embers in hot air) */
  gravity: number
  /** 0 hot metal (white-yellow cooling to red), 1 plasma (blue-white cooling to violet) */
  palette: number
  /** a random offset around `at` (m) */
  jitter?: number
}

/**
 * Sparks and embers: one instanced draw of camera-facing streaks. Each spark
 * is stored once, at birth (position, velocity, birth time, life, size, drag,
 * gravity, palette), and its flight is evaluated in the vertex stage: linear
 * drag with gravity, integrated exactly, stopped on the sand. A streak is
 * stretched along its velocity by the exposure time and cools with age
 * (blackbody for metal, blue-to-violet for plasma), drawn additively in HDR so
 * bloom carries the glow. Bursts write only the slots they use.
 */
export class Sparks {
  readonly mesh: Mesh
  private readonly time = uniform(0)
  private clock = 0
  private cursor = 0
  private readonly a0: InstancedBufferAttribute
  private readonly a1: InstancedBufferAttribute
  private readonly a2: InstancedBufferAttribute
  private liveUntil = -1

  constructor() {
    const quad = new PlaneGeometry(1, 1)
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
    this.a2 = make()
    // unborn sparks: born in the far future, so they are culled
    for (let i = 0; i < MAX; i++) this.a0.array[i * 4 + 3] = 1e9
    const p0 = instancedBufferAttribute(this.a0, 'vec4') as any
    const v0 = instancedBufferAttribute(this.a1, 'vec4') as any
    const k = instancedBufferAttribute(this.a2, 'vec4') as any

    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false })
    const age = this.time.sub(p0.w)
    const life = v0.w
    const alive = age.greaterThanEqual(0).and(age.lessThan(life))
    const t = max(age, 0)
    const drag = max(k.y, 0.01)
    const decay = exp(drag.mul(t).negate())
    const g = vec3(0, k.z.mul(-GRAVITY), 0)
    const reach = float(1).sub(decay).div(drag)
    const vel = v0.xyz.mul(decay).add(g.div(drag).mul(float(1).sub(decay)))
    const pos = p0.xyz.add(v0.xyz.mul(reach)).add(g.div(drag).mul(t.sub(reach)))
    const ground = max(pos.y, 0.015)
    const center = vec3(pos.x, ground, pos.z)
    const onGround = pos.y.lessThan(0.015)
    const moving = select(onGround, vec3(vel.x, 0, vel.z).mul(0.25), vel)
    const speed = moving.length()
    const axis = normalize(moving.add(vec3(0, 1e-4, 0)))
    const side = normalize(cross(axis, center.sub(cameraPosition)).add(vec3(1e-5, 0, 0)))
    const size = k.x
    const length = speed.mul(EXPOSURE).add(size)
    const q = positionLocal
    m.positionNode = select(alive, center.add(axis.mul(q.y.mul(length))).add(side.mul(q.x.mul(size))), vec3(0, -1000, 0))

    const cool = clamp(age.div(life), 0, 1)
    m.colorNode = Fn(() => {
      const across = uv().x.sub(0.5).mul(2)
      const along = uv().y
      const shape = float(1).sub(across.mul(across)).mul(smoothstep(0, 0.35, along)).mul(smoothstep(1, 0.8, along))
      // temperature: 1 at birth, falls with age
      const T = float(1).sub(cool).pow(1.6)
      const metal = mix(vec3(0.9, 0.12, 0.02), vec3(1, 0.78, 0.45), T).mul(mix(float(1.5), float(60), T.mul(T)))
      const plasma = mix(vec3(0.35, 0.12, 0.9), vec3(0.75, 0.88, 1), T).mul(mix(float(2), float(55), T.mul(T)))
      return mix(metal, plasma, k.w).mul(shape)
    })()
    this.mesh = new Mesh(geometry, m)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 3
    this.mesh.visible = false
  }

  update(dt: number): void {
    this.clock += dt
    this.time.value = this.clock
    this.mesh.visible = this.clock < this.liveUntil
  }

  emit(b: SparkBurst): void {
    const a0 = this.a0.array as Float32Array
    const a1 = this.a1.array as Float32Array
    const a2 = this.a2.array as Float32Array
    const start = this.cursor
    for (let n = 0; n < b.count; n++) {
      const i = this.cursor
      this.cursor = (this.cursor + 1) % MAX
      // a direction within the cone: blend the main direction with a random one
      _r.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize()
      _d.copy(b.dir).multiplyScalar(1 - b.spread).addScaledVector(_r, b.spread).normalize()
      const speed = b.speed[0] + (b.speed[1] - b.speed[0]) * Math.random() ** 1.5
      const life = b.life[0] + (b.life[1] - b.life[0]) * Math.random()
      const j = b.jitter ?? 0
      a0[i * 4] = b.at.x + (Math.random() - 0.5) * j
      a0[i * 4 + 1] = b.at.y + (Math.random() - 0.5) * j
      a0[i * 4 + 2] = b.at.z + (Math.random() - 0.5) * j
      a0[i * 4 + 3] = this.clock
      a1[i * 4] = _d.x * speed
      a1[i * 4 + 1] = _d.y * speed
      a1[i * 4 + 2] = _d.z * speed
      a1[i * 4 + 3] = life
      a2[i * 4] = b.size * (0.6 + 0.8 * Math.random())
      a2[i * 4 + 1] = b.drag
      a2[i * 4 + 2] = b.gravity
      a2[i * 4 + 3] = b.palette
      this.liveUntil = Math.max(this.liveUntil, this.clock + life)
    }
    const count = Math.min(b.count, MAX)
    for (const a of [this.a0, this.a1, this.a2]) {
      if (start + count <= MAX) a.addUpdateRange(start * 4, count * 4)
      else {
        a.addUpdateRange(start * 4, (MAX - start) * 4)
        a.addUpdateRange(0, (start + count - MAX) * 4)
      }
      a.needsUpdate = true
    }
    this.mesh.visible = true
  }
}

const _r = new Vector3()
const _d = new Vector3()
