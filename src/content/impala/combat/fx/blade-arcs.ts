import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, Mesh, MeshBasicNodeMaterial, Vector3 } from 'three/webgpu'
import { attribute, exp, float, max, mix, pow, select, smoothstep, uniform, vec2, vec3 } from 'three/tsl'
import { N } from '../../../../rendering/noise.ts'

/** Arcs kept (the oldest is overwritten), and samples per arc. */
const ARCS = 8
const SAMPLES = 48
/** A new sample once the tip has moved this far (m). */
const SPACING = 0.18
/** How long an arc's light lasts (s): it tears away from the blade's base side to the tip within this. */
const LIFE = 0.34
const NEVER = 1e9

/**
 * The light a cutlass leaves along its cut: the air the edge passed through
 * charged with the Impala's crimson energy. An arc is recorded from the
 * cutting edge's two ends while a heavy cut is live (`begin` / `end`), a
 * sample every few centimetres of the tip's travel; it shades as a thin
 * white-hot line along the tip's path over a crimson sheet that thins toward
 * the base and tears away from it in ragged strands, all gone within a third
 * of a second. One additive ribbon mesh holds every arc, written only while
 * a cut is recorded; its whole look is evaluated from birth times, so a
 * frame uploads only the new samples.
 */
export class BladeArcs {
  readonly mesh: Mesh
  private readonly time = uniform(0)
  private clock = 0
  private readonly position: BufferAttribute
  /** per vertex: birth (s), across (0 base .. 1 tip), along (0..1 of the arc), strength */
  private readonly data: BufferAttribute
  private arc = -1
  private count = 0
  private strength = 1
  private readonly last = new Vector3()
  private cutting = false
  private liveUntil = -1

  constructor() {
    const geometry = new BufferGeometry()
    this.position = new BufferAttribute(new Float32Array(ARCS * SAMPLES * 2 * 3), 3)
    this.data = new BufferAttribute(new Float32Array(ARCS * SAMPLES * 2 * 4), 4)
    this.position.setUsage(DynamicDrawUsage)
    this.data.setUsage(DynamicDrawUsage)
    const d = this.data.array as Float32Array
    for (let i = 0; i < ARCS * SAMPLES * 2; i++) d[i * 4] = NEVER
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
    const across = a.y, along = a.z, strength = a.w
    const life = age.div(LIFE)
    const seed = a.x.mul(0.53)
    // the tip's path: a thin hot line; behind it a sheet thinning toward the blade's base
    const tip = float(1).sub(across)
    const core = exp(tip.div(0.035).pow(2).negate())
    const sheet = pow(across, 2.2)
    // torn away from the base side first, ragged, as the charge bleeds off
    const strands = N(vec2(along.mul(9).add(seed), across.mul(3.1).sub(age.mul(1.3)))).r
    const eaten = life.mul(1.25).sub(across.mul(0.55))
    const left = smoothstep(eaten, eaten.add(0.12), strands)
    const ends = smoothstep(0, 0.06, along).mul(smoothstep(1, 0.88, along))
    const fade = max(float(1).sub(life), 0)
    // white-hot at the line, through hot crimson to a deep red in the sheet (linear HDR)
    const hot = mix(vec3(1.0, 0.07, 0.05), vec3(1.0, 0.62, 0.52), core)
    const glow = hot.mul(core.mul(7).add(sheet.mul(1.6).mul(left))).mul(fade.mul(fade)).mul(ends).mul(strength)
    m.colorNode = select(age.greaterThanEqual(0).and(age.lessThan(LIFE)), glow, vec3(0))
    this.mesh = new Mesh(geometry, m)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 3
    this.mesh.visible = false
  }

  /** Start recording a cut (`strength` scales its light). */
  begin(strength = 1): void {
    this.arc = (this.arc + 1) % ARCS
    this.count = 0
    this.cutting = true
    this.strength = strength
    const d = this.data.array as Float32Array
    const start = this.arc * SAMPLES * 2
    for (let i = 0; i < SAMPLES * 2; i++) d[(start + i) * 4] = NEVER
    this.flush(start, SAMPLES * 2)
  }

  /** The cutting edge's ends this frame (world), while a cut is recorded. */
  add(base: Vector3, tip: Vector3): void {
    if (!this.cutting) return
    if (this.count >= SAMPLES) this.begin(this.strength)
    if (this.count > 0 && tip.distanceTo(this.last) < SPACING) return
    this.last.copy(tip)
    const first = this.arc * SAMPLES * 2
    const i = first + this.count * 2
    const p = this.position.array as Float32Array
    const d = this.data.array as Float32Array
    base.toArray(p, i * 3)
    tip.toArray(p, i * 3 + 3)
    d[i * 4] = this.clock; d[i * 4 + 1] = 0; d[i * 4 + 3] = this.strength
    d[i * 4 + 4] = this.clock; d[i * 4 + 5] = 1; d[i * 4 + 7] = this.strength
    this.count++
    // the arc's length coordinate stretched over what has been cut so far
    for (let k = 0; k < this.count; k++) {
      const u = this.count > 1 ? k / (this.count - 1) : 0
      d[(first + k * 2) * 4 + 2] = u
      d[(first + k * 2 + 1) * 4 + 2] = u
    }
    // later samples copy the last one, so the ribbon ends where the cut does
    for (let k = this.count; k < SAMPLES; k++) p.copyWithin((first + k * 2) * 3, i * 3, i * 3 + 6)
    this.position.addUpdateRange(first * 3, SAMPLES * 2 * 3)
    this.position.needsUpdate = true
    this.flush(first, this.count * 2)
    this.liveUntil = this.clock + LIFE
    this.mesh.visible = true
  }

  end(): void {
    this.cutting = false
  }

  get recording(): boolean {
    return this.cutting
  }

  update(dt: number): void {
    this.clock += dt
    this.time.value = this.clock
    this.mesh.visible = this.clock < this.liveUntil
  }

  reset(): void {
    this.cutting = false
    this.liveUntil = -1
    this.mesh.visible = false
  }

  warm(on: boolean): void {
    this.mesh.visible = on || this.clock < this.liveUntil
  }

  private flush(first: number, count: number): void {
    this.data.addUpdateRange(first * 4, count * 4)
    this.data.needsUpdate = true
  }
}
