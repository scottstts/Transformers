import type { RigDims } from '../asset/format'
import type { Key } from './curves'
import type { CombatMove } from './moves'
import type { Channel, Side } from './pose'

/** How long the reaction plays (s), and how long it holds the controls (movement, a click and the guard take it back from here). */
export const KNOCKBACK_TIME = 0.95
export const KNOCKBACK_HOLD = 0.6

/**
 * How far a robot is thrown back (m): a hip height's share plus a little,
 * so each robot travels about the same in its own strides (the 4 m Semi
 * further than the 2 m racer, each a couple of stumbling steps).
 */
export function knockbackTravel(dims: RigDims): number {
  return 0.55 * dims.hipZ + 0.6
}

/**
 * The robots' knock-back reaction to the commander's whirl (a `CombatMove`
 * on the fight's channels, played in a ground frame facing the commander):
 * the body is thrown back from the blow, hips, spine, chest and head bent
 * back in turn and the knees buckling, the arms flung up and out; the root
 * travels straight back, fast and then easing (monotone keys, so it never
 * comes back toward the blow); the feet stumble back in two steps, the near
 * one catching the fall first and the other following, then a small settle;
 * the body comes upright as it catches itself and hands over to the
 * ordinary recovery.
 *
 * One set of keys serves every robot. The arm channels are measured from
 * each shoulder and mirrored (pose.ts), so they mean the same on any rig;
 * travel, step lift and the knees' buckle scale with the robot's hip
 * height, the steps with its stance.
 */
export function knockbackMove(dims: RigDims, stepLift: number): CombatMove {
  const T = knockbackTravel(dims)
  const s = dims.hipZ / 3.1
  const X = dims.stanceX ?? dims.hipX
  const back = (dims.footF ?? dims.robotF) - dims.robotF
  const arm = (side: Side): Partial<Record<Channel, readonly Key[]>> => ({
    [`${side}.az` as Channel]: [[0.12, 80], [0.4, 72], [0.75, 62]],
    [`${side}.el` as Channel]: [[0.12, -24], [0.36, -36], [0.72, -60]],
    [`${side}.reach` as Channel]: [[0.12, 0.86], [0.6, 0.92]],
    [`${side}.elbow` as Channel]: [[0.12, 30], [0.6, 12]],
    [`${side}.grip` as Channel]: [[0.1, 0]],
  })
  return {
    name: 'knockback',
    duration: KNOCKBACK_TIME,
    chain: [KNOCKBACK_HOLD, KNOCKBACK_TIME],
    cancelAt: KNOCKBACK_HOLD,
    keys: {
      advance: [[0.07, -0.3 * T], [0.18, -0.62 * T], [0.34, -0.86 * T], [0.56, -0.98 * T], [0.8, -T]],
      hipPitch: [[0.08, -12], [0.22, -9], [0.5, -3], [0.85, 0]],
      spineX: [[0.1, -9], [0.26, -7], [0.55, -1], [0.9, 0]],
      chestX: [[0.12, -14], [0.3, -9], [0.6, -2], [0.9, 0]],
      headX: [[0.1, -20], [0.3, -10], [0.6, 2], [0.9, 0]],
      hipDrop: [[0.1, 0.06 * s], [0.3, 0.16 * s], [0.55, 0.12 * s], [0.9, 0.04 * s]],
      hipYaw: [[0.1, 6], [0.4, -4], [0.9, 0]],
      chestZ: [[0.12, 8], [0.45, -5], [0.9, 0]],
      // a formed weapon dissolves in the hand (the off hand lets go first)
      'w.two': [[0.06, 0]],
      'w.wield': [[0.2, 0]],
      ...arm('R'),
      ...arm('L'),
      'R.heel': [[0.1, 0]],
      'L.heel': [[0.1, 0]],
    },
    steps: [
      { side: 'R', t0: 0.06, t1: 0.3, to: [-X, back - 0.62 * T], lift: 0.4 * stepLift },
      { side: 'L', t0: 0.26, t1: 0.52, to: [X, back - T - 0.05 * s], lift: 0.4 * stepLift },
      { side: 'R', t0: 0.52, t1: 0.7, to: [-X, back - T + 0.04 * s], lift: 0.2 * stepLift },
    ],
    cues: [
      { t: 0, cue: 'weapon-out', value: 0.18 },
      { t: 0, cue: 'kick', value: 0.9 },
      { t: 0, cue: 'shake', value: 0.55 },
      { t: 0.02, cue: 'servo', value: 0.7 },
    ],
  }
}
