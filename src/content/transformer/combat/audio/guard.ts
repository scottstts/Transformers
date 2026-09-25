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
 *   struck  a blade raking armour unguarded: a harsh steel scrape falling
 *           in pitch as it drags, grit, and the dull knock of the body taking it
 */
export function guardRaise(mix: AudioMix, weight: number): void {
  const ctx = mix.ctx
  if (!ctx || !mix.enabled) return
  const t = ctx.currentTime + 0.005
  const bus = voice(mix, 0.22 * weight, 0.5, 1.2)
  noise(ctx, mix.tex.brown, bus, t, 0.7, 'lowpass', 90, 220, 0.18, 0.8, 0.3)
  noise(ctx, mix.tex.roar, bus, t, 0.8, 'bandpass', 260, 700, 0.25, 0.4, 0.2)
}

export function guardDrop(mix: AudioMix, weight: number): void {
  const ctx = mix.ctx
  if (!ctx || !mix.enabled) return
  const t = ctx.currentTime + 0.005
  const bus = voice(mix, 0.16 * weight, 0.5, 1)
  noise(ctx, mix.tex.roar, bus, t, 0.5, 'bandpass', 600, 200, 0.02, 0.4)
  noise(ctx, mix.tex.brown, bus, t, 0.45, 'lowpass', 180, 70, 0.02, 0.5)
}

export function guardBlocked(mix: AudioMix, strength: number, distance: number): void {
  const ctx = mix.ctx
  if (!ctx || !mix.enabled) return
  const t = ctx.currentTime + 0.005 + distance / 343
  const g = Math.min(1.2, strength) / (1 + distance * 0.05)
  const bus = voice(mix, 0.5 * g, 0.55, 1.4)
  noise(ctx, mix.tex.brown, bus, t, 0.45, 'lowpass', 160, 60, 0.004, 1.0)
  noise(ctx, mix.tex.crackle, bus, t, 0.28, 'highpass', 1600, 900, 0.003, 0.5)
  noise(ctx, mix.tex.roar, bus, t + 0.01, 0.6, 'bandpass', 900, 300, 0.01, 0.35)
  noise(ctx, mix.tex.white, bus, t, 0.35, 'bandpass', 3500, 1800, 0.004, 0.06)
}

export function armourStruck(mix: AudioMix, strength: number, distance: number): void {
  const ctx = mix.ctx
  if (!ctx || !mix.enabled) return
  const t = ctx.currentTime + 0.005 + distance / 343
  const g = Math.min(1.2, strength) / (1 + distance * 0.05)
  const bus = voice(mix, 0.42 * g, 0.45, 1.2)
  noise(ctx, mix.tex.white, bus, t, 0.32, 'bandpass', 2600, 1300, 0.006, 0.18, 0.3)
  noise(ctx, mix.tex.chatter, bus, t, 0.25, 'bandpass', 3000, 2200, 0.004, 0.2)
  noise(ctx, mix.tex.brown, bus, t, 0.3, 'lowpass', 220, 90, 0.004, 0.7)
  noise(ctx, mix.tex.crackle, bus, t + 0.02, 0.2, 'highpass', 2400, 2400, 0.005, 0.15)
}
