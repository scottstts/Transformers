import type { PerspectiveCamera, Vector3 } from 'three/webgpu'
import type { CircleCollider, Form, MotionState } from './types'
import { clamp, damp, easedRange, lerp, wrap } from './math'
import { GameInput } from './input'
import type { CharacterProfile, DriveProfile, RobotProfile } from '../content/transformer/character'

export interface CarControls {
  readonly driveThrottle: number
  readonly driveSteering: number
  readonly running: boolean
}

/** The car's bicycle model; limits and response come from the character's drive profile. */
export function updateCar(state: MotionState, input: CarControls, dt: number, locked: boolean, car: DriveProfile): void {
  const boost = input.running
  const v = state.speed
  const throttle = locked ? 0 : input.driveThrottle
  const steerIn = locked ? 0 : input.driveSteering

  const maxSpeed = boost ? car.boostSpeed : car.maxSpeed
  let acceleration: number
  if (throttle > 0) acceleration = v < -0.3 ? car.brake : (boost ? car.boostAccel : car.accel) * (1 - Math.pow(clamp(v / maxSpeed, 0, 1), 2))
  else if (throttle < 0) acceleration = v > 0.3 ? -car.brake : -car.reverse * (1 - clamp(-v / car.reverseSpeed, 0, 1))
  else acceleration = -Math.sign(v) * Math.min(Math.abs(v) / dt, car.coast + Math.abs(v) * car.coastDrag)
  if (locked) acceleration = -Math.sign(v) * Math.min(Math.abs(v) / dt, 16)

  state.speed = v + acceleration * dt
  if (!throttle && Math.abs(state.speed) < 0.05) state.speed = 0
  state.throttle = throttle
  state.boost = boost && !locked && throttle > 0
  state.accel = damp(state.accel, acceleration, 6, dt)
  const maxSteer = car.steerLock / (1 + Math.abs(state.speed) * car.steerFade)
  state.steer = damp(state.steer, -steerIn * maxSteer, 7, dt)
  state.yawRate = state.speed * Math.tan(state.steer) / car.wheelbase
  state.yaw += state.yawRate * dt
  state.spin += state.speed / car.wheelRadius * dt
  state.pos.x += Math.sin(state.yaw) * state.speed * dt
  state.pos.z += Math.cos(state.yaw) * state.speed * dt

  const lateralAcceleration = Math.abs(state.speed * state.yawRate)
  state.slip = damp(state.slip, clamp(
    (Math.abs(acceleration) > 10 ? 0.4 : 0) + (acceleration > 7 && v < 12 ? 0.5 : 0) + Math.max(0, lateralAcceleration - 5) * 0.08,
    0, 1), 5, dt)
  const targetPitch = clamp(-state.accel * car.pitchGain, -car.pitchLimit, car.pitchLimit)
  const targetRoll = clamp(lateralAcceleration * Math.sign(state.speed * state.yawRate) * car.rollGain, -car.rollLimit, car.rollLimit)
  state.pitchV += ((targetPitch - state.pitch) * 60 - state.pitchV * 9) * dt
  state.rollV += ((targetRoll - state.roll) * 60 - state.rollV * 9) * dt
  state.pitch += state.pitchV * dt
  state.roll += state.rollV * dt
}

/** Camera-relative robot movement; walking and running (Shift) speeds come from the robot profile. */
export function updateRobot(state: MotionState, input: GameInput, camera: PerspectiveCamera, dt: number, locked: boolean, robotOffset: number, robot: RobotProfile, airborne = false): void {
  const dir = locked || airborne ? null : input.movementDirection(camera)
  const run = input.running
  if (airborne) {
    // ballistic: the take-off momentum carries, no steering in the air
    state.yawRate = damp(state.yawRate, 0, 6, dt)
  } else {
    let targetSpeed = 0
    let targetTurn = 0
    if (dir) {
      const diff = wrap(Math.atan2(dir.x, dir.z) - state.yaw)
      targetTurn = clamp(diff * 3.5, -(run ? 1.6 : 2), run ? 1.6 : 2)
      targetSpeed = (run ? robot.runSpeed : robot.walkSpeed) * clamp((Math.cos(diff) + 0.2) / 1.2, 0, 1)
    }
    state.speed = damp(state.speed, targetSpeed, targetSpeed > state.speed ? 1.8 : 4, dt)
    if (Math.abs(state.speed) < 0.02 && !dir) state.speed = 0
    state.yawRate = damp(state.yawRate, targetTurn, 6, dt)
  }
  const centerX = state.pos.x + Math.sin(state.yaw) * robotOffset
  const centerZ = state.pos.z + Math.cos(state.yaw) * robotOffset
  state.yaw += state.yawRate * dt
  const nextX = centerX + Math.sin(state.yaw) * state.speed * dt
  const nextZ = centerZ + Math.cos(state.yaw) * state.speed * dt
  state.pos.x = nextX - Math.sin(state.yaw) * robotOffset
  state.pos.z = nextZ - Math.cos(state.yaw) * robotOffset
  state.pitch = damp(state.pitch, 0, 6, dt)
  state.roll = damp(state.roll, 0, 6, dt)
  state.steer = damp(state.steer, 0, 6, dt)
  state.slip = 0
}

export function resolveCircleCollisions(state: MotionState, colliders: CircleCollider[], robotOffset: number, profile: Pick<CharacterProfile, 'carRadius' | 'robotRadius'>): void {
  const transition = easedRange(state.progress, 0.3, 0.7)
  const offset = robotOffset * transition
  const radius = lerp(profile.carRadius, profile.robotRadius, transition)
  const forwardX = Math.sin(state.yaw)
  const forwardZ = Math.cos(state.yaw)
  for (const collider of colliders) {
    const dx = state.pos.x + forwardX * offset - collider.x
    const dz = state.pos.z + forwardZ * offset - collider.z
    const distance = Math.hypot(dx, dz)
    const minimum = collider.r + radius
    if (distance < minimum && distance > 1e-4) {
      state.pos.x += dx / distance * (minimum - distance)
      state.pos.z += dz / distance * (minimum - distance)
      state.speed *= 0.5
    }
  }
}

/** Requests during braking or playback are discarded, never queued. */
export function requestTransformation(state: MotionState, form: Form): void {
  if (form === state.mode || isTransforming(state)) return
  state.mode = form
  state.target = form === 'robot' ? 1 : 0
}

export function advanceTransformation(state: MotionState, dt: number, duration: number): number {
  const previous = state.progress
  const settled = Math.abs(state.speed) < 0.3
  if (state.target !== state.progress && (settled || (state.progress > 0 && state.progress < 1))) {
    state.progress = clamp(state.progress + Math.sign(state.target - state.progress) * dt / duration, 0, 1)
  }
  return previous
}

export function isTransforming(state: MotionState): boolean {
  return state.target !== state.progress || (state.progress > 0 && state.progress < 1)
}

export function forward(state: MotionState, out: Vector3): Vector3 {
  return out.set(Math.sin(state.yaw), 0, Math.cos(state.yaw))
}
