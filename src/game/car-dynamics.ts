import type { Vector3 } from 'three/webgpu'
import type { MotionState } from './types'
import { clamp, damp, easedRange } from './math'
import type { DriveProfile } from '../content/transformer/character'

/**
 * Car handling: a dynamic single-track (bicycle) model. The body carries
 * forward speed, lateral velocity and yaw rate; each axle's tyres push back
 * with a saturating slip-angle curve under their share of the weight (moved
 * fore and aft by acceleration, raised by downforce). Drive and brake forces
 * are the profile's direct throttle / brake / reverse.
 *
 * Normally the driver aids are on: traction control and ABS deliver the
 * profile's acceleration and braking without spinning or locking a wheel,
 * and only part of that load comes off the cornering grip.
 *
 * Shift switches the aids off, puts the full power down, sends all of it to
 * the rear (a drift mode) and loosens the rear axle (its grip falls to the
 * profile's `driftGrip`); the footbrake then works on the rear like a
 * handbrake. Each axle now transmits only what its tyres grip: demand beyond
 * that spins or locks the wheels, and drive and cornering force share one
 * friction circle. A sliding axle pushes against its tread's slip over the
 * ground, so a car sliding sideways scrubs speed and a spinning rear gives
 * little thrust. The rear steps out when the car turns, and throttle keeps it
 * out.
 *
 * Once the rear slides, the front wheels are steered the way a drift driver's
 * hands would: along the travel direction (caster), plus a correction that
 * holds a body slip angle. The player's steering chooses that angle: neutral
 * holds a moderate drift, into the turn deepens it, away from the turn
 * straightens up. Letting go of Shift gives the rear its grip back and the
 * same hands catch the slide. Past the widest angle a driver would hold, a
 * restoring yaw keeps the car from spinning at speed; a slow power slide can
 * still turn into a donut.
 *
 * Integrated in fixed sub-steps, so handling does not change with frame rate.
 */

export interface CarControls {
  readonly driveThrottle: number
  readonly driveSteering: number
  /** Explicit Shift/drift hold: full power, loose rear. */
  readonly driftHeld: boolean
}

const G = 9.81
/** Integration step (s). */
const STEP = 1 / 300
/** Below this forward speed slip angles are measured against it (m/s); below LOW_SPEED the car follows its steering geometry. */
const SLIP_SPEED = 3
const LOW_SPEED: [number, number] = [0.8, 2.6]
/** Sliding friction as a fraction of the peak, and how fast the curve falls to it past the peak. */
const SLIDE_GRIP = 0.8
const SLIDE_FALLOFF = 1.4
/** Brake force carried by the front axle: footbrake, and with Shift (the handbrake works the rear). */
const BRAKE_FRONT = 0.62
const HANDBRAKE_FRONT = 0.1
/** With the aids on, the share of an axle's drive / brake load that comes off its cornering grip. */
const AIDED_COUPLING = 0.45
/** Rear release: how fast the rear lets go (Shift pressed) and regains grip (released), 1/s. */
const RELEASE_RATE = 14
const REGRIP_RATE = 4
/** Driver steering response (1/s). */
const STEER_RATE = 7
/** The driver's hands take over once the rear axle slides this far (rad); they catch a slide quickly and hand back slowly (1/s). */
const HANDS_WINDOW: [number, number] = [0.05, 0.18]
const HANDS_ON = 12
const HANDS_OFF = 2.5
/** At a crawl nobody countersteers: a power slide there is a donut, steered into the turn (m/s). */
const HANDS_SPEED: [number, number] = [5, 9]
/**
 * Drift angle the hands hold, as a fraction of the car's steering lock (they
 * need about that much countersteer): steering neutral, and fully into the
 * turn. Away from the turn holds none.
 */
const DRIFT_HOLD = 0.62
const DRIFT_DEEP = 1
/** Hands: front-wheel correction per rad of slip-angle error, and per rad/s of slip-angle rate. */
const HOLD_GAIN = 0.9
const HOLD_DAMPING = 0.35
/** Widest body slip angle before the restoring yaw (rad), and its yaw acceleration per rad beyond it. */
const DRIFT_LIMIT = 0.9
const DRIFT_LIMIT_GAIN = 14
/** The restoring yaw fades in with speed, so a slow power slide can still turn into a donut (m/s). */
const DRIFT_LIMIT_SPEED: [number, number] = [7, 14]

