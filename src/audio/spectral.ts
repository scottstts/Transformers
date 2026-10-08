/**
 * Sounds rebuilt from spectral-envelope models fitted to recordings
 * (tools/hit-model.mjs, tools/gun-model.mjs): a model is the level over time
 * in third-octave bands, plus the partials that ring on with their own
 * envelopes. A take is band-passed noise per band, shaped by the band's
 * envelope, plus a sine per partial shaped by its own: the recording's
 * spectral shape and time course, rebuilt from fresh noise. Nothing of the
 * recordings is shipped.
 *
 * Pure: callers copy the samples into AudioBuffers.
 */
export interface SpectralModel {
  /** noise level per band (dB) at each grid time */
  bands: readonly (readonly number[])[]
  /** ringing partials (Hz) and their levels (dB) at each grid time */
  partials: ReadonlyArray<{ f: number; env: readonly number[] }>
}

/**
 * Where a model's numbers sit: band centres (Hz), envelope times (ms), the
 * take's length (s), the fitted band Q and the fade at the take's end (s,
 * default 30 ms; a take tiled end to end, one period of a burst, keeps it short).
 */
export interface SpectralGrid {
  bands: readonly number[]
  times: readonly number[]
  seconds: number
  q: number
  fadeOut?: number
  /**
   * A ring's lines as close pairs this share of their frequency apart
   * (beating) rather than single sines: a struck blade's modes split and
   * shimmer; a lone steady sine over the noise reads as a cartoon "ding".
   */
  shimmer?: number
}

/** How far a take varies from the model: time stretch (share), a smooth band tilt (dB) and partial detune (share). */
export interface SpectralVariation {
  stretch: number
  tilt: number
  detune: number
}

export function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** RBJ band-pass (constant 0 dB peak, as the fitting measures) over `x`, in place. */
export function bandpass(x: Float32Array, rate: number, f: number, q: number): void {
  const w = (2 * Math.PI * f) / rate, alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha
  const b0 = alpha / a0, b2 = -alpha / a0, a1 = (-2 * Math.cos(w)) / a0, a2 = (1 - alpha) / a0
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) {
    const y = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y
    x[i] = y
  }
}

/**
 * Multiply `x` by a dB envelope on `times` (ms, stretched by `stretch`),
 * linear in dB between points and the last slope carried on past the end,
 * plus `offset` dB. The gain steps multiplicatively inside each segment (the
 * exact exponential of a dB-linear ramp): no per-sample search or power.
 */
function shape(x: Float32Array, rate: number, env: readonly number[], times: readonly number[], stretch: number, offset: number, scale: number): void {
  const n = x.length
  const toSample = (ms: number): number => (ms * stretch * rate) / 1000
  const last = times.length - 1
  let i = 0
  // before the first point: held
  const first = Math.min(n, Math.max(0, Math.ceil(toSample(times[0]))))
  const g0 = scale * 10 ** ((env[0] + offset) / 20)
  for (; i < first; i++) x[i] *= g0
  for (let k = 0; k <= last && i < n; k++) {
    // segment k runs from times[k] to times[k + 1] (the last carries the final slope on)
    const a = k < last ? k : last - 1
    const t0 = times[a], t1 = times[a + 1]
    const slope = (env[a + 1] - env[a]) / (t1 - t0)
    const end = k < last ? Math.min(n, Math.ceil(toSample(times[k + 1]))) : n
    if (end <= i) continue
    const ms = (i * 1000) / (rate * stretch)
    let g = scale * 10 ** ((env[a] + slope * (ms - t0) + offset) / 20)
    const step = 10 ** ((slope * 1000) / (rate * stretch) / 20)
    for (; i < end; i++) {
      x[i] *= g
      g *= step
    }
  }
}

/**
 * A take of `model` on `grid` from noise seeded `seed`, peak-normalised to
 * `peak`; `vary` (off when fitting) sets how far its timing, band tilt and
 * partial tuning wander from the model, so repeated takes never repeat.
 */
