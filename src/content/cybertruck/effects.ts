import type { PerspectiveCamera } from 'three/webgpu'
import { Vector3 } from 'three/webgpu'
import { Thrusters } from './fx/thrusters'
import { U } from './materials.ts'
import { CybertruckAudio } from './audio/engine.ts'
import type { CybertruckModel, Sole } from './model/transformer.ts'
import type { MechanismEvent } from './asset/format'
import { easedRange } from '../../game/math'
import type { MotionState } from '../../game/types'
import type { ContactEffects } from '../../game/contact-effects'

type Side = 'R' | 'L'

/** Tread width of the tyres (m). */
const TYRE_WIDTH = 0.32

interface Cue {
  event: MechanismEvent
}

/**
 * Transformation cues from the exported mechanism events: each stroke starts
 * its sound when T crosses its start (its end, running backwards). Mirrored
 * L/R strokes merge into one wider voice and lifter strokes that start
 * together share one hydraulic voice.
 */
export function buildCues(events: MechanismEvent[]): Cue[] {
  const merged = new Map<string, Cue>()
  for (const e of events) {
    const lifter = e.name.startsWith('lift:')
    const base = lifter ? 'lift' : e.name.replace(/\.(L|R)$/, '')
    const key = lifter ? `lift@${Math.round(e.t0 * 50)}` : `${base}|${e.kind}|${e.t0}|${e.t1}`
    const found = merged.get(key)
    if (found) {
      found.event = { ...found.event, side: 0, size: found.event.size * (lifter ? 1 : 1.3), t1: Math.max(found.event.t1, e.t1) }
    } else {
      merged.set(key, { event: { ...e, name: base } })
    }
  }
  return [...merged.values()].sort((a, b) => a.event.t0 - b.event.t0)
}

export class CybertruckEffects {
  private readonly bot: CybertruckModel
  private readonly contactEffects: ContactEffects
  readonly audio = new CybertruckAudio()
  readonly thrusters: Thrusters
  private readonly cues: Cue[]
  private readonly rise: MechanismEvent | undefined
  private readonly head: MechanismEvent | undefined
  private readonly duration: number
  private readonly forward = new Vector3()
  private readonly pendingSteps: Array<[Side, number]> = []
  private readonly sole: Sole = { center: new Vector3(), forward: new Vector3(), length: 0, width: 0 }
  private shake = 0

  constructor(bot: CybertruckModel, contactEffects: ContactEffects, events: MechanismEvent[], duration: number) {
    this.bot = bot
    this.contactEffects = contactEffects
    this.cues = buildCues(events)
    this.rise = events.find((e) => e.name === 'rig:rise')
    this.head = events.find((e) => e.name === 'rig:neck')
    this.duration = duration
    this.thrusters = new Thrusters(bot)
  }

  addFootstep(side: Side, running: number): void {
    const strength = 0.8 + running * 0.7
    this.audio.footstep(strength)
    this.shake = Math.min(this.shake + 0.05 + running * 0.06, 0.25)
    this.pendingSteps.push([side, strength])
  }

  timeline(previous: number, current: number): void {
    if (previous === current) return
    const forward = current > previous
    if ((forward && previous <= 0) || (!forward && previous >= 1)) this.audio.power()
    const crossed = (value: number): boolean => forward ? previous < value && current >= value : previous > value && current <= value
    for (const { event } of this.cues) {
      if (crossed(forward ? event.t0 : event.t1)) this.audio.mechanism(event, (event.t1 - event.t0) * this.duration)
    }
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
    U.visor.value = easedRange(t, h0 + (h1 - h0) * 0.4, h1) * (t > h0 && t < h1 ? (Math.random() > 0.35 ? 1 : 0.2) : 1)
    U.core.value = easedRange(t, 0.4, 0.6) * (0.85 + 0.15 * Math.sin(performance.now() * 0.003))

    const contacts = this.bot.contacts()
    if (t === 0) {
      this.forward.set(Math.sin(state.yaw), 0, Math.cos(state.yaw))
      contacts.wheels.forEach((wheel, k) => {
        this.contactEffects.wheel(wheel.p, this.forward, state.speed * (wheel.front ? 0.7 : 1), state.slip * (wheel.front ? 0.5 : 1), dt)
        this.contactEffects.tread(k, wheel.p, TYRE_WIDTH, state.slip * (wheel.front ? 0.5 : 1))
      })
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
    this.audio.drive(state.speed, state.throttle, t === 0)
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
