import { HIT_BANDS, HIT_MODELS, HIT_TIMES, type HitModel } from './hit-models'
import { synthesise as synthesiseModel, type SpectralGrid, type SpectralVariation } from '../../audio/spectral'

/**
 * The robots' blows landing on the soldiers, synthesised from models fitted
 * to Foley recordings (a punch, a stomp, a sword slash, a cutlass biting) by
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
 *   cutlass the Impala's cutlass biting: a bright slice of noise as the
 *          blade goes through, then the heavier blade's lower metal ring
 *          (around 1.3-4.7 kHz) dying away over most of a second; the rush
 *          before the bite is the robot's swing voice
 *
 * Each kind has HIT_VARIANTS takes: their own noise, a smooth tilt of a dB
 * or two across the bands, time stretched a few per cent, the partials
 * detuned a hair, so repeated blows never repeat. Pure: the audio side
 * copies the samples into AudioBuffers, a take a frame.
 */
export type BlowKind = 'punch' | 'heavy' | 'slash' | 'cutlass'
export const BLOW_KINDS: readonly BlowKind[] = ['punch', 'heavy', 'slash', 'cutlass']
export const HIT_VARIANTS = 4
/** Take length (s), the band-pass Q (third octaves, as fitted) and how far a take's timing and bands vary. */
const GRID: SpectralGrid = { bands: HIT_BANDS, times: HIT_TIMES, seconds: 0.95, q: 4.32 }
const VARIATION: SpectralVariation = { stretch: 0.05, tilt: 1.5, detune: 0.003 }

/** One take of a blow of `kind` at `rate` Hz, peak-normalised to 0.9. */
export function blowTake(kind: BlowKind, variant: number, rate: number): Float32Array<ArrayBuffer> {
  return synthesise(HIT_MODELS[kind], 0xb10e + BLOW_KINDS.indexOf(kind) * 7919 + variant * 104729, rate, true)
}

/** A take of `model` from noise seeded `seed`; `vary` its timing, band tilt and detuning (off when the model is fitted). */
export function synthesise(model: HitModel, seed: number, rate: number, vary: boolean): Float32Array<ArrayBuffer> {
  return synthesiseModel(model, GRID, seed, rate, vary ? VARIATION : null)
}
