import { Group, Vector3, type PerspectiveCamera } from 'three/webgpu'
import { Tyres } from '../transformer/tyres'
import type { TransformerModel, Sole } from '../transformer/model/transformer'
import type { MechanismEvent } from '../transformer/asset/format'
import { buildCues, crossedCues, type Cue } from '../transformer/cues'
import type { CharacterEffects } from '../transformer/character'
import type { AudioMix } from '../../audio/mix'
import { easedRange } from '../../game/math'
import type { MotionState } from '../../game/types'
import type { ContactEffects } from '../../game/contact-effects'
import { IMPALA_LIGHTS } from './materials'
import { ImpalaAudio } from './audio/engine'

type Side = 'R' | 'L'

/** Camera shake of a running leap landing on one foot. */
const LEAP_SHAKE = 0.3
/** Tread widths (m): narrow 1960s bias-ply tyres. */
const TYRE_WIDTH = { front: 0.2, rear: 0.2 }
/** A foot or a tyre is down below this clearance and has lifted above the second (m). */
const PLANTED = 0.03
const LIFTED = 0.12
/** Camera rumble per m/s of tread slide, and its ceiling. */
const SLIDE_SHAKE = 0.006
const SLIDE_SHAKE_MAX = 0.06
/** Tail lamps while braking (share of their running level). */
const BRAKE_LIGHT = 2.1
/** The eyes light as the stance completes (transformation progress). */
const EYES: readonly [number, number] = [0.88, 0.96]
/** The headlamps in robot form (on the chest), as a share of the car's. */
const CHEST_LAMPS = 0.65

/**
 * Effects of the Impala: transformation cues from the exported mechanism
 * events; dust wherever a tyre leaves or meets the sand and wherever a foot
 * comes down during the deployment (read from the posed contacts, so it
 * holds both ways); tyre dust and tracks; the lamps, the markers blinking
 * while it transforms, and the eyes.
 */
export class ImpalaEffects implements CharacterEffects {
  private readonly bot: TransformerModel
  private readonly contactEffects: ContactEffects
  readonly audio: ImpalaAudio
  readonly object = new Group()
  private readonly cues: Cue[]
  private readonly duration: number
  private readonly tyres: Tyres
  private readonly pendingSteps: Array<[Side, number]> = []
  private readonly sole: Sole = { center: new Vector3(), forward: new Vector3(), length: 0, width: 0 }
  private readonly planted: Record<Side, boolean> = { L: true, R: true }
  /** each wheel on the sand (contacts order) */
  private readonly rolling: boolean[]
  private shake = 0
  private time = 0
  /** 0..1 the eyes blazing past their running level (a fight's flare, the special) */
  eyeBoost = 0

  constructor(bot: TransformerModel, contactEffects: ContactEffects, events: MechanismEvent[], duration: number, mix: AudioMix) {
    this.bot = bot
    this.contactEffects = contactEffects
    this.audio = new ImpalaAudio(mix)
    this.cues = buildCues(events)
    this.duration = duration
    this.tyres = new Tyres(bot, TYRE_WIDTH)
    this.rolling = bot.contacts().wheels.map(() => true)
  }

  addFootstep(side: Side, running: number): void {
    this.footstep(0.8 + running * 0.7, side)
    this.plantFoot(side, running)
  }

  plantFoot(side: Side, running: number): void {
    const strength = 0.8 + running * 0.7
    this.shake = Math.min(this.shake + 0.05 + running * 0.06, 0.25)
    this.pendingSteps.push([side, strength])
  }

  takeoff(): void {
    this.footstep(1.1)
    this.shake = Math.max(this.shake, 0.12)
    this.dustBurst(0.9, 16)
  }

  /** Lands on both feet together, hard; a leap lands on its lead foot. */
  land(lead: Side | null): void {
    if (lead) {
      this.addFootstep(lead, 1)
      this.footstep(1.3, lead)
      this.shake = Math.max(this.shake, LEAP_SHAKE)
      return
    }
    this.addFootstep('L', 1)
    this.addFootstep('R', 1)
    this.footstep(1.6)
    this.shake = 0.45
    this.dustBurst(1.4, 24)
  }

  timeline(previous: number, current: number): void {
    if (previous === current) return
    const forward = current > previous
    if ((forward && previous <= 0) || (!forward && previous >= 1)) this.audio.power()
    crossedCues(this.cues, previous, current, (event) => this.audio.mechanism(event, (event.t1 - event.t0) * this.duration))
  }

