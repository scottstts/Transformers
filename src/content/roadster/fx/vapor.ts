import { CustomBlending, DynamicDrawUsage, InstancedBufferAttribute, OneFactor, OneMinusSrcAlphaFactor, Sprite, SpriteNodeMaterial, Vector3 } from 'three/webgpu'
import { cameraPosition, clamp, exp, float, instancedBufferAttribute, max, mix, pow, select, smoothstep, uniform, uv, varying, vec2, vec3 } from 'three/tsl'
import { N } from '../../../rendering/noise.ts'
import { FLAT_GROUND, type Ground } from '../../../game/ground'

/** Pool size: new puffs overwrite the oldest. */
const MAX = 1536

/** A burst of condensed air. */
export interface VaporBurst {
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
  /** velocity decay (1/s) */
  drag: number
  /** upward acceleration (m/s^2): cold air sinks (negative), mixed and warmed it lifts a little */
  buoyancy: number
  /** 0..1 how dense the puff is at its thickest */
  opacity: number
  /** added to every puff's velocity (m/s, world), e.g. the body it was shed from */
  carry?: Vector3
}

/**
 * Condensed air: the white cloud a blast of compressed air throws when it
 * expands and cools below the dew point (the Roadster's lift jets and back
 * pack, the reference's fog at the ground under the hovering car). It is
 * cold and inert: no glow, no fire, no soot. Each puff is lit like a cloud,
 * bright white where it faces the sky and a cool grey where it shades itself
 * underneath, its edge churning and thinning as it mixes into the air.
 *
 * One instanced draw of soft billboards; each puff is written once at birth
 * and its flight (linear drag with buoyancy, integrated exactly), growth and
 * fading are evaluated on the GPU from its age, so a burst uploads only the
 * slots it writes. Premultiplied (one-minus-source-alpha), no sorting. The
 * fragment work is two fetches of the baked noise texture and no fog: the
 * puffs are large and overlap, and the overdraw budget is the game's
 * (CLAUDE.md, dust-bench). A puff the camera is about to pass through fades
 * out (taken once per vertex): the chase camera drives through the wash the
 * car's thrust leaves behind it.
 */
export class Vapor {
  readonly mesh: Sprite
  private readonly time = uniform(0)
  private clock = 0
  private cursor = 0
  private liveUntil = -1
  private readonly a: InstancedBufferAttribute[]
  /** the attributes' arrays, written at birth */
  private readonly A: Float32Array[]
  /** the ground's height under each puff's birth: it rolls along it, never into it */
  private readonly floor: InstancedBufferAttribute
  /** the ground the puffs roll over */
  ground: Ground = FLAT_GROUND

  constructor() {
    this.a = [0, 1, 2, 3].map(() => {
      const a = new InstancedBufferAttribute(new Float32Array(MAX * 4), 4)
      a.setUsage(DynamicDrawUsage)
      return a
    })
    this.A = this.a.map((a) => a.array as Float32Array)
    for (let i = 0; i < MAX; i++) this.A[0][i * 4 + 3] = 1e9
    const [p0, v0, k, s] = this.a.map((a) => instancedBufferAttribute(a, 'vec4') as any)
    this.floor = new InstancedBufferAttribute(new Float32Array(MAX), 1)
    this.floor.setUsage(DynamicDrawUsage)
    const floor = instancedBufferAttribute(this.floor, 'float') as any

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
    const drag = max(k.z, 0.01)
    const reach = float(1).sub(exp(drag.mul(t).negate())).div(drag)
    const lift = vec3(0, k.w, 0).div(drag).mul(t.sub(reach))
    // a puff swells fast as it leaves the jet, then slowly as it mixes
    const size = k.x.add(k.y.sub(k.x).mul(float(1).sub(pow(float(1).sub(u), 2.6))))
    const pos = p0.xyz.add(v0.xyz.mul(reach)).add(lift)
    const centre = vec3(pos.x, max(pos.y, floor.add(size.mul(0.28))), pos.z)
    m.positionNode = select(alive, centre, vec3(0, -1000, 0))
    // clear of the camera by its own radius and a little more, or fading out
    const near = varying(smoothstep(0.55, 1.3, cameraPosition.distance(centre).div(size.mul(0.5).add(0.3))))
    m.scaleNode = size
    m.rotationNode = s.x.mul(6.283).add(t.mul(s.x.sub(0.5).mul(0.5)))

    // churning density: two noise scales drifting against each other, the edge eaten as it mixes
    const q = uv().sub(0.5).mul(2)
    const r = q.length()
    const seed = vec2(s.x.mul(13.7), s.x.mul(29.3))
    const n1 = N(uv().mul(0.6).add(seed).add(vec2(0, t.mul(-0.05)))).r
    const n2 = N(uv().mul(1.5).add(seed.yx).add(vec2(t.mul(0.04), 0))).g
    const billow = n1.mul(0.6).add(n2.mul(0.4))
    const edge = mix(float(0.22), float(0.05), u)
    const shape = float(1).sub(smoothstep(edge, 1, r.add(billow.sub(0.5).mul(mix(0.55, 0.95, u)))))
    const density = clamp(shape.mul(billow.mul(1.2).add(0.25)), 0, 1)
    const fade = smoothstep(0, 0.06, u).mul(pow(float(1).sub(u), 1.4))
    const alpha = density.mul(s.y).mul(fade).mul(near)
    // lit like a cloud: the sky-facing top white, the self-shaded underside a cool grey
    const sky = smoothstep(0, 1, uv().y.add(billow.sub(0.5).mul(0.6)))
    const lit = mix(vec3(0.5, 0.55, 0.62), vec3(1.05, 1.04, 1.03), sky).mul(mix(float(0.9), float(1.04), density))
    m.colorNode = lit.mul(alpha)
    m.opacityNode = alpha

    this.mesh = new Sprite(m)
    this.mesh.count = MAX
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 2.6
    this.mesh.visible = false
  }