/** One driver-command evaluation per frame; the sub-steps integrate it. */
export function updateCar(state: MotionState, input: CarControls, dt: number, locked: boolean, car: DriveProfile): void {
  const throttle = locked ? 0 : input.driveThrottle
  const loose = !locked && input.driftHeld
  state.throttle = throttle
  state.boost = loose && throttle > 0

  // A character switch deliberately freezes the world with dt = 0. Do not
  // enter the tyre integrator in that state: its stop-distance terms divide
  // by the sub-step duration and 0 / 0 at rest would poison motion/audio with NaN.
  if (!Number.isFinite(dt) || dt <= 0) return

  state.release = damp(state.release, loose ? 1 : 0, loose ? RELEASE_RATE : REGRIP_RATE, dt)
  state.steerInput = damp(state.steerInput, locked ? 0 : -input.driveSteering, STEER_RATE, dt)

  const steps = Math.max(1, Math.ceil(dt / STEP - 1e-6))
  const h = dt / steps
  let ax = 0
  let ay = 0
  for (let i = 0; i < steps; i++) {
    step(state, car, throttle, locked, h)
    ax += state.longAccel
    ay += state.latAccel
  }
  ax /= steps
  ay /= steps
  if (!throttle && Math.abs(state.speed) < 0.05 && Math.abs(state.lateral) < 0.05) {
    state.speed = 0
    state.lateral = 0
    state.yawRate = 0
  }

  state.spin += state.speed / car.wheelRadius * dt
  state.accel = damp(state.accel, ax, 6, dt)
  const slide = Math.max(Math.hypot(state.slideRear, state.spinRear), Math.hypot(state.slideFront, state.spinFront))
  state.slip = damp(state.slip, clamp(slide / 5, 0, 1), 8, dt)
  state.drift = damp(state.drift, easedRange(Math.abs(state.slideRear), 0.8, 4), 5, dt)

  const targetPitch = clamp(-state.accel * car.pitchGain, -car.pitchLimit, car.pitchLimit)
  const targetRoll = clamp(ay * car.rollGain, -car.rollLimit, car.rollLimit)
  state.pitchV += ((targetPitch - state.pitch) * 60 - state.pitchV * 9) * dt
  state.rollV += ((targetRoll - state.roll) * 60 - state.rollV * 9) * dt
  state.pitch += state.pitchV * dt
  state.roll += state.rollV * dt
}

