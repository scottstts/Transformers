import type { PerspectiveCamera, Vector3 } from 'three/webgpu'
import type { CircleCollider, Form, MotionState, SegmentCollider } from './types'
import { pushOut, type Contact } from './collide'
import { clamp, damp, easedRange, lerp, wrap } from './math'
import type { GameInput } from './input'
import type { CharacterProfile, RobotProfile, TrailerProfile } from '../content/transformer/character'

/**
 * Robot turning: the turn rate asked per radian off the wanted heading, its
 * ceiling standing/walking and running (rad/s), and how fast the body takes
 * it up (1/s). About 0.4 s to face the other way from a stand: the robot
 * answers the keys at once, as an action game's fighter does, instead of
 * stepping slowly round. The pair (gain, response) is damped just under
 * critical, so it settles without swinging past.
 */
const TURN_GAIN = 9
const TURN_MAX: readonly [number, number] = [9, 6]
const TURN_RESPONSE = 18
/** Speed response (1/s) speeding up and slowing down, and the share of speed kept while turning (cos of the angle off, shifted). */
const ACCELERATE = 4.5
const DECELERATE = 7
const TURN_SPEED_SHIFT = 0.3

/** Camera-relative robot movement; walking and running (Shift) speeds come from the robot profile. */
export function updateRobot(state: MotionState, input: Pick<GameInput, 'movementDirection' | 'running'>, camera: PerspectiveCamera, dt: number, locked: boolean, robotOffset: number, robot: RobotProfile, airborne = false): void {
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
      const max = run ? TURN_MAX[1] : TURN_MAX[0]
      targetTurn = clamp(diff * TURN_GAIN, -max, max)
      targetSpeed = (run ? robot.runSpeed : robot.walkSpeed) * clamp((Math.cos(diff) + TURN_SPEED_SHIFT) / (1 + TURN_SPEED_SHIFT), 0, 1)
    }
    state.speed = damp(state.speed, targetSpeed, targetSpeed > state.speed ? ACCELERATE : DECELERATE, dt)
    if (Math.abs(state.speed) < 0.02 && !dir) state.speed = 0
    state.yawRate = damp(state.yawRate, targetTurn, TURN_RESPONSE, dt)
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

/** Push the body out of rocks and walls without stopping a robot's stride; returns true against a wall (a segment). */
export function resolveCircleCollisions(state: MotionState, colliders: CircleCollider[], robotOffset: number, profile: Pick<CharacterProfile, 'carRadius' | 'robotRadius' | 'carBody'> & { drive?: Pick<CharacterProfile['drive'], 'trailer'> }, segments: readonly SegmentCollider[] = []): boolean {
  const transition = easedRange(state.progress, 0.3, 0.7)
  // a long rig in car form: a chain of circles along the car, and along its trailer as it swings
  if (transition === 0 && profile.carBody) return resolveBody(state, colliders, profile.carBody, profile.drive?.trailer, segments)
  const offset = robotOffset * transition
  const radius = lerp(profile.carRadius, profile.robotRadius, transition)
  const forwardX = Math.sin(state.yaw)
  const forwardZ = Math.cos(state.yaw)
  // A formed robot keeps walking/running into contact; scenery constrains its position.
  const robot = state.progress >= 1
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
      if (!robot) scrape(state, c, forwardX, forwardZ)
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
      if (!robot) {
        state.speed *= 0.5
        state.lateral *= 0.5
      }
    }
  }
  return walled
}

/** The velocity into a wall is lost; along it, it scrapes. */
function scrape(state: MotionState, c: Contact, forwardX: number, forwardZ: number): void {
  const vx = forwardX * state.speed, vz = forwardZ * state.speed
  const into = vx * c.nx + vz * c.nz
  if (into < 0) state.speed *= Math.max(0, 1 - Math.min(1, -into / Math.max(Math.abs(state.speed), 1e-3)) * 0.9)
  state.lateral *= 0.5
}

/**
 * A long car's body as circles: stations along the car (ahead of its origin)
 * and along its trailer behind the hitch, turned by the articulation. Each
 * circle pushes the whole car out of what it overlaps.
 */
function resolveBody(state: MotionState, colliders: CircleCollider[], body: ReadonlyArray<readonly [number, number]>, trailer: TrailerProfile | undefined, segments: readonly SegmentCollider[]): boolean {
  const fx = Math.sin(state.yaw), fz = Math.cos(state.yaw)
  const trailerYaw = state.yaw + state.articulation
  const tx = Math.sin(trailerYaw), tz = Math.cos(trailerYaw)
  let walled = false
  let struck = false
  const count = body.length + (trailer?.circles.length ?? 0)
  for (let k = 0; k < count; k++) {
    let cx: number, cz: number, r: number
    if (k < body.length) {
      const [station, radius] = body[k]
      cx = state.pos.x + fx * station
      cz = state.pos.z + fz * station
      r = radius
    } else {
      const [behind, radius] = trailer!.circles[k - body.length]
      cx = state.pos.x + fx * trailer!.hitch - tx * behind
      cz = state.pos.z + fz * trailer!.hitch - tz * behind
      r = radius
    }
    if (segments.length) {
      _p.x = cx
      _p.z = cz
      const c = pushOut(_p, r, segments, [], _contact)
      if (c) {
        walled = true
        state.pos.x += _p.x - cx
        state.pos.z += _p.z - cz
        cx = _p.x
        cz = _p.z
        scrape(state, c, fx, fz)
      }
    }
    for (const collider of colliders) {
      if (collider.r <= 0) continue
      const dx = cx - collider.x, dz = cz - collider.z
      const distance = Math.hypot(dx, dz)
      const minimum = collider.r + r
      if (distance < minimum && distance > 1e-4) {
        const push = minimum - distance
        state.pos.x += dx / distance * push
        state.pos.z += dz / distance * push
        cx += dx / distance * push
        cz += dz / distance * push
        struck = true
      }
    }
  }
  if (struck) {
    state.speed *= 0.5
    state.lateral *= 0.5
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
