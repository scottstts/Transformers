import type { Object3D, PerspectiveCamera } from 'three/webgpu'
import type { MotionState } from '../../game/types'
import type { MechanismEvent } from './asset/format'
import type { TransformerModel } from './model/transformer'
import type { RobotGait } from './animation/gait'

/** Car handling: the game's bicycle model (game/movement.ts) takes its limits from here. */
export interface DriveProfile {
  wheelbase: number
  /** rolling radius for wheel spin (m) */
  wheelRadius: number
  /** top speed (m/s), normal and boosted (Shift) */
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
  takeoff(): void
  land(): void
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
}