function step(state: MotionState, car: DriveProfile, throttle: number, locked: boolean, h: number): void {
  const a = car.frontAxle
  const b = car.wheelbase - a
  let u = state.speed
  let v = state.lateral
  let r = state.yawRate
  const au = Math.abs(u)

  // longitudinal demand: the profile's drive, brake, reverse and coast
  const boost = state.boost
  const maxSpeed = boost ? car.boostSpeed : car.maxSpeed
  let demand: number
  let braking = false
  if (throttle > 0) {
    if (u < -0.3) { demand = car.brake; braking = true } else demand = (boost ? car.boostAccel : car.accel) * (1 - Math.pow(clamp(u / maxSpeed, 0, 1), 2))
  } else if (throttle < 0) {
    if (u > 0.3) { demand = -car.brake; braking = true } else demand = -car.reverse * (1 - clamp(-u / car.reverseSpeed, 0, 1))
  } else demand = -Math.sign(u) * Math.min(au / h, car.coast + au * car.coastDrag)
  if (locked) { demand = -Math.sign(u) * Math.min(au / h, 16); braking = true }
  // a brake cannot push the car past standstill within a step
  if (braking && Math.abs(demand) * h > au) demand = -u / h
  const coasting = !throttle && !locked

  // axle loads (per unit mass): static split, load transfer, downforce
  const aero = 1 + car.downforce * u * u
  const transfer = state.accel * car.cgHeight / car.wheelbase
  const nF = Math.max(0.15 * G, G * b / car.wheelbase - transfer) * aero
  const nR = Math.max(0.15 * G, G * a / car.wheelbase + transfer) * aero
  const capF = car.grip * nF
  const capR = car.grip * (1 + (car.driftGrip - 1) * state.release) * nR

  // drive / brake per axle
  const release = state.release
  const shareF = braking ? BRAKE_FRONT + (HANDBRAKE_FRONT - BRAKE_FRONT) * release : (1 - car.driveRear) * (1 - release)
  const wantF = demand * shareF
  const wantR = demand * (1 - shareF)

  // front wheel angle: the driver's steering, or once the rear slides, a drift driver's hands
  const denom = Math.max(au, SLIP_SPEED)
  const rearAngle = Math.atan2(v - b * r, denom)
  const maxSteer = car.steerLock / (1 + au * car.steerFade)
  let delta = state.steerInput * maxSteer
  const sliding = u > SLIP_SPEED ? easedRange(Math.abs(rearAngle), HANDS_WINDOW[0], HANDS_WINDOW[1]) : 0
  state.hands = damp(state.hands, sliding, sliding > state.hands ? HANDS_ON : HANDS_OFF, h)
  const hands = state.hands * easedRange(u, HANDS_SPEED[0], HANDS_SPEED[1])
  if (hands > 0.001) {
    const beta = Math.atan2(v, u)
    // the drift turns the way the car points relative to its travel (+1 left)
    const turn = -Math.sign(beta)
    const into = state.steerInput * turn
    const hold = into >= 0 ? DRIFT_HOLD + (DRIFT_DEEP - DRIFT_HOLD) * into : DRIFT_HOLD * (1 + into)
    const target = -turn * hold * car.steerLock * state.release
    // slip-angle rate: the velocity turns with the lateral force while the body turns at r
    const betaRate = (u * state.latAccel - v * state.longAccel) / (u * u + v * v) - r
    const travel = Math.atan2(v + a * r, u)
    const correction = HOLD_GAIN * (beta - target) + HOLD_DAMPING * betaRate
    delta += (travel + correction - delta) * hands
  }
  delta = clamp(delta, -car.steerLock, car.steerLock)
  const cd = Math.cos(delta)
  const sd = Math.sin(delta)

  // tyre-frame velocities and slip angles
  const vyF = v + a * r
  const longF = u * cd + vyF * sd
  const latVF = vyF * cd - u * sd
  const alphaF = Math.atan2(latVF, Math.max(Math.abs(longF), SLIP_SPEED))
  const latVR = v - b * r
  const alphaR = Math.atan2(latVR, denom)
  const slideF = slideSpeed(latVF, alphaF, car.peakSlip)
  const slideR = slideSpeed(latVR, alphaR, car.peakSlip)
  const spinF = coasting ? 0 : wheelSlip(wantF, capF, u, braking) * release
  const spinR = coasting ? 0 : wheelSlip(wantR, capR, u, braking) * release
  axleForce(wantF, alphaF / car.peakSlip, capF, spinF, slideF, release, coasting)
  const fxF = _force.x
  const fyF = _force.y
  axleForce(wantR, alphaR / car.peakSlip, capR, spinR, slideR, release, coasting)
  const fxR = _force.x
  const fyR = _force.y

  // body-frame accelerations (x forward, y left, yaw positive to the left)
  const bodyX = fxF * cd - fyF * sd + fxR
  const bodyY = fxF * sd + fyF * cd + fyR
  let yawAcc = (a * (fxF * sd + fyF * cd) - b * fyR) / car.yawInertia
  const beta = Math.atan2(v, Math.max(au, 0.5))
  const excess = beta - clamp(beta, -DRIFT_LIMIT, DRIFT_LIMIT)
  if (u > 0) yawAcc += DRIFT_LIMIT_GAIN * excess * easedRange(Math.hypot(u, v), DRIFT_LIMIT_SPEED[0], DRIFT_LIMIT_SPEED[1])

  u += (bodyX + v * r) * h
  v += (bodyY - u * r) * h
  r += yawAcc * h

  // at walking pace the tyres just follow the steering geometry (the rear axle does not slip),
  // unless the rear is spinning: a donut pivots on the front wheels at a crawl
  const kinematic = (1 - easedRange(Math.hypot(u, v), LOW_SPEED[0], LOW_SPEED[1])) * (1 - easedRange(Math.abs(spinR), 1, 3))
  if (kinematic > 0) {
    const rKin = u * Math.tan(delta) / car.wheelbase
    r += (rKin - r) * kinematic
    v += (b * rKin - v) * kinematic
  }

  const yaw = state.yaw
  const sy = Math.sin(yaw)
  const cy = Math.cos(yaw)
  // forward (sin, cos); left (cos, -sin)
  state.pos.x += (sy * u + cy * v) * h
  state.pos.z += (cy * u - sy * v) * h
  state.yaw = yaw + r * h
  state.speed = u
  state.lateral = v
  state.yawRate = r
  state.steer = delta

  // what the tyres do on the ground, for tracks, dust and sound
  state.slideFront = slideF
  state.slideRear = slideR
  state.spinFront = spinF
  state.spinRear = spinR
  state.longAccel = bodyX
  state.latAccel = bodyY
}

