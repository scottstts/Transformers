import type { AudioMix } from '../../../audio/mix'
import type { MechanismEvent } from '../../transformer/asset/format'
import type { MechanismTuning } from '../../transformer/audio/mechanism'
import { TransformationSound } from '../../transformer/audio/transformation'
import { footfall, type FootfallTuning } from '../../transformer/audio/footfall'
import type { CharacterAudio } from '../../transformer/character'
import { PowerUnit } from './power-unit'

/**
 * Procedural audio for the Ferrari F1, on the game's shared mix.
 *
 *   power unit      the V6 turbo-hybrid (power-unit.ts): runs in car form,
 *                   winds down as the transformation starts and fires up
 *                   again once the car has re-formed
 *   transformation  the shared actuator machine tuned as a racer's
 *                   high-speed servos: higher, quicker motors with a finer
 *                   gear mesh and a lighter supply hum than the Cybertruck's
 *                   electro-hydraulics
 *   footfall        a lighter, quicker foot than the truck robot's
 */

/** Fast carbon-racer servos: higher motor pitch, finer reduction, brighter timbre. */
const RACER_SERVOS: MechanismTuning = {
  motorHz: { large: 74, medium: 106, small: 152 },
  gearRatio: 5.3,
  timbreSlope: 1.3,
  bedHz: 62,
  bedLevel: 0.038,
  liftHz: [46, 69],
  level: 0.9,
}

/** A robot of about half the truck robot's mass: a tighter thump, less sub. */
const RACER_FOOT: FootfallTuning = {
  subHz: [82, 44],
  thumpHz: 460,
  crunchHz: [1700, 2800],
  exhaleHz: 2900,
  level: 0.3,
}

export class F1Audio implements CharacterAudio {
  private readonly mix: AudioMix
  private readonly machine: TransformationSound
  readonly engine: PowerUnit

  constructor(mix: AudioMix) {
    this.mix = mix
    this.machine = new TransformationSound(mix, RACER_SERVOS)
    this.engine = new PowerUnit(mix)
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
    footfall(this.mix, RACER_FOOT, strength)
  }

  /** Per frame: the power unit follows the car (off outside car form). */
  drive(dt: number, speed: number, throttle: number, boost: boolean, isCar: boolean): void {
    this.engine.update(dt, speed, throttle, boost, isCar)
  }

  dispose(): void {
    this.machine.dispose()
    this.engine.dispose()
  }
}
