import type { AudioMix } from '../../../../audio/mix'

/**
 * One-shot fighting sounds on the shared mix, each built from the physical
 * event rather than a designed "hit": nothing here is a percussive novelty.
 *
 *   slam     a heavy blow driven into the sand: the ground's sub pressure, a
 *            deep thump, the sand thrown up hissing and the clods raining back
 *   forge    a weapon forming in the hand: the roaring hiss of hot gas (a
 *            plasma torch for the truck, hot metal for the racer) with its
 *            crackle, swelling as the front runs out along the weapon
 *   dissolve the same, falling away as the weapon goes back into the hand
 *
 * Nothing persists between shots; each builds a few nodes that stop by
 * themselves.
 */
export interface ForgeTuning {
  /** hiss band sweep (Hz) over the forming */
  from: number
  to: number
  /** crackle highpass (Hz): higher is a finer, electrical crackle */
  crackleHz: number
  level: number
}

/** A blow into the sand, `strength` 0..1+ (a heavy axe slam is ~1). */
export function slam(mix: AudioMix, strength: number, subHz = 48): void {
  const ctx = mix.ctx
  if (!ctx || !mix.enabled) return
  const t = ctx.currentTime + 0.005
  const bus = voice(mix, 0.55, 0.6, 3)
  const g = Math.min(1.4, strength)
  // ground pressure
  const o = ctx.createOscillator()
  o.frequency.setValueAtTime(subHz, t)
  o.frequency.exponentialRampToValueAtTime(subHz * 0.5, t + 0.7)
  const og = ctx.createGain()
  og.gain.setValueAtTime(0.0001, t)
  og.gain.exponentialRampToValueAtTime(0.9 * g, t + 0.012)
  og.gain.exponentialRampToValueAtTime(0.0001, t + 1.1)
  o.connect(og).connect(bus)
  o.start(t)
  o.stop(t + 1.15)
  // body of the impact, then the sand thrown up and falling back
  noise(ctx, mix.tex.brown, bus, t, 0.6, 'lowpass', 280, 120, 0.004, 0.9 * g)
  noise(ctx, mix.tex.white, bus, t + 0.02, 1.4, 'bandpass', 1500, 900, 0.04, 0.09 * g, 0.7)
  noise(ctx, mix.tex.roar, bus, t, 0.9, 'bandpass', 420, 180, 0.01, 0.35 * g, 0.9)
  for (let i = 0; i < 9; i++) {
    const at = t + 0.25 + Math.pow(Math.random(), 1.4) * 1.1
    noise(ctx, mix.tex.crackle, bus, at, 0.08 + Math.random() * 0.1, 'bandpass', 1600, 1600, 0.003, 0.09 * g * (1 - (at - t) * 0.5), 0, 0.35)
  }
}

/** A weapon forming over `seconds`. */
export function forge(mix: AudioMix, tuning: ForgeTuning, seconds: number): void {
  const ctx = mix.ctx
  if (!ctx || !mix.enabled) return
  const t = ctx.currentTime + 0.005
  const bus = voice(mix, tuning.level, 0.45, seconds + 1)
  noise(ctx, mix.tex.roar, bus, t, seconds + 0.35, 'bandpass', tuning.from, tuning.to, seconds * 0.7, 0.5, 0.8)
  noise(ctx, mix.tex.crackle, bus, t + 0.03, seconds + 0.2, 'highpass', tuning.crackleHz, tuning.crackleHz, seconds * 0.5, 0.35)
  noise(ctx, mix.tex.brown, bus, t, 0.45, 'lowpass', 200, 90, 0.02, 0.35)
}

/** A weapon dissolving over `seconds`. */
export function dissolve(mix: AudioMix, tuning: ForgeTuning, seconds: number): void {
  const ctx = mix.ctx
  if (!ctx || !mix.enabled) return
  const t = ctx.currentTime + 0.005
  const bus = voice(mix, tuning.level * 0.7, 0.45, seconds + 1)
  noise(ctx, mix.tex.roar, bus, t, seconds + 0.3, 'bandpass', tuning.to, tuning.from, 0.05, 0.4, 1.2)
  noise(ctx, mix.tex.crackle, bus, t, seconds, 'highpass', tuning.crackleHz, tuning.crackleHz, 0.05, 0.3, 1.2)
}

/** A voice bus into the mix (dry and reverb) that disconnects itself after `seconds`. */
export function voice(mix: AudioMix, level: number, send: number, seconds: number): GainNode {
  const ctx = mix.ctx as AudioContext
  const bus = ctx.createGain()
  bus.gain.value = level
  bus.connect(mix.output.dry)
  const s = ctx.createGain()
  s.gain.value = send
  bus.connect(s).connect(mix.output.send)
  setTimeout(() => { bus.disconnect(); s.disconnect() }, (seconds + 0.5) * 1000)
  return bus
}

/**
 * A stretch of a noise texture through a filter sweeping f0 -> f1, with an
 * attack of `attack` s up to `gain` and an exponential fall to the end
 * (`hold` 0..1 keeps it up for that share first). `q` overrides the filter's
 * Q. A band of noise swept in frequency reads as a synthesized "whoop"
 * (players heard the soldiers' swept bands as beeps), so short events keep
 * f0 = f1 and a wide band.
 */
export function noise(ctx: AudioContext, buffer: AudioBuffer, dest: AudioNode, t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, attack: number, gain: number, hold = 0, q = type === 'bandpass' ? 0.8 : 0.5): void {
  const src = ctx.createBufferSource()
  src.buffer = buffer
  const fl = ctx.createBiquadFilter()
  fl.type = type
  fl.Q.value = q
  fl.frequency.setValueAtTime(f0, t)
  fl.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + Math.max(0.002, attack))
  const fallFrom = t + attack + (dur - attack) * hold
  g.gain.setValueAtTime(gain, fallFrom)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(fl).connect(g).connect(dest)
  src.start(t, Math.random() * Math.max(0, buffer.duration - dur - 0.05))
  src.stop(t + dur + 0.02)
}
