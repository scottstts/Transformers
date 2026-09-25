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
import { F1_LIGHTS } from './materials'
import { F1Audio } from './audio/engine'

type Side = 'R' | 'L'

/** Camera shake of a running leap landing on one foot. */
const LEAP_SHAKE = 0.2

/** Tread widths (m): 305 mm front, 405 mm rear. */
const TYRE_WIDTH = { front: 0.305, rear: 0.405 }
/** A foot is down below this clearance and has lifted above the second (m). */
const PLANTED = 0.02
const LIFTED = 0.1
/** Rain-light flash rate while the car harvests energy (lift-off and braking), Hz. */
const HARVEST_FLASH_HZ = 4
/** The robot is lighter than the truck: its footfalls shake the camera less. */
const STEP_SHAKE = 0.7
/** Camera rumble per m/s of tread slide, and its ceiling: a stiff, light car. */
const SLIDE_SHAKE = 0.004
const SLIDE_SHAKE_MAX = 0.04

/**
 * Effects of the Ferrari F1: transformation cues from the exported mechanism
 * events, dust and a footfall where a foot touches down during the
 * transformation (detected from the posed soles, so it holds both ways), tyre
 * dust and tracks in car form, the rain light and the robot's eyes.
 */
export class F1Effects implements CharacterEffects {
  private readonly bot: TransformerModel
  private readonly contactEffects: ContactEffects
  readonly audio: F1Audio
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
  /**
   * A fight's ERS burst driving the power unit in robot form (road speed it is
   * geared for, m/s, and throttle), or null: the power unit follows the car.
   */
  rev: { speed: number; throttle: number; neutral?: number } | null = null
  /** 0..1 the eyes and visor flared past their running level (a special) */
  eyeBoost = 0

  constructor(bot: TransformerModel, contactEffects: ContactEffects, events: MechanismEvent[], duration: number, mix: AudioMix) {
    this.bot = bot
    this.contactEffects = contactEffects
    this.audio = new F1Audio(mix)
    this.cues = buildCues(events)
    this.rise = events.find((e) => e.name === 'rig:rise')
    // the eyes come on as the helmet settles onto the neck
    const helmet = events.find((e) => e.name === 'stow:R.head.helmet')
    this.eyes = helmet ? [helmet.t0 + (helmet.t1 - helmet.t0) * 0.3, helmet.t1] : [0.9, 0.98]
    this.duration = duration
    this.tyres = new Tyres(bot, TYRE_WIDTH)
  }

  addFootstep(side: Side, running: number): void {
    this.audio.footstep(0.8 + running * 0.7)
    this.plantFoot(side, running)
  }

  plantFoot(side: Side, running: number): void {
    const strength = 0.8 + running * 0.7
    this.shake = Math.min(this.shake + (0.05 + running * 0.06) * STEP_SHAKE, 0.2)
    this.pendingSteps.push([side, strength])
  }

  takeoff(): void {
    this.audio.footstep(1)
    this.shake = Math.max(this.shake, 0.08)
    this.dustBurst('feet', 0.7, 14)
  }

  /** Lands on both feet together, hard; a leap lands on its lead foot. */
  land(lead: Side | null): void {
    if (lead) {
      this.addFootstep(lead, 1)
      this.audio.footstep(1.2)
      this.shake = Math.max(this.shake, LEAP_SHAKE)
      return
    }
    this.addFootstep('L', 1)
    this.addFootstep('R', 1)
    this.audio.footstep(1.4)
    this.shake = 0.32
    this.dustBurst('feet', 1.1, 20)
  }

  timeline(previous: number, current: number): void {
    if (previous === current) return
    const forward = current > previous
    if ((forward && previous <= 0) || (!forward && previous >= 1)) this.audio.power()
    crossedCues(this.cues, previous, current, (event) => this.audio.mechanism(event, (event.t1 - event.t0) * this.duration))
    // the car settles off its tyres as the robot starts to sit up (and back onto them in reverse)
    const rise = this.rise
    if (rise && (forward ? previous < rise.t0 && current >= rise.t0 : previous > rise.t0 && current <= rise.t0)) this.dustBurst('wheels', 0.6, 16)
  }

  update(dt: number, state: MotionState): void {
    this.time += dt
    const t = state.progress
    const car = t === 0
    // the rain light flashes while the car harvests energy, and while a fight deploys it
    const harvesting = (car && Math.abs(state.speed) > 5 && state.throttle <= 0) || this.rev !== null
    F1_LIGHTS.rain.value = harvesting ? (Math.sin(this.time * Math.PI * 2 * HARVEST_FLASH_HZ) > 0 ? 1 : 0.08) : 1
    F1_LIGHTS.eyes.value = easedRange(t, this.eyes[0], this.eyes[1]) * (1 + 0.7 * this.eyeBoost)
    F1_LIGHTS.core.value = easedRange(t, 0.4, 0.6)

    const contacts = this.bot.contacts()
    let slide = 0
    if (car) {
      this.tyres.update(state, this.contactEffects, dt)
      slide = Math.max(this.tyres.slideRear, this.tyres.slideFront)
      this.shake = Math.max(this.shake, Math.min(SLIDE_SHAKE_MAX, slide * SLIDE_SHAKE))
    }
    if (t > 0 && t < 1) this.touchdowns()

    while (this.pendingSteps.length) {
      const [side, strength] = this.pendingSteps.pop()!
      this.contactEffects.burst(contacts.feet[side], strength, Math.round(14 + 12 * strength))
      const sole = this.bot.sole(side, this.sole)
      this.contactEffects.footprint(sole.center, sole.forward, sole.length, sole.width, 0.7 + 0.25 * strength)
    }
    this.contactEffects.update(dt)
    const rev = this.rev
    if (rev) this.audio.drive(dt, rev.speed, rev.throttle, true, true, 0, rev.neutral)
    else this.audio.drive(dt, state.speed - state.spinRear, state.throttle, state.boost, car, slide)
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
