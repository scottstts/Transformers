import { Group, Vector3, type Object3D, type PerspectiveCamera } from 'three/webgpu'
import { Tyres } from '../transformer/tyres'
import type { TransformerModel, Sole } from '../transformer/model/transformer'
import type { MechanismEvent } from '../transformer/asset/format'
import { buildCues, crossedCues, type Cue } from '../transformer/cues'
import type { CharacterEffects } from '../transformer/character'
import type { AudioMix } from '../../audio/mix'
import { easedRange } from '../../game/math'
import type { MotionState } from '../../game/types'
import type { ContactEffects } from '../../game/contact-effects'
import { ROADSTER_LIGHTS } from './materials'
import { RoadsterAudio } from './audio/roadster-audio'
import { AirJets } from './fx/air-jets'
import { SHOT_PEAK } from './audio/sound-models'

type Side = 'R' | 'L'

/** Camera shake of a running leap landing on one foot. */
const LEAP_SHAKE = 0.3
/** Tread widths (m): wide performance tyres. */
const TYRE_WIDTH = { front: 0.27, rear: 0.33 }
/** A foot or a tyre is down below this clearance and has lifted above the second (m). */
const PLANTED = 0.03
const LIFTED = 0.12
/** Camera rumble per m/s of tread slide, and its ceiling. */
const SLIDE_SHAKE = 0.006
const SLIDE_SHAKE_MAX = 0.06
/** Tail bar while braking (share of its running level). */
const BRAKE_LIGHT = 2.2
/** The visor lights as the robot comes out of the flip (s of the transformation), the light bar dims to the chest's share. */
const VISOR: readonly [number, number] = [5.0, 5.6]
const CHEST_BAR = 0.8
/**
 * The hero landing (rdb/flight.py TOUCH): the robot comes down from its
 * eighteen-metre arc onto its left foot, right knee and right hand (the
 * reference's three-point landing), and the ground takes it.
 */
const TOUCHDOWN = 6.6
/** Its shake, dust ring (m) and the debris thrown off the bowl it presses into the sand. */
const LANDING = { shake: 0.75, surge: 3.2, crater: 1.6, debris: 22, speed: 7 }

/**
 * Effects of the Roadster: the compressed-air lift jets and back pack
 * (fx/air-jets.ts) through the flying transformation, their roar, the hero
 * landing's blow to the ground, dust wherever a tyre leaves or meets the
 * sand and wherever a foot comes down, tyre dust and tracks, the lamps (the
 * markers blinking while it transforms) and the visor.
 */
export class RoadsterEffects implements CharacterEffects {
  private readonly bot: TransformerModel
  private readonly contactEffects: ContactEffects
  readonly audio: RoadsterAudio
  readonly object = new Group()
  readonly jets: AirJets
  private readonly cues: Cue[]
  private readonly duration: number
  private readonly tyres: Tyres
  private readonly pendingSteps: Array<[Side, number]> = []
  private readonly sole: Sole = { center: new Vector3(), forward: new Vector3(), length: 0, width: 0 }
  private readonly planted: Record<Side, boolean> = { L: true, R: true }
  /** each wheel on the sand (contacts order) */
  private readonly rolling: boolean[]
  private readonly hand: Object3D
  private readonly knee: Object3D
  private shake = 0
  private time = 0
  /** 0..1 the visor blazing past its running level (a fight's flare, the special) */
  visorBoost = 0

  constructor(bot: TransformerModel, contactEffects: ContactEffects, events: MechanismEvent[], duration: number, mix: AudioMix) {
    this.bot = bot
    this.contactEffects = contactEffects
    this.audio = new RoadsterAudio(mix)
    this.cues = buildCues(events)
    this.duration = duration
    this.tyres = new Tyres(bot, TYRE_WIDTH)
    this.rolling = bot.contacts().wheels.map(() => true)
    this.jets = new AirJets(bot, contactEffects)
    this.hand = bot.node('bone:hand.R')
    this.knee = bot.node('bone:shin.R')
    this.object.add(this.jets.object)
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
    // the hero landing, coming down (forward); jumping off it, the push (backward)
    const touch = TOUCHDOWN / this.duration
    // the landing's recorded impact, started so its loudest moment falls on the touchdown (car to robot only)
    const cue = (TOUCHDOWN - SHOT_PEAK.landing) / this.duration
    if (forward && previous < cue && current >= cue) this.audio.landing(1, SHOT_PEAK.landing)
    if (forward && previous < touch && current >= touch) this.landing(1)
    else if (!forward && previous > touch && current <= touch) this.landing(0.55)
  }

