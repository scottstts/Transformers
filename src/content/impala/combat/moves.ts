import type { CombatMove, MoveCue, Moveset } from '../../transformer/combat/moves'
import { free, held, keyed, reachOut, type Keys, type Pose } from './pose'

/**
 * The Impala's combo: all cutlass, in the left hand, fought as a sabre is,
 * point and edge, quick and swinging: the body turns behind every cut, the
 * free right hand balancing it, the hand leading each cut with the blade
 * trailing square behind it and its edge first, and every move flows out of
 * the last one's finish. A lunging thrust; a diagonal cut from high on the
 * left down across the front; a rising cut that scoops the blade along the
 * sand and throws whatever stands in front high into the air; a leap forward
 * and up, the whole body turning one full circle in the air with the blade
 * held out flat, cutting everything in the front half circle, on the ground
 * and in the air. Distances in metres, angles in degrees (pose.ts).
 *
 * The rest between blows (`SIDE`) is a low guard at the left: the fist
 * forward of the left hip, the point ahead and low, the edge down. The feet
 * start in the stance: left [0.94, 0.04], right [-0.94, 0.04] in the move's
 * ground frame.
 */

/** The rest between blows: the low guard at the left side. */
const SIDE_HOLD = { at: [1.42, 0.8, 0.1], point: [0.05, 0.9, -0.42], turn: -12, elbow: 20 } as const
const side = (): Pose => ({ ...held(SIDE_HOLD), ...free(10, -16, 0.72, 24), hipDrop: 0.2, hipPitch: 3 })
/** The rest's weapon angles: every move's yaw unwinds from these. */
const REST = side()

/** The cutlass forming in the fist as the move begins (out of the guard, at once). */
const WIELD: Keys = { 'w.wield': [[0.08, 1]], 'w.two': [[0.04, 0]], 'L.grip': [[0.06, 1]] }

/** Letting the cutlass go (a move's `recovery`, overlaid on the settle): held at the side as it dissolves, then the hand drops to the stance's hang. */
const RELEASE: CombatMove['recovery'] = {
  ...keyed([[0.26, held(SIDE_HOLD)]], {}, REST),
  'w.wield': [[0.24, 1], [0.68, 0]],
}

/** Keys from poses on the cutlass's own branch (from the rest), on top of `into`. */
const keys = (list: ReadonlyArray<readonly [number, Pose]>, into: Keys = {}): Keys => keyed(list, { ...WIELD, ...into }, REST)

/**
 * 1. The thrust, a fencer's lunge: the fist draws back beside the chest, the
 * elbow out, as the body coils; then the left foot shoots forward, the body
 * drops and leans into it and the arm drives the point straight out at a
 * soldier's chest, the forearm across and the knuckles turned down; the free
 * hand flies back to balance it. The rear foot drags up and the point comes
 * back to the low guard.
 */
const THRUST: CombatMove = {
  name: 'thrust',
  strike: 0.18,
  duration: 0.62,
  chain: [0.3, 0.78],
  cancelAt: 0.32,
  recovery: RELEASE,
  keys: keys([
    [0.07, { ...held({ at: [1.4, 0.55, 0.6], point: [-0.06, 1, 0.08], turn: 18, lean: 2, elbow: 70, out: 0.2 }), ...free(30, -10, 0.7, 30), hipDrop: 0.26, hipPitch: 2 }],
    [0.18, { ...held({ at: [0.55, 2.45, 1.15], point: [-0.04, 1, -0.12], turn: -32, lean: 18, elbow: 78 }), ...free(115, -18, 0.9, 10), hipDrop: 0.44, hipPitch: 12, chestX: 4, hipX: 0.1 }],
    [0.27, { ...held({ at: [0.62, 2.35, 1.15], point: [-0.03, 1, -0.08], turn: -28, lean: 16, elbow: 74 }), hipPitch: 10 }],
    [0.44, { ...held({ at: [1.25, 1.3, 0.35], point: [0.03, 0.9, -0.4], turn: -18, lean: 8, elbow: 30 }), ...free(40, -20, 0.8, 20), hipPitch: 6, chestX: 2, hipX: 0.04, hipDrop: 0.3 }],
    [0.6, side()],
  ], {
    'R.heel': [[0.1, 0], [0.18, 18], [0.36, 6], [0.48, 0]],
    advance: [[0.06, 0.04], [0.18, 0.8], [0.45, 1.0]],
  }),
  steps: [
    { side: 'L', t0: 0.05, t1: 0.17, to: [0.98, 1.75], yaw: 8, lift: 0.18 },
    { side: 'R', t0: 0.32, t1: 0.5, to: [-0.92, 1.05], yaw: -6, lift: 0 },
  ],
  cues: [
    { t: 0.01, cue: 'weapon-in', value: 0.12 },
    { t: 0.03, cue: 'servo', value: 0.3 },
    { t: 0.14, cue: 'arc', value: 0.7 },
    { t: 0.18, cue: 'thrust', value: 1 },
    { t: 0.18, cue: 'kick', value: 0.22 },
    { t: 0.22, cue: 'arc', value: 0 },
  ],
}

