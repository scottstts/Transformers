import { Group, Vector3, type PerspectiveCamera } from 'three/webgpu'
import { Tyres } from '../transformer/tyres'
import { Thrusters } from './fx/thrusters'
import { U } from './materials.ts'
import { CybertruckAudio } from './audio/engine.ts'
import type { TransformerModel, Sole } from '../transformer/model/transformer'
import type { MechanismEvent } from '../transformer/asset/format'
import { buildCues, crossedCues, type Cue } from '../transformer/cues'
import type { CharacterEffects } from '../transformer/character'
import type { AudioMix } from '../../audio/mix'
import { easedRange } from '../../game/math'
import type { MotionState } from '../../game/types'
import type { ContactEffects } from '../../game/contact-effects'

type Side = 'R' | 'L'

/** Camera shake of a running leap landing on one foot. */
const LEAP_SHAKE = 0.3

/** Tread width of the tyres (m). */
const TYRE_WIDTH = 0.32
/** Camera rumble per m/s of tread slide, and its ceiling. */
const SLIDE_SHAKE = 0.006
const SLIDE_SHAKE_MAX = 0.06

export class CybertruckEffects implements CharacterEffects {
  private readonly bot: TransformerModel
  private readonly contactEffects: ContactEffects
  readonly audio: CybertruckAudio
  readonly thrusters: Thrusters
  readonly object = new Group()
  private readonly cues: Cue[]
  private readonly rise: MechanismEvent | undefined
  private readonly head: MechanismEvent | undefined
  private readonly duration: number
  private readonly tyres: Tyres
  private readonly pendingSteps: Array<[Side, number]> = []
  private readonly sole: Sole = { center: new Vector3(), forward: new Vector3(), length: 0, width: 0 }
  private shake = 0
  /** 0..1 the visor flared past its running level (a special) */
  visorBoost = 0

  constructor(bot: TransformerModel, contactEffects: ContactEffects, events: MechanismEvent[], duration: number, mix: AudioMix) {
    this.audio = new CybertruckAudio(mix)
    this.bot = bot
    this.contactEffects = contactEffects
    this.cues = buildCues(events)
    this.rise = events.find((e) => e.name === 'rig:rise')
    this.head = events.find((e) => e.name === 'rig:neck')
    this.duration = duration
    this.thrusters = new Thrusters(bot)
    this.tyres = new Tyres(bot, { front: TYRE_WIDTH, rear: TYRE_WIDTH })
    this.object.add(this.thrusters.object)
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

  /** Robot jump leaves the ground: both legs drive off. */
  takeoff(): void {
    this.audio.footstep(1.1)
    this.shake = Math.max(this.shake, 0.12)
    this.dustBurst('feet', 0.9, 16)
  }

  /** Robot jump lands: both feet strike together, hard; a leap lands on its lead foot. */
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
    const crossed = (value: number): boolean => forward ? previous < value && current >= value : previous > value && current <= value
    crossedCues(this.cues, previous, current, (event) => this.audio.mechanism(event, (event.t1 - event.t0) * this.duration))
    const rise = this.rise
    if (rise) {
      if (crossed(forward ? rise.t0 : rise.t1)) this.dustBurst(forward ? 'wheels' : 'feet', 0.8, 20)
      if (crossed(forward ? rise.t1 : rise.t0)) {
        this.shake = forward ? 0.35 : 0.3
        this.dustBurst(forward ? 'feet' : 'wheels', 1.3, 36)
      }
    }
  }

  update(dt: number, state: MotionState): void {
    const t = state.progress
    U.frontLight.value = t > 0 && t < 0.06 ? (Math.sin(t * 260) > 0 ? 1 : 0.15) : 1
    U.rearLight.value = 1
    const h0 = this.head ? this.head.t0 : 0.8
    const h1 = this.head ? this.head.t1 : 0.95
    U.visor.value = easedRange(t, h0 + (h1 - h0) * 0.4, h1) * (t > h0 && t < h1 ? (Math.random() > 0.35 ? 1 : 0.2) : 1) * (1 + 0.8 * this.visorBoost)
    U.core.value = easedRange(t, 0.4, 0.6) * (0.85 + 0.15 * Math.sin(performance.now() * 0.003))

    const contacts = this.bot.contacts()
    const car = t === 0
    let slide = 0
    if (car) {
      this.tyres.update(state, this.contactEffects, dt)
      slide = Math.max(this.tyres.slideRear, this.tyres.slideFront)
      this.shake = Math.max(this.shake, Math.min(SLIDE_SHAKE_MAX, slide * SLIDE_SHAKE))
    }

    const jets = this.thrusters
    jets.update(t, dt)
    if (jets.impingement > 0.02) this.contactEffects.blast(jets.impact, jets.impingement, dt)
    this.shake = Math.max(this.shake, jets.power * 0.05)
    while (this.pendingSteps.length) {
      const [side, strength] = this.pendingSteps.pop()!
      this.contactEffects.burst(contacts.feet[side], strength, Math.round(18 + 16 * strength))
      const sole = this.bot.sole(side, this.sole)
      this.contactEffects.footprint(sole.center, sole.forward, sole.length, sole.width, 0.8 + 0.25 * strength)
    }
    this.contactEffects.update(dt)
    this.audio.drive(state.speed - state.spinRear, state.throttle, car, slide)
    this.audio.transforming(t > 0 && t < 1)
    this.audio.rocket(jets.power, jets.impingement)
  }

  shakeCamera(camera: PerspectiveCamera, dt: number): void {
    if (this.shake <= 0) return
    camera.position.y += (Math.random() - 0.5) * this.shake * 0.25
    camera.position.x += (Math.random() - 0.5) * this.shake * 0.12
    this.shake = Math.max(0, this.shake - dt * 1.4)
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
