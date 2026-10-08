import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, Mesh, MeshBasicNodeMaterial, Quaternion, Vector3 } from 'three/webgpu'
import { attribute, exp, float, max, mix, pow, select, sin, smoothstep, uniform, vec3 } from 'three/tsl'

/** Arcs kept (the oldest is overwritten), and samples per arc: a full circle at the finest step fits one arc. */
const ARCS = 6
const SAMPLES = 192
/**
 * The path is sampled between frames along the blade's own turn: a sample
 * every STEP radians of the blade's direction or TRAVEL metres of the tip,
 * whichever comes first, at most PER_FRAME a frame.
 */
const STEP = 0.045
const TRAVEL = 0.3
const PER_FRAME = 24
/** How long an arc's light lasts (s). */
const LIFE = 0.36
/** The band spans the blade from this share of its length out to a little past its point. */
const ROOT = 0.3
const REACH = 1.05
const NEVER = 1e9

/**
 * The light a cutlass leaves along its cut: the air the edge passed through
 * charged with the Impala's crimson energy, a thick crescent of light. An
 * arc is recorded from the cutting edge's two ends while a heavy cut is live
 * (`begin` / `end`). A fast cut moves the tip metres in a frame, so the path
 * between two frames is rebuilt along the blade's own turn (its direction
 * slerped about the turn's axis, the grip carried straight between): a
 * frame's chord would draw the arc as a bent polyline.
 *
 * The band covers the outer part of the blade: a white-hot line along the
 * tip's path over a broad crimson body. As each sample ages the body is
 * eaten from the inside toward that line, so the arc thins toward its tail
 * (the crescent) and burns out within a third of a second. One additive
 * ribbon mesh holds every arc; its whole look is evaluated from birth times,
 * so a frame uploads only its new samples.
 */
