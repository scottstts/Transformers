import { HIT_BANDS, HIT_MODELS, HIT_TIMES, type HitModel } from './hit-models'

/**
 * The robots' blows landing on the soldiers, synthesised from models fitted
 * to Foley recordings (a punch, a stomp, a sword slash) by
 * tools/hit-model.mjs: for each, its level over time in 28 third-octave
 * bands, and the partials that ring on after the impact with their own
 * envelopes. A take is band-passed noise per band, shaped by the band's
 * envelope, plus a sine per partial shaped by its own: the recording's
 * spectral shape and time course, rebuilt from fresh noise.
 *
 * The first version layered hand-designed pieces (a sine thump gliding down,
 * a snap, resonator banks) and read as a cartoon: the recordings' punch has
 * no pitch sweep at all (a broadband slap, then a steady ~50 Hz boom swelling
 * in after it), and the slash's ring is a handful of partials over bright
 * noise, not a resonator cluster. Fitting the envelopes keeps what the ear
 * hears in them.
 *
 *   punch  blunt blows
 *   heavy  (the stomp) blasts and blows that throw: a scuff, then the boom
 *   slash  cuts; the recording's whoosh is left out (the robot's own swing
 *          voice is that half), the model starts at the blade's impact
 *
 * Each kind has HIT_VARIANTS takes: their own noise, a smooth tilt of a dB
 * or two across the bands, time stretched a few per cent, the partials
 * detuned a hair, so repeated blows never repeat. Pure: the audio side
 * copies the samples into AudioBuffers, a take a frame.
 */
export type BlowKind = 'punch' | 'heavy' | 'slash'
export const BLOW_KINDS: readonly BlowKind[] = ['punch', 'heavy', 'slash']
export const HIT_VARIANTS = 4
/** Take length (s), the band-pass Q (third octaves, as fitted) and how far a take's timing and bands vary. */
const SECONDS = 0.95
const Q = 4.32
const STRETCH = 0.05
const TILT_DB = 1.5

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A dB envelope on HIT_TIMES at time `ms`: linear in dB between points, the last slope carried on past the end. */
function level(env: readonly number[], ms: number): number {
  const T = HIT_TIMES
  if (ms <= T[0]) return env[0]
  for (let k = 1; k < T.length; k++) {
    if (ms <= T[k]) return env[k - 1] + ((env[k] - env[k - 1]) * (ms - T[k - 1])) / (T[k] - T[k - 1])
  }
  const k = T.length - 1
  return env[k] + ((env[k] - env[k - 1]) * (ms - T[k])) / (T[k] - T[k - 1])
}

/** RBJ band-pass (constant 0 dB peak, as in the fitting) over `x`, in place. */
function bandpass(x: Float32Array, rate: number, f: number, q: number): void {
  const w = (2 * Math.PI * f) / rate, alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha
  const b0 = alpha / a0, b2 = -alpha / a0, a1 = (-2 * Math.cos(w)) / a0, a2 = (1 - alpha) / a0
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) {
    const y = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y
    x[i] = y
  }
}

/** One take of a blow of `kind` at `rate` Hz, peak-normalised to 0.9. */
export function blowTake(kind: BlowKind, variant: number, rate: number): Float32Array<ArrayBuffer> {
  return synthesise(HIT_MODELS[kind], 0xb10e + BLOW_KINDS.indexOf(kind) * 7919 + variant * 104729, rate, true)
}

/** A take of `model` from noise seeded `seed`; `vary` its timing, band tilt and detuning (off when the model is fitted). */
export function synthesise(model: HitModel, seed: number, rate: number, vary: boolean): Float32Array<ArrayBuffer> {
  const n = Math.round(SECONDS * rate)
  const out = new Float32Array(n)
  const r = rng(seed)
  const stretch = vary ? 1 + (r() * 2 - 1) * STRETCH : 1
  // a smooth random tilt across the bands (a walk, so neighbours stay close)
  let walk = 0
  const tilt = HIT_BANDS.map(() => (vary ? (walk = walk * 0.7 + (r() * 2 - 1) * TILT_DB * 0.5) : 0))
  const band = new Float32Array(n)
  // uniform noise's variance is 1/3; the band-pass passes an equivalent bandwidth of pi f / (2 Q)
  const unit = (f: number): number => 1 / Math.sqrt((1 / 3) * ((Math.PI * f) / (2 * Q)) / (rate / 2))
  HIT_BANDS.forEach((f, b) => {
    if (f >= rate * 0.45) return
    for (let i = 0; i < n; i++) band[i] = r() * 2 - 1
    bandpass(band, rate, f, Q)
    const env = model.bands[b]
    const k = unit(f)
    for (let i = 0; i < n; i++) {
      const ms = (i / rate) * 1000 / stretch
      out[i] += band[i] * k * 10 ** ((level(env, ms) + tilt[b]) / 20)
    }
  })
  for (const p of model.partials) {
    if (p.f >= rate * 0.45) continue
    const w = (2 * Math.PI * p.f * (1 + (vary ? (r() * 2 - 1) * 0.003 : 0))) / rate
    let phase = r() * Math.PI * 2
    for (let i = 0; i < n; i++) {
      phase += w
      out[i] += Math.SQRT2 * 10 ** (level(p.env, (i / rate) * 1000 / stretch) / 20) * Math.sin(phase)
    }
  }
  // a millisecond's fade in (the model starts at the impact), 30 ms out, normalised
  const fadeIn = Math.round(0.001 * rate), fadeOut = Math.round(0.03 * rate)
  let peak = 0
  for (let i = 0; i < n; i++) {
    if (i < fadeIn) out[i] *= i / fadeIn
    if (i > n - fadeOut) out[i] *= (n - i) / fadeOut
    peak = Math.max(peak, Math.abs(out[i]))
  }
  if (peak > 0) for (let i = 0; i < n; i++) out[i] *= 0.9 / peak
  return out
}
