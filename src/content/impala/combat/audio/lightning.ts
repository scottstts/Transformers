import type { AudioMix } from '../../../../audio/mix'
import { noise, voice } from '../../../transformer/combat/audio/shots'

/** Speed of sound (m/s): thunder from a strike arrives late by its distance. */
const SOUND_SPEED = 343

/**
 * A lightning strike as it is heard close by, built from what happens in the
 * channel rather than a designed "zap": the return stroke's snap (a sharp
 * broadband impulse: the channel heats to tens of thousands of kelvin in
 * microseconds and its air expands supersonically), the tearing rip of the
 * channel's many kinks arriving a few milliseconds apart, then the thunder:
 * a low roll of the longer channel's pressure arriving over a second or two,
 * swelling a time or two as farther stretches of it are heard, dulled by
 * distance. `strength` 0..1+; `distance` from the listener (m).
 */
export function lightningStrike(mix: AudioMix, strength: number, distance: number): void {
  const ctx = mix.ctx
  if (!ctx || !mix.enabled) return
  const g = Math.min(1.4, strength)
  const t = ctx.currentTime + 0.004 + distance / SOUND_SPEED
  const air = Math.max(2400, 14000 - distance * 160)
  const bus = voice(mix, 0.42, 0.75, 4.5)
  const dry = ctx.createBiquadFilter()
  dry.type = 'lowpass'
  dry.frequency.value = air
  dry.Q.value = 0.5
  dry.connect(bus)
  // the return stroke's snap, then the channel's rip: crackle shocks a few ms apart
  noise(ctx, mix.tex.white, dry, t, 0.035, 'highpass', 700, 700, 0.0005, 0.9 * g)
  noise(ctx, mix.tex.crackle, dry, t + 0.002, 0.16, 'highpass', 1100, 1100, 0.001, 0.75 * g, 0.25)
  noise(ctx, mix.tex.white, dry, t + 0.004, 0.09, 'bandpass', 3200, 3200, 0.002, 0.3 * g, 0.2, 0.6)
  // the thunder: the near channel's crack-boom, then the rolling of the rest of it
  noise(ctx, mix.tex.brown, dry, t + 0.01, 0.5, 'lowpass', 520, 520, 0.006, 0.9 * g, 0.1)
  noise(ctx, mix.tex.roar, dry, t + 0.06, 2.2, 'lowpass', 300, 300, 0.12, 0.45 * g, 0.25)
  for (let k = 0; k < 2; k++) {
    const at = t + 0.35 + k * (0.4 + Math.random() * 0.5)
    noise(ctx, mix.tex.brown, dry, at, 0.9, 'lowpass', 210, 210, 0.08, 0.38 * g * (1 - k * 0.3), 0.2)
  }
}

/**
 * The discharge spreading over the ground and feeding the bodies it reaches:
 * the dense crackle of many small arcs and the hiss of the ionised air (an
 * arc's sound is broadband shocks, not a tone), with a low rumble of the
 * ground's own arcing under it. Level set every frame (0..1); built once on
 * first use, silent between strikes.
 */
export class ArcVoice {
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
    // the arcs come and go in bursts: the level flickers with them
    const flicker = level > 0 ? 0.7 + 0.3 * Math.random() : 0
    g.gain.gain.setTargetAtTime(this.mix.enabled ? 0.3 * Math.min(1.2, level) * flicker : 0, ctx.currentTime, 0.02)
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
    send.gain.value = 0.45
    out.connect(send).connect(this.mix.output.send)
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.connect(out)
    const loop = (buffer: AudioBuffer, type: BiquadFilterType, f: number, level: number, q = 0.5): AudioBufferSourceNode => {
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.loop = true
      const fl = ctx.createBiquadFilter()
      fl.type = type
      fl.frequency.value = f
      fl.Q.value = q
      const g = ctx.createGain()
      g.gain.value = level
      src.connect(fl).connect(g).connect(gain)
      src.start(0, Math.random() * buffer.duration)
      return src
    }
    const loops = [
      loop(this.mix.tex.crackle, 'highpass', 1800, 1),
      loop(this.mix.tex.chatter, 'highpass', 2600, 0.5),
      loop(this.mix.tex.white, 'bandpass', 5200, 0.07, 0.7),
      loop(this.mix.tex.brown, 'lowpass', 140, 0.45),
    ]
    this.graph = { gain, loops, out }
    return this.graph
  }
}
