import type { AudioMix } from '../../audio/mix'
import { noise, voice } from '../transformer/combat/audio/shots'
import type { HitKind } from '../transformer/combat/hits'

/**
 * The garrison's sound. A horde must not cost a voice per soldier, and a
 * crowd of identical loops reads as synthetic, so the continuous sounds are
 * two shared voices whose levels follow the whole horde's activity
 * (distance-weighted), with slow random drift:
 *
 *   wheels  hard tyres grinding over sand: a low rumble plus the grit
 *           crackling under the tread, louder and brighter with speed
 *   blades  the energy blades: a plasma torch's roaring hiss with its
 *           crackle, from every lit blade near the listener
 *
 * Events are one-shots built from what physically happens (no tonal "hit"
 * sounds, nothing percussive for its own sake):
 *
 *   swing   the blade cutting air: a roar sweep with the plasma flaring
 *   impact  a blow into a steel body: the body's deep knock, plate crumpling
 *           (filtered crash noise, no ring), grit; a cut adds the hot shear hiss
 *   breakup the body coming apart: a crunching tear, arc crackle, then the
 *           parts thudding into the sand one after another
 *   ignite  a blade lighting: a hiss swelling through its crackle
 *
 * Distance delays (343 m/s) and dulls every event.
 */
export class SoldierAudio {
  private readonly mix: AudioMix
  private wheels: { gain: GainNode; filter: BiquadFilterNode; grit: GainNode } | null = null
  private blades: { gain: GainNode; filter: BiquadFilterNode } | null = null
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
    const w = this.wheels!, b = this.blades!
    const roll = Math.min(1.4, rolling)
    w.gain.gain.setTargetAtTime(0.32 * Math.sqrt(roll), t, 0.08)
    w.grit.gain.setTargetAtTime(0.16 * roll, t, 0.08)
    w.filter.frequency.setTargetAtTime(160 + 260 * Math.min(1, roll), t, 0.12)
    const blade = Math.min(1.5, lit)
    b.gain.gain.setTargetAtTime(0.1 * Math.sqrt(blade), t, 0.15)
    b.filter.frequency.setTargetAtTime(900 + 300 * Math.min(1, blade), t, 0.3)
  }

  private build(ctx: AudioContext): void {
    const out = this.mix.output
    const loop = (buffer: AudioBuffer, type: BiquadFilterType, f: number, q: number): { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } => {
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
      gain.connect(out.dry)
      const send = ctx.createGain()
      send.gain.value = 0.35
      gain.connect(send).connect(out.send)
      src.start(ctx.currentTime, Math.random() * buffer.duration)
      return { src, filter, gain }
    }
    const rumble = loop(this.mix.tex.brown, 'lowpass', 220, 0.5)
    const grit = loop(this.mix.tex.chatter, 'bandpass', 1800, 0.5)
    this.wheels = { gain: rumble.gain, filter: rumble.filter, grit: grit.gain }
    const plasma = loop(this.mix.tex.roar, 'bandpass', 1000, 0.6)
    const crackle = loop(this.mix.tex.crackle, 'highpass', 2200, 0.5)
    crackle.gain.disconnect()
    crackle.gain.connect(plasma.gain)
    crackle.gain.gain.value = 0.35
    this.blades = { gain: plasma.gain, filter: plasma.filter }
  }

  swing(distance: number): void {
    const ctx = this.event(distance)
    if (!ctx) return
    const { t, g } = ctx
    const bus = voice(this.mix, 0.3 * g, 0.4, 1)
    noise(this.mix.ctx!, this.mix.tex.roar, bus, t, 0.32, 'bandpass', 500, 1400, 0.1, 0.6)
    noise(this.mix.ctx!, this.mix.tex.crackle, bus, t + 0.05, 0.25, 'highpass', 2400, 2400, 0.06, 0.25)
  }

  impact(kind: HitKind, strength: number, distance: number): void {
    const ctx = this.event(distance)
    if (!ctx) return
    const { t, g } = ctx
    const k = Math.min(1.3, strength) * g
    const c = this.mix.ctx!
    const bus = voice(this.mix, 0.5 * k, 0.5, 1.4)
    noise(c, this.mix.tex.brown, bus, t, 0.4, 'lowpass', 190, 70, 0.004, 1.0)
    noise(c, this.mix.tex.white, bus, t, 0.3, 'bandpass', 1300, 600, 0.004, 0.14, 0.2)
    noise(c, this.mix.tex.chatter, bus, t + 0.01, 0.35, 'bandpass', 2200, 1400, 0.005, 0.18)
    if (kind === 'cut') {
      noise(c, this.mix.tex.roar, bus, t, 0.45, 'bandpass', 2400, 900, 0.005, 0.35)
      noise(c, this.mix.tex.crackle, bus, t, 0.35, 'highpass', 2000, 2000, 0.003, 0.3)
    }
  }

  breakup(strength: number, distance: number): void {
    const ctx = this.event(distance)
    if (!ctx) return
    const { t, g } = ctx
    const k = Math.min(1.4, strength) * g
    const c = this.mix.ctx!
    const bus = voice(this.mix, 0.45 * k, 0.55, 2.6)
    noise(c, this.mix.tex.brown, bus, t, 0.6, 'lowpass', 240, 60, 0.003, 1.0)
    noise(c, this.mix.tex.white, bus, t, 0.5, 'bandpass', 1800, 500, 0.003, 0.2, 0.15)
    noise(c, this.mix.tex.crackle, bus, t, 0.55, 'highpass', 1800, 1200, 0.004, 0.35)
    // the parts landing: dull thuds in the sand, a scatter of grit
    for (let i = 0; i < 7; i++) {
      const at = t + 0.35 + Math.pow(Math.random(), 0.8) * 1.1
      noise(c, this.mix.tex.brown, bus, at, 0.14, 'lowpass', 260, 120, 0.003, 0.5 * (1 - (at - t) * 0.4))
      noise(c, this.mix.tex.chatter, bus, at, 0.1, 'bandpass', 1500, 1200, 0.003, 0.08)
    }
  }

  ignite(distance: number): void {
    const ctx = this.event(distance)
    if (!ctx) return
    const { t, g } = ctx
    const bus = voice(this.mix, 0.22 * g, 0.4, 1)
    noise(this.mix.ctx!, this.mix.tex.roar, bus, t, 0.45, 'bandpass', 400, 1200, 0.25, 0.5)
    noise(this.mix.ctx!, this.mix.tex.crackle, bus, t, 0.4, 'highpass', 2400, 2400, 0.2, 0.3)
  }

  /** Timing and level for an event at `distance` m; null once the frame has enough events. */
  private event(distance: number): { t: number; g: number } | null {
    const ctx = this.mix.ctx
    if (!ctx || !this.mix.enabled || this.eventsThisFrame >= 6) return null
    this.eventsThisFrame++
    return { t: ctx.currentTime + 0.005 + distance / 343, g: 1 / (1 + distance * 0.06) }
  }
}