/**
 * 2. The swing: the fist goes up beside the left of the head, the blade
 * laid back over the left shoulder, as the body winds onto its left side,
 * held a beat; then hips, spine and chest unwind and the fist leads the edge
 * down across the whole front on the diagonal, from high on the left to low
 * on the right, in a tenth of a second, the left foot stepping in under it;
 * the blade follows through low on the right and swings back out round the
 * front to the low guard.
 */
const SWING: CombatMove = {
  name: 'swing',
  strike: 0.25,
  duration: 0.74,
  chain: [0.38, 0.88],
  cancelAt: 0.4,
  recovery: RELEASE,
  keys: keys([
    [0.12, { ...held({ at: [1.35, 0.7, 2.25], point: [0.35, -0.45, 0.82], turn: 28, out: 0.8, elbow: 30 }), ...free(-20, 0, 0.72, 30), hipDrop: 0.28, hipX: 0.1 }],
    // the coil tightens a moment, then the arc from here to the low finish goes at once
    [0.19, { ...held({ at: [1.4, 0.6, 2.32], point: [0.4, -0.5, 0.77], turn: 32, out: 0.85, elbow: 30 }), hipDrop: 0.3, hipX: 0.12 }],
    [0.25, { ...held({ at: [0.55, 2.0, 1.25], point: [-0.35, 0.65, -0.68], turn: -10, lean: 14, out: 0.3, elbow: 40 }), ...free(100, -14, 0.88, 14), hipDrop: 0.42, hipPitch: 10, chestX: 4, hipX: 0 }],
    [0.31, { ...held({ at: [0.1, 1.85, 0.35], point: [-0.45, 0.25, -0.86], turn: -50, lean: 18, elbow: 45 }), ...free(115, -20, 0.9, 10), hipDrop: 0.46, hipPitch: 12, chestX: 6, hipX: -0.1 }],
    [0.42, { ...held({ at: [0.3, 1.85, 0.45], point: [-0.25, 0.75, -0.6], turn: -34, lean: 12, elbow: 35 }), hipPitch: 8, hipDrop: 0.38 }],
    [0.56, { ...held({ at: [1.05, 1.45, 0.3], point: [0.08, 0.88, -0.46], turn: -18, lean: 6, elbow: 25 }), ...free(40, -16, 0.8, 20), hipPitch: 5, hipX: 0, hipDrop: 0.28 }],
    [0.72, side()],
  ], {
    'R.heel': [[0.16, 0], [0.27, 14], [0.5, 4]],
    advance: [[0.12, 0.02], [0.25, 0.6], [0.45, 0.82]],
  }),
  steps: [
    { side: 'L', t0: 0.14, t1: 0.26, to: [0.82, 1.35], yaw: -18, lift: 0.18 },
    { side: 'R', t0: 0.34, t1: 0.5, to: [-1.0, 0.7], yaw: -14, lift: 0.14 },
  ],
  cues: [
    { t: 0.01, cue: 'weapon-in', value: 0.12 },
    { t: 0.02, cue: 'servo', value: 0.35 },
    { t: 0.21, cue: 'arc', value: 1 },
    { t: 0.25, cue: 'stop', value: 0.045 },
    { t: 0.25, cue: 'kick', value: 0.28 },
    { t: 0.26, cue: 'punch', value: 4 },
    { t: 0.26, cue: 'shake', value: 0.14 },
    { t: 0.33, cue: 'arc', value: 0 },
  ],
}

/**
 * 3. The rising cut: the body sinks deep and winds back onto its left side,
 * the fist low behind the left hip and the blade trailing low behind it, its
 * point in the sand; then legs, hips and chest drive up together and the
 * fist leads the blade forward along the sand and up through the front, edge
 * first, throwing whatever stands there high into the air, the robot rising
 * onto its toes, leaning back, the blade high over its head; held a beat,
 * then down to the low guard.
 */