  update(dt: number, state: MotionState): void {
    this.time += dt
    const t = state.progress
    const car = t === 0
    const braking = car && state.throttle < 0 && state.speed > 0.3 ? 1 : 0
    IMPALA_LIGHTS.tail.value = 1 + (BRAKE_LIGHT - 1) * braking
    // the markers blink while it transforms; the headlamps ride the chest in robot form, dimmer
    IMPALA_LIGHTS.marker.value = t > 0 && t < 1 ? (Math.sin(this.time * Math.PI * 2 * 1.3) > 0 ? 1 : 0.12) : 1
    IMPALA_LIGHTS.head.value = 1 - (1 - CHEST_LAMPS) * easedRange(t, 0.4, 0.85)
    const lighting = t > EYES[0] && t < EYES[1]
    IMPALA_LIGHTS.eyes.value = easedRange(t, EYES[0], EYES[1]) * (lighting ? (Math.random() > 0.3 ? 1 : 0.25) : 1) * (1 + 1.1 * this.eyeBoost)

    const contacts = this.bot.contacts()
    let slide = 0
    if (car) {
      this.tyres.update(state, this.contactEffects, dt)
      slide = Math.max(this.tyres.slideRear, this.tyres.slideFront)
      this.shake = Math.max(this.shake, Math.min(SLIDE_SHAKE_MAX, slide * SLIDE_SHAKE))
      this.shake = Math.max(this.shake, Math.min(0.6, this.tyres.landing * 0.07))
    }
    if (t > 0 && t < 1) {
      this.touchdowns()
      this.wheelContacts()
    }

    while (this.pendingSteps.length) {
      const [side, strength] = this.pendingSteps.pop()!
      this.contactEffects.burst(contacts.feet[side], strength, Math.round(18 + 16 * strength))
      const sole = this.bot.sole(side, this.sole)
      this.contactEffects.footprint(sole.center, sole.forward, sole.length, sole.width, 0.8 + 0.25 * strength)
    }
    this.contactEffects.update(dt)
    this.audio.drive(dt, state.speed - state.spinRear, state.throttle, car, slide)
    this.audio.transforming(t > 0 && t < 1)
  }

  shakeCamera(camera: PerspectiveCamera, dt: number): void {
    if (this.shake <= 0) return
    camera.position.y += (Math.random() - 0.5) * this.shake * 0.25
    camera.position.x += (Math.random() - 0.5) * this.shake * 0.12
    this.shake = Math.max(0, this.shake - dt * 1.4)
  }

  /** During the transformation: a foot that comes down onto the sand lands with a footfall. */
  private touchdowns(): void {
    for (const side of ['L', 'R'] as const) {
      const clearance = this.bot.footClearance(side)
      if (this.planted[side] && clearance > LIFTED) this.planted[side] = false
      else if (!this.planted[side] && clearance < PLANTED) {
        this.planted[side] = true
        this.addFootstep(side, 0.3)
      }
    }
  }

  /** During the transformation: a tyre leaving the sand or setting down on it throws a puff of dust. */
  private wheelContacts(): void {
    const wheels = this.bot.contacts().wheels
    for (let k = 0; k < wheels.length; k++) {
      const p = wheels[k].p
      const clearance = p.y - this.contactEffects.height(p.x, p.z)
      if (this.rolling[k] && clearance > LIFTED) {
        this.rolling[k] = false
        this.contactEffects.burst(_at.set(p.x, p.y - clearance, p.z), 0.6, 9)
      } else if (!this.rolling[k] && clearance < PLANTED) {
        this.rolling[k] = true
        this.contactEffects.burst(_at.set(p.x, p.y - clearance, p.z), 0.75, 12)
        this.shake = Math.max(this.shake, 0.08)
      }
    }
  }

  private footstep(strength: number, side: Side = 'R'): void {
    const p = this.bot.contacts().feet[side]
    this.audio.footstep(strength, this.contactEffects.surface(p.x, p.z))
  }

  private dustBurst(strength: number, count: number): void {
    const contacts = this.bot.contacts()
    this.contactEffects.burst(contacts.feet.R, strength, count)
    this.contactEffects.burst(contacts.feet.L, strength, count)
  }
}

const _at = new Vector3()
