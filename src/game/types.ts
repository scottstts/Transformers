import { Vector3 } from 'three/webgpu'

export type Form = 'car' | 'robot'

export interface MotionState {
  mode: Form
  target: number
  progress: number
  pos: Vector3
  yaw: number
  /** forward speed (m/s); in car form `lateral` is the body's sideways velocity (m/s, + left) */
  speed: number
  lateral: number
  yawRate: number
  /** front wheel angle (rad, + left): the driver's steering plus any countersteer */
  steer: number
  /** the driver's own steering (-1..1, + left) */
  steerInput: number
  /** 0..1 how far a drift driver's hands steer the front wheels (the rear is sliding) */
  hands: number
  spin: number
  throttle: number
  /** Shift held with the throttle on in car form: full power */
  boost: boolean
  /** 0..1 how far Shift has loosened the rear axle */
  release: number
  /** 0..1 overall tyre slip, for dust */
  slip: number
  /** 0..1 smoothed rear slide: the car is drifting */
  drift: number
  /** tread sliding over the ground per axle (m/s): sideways (+ left) and lengthways (+ forward: locked; - backward: wheelspin) */
  slideFront: number
  slideRear: number
  spinFront: number
  spinRear: number
  /** body acceleration from the tyres (m/s^2): forward, and sideways (+ left) */
  longAccel: number
  latAccel: number
  pitch: number
  roll: number
  pitchV: number
  rollV: number
  accel: number
}

export function createMotionState(): MotionState {
  return {
    mode: 'car', target: 0, progress: 0,
    pos: new Vector3(), yaw: 0.6, speed: 0, lateral: 0, yawRate: 0,
    steer: 0, steerInput: 0, hands: 0, spin: 0, throttle: 0, boost: false, release: 0, slip: 0, drift: 0,
    slideFront: 0, slideRear: 0, spinFront: 0, spinRear: 0, longAccel: 0, latAccel: 0,
    pitch: 0, roll: 0, pitchV: 0, rollV: 0, accel: 0,
  }
}

export interface CircleCollider { x: number; z: number; r: number }