const RISE_STRIKE = 0.32
const RISING: CombatMove = {
  name: 'rising',
  strike: RISE_STRIKE,
  duration: 0.92,
  chain: [0.52, 1.05],
  cancelAt: 0.56,
  recovery: RELEASE,
  keys: keys([
    [0.13, { ...held({ at: [1.5, 0.35, -0.05], point: [0.15, -0.65, -0.75], turn: 26, lean: 30, elbow: 15 }), ...free(30, -30, 0.8, 30), hipDrop: 0.72, hipPitch: 18, spineX: 6, chestX: 6, headX: -16, hipX: 0.12 }],
    [0.22, { ...held({ at: [1.48, 0.45, -0.12], point: [0.12, -0.55, -0.83], turn: 28, lean: 32, elbow: 15 }), hipDrop: 0.78, hipPitch: 20 }],
    // the scoop: round the outside low, the fist leading forward, the blade along the sand behind it, then up through the front
    [0.245, { ...held({ at: [1.45, 0.85, 0.0], point: [0.55, -0.1, -0.83], turn: 18, lean: 28, elbow: 18 }), hipDrop: 0.7, hipPitch: 17 }],
    [0.27, { ...held({ at: [1.15, 1.35, 0.15], point: [0.05, 0.5, -0.86], turn: 6, lean: 24, elbow: 20 }), hipDrop: 0.6, hipPitch: 14 }],
    [RISE_STRIKE, { ...held({ at: [0.85, 1.85, 1.35], point: [0, 0.75, 0.66], turn: -6, lean: 2, out: 0.5, elbow: 25 }), ...free(60, 40, 0.85, 20), hipDrop: 0.2, hipPitch: 0, chestX: -4, headX: -8, hipX: 0.04 }],
    [0.4, { ...held({ at: [1.05, 0.75, 2.7], point: [0.08, -0.4, 0.91], turn: -4, lean: -14, out: 1, elbow: 25 }), ...free(70, 60, 0.85, 26), hipDrop: -0.04, hipPitch: -8, spineX: -4, chestX: -8, headX: -14 }],
    [0.6, { ...held({ at: [1.05, 0.72, 2.65], point: [0.1, -0.38, 0.92], turn: -4, lean: -12, out: 1, elbow: 25 }), hipDrop: 0.0, hipPitch: -6, chestX: -6, headX: -10 }],
    [0.76, { ...held({ at: [1.3, 1.0, 0.95], point: [0.12, 0.8, 0.5], turn: -10, out: 0.3, elbow: 22 }), ...free(20, -12, 0.75, 22), hipPitch: 2, spineX: 0, chestX: 0, headX: 0, hipDrop: 0.16 }],
    [0.9, { ...side(), 'L.out': 0 }],
  ], {
    'R.heel': [[0.24, 0], [0.34, 24], [0.6, 18], [0.8, 0]],
    'L.heel': [[0.26, 0], [0.36, 16], [0.6, 12], [0.78, 0]],
    advance: [[0.12, 0.02], [0.26, 0.3], [RISE_STRIKE, 0.85], [0.6, 1.0]],
  }),
  steps: [
    { side: 'R', t0: 0.03, t1: 0.15, to: [-1.0, -0.35], yaw: -14, lift: 0.16 },
    { side: 'L', t0: 0.2, t1: 0.31, to: [0.9, 1.2], yaw: 6, lift: 0.14 },
    { side: 'R', t0: 0.6, t1: 0.76, to: [-0.94, 0.9], yaw: -4, lift: 0.14 },
  ],
  cues: [
    { t: 0.01, cue: 'weapon-in', value: 0.12 },
    { t: 0.02, cue: 'servo', value: 0.45 },
    { t: 0.06, cue: 'eyes', value: 0.6 },
    { t: 0.24, cue: 'arc', value: 1.2 },
    { t: 0.27, cue: 'scoop', value: 1 },
    { t: RISE_STRIKE, cue: 'updraft', value: 1 },
    { t: RISE_STRIKE, cue: 'stop', value: 0.05 },
    { t: RISE_STRIKE, cue: 'kick', value: 0.34 },
    { t: RISE_STRIKE + 0.01, cue: 'punch', value: 6 },
    { t: RISE_STRIKE + 0.01, cue: 'shake', value: 0.2 },
    { t: 0.42, cue: 'arc', value: 0 },
    { t: 0.62, cue: 'eyes', value: 0 },
  ],
}

