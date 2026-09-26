import type { Object3D, PerspectiveCamera } from 'three/webgpu'
import type { MotionState } from '../../game/types'
import type { MechanismEvent } from './asset/format'
import type { TransformerModel } from './model/transformer'
import type { RobotGait } from './animation/gait'
import type { CharacterCombat } from './combat/effects'

/** Car handling: the game's single-track model (game/car-dynamics.ts) takes its limits from here. */
export interface DriveProfile {
  wheelbase: number
  /** car origin (centre of mass) to the front axle (m); the rear axle is the rest of the wheelbase */
  frontAxle: number
  /** centre-of-mass height (m): fore-aft load transfer */
  cgHeight: number
  /** yaw inertia over mass (m^2) */
  yawInertia: number
  /** tyre-ground friction at the peak, and the slip angle of the peak (rad) */
  grip: number
  peakSlip: number
  /** extra grip per (m/s)^2 of speed (downforce) */
  downforce: number
  /** share of the drive at the rear axle */
  driveRear: number
  /** rear grip while Shift loosens the rear (fraction of `grip`) */
  driftGrip: number
  /** rolling radius for wheel spin (m) */
  wheelRadius: number
  /** top speed (m/s), normal and with Shift's full power */
  maxSpeed: number
  boostSpeed: number
  /** drive acceleration at rest (m/s^2), normal and boosted */
  accel: number
  boostAccel: number
  /** service braking and reverse acceleration (m/s^2) */
  brake: number
  reverse: number
  /** reverse top speed (m/s) */
  reverseSpeed: number
  /** coasting deceleration: rolling (m/s^2) plus drag per m/s */
  coast: number
  coastDrag: number
  /** steering lock at rest (rad) and its fall-off with speed */
  steerLock: number
  steerFade: number
  /** body pitch / roll per m/s^2 and their limits (rad) */
  pitchGain: number
  pitchLimit: number
  rollGain: number
  rollLimit: number
  /** height of the body's pitch / roll pivot above the ground (m) */
  pivotHeight: number
}

export interface RobotProfile {
  walkSpeed: number
  runSpeed: number
}

export interface CameraProfile {
  carDistance: number
  robotDistance: number
  /** height of the camera's focus above the ground (m) */
  carFocus: number
  robotFocus: number
}

export interface CharacterProfile {
  drive: DriveProfile
  robot: RobotProfile
  camera: CameraProfile
  /** collision radius against scenery, car and robot form (m) */
  carRadius: number
  robotRadius: number
}

/** A character's sound, synthesized on the game's shared mix. */
export interface CharacterAudio {
  /** Build silent continuous voices during loading. */
  prepare(): void
  /** the machine powers up at the start of a transformation (either way) */
  power(): void
  /** per frame: the transformation is running */
  transforming(on: boolean): void
  mechanism(event: MechanismEvent, seconds: number): void
  footstep(strength?: number): void
  /** stops every continuous voice (the character leaves the scene) */
  dispose(): void
}

/** What the session drives every frame: timeline cues, contact effects, camera shake. */
export interface CharacterEffects {
  readonly audio: CharacterAudio
  /** world-space effects to add to the scene */
  readonly object: Object3D
  addFootstep(side: 'R' | 'L', running: number): void
  /** a foot set down without the walking footfall's sound (fighting footwork voices its own): dust, footprint, a little shake */
  plantFoot(side: 'R' | 'L', running: number): void
  takeoff(): void
  /** lands on both feet, or on `lead` alone (a running leap: the other foot follows in the stride) */
  land(lead: 'R' | 'L' | null): void
  timeline(previous: number, current: number): void
  update(dt: number, state: MotionState): void
  shakeCamera(camera: PerspectiveCamera, dt: number): void
}

export interface Character {
  readonly id: string
  readonly model: TransformerModel
  readonly gait: RobotGait
  readonly effects: CharacterEffects
  readonly profile: CharacterProfile
  /** transformation duration (s) */
  readonly transformationDuration: number
  /** robot standing station ahead of the car origin (m) */
  readonly robotOffset: number
  /** the robot's fighting: its four-move combo, weapon and effects */
  readonly combat: CharacterCombat
}
