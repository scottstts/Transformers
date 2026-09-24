import type { AudioMix } from '../../../audio/mix'
import type { MechanismEvent } from '../../transformer/asset/format'
import { HEAVY_MACHINE } from '../../transformer/audio/machine'
import { TransformationSound } from '../../transformer/audio/transformation'
import { HEAVY_FOOT, footfall } from '../../transformer/audio/footfall'
import type { CharacterAudio } from '../../transformer/character'
import { RocketVoice } from './rocket'

/**
 * Procedural audio for the Cybertruck, all synthesized with Web Audio on the
 * game's shared mix (src/audio/mix.ts).
 *
 *   transformation  the shared machine (transformer/audio/machine.ts) as big
 *                   electro-hydraulics in a stainless body: a hydraulic power
 *                   unit while it runs and an actuator per exported stroke;
 *                   no impacts
 *   thrusters       the rocket burn of the lift jets (see rocket.ts)
 *   footfall        a multi-tonne foot: ground thump, sub pressure, gravel
 *                   crunch and damper exhale
 *   drive           a soft electric drive-motor hum
 */
interface DriveMotor {
  gain: GainNode
  hum: OscillatorNode
  whine: OscillatorNode
}

/** Drive motor: hum and whine base pitch (Hz) and peak level. */
const DRIVE_HUM_HZ = 48
const DRIVE_WHINE_HZ = 190
const DRIVE_LEVEL = 0.035

export class CybertruckAudio implements CharacterAudio {
  private readonly mix: AudioMix
  private readonly machine: TransformationSound
  private rocketVoice: RocketVoice | null = null
  private motor: DriveMotor | null = null

  constructor(mix: AudioMix) {
    this.mix = mix
    this.machine = new TransformationSound(mix, HEAVY_MACHINE)
  }

  /** Continuous voices, built once the shared context exists. */
  private get live(): boolean {
    const ctx = this.mix.ctx
    if (!ctx) return false
    if (!this.motor) {
      this.rocketVoice = new RocketVoice(ctx, this.mix.tex, this.mix.output)
      this.motor = this.buildMotor(ctx)
    }
    return true
  }

  /* ------------------------------------------------------ transformation */

  power(): void {
    this.machine.power()
  }

  transforming(on: boolean): void {
    this.machine.running(on)
  }

  mechanism(event: MechanismEvent, seconds: number): void {
    this.machine.stroke(event, seconds)
  }

  /** Per frame: lift-thruster throttle and ground impingement, both 0..1. */
  rocket(power: number, ground: number): void {
    if (!this.live) return
    this.rocketVoice?.update(this.mix.enabled ? power : 0, ground)
  }

  footstep(strength = 1): void {
    footfall(this.mix, HEAVY_FOOT, strength)
  }

  /* --------------------------------------------------------------- drive */

  /**
   * The drive motor, kept deliberately plain: a soft hum whose pitch follows
   * road speed, with a faint, heavily filtered inverter whine on top. It is
   * silent at rest, like an electric car.
   */
  private buildMotor(ctx: AudioContext): DriveMotor {
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
    return { gain, hum, whine }
  }

  drive(speed: number, throttle: number, isCar: boolean): void {
    if (!this.live || !this.motor) return
    const m = this.motor
    const t = (this.mix.ctx as AudioContext).currentTime
    const v = Math.abs(speed)
    const on = isCar && this.mix.enabled ? 1 : 0
    m.hum.frequency.setTargetAtTime(DRIVE_HUM_HZ + v * 2.4, t, 0.15)
    m.whine.frequency.setTargetAtTime(DRIVE_WHINE_HZ + v * 11, t, 0.15)
    const load = Math.min(v / 30, 1) * 0.6 + Math.abs(throttle) * 0.4
    m.gain.gain.setTargetAtTime(on * DRIVE_LEVEL * Math.min(1, v / 1.5) * (0.35 + 0.65 * load), t, 0.2)
  }

  dispose(): void {
    this.machine.dispose()
    this.rocketVoice?.dispose()
    this.rocketVoice = null
    if (this.motor) {
      this.motor.hum.stop()
      this.motor.whine.stop()
      this.motor.gain.disconnect()
      this.motor = null
    }
  }
}