export class BladeArcs {
  readonly mesh: Mesh
  private readonly time = uniform(0)
  private clock = 0
  private readonly position: BufferAttribute
  /** per vertex: birth (s), across (0 band's root .. 1 the tip's path), along (0..1 of the arc), strength */
  private readonly data: BufferAttribute
  private arc = -1
  private count = 0
  /** samples written per arc */
  private readonly counts = new Int32Array(ARCS)
  private strength = 1
  private cutting = false
  private liveUntil = -1
  /** the last frame's grip end and blade direction, and when it was taken (s) */
  private readonly lastBase = new Vector3()
  private readonly lastDir = new Vector3()
  private lastClock = 0
  private length = 0
  private framed = false
  /** arcs written this frame (bit per arc), finished and uploaded once at the frame's end */
  private dirty = 0

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
    // the body eaten from its root toward the tip's line as it ages: the arc thins toward its tail
    const inner = pow(life, 0.75).mul(0.82)
    const body = smoothstep(inner, inner.add(0.22), across).mul(smoothstep(1, 0.955, across))
    // the white-hot line the point drew, and the body brightening toward it
    const line = exp(across.sub(0.94).div(0.035).pow(2).negate())
    const toward = pow(across, 1.6)
    // faint streaks along the cut, the charge's speed lines
    const streaks = sin(across.mul(47).add(a.x.mul(3.1))).mul(0.12).add(0.88)
    const ends = smoothstep(0, 0.035, along)
    const fade = pow(max(float(1).sub(life), 0), 1.4)
    const hot = mix(vec3(1.0, 0.06, 0.05), vec3(1.0, 0.5, 0.42), toward)
    const glow = hot.mul(body.mul(toward.mul(2.2).add(0.35)).mul(streaks)).add(vec3(1.0, 0.72, 0.66).mul(line.mul(7)))
    m.colorNode = select(age.greaterThanEqual(0).and(age.lessThan(LIFE)), glow.mul(fade).mul(ends).mul(strength), vec3(0))
    this.mesh = new Mesh(geometry, m)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 3
    this.mesh.visible = false
  }

  /** Start recording a cut (`strength` scales its light). */
  begin(strength = 1): void {
    this.open()
    this.cutting = true
    this.framed = false
    this.strength = strength
  }

  /** The cutting edge's ends this frame (world), while a cut is recorded. */
  add(base: Vector3, tip: Vector3): void {
    if (!this.cutting) return
    _dir.subVectors(tip, base)
    const length = _dir.length()
    if (length < 1e-3) return
    _dir.multiplyScalar(1 / length)
    if (!this.framed) {
      this.framed = true
      this.length = length
      this.sample(base, _dir, this.clock)
    } else {
      // the turn since the last frame, and the tip's travel: how finely to rebuild the path between
      const turn = Math.acos(Math.min(1, Math.max(-1, this.lastDir.dot(_dir))))
      _tip.copy(this.lastBase).addScaledVector(this.lastDir, this.length)
      const travel = _tip.distanceTo(tip)
      const steps = Math.min(PER_FRAME, Math.ceil(Math.max(turn / STEP, travel / TRAVEL)))
      if (steps > 0) {
        _turn.setFromUnitVectors(this.lastDir, _dir)
        for (let k = 1; k <= steps; k++) {
          const u = k / steps
          _q.identity().slerp(_turn, u)
          _d.copy(this.lastDir).applyQuaternion(_q)
          _b.lerpVectors(this.lastBase, base, u)
          this.length += (length - this.length) * (1 / steps)
          this.sample(_b, _d, this.lastClock + (this.clock - this.lastClock) * u)
        }
      }
    }
    this.finish()
    this.lastBase.copy(base)
    this.lastDir.copy(_dir)
    this.lastClock = this.clock
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

  /** A fresh arc: its samples cleared (never born). */
  private open(): void {
    this.arc = (this.arc + 1) % ARCS
    this.count = 0
    this.counts[this.arc] = 0
    this.dirty &= ~(1 << this.arc)
    const d = this.data.array as Float32Array
    const start = this.arc * SAMPLES * 2
    for (let i = 0; i < SAMPLES * 2; i++) d[(start + i) * 4] = NEVER
    this.flush(start, SAMPLES * 2)
  }

  /** One sample of the path: the band across the blade from its grip end `base` along `dir`, born at `born` (s). */
  private sample(base: Vector3, dir: Vector3, born: number): void {
    if (this.count >= SAMPLES) {
      // full: carry on in a fresh arc from where this one ends, so the cut runs on unbroken
      const p = this.position.array as Float32Array
      const last = (this.arc * SAMPLES + SAMPLES - 1) * 2
      _r.fromArray(p, last * 3)
      _t.fromArray(p, last * 3 + 3)
      const bornLast = (this.data.array as Float32Array)[last * 4]
      this.open()
      this.write(_r, _t, bornLast)
    }
    _r.copy(base).addScaledVector(dir, this.length * ROOT)
    _t.copy(base).addScaledVector(dir, this.length * REACH)
    this.write(_r, _t, born)
  }

  private write(root: Vector3, tip: Vector3, born: number): void {
    const i = (this.arc * SAMPLES + this.count) * 2
    const p = this.position.array as Float32Array
    const d = this.data.array as Float32Array
    root.toArray(p, i * 3)
    tip.toArray(p, i * 3 + 3)
    d[i * 4] = born; d[i * 4 + 1] = 0; d[i * 4 + 3] = this.strength
    d[i * 4 + 4] = born; d[i * 4 + 5] = 1; d[i * 4 + 7] = this.strength
    this.count++
    this.counts[this.arc] = this.count
    this.dirty |= 1 << this.arc
  }

  /** The arcs written this frame: their length coordinate over what is cut so far, the ribbon closed at its last sample, one upload each. */
  private finish(): void {
    const p = this.position.array as Float32Array
    const d = this.data.array as Float32Array
    for (let a = 0; a < ARCS; a++) {
      if (!(this.dirty & (1 << a))) continue
      const first = a * SAMPLES * 2
      const count = this.counts[a]
      for (let k = 0; k < count; k++) {
        const u = count > 1 ? k / (count - 1) : 0
        d[(first + k * 2) * 4 + 2] = u
        d[(first + k * 2 + 1) * 4 + 2] = u
      }
      // later samples copy the last one, so the ribbon ends where the cut does
      const last = (first + (count - 1) * 2) * 3
      for (let k = count; k < SAMPLES; k++) p.copyWithin((first + k * 2) * 3, last, last + 6)
      this.position.addUpdateRange(first * 3, SAMPLES * 2 * 3)
      this.flush(first, count * 2)
    }
    if (this.dirty) this.position.needsUpdate = true
    this.dirty = 0
  }

  private flush(first: number, count: number): void {
    this.data.addUpdateRange(first * 4, count * 4)
    this.data.needsUpdate = true
  }
}

const _dir = new Vector3()
const _tip = new Vector3()
const _d = new Vector3()
const _b = new Vector3()
const _r = new Vector3()
const _t = new Vector3()
const _q = new Quaternion()
const _turn = new Quaternion()
