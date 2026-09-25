import type { AudioMix } from '../../../audio/mix'
import { noise, voice } from '../combat/audio/shots'

/** A robot's foot on sand, tuned to its mass. */
export interface FootfallTuning {
  /** lowpass of the weight settling into the sand (Hz): start, end */
  pressHz: [number, number]
  /** sand grind band under the sole (Hz): lower bound and random spread */
  grindHz: [number, number]
  /** voice gain before the dry mix and reverb send */
  level: number
}

/** A multi-tonne foot: a deep, dull press. */
export const HEAVY_FOOT: FootfallTuning = {
  pressHz: [240, 130],
  grindHz: [1500, 500],
  level: 0.3,
}

/**
 * One foot set down on the shared mix, `strength` 0..1+: weight shifting onto
 * the sole and the sand grinding under it as it settles. Soft onsets
 * throughout, no pitched drop and no damper exhale, so a stride or a flurry of
 * fighting footwork stays underneath everything else. Nothing persists
 * between steps.
 */
export function footfall(mix: AudioMix, tuning: FootfallTuning, strength = 1): void {
  const ctx = mix.ctx
  if (!ctx || !mix.enabled) return
  const t = ctx.currentTime + 0.005
  const g = Math.min(1.2, strength)
  const bus = voice(mix, tuning.level, 0.18, 0.5)
  const tex = mix.tex
  // the weight settling into the sand: a dull, rounded press
  noise(ctx, tex.brown, bus, t, 0.2, 'lowpass', tuning.pressHz[0], tuning.pressHz[1], 0.025, 0.5 * g)
  // the sole grinding the sand as it takes the weight
  const grind = tuning.grindHz[0] + Math.random() * tuning.grindHz[1]
  noise(ctx, tex.white, bus, t + 0.01, 0.24 * (0.8 + Math.random() * 0.4), 'bandpass', grind, grind * 0.45, 0.04, 0.07 * g, 0.2)
  // a few grains shifting under the edge of the foot
  for (let i = 0; i < 3; i++) {
    noise(ctx, tex.chatter, bus, t + 0.02 + Math.random() * 0.14, 0.05, 'bandpass', grind * 1.45 + Math.random() * 1600, grind, 0.006, 0.035 * g)
  }
}
