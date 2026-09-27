import { Vector3 } from 'three/webgpu'
import type { ContactEffects, TyreContact } from '../../game/contact-effects'
import { contactMotion } from '../../game/car-dynamics'
import type { MotionState } from '../../game/types'
import type { TransformerModel } from './model/transformer'

/** Tread widths of a car's front and rear tyres (m). */
export interface TyreWidths {
  front: number
  rear: number
}

/**
 * The car's tyres on the ground, each frame in car form: where every contact
 * patch is, how it moves over the ground and how fast its tread slides, handed
 * to the world's surface (tracks, dust, grit). Contacts are reused, nothing is
 * allocated per frame.
 *
 * A trailer's tyres are not on the car's body: their motion is measured from
 * where they were last frame, headed along the trailer, and only sideways
 * sliding counts (they roll free).
 */
export class Tyres {
  private readonly bot: TransformerModel
  private readonly widths: TyreWidths
  private readonly contacts: TyreContact[] = []
  /** last frame's contact points of the trailer's tyres (NaN before the first) */
  private readonly last: Vector3[] = []
  /** fastest tread slide over the ground last frame (m/s), rear and front */
  slideRear = 0
  slideFront = 0
  /** closing speed of a landing this frame (m/s), else 0: the car's effects shake the camera by it */
  landing = 0

  constructor(bot: TransformerModel, widths: TyreWidths) {
    this.bot = bot
    this.widths = widths
  }

  update(state: MotionState, surface: ContactEffects, dt: number): void {
    const wheels = this.bot.contacts().wheels
    this.slideRear = 0
    this.slideFront = 0
    this.landing = state.impact
    // in the air nothing touches: the ribbons end, and the trailer's tyres start afresh
    if (state.airborne) {
      for (const last of this.last) last?.setX(NaN)
      return
    }
    for (let k = 0; k < wheels.length; k++) {
      const wheel = wheels[k]
      const c = this.contacts[k] ??= { point: new Vector3(), heading: new Vector3(), velocity: new Vector3(), slide: new Vector3(), width: 0 }
      c.point.copy(wheel.p)
      c.width = wheel.front ? this.widths.front : this.widths.rear
      const slide = wheel.trailer ? this.trailing(k, c, dt) : contactMotion(state, c.point, wheel.front, c.velocity, c.slide, c.heading)
      if (wheel.front) this.slideFront = Math.max(this.slideFront, slide)
      else this.slideRear = Math.max(this.slideRear, slide)
      surface.tyre(k, c, dt)
      // a landing throws the sand out from under every tyre
      if (state.impact > 1.2) surface.burst(c.point, Math.min(1.4, state.impact / 6), Math.round(6 + 3 * state.impact))
    }
  }

  /** A trailer tyre: its velocity from its last place, headed along the trailer; returns its sideways slide (m/s). */
  private trailing(k: number, c: TyreContact, dt: number): number {
    const last = this.last[k] ??= new Vector3(NaN, 0, 0)
    this.bot.trailerForward(c.heading)
    if (Number.isNaN(last.x) || dt <= 0) c.velocity.set(0, 0, 0)
    else c.velocity.subVectors(c.point, last).divideScalar(dt).setY(0)
    last.copy(c.point)
    // tyre left = heading turned 90 degrees to the left: (hz, -hx)
    const lat = c.velocity.x * c.heading.z - c.velocity.z * c.heading.x
    c.slide.set(c.heading.z * lat, 0, -c.heading.x * lat)
    return Math.abs(lat)
  }
}
