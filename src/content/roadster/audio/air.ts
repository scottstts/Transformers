import type { AudioMix } from '../../../audio/mix'
import { roadsterLoop } from './sound-bank'

/** Levels at full throttle: the pack's roar, the nozzles' hiss, the ground's wash, the thump of the air lighting. */
const ROAR = 0.32
const HISS = 0.05
const WASH = 0.06
const THUMP = 0.5
/** Throttle response of the levels (s) and the throttle rise (per s) that sounds a thump as the air lights. */
const RESPONSE = 0.06
const LIGHTS = 3
/** Loop length (samples, a power of two): about 2.7 s at 48 kHz. */
const LOOP = 1 << 17

/**
 * The compressed-air propulsion (the lift jets and the back pack) on the
 * shared mix, driven every frame by its throttle and how hard it strikes
 * the ground:
 *
 *   roar   the propeller recording's spectrum (sound-bank.ts `propeller`), in
 *          two decorrelated copies; the lowpass opens with throttle
 *   hiss   the high rush of air leaving the nozzles (the recording stops at
 *          4 kHz; a real jet of air hisses on above it)
 *   wash   air and sand scouring the ground under it
 *   thump  a soft low push of pressure as the air lights
 *
 * Cold air: no crackle, no combustion rumble. The graph is built once and
 * runs silent between uses.
 */
export class AirVoice {
  private readonly mix: AudioMix
  private master: GainNode | null = null
  private roar: GainNode | null = null
  private tone: BiquadFilterNode | null = null
  private hiss: GainNode | null = null
  private wash: GainNode | null = null
  private thump: GainNode | null = null
  private readonly sources: AudioBufferSourceNode[] = []
  private last = 0

  constructor(mix: AudioMix) {
    this.mix = mix
  }

  /** Build the silent graph once the context exists. */
  prepare(): boolean {
    const ctx = this.mix.ctx
    if (!ctx) return false
    if (this.master) return true
    const out = this.mix.output
    const master = ctx.createGain()
    master.connect(out.dry)
    const send = ctx.createGain()
    send.gain.value = 0.4
    master.connect(send).connect(out.send)

    const data = roadsterLoop('propeller', LOOP, ctx.sampleRate)
    const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate)
    buffer.copyToChannel(data, 0)
    const roar = ctx.createGain()
    roar.gain.value = 0
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 800
    tone.Q.value = 0.5
    roar.connect(tone).connect(master)
    // two copies half a loop apart, spread a little across the stereo field
    for (const [offset, pan] of [[0, -0.3], [0.5, 0.3]] as const) {
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.loop = true
      const p = ctx.createStereoPanner()
      p.pan.value = pan
      src.connect(p).connect(roar)
      src.start(0, offset * buffer.duration)
      this.sources.push(src)
    }

    const hiss = ctx.createGain()
    hiss.gain.value = 0
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 5200
    band.Q.value = 0.6
    hiss.connect(band).connect(master)
    const wash = ctx.createGain()
    wash.gain.value = 0
    const scour = ctx.createBiquadFilter()
    scour.type = 'highpass'
    scour.frequency.value = 1400
    wash.connect(scour).connect(master)
    for (const [gain, offset] of [[hiss, 0.3], [wash, 1.1]] as const) {
      const src = ctx.createBufferSource()
      src.buffer = this.mix.tex.white
      src.loop = true
      src.connect(gain)
      src.start(0, offset)
      this.sources.push(src)
    }

    const thump = ctx.createGain()
    thump.gain.value = 0
    const low = ctx.createBiquadFilter()
    low.type = 'lowpass'
    low.frequency.value = 160
    thump.connect(low).connect(master)
    const src = ctx.createBufferSource()
    src.buffer = this.mix.tex.brown
    src.loop = true
    src.connect(thump)
    src.start()
    this.sources.push(src)

    this.master = master
    this.roar = roar
    this.tone = tone
    this.hiss = hiss
    this.wash = wash
    this.thump = thump
    return true
  }

  /** Per frame: throttle 0..1 (summed over the jets, may pass 1) and how hard the air strikes the ground 0..1. */
  update(power: number, ground: number, dt: number): void {
    if (!this.prepare() || !this.roar || !this.tone || !this.hiss || !this.wash || !this.thump) return
    const ctx = this.mix.ctx as AudioContext
    const t = ctx.currentTime
    const p = this.mix.enabled ? Math.min(1.4, power) : 0
    this.roar.gain.setTargetAtTime(ROAR * p ** 1.2, t, RESPONSE)
    this.tone.frequency.setTargetAtTime(500 + 5200 * Math.min(1, p), t, RESPONSE)
    this.hiss.gain.setTargetAtTime(HISS * p ** 1.5, t, RESPONSE)
    this.wash.gain.setTargetAtTime(this.mix.enabled ? WASH * Math.min(1, ground) : 0, t, RESPONSE * 2)
    // the air lighting: a soft push of pressure when the throttle jumps
    if (dt > 0 && (p - this.last) / dt > LIGHTS && this.last < 0.3) {
      const g = this.thump.gain
      g.cancelScheduledValues(t)
      g.setValueAtTime(g.value, t)
      g.linearRampToValueAtTime(THUMP, t + 0.04)
      g.setTargetAtTime(0, t + 0.06, 0.18)
    }
    this.last = p
  }

  dispose(): void {
    for (const s of this.sources) s.stop()
    this.sources.length = 0
    this.master?.disconnect()
    this.master = this.roar = this.tone = this.hiss = this.wash = this.thump = null
  }
}
