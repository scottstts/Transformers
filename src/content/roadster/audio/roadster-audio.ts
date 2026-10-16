import type { AudioMix } from '../../../audio/mix'
import type { MechanismEvent } from '../../transformer/asset/format'
import type { MachineTuning } from '../../transformer/audio/machine'
import { TransformationSound } from '../../transformer/audio/transformation'
import { footfall, type FootfallTuning } from '../../transformer/audio/footfall'
import { TyreVoice, type TyreTuning } from '../../transformer/audio/tyres'
import { ElectricDrive } from '../../transformer/audio/electric-drive'
import type { CharacterAudio } from '../../transformer/character'
import type { ContactSurface } from '../../../game/contact-effects'
import { AirVoice } from './air'
import { CannonAudio } from '../combat/audio/cannons'

/**
 * Procedural audio for the Roadster, on the game's shared mix.
 *
 *   transformation  the shared machine in a carbon-tub supercar body: quick,
 *                   compact drives and the short, damped panel modes of
 *                   carbon and composite skins
 *   drive           the electric drive motor's soft hum, the Cybertruck's own
 *                   (transformer/audio/electric-drive.ts)
 *   air             the compressed-air lift jets and back pack (air.ts)
 *   footfall        a six-metre robot's foot on sand (shared voice)
 *   tyres           wide performance tyres tearing through the desert crust
 *   landing         the robot coming down out of its flight at the end of the
 *                   transformation (car to robot only), fitted to a recording
 */
const ROADSTER_MACHINE: MachineTuning = {
  driveHz: 190,
  meshRatio: 1.9,
  pumpHz: 27,
  pistons: 7,
  modes: [182, 296, 431, 640, 935, 1380, 2040, 3010],
  modeQ: 7,
  bodyShare: 0.62,
  distanceHz: 1800,
  ratchetHz: 21,
  level: 0.95,
}

const ROADSTER_FOOT: FootfallTuning = {
  pressHz: [235, 125],
  grindHz: [1500, 500],
  level: 0.3,
}

const ROADSTER_TYRES: TyreTuning = { scrubHz: 1050, rumbleHz: 115, level: 0.2 }

export class RoadsterAudio implements CharacterAudio {
  private readonly mix: AudioMix
  private readonly machine: TransformationSound
  private readonly tyres: TyreVoice
  private readonly motor: ElectricDrive
  readonly air: AirVoice
  private readonly shots: CannonAudio

  constructor(mix: AudioMix) {
    this.mix = mix
    this.machine = new TransformationSound(mix, ROADSTER_MACHINE)
    this.tyres = new TyreVoice(mix, ROADSTER_TYRES)
    this.motor = new ElectricDrive(mix)
    this.air = new AirVoice(mix)
    this.shots = new CannonAudio(mix, ['landing'], false)
  }

  prepare(): void {
    this.machine.prepare()
    this.tyres.update(0)
    this.motor.prepare()
    this.air.prepare()
    this.shots.prepare()
  }

  /** The hero landing's impact, its loudest moment `peakIn` s from now. */
  landing(strength: number, peakIn: number): void {
    this.shots.play('landing', strength, 1, peakIn)
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

  footstep(strength = 1, surface: ContactSurface = 'sand'): void {
    footfall(this.mix, ROADSTER_FOOT, strength, surface)
  }

  /** Per frame: the driven wheels' surface speed (m/s), the throttle, the fastest tread slide (m/s). */
  drive(wheelSpeed: number, throttle: number, isCar: boolean, slide: number): void {
    this.tyres.update(isCar ? slide : 0)
    this.motor.update(wheelSpeed, throttle, isCar)
  }

  dispose(): void {
    this.machine.dispose()
    this.tyres.dispose()
    this.motor.dispose()
    this.air.dispose()
    this.shots.dispose()
  }
}