/** The finisher's times: crouch, take-off, the turn through the air, the landing (s). */
export const CYCLONE = { takeoff: 0.22, spin: [0.26, 0.64] as const, strike: 0.45, land: 0.74 } as const
/** How high the feet leave the sand at the top and how far it travels (m). */
const LEAP = { air: 2.3, advance: 5.4 }

/**
 * 4. The cyclone: it crouches, the fist brought out to the left and the
 * blade laid out flat ahead of it, and leaps forward and up; in the air the
 * whole body turns one full circle clockwise, the arm held out to the left,
 * the forearm pointing on round the turn and the blade flat out ahead of it,
 * edge leading, cutting through everything round it, on the ground and in
 * the air; it lands deep on both feet and stands into the low guard.
 */
function cyclone(): CombatMove {
  const { takeoff, spin, strike, land } = CYCLONE
  // the arm out to the left and a little forward, the forearm turned forward (it leads the clockwise turn), the blade flat beyond it
  const out = (t: number, lean: number, drop: number, extra: Pose = {}): [number, Pose] =>
    [t, { ...held({ at: reachOut(-6, lean, 62, drop, 1.75), point: [0.95, -0.05, -0.1], turn: -6, lean, out: 0.6, elbow: 70 }), ...free(-30, -6, 0.8, 30), ...extra }]
  const poses: Array<[number, Pose]> = [
    [0.05, { ...held({ at: [1.3, 1.45, 1.75], point: [0.25, 0.95, 0.2], turn: 0, out: 0.6, elbow: 40 }), hipDrop: 0.3, hipPitch: 6 }],
    [0.11, { ...held({ at: [1.75, 0.95, 0.55], point: [0.8, 0.55, -0.2], turn: 10, lean: 18, out: 0.3, elbow: 50 }), ...free(-20, -20, 0.75, 30), hipDrop: 0.62, hipPitch: 14, chestX: 4, headX: -10 }],
    [takeoff - 0.02, { hipDrop: 0.66, hipPitch: 16 }],
    out(takeoff + 0.06, 6, 4, { hipDrop: 0.12, hipPitch: 4, chestX: 0, headX: -4 }),
    out(spin[0] + 0.12, 4, 2),
    out(spin[1] - 0.06, 4, 4),
    out(land - 0.04, 10, 10, { hipDrop: 0.2, hipPitch: 8 }),
    out(land + 0.04, 16, 20, { hipDrop: 0.82, hipPitch: 18, chestX: 6, headX: -10 }),
    out(land + 0.2, 12, 18, { hipDrop: 0.66, hipPitch: 12 }),
    [land + 0.42, { ...held({ at: [1.25, 1.25, 0.3], point: [0.1, 0.88, -0.46], turn: -12, lean: 6, elbow: 25 }), ...free(20, -14, 0.75, 24), hipDrop: 0.32, hipPitch: 5, chestX: 0, headX: 0 }],
    [1.36, side()],
  ]
  const k = keys(poses, {
    // one full turn, clockwise seen from above, fastest mid-air (an eased spin, the strike across the front)
    turn: [[spin[0], 0], [spin[0] + 0.07, -30], [(spin[0] + spin[1]) / 2, -180], [spin[1] - 0.07, -330], [spin[1], -360]],
    advance: [[0.1, 0.02], [takeoff, 0.2], [takeoff + 0.18, LEAP.advance * 0.45], [land - 0.04, LEAP.advance], [land + 0.1, LEAP.advance + 0.15]],
    air: [[takeoff, 0], [takeoff + 0.08, 0.95], [(takeoff + land) / 2, LEAP.air], [land - 0.08, 0.7], [land - 0.01, 0]],
    'R.free': [[takeoff - 0.01, 0], [takeoff + 0.04, 1], [land - 0.02, 1], [land + 0.05, 0]],
    'L.free': [[takeoff - 0.01, 0], [takeoff + 0.04, 1], [land - 0.02, 1], [land + 0.05, 0]],
    // tucked through the turn, the feet drawn up under the hips; down a frame before the sand
    'R.lx': [[takeoff + 0.06, -0.3], [land - 0.03, -0.1]],
    'R.ly': [[takeoff + 0.06, -0.2], [(takeoff + land) / 2, 0.3], [land - 0.03, -0.15]],
    'R.lz': [[takeoff + 0.06, 0.4], [(takeoff + land) / 2, 0.75], [land - 0.08, 0.25], [land - 0.02, 0]],
    'R.lp': [[takeoff + 0.06, 30], [(takeoff + land) / 2, 20], [land - 0.03, 4]],
    'L.lx': [[takeoff + 0.06, -0.3], [land - 0.03, -0.1]],
    'L.ly': [[takeoff + 0.06, 0.25], [(takeoff + land) / 2, -0.2], [land - 0.03, 0.3]],
    'L.lz': [[takeoff + 0.06, 0.6], [(takeoff + land) / 2, 0.55], [land - 0.08, 0.2], [land - 0.02, 0]],
    'L.lp': [[takeoff + 0.06, 24], [(takeoff + land) / 2, 30], [land - 0.03, 6]],
    'R.heel': [[0.1, 10], [takeoff - 0.02, 24], [takeoff + 0.04, 0]],
    'L.heel': [[0.1, 8], [takeoff - 0.02, 22], [takeoff + 0.04, 0]],
  })
  const cues: MoveCue[] = [
    { t: 0.01, cue: 'weapon-in', value: 0.12 },
    { t: 0.02, cue: 'servo', value: 0.45 },
    { t: 0.04, cue: 'eyes', value: 1 },
    { t: takeoff, cue: 'leap', value: 1 },
    { t: takeoff, cue: 'punch', value: 7 },
    { t: takeoff, cue: 'pull', value: 2.4 },
    { t: spin[0], cue: 'arc', value: 1.3 },
    { t: spin[0] + 0.02, cue: 'whirl', value: 1 },
    { t: strike, cue: 'stop', value: 0.07 },
    { t: strike, cue: 'kick', value: 0.4 },
    { t: strike, cue: 'shake', value: 0.22 },
    { t: spin[1], cue: 'arc', value: 0 },
    { t: land, cue: 'touchdown', value: 1 },
    { t: land + 0.3, cue: 'pull', value: 0 },
    { t: land + 0.34, cue: 'eyes', value: 0 },
    { t: land + 0.4, cue: 'servo', value: 0.3 },
  ]
  return {
    name: 'cyclone',
    strike,
    duration: 1.4,
    chain: [1.12, 1.5],
    cancelAt: 1.12,
    recovery: RELEASE,
    keys: k,
    steps: [
      { side: 'R', t0: 0.02, t1: 0.12, to: [-1.0, -0.2], yaw: -10, lift: 0.14 },
      // gathered under the body after the landing, before the hand-back
      { side: 'R', t0: land + 0.42, t1: land + 0.58, to: [-0.94, LEAP.advance + 0.2], yaw: 0, lift: 0.14 },
      { side: 'L', t0: land + 0.52, t1: land + 0.64, to: [0.94, LEAP.advance + 0.25], yaw: 0, lift: 0.12 },
    ],
    cues: cues.sort((a, b) => a.t - b.t),
  }
}

