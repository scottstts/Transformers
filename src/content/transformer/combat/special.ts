import type { Key } from './curves'
import type { CombatMove } from './moves'

/** A camera key: time (s, special time), then lateral (m, + left), forward (m) and up (m) in the shot's frame. */
export type ShotKey = readonly [number, number, number, number]

/**
 * Where a shot's keys are measured from:
 *   ground  the special's ground frame (its origin on the sand and its heading)
 *   body    the robot's pelvis as it moves, axes still the ground frame's
 *   head    the robot's head, same axes
 *   weapon  the weapon's head end (the pelvis while no weapon is out), same axes
 */
export type ShotFrame = 'ground' | 'body' | 'head' | 'weapon'

/**
 * One camera setup. It runs from `at` until the next shot starts. Eye and look
 * points pass through their keys on monotone cubics, so a push or a crane is
 * one smooth move; each is measured in its own frame, so an eye on the ground
 * can look at a head that flies.
 */
export interface Shot {
  at: number
  /** 0 (default) is a hard cut; otherwise the camera eases over from the last shot in this many seconds */
  blend?: number
  eye: readonly ShotKey[]
  eyeFrame?: ShotFrame
  look: readonly ShotKey[]
  lookFrame?: ShotFrame
  /** vertical field of view (deg), keyed; 42 when absent */
  fov?: readonly Key[]
  /** camera roll (deg, + clockwise on screen), keyed */
  roll?: readonly Key[]
  /**
   * How quickly a moving frame's point is followed (1/s): 0 (default) sticks to
   * it; a finite rate lags behind a fast subject like an operator panning after it.
   */
  lag?: number
}

/**
 * A robot's special: a long authored move (pose channels, footsteps and cues
 * like any combo move), the cut it is filmed with and its tempo. While it plays
 * the game takes no input and the director owns the camera.
 */
export interface SpecialMove {
  name: string
  move: CombatMove
  shots: readonly Shot[]
  /** the world's clock rate over special time (keys [t, rate]; 1 real time, below 1 slow motion) */
  tempo?: readonly Key[]
  /** special time at which the camera starts easing back to the follow camera, which it reaches at the end */
  handback: number
  /**
   * The follow camera's orbit it hands back to: yaw relative to the robot's
   * heading (rad; pi behind it, 0 in front, looking back at it) and pitch (rad).
   */
  handbackView: { yaw: number; pitch: number }
}