const _force = { x: 0, y: 0 }

/**
 * An axle's drive / brake and cornering force (into `_force`) for drive
 * demand `want`, normalized slip angle `x` and grip `cap`, blended by
 * `release` from aided to raw:
 *
 * - aided: the whole demand gets through; part of it comes off the cornering grip;
 * - raw: drive / brake is limited to the grip and shares one friction circle
 *   with cornering (both scale back together). Once the tread slips (wheelspin
 *   or lock `spin`, sideways slide `slide`), the force opposes that slip.
 */
function axleForce(want: number, x: number, cap: number, spin: number, slide: number, release: number, coasting: boolean): void {
  const curve = tyreCurve(x)
  const aidedLat = cap * Math.sqrt(1 - Math.min(1, AIDED_COUPLING * Math.abs(want) / cap) ** 2)
  let fx = want
  let fy = -aidedLat * curve
  if (release > 0) {
    let rx = coasting ? want : clamp(want, -cap, cap)
    let ry = -cap * curve
    const over = Math.hypot(rx, ry) / cap
    if (over > 1) {
      rx /= over
      ry /= over
    }
    const slip = Math.hypot(spin, slide)
    const sliding = easedRange(slip, 0.5, 3)
    if (sliding > 0) {
      const size = Math.hypot(rx, ry)
      rx += (-spin / slip * size - rx) * sliding
      ry += (-slide / slip * size - ry) * sliding
    }
    fx += (rx - fx) * release
    fy += (ry - fy) * release
  }
  _force.x = fx
  _force.y = fy
}

/** Normalized lateral force at slip x (slip angle over its peak): rises to 1 at the peak, falls to sliding friction beyond it. */
export function tyreCurve(x: number): number {
  const s = Math.abs(x)
  const f = s < 1 ? s * (2 - s) : 1 - (1 - SLIDE_GRIP) * (1 - Math.exp(-(s - 1) * SLIDE_FALLOFF))
  return Math.sign(x) * f
}

/** Lateral speed of the tread sliding over the ground (m/s, signed, + left): the part of the tyre's sideways motion its carcass no longer absorbs. */
function slideSpeed(lateral: number, alpha: number, peak: number): number {
  return lateral * easedRange(Math.abs(alpha), peak * 0.7, peak * 1.8)
}

/**
 * Longitudinal slip speed of the tread over the ground (m/s, + forward):
 * drive demand beyond an axle's grip spins the wheels (the tread runs
 * backwards over the sand); brake demand beyond it locks them (the tread
 * drags forward).
 */
function wheelSlip(want: number, cap: number, u: number, braking: boolean): number {
  const over = Math.abs(want) / cap - 1
  if (over <= 0) return 0
  if (braking) return Math.sign(u) * Math.min(Math.abs(u), over * 8)
  return -Math.sign(want) * Math.min(8, over * 4)
}

/**
 * Ground velocity (world xz) of a point `p` fixed to the car body, the heading
 * of the tyre there (front tyres turn with `state.steer`), and the sliding
 * velocity of its tread over the ground. Returns the sliding speed (m/s).
 */
export function contactMotion(state: MotionState, p: Vector3, front: boolean, velocity: Vector3, slide: Vector3, heading: Vector3): number {
  const sy = Math.sin(state.yaw)
  const cy = Math.cos(state.yaw)
  const dx = p.x - state.pos.x
  const dz = p.z - state.pos.z
  const x = dx * sy + dz * cy
  const y = dx * cy - dz * sy
  const r = state.yawRate
  const vx = state.speed - r * y
  const vy = state.lateral + r * x
  velocity.set(sy * vx + cy * vy, 0, cy * vx - sy * vy)
  const delta = front ? state.steer : 0
  const hx = sy * Math.cos(delta) + cy * Math.sin(delta)
  const hz = cy * Math.cos(delta) - sy * Math.sin(delta)
  heading.set(hx, 0, hz)
  const lat = front ? state.slideFront : state.slideRear
  const lon = front ? state.spinFront : state.spinRear
  // tyre left = heading turned 90° to the left: (hz, -hx)
  slide.set(hx * lon + hz * lat, 0, hz * lon - hx * lat)
  return Math.hypot(lat, lon)
}
