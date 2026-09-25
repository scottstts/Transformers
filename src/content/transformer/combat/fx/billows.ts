import { CustomBlending, DynamicDrawUsage, InstancedBufferAttribute, OneFactor, OneMinusSrcAlphaFactor, Sprite, SpriteNodeMaterial, Vector3 } from 'three/webgpu'
import { clamp, exp, float, instancedBufferAttribute, max, mix, pow, select, smoothstep, uniform, uv, vec2, vec3 } from 'three/tsl'
import { N } from '../../../../rendering/noise.ts'
import { blackbody } from '../../../../rendering/blackbody.ts'

/** Pool size: bursts overwrite the oldest billows. */
const MAX = 1024
/** Share of its life over which a billow's gas cools from its birth temperature. */
const COOL_SHARE = 0.22
/** HDR level of a fully dense billow's glow at unit blackbody level. */
const GLOW = 2.2

/** A burst of fire, smoke or thrown dust. */
export interface BillowBurst {
  count: number
  at: Vector3
  /** random offset around `at` (m) */
  jitter?: number
  /** main direction (unit); `spread` 0 a jet along it, 1 every way */
  dir: Vector3
  spread: number
  speed: [number, number]
  life: [number, number]
  /** diameter at birth and at the end of its life (m) */
  size: [number, number]
  /** gas temperature at birth (K): 0 or ambient for cold smoke or dust, 1800-3000 for fire */
  heat: number
  /** velocity decay (1/s) */
  drag: number
  /** upward acceleration of hot gas (m/s^2) */
  buoyancy: number
  /** 0 soot, 1 sand dust */
  tone: number
  /** 0..1 how opaque its smoke is */
  opacity: number
}

/**
 * Fire, smoke and blast dust: one instanced draw of soft, churning billboards.
 * Each billow is stored once at birth; its flight (linear drag with buoyancy,
 * integrated exactly), growth and cooling are evaluated on the GPU from its
 * age, so a burst uploads only the slots it writes.
 *
 * A billow is gas at a temperature that falls with age. While hot it glows
 * (blackbody colour, brightest in its dense heart) and hides little of what
 * is behind it; as it cools it becomes smoke or dust, opaque in proportion
 * to its density, lit from above and warmed from inside by the fire still
 * in it. The output is premultiplied (one-minus-source-alpha blending), so
 * its glow adds and its smoke occludes in the same pass, without sorting.
 */
export class Billows {
  readonly mesh: Sprite
  private readonly time = uniform(0)
  private clock = 0
  private cursor = 0
  private liveUntil = -1
  private readonly a: InstancedBufferAttribute[]

