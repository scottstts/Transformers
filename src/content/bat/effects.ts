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
import { BAT_LIGHTS } from './materials'
import { BatAudio } from './audio/engine'
import { Afterburner } from './fx/afterburner'

type Side = 'R' | 'L'

/** Camera shake of a running leap landing on one foot. */
const LEAP_SHAKE = 0.3
/** Tread widths (m): the fat turf fronts and the swampers. */
const TYRE_WIDTH = { front: 0.52, rear: 0.47 }
/** A foot is down below this clearance and has lifted above the second (m). */
const PLANTED = 0.03
const LIFTED = 0.12
/** Camera rumble per m/s of tread slide, and its ceiling. */
const SLIDE_SHAKE = 0.006
const SLIDE_SHAKE_MAX = 0.06
/** Tail lights while braking (share of their full level). */
const BRAKE_LIGHT = 1.9
/** The car's boost: afterburner throttle at a light and at a full foot on the throttle. */
const BOOST_BURN: [number, number] = [0.7, 1]
/** Nozzle metal heating and cooling behind the burn (1/s). */
const HEAT_RISE = 1.8
const HEAT_FALL = 0.45
/** Camera rumble at full burn. */
const BURN_SHAKE = 0.05

/**
 * Effects of the Bat (the Tumbler): transformation cues from the exported
 * mechanism events, dust where the tyres leave the ground and wherever a foot
 * or fist comes down during the gargoyle rise (read from the posed soles, so
 * it holds both ways), tyre dust and tracks, the lights and the eyes, and the
 * afterburner: the car's boost lights it (Shift with the throttle on), and in
 * robot form the fight drives it (`burn`), its nozzle on the robot's back.
 */
export class BatEffects implements CharacterEffects {
  private readonly bot: TransformerModel
  private readonly contactEffects: ContactEffects
  readonly audio: BatAudio
  readonly object = new Group()
  readonly afterburner: Afterburner
  private readonly cues: Cue[]
  private readonly rise: MechanismEvent | undefined
  private readonly eyes: [number, number]
  private readonly duration: number
  private readonly tyres: Tyres
  private readonly pendingSteps: Array<[Side, number]> = []
  private readonly sole: Sole = { center: new Vector3(), forward: new Vector3(), length: 0, width: 0 }
  private readonly planted: Record<Side, boolean> = { L: true, R: true }
  private shake = 0
  private heat = 0
  private time = 0
  /** the fight's throttle for the jet (robot form), or null: the car's boost drives it */
  burn: number | null = null
  /** 0..1 the eyes flared past their running level (a special) */
  eyeBoost = 0

  constructor(bot: TransformerModel, contactEffects: ContactEffects, events: MechanismEvent[], duration: number, mix: AudioMix) {
    this.bot = bot
    this.contactEffects = contactEffects
    this.audio = new BatAudio(mix)
    this.cues = buildCues(events)
    this.rise = events.find((e) => e.name === 'rig:rise')
    // the eyes come on as the head settles out of its cowl (the neck's last stroke)
    const neck = events.filter((e) => e.name === 'rig:neck').at(-1)
    this.eyes = neck ? [neck.t0, neck.t1] : [0.9, 0.97]
    this.duration = duration
    this.tyres = new Tyres(bot, TYRE_WIDTH)
    this.afterburner = new Afterburner(bot.node('asm:pod'))
    this.object.add(this.afterburner.object)
  }

  addFootstep(side: Side, running: number): void {
    this.audio.footstep(0.8 + running * 0.7)
    this.plantFoot(side, running)
  }

  plantFoot(side: Side, running: number): void {
    const strength = 0.8 + running * 0.7
    this.shake = Math.min(this.shake + 0.05 + running * 0.06, 0.25)
    this.pendingSteps.push([side, strength])
  }

  takeoff(): void {
    this.audio.footstep(1.1)
    this.shake = Math.max(this.shake, 0.12)
    this.dustBurst('feet', 0.9, 16)
  }

