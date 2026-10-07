// Fits the Impala's engine voice (src/content/impala/audio/big-block.ts) to a recording of the car pulling
// through its gears: the firing frequency is tracked through the pull, and at low and at high revs it measures
// the engine orders (harmonics of the cycle frequency, rpm / 120, relative to the firing order, 8), the noise
// between them (its third-octave shape at a reference firing frequency, its level against the orders' and how
// deeply it pulses at the firing rate), writing src/content/impala/audio/engine-model.ts. The game builds its
// tone and noise from the model; nothing of the recording is shipped.
// Usage: node tools/engine-model.mjs <engine.mp3>          (needs ffmpeg)
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const SR = 48000
const file = process.argv[2]
if (!file) throw new Error('usage: node tools/engine-model.mjs <engine.mp3>')
/** engine orders measured: harmonics 1..ORDERS of the cycle frequency */
const ORDERS = 40
/** third-octave band centres of the noise envelope, 31.5 Hz .. 16 kHz */
const BANDS = Array.from({ length: 28 }, (_, k) => 31.5 * 2 ** (k / 3))
/**
 * The two timbres: firing frequencies (Hz) whose frames are averaged into each, and the analysis window (samples):
 * long enough to part the orders (the cycle frequency is a firing eighth), short enough that the pull's rising revs
 * (about 50 Hz/s at the firing order) do not smear them into the noise between.
 */
const RANGES = { low: [100, 200, 8192], high: [260, 400, 4096] }

function decode(path) {
  const raw = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', path, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 })
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4)
}

function fft(re, im) {
  const N = re.length
  for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] } }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = -2 * Math.PI / len
    for (let i = 0; i < N; i += len) for (let k = 0; k < len / 2; k++) {
      const c = Math.cos(ang * k), s = Math.sin(ang * k)
      const ur = re[i + k], ui = im[i + k]
      const vr = re[i + k + len / 2] * c - im[i + k + len / 2] * s, vi = re[i + k + len / 2] * s + im[i + k + len / 2] * c
      re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi
    }
  }
}

/** Power spectrum (Hann window, energy-normalised so a bin sum is the window's mean power) of N samples from `at`. */
function power(x, at, N) {
  const re = new Float64Array(N), im = new Float64Array(N)
  let w2 = 0
  for (let i = 0; i < N; i++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N); re[i] = (x[at + i] ?? 0) * w; w2 += w * w }
  fft(re, im)
  return Float64Array.from({ length: N / 2 }, (_, i) => 2 * (re[i] ** 2 + im[i] ** 2) / (w2 * N))
}

const x = decode(file)
/** the tracking window, and the frames' spacing (s) */
const N = 16384, HOP = 0.05
let df = SR / N
/** the firing frequency frame by frame: the strongest harmonic comb near the last frame's, from the pull's first firm frame */
const frames = []
{
  // start where the engine is pulling (the first loud, steady stretch)
  let prev = 0
  for (let t = 0; t + N / SR < x.length / SR; t += HOP) {
    const at = Math.round(t * SR)
    const p = power(x, at, N)
    df = SR / N
    const comb = (f) => { let s = 0; for (let h = 1; h <= 4; h++) { const k = f * h / df, i = Math.floor(k), a = k - i; s += Math.sqrt(p[i] * (1 - a) + p[i + 1] * a) / h } return s }
    let best = -1, bf = 0
    const [lo, hi] = prev ? [prev * 0.8, prev * 1.25] : [90, 140]
    for (let f = lo; f < hi; f += 0.2) { const s = comb(f); if (s > best) { best = s; bf = f } }
    let total = 0
    for (let i = 0; i < 4800; i++) total += (x[at + i] ?? 0) ** 2
    if (!prev && total / 4800 < 1e-3) continue
    prev = bf
    frames.push({ t, f8: bf })
  }
}

const level = (p, f) => { const i = Math.round(f / df); return Math.max(p[i - 1], p[i], p[i + 1]) + p[i - 1] * 0 }
/** a frame's tonal power at the orders and the noise power between them, by band */
function split(p, f8) {
  const c = f8 / 8
  const tone = new Float64Array(BANDS.length), noise = new Float64Array(BANDS.length)
  for (let i = 1; i < p.length; i++) {
    const f = i * df
    const b = Math.floor(3 * Math.log2(f / 31.5) + 0.5)
    if (b < 0 || b >= BANDS.length) continue
    const k = f / c, near = Math.abs(k - Math.round(k)) * c
    if (near < Math.max(1.5 * df, 0.22 * c)) tone[b] += p[i]
    else noise[b] += p[i] / Math.max(0.01, 1 - 2 * Math.max(1.5 * df, 0.22 * c) / c)
  }
  return { tone, noise }
}

