import { CustomBlending, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, OneFactor, OneMinusSrcAlphaFactor, PlaneGeometry, Vector3 } from 'three/webgpu'
import { cameraPosition, clamp, cos, cross, exp, float, instancedBufferAttribute, max, min, mix, normalize, positionLocal, pow, select, sin, smoothstep, uniform, uv, vec2, vec3 } from 'three/tsl'
import { N } from '../../../../rendering/noise.ts'
import type { Ground } from '../../../../game/ground'

/** Pool size: emission overwrites the oldest. */
const MAX = 640
/** Where a mote stops (m from the centre): it is gone into the column by then. */
const R_END = 0.9
/** Streaks among the motes (share): thin elongated wisps that show the air's motion. */
const STREAK_SHARE = 0.4

/**
 * A vacuum made visible: sand and grit drawn in along a spiral, whipping
 * faster as it closes on the centre (its angular momentum is kept: the
 * angular rate goes as 1 / r^2) and lifted into a column there.
 *
 * Each mote is stored once at birth (centre, radius, angle, time, life and its
 * swirl), and its whole path is evaluated in the vertex stage in closed form:
 * r(t) = r0 e^(-t / tau), theta(t) = theta0 + G tau (e^(2t / tau) - 1) / (2 r0^2),
 * its height rising as r shrinks. A mote is a soft, sunlit puff of sand; a
 * share of them are streaks stretched along their own velocity, the wind's
 * grain. Premultiplied (one-minus-source-alpha), so it occludes like dust
 * without sorting; one baked-noise fetch per fragment and no scene fog, as
 * large overlapping sprites must stay cheap.
 */
