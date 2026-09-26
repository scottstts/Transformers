import type { AudioMix } from '../../../../audio/mix'
import { noise, voice } from './shots'

/**
 * The guard's sounds, from the physical events they stand for rather than
 * "shield" effects: no tones, no zaps.
 *
 *   raise   the field building round the robot: a pressure swell under a
 *           rushing of displaced air, like a large rotor spinning up behind a
 *           wall, low and brief
 *   blocked a blade stopped dead by the field: the blow's energy dumped as a
 *           deep pressure thump, a burst of arc crackle and the air hissing
 *           away from the point
 *   struck  a blade raking armour unguarded: a harsh steel scrape (dense
 *           crackle, broadband) and the dull knock of the body taking it
 *
 * Filters are fixed and wide: a swept band reads as a synthesized whoop.
 */
export function guardRaise(mix: AudioMix, weight: number): void {
  const ctx = mix.ctx
  if (!ctx || !mix.enabled) return
  const t = ctx.currentTime + 0.005
  const bus = voice(mix, 0.22 * weight, 0.5, 1.2)
  noise(ctx, mix.tex.brown, bus, t, 0.7, 'lowpass', 160, 160, 0.18, 0.8, 0.3)
  noise(ctx, mix.tex.roar, bus, t, 0.8, 'lowpass', 600, 600, 0.25, 0.45, 0.2)
}

export function guardDrop(mix: AudioMix, weight: number): void {
  const ctx = mix.ctx
  if (!ctx || !mix.enabled) return
  const t = ctx.currentTime + 0.005
  const bus = voice(mix, 0.16 * weight, 0.5, 1)
  noise(ctx, mix.tex.roar, bus, t, 0.5, 'lowpass', 500, 500, 0.02, 0.4)
  noise(ctx, mix.tex.brown, bus, t, 0.45, 'lowpass', 140, 140, 0.02, 0.5)
}

export function guardBlocked(mix: AudioMix, strength: number, distance: number): void {
  const ctx = mix.ctx
  if (!ctx || !mix.enabled) return
  const t = ctx.currentTime + 0.005 + distance / 343
  const g = Math.min(1.2, strength) / (1 + distance * 0.05)
  const bus = voice(mix, 0.5 * g, 0.55, 1.4)
  noise(ctx, mix.tex.brown, bus, t, 0.45, 'lowpass', 130, 130, 0.004, 1.0)
  noise(ctx, mix.tex.crackle, bus, t, 0.28, 'highpass', 1400, 1400, 0.003, 0.5)
  noise(ctx, mix.tex.roar, bus, t + 0.01, 0.6, 'lowpass', 900, 900, 0.01, 0.35)
  noise(ctx, mix.tex.white, bus, t, 0.3, 'highpass', 2800, 2800, 0.004, 0.05)
}

export function armourStruck(mix: AudioMix, strength: number, distance: number): void {
  const ctx = mix.ctx
  if (!ctx || !mix.enabled) return
  const t = ctx.currentTime + 0.005 + distance / 343
  const g = Math.min(1.2, strength) / (1 + distance * 0.05)
  const bus = voice(mix, 0.42 * g, 0.45, 1.2)
  noise(ctx, mix.tex.crackle, bus, t, 0.32, 'bandpass', 2400, 2400, 0.006, 0.4, 0.3, 0.35)
  noise(ctx, mix.tex.white, bus, t, 0.28, 'highpass', 2600, 2600, 0.006, 0.1, 0.3)
  noise(ctx, mix.tex.brown, bus, t, 0.3, 'lowpass', 160, 160, 0.004, 0.7)
}
