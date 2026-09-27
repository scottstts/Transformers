import { Euler, Quaternion, Vector3 } from 'three/webgpu'
import type { MotionState } from './types'
import type { Ground } from './ground'
import type { DriveProfile } from '../content/transformer/character'
import { placeCar } from './car-dynamics'
import { damp, easedRange } from './math'

/** A transforming body's height eases between the car's footing and the robot's (1/s). */
const TRANSFORM_FOLLOW = 10

/**
 * The robot on the ground's relief: once the car form is half gone (the car's
 * springs carry it before that, car-dynamics.ts) the body stands at the
 * ground's height under the robot's standing point, eased while it
 * transforms. The car's suspension is kept at rest on the ground where the
 * car would stand, so turning back into the car starts settled.
 */
export function standOnGround(state: MotionState, ground: Ground, drive: DriveProfile, robotOffset: number, dt: number): void {
  if (state.progress < 0.5) return
  const y = state.pos.y
  placeCar(state, drive, ground)
  const standing = easedRange(state.progress, 0.5, 1) * robotOffset
  const target = ground.height(state.pos.x + Math.sin(state.yaw) * standing, state.pos.z + Math.cos(state.yaw) * standing)
  state.pos.y = state.progress >= 1 ? target : damp(y, target, TRANSFORM_FOLLOW, dt)
}

const _up = new Vector3(0, 1, 0)
const _tilt = new Euler()
const _q = new Quaternion()

/** The model's orientation: its heading, tilted with the car on the ground (the robot stands upright). */
export function bodyAttitude(state: MotionState, out: Quaternion): Quaternion {
  const car = 1 - easedRange(state.progress, 0.05, 0.5)
  out.setFromAxisAngle(_up, state.yaw)
  if (car > 0) out.multiply(_q.setFromEuler(_tilt.set(state.tiltPitch * car, 0, state.tiltRoll * car)))
  return out
}
