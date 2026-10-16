import type { AudioMix } from '../../../audio/mix'
import type { MechanismEvent } from '../../transformer/asset/format'
import { HEAVY_MACHINE } from '../../transformer/audio/machine'
import { TransformationSound } from '../../transformer/audio/transformation'
import { HEAVY_FOOT, footfall } from '../../transformer/audio/footfall'
import { HEAVY_TYRES, TyreVoice } from '../../transformer/audio/tyres'
import type { CharacterAudio } from '../../transformer/character'
import type { ContactSurface } from '../../../game/contact-effects'
import { ElectricDrive } from '../../transformer/audio/electric-drive'
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
 *   footfall        a multi-tonne foot: a deep press into the sand and the
 *                   grind under the sole (shared voice)
 *   drive           the electric drive motor's soft hum, following the wheels
 *                   (wheelspin winds it up; transformer/audio/electric-drive.ts)
 *   tyres           sliding tyres tearing through the desert crust (shared
 *                   voice, transformer/audio/tyres.ts)
 */
export class CybertruckAudio implements CharacterAudio {
  private readonly mix: AudioMix
  private readonly machine: TransformationSound
  private rocketVoice: RocketVoice | null = null
  private readonly motor: ElectricDrive
  private readonly tyres: TyreVoice

  constructor(mix: AudioMix) {
    this.mix = mix
    this.machine = new TransformationSound(mix, HEAVY_MACHINE)
    this.tyres = new TyreVoice(mix, HEAVY_TYRES)
    this.motor = new ElectricDrive(mix)
  }

  /** Continuous voices, built once the shared context exists. */
  private get live(): boolean {
    const ctx = this.mix.ctx
    if (!ctx) return false
    if (!this.rocketVoice) {
      this.rocketVoice = new RocketVoice(ctx, this.mix.tex, this.mix.output)
      this.motor.prepare()
    }
    return true
  }

  prepare(): void {
    this.machine.prepare()
    this.tyres.update(0)
    void this.live
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

  footstep(strength = 1, surface: ContactSurface = 'sand'): void {
    footfall(this.mix, HEAVY_FOOT, strength, surface)
  }

  /* --------------------------------------------------------------- drive */

  /** Per frame: `wheelSpeed` the driven wheels' surface speed (m/s), `slide` the fastest tread slide under the car (m/s). */
  drive(wheelSpeed: number, throttle: number, isCar: boolean, slide: number): void {
    if (!this.live) return
    this.tyres.update(isCar ? slide : 0)
    this.motor.update(wheelSpeed, throttle, isCar)
  }

  dispose(): void {
    this.machine.dispose()
    this.tyres.dispose()
    this.rocketVoice?.dispose()
    this.rocketVoice = null
    this.motor.dispose()
  }
}
