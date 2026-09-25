import type { Side } from './pose'
import { SIDES } from './pose'

/**
 * The fighting feet on the ground, in world space: a foot is planted where it
 * last landed until a step lifts it, so whatever the body does above them
 * (lunging, turning, a thruster charge) the planted feet never skate. A step
 * carries the foot on a lifted arc (toe-off, then toe up for the heel strike)
 * to its landing place; a step with no lift drags it along the ground (a
 * skid). A step that starts while the foot is still moving starts from where
 * it is.
 */
export interface FootPlace {
  x: number
  z: number
  /** toe heading (rad, world yaw as the game uses it: 0 faces +z) */
  yaw: number
}

/** A kick's apex: a ground place, its height (m), the foot's yaw there and the toe's point (rad). */
export interface KickVia extends FootPlace {
  up: number
  point: number
}

interface Foot extends FootPlace {
  from: FootPlace
  to: FootPlace
  t0: number
  t1: number
  lift: number
  moving: boolean
  via: KickVia | null
}

/** What a foot is doing this frame: its ground place, lift (m) and pitch (rad, + toe down). */
export interface FootSample extends FootPlace {
  up: number
  pitch: number
  /** m/s over the ground while it drags (a skid), else 0 */
  skid: number
}

const smooth = (u: number): number => u * u * (3 - 2 * u)
const place = (): FootPlace => ({ x: 0, z: 0, yaw: 0 })

export class FootPlanner {
  private clock = 0
  private readonly feet: Record<Side, Foot> = {
    R: { ...place(), from: place(), to: place(), t0: 0, t1: 0, lift: 0, moving: false, via: null },
    L: { ...place(), from: place(), to: place(), t0: 0, t1: 0, lift: 0, moving: false, via: null },
  }
  private readonly out: Record<Side, FootSample> = {
    R: { ...place(), up: 0, pitch: 0, skid: 0 },
    L: { ...place(), up: 0, pitch: 0, skid: 0 },
  }

  /** Plant both feet where they are (the combo starts). */
  plant(side: Side, at: FootPlace): void {
    const f = this.feet[side]
    Object.assign(f, at)
    f.moving = false
  }

  /** Lift `side` now and land it on `to` after `duration` s (through `via` for a kick). */
  step(side: Side, to: FootPlace, duration: number, lift: number, via: KickVia | null = null): void {
    const f = this.feet[side]
    const now = this.sample(side)
    f.from.x = now.x
    f.from.z = now.z
    f.from.yaw = now.yaw
    Object.assign(f.to, to)
    f.t0 = this.clock
    f.t1 = this.clock + Math.max(duration, 1e-3)
    f.lift = lift
    f.moving = true
    f.via = via
  }

  /** Advance the clock; `onLand` hears each foot that lands (and whether it was a skid). */
  update(dt: number, onLand: (side: Side, skid: boolean) => void): void {
    this.clock += dt
    for (const side of SIDES) {
      const f = this.feet[side]
      if (f.moving && this.clock >= f.t1) {
        f.moving = false
        f.x = f.to.x
        f.z = f.to.z
        f.yaw = f.to.yaw
        onLand(side, f.lift <= 0)
      }
    }
  }

  get stepping(): boolean {
    return this.feet.R.moving || this.feet.L.moving
  }

  sample(side: Side): FootSample {
    const f = this.feet[side]
    const o = this.out[side]
    o.skid = 0
    if (!f.moving) {
      o.x = f.x
      o.z = f.z
      o.yaw = f.yaw
      o.up = 0
      o.pitch = 0
      return o
    }
    const u = Math.min(1, Math.max(0, (this.clock - f.t0) / (f.t1 - f.t0)))
    if (f.via) return this.kick(f, f.via, u, o)
    const k = smooth(u)
    o.x = f.from.x + (f.to.x - f.from.x) * k
    o.z = f.from.z + (f.to.z - f.from.z) * k
    let dy = f.to.yaw - f.from.yaw
    dy = Math.atan2(Math.sin(dy), Math.cos(dy))
    o.yaw = f.from.yaw + dy * smooth(u)
    if (f.lift > 0) {
      // lifts early (the knee drives), lands on the heel with the toe up
      const a = Math.sin(Math.PI * Math.min(1, u * 1.15))
      o.up = f.lift * a * a
      const s = Math.min(1, f.lift / 0.25)
      o.pitch = s * (0.35 * Math.sin(Math.PI * Math.min(1, u / 0.45)) * (u < 0.45 ? 1 : 0) - 0.22 * Math.sin(Math.PI * Math.max(0, (u - 0.55) / 0.45)))
    } else {
      o.up = 0
      o.pitch = 0
      o.skid = Math.hypot(f.to.x - f.from.x, f.to.z - f.from.z) * 6 * u * (1 - u) / (f.t1 - f.t0)
    }
    return o
  }

  /**
   * A kick: a quadratic through the apex at the middle of the step (its control
   * point set so the curve passes the apex), the height held near the top (the
   * leg stays chambered and extended rather than bobbing), the toe pointing and
   * the foot turning into the apex and back.
   */
  private kick(f: Foot, via: KickVia, u: number, o: FootSample): FootSample {
    const s = smooth(u)
    const cx = 2 * via.x - (f.from.x + f.to.x) / 2
    const cz = 2 * via.z - (f.from.z + f.to.z) / 2
    const a = (1 - s) * (1 - s), b = 2 * s * (1 - s), c = s * s
    o.x = a * f.from.x + b * cx + c * f.to.x
    o.z = a * f.from.z + b * cz + c * f.to.z
    const arch = Math.pow(Math.sin(Math.PI * u), 0.6)
    o.up = via.up * arch
    const turn = (y: number): number => Math.atan2(Math.sin(y), Math.cos(y))
    const yaw = u < 0.5 ? f.from.yaw + turn(via.yaw - f.from.yaw) * smooth(u * 2) : via.yaw + turn(f.to.yaw - via.yaw) * smooth(u * 2 - 1)
    o.yaw = yaw
    o.pitch = via.point * arch
    o.skid = 0
    return o
  }
}
