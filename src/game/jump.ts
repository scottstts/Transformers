/**
 * Robot jump: anticipation, ballistic flight, landing compression.
 * Gameplay owns the height (the body leaves the ground); the gait turns the
 * phases into a pose (crouch depth, legs, arm swing).
 *
 * The timeline depends on the forward momentum at take-off (0 standing, 1 at
 * a full run). A standing jump loads with a deep, slow squat and a two-foot
 * push; a running jump barely dips (the stride is already loaded) and springs
 * off one foot within a few frames, then lands on the lead foot and runs on,
 * so its recovery is short and shallow too.
 */

/** Anticipation (s): standing and at a full run, and the share of it spent loading before the push. */
const CROUCH_TIME: [number, number] = [0.36, 0.14]
const LOAD_SHARE = 0.5
/** Take-off speed (m/s) and gravity (m/s^2): a heavy, snappy ~1.1 m hop, 0.87 s in the air. */
const TAKEOFF_SPEED = 5.2
const GRAVITY = 12
const AIR_TIME = 2 * TAKEOFF_SPEED / GRAVITY
/** Landing compression and recovery time (s): standing and at a full run. */
const LAND_TIME: [number, number] = [0.42, 0.28]
const IMPACT_TIME: [number, number] = [0.09, 0.07]
/** Depth of the anticipation squat and of the landing, at a full run (fraction of a standing jump's). */
const RUN_LOAD_DEPTH = 0.35
const RUN_LAND_DEPTH = 0.6

export interface JumpPose {
  /** 0..1 ownership of the pose, eased in during loading and out after impact */
  weight: number
  /** 0..1 leg load: anticipation crouch and landing compression */
  crouch: number
  /** 0..1 the push off the ground, the last part of the anticipation */
  push: number
  /** height of the lowest foot above the ground (m) */
  air: number
  /** 0..1 progress through the flight */
  flight: number
  /** 0..1 how far the legs are drawn up in flight */
  tuck: number
  /** signed arm swing: negative backswing, positive forward/up */
  armSwing: number
  /** 0..1 forward momentum at take-off: 0 a standing jump, 1 a running leap */
  momentum: number
  airborne: boolean
  /** on the ground again, recovering */
  landing: boolean
  /** true on the frame the body leaves the ground */
  tookOff: boolean
  /** true on the frame it lands */
  landed: boolean
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export class RobotJump {
  private jumping = false
  private t = 0
  private crouchTime = CROUCH_TIME[0]
  private landTime = LAND_TIME[0]
  private impactTime = IMPACT_TIME[0]
  readonly pose: JumpPose = idle()

  /** True from the anticipation crouch until the landing has settled. */
  get active(): boolean { return this.jumping }

  /** `momentum` 0..1: forward speed as a share of a full run. */
  start(momentum = 0): void {
    if (this.jumping) return
    const m = Math.max(0, Math.min(1, momentum))
    this.jumping = true
    this.t = 0
    this.crouchTime = lerp(CROUCH_TIME[0], CROUCH_TIME[1], m)
    this.landTime = lerp(LAND_TIME[0], LAND_TIME[1], m)
    this.impactTime = lerp(IMPACT_TIME[0], IMPACT_TIME[1], m)
    this.pose.momentum = m
  }

  update(dt: number): JumpPose {
    const p = this.pose
    p.tookOff = false
    p.landed = false
    if (!this.jumping) return p
    const m = p.momentum
    const crouchTime = this.crouchTime
    const loadTime = crouchTime * LOAD_SHARE
    const previous = this.t
    this.t += dt
    const touchdown = crouchTime + AIR_TIME
    p.tookOff = previous < crouchTime && this.t >= crouchTime
    p.landed = previous < touchdown && this.t >= touchdown
    p.airborne = this.t >= crouchTime && this.t < touchdown
    p.landing = this.t >= touchdown
    p.air = 0
    p.tuck = 0
    p.flight = 0
    p.push = 0

    if (this.t < crouchTime) {
      const load = ease(0, loadTime, this.t)
      const push = ease(loadTime, crouchTime, this.t)
      p.weight = load
      p.push = push
      p.crouch = load * (1 - 0.9 * push) * lerp(1, RUN_LOAD_DEPTH, m)
      // Arms reverse before the feet leave the ground, not at the phase boundary.
      p.armSwing = -0.8 * load + 1.35 * push
    } else if (p.airborne) {
      const flight = this.t - crouchTime
      p.weight = 1
      p.flight = flight / AIR_TIME
      p.air = Math.max(0, TAKEOFF_SPEED * flight - 0.5 * GRAVITY * flight * flight)
      p.crouch = 0.1 * (1 - ease(0, 0.12, flight)) * lerp(1, RUN_LOAD_DEPTH, m)
      // Smooth extension -> tuck -> reach, with the feet ready before contact.
      p.tuck = ease(0.04, AIR_TIME * 0.45, flight) * (1 - ease(AIR_TIME * 0.55, AIR_TIME - 0.06, flight))
      p.armSwing = 0.55 + 0.45 * ease(0, 0.18, flight) - 0.65 * ease(AIR_TIME * 0.5, AIR_TIME, flight)
    } else {
      const landing = this.t - touchdown
      const impact = ease(0, this.impactTime, landing)
      const recover = ease(this.impactTime, this.landTime, landing)
      p.weight = 1 - recover
      p.flight = 1
      p.crouch = impact * (1 - recover) * lerp(1, RUN_LAND_DEPTH, m)
      p.armSwing = (0.35 + 0.2 * impact) * (1 - recover)
      if (landing >= this.landTime) {
        this.jumping = false
        Object.assign(p, idle())
      }
    }
    return p
  }
}

function idle(): JumpPose {
  return { weight: 0, crouch: 0, push: 0, air: 0, flight: 0, tuck: 0, armSwing: 0, momentum: 0, airborne: false, landing: false, tookOff: false, landed: false }
}

function ease(start: number, end: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)))
  return t * t * (3 - 2 * t)
}
