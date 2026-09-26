import type { AudioMix } from '../../../audio/mix'
import type { MechanismEvent } from '../../transformer/asset/format'
import type { MachineTuning } from '../../transformer/audio/machine'
import { TransformationSound } from '../../transformer/audio/transformation'
import { footfall, type FootfallTuning } from '../../transformer/audio/footfall'
import { TyreVoice, type TyreTuning } from '../../transformer/audio/tyres'
import { noise, voice } from '../../transformer/combat/audio/shots'
import type { CharacterAudio } from '../../transformer/character'

/**
 * Procedural audio for the Semi, on the game's shared mix.
 *
 *   transformation  the shared machine (transformer/audio/machine.ts) at its
 *                   biggest: slow, low drives and a big pump, heard through a
 *                   long steel-and-aluminium body (low, well-spaced panel
 *                   modes) from further off than the pickup
 *   drive           three electric drive motors: a deep hum following the
 *                   driven wheels (wheelspin winds it up) with a faint,
 *                   heavily filtered inverter whine, silent at rest
 *   air brakes      the pneumatic brakes venting as the truck comes to rest,
 *                   as the transformation begins and as it sets down again:
 *                   a broadband rush of air through the valve, no pitch
 *   footfall        the heaviest foot of the roster: a deep press and a slow grind
 *   tyres           ten tyres tearing through the desert crust (shared voice)
 */

/** The big machine: slow heavy drives and pump, a long body with low, well-spaced modes. */
const SEMI_MACHINE: MachineTuning = {
  driveHz: 118,
  meshRatio: 2.0,
  pumpHz: 18,
  pistons: 9,
  modes: [98, 157, 243, 356, 528, 790, 1180, 1770],
  modeQ: 10,
  bodyShare: 0.75,
  distanceHz: 1250,
  ratchetHz: 13,
  level: 1.05,
}

/** A seven-metre robot: a deeper, slower press than the pickup's. */
const SEMI_FOOT: FootfallTuning = {
  pressHz: [200, 105],
  grindHz: [1250, 420],
  level: 0.34,
}

/** Ten heavy tyres: a lower roar than the pickup's. */
const SEMI_TYRES: TyreTuning = { scrubHz: 780, rumbleHz: 92, level: 0.23 }

/** Drive motors: hum and whine base pitch (Hz), their rise per m/s and the peak level. */
const DRIVE = { humHz: 34, humRise: 1.7, whineHz: 140, whineRise: 7.5, level: 0.042 }
/** Speed (m/s) from which the truck coming to rest vents its brakes, and the least time between two vents (s). */
const REST_FROM = 2
const VENT_GAP = 1.5

interface DriveMotor {
  gain: GainNode
  hum: OscillatorNode
  whine: OscillatorNode
}

export class SemiAudio implements CharacterAudio {
  private readonly mix: AudioMix
  private readonly machine: TransformationSound
  private readonly tyres: TyreVoice
  private motor: DriveMotor | null = null
  /** the truck was rolling: coming to rest vents the brakes */
  private rolling = false
  private vented = -Infinity

  constructor(mix: AudioMix) {
    this.mix = mix
    this.machine = new TransformationSound(mix, SEMI_MACHINE)
    this.tyres = new TyreVoice(mix, SEMI_TYRES)
  }

  private get live(): boolean {
    const ctx = this.mix.ctx
    if (!ctx) return false
    if (!this.motor) this.motor = this.buildMotor(ctx)
    return true
  }

  prepare(): void {
    this.machine.prepare()
    this.tyres.update(0)
    void this.live
  }

  power(): void {
    this.machine.power()
  }

  transforming(on: boolean): void {
    this.machine.running(on)
  }

  mechanism(event: MechanismEvent, seconds: number): void {
    this.machine.stroke(event, seconds)
  }

  footstep(strength = 1): void {
    footfall(this.mix, SEMI_FOOT, strength)
  }

  /**
   * The air brakes vent: a rush of compressed air out of the relay valve,
   * broadband and unpitched (fixed filters, the level alone shapes it),
   * `strength` 0..1+.
   */
  airBrakes(strength = 1): void {
    const ctx = this.mix.ctx
    if (!ctx || !this.mix.enabled || ctx.currentTime - this.vented < VENT_GAP) return
    this.vented = ctx.currentTime
    const t = ctx.currentTime + 0.01
    const g = Math.min(1.3, strength)
    const bus = voice(this.mix, 0.2 * g, 0.4, 1.6)
    // the jet of air: bright, hard onset, then the reservoir falling off
    noise(ctx, this.mix.tex.white, bus, t, 0.95, 'highpass', 1900, 1900, 0.012, 0.55, 0.25)
    noise(ctx, this.mix.tex.white, bus, t, 1.1, 'bandpass', 4200, 4200, 0.02, 0.3, 0.2, 0.5)
    // the body of it through the chassis, low and short
    noise(ctx, this.mix.tex.brown, bus, t, 0.35, 'lowpass', 260, 260, 0.015, 0.35)
  }

  /**
   * The drive motors, kept deliberately plain: a deep hum whose pitch follows
   * road speed and a faint, heavily filtered inverter whine, silent at rest.
   */
  private buildMotor(ctx: AudioContext): DriveMotor {
    const gain = ctx.createGain()
    gain.gain.value = 0
    const soften = ctx.createBiquadFilter()
    soften.type = 'lowpass'
    soften.frequency.value = 600
    soften.Q.value = 0.5
    gain.connect(soften).connect(this.mix.output.dry)
    const hum = ctx.createOscillator()
    const whine = ctx.createOscillator()
    const hg = ctx.createGain()
    hg.gain.value = 1
    const wg = ctx.createGain()
    wg.gain.value = 0.1
    hum.connect(hg).connect(gain)
    whine.connect(wg).connect(gain)
    hum.start()
    whine.start()
    return { gain, hum, whine }
  }

  /** Per frame: `wheelSpeed` the driven wheels' surface speed (m/s), `slide` the fastest tread slide (m/s). */
  drive(wheelSpeed: number, throttle: number, isCar: boolean, slide: number): void {
    if (!this.live || !this.motor) return
    this.tyres.update(isCar ? slide : 0)
    const m = this.motor
    const t = (this.mix.ctx as AudioContext).currentTime
    const v = Math.abs(wheelSpeed)
    const on = isCar && this.mix.enabled ? 1 : 0
    m.hum.frequency.setTargetAtTime(DRIVE.humHz + v * DRIVE.humRise, t, 0.18)
    m.whine.frequency.setTargetAtTime(DRIVE.whineHz + v * DRIVE.whineRise, t, 0.18)
    const load = Math.min(v / 28, 1) * 0.6 + Math.abs(throttle) * 0.4
    m.gain.gain.setTargetAtTime(on * DRIVE.level * Math.min(1, v / 1.5) * (0.35 + 0.65 * load), t, 0.25)
    // coming to rest in car form vents the brakes
    if (isCar && v > REST_FROM) this.rolling = true
    else if (this.rolling && (!isCar || v < 0.3)) {
      this.rolling = false
      if (isCar) this.airBrakes(0.8)
    }
  }

  dispose(): void {
    this.machine.dispose()
    this.tyres.dispose()
    if (this.motor) {
      this.motor.hum.stop()
      this.motor.whine.stop()
      this.motor.gain.disconnect()
      this.motor = null
    }
  }
}
