import type { AudioMix } from '../../../audio/mix'
import type { MechanismEvent } from '../../transformer/asset/format'
import type { MachineTuning } from '../../transformer/audio/machine'
import { TransformationSound } from '../../transformer/audio/transformation'
import { footfall, type FootfallTuning } from '../../transformer/audio/footfall'
import { TyreVoice, type TyreTuning } from '../../transformer/audio/tyres'
import type { CharacterAudio } from '../../transformer/character'
import { V8 } from './v8'
import { JetVoice } from './jet'

/**
 * Procedural audio for the Bat, on the game's shared mix.
 *
 *   transformation  the shared machine (transformer/audio/machine.ts) in a
 *                   heavy armoured body: thick plate, so its panel modes are
 *                   low and well damped (duller than the stainless truck's)
 *   engine          the cross-plane V8 (v8.ts): a lumpy idle, the burble
 *                   under load, a four-speed automatic; it runs down as the
 *                   car transforms and starts again when it re-forms
 *   jet             the afterburner (jet.ts), whenever it burns: the car's
 *                   boost, a fighting move, the special
 *   footfall        a five-tonne foot on sand (shared voice)
 *   tyres           four swampers and two turf tyres tearing through the
 *                   crust: the big lugs make it lower and coarser (shared voice)
 */

const BAT_MACHINE: MachineTuning = {
  driveHz: 135,
  meshRatio: 2.2,
  pumpHz: 20,
  pistons: 9,
  modes: [112, 176, 271, 398, 590, 880, 1310, 1960],
  modeQ: 8,
  bodyShare: 0.72,
  distanceHz: 1400,
  ratchetHz: 15,
  level: 1,
}

const BAT_FOOT: FootfallTuning = {
  pressHz: [250, 132],
  grindHz: [1550, 520],
  level: 0.3,
}

const BAT_TYRES: TyreTuning = { scrubHz: 760, rumbleHz: 96, level: 0.22 }

export class BatAudio implements CharacterAudio {
  private readonly mix: AudioMix
  private readonly machine: TransformationSound
  private readonly tyres: TyreVoice
  private readonly engine: V8
  readonly jet: JetVoice

  constructor(mix: AudioMix) {
    this.mix = mix
    this.machine = new TransformationSound(mix, BAT_MACHINE)
    this.tyres = new TyreVoice(mix, BAT_TYRES)
    this.engine = new V8(mix)
    this.jet = new JetVoice(mix)
  }

  prepare(): void {
    this.machine.prepare()
    this.tyres.update(0)
    this.jet.prepare()
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

  footstep(strength = 1): void {
    footfall(this.mix, BAT_FOOT, strength)
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
    this.jet.dispose()
  }
}
