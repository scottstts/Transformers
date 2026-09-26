import type { AudioMix } from '../../audio/mix'
import { noise, voice } from '../transformer/combat/audio/shots'
import type { HitKind } from '../transformer/combat/hits'

/**
 * The garrison's sound: small machines, heard under the robot's own. A horde
 * must not cost a voice per soldier, and a crowd of identical loops reads as
 * synthetic, so the continuous sounds are two shared voices whose levels
 * follow the whole horde's activity (distance-weighted, saturating: thirty
 * soldiers are barely louder than five):
 *
 *   wheels  hard little tyres over sand: a soft granular crunch and a faint
 *           low body, nothing more
 *   blades  the energy blades: a faint electrical crackle and a thin hiss,
 *           heard only near them
 *
 * Events are one-shots built from what physically happens:
 *
 *   swing   the blade swishing through air: a short soft broadband rush
 *   impact  a blow into a light steel body: a dull knock and the plate
 *           buckling (crackle); a cut adds the hot shear hiss
 *   breakup the body coming apart: a crunching tear, then the parts dropping
 *           into the sand
 *   ignite  a blade lighting: a crackle and a thin hiss
 *
 * Nothing is pitched and no filter moves (fixed, wide filters, level
 * envelopes only). No `roar` texture: it is a jet's roar, and a horde of it
 * sounded like a turbine next to the player. No `chatter` either: its tuned
 * clicks read as robot babble.
 *
 * Distance delays (343 m/s) and dulls every event.
 */
export class SoldierAudio {
  private readonly mix: AudioMix
  private wheels: { crunch: GainNode; body: GainNode } | null = null
  private blades: GainNode | null = null
  private eventsThisFrame = 0

  constructor(mix: AudioMix) {
    this.mix = mix
  }

  /**
   * Per frame: `rolling` (sum of speed / distance terms, ~1 is one soldier
   * charging close by), `lit` (lit blades weighted by distance).
   */
  update(rolling: number, lit: number): void {
    this.eventsThisFrame = 0
    const ctx = this.mix.ctx
    if (!ctx) return
    if (!this.wheels) this.build(ctx)
    const t = ctx.currentTime
    const w = this.wheels!
    // saturating: a crowd is a denser texture, not a louder one
    const roll = rolling / (1 + rolling)
    w.crunch.gain.setTargetAtTime(0.035 * roll, t, 0.1)
    w.body.gain.setTargetAtTime(0.045 * roll, t, 0.1)
    this.blades!.gain.setTargetAtTime(0.03 * (lit / (1 + lit)), t, 0.2)
  }

  private build(ctx: AudioContext): void {
    const out = this.mix.output
    const loop = (buffer: AudioBuffer, type: BiquadFilterType, f: number, q: number, dest: AudioNode | null = null): GainNode => {
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.loop = true
      const filter = ctx.createBiquadFilter()
      filter.type = type
      filter.frequency.value = f
      filter.Q.value = q
      const gain = ctx.createGain()
      gain.gain.value = 0
      src.connect(filter).connect(gain)
      if (dest) gain.connect(dest)
      else {
        gain.connect(out.dry)
        const send = ctx.createGain()
        send.gain.value = 0.12
        gain.connect(send).connect(out.send)
      }
      src.start(ctx.currentTime, Math.random() * buffer.duration)
      return gain
    }
    const crunch = loop(this.mix.tex.crackle, 'bandpass', 1500, 0.35)
    const body = loop(this.mix.tex.brown, 'lowpass', 140, 0.5)
    this.wheels = { crunch, body }
    const blades = loop(this.mix.tex.crackle, 'highpass', 3000, 0.5)
    const hiss = loop(this.mix.tex.white, 'highpass', 5500, 0.5, blades)
    hiss.gain.value = 0.25
    this.blades = blades
  }

  swing(distance: number): void {
    const ctx = this.event(distance)
    if (!ctx) return
    const { t, g } = ctx
    const c = this.mix.ctx!
    const bus = voice(this.mix, 0.09 * g, 0.2, 0.8)
    noise(c, this.mix.tex.white, bus, t, 0.22, 'bandpass', 1100, 1100, 0.07, 0.6, 0, 0.4)
    noise(c, this.mix.tex.crackle, bus, t + 0.03, 0.18, 'highpass', 3000, 3000, 0.04, 0.3)
  }

  impact(kind: HitKind, strength: number, distance: number): void {
    const ctx = this.event(distance)
    if (!ctx) return
    const { t, g } = ctx
    const k = Math.min(1.3, strength) * g
    const c = this.mix.ctx!
    const bus = voice(this.mix, 0.28 * k, 0.3, 1)
    noise(c, this.mix.tex.brown, bus, t, 0.22, 'lowpass', 220, 220, 0.003, 0.7)
    noise(c, this.mix.tex.crackle, bus, t, 0.22, 'bandpass', 1800, 1800, 0.002, 0.45, 0.1, 0.35)
    if (kind === 'cut') {
      noise(c, this.mix.tex.white, bus, t, 0.3, 'highpass', 3200, 3200, 0.004, 0.08, 0.2)
      noise(c, this.mix.tex.crackle, bus, t, 0.25, 'highpass', 2600, 2600, 0.003, 0.25)
    }
  }

  breakup(strength: number, distance: number): void {
    const ctx = this.event(distance)
    if (!ctx) return
    const { t, g } = ctx
    const k = Math.min(1.4, strength) * g
    const c = this.mix.ctx!
    const bus = voice(this.mix, 0.26 * k, 0.3, 2.2)
    noise(c, this.mix.tex.brown, bus, t, 0.35, 'lowpass', 200, 200, 0.003, 0.8)
    noise(c, this.mix.tex.crackle, bus, t, 0.45, 'bandpass', 1500, 1500, 0.003, 0.5, 0.15, 0.35)
    // the parts dropping into the sand: soft thuds, each with a puff of grit
    for (let i = 0; i < 6; i++) {
      const at = t + 0.3 + Math.pow(Math.random(), 0.8) * 1.0
      noise(c, this.mix.tex.brown, bus, at, 0.1, 'lowpass', 260, 260, 0.003, 0.35 * (1 - (at - t) * 0.4))
      noise(c, this.mix.tex.white, bus, at, 0.07, 'bandpass', 2200, 2200, 0.003, 0.03, 0, 0.35)
    }
  }

  ignite(distance: number): void {
    const ctx = this.event(distance)
    if (!ctx) return
    const { t, g } = ctx
    const c = this.mix.ctx!
    const bus = voice(this.mix, 0.08 * g, 0.2, 0.8)
    noise(c, this.mix.tex.crackle, bus, t, 0.3, 'highpass', 2800, 2800, 0.02, 0.5)
    noise(c, this.mix.tex.white, bus, t, 0.35, 'highpass', 5000, 5000, 0.05, 0.12, 0.2)
  }

  /** Timing and level for an event at `distance` m; null once the frame has enough events. */
  private event(distance: number): { t: number; g: number } | null {
    const ctx = this.mix.ctx
    if (!ctx || !this.mix.enabled || this.eventsThisFrame >= 4) return null
    this.eventsThisFrame++
    return { t: ctx.currentTime + 0.005 + distance / 343, g: 1 / (1 + distance * 0.08) }
  }
}