export function synthesise(model: SpectralModel, grid: SpectralGrid, seed: number, rate: number, vary: SpectralVariation | null, peak = 0.9): Float32Array<ArrayBuffer> {
  const n = Math.round(grid.seconds * rate)
  const out = new Float32Array(n)
  const r = rng(seed)
  const stretch = vary ? 1 + (r() * 2 - 1) * vary.stretch : 1
  // a smooth random tilt across the bands (a walk, so neighbours stay close)
  let walk = 0
  const tilt = grid.bands.map(() => (vary ? (walk = walk * 0.7 + (r() * 2 - 1) * vary.tilt * 0.5) : 0))
  const band = new Float32Array(n)
  const q = grid.q
  // uniform noise's variance is 1/3; the band-pass passes an equivalent bandwidth of pi f / (2 Q)
  const unit = (f: number): number => 1 / Math.sqrt((1 / 3) * ((Math.PI * f) / (2 * q)) / (rate / 2))
  grid.bands.forEach((f, b) => {
    if (f >= rate * 0.45) return
    for (let i = 0; i < n; i++) band[i] = r() * 2 - 1
    bandpass(band, rate, f, q)
    shape(band, rate, model.bands[b], grid.times, stretch, tilt[b], unit(f))
    for (let i = 0; i < n; i++) out[i] += band[i]
  })
  for (const p of model.partials) {
    if (p.f >= rate * 0.45) continue
    const w = (2 * Math.PI * p.f * (1 + (vary ? (r() * 2 - 1) * vary.detune : 0))) / rate
    const split = grid.shimmer ?? 0
    let phase = r() * Math.PI * 2, phase2 = r() * Math.PI * 2
    // the pair's spacing varies line to line, so the lines beat at their own rates
    const w1 = w * (1 - split * (0.3 + 0.4 * r())), w2 = w * (1 + split * (0.3 + 0.4 * r()))
    for (let i = 0; i < n; i++) {
      if (split > 0) {
        phase += w1
        phase2 += w2
        band[i] = Math.sin(phase) + Math.sin(phase2)
      } else {
        phase += w
        band[i] = Math.sin(phase)
      }
    }
    // unit RMS: a sine's is 1/sqrt 2, a pair's (incoherent) 1
    shape(band, rate, p.env, grid.times, stretch, 0, split > 0 ? 1 : Math.SQRT2)
    for (let i = 0; i < n; i++) out[i] += band[i]
  }
  // a millisecond's fade in (the model starts at the onset), the grid's fade out, normalised
  const fadeIn = Math.round(0.001 * rate), fadeOut = Math.max(1, Math.round((grid.fadeOut ?? 0.03) * rate))
  let top = 0
  for (let i = 0; i < n; i++) {
    if (i < fadeIn) out[i] *= i / fadeIn
    if (i > n - fadeOut) out[i] *= (n - i) / fadeOut
    top = Math.max(top, Math.abs(out[i]))
  }
  if (top > 0) for (let i = 0; i < n; i++) out[i] *= peak / top
  return out
}

/**
 * Steady noise with a measured spectrum, `n` samples (a power of two), unit
 * RMS: random phases under magnitudes interpolated in dB, linearly in log
 * frequency, between `bands` (Hz) and their levels `db`, then one inverse
 * FFT. Built in the frequency domain, it is exactly periodic, so it loops
 * with no seam (an engine's noise played on and on).
 */
export function shapedNoise(n: number, rate: number, bands: readonly number[], db: readonly number[], seed: number): Float32Array<ArrayBuffer> {
  if (n & (n - 1)) throw new Error('shapedNoise: n must be a power of two')
  const re = new Float64Array(n), im = new Float64Array(n)
  const r = rng(seed)
  const level = (f: number): number => {
    if (f <= bands[0]) return db[0]
    if (f >= bands[bands.length - 1]) return db[db.length - 1]
    const x = Math.log2(f / bands[0]) / Math.log2(bands[1] / bands[0])
    const b = Math.min(bands.length - 2, Math.floor(x))
    return db[b] + (db[b + 1] - db[b]) * (x - b)
  }
  for (let k = 1; k < n / 2; k++) {
    // a band's power spread over its bins: magnitude per bin goes as 1/sqrt(f) for a flat third-octave level
    const f = (k * rate) / n
    const m = 10 ** (level(f) / 20) / Math.sqrt(f)
    const a = r() * Math.PI * 2
    re[k] = m * Math.cos(a)
    im[k] = m * Math.sin(a)
    re[n - k] = re[k]
    im[n - k] = -im[k]
  }
  // inverse transform (conjugate, forward, conjugate)
  for (let k = 0; k < n; k++) im[k] = -im[k]
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(ang * k), s = Math.sin(ang * k)
        const p = i + k, q = p + len / 2
        const vr = re[q] * c - im[q] * s, vi = re[q] * s + im[q] * c
        re[q] = re[p] - vr; im[q] = im[p] - vi
        re[p] += vr; im[p] += vi
      }
    }
  }
  const out = new Float32Array(n)
  let sum = 0
  for (let i = 0; i < n; i++) sum += re[i] * re[i]
  const g = sum > 0 ? 1 / Math.sqrt(sum / n) : 0
  for (let i = 0; i < n; i++) out[i] = re[i] * g
  return out
}
