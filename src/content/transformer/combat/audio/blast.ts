import type { AudioMix } from '../../../../audio/mix'
import { noise, voice } from './shots'

/** Speed of sound (m/s): a blast heard from a distance arrives late. */
const SOUND_SPEED = 343

/** How an explosion sounds from where the camera stands. */
export interface ExplosionTuning {
  /** 0..1+ the blast's size (1: a full special) */
  strength: number
  /** metres from the listener: the sound arrives distance / 343 s after the flash, and the air takes its top off */
  distance: number
  /** pitch of the ground's pressure wave at its start (Hz) */
  subHz?: number
  /** how much is thrown up to rain back down (0..1) */
  debris?: number
}

/**
 * A blast as a recording of one sounds, built from its physics rather than a
 * designed "hit": arriving late by the distance it travels, the shock front's
 * crack (softened by the air in between), the boom of the fireball, the sub
 * pressure felt as much as heard, a long rolling tail as the sound comes back
 * off the land around, and the sand and crust raining back down.
 */
export function explosion(mix: AudioMix, tuning: ExplosionTuning): void {
  const ctx = mix.ctx
  if (!ctx || !mix.enabled) return
  const g = Math.min(1.5, tuning.strength)
  const t = ctx.currentTime + 0.005 + tuning.distance / SOUND_SPEED
  const air = Math.max(1800, 9000 - tuning.distance * 90)
  const bus = voice(mix, 0.62, 0.9, 7)
  const dry = ctx.createBiquadFilter()
  dry.type = 'lowpass'
  dry.frequency.value = air
  dry.Q.value = 0.5
  dry.connect(bus)
  // the crack of the front
  noise(ctx, mix.tex.white, dry, t, 0.14, 'lowpass', air, air * 0.4, 0.002, 0.55 * g)
  noise(ctx, mix.tex.crackle, dry, t, 0.3, 'highpass', 900, 900, 0.004, 0.3 * g)
  // the fireball's boom and the ground's pressure
  const sub = tuning.subHz ?? 42
  const o = ctx.createOscillator()
  o.frequency.setValueAtTime(sub, t)
  o.frequency.exponentialRampToValueAtTime(sub * 0.42, t + 2.2)
  const og = ctx.createGain()
  og.gain.setValueAtTime(0.0001, t)
  og.gain.exponentialRampToValueAtTime(1.1 * g, t + 0.02)
  og.gain.exponentialRampToValueAtTime(0.0001, t + 2.6)
  o.connect(og).connect(bus)
  o.start(t)
  o.stop(t + 2.7)
  noise(ctx, mix.tex.brown, dry, t, 1.6, 'lowpass', 320, 70, 0.006, 1.2 * g, 0.15)
  noise(ctx, mix.tex.roar, dry, t + 0.01, 1.1, 'bandpass', 260, 140, 0.02, 0.6 * g, 0.2)
  // the rolling tail: the blast coming back off the land, low and long
  noise(ctx, mix.tex.roar, dry, t + 0.25, 4.2, 'lowpass', 240, 110, 0.4, 0.55 * g, 0.3)
  noise(ctx, mix.tex.brown, dry, t + 0.4, 3.8, 'lowpass', 150, 60, 0.6, 0.5 * g, 0.2)
  // sand hissing down, and crust and stones landing
  const debris = tuning.debris ?? 1
  if (debris > 0) {
    noise(ctx, mix.tex.white, dry, t + 0.3, 3, 'bandpass', 1700, 1100, 0.5, 0.07 * g * debris, 0.35)
    for (let i = 0; i < 26; i++) {
      const at = t + 0.45 + Math.pow(Math.random(), 1.3) * 2.8
      noise(ctx, mix.tex.chatter, dry, at, 0.06 + Math.random() * 0.12, 'bandpass', 900 + Math.random() * 1900, 1100, 0.003, 0.1 * g * debris * (1.2 - (at - t) * 0.3))
    }
    for (let i = 0; i < 7; i++) {
      // heavier slabs: a dull thud each
      const at = t + 0.8 + Math.random() * 1.9
      noise(ctx, mix.tex.brown, dry, at, 0.22, 'lowpass', 420, 200, 0.004, 0.25 * g * debris)
    }
  }
}

/**
 * Something big passing close and fast (m/s): a broadband rush that swells as
 * it comes and falls away behind it, brighter as it nears (less air in
 * between). Fixed, gentle filters: its level does the work.
 */
