/**
 * Robot jump: anticipation crouch, ballistic flight, landing compression.
 * Gameplay owns the height (the body leaves the ground); the gait turns the
 * phases into a pose (crouch depth, tucked legs, arm swing).
 */

/** Anticipation: the body loads its legs before leaving the ground (s). */
const CROUCH_TIME = 0.36
const LOAD_TIME = 0.18
/** Take-off speed (m/s) and gravity (m/s^2): a heavy, snappy ~1.1 m hop, 0.87 s in the air. */
const TAKEOFF_SPEED = 5.2
const GRAVITY = 12
const AIR_TIME = 2 * TAKEOFF_SPEED / GRAVITY
/** Landing compression and recovery time (s). */
const LAND_TIME = 0.42
const IMPACT_TIME = 0.09

export interface JumpPose {
  /** 0..1 ownership of the pose, eased in during loading and out after impact */
  weight: number
  /** 0..1 leg load: anticipation crouch and landing compression */
  crouch: number
  /** height of the lowest foot above the ground (m) */
  air: number
  /** 0..1 how far the legs are tucked in flight */
  tuck: number
  /** signed arm swing: negative backswing, positive forward/up */
  armSwing: number
  airborne: boolean
  /** true on the frame the body leaves the ground */
  tookOff: boolean
  /** true on the frame it lands */
  landed: boolean
}

export class RobotJump {
  private jumping = false
  private t = 0
  readonly pose: JumpPose = { weight: 0, crouch: 0, air: 0, tuck: 0, armSwing: 0, airborne: false, tookOff: false, landed: false }

  /** True from the anticipation crouch until the landing has settled. */
  get active(): boolean { return this.jumping }

  start(): void {
    if (this.jumping) return
    this.jumping = true
    this.t = 0
  }

  update(dt: number): JumpPose {
    const p = this.pose
    p.tookOff = false
    p.landed = false
    if (!this.jumping) return p
    const previous = this.t
    this.t += dt
    const touchdown = CROUCH_TIME + AIR_TIME
    p.tookOff = previous < CROUCH_TIME && this.t >= CROUCH_TIME
    p.landed = previous < touchdown && this.t >= touchdown
    p.airborne = this.t >= CROUCH_TIME && this.t < touchdown
    p.air = 0
    p.tuck = 0

    if (this.t < CROUCH_TIME) {
      const load = ease(0, LOAD_TIME, this.t)
      const push = ease(LOAD_TIME, CROUCH_TIME, this.t)
      p.weight = load
      p.crouch = load * (1 - 0.9 * push)
      // Arms reverse before the feet leave the ground, not at the phase boundary.
      p.armSwing = -0.65 * load + 1.2 * push
    } else if (p.airborne) {
      const flight = this.t - CROUCH_TIME
      p.weight = 1
      p.air = Math.max(0, TAKEOFF_SPEED * flight - 0.5 * GRAVITY * flight * flight)
      p.crouch = 0.1 * (1 - ease(0, 0.12, flight))
      // Smooth extension -> tuck -> reach, with both feet ready before contact.
      p.tuck = ease(0.04, AIR_TIME * 0.45, flight) * (1 - ease(AIR_TIME * 0.55, AIR_TIME - 0.06, flight))
      p.armSwing = 0.55 + 0.45 * ease(0, 0.18, flight) - 0.65 * ease(AIR_TIME * 0.5, AIR_TIME, flight)
    } else {
      const landing = this.t - touchdown
      const impact = ease(0, IMPACT_TIME, landing)
      const recover = ease(IMPACT_TIME, LAND_TIME, landing)
      p.weight = 1 - recover
      p.crouch = impact * (1 - recover)
      p.armSwing = (0.35 + 0.2 * impact) * (1 - recover)
      if (landing >= LAND_TIME) this.jumping = false
    }
    return p
  }
}

function ease(start: number, end: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)))
  return t * t * (3 - 2 * t)
}
