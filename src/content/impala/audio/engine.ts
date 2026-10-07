import type { AudioMix } from '../../../audio/mix'
import type { MechanismEvent } from '../../transformer/asset/format'
import type { MachineTuning } from '../../transformer/audio/machine'
import { TransformationSound } from '../../transformer/audio/transformation'
import { footfall, type FootfallTuning } from '../../transformer/audio/footfall'
import type { ContactSurface } from '../../../game/contact-effects'
import { TyreVoice, type TyreTuning } from '../../transformer/audio/tyres'
import type { CharacterAudio } from '../../transformer/character'
import { BigBlock } from './big-block'

/**
 * Procedural audio for the Impala, on the game's shared mix.
 *
 *   transformation  the shared machine (transformer/audio/machine.ts) in a
 *                   two-tonne body of 1960s pressed steel: thin, large panels
 *                   whose modes ring longer than an armoured body's
 *   engine          the big-block V8 (big-block.ts), fitted to a recording;
 *                   it runs down as the car transforms and starts again when
 *                   it re-forms
 *   footfall        a five-and-a-half-tonne foot on sand (shared voice)
 *   tyres           narrow bias-ply tyres under a heavy car: they give up
 *                   early and squeal higher and thinner than modern rubber
 */

const IMPALA_MACHINE: MachineTuning = {
  driveHz: 128,
  meshRatio: 2.1,
  pumpHz: 19,
  pistons: 9,
  modes: [104, 168, 259, 382, 566, 845, 1255, 1880],
  modeQ: 11,
  bodyShare: 0.7,
  distanceHz: 1450,
  ratchetHz: 14,
  level: 1,
}

const IMPALA_FOOT: FootfallTuning = {
  pressHz: [235, 122],
  grindHz: [1480, 490],
  level: 0.31,
}

const IMPALA_TYRES: TyreTuning = { scrubHz: 980, rumbleHz: 108, level: 0.24 }

export class ImpalaAudio implements CharacterAudio {
  private readonly mix: AudioMix
  private readonly machine: TransformationSound
  private readonly tyres: TyreVoice
  readonly engine: BigBlock

  constructor(mix: AudioMix) {
    this.mix = mix
    this.machine = new TransformationSound(mix, IMPALA_MACHINE)
    this.tyres = new TyreVoice(mix, IMPALA_TYRES)
    this.engine = new BigBlock(mix)
  }

  prepare(): void {
    this.machine.prepare()
    this.tyres.update(0)
    this.engine.update(0, 0, 0, false)
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
    footfall(this.mix, IMPALA_FOOT, strength, surface)
  }

  /** Per frame: the driven wheels' surface speed (m/s), throttle, car form, the fastest tread slide (m/s). */
  drive(dt: number, wheelSpeed: number, throttle: number, isCar: boolean, slide: number): void {
    this.tyres.update(isCar ? slide : 0)
    this.engine.update(dt, wheelSpeed, throttle, isCar)
  }

  dispose(): void {
    this.machine.dispose()
    this.tyres.dispose()
    this.engine.dispose()
  }
}
