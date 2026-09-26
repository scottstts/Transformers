import type { Vector3 } from 'three/webgpu'
import type { MotionState } from '../../../game/types'
import type { CombatOverlay } from './overlay'
import type { CombatMove, MoveCue, Moveset } from './moves'
import type { CombatHits } from './hits'
import type { SpecialMove } from './special'
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
  /** a blast wave leaving `at` (world): the air's refraction ripples out through the picture; `energy` 0..1+ */
  shockwave(at: Vector3, energy: number): void
  /** the exposure blown out by a blast of light, 0..1+, dying away over `seconds` */
  flash(amount: number, seconds: number): void
  /** the picture drained of colour, 0..1 (a moment held out of time); eased */
  zone(amount: number): void
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
  /** Build the silent combat voice during loading. */
  prepareAudio(): void
  /** the weapon the fighter forms in its hand, if it has one */
  readonly weapon: Weapon | null
  /** a combo begins (from the stance) */
  begin(): void
  /** the special begins (from whatever the fight was doing) */
  beginSpecial(): void
  /** a move starts */
  moveStart(move: number, camera: CombatCamera): void
  cue(cue: MoveCue, frame: CombatFrame): void
  /** a foot lands during the fight: `skid` when it was dragged, not stepped */
  step(side: Side, strength: number, skid: boolean): void
  /** a foot is dragged over the ground this frame (m/s) */
  skid(side: Side, at: Vector3, speed: number, dt: number): void
  update(dt: number, frame: CombatFrame): void
  /** a frame outside the fight: what still plays out (sparks landing, the shield dropping) */
  ambient(dt: number, yaw: number): void
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
  /** the guard is raised (its shield forms) or lowered */
  guard(on: boolean): void
  /** the raised shield's horizontal radius round the robot at a soldier's height (m), 0 when down */
  guardReach(): number
  /**
   * An enemy's blow lands on the robot at `at` (world), coming from `from`,
   * strength 0..1: flares the shield there while guarding, else strikes sparks
   * off the armour. The robot takes no damage.
   */
  struck(at: Vector3, from: Vector3, strength: number, guarded: boolean): void
}

/** A character's fighting: its combo, the rig overlay that poses it and its effects. */
export interface CharacterCombat {
  readonly moveset: Moveset
  readonly overlay: CombatOverlay
  readonly effects: CombatEffects
  /** lift of a fighting step (m) */
  readonly stepLift: number
  /** the big move the full energy meter unlocks */
  readonly special: SpecialMove
  /** what the combo's blows and the special do to enemies */
  readonly hits: CombatHits
  /** the defensive pose held while the guard is up (its keys ease in; the last pose holds) */
  readonly guard: CombatMove
}
