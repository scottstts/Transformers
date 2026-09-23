import { Vector3 } from 'three/webgpu'

export type Form = 'car' | 'robot'

export interface MotionState {
  mode: Form
  target: number
  progress: number
  pos: Vector3
  yaw: number
  speed: number
  yawRate: number
  steer: number
  spin: number
  gear: number
  throttle: number
  slip: number
  pitch: number
  roll: number
  pitchV: number
  rollV: number
  accel: number
}

export function createMotionState(): MotionState {
  return {
    mode: 'car', target: 0, progress: 0,
    pos: new Vector3(), yaw: 0.6, speed: 0, yawRate: 0,
    steer: 0, spin: 0, gear: 1, throttle: 0, slip: 0,
    pitch: 0, roll: 0, pitchV: 0, rollV: 0, accel: 0,
  }
}

export interface CircleCollider { x: number; z: number; r: number }
