import type { PerspectiveCamera, Vector3 } from 'three/webgpu'
import type { CircleCollider, Form, MotionState, SegmentCollider } from './types'
import { pushOut, type Contact } from './collide'
import { clamp, damp, easedRange, lerp, wrap } from './math'
import { GameInput } from './input'
import type { CharacterProfile, RobotProfile } from '../content/transformer/character'

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
  state.steerInput = 0
  state.hands = 0
  // no tyres on the ground: nothing slides
  state.lateral = 0
  state.slip = 0
  state.drift = 0
  state.release = 0
  state.slideFront = state.slideRear = state.spinFront = state.spinRear = 0
  state.longAccel = state.latAccel = 0
}

/** Push the body out of rocks and walls; returns true when it is against a wall (a segment). */
export function resolveCircleCollisions(state: MotionState, colliders: CircleCollider[], robotOffset: number, profile: Pick<CharacterProfile, 'carRadius' | 'robotRadius'>, segments: readonly SegmentCollider[] = []): boolean {
  const transition = easedRange(state.progress, 0.3, 0.7)
  const offset = robotOffset * transition
  const radius = lerp(profile.carRadius, profile.robotRadius, transition)
  const forwardX = Math.sin(state.yaw)
  const forwardZ = Math.cos(state.yaw)
  // walls and building sides (the forts): the body's centre pushed out of the capsules
  let walled = false
  if (segments.length) {
    _p.x = state.pos.x + forwardX * offset
    _p.z = state.pos.z + forwardZ * offset
    const c = pushOut(_p, radius, segments, [], _contact)
    if (c) {
      walled = true
      state.pos.x = _p.x - forwardX * offset
      state.pos.z = _p.z - forwardZ * offset
      // the velocity into the wall is lost; along it, it scrapes
      const vx = forwardX * state.speed, vz = forwardZ * state.speed
      const into = vx * c.nx + vz * c.nz
      if (into < 0) state.speed *= Math.max(0, 1 - Math.min(1, -into / Math.max(Math.abs(state.speed), 1e-3)) * 0.9)
      state.lateral *= 0.5
    }
  }
  for (const collider of colliders) {
    // a cleared collider (a boulder taken off a fort's grounds) is gone, not a point
    if (collider.r <= 0) continue
    const dx = state.pos.x + forwardX * offset - collider.x
    const dz = state.pos.z + forwardZ * offset - collider.z
    const distance = Math.hypot(dx, dz)
    const minimum = collider.r + radius
    if (distance < minimum && distance > 1e-4) {
      state.pos.x += dx / distance * (minimum - distance)
      state.pos.z += dz / distance * (minimum - distance)
      state.speed *= 0.5
      state.lateral *= 0.5
    }
  }
  return walled
}

/** Requests during braking or playback are discarded, never queued. */
export function requestTransformation(state: MotionState, form: Form): void {
  if (form === state.mode || isTransforming(state)) return
  state.mode = form
  state.target = form === 'robot' ? 1 : 0
}

export function advanceTransformation(state: MotionState, dt: number, duration: number): number {
  const previous = state.progress
  const settled = Math.hypot(state.speed, state.lateral) < 0.3
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

const _p = { x: 0, z: 0 }
const _contact: Contact = { nx: 0, nz: 0, depth: 0 }
