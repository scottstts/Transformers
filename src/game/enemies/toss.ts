import { SC, blend } from '../../content/soldier/poses'

/** Flight coasts; ground contact brakes the surviving momentum (1/s). */
const AIR_DRAG = 0.45
const GROUND_BRAKE = 5.5
const TIP = 80 * Math.PI / 180
/** Bound repeated kicks without imposing a landing point or stopping distance (m/s at soldier weight). */
export const TOSS_SPEED_LIMIT = 34

/** Stable independent variation, evaluated at impact rather than every frame. */
export function throwVariation(serial: number, channel: number): number {
  let n = Math.imul(serial + 1, 0x9e3779b1) ^ Math.imul(channel + 1, 0x85ebca6b)
  n = Math.imul(n ^ n >>> 16, 0x7feb352d)
  n = Math.imul(n ^ n >>> 15, 0x846ca68b)
  return ((n ^ n >>> 16) >>> 0) / 0x100000000
}

/**
 * Rule 7's crowd throw: momentum, a ballistic hop and an off-balance body.
 * Limbs stay loose throughout flight; only ground contact starts the catch.
 * Exact drag integration crosses landing without assigning a destination.
 * The horde can change velocity through wall/body contacts at any time.
 */
export class TossReaction {
  time = 0
  flight = 0
  advance = 0
  decay = 1
  y = 0
  vy = 0
  tipX = 0
  tipY = 0
  tipZ = 0
  private lift = 0
  private gravity = 9.8
  private share = 1
  private along = 0
  private across = 0
  private form = 0.5
  private phase = 0
  private catchTime = 0.3

  get airborne(): boolean { return this.time < this.flight }
  /** Footing is restored; the owner also waits for harmless ground speed. */
  get done(): boolean { return this.time >= this.flight + this.catchTime }

  reset(): void {
    this.time = this.flight = this.advance = this.y = this.vy = this.tipX = this.tipY = this.tipZ = 0
    this.decay = 1
    this.lift = this.along = this.across = this.phase = 0
    this.gravity = 9.8
    this.share = 1
    this.form = 0.5
    this.catchTime = 0.3
  }

  start(lift: number, gravity: number, share: number, along: number, across: number, serial = 0): void {
    this.reset()
    this.lift = lift
    this.gravity = gravity
    this.share = share
    this.along = along
    this.across = across
    this.form = throwVariation(serial, 2)
    this.phase = throwVariation(serial, 3) * Math.PI * 2
    this.catchTime = 0.24 + 0.12 * throwVariation(serial, 4)
    this.flight = 2 * lift / gravity
    this.vy = lift
  }

  redirect(along: number, across: number): void {
    this.along = along
    this.across = across
  }

  update(dt: number): void {
    const air = Math.min(dt, Math.max(0, this.flight - this.time))
    const ground = dt - air
    const airDecay = Math.exp(-AIR_DRAG * air)
    const groundDecay = Math.exp(-GROUND_BRAKE * ground)
    this.decay = airDecay * groundDecay
    this.advance = (1 - airDecay) / AIR_DRAG + airDecay * (1 - groundDecay) / GROUND_BRAKE
    this.time += dt
    const t = Math.min(this.time, this.flight)
    this.y = this.airborne ? Math.max(0, t * (this.lift - this.gravity * t / 2)) : 0
    this.vy = this.airborne ? this.lift - this.gravity * t : 0
    const catchU = Math.max(0, Math.min(1, (this.time - this.flight) / this.catchTime))
    const balance = 1 - catchU * catchU * (3 - 2 * catchU)
    // Snap off-axis at impact, then drift further while airborne. Never
    // straighten in anticipation of landing or accumulate a full tumble.
    const snap = 1 - Math.exp(-55 * t)
    const tip = Math.min(Math.PI * 0.49, TIP * (0.8 + 0.25 * this.form) + t * 0.2) * snap * this.share * balance
    this.tipX = this.along * tip
    this.tipY = this.across * tip
    this.tipZ = (this.form - 0.5) * 0.65 * snap * this.share * balance
  }

  /** Authored grip stays intact; loose arms, knees and head trail independently. */
  pose(out: Float32Array, ready: Float32Array, flung: Float32Array, height: number): void {
    const catchU = Math.max(0, Math.min(1, (this.time - this.flight) / this.catchTime))
    const loose = (1 - Math.exp(-60 * this.time)) * (1 - catchU * catchU * (3 - 2 * catchU))
    blend(out, ready, flung, loose)
    const a = Math.sin(this.time * 8 + this.phase)
    const b = Math.sin(this.time * 6.1 + this.phase + 1.6)
    const flail = loose * this.share
    out[SC.twist] += (this.form - 0.5) * 30 * flail
    out[SC.side] += 12 * a * flail
    out[SC.headPitch] += 12 * b * flail
    out[SC['R.pitch']] += 18 * a * flail
    out[SC['R.elbow']] += 12 * b * flail
    out[SC['L.pitch']] += 24 * b * flail
    out[SC['L.out']] += 14 * a * flail
    out[SC['R.thigh']] += 20 * b * flail
    out[SC['R.knee']] += 14 * a * flail
    out[SC['L.thigh']] -= 18 * a * flail
    out[SC['L.knee']] += 16 * b * flail
    out[SC.crouch] += height * 0.035 * Math.sin(Math.PI * catchU) * this.share
  }
}
