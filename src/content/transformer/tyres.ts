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
 */
export class Tyres {
  private readonly bot: TransformerModel
  private readonly widths: TyreWidths
  private readonly contacts: TyreContact[] = []
  /** fastest tread slide over the ground last frame (m/s), rear and front */
  slideRear = 0
  slideFront = 0

  constructor(bot: TransformerModel, widths: TyreWidths) {
    this.bot = bot
    this.widths = widths
  }

  update(state: MotionState, surface: ContactEffects, dt: number): void {
    const wheels = this.bot.contacts().wheels
    this.slideRear = 0
    this.slideFront = 0
    for (let k = 0; k < wheels.length; k++) {
      const wheel = wheels[k]
      const c = this.contacts[k] ??= { point: new Vector3(), heading: new Vector3(), velocity: new Vector3(), slide: new Vector3(), width: 0 }
      c.point.copy(wheel.p)
      c.width = wheel.front ? this.widths.front : this.widths.rear
      const slide = contactMotion(state, c.point, wheel.front, c.velocity, c.slide, c.heading)
      if (wheel.front) this.slideFront = Math.max(this.slideFront, slide)
      else this.slideRear = Math.max(this.slideRear, slide)
      surface.tyre(k, c, dt)
    }
  }
}