export const IMPALA_MOVES: Moveset = {
  moves: [THRUST, SWING, RISING, cyclone()],
  recover: 0.85,
  recoverCues: [{ t: 0.0, cue: 'weapon-out', value: 0.36 }],
}

/**
 * The guard (held with the right mouse button): the cutlass up in a hanging
 * guard, the fist high in front of the left of the head and the blade
 * slanting down across the front to the right, edge out; the right forearm
 * raised before the chest, knees bent, weight low. The shield forms round it
 * (fighter.ts); the pose holds for as long as the guard does.
 */
export const IMPALA_GUARD: CombatMove = {
  name: 'guard',
  duration: 1e6,
  chain: [1e6, 1e6],
  keys: keyed([[0.16, { ...held({ at: [0.95, 1.4, 1.6], point: [-0.62, 0.38, -0.68], turn: -8, lean: 14, out: 0.4, elbow: 40, head: 0.6 }), ...free(-26, 20, 0.5, 40, 1), hipDrop: 0.32, hipPitch: 6, spineX: 3, chestX: 5, headX: 6 }]], {
    'w.wield': [[0.1, 1]],
    'w.two': [[0.04, 0]],
    'L.grip': [[0.06, 1]],
  }, REST),
  cues: [{ t: 0.0, cue: 'weapon-in', value: 0.16 }, { t: 0.02, cue: 'servo', value: 0.25 }],
}
