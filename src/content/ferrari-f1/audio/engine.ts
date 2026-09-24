import type { AudioMix } from '../../../audio/mix'
import type { MechanismEvent } from '../../transformer/asset/format'
import type { MachineTuning } from '../../transformer/audio/machine'
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
 *   transformation  the shared machine (transformer/audio/machine.ts) as a
 *                   racer would build it: compact high-speed drives and a
 *                   small fast pump, heard through a stiff, well-damped carbon
 *                   monocoque (higher, short-lived panel modes) rather than
 *                   the truck's ringing steel
 *   footfall        a lighter, quicker foot than the truck robot's
 */

/** Compact high-speed drives and pump in a carbon monocoque. */
const RACER_MACHINE: MachineTuning = {
  driveHz: 220,
  meshRatio: 1.8,
  pumpHz: 30,
  pistons: 7,
  modes: [236, 377, 548, 811, 1190, 1760, 2590, 3810],
  modeQ: 6,
  bodyShare: 0.6,
  distanceHz: 2000,
  ratchetHz: 24,
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
    this.machine = new TransformationSound(mix, RACER_MACHINE)
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
