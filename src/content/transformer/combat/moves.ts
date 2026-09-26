import type { Key } from './curves'
import type { Channel, Side } from './pose'

/**
 * A fighting move as authored data: keyed pose channels (pose.ts), footsteps
 * on the ground, and cues for the character's effects. Times are seconds from
 * the move's start.
 *
 * A move starts from whatever pose the last one left (the start of every
 * channel is captured), so keys begin after t = 0. A channel the move does not
 * key eases to neutral over its first moments; `advance`, `strafe` and `turn`
 * are root motion in the move's ground frame (origin and heading where the
 * move began), so the body travels and the planted feet stay where they are.
 */
export interface CombatMove {
  name: string
  duration: number
  /**
   * The window (move time) in which a click chains the next move. It opens as
   * the strike's follow-through settles and may run past `duration`, while the
   * last pose holds; a click before it is buffered, and once it closes the
   * combo recovers and starts again from the first move.
   */
  chain: readonly [number, number]
  /** Earliest grounded exit to movement/guard, independently of the next attack. */
  cancelAt?: number
  /** Authored release path, overlaid on the ordinary settle when stopping here. */
  recovery?: Partial<Record<Channel, readonly Key[]>>
  keys: Partial<Record<Channel, readonly Key[]>>
  steps?: readonly Footstep[]
  cues?: readonly MoveCue[]
  /** the moment the blow lands (s): a combo move charges the special's energy here */
  strike?: number
}

/** A foot lifting at t0 and landing at t1 on a place in the move's ground frame. */
export interface Footstep {
  side: Side
  t0: number
  t1: number
  /** landing place: lateral (m, + left of the move's heading) and forward (m) of the move's origin */
  to: readonly [number, number]
  /** toe direction relative to the move's heading (deg, + left) */
  yaw?: number
  /** peak lift (m); 0 drags the foot along the ground (a skid) */
  lift?: number
  /**
   * A kick: the foot passes through this point halfway (lateral, forward, height
   * above the ground, in the move's ground frame) instead of a plain lifted arc,
   * the toe pointed by `point` (deg) and the foot turned by `viaYaw` (deg) there.
   */
  via?: readonly [number, number, number]
  viaYaw?: number
  point?: number
}

/** A named moment for the character's effects (sound, particles, weapon, camera). */
export interface MoveCue {
  t: number
  cue: string
  /** strength or any one number the cue needs */
  value?: number
}

/** A character's four-move combo and how it recovers into its stance. */
export interface Moveset {
  moves: readonly CombatMove[]
  /** time (s) from the end of a combo back to the stance */
  recover: number
  /** cues played at the start of the recovery (the weapon going away) */
  recoverCues?: readonly MoveCue[]
}

/** Ease-to-neutral time of channels a move leaves unkeyed (s). */
export const UNKEYED_SETTLE = 0.35

/** Largest number of keys a channel may carry (plus the captured start). */
export const MAX_KEYS = 48
