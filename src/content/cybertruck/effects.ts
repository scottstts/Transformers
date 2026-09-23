import { Vector3 } from 'three/webgpu'
import { DURATION, EVENTS } from './animation/choreography.ts'
import { U } from './materials.ts'
import { CybertruckAudio } from './audio/engine.ts'
import { CybertruckModel } from './model/transformer.ts'
import { easedRange } from '../../game/math'
import type { MotionState } from '../../game/types'
import type { ContactEffects } from '../../game/contact-effects'

type Side = 'R' | 'L'
type MechanicalEvent = [string, number, number, string]

export class CybertruckEffects {
  private readonly bot: CybertruckModel
  private readonly contactEffects: ContactEffects
  readonly audio = new CybertruckAudio()
  private readonly forward = new Vector3()
  private readonly pendingSteps: Array<[Side, number]> = []
  private shake = 0

  constructor(bot: CybertruckModel, contactEffects: ContactEffects) {
    this.bot = bot
    this.contactEffects = contactEffects
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
    if (forward && previous <= 0 && current > 0) this.audio.wake(false)
    if (!forward && previous >= 1 && current < 1) this.audio.wake(true)
    for (const [id, startTime, endTime, kind] of EVENTS as MechanicalEvent[]) {
      const start = forward ? startTime : endTime
      const end = forward ? endTime : startTime
      const crossed = (value: number): boolean => forward ? previous < value && current >= value : previous > value && current <= value
      if (crossed(start)) {
        this.audio.actuator(kind, (endTime - startTime) * DURATION, !forward)
        if (id === 'situp') this.dustBurst('wheels', 0.8, 18)
      }
      if (crossed(end)) {
        this.audio.locked(kind)
        if (id === 'situp' && !forward) { this.shake = 0.4; this.dustBurst('wheels', 1.4, 30) }
        if (id === 'feet' && forward) { this.shake = 0.3; this.dustBurst('feet', 1.2, 40) }
        if (id === 'rise' && !forward) this.dustBurst('feet', 0.8, 24)
        if (id === 'settle' && forward) this.dustBurst('feet', 0.7, 20)
      }
    }
  }

  update(dt: number, state: MotionState): void {
    const t = state.progress
    U.frontLight.value = t > 0 && t < 0.08 ? (Math.sin(t * 260) > 0 ? 1 : 0.15) : 1
    U.rearLight.value = 1
    U.visor.value = easedRange(t, 0.74, 0.82) * (t > 0.74 && t < 0.82 ? (Math.random() > 0.35 ? 1 : 0.2) : 1)
    U.core.value = easedRange(t, 0.4, 0.6) * (0.85 + 0.15 * Math.sin(performance.now() * 0.003))

    const contacts = this.bot.contacts() as unknown as { wheels: Array<{ p: Vector3; front: boolean }>; feet: Record<Side, Vector3> }
    if (t === 0) {
      this.forward.set(Math.sin(state.yaw), 0, Math.cos(state.yaw))
      for (const wheel of contacts.wheels) {
        this.contactEffects.wheel(wheel.p, this.forward, state.speed * (wheel.front ? 0.7 : 1), state.slip * (wheel.front ? 0.5 : 1), dt)
      }
    }
    while (this.pendingSteps.length) {
      const [side, strength] = this.pendingSteps.pop()!
      this.contactEffects.burst(contacts.feet[side], strength, Math.round(18 + 16 * strength))
    }
    this.contactEffects.update(dt)
    this.audio.drive(state.speed, state.throttle, t === 0)
  }

  shakeCamera(camera: import('three/webgpu').PerspectiveCamera, dt: number): void {
    if (this.shake <= 0) return
    camera.position.y += (Math.random() - 0.5) * this.shake * 0.25
    camera.position.x += (Math.random() - 0.5) * this.shake * 0.12
    this.shake = Math.max(0, this.shake - dt * 1.4)
  }

  private dustBurst(where: 'feet' | 'wheels', strength: number, count: number): void {
    const contacts = this.bot.contacts() as unknown as { wheels: Array<{ p: Vector3; front: boolean }>; feet: Record<Side, Vector3> }
    if (where === 'feet') {
      this.contactEffects.burst(contacts.feet.R, strength, count)
      this.contactEffects.burst(contacts.feet.L, strength, count)
    } else {
      for (const wheel of contacts.wheels) {
        this.contactEffects.burst(wheel.p, strength * (wheel.front ? 0.6 : 1), Math.round(count / 2))
      }
    }
  }
}