  update(dt: number, state: MotionState): void {
    this.time += dt
    const t = state.progress
    const seconds = t * this.duration
    const car = t === 0
    const transforming = t > 0 && t < 1
    const braking = car && state.throttle < 0 && state.speed > 0.3 ? 1 : 0
    ROADSTER_LIGHTS.tail.value = 1 + (BRAKE_LIGHT - 1) * braking
    ROADSTER_LIGHTS.marker.value = transforming ? (Math.sin(this.time * Math.PI * 2 * 1.4) > 0 ? 1 : 0.1) : 1
    ROADSTER_LIGHTS.head.value = 1 - (1 - CHEST_BAR) * easedRange(seconds, 2.0, 4.5)
    ROADSTER_LIGHTS.cabin.value = 1 - easedRange(seconds, 2.0, 2.7)
    const lighting = seconds > VISOR[0] && seconds < VISOR[1]
    ROADSTER_LIGHTS.visor.value = easedRange(seconds, VISOR[0], VISOR[1]) * (lighting ? (Math.random() > 0.3 ? 1 : 0.2) : 1) * (1 + 1.2 * this.visorBoost)

    const contacts = this.bot.contacts()
    let slide = 0
    if (car) {
      this.tyres.update(state, this.contactEffects, dt)
      slide = Math.max(this.tyres.slideRear, this.tyres.slideFront)
      this.shake = Math.max(this.shake, Math.min(SLIDE_SHAKE_MAX, slide * SLIDE_SHAKE))
      this.shake = Math.max(this.shake, Math.min(0.6, this.tyres.landing * 0.07))
    }
    if (transforming) {
      this.touchdowns()
      this.wheelContacts()
    }

    const jets = this.jets
    jets.update(seconds, transforming, dt)
    this.shake = Math.max(this.shake, Math.min(0.18, (jets.lift + jets.pack) * 0.06 + jets.impingement * 0.04))
    this.audio.air.update(Math.max(jets.lift, jets.pack * 0.85), Math.min(1, jets.impingement * 0.4), dt)

    while (this.pendingSteps.length) {
      const [side, strength] = this.pendingSteps.pop()!
      this.contactEffects.burst(contacts.feet[side], strength, Math.round(18 + 16 * strength))
      const sole = this.bot.sole(side, this.sole)
      this.contactEffects.footprint(sole.center, sole.forward, sole.length, sole.width, 0.8 + 0.25 * strength)
    }
    this.contactEffects.update(dt)
    this.audio.drive(state.speed - state.spinRear, state.throttle, car, slide)
    this.audio.transforming(transforming)
  }

  /** How far the body is flown above the ground (m): the transformation's flight, carried in the model's lift. */
  altitude(T: number): number {
    return T > 0 && T < 1 ? Math.max(0, this.bot.lift) : 0
  }

  shakeCamera(camera: PerspectiveCamera, dt: number): void {
    if (this.shake <= 0) return
    camera.position.y += (Math.random() - 0.5) * this.shake * 0.25
    camera.position.x += (Math.random() - 0.5) * this.shake * 0.12
    this.shake = Math.max(0, this.shake - dt * 1.4)
  }

  /**
   * The hero landing's blow: the hand, the knee and the left foot driven into
   * the sand from the arc. A bowl pressed into it under the hand (cold:
   * nothing burns), the sand rolling out round it, crust and grit thrown up,
   * a heavy double footfall and a hard shake. `strength` 1 coming down; less
   * for the push off it, played backward.
   */
  private landing(strength: number): void {
    const c = this.contactEffects
    _hand.setFromMatrixPosition(this.hand.matrixWorld)
    _hand.y = c.height(_hand.x, _hand.z)
    _knee.setFromMatrixPosition(this.knee.matrixWorld)
    _knee.y = c.height(_knee.x, _knee.z)
    _centre.addVectors(_hand, _knee).multiplyScalar(0.5)
    _centre.y = c.height(_centre.x, _centre.z)
    if (strength > 0.8) c.crater(_hand, LANDING.crater, 0)
    c.surge(_centre, LANDING.surge * strength, 0.55 * strength)
    c.eject(_hand, LANDING.speed * strength, Math.round(LANDING.debris * strength), _up, 0.75, 0.22)
    c.burst(_hand, 1.6 * strength, 36)
    c.burst(_knee, 1.4 * strength, 28)
    c.burst(this.bot.contacts().feet.L, 1.2 * strength, 22)
    this.shake = Math.max(this.shake, LANDING.shake * strength)
    // coming down the recorded landing sounds it (timeline); the push off it, backward, is footfalls
    if (strength < 0.8) {
      this.audio.footstep(1.8 * strength, c.surface(_centre.x, _centre.z))
      this.audio.footstep(1.4 * strength, c.surface(_hand.x, _hand.z))
    }
  }

  /** During the transformation: a foot that comes down onto the sand lands with a footfall. */
  private touchdowns(): void {
    for (const side of ['L', 'R'] as const) {
      const p = this.bot.contacts().feet[side]
      const clearance = this.bot.footClearance(side) - this.contactEffects.height(p.x, p.z)
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
        this.contactEffects.burst(_at.set(p.x, p.y - clearance, p.z), 0.8, 12)
        this.shake = Math.max(this.shake, 0.12)
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

const _up = new Vector3(0, 1, 0)
const _at = new Vector3()
const _hand = new Vector3()
const _knee = new Vector3()
const _centre = new Vector3()
