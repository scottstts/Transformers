import type { Vector3 } from 'three/webgpu'
import type { MotionState } from '../../../game/types'
import type { CombatOverlay } from './overlay'
import type { MoveCue, Moveset } from './moves'
import type { Side } from './pose'
import type { Weapon } from './weapon'

/** Camera reactions a fighting move may ask for (game/combat/camera-fx.ts). */
export interface CombatCamera {
  /** a jolt along the view, 0..1 */
  kick(strength: number): void
  /** a bounded shake, 0..1 */
  shake(strength: number): void
  /** widen the lens by `degrees` for `seconds`, then return */
  punch(degrees: number, seconds: number): void
  /** hold the frame back by `metres` (a big move needs room), eased */
  pull(metres: number): void
  /** slow the fight's clock to `scale` for `seconds` (the instant a heavy strike lands) */
  hitStop(seconds: number, scale: number): void
}

/** What the effects see of the fight every frame. */
export interface CombatFrame {
  /** 0..1 how far the fight owns the pose */
  weight: number
  /** the pose channels (pose.ts) */
  values: Float32Array
  /** the move playing (index), -1 recovering or idle */
  move: number
  /** time in the move (s) */
  time: number
  state: MotionState
  camera: CombatCamera
}

/** A character's fighting effects: its weapon, particles, sound and camera cues. */
export interface CombatEffects {
  /** the weapon the fighter forms in its hand, if it has one */
  readonly weapon: Weapon | null
  /** a combo begins (from the stance) */
  begin(): void
  /** a move starts */
  moveStart(move: number, camera: CombatCamera): void
  cue(cue: MoveCue, frame: CombatFrame): void
  /** a foot lands during the fight: `skid` when it was dragged, not stepped */
  step(side: Side, strength: number, skid: boolean): void
  /** a foot is dragged over the ground this frame (m/s) */
  skid(side: Side, at: Vector3, speed: number, dt: number): void
  update(dt: number, frame: CombatFrame): void
  /** the combo has ended and the stance is back */
  end(): void
  /** stop everything at once (the character leaves the scene or the stance) */
  reset(): void
  /**
   * Show every hidden part (weapon, trail, sparks) for a shader compile, or hide
   * them again: compiling skips invisible objects, and a first use mid-fight
   * would otherwise build its pipelines then.
   */
  warm(on: boolean): void
  /** stop the continuous voices (the character leaves the scene); they rebuild on the next fight */
  dispose(): void
}

/** A character's fighting: its combo, the rig overlay that poses it and its effects. */
export interface CharacterCombat {
  readonly moveset: Moveset
  readonly overlay: CombatOverlay
  readonly effects: CombatEffects
  /** lift of a fighting step (m) */
  readonly stepLift: number
}