/** How deeply the noise above 1.5 kHz pulses at the firing rate: its envelope's firing component over its mean. */
function pulsing(t, f8) {
  const at = Math.round(t * SR), n = 9600
  // one-pole high-pass at ~1.5 kHz, rectified, then the envelope's DFT at f8
  const a = Math.exp(-2 * Math.PI * 1500 / SR)
  let y = 0, last = 0, mean = 0, re = 0, im = 0
  for (let i = 0; i < n; i++) {
    const v = x[at + i] ?? 0
    y = a * (y + v - last); last = v
    const e = Math.abs(y)
    mean += e
    re += e * Math.cos(2 * Math.PI * f8 * i / SR); im += e * Math.sin(2 * Math.PI * f8 * i / SR)
  }
  return 2 * Math.hypot(re, im) / Math.max(1e-12, mean)
}

/** Noise floor of the envelope (dB from its loudest band): below it nothing is heard over the orders. */
const FLOOR = -50

/**
 * The noise power by band as dB from the loudest, floored. A low band can hold
 * no bin far enough from every order at high revs (the orders crowd it): it
 * takes its neighbours' level, interpolated in dB.
 */
function envelope(power) {
  const top = Math.max(...power)
  const db = Array.from(power, (v) => v > 0 ? Math.max(FLOOR, 10 * Math.log10(v / top)) : NaN)
  for (let b = 0; b < db.length; b++) {
    if (!Number.isNaN(db[b])) continue
    let l = b - 1, r = b + 1
    while (l >= 0 && Number.isNaN(db[l])) l--
    while (r < db.length && Number.isNaN(db[r])) r++
    const a = l >= 0 ? db[l] : FLOOR, c = r < db.length ? db[r] : FLOOR
    db[b] = l >= 0 && r < db.length ? a + (c - a) * (b - l) / (r - l) : Math.min(a, c)
  }
  return db
}

const fit = {}
for (const [name, [lo, hi, window]] of Object.entries(RANGES)) {
  df = SR / window
  const use = frames.filter((f) => f.f8 >= lo && f.f8 < hi).map((f) => ({ ...f, p: power(x, Math.round(f.t * SR) + (N - window) / 2, window) }))
  if (use.length < 8) throw new Error(`${name}: only ${use.length} frames between ${lo} and ${hi} Hz`)
  const orders = new Float64Array(ORDERS + 1)
  const noise = new Float64Array(BANDS.length)
  let tone = 0, noisy = 0, depth = 0, f8 = 0
  for (const { t, f8: f, p } of use) {
    const ref = level(p, f)
    for (let k = 1; k <= ORDERS; k++) orders[k] += Math.sqrt(level(p, k * f / 8) / ref)
    const s = split(p, f)
    // the noise envelope relative to the firing order's power, so frames of any loudness average alike
    for (let b = 0; b < BANDS.length; b++) noise[b] += s.noise[b] / ref
    tone += s.tone.reduce((a, v) => a + v, 0) / ref
    noisy += s.noise.reduce((a, v) => a + v, 0) / ref
    depth += Math.min(1, pulsing(t, f))
    f8 += f
  }
  const n = use.length
  const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d
  fit[name] = {
    firing: round(f8 / n, 1),
    orders: Array.from(orders.slice(1), (v) => round(v / n)),
    noise: envelope(noise).map((v) => round(v, 1)),
    noiseToTone: round(Math.sqrt(noisy / tone)),
    pulse: round(depth / n, 2),
    frames: n,
  }
}

const arr = (a) => `[${a.join(', ')}]`
writeFileSync('src/content/impala/audio/engine-model.ts', `// Generated by tools/engine-model.mjs from a recording of the car pulling through its gears: do not edit by hand.

/**
 * One timbre of the engine, measured over the recording's frames at about
 * \`firing\` Hz (the firing frequency, rpm / 15 for a V8):
 *   orders       amplitude of each harmonic of the cycle frequency (rpm / 120), 1..${ORDERS}, relative to the firing order (8)
 *   noise        the noise between the orders by third octave (ENGINE_BANDS), dB from its loudest band
 *   noiseToTone  the noise's RMS over the orders' RMS
 *   pulse        how deeply the noise above 1.5 kHz pulses at the firing rate (0..1)
 */
export interface EngineTimbre {
  firing: number
  orders: number[]
  noise: number[]
  noiseToTone: number
  pulse: number
}

export const ENGINE_BANDS = ${arr(BANDS.map((f) => Math.round(f * 10) / 10))}

/** low revs (about ${Math.round(fit.low.firing * 15)} rpm, ${fit.low.frames} frames) and high (about ${Math.round(fit.high.firing * 15)} rpm, ${fit.high.frames} frames) */
export const ENGINE_TIMBRE: Record<'low' | 'high', EngineTimbre> = {
${Object.entries(fit).map(([name, m]) => `  ${name}: {
    firing: ${m.firing},
    orders: ${arr(m.orders)},
    noise: ${arr(m.noise)},
    noiseToTone: ${m.noiseToTone},
    pulse: ${m.pulse},
  },`).join('\n')}
}
`)
console.log('wrote src/content/impala/audio/engine-model.ts')
for (const [name, m] of Object.entries(fit)) console.log(`${name}: firing ${m.firing} Hz (${m.frames} frames), noise/tone ${m.noiseToTone}, pulse ${m.pulse}; orders 1..16 ${m.orders.slice(0, 16).join(' ')}`)
