import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, Mesh, MeshBasicNodeMaterial, Vector3 } from 'three/webgpu'
import { attribute, exp, float, max, pow, select, smoothstep, uniform, vec2, vec3 } from 'three/tsl'
import { N } from '../../../../rendering/noise.ts'
import { blackbody } from '../../../../rendering/blackbody.ts'

/** Arcs kept, and samples per arc. */
const ARCS = 6
const SAMPLES = 40
/** A new sample once the tip has moved this far (m). */
const SPACING = 0.22
/** Heat of a fresh arc and what it cools to while it hangs (K), and how fast (s). */
const HOT = 2150
const EMBER = 1120
const COOL = 0.45
/** An ignited arc flares to this (K) and burns out over this long (s). */
const FLARE = 2500
const BURN = 0.55
/** An arc never lit fades out after hanging this long (s). */
const HANG = 6
/** HDR level at unit blackbody level. */
const GLOW = 0.7
const NEVER = 1e9

/**
 * The cuts a blade too fast to see leaves hanging in the air: the air along
 * the edge's path superheated, glowing white and cooling to a dull red line
 * that hangs where the cut was, until it is ignited and flares out. One
 * additive ribbon mesh holds every arc; each arc is recorded from the
 * cutting edge's two ends (tip bright, base fading), a sample every few
 * centimetres, and written only while it is being cut or lit.
 */
export class SlashArcs {
  readonly mesh: Mesh
  private readonly time = uniform(0)
  private clock = 0
  private readonly position: BufferAttribute
  /** per vertex: birth (s), across (0 base .. 1 tip), along (0..1), ignition time (s) */
  private readonly data: BufferAttribute
  private arc = -1
  private count = 0
  /** per arc: samples cut, when it was cut, and when it was lit (s) */
  private readonly counts = new Int32Array(ARCS)
  private readonly born = new Float64Array(ARCS).fill(-NEVER)
  private readonly lit = new Float64Array(ARCS).fill(NEVER)
  private readonly last = new Vector3()
  private cutting = false
  private written = 0
  private liveUntil = -1

