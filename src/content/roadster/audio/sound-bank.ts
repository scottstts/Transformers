import { rng, shapedNoise, synthesise, type SpectralGrid, type SpectralVariation } from '../../../audio/spectral'
import { LOOP_MODELS, ROADSTER_BANDS, SHOT_MODELS, SHOT_SECONDS, SHOT_TIMES, type RoadsterLoop, type RoadsterShot } from './sound-models'

/**
 * The Roadster's sounds, synthesised from models fitted to its recordings
 * by tools/roadster-sound-model.mjs (nothing of the recordings is shipped):
 *
 *   shock       the palm cannon's blast: a 36 Hz punch under a broadband roar
 *   energy      the energy cannon's discharge: a 41 Hz body under a bright wash
 *   pass        one pass of the sprint going by
 *   explosion   Whiteout's impact: a deep blast rolling on for two seconds
 *   landing     the robot coming down at the end of its transformation: a heavy thump, a metal ring
 *   distortion  (loop) the fist's distortion field: a sub rumble on a 40 Hz line
 *   propeller   (loop) the air pack's roar
 *
 * A one-shot has several takes (its own noise, a band tilt of a dB or two, a
 * few per cent of time stretch, a slight detune of its tones), so a run of
 * blasts never repeats itself. A loop is built in the frequency domain, so
 * it repeats with no seam; its tones are snapped to whole cycles of the loop.
 * Pure: the audio side copies the samples into AudioBuffers.
 */
export const SHOT_TAKES: Record<RoadsterShot, number> = { shock: 4, energy: 4, explosion: 2, landing: 3, pass: 3 }

const Q = 4.32
const VARIATION: Record<RoadsterShot, SpectralVariation> = {
  shock: { stretch: 0.07, tilt: 1.6, detune: 0.03 },
  energy: { stretch: 0.06, tilt: 1.4, detune: 0.025 },
  explosion: { stretch: 0.05, tilt: 1.2, detune: 0.02 },
  landing: { stretch: 0.05, tilt: 1.2, detune: 0.02 },
  pass: { stretch: 0.1, tilt: 1.8, detune: 0 },
}
const PEAK: Record<RoadsterShot, number> = { shock: 0.9, energy: 0.9, explosion: 0.95, landing: 0.95, pass: 0.85 }

const grid = (name: RoadsterShot): SpectralGrid => ({ bands: ROADSTER_BANDS, times: SHOT_TIMES[name], seconds: SHOT_SECONDS[name], q: Q, fadeOut: 0.12 })

/** One take of a one-shot at `rate` Hz. */
export function roadsterTake(name: RoadsterShot, variant: number, rate: number): Float32Array<ArrayBuffer> {
  const seed = 0x40ad + Object.keys(SHOT_TAKES).indexOf(name) * 7919 + variant * 104729
  return synthesise(SHOT_MODELS[name], grid(name), seed, rate, VARIATION[name], PEAK[name])
}

/**
 * A seamless loop of `name`, `n` samples (a power of two) at `rate` Hz, peak
 * about 0.9: the measured steady spectrum as shaped noise, plus its tones as
 * sines at the measured level against it, each on a whole number of cycles
 * of the loop.
 */
export function roadsterLoop(name: RoadsterLoop, n: number, rate: number): Float32Array<ArrayBuffer> {
  const model = LOOP_MODELS[name]
  const out = shapedNoise(n, rate, ROADSTER_BANDS, model.bands, 0x51ee + n + (name === 'propeller' ? 0 : 977))
  // the noise is unit RMS; its loudest third-octave band holds a share of that power
  const total = model.bands.reduce((s, db) => s + 10 ** (db / 10), 0)
  const top = 1 / Math.sqrt(total)
  const r = rng(0x7a11)
  for (const line of model.lines) {
    const cycles = Math.max(1, Math.round((line.f * n) / rate))
    const w = (2 * Math.PI * cycles) / n
    const a = top * 10 ** (line.db / 20) * Math.SQRT2
    const phase = r() * Math.PI * 2
    for (let i = 0; i < n; i++) out[i] += a * Math.sin(w * i + phase)
  }
  let peak = 0
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]))
  if (peak > 0) for (let i = 0; i < n; i++) out[i] *= 0.9 / peak
  return out
}
