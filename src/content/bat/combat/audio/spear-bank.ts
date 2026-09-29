import { synthesise, type SpectralGrid, type SpectralVariation } from '../../../../audio/spectral'
import { POKE_SECONDS, POKE_TIMES, SLASH_SECONDS, SLASH_TIMES, SPEAR_BANDS, SPEAR_MODELS } from './spear-models'

/**
 * The spear's sounds, synthesised from models fitted to two recordings (a
 * thrust and a slash) by tools/spear-model.mjs:
 *
 *   poke   the rush of the thrust and the thud as it goes home
 *   slash  the rush of a cut and the blade's ring after it
 *
 * Each has several takes (own noise, a band tilt of a dB or two, a few per
 * cent of time stretch, a slight detune of the ring), so a flurry of thrusts
 * never repeats itself. Pure: the audio side copies the samples into
 * AudioBuffers.
 */
export type SpearSound = 'poke' | 'slash'
export const SPEAR_TAKES: Record<SpearSound, number> = { poke: 6, slash: 4 }

const Q = 4.32
const GRIDS: Record<SpearSound, SpectralGrid> = {
  poke: { bands: SPEAR_BANDS, times: POKE_TIMES, seconds: POKE_SECONDS, q: Q },
  slash: { bands: SPEAR_BANDS, times: SLASH_TIMES, seconds: SLASH_SECONDS, q: Q },
}
const VARIATION: Record<SpearSound, SpectralVariation> = {
  poke: { stretch: 0.08, tilt: 1.8, detune: 0 },
  slash: { stretch: 0.07, tilt: 1.5, detune: 0.015 },
}
const PEAK: Record<SpearSound, number> = { poke: 0.85, slash: 0.9 }

/** One take of `sound` at `rate` Hz. */
export function spearTake(sound: SpearSound, variant: number, rate: number): Float32Array<ArrayBuffer> {
  const seed = 0x5bea + (sound === 'poke' ? 0 : 7919) + variant * 104729
  return synthesise(SPEAR_MODELS[sound], GRIDS[sound], seed, rate, VARIATION[sound], PEAK[sound])
}