export class Vortex {
  readonly mesh: Mesh
  /** the ground the motes are drawn over */
  ground: Ground | null = null
  private readonly time = uniform(0)
  private clock = 0
  private cursor = 0
  private liveUntil = -1
  private readonly a0: InstancedBufferAttribute
  private readonly a1: InstancedBufferAttribute
  private readonly a2: InstancedBufferAttribute
  private readonly attributes: InstancedBufferAttribute[]
  /** emission owed from past frames (a fraction of a mote) */
  private owed = 0

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
    this.attributes = [this.a0, this.a1, this.a2]
    for (let i = 0; i < MAX; i++) this.a1.array[i * 4 + 2] = 1e9
    // a0: centre x, y (ground), z, r0; a1: theta0, swirl G (signed), birth, life; a2: tau, lift, size, streak
    const c = instancedBufferAttribute(this.a0, 'vec4') as any
    const b = instancedBufferAttribute(this.a1, 'vec4') as any
    const k = instancedBufferAttribute(this.a2, 'vec4') as any

    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false })
    m.blending = CustomBlending
    m.blendSrc = OneFactor
    m.blendDst = OneMinusSrcAlphaFactor
    m.blendSrcAlpha = OneFactor
    m.blendDstAlpha = OneMinusSrcAlphaFactor

    const age = this.time.sub(b.z)
    const life = b.w
    const alive = age.greaterThanEqual(0).and(age.lessThan(life))
    const t = clamp(age, 0, life)
    const tau = k.x
    const r0 = c.w
    const r = r0.mul(exp(t.div(tau).negate()))
    const theta = b.x.add(b.y.mul(tau).mul(exp(t.mul(2).div(tau)).sub(1)).div(r0.mul(r0).mul(2)))
    const inward = float(1).sub(r.div(r0))
    const y = c.y.add(0.15).add(k.y.mul(pow(inward, 1.6)))
    const pos = vec3(c.x.add(r.mul(cos(theta))), y, c.z.add(r.mul(sin(theta))))
    // velocity: radial -r / tau, tangential G / r, rising with the lift's rate
    const radial = vec3(cos(theta), 0, sin(theta))
    const tangent = vec3(sin(theta).negate(), 0, cos(theta))
    const vel = radial.mul(r.div(tau).negate()).add(tangent.mul(b.y.div(max(r, 0.3))))
      .add(vec3(0, k.y.mul(1.6).mul(pow(max(inward, 1e-3), 0.6)).mul(r.div(r0.mul(tau))), 0))
    const speed = vel.length()
    const axis = normalize(vel.add(vec3(0, 1e-4, 0)))
    const side = normalize(cross(axis, pos.sub(cameraPosition)).add(vec3(1e-5, 0, 0)))
    const streak = k.w
    const grow = mix(float(0.7), float(1.6), inward)
    const size = k.z.mul(grow)
    // a puff is round; a streak is stretched along its velocity by an exposure's worth of travel
    const along = mix(size, speed.mul(0.09).add(size.mul(0.6)), streak)
    const across = mix(size, size.mul(0.18), streak)
    const q = positionLocal
    // a round puff faces the camera: its quad spans `side` and the view's up across the velocity
    const up = normalize(cross(side, pos.sub(cameraPosition)))
    const dirA = mix(up, axis, streak)
    m.positionNode = select(alive, pos.add(dirA.mul(q.y.mul(along))).add(side.mul(q.x.mul(across))), vec3(0, -1000, 0))

    const u = t.div(life)
    const p = uv().sub(0.5).mul(2)
    const n = N(uv().mul(0.6).add(vec2(b.x.mul(3.1), b.y.mul(0.7)))).r
    const soft = float(1).sub(smoothstep(0.25, 1, p.length().add(n.sub(0.5).mul(0.6))))
    const shape = mix(soft, float(1).sub(p.x.mul(p.x)).mul(smoothstep(1, 0.2, p.y.abs())), streak)
    const fade = smoothstep(0, 0.18, u).mul(smoothstep(1, 0.7, u))
    const alpha = clamp(shape.mul(fade).mul(mix(float(0.34), float(0.5), streak)), 0, 1)
    // sunlit sand: brighter on top, the column darker and denser toward the centre
    const sand = mix(vec3(0.56, 0.46, 0.34), vec3(0.38, 0.3, 0.22), inward.mul(0.6))
    const lit = sand.mul(mix(float(0.55), float(1.1), uv().y)).mul(min(float(1), n.add(0.6)))
    m.colorNode = lit.mul(alpha)
    m.opacityNode = alpha
    this.mesh = new Mesh(geometry, m)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 2.4
  }

  /**
   * Draw motes in toward `center` (world, on the ground) this frame: from out
   * to `radius`, at `rate` motes a second, swirling `turn` (+1 counter-
   * clockwise seen from above, -1 clockwise) at `swirl` m/s where they start,
   * drawn inward at about `draw` m/s, lifted `lift` m at the centre.
   */
  emit(center: Vector3, radius: number, rate: number, dt: number, turn: number, swirl = 5, draw = 4, lift = 4): void {
    this.owed += rate * dt
    const n = Math.min(24, Math.floor(this.owed))
    if (n <= 0) return
    this.owed -= n
    const a0 = this.a0.array as Float32Array
    const a1 = this.a1.array as Float32Array
    const a2 = this.a2.array as Float32Array
    const start = this.cursor
    const ground = this.ground ? this.ground.height(center.x, center.z) : center.y
    for (let j = 0; j < n; j++) {
      const i = this.cursor
      this.cursor = (this.cursor + 1) % MAX
      const r0 = radius * (0.35 + 0.65 * Math.sqrt(Math.random()))
      const tau = r0 / (draw * (0.75 + 0.5 * Math.random()))
      const life = Math.max(0.3, tau * Math.log(r0 / R_END))
      a0[i * 4] = center.x
      a0[i * 4 + 1] = ground
      a0[i * 4 + 2] = center.z
      a0[i * 4 + 3] = r0
      a1[i * 4] = Math.random() * Math.PI * 2
      // three.js yaw runs from +z toward +x; seen from above (+y), counter-clockwise is theta decreasing here
      a1[i * 4 + 1] = -turn * swirl * r0 * (0.7 + 0.6 * Math.random())
      a1[i * 4 + 2] = this.clock
      a1[i * 4 + 3] = life
      a2[i * 4] = tau
      a2[i * 4 + 1] = lift * (0.6 + 0.8 * Math.random())
      a2[i * 4 + 2] = 0.5 + Math.random() * 0.9
      a2[i * 4 + 3] = Math.random() < STREAK_SHARE ? 1 : 0
      this.liveUntil = Math.max(this.liveUntil, this.clock + life)
    }
    for (const a of this.attributes) {
      if (start + n <= MAX) a.addUpdateRange(start * 4, n * 4)
      else {
        a.addUpdateRange(start * 4, (MAX - start) * 4)
        a.addUpdateRange(0, (start + n - MAX) * 4)
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

  reset(): void {
    this.owed = 0
  }
}
