/**
 * What a fighting move does to whatever stands in front of the robot, as
 * authored data next to its keys (moves.ts). Times are move (or special) time
 * in seconds; places are in the move's ground frame (lateral + left, forward),
 * like footsteps. The robots stand head and shoulders over the 3 m soldiers,
 * so blows are volumes on the ground plane in front of the body rather than
 * the fist's or edge's own path, which would sail over their heads.
 *
 *   strike  a blow landing at `t`: a sector `reach` metres deep and `arc`
 *           degrees wide, turned `aim` degrees (+ left) from the heading,
 *           measured from the robot's standing point
 *   sweep   the body (or a blade carried with it) ploughing through for the
 *           whole window: a circle round the standing point pushed `ahead`;
 *           each soldier is hit once per sweep, thrown along the motion and
 *           out of the path
 *   blast   a burst at a ground point at `t` (a slam, a crater, an ignition):
 *           everything within `radius` thrown out from it, harder nearer
 *
 * `damage` is in soldier health (SOLDIER.health, 300, is a whole soldier: a
 * combo's first three blows leave one standing, its fourth takes it down),
 * `knock` the speed
 * (m/s) it is thrown at along the ground and `lift` straight up.
 */
export type HitKind = 'blunt' | 'cut' | 'blast'

export interface StrikeHit {
  t: number
  kind: HitKind
  reach: number
  arc: number
  aim?: number
  damage: number
  knock: number
  lift: number
}

export interface SweepHit {
  t0: number
  t1: number
  kind: HitKind
  radius: number
  ahead: number
  damage: number
  knock: number
  lift: number
}

export interface BlastHit {
  t: number
  kind: HitKind
  at: readonly [number, number]
  radius: number
  damage: number
  knock: number
  lift: number
}

export interface MoveHits {
  strikes?: readonly StrikeHit[]
  sweeps?: readonly SweepHit[]
  blasts?: readonly BlastHit[]
}

/** A character's hits: one set per combo move, in order, and the special's. */
export interface CombatHits {
  moves: readonly MoveHits[]
  special: MoveHits
}

/**
 * One resolved hit in the world, as the fight hands it to whatever can be
 * hit. `x`, `z` are the shape's centre (strike: the standing point; sweep: the
 * pushed circle's centre; blast: its ground point), `heading` the direction
 * the robot faces or moves (rad, three.js yaw), `motion` the robot's ground
 * speed along it (m/s, sweeps).
 */
export interface HitEvent {
  shape: 'sector' | 'circle'
  kind: HitKind
  x: number
  z: number
  heading: number
  /** sector depth or circle radius (m) */
  reach: number
  /** sector full angle (rad) */
  arc: number
  damage: number
  knock: number
  lift: number
  motion: number
  /** a sweep's identity: a soldier takes each sweep once */
  sweep: number
  /** thrown outward from the centre (blasts) rather than along the heading */
  radial: boolean
  /** the special: everything reacts bigger, and its blows before the last cannot destroy (enemies.md) */
  special: boolean
  /** the special's last blow: whatever its hits emptied breaks apart now */
  final: boolean
}

/** When a move's last blow lands (s): its latest strike or blast, or the end of its latest sweep. */
export function lastHitTime(h: MoveHits): number {
  let t = 0
  for (const s of h.strikes ?? []) t = Math.max(t, s.t)
  for (const b of h.blasts ?? []) t = Math.max(t, b.t)
  for (const w of h.sweeps ?? []) t = Math.max(t, w.t1)
  return t
}
