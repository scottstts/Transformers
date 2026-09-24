import type { AudioMix } from '../../../audio/mix'

/** A robot's foot on sand, tuned to its mass. */
export interface FootfallTuning {
  /** ground-pressure sine: start and end pitch (Hz) of the drop */
  subHz: [number, number]
  /** lowpass of the ground thump (Hz) */
  thumpHz: number
  /** gravel crunch band (Hz): lower bound and spread */
  crunchHz: [number, number]
  /** damper exhale band (Hz); the foot's hydraulic damper venting */
  exhaleHz: number
  /** voice gain before the dry mix and reverb send */
  level: number
}

/** A multi-tonne foot: ground thump, sub pressure, gravel crunch and damper exhale. */
export const HEAVY_FOOT: FootfallTuning = {
  subHz: [64, 34],
  thumpHz: 380,
  crunchHz: [1400, 2600],
  exhaleHz: 2400,
  level: 0.4,
}

/** One footfall on the shared mix; nothing persists between steps. */
export function footfall(mix: AudioMix, tuning: FootfallTuning, strength = 1): void {
  const ctx = mix.ctx
  if (!ctx || !mix.enabled) return
  const out = mix.output
  const tex = mix.tex
  const t = ctx.currentTime + 0.01
  const g = 0.5 * strength
  const bus = ctx.createGain()
  bus.gain.value = tuning.level
  bus.connect(out.dry)
  const send = ctx.createGain()
  send.gain.value = 0.35
  bus.connect(send).connect(out.send)
  // ground pressure: sub sine drop + lowpassed brown burst
  const o = ctx.createOscillator()
  o.frequency.setValueAtTime(tuning.subHz[0], t)
  o.frequency.exponentialRampToValueAtTime(tuning.subHz[1], t + 0.35)
  const og = ctx.createGain()
  og.gain.setValueAtTime(g, t)
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
  o.connect(og).connect(bus)
  o.start(t)
  o.stop(t + 0.55)
  shot(ctx, tex.brown, t, 0.32, bus, 'lowpass', tuning.thumpHz, g * 0.9)
  // gravel crunch: a few dense grains of filtered chatter
  for (let i = 0; i < 6; i++) {
    shot(ctx, tex.chatter, t + Math.pow(Math.random(), 1.8) * 0.16, 0.05 + Math.random() * 0.05, bus, 'bandpass',
      tuning.crunchHz[0] + Math.random() * tuning.crunchHz[1], g * 0.18)
  }
  // damper exhale
  shot(ctx, tex.white, t + 0.05, 0.22, bus, 'bandpass', tuning.exhaleHz, g * 0.05)
  setTimeout(() => { bus.disconnect(); send.disconnect() }, 1200)
}

function shot(ctx: AudioContext, buf: AudioBuffer, t: number, dur: number, dest: AudioNode, type: BiquadFilterType, f: number, gain: number): void {
  const src = ctx.createBufferSource()
  src.buffer = buf
  const fl = ctx.createBiquadFilter()
  fl.type = type
  fl.frequency.value = f
  const g = ctx.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(fl).connect(g).connect(dest)
  src.start(t, Math.random() * (buf.duration - dur - 0.05))
  src.stop(t + dur + 0.02)
}
