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
import { SEMI_LIGHTS } from './materials'
import { SemiAudio } from './audio/engine'

type Side = 'R' | 'L'

/** Camera shake of a running leap landing on one foot. */
const LEAP_SHAKE = 0.34
/** Tread widths (m): single fronts, duals on the drive axles and the van. */
const TYRE_WIDTH = { front: 0.29, rear: 0.6 }
/** A foot is down below this clearance and has lifted above the second (m). */
const PLANTED = 0.03
const LIFTED = 0.12
/** The heaviest robot of the roster: its footfalls shake the camera more. */
const STEP_SHAKE = 1.2
/** Camera rumble per m/s of tread slide, and its ceiling. */
const SLIDE_SHAKE = 0.007
const SLIDE_SHAKE_MAX = 0.07
/** Tail lights while braking (share of their full level at rest). */
const BRAKE_LIGHT = 1.8

/**
 * Effects of the Semi: transformation cues from the exported mechanism events,
 * the air brakes venting as it begins (and as the truck sets down again),
 * dust where the tyres leave the ground and where a foot comes down during
 * the transformation (read from the posed soles, so it holds both ways), tyre
 * dust and tracks in car form (the van's tyres too), the lights and the eyes.
 */
export class SemiEffects implements CharacterEffects {
  private readonly bot: TransformerModel
  private readonly contactEffects: ContactEffects
  readonly audio: SemiAudio
  readonly object = new Group()
  private readonly cues: Cue[]
  private readonly rise: MechanismEvent | undefined
  private readonly eyes: [number, number]
  private readonly duration: number
  private readonly tyres: Tyres
  private readonly pendingSteps: Array<[Side, number]> = []
  private readonly sole: Sole = { center: new Vector3(), forward: new Vector3(), length: 0, width: 0 }
  private readonly planted: Record<Side, boolean> = { L: true, R: true }
  private shake = 0
  private time = 0
  /** 0..1 the eyes flared past their running level (a special) */
  eyeBoost = 0
  /** 0..1 the headlights blazing past their running level (a special's charge) */
  lightBoost = 0

  constructor(bot: TransformerModel, contactEffects: ContactEffects, events: MechanismEvent[], duration: number, mix: AudioMix) {
    this.bot = bot
    this.contactEffects = contactEffects
    this.audio = new SemiAudio(mix)
    this.cues = buildCues(events)
    this.rise = events.find((e) => e.name === 'rig:rise')
    // the eyes come on as the head rises out of the chest (the neck's second stroke)
    const neck = events.filter((e) => e.name === 'rig:neck').at(-1)
    this.eyes = neck ? [neck.t0 + (neck.t1 - neck.t0) * 0.35, neck.t1] : [0.85, 0.98]
    this.duration = duration
    this.tyres = new Tyres(bot, TYRE_WIDTH)
  }

  addFootstep(side: Side, running: number): void {
    this.audio.footstep(0.85 + running * 0.7)
    this.plantFoot(side, running)
  }

  plantFoot(side: Side, running: number): void {
    const strength = 0.85 + running * 0.75
    this.shake = Math.min(this.shake + (0.05 + running * 0.06) * STEP_SHAKE, 0.3)
    this.pendingSteps.push([side, strength])
  }

  takeoff(): void {
    this.audio.footstep(1.2)
    this.shake = Math.max(this.shake, 0.14)
    this.dustBurst('feet', 1, 18)
  }

  /** Lands on both feet together, hard; a leap lands on its lead foot. */
  land(lead: Side | null): void {
    if (lead) {
      this.addFootstep(lead, 1)
      this.audio.footstep(1.4)
      this.shake = Math.max(this.shake, LEAP_SHAKE)
      return
    }
    this.addFootstep('L', 1)
    this.addFootstep('R', 1)
    this.audio.footstep(1.7)
    this.shake = 0.5
    this.dustBurst('feet', 1.5, 26)
  }