  /** Lands on both feet together, hard; a leap lands on its lead foot. */
  land(lead: Side | null): void {
    if (lead) {
      this.addFootstep(lead, 1)
      this.audio.footstep(1.3)
      this.shake = Math.max(this.shake, LEAP_SHAKE)
      return
    }
    this.addFootstep('L', 1)
    this.addFootstep('R', 1)
    this.audio.footstep(1.6)
    this.shake = 0.45
    this.dustBurst('feet', 1.4, 24)
  }

  timeline(previous: number, current: number): void {
    if (previous === current) return
    const forward = current > previous
    if ((forward && previous <= 0) || (!forward && previous >= 1)) this.audio.power()
    crossedCues(this.cues, previous, current, (event) => this.audio.mechanism(event, (event.t1 - event.t0) * this.duration))
    // the wheels draw up off the sand once the feet and fists take the weight (and set down again in reverse)
    const rise = this.rise
    if (rise && (forward ? previous < rise.t1 && current >= rise.t1 : previous > rise.t1 && current <= rise.t1)) this.dustBurst('wheels', 0.7, 18)
  }

  update(dt: number, state: MotionState): void {
    this.time += dt
    const t = state.progress
    const car = t === 0
    const braking = car && state.throttle < 0 && state.speed > 0.3 ? 1 : 0
    BAT_LIGHTS.tail.value = 1 + (BRAKE_LIGHT - 1) * braking
    // the markers blink while it transforms; the lamps become the chest chevron's, dimmer
    BAT_LIGHTS.marker.value = t > 0 && t < 1 ? (Math.sin(this.time * Math.PI * 2 * 1.4) > 0 ? 1 : 0.1) : 1
    BAT_LIGHTS.head.value = 1 - 0.5 * easedRange(t, 0.4, 0.85)
    BAT_LIGHTS.eyes.value = easedRange(t, this.eyes[0], this.eyes[1]) * (t > this.eyes[0] && t < this.eyes[1] ? (Math.random() > 0.3 ? 1 : 0.25) : 1) * (1 + 0.9 * this.eyeBoost)

    const contacts = this.bot.contacts()
    let slide = 0
    if (car) {
      this.tyres.update(state, this.contactEffects, dt)
      slide = Math.max(this.tyres.slideRear, this.tyres.slideFront)
      this.shake = Math.max(this.shake, Math.min(SLIDE_SHAKE_MAX, slide * SLIDE_SHAKE))
      this.shake = Math.max(this.shake, Math.min(0.6, this.tyres.landing * 0.07))
    }
    if (t > 0 && t < 1) this.touchdowns()

    // the jet: the fight's burn in robot form, the boost in car form
    const jet = this.afterburner
    jet.target = this.burn ?? (car && state.boost ? BOOST_BURN[0] + (BOOST_BURN[1] - BOOST_BURN[0]) * Math.max(0, state.throttle) : 0)
    jet.floor = this.contactEffects.height(jet.lip.x, jet.lip.z)
    const glow = jet.update(dt)
    if (jet.impingement > 0.02) this.contactEffects.blast(jet.impact, jet.impingement, dt)
    this.heat += (glow - this.heat) * (1 - Math.exp(-dt * (glow > this.heat ? HEAT_RISE : HEAT_FALL)))
    BAT_LIGHTS.nozzle.value = Math.max(this.heat, glow * 0.6)
    this.shake = Math.max(this.shake, jet.power * BURN_SHAKE)

    while (this.pendingSteps.length) {
      const [side, strength] = this.pendingSteps.pop()!
      this.contactEffects.burst(contacts.feet[side], strength, Math.round(18 + 16 * strength))
      const sole = this.bot.sole(side, this.sole)
      this.contactEffects.footprint(sole.center, sole.forward, sole.length, sole.width, 0.8 + 0.25 * strength)
    }
    this.contactEffects.update(dt)
    this.audio.drive(dt, state.speed - state.spinRear, state.throttle, car, slide)
    this.audio.transforming(t > 0 && t < 1)
    this.audio.jet.update(jet.power, jet.impingement)
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
