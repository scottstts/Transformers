import type { AudioMix } from '../../../../audio/mix'
import { SHOT_TAKES, roadsterLoop, roadsterTake } from '../../audio/sound-bank'
import { SHOT_PEAK, type RoadsterShot } from '../../audio/sound-models'

/** Levels of each one-shot and of the field at full strength. */
const LEVEL: Record<RoadsterShot, number> = { shock: 0.62, energy: 0.6, explosion: 0.85, landing: 0.9, pass: 0.5 }
const FIELD = 0.55
/** Scheduling latency (s). */
const LATENCY = 0.02
/** The field's loop (samples, a power of two): about 2.7 s at 48 kHz. */
const LOOP = 1 << 17

/**
 * The Roadster's weapons on the shared mix, from the fitted takes
 * (sound-bank.ts): `shock` a palm cannon's blast, `energy` a discharge of the
 * energy cannons (the arc storm's pulses, the special's orb), `explosion` the
 * special's impact, `pass` its run going by; and the singularity's field as a loop that swells
 * in while the fist holds it, its pitch sinking as it tightens, and dies
 * away as it bursts. A take can be cued so its loudest moment falls on the
 * blow (`ahead`). Takes never repeat back to back. Everything renders once
 * when the fighter prepares its audio under the loading cover (if there
 * was no context then, at the first use).
 */
export class CannonAudio {
  private readonly mix: AudioMix
  private readonly takes: Record<RoadsterShot, AudioBuffer[]> = { shock: [], energy: [], explosion: [], landing: [], pass: [] }
  private readonly last: Record<RoadsterShot, number> = { shock: -1, energy: -1, explosion: -1, landing: -1, pass: -1 }
  private bus: GainNode | null = null
  private field: { src: AudioBufferSourceNode; gain: GainNode; tone: BiquadFilterNode } | null = null

  /** which takes it renders, and whether it holds the singularity's field loop */
  private readonly sounds: readonly RoadsterShot[]
  private readonly withField: boolean

  constructor(mix: AudioMix, sounds: readonly RoadsterShot[] = ['shock', 'energy', 'explosion', 'pass'], withField = true) {
    this.mix = mix
    this.sounds = sounds
    this.withField = withField
  }

  prepare(): void {
    const ctx = this.mix.ctx
    if (!ctx || this.bus) return
    for (const sound of this.sounds) {
      for (let v = 0; v < SHOT_TAKES[sound]; v++) {
        const data = roadsterTake(sound, v, ctx.sampleRate)
        const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate)
        buffer.copyToChannel(data, 0)
        this.takes[sound].push(buffer)
      }
    }
    // heard from the camera a dozen metres off: the air takes a little of the top, the desert gives a little back
    const out = this.mix.output
    const gain = ctx.createGain()
    const air = ctx.createBiquadFilter()
    air.type = 'lowpass'
    air.frequency.value = 10000
    air.Q.value = 0.5
    gain.connect(air).connect(out.dry)
    const send = ctx.createGain()
    send.gain.value = 0.35
    air.connect(send).connect(out.send)
    this.bus = gain
    if (!this.withField) return

    // the field: a seamless loop, silent until it is raised
    const data = roadsterLoop('distortion', LOOP, ctx.sampleRate)
    const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate)
    buffer.copyToChannel(data, 0)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 600
    tone.Q.value = 0.7
    const fieldGain = ctx.createGain()
    fieldGain.gain.value = 0
    src.connect(tone).connect(fieldGain).connect(gain)
    src.start()
    this.field = { src, gain: fieldGain, tone }
  }

  /**
   * A take of `sound` at `strength` 0..1+, played at `rate` (a bigger blast is
   * lower and longer). `peakIn` (s): its loudest moment lands that long from
   * now (a charge cued ahead of its blast plays the take's rise under the
   * charge); sooner than the take's own rise, it starts part way in. Without
   * it the take starts now.
   */
  play(sound: RoadsterShot, strength: number, rate = 1, peakIn = -1): void {
    const ctx = this.mix.ctx
    if (ctx && !this.bus) this.prepare()
    if (!ctx || !this.bus || !this.mix.enabled) return
    const list = this.takes[sound]
    let k = Math.floor(Math.random() * list.length)
    if (k === this.last[sound]) k = (k + 1) % list.length
    this.last[sound] = k
    const src = ctx.createBufferSource()
    src.buffer = list[k]
    const r = rate * (0.96 + Math.random() * 0.08)
    src.playbackRate.value = r
    const g = ctx.createGain()
    g.gain.value = LEVEL[sound] * Math.min(1.6, strength)
    src.connect(g).connect(this.bus)
    const now = ctx.currentTime + LATENCY
    // the take reaches its loudest SHOT_PEAK into the buffer, played faster or slower by the rate
    const lead = SHOT_PEAK[sound] / r
    if (peakIn < 0 || peakIn >= lead) src.start(now + Math.max(0, peakIn - lead))
    else src.start(now, (lead - peakIn) * r)
    src.onended = () => g.disconnect()
  }

  /** The field's strength 0..1 (0 silent): it swells and sinks in pitch as it tightens. */
  fieldLevel(level: number, seconds = 0.15): void {
    const f = this.field
    const ctx = this.mix.ctx
    if (!f || !ctx) return
    const t = ctx.currentTime
    const on = this.mix.enabled ? level : 0
    f.gain.gain.setTargetAtTime(FIELD * on, t, seconds)
    f.src.playbackRate.setTargetAtTime(1.05 - 0.25 * Math.min(1, level), t, 0.4)
    f.tone.frequency.setTargetAtTime(380 + 1400 * Math.min(1, level), t, 0.3)
  }

  dispose(): void {
    if (this.field) {
      this.field.src.stop()
      this.field.gain.disconnect()
      this.field = null
    }
    this.bus?.disconnect()
    this.bus = null
    for (const list of Object.values(this.takes)) list.length = 0
  }
}
