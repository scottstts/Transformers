import type { AudioMix } from '../../../audio/mix'

/** Drive motor: hum and whine base pitch (Hz) and peak level. */
const DRIVE_HUM_HZ = 48
const DRIVE_WHINE_HZ = 190
const DRIVE_LEVEL = 0.035

/**
 * An electric car's drive motor (the Cybertruck's and the Roadster's), kept
 * deliberately plain: a soft hum whose pitch follows road speed, with a
 * faint, heavily filtered inverter whine on top. It is silent at rest, like
 * an electric car. Built on the shared mix once its context exists.
 */
export class ElectricDrive {
  private readonly mix: AudioMix
  private gain: GainNode | null = null
  private hum: OscillatorNode | null = null
  private whine: OscillatorNode | null = null

  constructor(mix: AudioMix) {
    this.mix = mix
  }

  /** Build the voice (silent) if the context exists; true once it is live. */
  prepare(): boolean {
    const ctx = this.mix.ctx
    if (!ctx) return false
    if (this.gain) return true
    const gain = ctx.createGain()
    gain.gain.value = 0
    const soften = ctx.createBiquadFilter()
    soften.type = 'lowpass'
    soften.frequency.value = 700
    soften.Q.value = 0.5
    gain.connect(soften).connect(this.mix.output.dry)
    const hum = ctx.createOscillator()
    const whine = ctx.createOscillator()
    const hg = ctx.createGain()
    hg.gain.value = 1
    const wg = ctx.createGain()
    wg.gain.value = 0.12
    hum.connect(hg).connect(gain)
    whine.connect(wg).connect(gain)
    hum.start()
    whine.start()
    this.gain = gain
    this.hum = hum
    this.whine = whine
    return true
  }

  /** Per frame: `wheelSpeed` the driven wheels' surface speed (m/s), `throttle` -1..1; silent unless `isCar`. */
  update(wheelSpeed: number, throttle: number, isCar: boolean): void {
    if (!this.prepare() || !this.gain || !this.hum || !this.whine) return
    const t = (this.mix.ctx as AudioContext).currentTime
    const v = Math.abs(wheelSpeed)
    const on = isCar && this.mix.enabled ? 1 : 0
    this.hum.frequency.setTargetAtTime(DRIVE_HUM_HZ + v * 2.4, t, 0.15)
    this.whine.frequency.setTargetAtTime(DRIVE_WHINE_HZ + v * 11, t, 0.15)
    const load = Math.min(v / 30, 1) * 0.6 + Math.abs(throttle) * 0.4
    this.gain.gain.setTargetAtTime(on * DRIVE_LEVEL * Math.min(1, v / 1.5) * (0.35 + 0.65 * load), t, 0.2)
  }

  dispose(): void {
    if (!this.gain) return
    this.hum?.stop()
    this.whine?.stop()
    this.gain.disconnect()
    this.gain = this.hum = this.whine = null
  }
}