  constructor() {
    this.a = [0, 1, 2, 3].map(() => {
      const a = new InstancedBufferAttribute(new Float32Array(MAX * 4), 4)
      a.setUsage(DynamicDrawUsage)
      return a
    })
    for (let i = 0; i < MAX; i++) this.a[0].array[i * 4 + 3] = 1e9
    const [p0, v0, k, s] = this.a.map((a) => instancedBufferAttribute(a, 'vec4') as any)

    const m = new SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: false })
    m.blending = CustomBlending
    m.blendSrc = OneFactor
    m.blendDst = OneMinusSrcAlphaFactor
    m.blendSrcAlpha = OneFactor
    m.blendDstAlpha = OneMinusSrcAlphaFactor

    const age = this.time.sub(p0.w)
    const life = v0.w
    const alive = age.greaterThanEqual(0).and(age.lessThan(life))
    const t = max(age, 0)
    const u = clamp(t.div(life), 0, 1)
    const drag = max(k.w, 0.01)
    const reach = float(1).sub(exp(drag.mul(t).negate())).div(drag)
    const lift = vec3(0, s.x, 0).div(drag).mul(t.sub(reach))
    const size = k.x.add(k.y.sub(k.x).mul(float(1).sub(pow(float(1).sub(u), 2.2))))
    const pos = p0.xyz.add(v0.xyz.mul(reach)).add(lift)
    m.positionNode = select(alive, vec3(pos.x, max(pos.y, size.mul(0.3)), pos.z), vec3(0, -1000, 0))
    m.scaleNode = size
    m.rotationNode = s.y.mul(6.283).add(t.mul(s.y.sub(0.5).mul(0.6)))

    // churning density: two noise scales scrolling against each other
    const q = uv().sub(0.5).mul(2)
    const r = q.length()
    const seed = vec2(s.y.mul(13.7), s.y.mul(29.3))
    const n1 = N(uv().mul(0.55).add(seed).add(vec2(0, t.mul(-0.06)))).r
    const n2 = N(uv().mul(1.4).add(seed.yx).add(vec2(t.mul(0.05), 0))).g
    const billow = n1.mul(0.65).add(n2.mul(0.35))
    const shape = float(1).sub(smoothstep(0.2, 1, r.add(billow.sub(0.5).mul(0.75))))
    const density = clamp(shape.mul(billow.mul(1.3).add(0.15)), 0, 1)

    // the gas cools with age; the dense heart stays hottest
    const T0 = k.z
    const T = T0.sub(300).max(0).mul(exp(t.div(life.mul(COOL_SHARE)).negate())).mul(density.pow(1.5).mul(0.55).add(0.45)).add(300)
    const fade = smoothstep(0, 0.04, u).mul(pow(float(1).sub(u), 1.3))
    const glow = blackbody(T).mul(density).mul(fade).mul(GLOW)
    const smoke = float(1).sub(smoothstep(1100, 1900, T).mul(0.85))
    const alpha = density.mul(s.w).mul(fade).mul(smoke)
    const albedo = mix(vec3(0.05, 0.047, 0.044), vec3(0.6, 0.5, 0.38), s.z)
    const sky = mix(float(0.42), float(1.1), smoothstep(0, 1, uv().y.add(billow.sub(0.5).mul(0.5))))
    const lit = albedo.mul(sky).add(albedo.mul(blackbody(T)).mul(0.8))
    m.colorNode = lit.mul(alpha).add(glow)
    m.opacityNode = alpha

    this.mesh = new Sprite(m)
    this.mesh.count = MAX
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 2.5
    this.mesh.visible = false
  }

  emit(b: BillowBurst): void {
    const [A0, A1, A2, A3] = this.a.map((a) => a.array as Float32Array)
    const start = this.cursor
    for (let n = 0; n < b.count; n++) {
      const i = this.cursor
      this.cursor = (this.cursor + 1) % MAX
      _r.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize()
      _d.copy(b.dir).multiplyScalar(1 - b.spread).addScaledVector(_r, b.spread).normalize()
      const speed = b.speed[0] + (b.speed[1] - b.speed[0]) * Math.random()
      const life = b.life[0] + (b.life[1] - b.life[0]) * Math.random()
      const grow = 0.75 + 0.5 * Math.random()
      const j = b.jitter ?? 0
      A0.set([b.at.x + (Math.random() - 0.5) * j, b.at.y + (Math.random() - 0.5) * j, b.at.z + (Math.random() - 0.5) * j, this.clock], i * 4)
      A1.set([_d.x * speed, _d.y * speed, _d.z * speed, life], i * 4)
      A2.set([b.size[0] * grow, b.size[1] * grow, b.heat * (0.85 + 0.3 * Math.random()), b.drag], i * 4)
      A3.set([b.buoyancy, Math.random(), b.tone, b.opacity], i * 4)
      this.liveUntil = Math.max(this.liveUntil, this.clock + life)
    }
    const count = Math.min(b.count, MAX)
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

  warm(on: boolean): void {
    this.mesh.visible = on || this.clock < this.liveUntil
  }
}

const _r = new Vector3()
const _d = new Vector3()