export function passBy(mix: AudioMix, speed: number, seconds = 0.5): void {
  const ctx = mix.ctx
  if (!ctx || !mix.enabled) return
  const t = ctx.currentTime + 0.005
  const g = Math.min(1.2, speed / 50)
  const bus = voice(mix, 0.5, 0.35, seconds + 1)
  const rise = seconds * 0.55
  const src = ctx.createBufferSource()
  src.buffer = mix.tex.roar
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.Q.value = 0.5
  lp.frequency.setValueAtTime(900, t)
  lp.frequency.linearRampToValueAtTime(4200, t + rise)
  lp.frequency.linearRampToValueAtTime(700, t + seconds)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.7 * g, t + rise)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds)
  src.connect(lp).connect(gain).connect(bus)
  src.start(t, Math.random() * 3)
  src.stop(t + seconds + 0.05)
  noise(ctx, mix.tex.brown, bus, t + rise * 0.8, seconds * 0.6, 'lowpass', 220, 120, 0.03, 0.5 * g)
}

/** A blade's tip dragged through the sand for a stretch: the gritty hiss of it and grains rattling off. */
export function sandScrape(mix: AudioMix, strength: number): void {
  const ctx = mix.ctx
  if (!ctx || !mix.enabled) return
  const t = ctx.currentTime + 0.005
  const bus = voice(mix, 0.22 * Math.min(1.2, strength), 0.3, 0.6)
  noise(ctx, mix.tex.white, bus, t, 0.16, 'bandpass', 1900, 1900, 0.01, 0.35, 0.4)
  noise(ctx, mix.tex.brown, bus, t, 0.14, 'lowpass', 300, 300, 0.01, 0.4)
  for (let i = 0; i < 3; i++) noise(ctx, mix.tex.chatter, bus, t + Math.random() * 0.12, 0.06, 'bandpass', 1600 + Math.random() * 1600, 1400, 0.002, 0.25)
}

/** Glass cooling fast: fine ticks of thermal cracking and a faint hiss, for `seconds`. */
export function sizzle(mix: AudioMix, seconds: number, level = 1): void {
  const ctx = mix.ctx
  if (!ctx || !mix.enabled) return
  const t = ctx.currentTime + 0.005
  const bus = voice(mix, 0.12 * level, 0.5, seconds + 1)
  noise(ctx, mix.tex.crackle, bus, t, seconds, 'highpass', 2800, 2800, 0.2, 0.45, 0.25)
  noise(ctx, mix.tex.white, bus, t, seconds * 0.8, 'bandpass', 5200, 3600, 0.1, 0.05, 0.2)
  for (let i = 0; i < 18; i++) {
    const at = t + Math.pow(Math.random(), 1.6) * seconds
    noise(ctx, mix.tex.chatter, bus, at, 0.03, 'highpass', 3500, 3500, 0.001, 0.25 * (1 - (at - t) / seconds))
  }
}

/**
 * Fire burning in the open: a low turbulent roar with its crackle, level set
 * every frame (0..1). Built once on first use; silent between fires.
 */
export class FireVoice {
  private readonly mix: AudioMix
  private graph: { gain: GainNode; loops: AudioBufferSourceNode[]; out: GainNode } | null = null

  constructor(mix: AudioMix) {
    this.mix = mix
  }

  update(level: number): void {
    const ctx = this.mix.ctx
    if (!ctx) return
    if (!this.graph && level <= 0) return
    const g = this.graph ?? this.build(ctx)
    g.gain.gain.setTargetAtTime(this.mix.enabled ? 0.34 * Math.min(1, level) : 0, ctx.currentTime, 0.08)
  }

  dispose(): void {
    if (!this.graph) return
    for (const l of this.graph.loops) l.stop()
    this.graph.out.disconnect()
    this.graph = null
  }

  private build(ctx: AudioContext) {
    const out = ctx.createGain()
    out.connect(this.mix.output.dry)
    const send = ctx.createGain()
    send.gain.value = 0.5
    out.connect(send).connect(this.mix.output.send)
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.connect(out)
    const loop = (buffer: AudioBuffer, type: BiquadFilterType, f: number, level: number): AudioBufferSourceNode => {
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.loop = true
      const fl = ctx.createBiquadFilter()
      fl.type = type
      fl.frequency.value = f
      fl.Q.value = 0.5
      const g = ctx.createGain()
      g.gain.value = level
      src.connect(fl).connect(g).connect(gain)
      src.start(0, Math.random() * buffer.duration)
      return src
    }
    const loops = [
      loop(this.mix.tex.roar, 'lowpass', 520, 1),
      loop(this.mix.tex.brown, 'lowpass', 160, 0.8),
      loop(this.mix.tex.crackle, 'highpass', 1400, 0.35),
    ]
    this.graph = { gain, loops, out }
    return this.graph
  }
}