  constructor() {
    const geometry = new BufferGeometry()
    this.position = new BufferAttribute(new Float32Array(ARCS * SAMPLES * 2 * 3), 3)
    this.data = new BufferAttribute(new Float32Array(ARCS * SAMPLES * 2 * 4), 4)
    this.position.setUsage(DynamicDrawUsage)
    this.data.setUsage(DynamicDrawUsage)
    const d = this.data.array as Float32Array
    for (let i = 0; i < ARCS * SAMPLES * 2; i++) { d[i * 4] = NEVER; d[i * 4 + 3] = NEVER }
    geometry.setAttribute('position', this.position)
    geometry.setAttribute('arc', this.data)
    const index: number[] = []
    for (let a = 0; a < ARCS; a++) {
      for (let s = 0; s < SAMPLES - 1; s++) {
        const i = (a * SAMPLES + s) * 2
        index.push(i, i + 2, i + 1, i + 1, i + 2, i + 3)
      }
    }
    geometry.setIndex(index)

    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false })
    const a = attribute('arc', 'vec4')
    const age = this.time.sub(a.x)
    const across = a.y, along = a.z
    const lit = this.time.sub(a.w)
    const seed = a.x.mul(0.37)
    const litNow = lit.greaterThanEqual(0)
    // the gas cools from white to a hanging red; an ignited arc flares as its front passes
    const hanging = float(HOT - EMBER).mul(exp(age.div(COOL).negate())).add(EMBER)
    const flare = select(litNow, float(FLARE).mul(exp(lit.div(BURN).negate())), float(0))
    const T = max(hanging, flare)
    // Not a sheet but a trajectory: a thin incandescent core along the tip's path, with
    // filaments of burning gas streaming behind it, stretched along the cut and flickering
    const flicker = N(vec2(along.mul(5).add(seed), this.time.mul(2.3))).r.mul(0.7).add(0.55)
    const tip = float(1).sub(across)
    const core = exp(tip.div(0.045).pow(2).negate())
    const fibre = N(vec2(across.mul(11).add(seed), along.mul(1.6).sub(this.time.mul(0.12)))).r
    const filaments = pow(fibre, 3.5).mul(pow(across, 1.6)).mul(2.2)
    // it burns away from the inside edge within a second, leaving ragged glowing tatters;
    // lit, a front runs along it and burns the rest
    const tatter = N(vec2(along.mul(6).add(seed.mul(3)), across.mul(2.5))).g
    const eaten = age.mul(0.9).min(0.55).sub(across.mul(0.4)).add(select(litNow, lit.div(BURN).mul(1.3), float(0)))
    const left = smoothstep(eaten, eaten.add(0.07), tatter)
    const edge = left.mul(float(1).sub(smoothstep(0, 0.1, tatter.sub(eaten))))
    const ends = smoothstep(0, 0.1, along).mul(smoothstep(1, 0.9, along)).mul(smoothstep(HANG, HANG - 1.5, age))
    const glow = blackbody(T).mul(core.mul(1.6).add(filaments)).mul(left)
      .add(blackbody(T.add(250)).mul(edge).mul(0.8))
      .mul(flicker).mul(ends).mul(GLOW)
    m.colorNode = select(age.greaterThanEqual(0), glow, vec3(0))
    this.mesh = new Mesh(geometry, m)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 3
    this.mesh.visible = false
  }

  /** Start a new arc (the oldest is overwritten). */
  begin(): void {
    this.arc = (this.arc + 1) % ARCS
    this.count = 0
    this.cutting = true
    this.counts[this.arc] = 0
    this.born[this.arc] = this.clock
    this.lit[this.arc] = NEVER
    const d = this.data.array as Float32Array
    const start = this.arc * SAMPLES * 2
    for (let i = 0; i < SAMPLES * 2; i++) { d[(start + i) * 4] = NEVER; d[(start + i) * 4 + 3] = NEVER }
    this.flush(start, SAMPLES * 2)
  }

  /** The cutting edge's ends this frame (world), while an arc is being cut. */
  add(base: Vector3, tip: Vector3): void {
    if (!this.cutting || this.count >= SAMPLES) return
    if (this.count > 0 && tip.distanceTo(this.last) < SPACING) return
    this.last.copy(tip)
    const i = (this.arc * SAMPLES + this.count) * 2
    const p = this.position.array as Float32Array
    const d = this.data.array as Float32Array
    base.toArray(p, i * 3)
    tip.toArray(p, i * 3 + 3)
    d.set([this.clock, 0, 0, NEVER, this.clock, 1, 0, NEVER], i * 4)
    this.count++
    this.counts[this.arc] = this.count
    // stretch the arc's length coordinate over what has been cut so far
    const first = this.arc * SAMPLES * 2
    for (let k = 0; k < this.count; k++) {
      const along = this.count > 1 ? k / (this.count - 1) : 0
      d[(first + k * 2) * 4 + 2] = along
      d[(first + k * 2 + 1) * 4 + 2] = along
    }
    // later samples copy the last one, so the ribbon ends where the cut does
    for (let k = this.count; k < SAMPLES; k++) {
      p.copyWithin((first + k * 2) * 3, i * 3, i * 3 + 6)
    }
    this.position.addUpdateRange(first * 3, SAMPLES * 2 * 3)
    this.position.needsUpdate = true
    this.flush(first, this.count * 2)
    this.liveUntil = Math.max(this.liveUntil, this.clock + HANG)
    this.written++
    this.mesh.visible = true
  }

  end(): void {
    this.cutting = false
  }

  /**
   * Light every hanging arc: each flares from its start to its end over
   * `sweep` s, the first after `delay` s and the rest following `stagger` s apart.
   */
  ignite(delay: number, stagger: number, sweep: number): void {
    const d = this.data.array as Float32Array
    for (let a = 0; a < ARCS; a++) {
      const k = (a - this.arc - 1 + ARCS * 2) % ARCS
      const t0 = this.clock + delay + k * stagger
      if (this.counts[a] > 0) this.lit[a] = t0
      for (let s = 0; s < SAMPLES; s++) {
        for (let e = 0; e < 2; e++) {
          const i = (a * SAMPLES + s) * 2 + e
          if (d[i * 4] >= NEVER) continue
          d[i * 4 + 3] = t0 + d[i * 4 + 2] * sweep
        }
      }
    }
    this.flush(0, ARCS * SAMPLES * 2)
    this.liveUntil = Math.min(this.liveUntil, this.clock + delay + ARCS * stagger + sweep + BURN * 1.5)
  }

  /** The arcs' points as they hang (world): `visit(point, arc order)` along each lit arc, for fire along them. */
  forEachPoint(step: number, visit: (point: Vector3, arc: number, along: number) => void): void {
    const p = this.position.array as Float32Array
    const d = this.data.array as Float32Array
    for (let a = 0; a < ARCS; a++) {
      const k = (a - this.arc - 1 + ARCS * 2) % ARCS
      for (let s = 0; s < SAMPLES; s += step) {
        const i = (a * SAMPLES + s) * 2 + 1
        if (d[i * 4] >= NEVER) continue
        _p.fromArray(p, i * 3)
        visit(_p, k, d[i * 4 + 2])
      }
    }
  }

  /**
   * A random point along a hanging arc's hot core (world), weighted to fresher
   * arcs; false when none is hanging. `heat` gets 0..1 how hot it still is.
   */
  randomPoint(out: Vector3, heat: { value: number }): boolean {
    const a = Math.floor(Math.random() * ARCS)
    const n = this.counts[a]
    const age = this.clock - this.born[a]
    if (n < 2 || age > HANG - 1 || this.clock > this.lit[a] + BURN * 0.8) return false
    const s = Math.floor(Math.random() * n)
    out.fromArray(this.position.array as Float32Array, ((a * SAMPLES + s) * 2 + 1) * 3)
    heat.value = Math.max(0.25, Math.exp(-age / 1.2))
    return true
  }

  update(dt: number): void {
    this.clock += dt
    this.time.value = this.clock
    this.mesh.visible = this.written > 0 && this.clock < this.liveUntil
  }

  /** Forget every arc (a new special). */
  reset(): void {
    const d = this.data.array as Float32Array
    for (let i = 0; i < ARCS * SAMPLES * 2; i++) { d[i * 4] = NEVER; d[i * 4 + 3] = NEVER }
    this.flush(0, ARCS * SAMPLES * 2)
    this.written = 0
    this.counts.fill(0)
    this.born.fill(-NEVER)
    this.lit.fill(NEVER)
    this.cutting = false
    this.liveUntil = -1
    this.mesh.visible = false
  }

  warm(on: boolean): void {
    this.mesh.visible = on || (this.written > 0 && this.clock < this.liveUntil)
  }

  private flush(first: number, count: number): void {
    this.data.addUpdateRange(first * 4, count * 4)
    this.data.needsUpdate = true
  }
}

const _p = new Vector3()