  timeline(previous: number, current: number): void {
    if (previous === current) return
    const forward = current > previous
    if ((forward && previous <= 0) || (!forward && previous >= 1)) {
      this.audio.power()
      // the brakes vent as it begins, either way
      this.audio.airBrakes(1)
    }
    crossedCues(this.cues, previous, current, (event) => this.audio.mechanism(event, (event.t1 - event.t0) * this.duration))
    // the tyres leave the sand as the robot starts to rise (and take its weight again in reverse)
    const rise = this.rise
    if (rise && (forward ? previous < rise.t0 && current >= rise.t0 : previous > rise.t0 && current <= rise.t0)) this.dustBurst('wheels', 0.7, 18)
    // settled back onto its tyres: the brakes set
    if (!forward && current <= 0) this.audio.airBrakes(0.7)
  }

  update(dt: number, state: MotionState): void {
    this.time += dt
    const t = state.progress
    const car = t === 0
    const braking = car && state.throttle < 0 && state.speed > 0.3 ? 1 : 0
    SEMI_LIGHTS.tail.value = 1 + (BRAKE_LIGHT - 1) * braking
    // the markers blink as it transforms, as hazards do
    SEMI_LIGHTS.marker.value = t > 0 && t < 1 ? (Math.sin(this.time * Math.PI * 2 * 1.4) > 0 ? 1 : 0.1) : 1
    // the light bar stays on in robot form (it is the chest's), dimmer, and blazes in a special
    SEMI_LIGHTS.head.value = (1 - 0.45 * easedRange(t, 0.3, 0.8)) * (1 + 1.6 * this.lightBoost)
    SEMI_LIGHTS.eyes.value = easedRange(t, this.eyes[0], this.eyes[1]) * (1 + 0.8 * this.eyeBoost)

    const contacts = this.bot.contacts()
    let slide = 0
    if (car) {
      this.tyres.update(state, this.contactEffects, dt)
      slide = Math.max(this.tyres.slideRear, this.tyres.slideFront)
      this.shake = Math.max(this.shake, Math.min(SLIDE_SHAKE_MAX, slide * SLIDE_SHAKE))
      // a landing jolts the view by its closing speed
      this.shake = Math.max(this.shake, Math.min(0.6, this.tyres.landing * 0.07))
    }
    if (t > 0 && t < 1) this.touchdowns()

    while (this.pendingSteps.length) {
      const [side, strength] = this.pendingSteps.pop()!
      this.contactEffects.burst(contacts.feet[side], strength, Math.round(20 + 16 * strength))
      const sole = this.bot.sole(side, this.sole)
      this.contactEffects.footprint(sole.center, sole.forward, sole.length, sole.width, 0.85 + 0.25 * strength)
    }
    this.contactEffects.update(dt)
    this.audio.drive(state.speed - state.spinRear, state.throttle, car, slide)
    this.audio.transforming(t > 0 && t < 1)
  }

  shakeCamera(camera: PerspectiveCamera, dt: number): void {
    if (this.shake <= 0) return
    camera.position.y += (Math.random() - 0.5) * this.shake * 0.25
    camera.position.x += (Math.random() - 0.5) * this.shake * 0.12
    this.shake = Math.max(0, this.shake - dt * 1.3)
  }

  /** During the transformation: a foot that comes down onto the sand lands with a footfall. */
  private touchdowns(): void {
    for (const side of ['L', 'R'] as const) {
      const clearance = this.bot.footClearance(side)
      if (this.planted[side] && clearance > LIFTED) this.planted[side] = false
      else if (!this.planted[side] && clearance < PLANTED) {
        this.planted[side] = true
        this.addFootstep(side, 0.35)
      }
    }
  }

  private dustBurst(where: 'feet' | 'wheels', strength: number, count: number): void {
    const contacts = this.bot.contacts()
    if (where === 'feet') {
      this.contactEffects.burst(contacts.feet.R, strength, count)
      this.contactEffects.burst(contacts.feet.L, strength, count)
    } else {
      for (const wheel of contacts.wheels) this.contactEffects.burst(wheel.p, strength * (wheel.front ? 0.6 : 1), Math.round(count / 2))
    }
  }
}