  emit(b: VaporBurst): void {
    const [A0, A1, A2, A3] = this.A
    const F = this.floor.array as Float32Array
    const ground = this.ground.height(b.at.x, b.at.z)
    const start = this.cursor
    const count = Math.min(b.count, MAX)
    for (let n = 0; n < count; n++) {
      const i = this.cursor
      this.cursor = (this.cursor + 1) % MAX
      _r.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize()
      _d.copy(b.dir).multiplyScalar(1 - b.spread).addScaledVector(_r, b.spread).normalize()
      const speed = b.speed[0] + (b.speed[1] - b.speed[0]) * Math.random()
      _d.multiplyScalar(speed)
      if (b.carry) _d.add(b.carry)
      const life = b.life[0] + (b.life[1] - b.life[0]) * Math.random()
      const grow = 0.75 + 0.5 * Math.random()
      const j = b.jitter ?? 0
      const o = i * 4
      A0[o] = b.at.x + (Math.random() - 0.5) * j
      A0[o + 1] = b.at.y + (Math.random() - 0.5) * j
      A0[o + 2] = b.at.z + (Math.random() - 0.5) * j
      A0[o + 3] = this.clock
      A1[o] = _d.x
      A1[o + 1] = _d.y
      A1[o + 2] = _d.z
      A1[o + 3] = life
      A2[o] = b.size[0] * grow
      A2[o + 1] = b.size[1] * grow
      A2[o + 2] = b.drag
      A2[o + 3] = b.buoyancy
      A3[o] = Math.random()
      A3[o + 1] = b.opacity * (0.8 + 0.4 * Math.random())
      F[i] = ground
      this.liveUntil = Math.max(this.liveUntil, this.clock + life)
    }
    for (const a of this.a) range(a, start, count)
    range(this.floor, start, count)
    this.mesh.visible = true
  }

  update(dt: number): void {
    this.clock += dt
    this.time.value = this.clock
    this.mesh.visible = this.clock < this.liveUntil
  }

  /** Every puff gone at once (the character leaves the scene). */
  reset(): void {
    this.liveUntil = -1
    this.mesh.visible = false
    for (let i = 0; i < MAX; i++) this.A[0][i * 4 + 3] = 1e9
    range(this.a[0], 0, MAX)
  }

  warm(on: boolean): void {
    this.mesh.visible = on || this.clock < this.liveUntil
  }
}

/** Upload `count` items of `a` from `start`, wrapping round the ring. */
function range(a: InstancedBufferAttribute, start: number, count: number): void {
  const n = a.itemSize
  if (start + count <= MAX) a.addUpdateRange(start * n, count * n)
  else {
    a.addUpdateRange(start * n, (MAX - start) * n)
    a.addUpdateRange(0, (start + count - MAX) * n)
  }
  a.needsUpdate = true
}

const _r = new Vector3()
const _d = new Vector3()
