import { synthesise, type SpectralGrid, type SpectralVariation } from '../../../audio/spectral'
import { BLAST_SECONDS, BLAST_TIMES, GUN_BANDS, GUN_MODELS, GUN_PERIOD, SHOT_OVERLAP, SHOT_TIMES, TAIL_SECONDS, TAIL_TIMES } from './gun-models'

/**
 * The gun's sounds, synthesised from models fitted to two recordings (a
 * machine-gun burst and a cannon shot) by tools/gun-model.mjs:
 *
 *   shot   one period of the burst from a shot's onset, carrying the tails of
 *          the shots before it as the recording does; tiled at the recorded
 *          rate (GUN_PERIOD) it is a burst
 *   tail   the burst's decay after its last period
 *   blast  the cannon, from the shot to the end of its roll
 *
 * Each has its takes: own noise, a band tilt of a dB or two, a few per cent of
 * time stretch, so a long burst never loops audibly. Pure: the audio side
 * copies the samples into AudioBuffers.
 */
export type GunSound = 'shot' | 'tail' | 'blast'
export const GUN_TAKES: Record<GunSound, number> = { shot: 8, tail: 2, blast: 2 }

const Q = 4.32
const GRIDS: Record<GunSound, SpectralGrid> = {
  shot: { bands: GUN_BANDS, times: SHOT_TIMES, seconds: GUN_PERIOD + SHOT_OVERLAP, q: Q, fadeOut: SHOT_OVERLAP },
  tail: { bands: GUN_BANDS, times: TAIL_TIMES, seconds: TAIL_SECONDS, q: Q },
  blast: { bands: GUN_BANDS, times: BLAST_TIMES, seconds: BLAST_SECONDS, q: Q },
}
const VARIATION: Record<GunSound, SpectralVariation> = {
  // a shot's length is its period: its timing may not stretch, or the burst would drift off its rate
  shot: { stretch: 0, tilt: 1.8, detune: 0 },
  tail: { stretch: 0.05, tilt: 1.5, detune: 0 },
  blast: { stretch: 0.06, tilt: 1.2, detune: 0 },
}
/** Relative levels of the takes (peak): a shot is a burst's share of its loudest moment, the blast is the loudest. */
const PEAK: Record<GunSound, number> = { shot: 0.8, tail: 0.5, blast: 0.95 }

/** One take of `sound` at `rate` Hz. */
export function gunTake(sound: GunSound, variant: number, rate: number): Float32Array<ArrayBuffer> {
  const seed = 0x5e71 + ['shot', 'tail', 'blast'].indexOf(sound) * 7919 + variant * 104729
  return synthesise(GUN_MODELS[sound], GRIDS[sound], seed, rate, VARIATION[sound], PEAK[sound])
}
