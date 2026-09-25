/** A key: time (s) and value. */
export type Key = readonly [number, number]

/**
 * A keyed channel through shape-preserving monotone cubics (Fritsch-Carlson):
 * smooth velocity through every key and no overshoot between keys, so an arc
 * authored through a few poses never swings past them (a fist that would
 * bulge through the body, a foot below the ground). A key where the channel
 * turns around is a stop: fast segments into a stop read as a strike.
 *
 * Storage is preallocated; `set` rebuilds the slopes without allocating.
 */
export class Curve {
  private readonly t: Float64Array
  private readonly v: Float64Array
  private readonly m: Float64Array
  private n = 0

  constructor(capacity: number) {
    this.t = new Float64Array(capacity)
    this.v = new Float64Array(capacity)
    this.m = new Float64Array(capacity)
  }

  /** Start at `start` (t = 0) and pass through `keys` (strictly later times). */
  set(start: number, keys: readonly Key[] | undefined, hold = 0): void {
    const n = 1 + (keys?.length ?? 0)
    if (n > this.t.length) throw new Error(`curve holds ${this.t.length} keys, got ${n}`)
    this.t[0] = 0
    this.v[0] = start
    if (keys) for (let i = 0; i < keys.length; i++) {
      this.t[i + 1] = keys[i][0]
      this.v[i + 1] = keys[i][1]
    }
    if (n === 1 && hold > 0) {
      // nothing keyed: hold the start value
      this.t[1] = hold
      this.v[1] = start
      this.n = 2
    } else this.n = n
    this.slopes()
  }

  /** Ease from `start` to `target` by `at` (s), then hold. */
  settle(start: number, target: number, at: number): void {
    this.t[0] = 0
    this.v[0] = start
    this.t[1] = at
    this.v[1] = target
    this.n = 2
    this.slopes()
  }

  at(x: number): number {
    const n = this.n
    const t = this.t
    if (n === 1 || x <= 0) return this.v[0]
    if (x >= t[n - 1]) return this.v[n - 1]
    let i = 0
    while (x > t[i + 1]) i++
    const h = t[i + 1] - t[i]
    const s = (x - t[i]) / h
    const s2 = s * s
    const s3 = s2 * s
    return (2 * s3 - 3 * s2 + 1) * this.v[i] + (s3 - 2 * s2 + s) * h * this.m[i]
      + (-2 * s3 + 3 * s2) * this.v[i + 1] + (s3 - s2) * h * this.m[i + 1]
  }

  /** Time of the last key. */
  get end(): number {
    return this.t[this.n - 1]
  }

  private slopes(): void {
    const { t, v, m } = this
    const n = this.n
    if (n < 2) {
      m[0] = 0
      return
    }
    // secants; zero slope at the ends so a curve starts and settles at rest
    for (let i = 1; i < n - 1; i++) {
      const d0 = (v[i] - v[i - 1]) / (t[i] - t[i - 1])
      const d1 = (v[i + 1] - v[i]) / (t[i + 1] - t[i])
      if (d0 * d1 <= 0) {
        m[i] = 0
        continue
      }
      // weighted harmonic mean (Fritsch-Butland): monotone for uneven spacing
      const h0 = t[i] - t[i - 1]
      const h1 = t[i + 1] - t[i]
      const w0 = 2 * h1 + h0
      const w1 = h1 + 2 * h0
      m[i] = (w0 + w1) / (w0 / d0 + w1 / d1)
    }
    m[0] = 0
    m[n - 1] = 0
  }
}
