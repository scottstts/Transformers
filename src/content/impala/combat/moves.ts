import type { CombatMove, MoveCue, Moveset } from '../../transformer/combat/moves'
import { flight, frame, held, keyed, reachOut, smoothEase, Timeline, type Frame, type Keys, type Pose } from './pose'

/**
 * The Impala's combo: all cutlass, in the left hand, fought the way a big
 * man fights with a heavy one-handed blade, posed as a person and carried
 * over to the robot: every blow comes up from the ground through the legs,
 * hips, chest and arm in that order (the hips lead, the blade comes last
 * and fastest), each one behind a long stride that lands as the blade does,
 * the weight thrown down and over the front knee, the free arm thrown the
 * other way to balance it, the back heel peeling up only as the lunge
 * stretches the back leg. Wind-ups are short and deep, the follow-through
 * carries on well past the target, and every finish is the next blow's coil.
 *
 * The cutlass's grip runs across the fist, so its blade stands square to the
 * forearm and out of the thumb's side (pose.ts): the arm and elbow place it,
 * the wrist only finishes it, and the cuts are an axe's in one hand. The
 * blade goes back over the shoulder on the wind-up, comes over the top, and
 * drives down and through as the forearm swings down; held low, it points
 * ahead and in across the body. The poses ask for the blade there.
 *
 *   1. thrust: a low driving stab behind a long lunge, the point level at a
 *      soldier's chest
 *   2. cleave: up over the left shoulder and down on the diagonal across the
 *      front into the sand, the whole body dropping onto the front leg
 *   3. rising: out of a deep crouch over the blade, legs, hips and arm drive
 *      up together and the blade scoops up through the front half circle,
 *      throwing everything there high, the body stretched up and back
 *   4. cyclone: a deep crouch, a leap forward and up, one full turn in the
 *      air with the arm out, cutting all round, and a hard landing
 *
 * Distances in metres from the pelvis at rest in the heading's frame (x +
 * left, forward, up), angles in degrees (pose.ts). The feet start in the
 * stance (left [0.94, 0.04], right [-0.94, 0.04]); each move ends in a
 * fighter's stance, left foot leading.
 */

/** The rest between blows: the low guard, the fist ahead of the left hip and the blade low and across the front. */
const SIDE: Frame = { turn: -10, drop: 0.22, pitch: 4, hold: { at: [1.4, 0.9, 0.12], point: [-0.35, 0.85, -0.4] }, free: [12, -18, 0.72, 24, 0.55] }
const REST = frame(SIDE)

/** The cutlass forming in the fist as the move begins (out of the guard, at once). */
const WIELD: Keys = { 'w.wield': [[0.08, 1]], 'w.two': [[0.04, 0]], 'L.grip': [[0.06, 1]] }

/** Letting the cutlass go (a move's `recovery`, overlaid on the settle): held low as it dissolves, then the hand drops to the stance's hang. */
const RELEASE: CombatMove['recovery'] = {
  ...keyed([[0.26, held({ ...SIDE.hold!, turn: SIDE.turn })]], {}, REST),
  'w.wield': [[0.24, 1], [0.68, 0]],
}

/** A move's keys from its timeline, on top of the wield and `extra`, the weapon's yaw unwound from the rest. */
const keys = (line: Timeline, extra: Keys = {}): Keys => line.keys({ ...WIELD, ...extra }, REST)

/**
 * 1. The thrust. The body sinks and coils back onto the right leg, the hips
 * and shoulders turned away, the fist drawn back to the left hip with the
 * point level and the free hand reaching forward. Then the left foot shoots
 * out a long stride, the hips drop and slam round, the shoulder drives in
 * behind the arm and the fist punches forward and down so the point goes
 * home level at a soldier's chest, the free arm flung back. It holds a beat
 * stretched out over the front knee, the back heel peeled up, then the back
 * foot drags up under it.
 */
const THRUST_STRIKE = 0.2
const LUNGE: Frame = {
  turn: -46, hips: -18, drop: 0.86, pitch: 18, bend: 12, shift: 0.24, nod: 6,
  hold: { at: reachOut(-46, 30, -4, 44, 2.24), point: [0, 1, 0.12] }, free: [158, 4, 0.95, 8, 1],
}
const thrust = new Timeline()
  .key(0.1, { turn: 30, hips: 14, drop: 0.5, pitch: 7, bend: -3, shift: -0.2, nod: 4, hold: { at: [1.5, -0.08, 0.85], point: [0, 1, 0.12] }, free: [18, -2, 0.88, 22, 1] })
  .key(0.14, { turn: 34, hips: 16, drop: 0.56, pitch: 8, bend: -4, shift: -0.24, nod: 4, hold: { at: [1.52, -0.14, 0.85], point: [0, 1, 0.12] }, free: [16, -2, 0.9, 22, 1] })
  .cut(0.14, THRUST_STRIKE, [
    { turn: 34, hips: 16, drop: 0.56, pitch: 8, bend: -4, shift: -0.24, nod: 4, hold: { at: [1.52, -0.14, 0.85], point: [0, 1, 0.12] }, free: [16, -2, 0.9, 22, 1] },
    { turn: -6, hips: -2, drop: 0.74, pitch: 13, bend: 4, shift: 0, nod: 5, hold: { at: [1.35, 1.4, 0.45], point: [0, 1, 0.12] }, free: [90, -6, 0.9, 14, 1] },
    LUNGE,
  ], { lead: 0.35, lag: 0.12 })
  .key(0.31, { ...LUNGE, drop: 0.82, hold: { at: reachOut(-44, 28, -4, 42, 2.26), point: [0, 1, 0.1] } })
  .key(0.46, { turn: -24, hips: -9, drop: 0.5, pitch: 9, bend: 4, shift: 0.1, hold: { at: [1.25, 1.5, 0.3], point: [-0.3, 0.85, -0.42] }, free: [60, -16, 0.8, 18, 0.8] })
  .key(0.64, SIDE)
const THRUST: CombatMove = {
  name: 'thrust',
  strike: THRUST_STRIKE,
  duration: 0.7,
  chain: [0.32, 0.84],
  cancelAt: 0.34,
  recovery: RELEASE,
  keys: keys(thrust, {
    advance: [[0.14, 0], [THRUST_STRIKE, 1.75], [0.31, 1.9], [0.5, 2.05]],
    'R.heel': [[0.15, 0], [0.21, 16], [0.33, 14], [0.44, 0]],
  }),
  steps: [
    { side: 'L', t0: 0.12, t1: 0.19, to: [1.05, 3.45], yaw: 10, lift: 0.1 },
    { side: 'R', t0: 0.38, t1: 0.54, to: [-0.98, 1.55], yaw: -8, lift: 0.06 },
  ],
  cues: [
    { t: 0.01, cue: 'weapon-in', value: 0.12 },
    { t: 0.15, cue: 'arc', value: 0.9 },
    { t: 0.19, cue: 'stomp.L', value: 0.9 },
    { t: THRUST_STRIKE, cue: 'thrust', value: 1.3 },
    { t: THRUST_STRIKE, cue: 'stop', value: 0.07 },
    { t: THRUST_STRIKE, cue: 'kick', value: 0.4 },
    { t: THRUST_STRIKE, cue: 'punch', value: 4 },
    { t: 0.21, cue: 'shake', value: 0.22 },
    { t: 0.25, cue: 'arc', value: 0 },
  ],
}

/**
 * 2. The cleave. Out of the lunge the arm whips the blade up over the left
 * shoulder, the body rising and winding left onto the back leg, the blade
 * laid back behind the shoulder and the free hand across in front: a beat
 * coiled tall. Then the left foot stamps out again, the hips drop and turn,
 * the chest pours after them and the arm brings the blade over the top and
 * down on the diagonal across the front, so hard the whole body folds over
 * the front knee and the point bites into the sand off the right foot, the
 * free arm flung up and back. It wrenches the blade out and comes back to
 * the guard.
 */
const SWING_STRIKE = 0.28
const COIL: Frame = {
  turn: 48, hips: 16, drop: 0.16, pitch: -4, bend: -5, shift: -0.22, nod: -4, head: 0.8,
  hold: { at: [1.5, 0.3, 2.6], point: [0.2, -0.9, 0.35], out: 0.4 }, free: [-28, -6, 0.78, 24, 1],
}
const BITE: Frame = {
  turn: -52, hips: -22, drop: 0.9, pitch: 20, bend: 8, shift: 0.18, nod: 10,
  hold: { at: [0.5, 2.55, 0.1], point: [-0.25, 0.9, -0.2] }, free: [150, 22, 0.94, 8, 1],
}
const swing = new Timeline()
  .cut(0.02, 0.16, [
    { turn: -30, hips: -12, drop: 0.6, pitch: 12, bend: 6, shift: 0.15, hold: { at: [0.9, 2.6, 0.6], point: [0, 1, 0.12] }, free: [120, -4, 0.9, 12, 1] },
    { turn: 10, hips: 2, drop: 0.36, pitch: 4, bend: 0, shift: -0.05, hold: { at: [1.2, 1.7, 2.2], point: [0.0, 0.35, 0.94], out: 0.2 }, free: [20, -10, 0.8, 20, 1] },
    COIL,
  ], { ease: smoothEase, lead: 0.2, lag: 0 })
  .key(0.21, { ...COIL, turn: 52, hips: 18, hold: { ...COIL.hold!, at: [1.52, 0.22, 2.64] } })
  .cut(0.21, 0.31, [
    { ...COIL, turn: 52, hips: 18, hold: { ...COIL.hold!, at: [1.52, 0.22, 2.64] } },
    { turn: 18, hips: -4, drop: 0.42, pitch: 6, bend: 2, shift: 0, hold: { at: [1.35, 1.7, 2.65], point: [-0.15, -0.5, 0.85], out: 0.3 }, free: [40, -6, 0.85, 18, 1] },
    { turn: -22, hips: -16, drop: 0.7, pitch: 16, bend: 9, shift: 0.12, hold: { at: [0.85, 2.6, 1.4], point: [-0.3, 0.9, 0.3] }, free: [120, 6, 0.9, 12, 1] },
    BITE,
  ], { lead: 0.3, lag: 0.1 })
  .key(0.43, { ...BITE, drop: 0.82, hold: { at: [0.42, 2.45, 0.0], point: [-0.25, 0.9, -0.25] } })
  .key(0.52, { turn: -36, hips: -14, drop: 0.55, pitch: 12, bend: 8, shift: 0.1, hold: { at: [0.5, 2.3, 0.5], point: [-0.3, 0.9, -0.2] }, free: [80, -10, 0.85, 16, 1] })
  .key(0.66, { turn: -18, hips: -7, drop: 0.32, pitch: 6, bend: 2, shift: 0, hold: { at: [1.15, 1.4, 0.25], point: [-0.35, 0.85, -0.4] }, free: [40, -16, 0.8, 20, 0.7] })
  .key(0.8, SIDE)
const SWING: CombatMove = {
  name: 'swing',
  strike: SWING_STRIKE,
  duration: 0.84,
  chain: [0.42, 0.98],
  cancelAt: 0.44,
  recovery: RELEASE,
  keys: keys(swing, {
    advance: [[0.22, 0], [SWING_STRIKE, 1.25], [0.44, 1.45]],
    'R.heel': [[0.24, 0], [0.3, 14], [0.44, 10], [0.56, 0]],
  }),
  steps: [
    { side: 'R', t0: 0.04, t1: 0.13, to: [-1.12, -0.45], yaw: -16, lift: 0.08 },
    { side: 'L', t0: 0.21, t1: 0.28, to: [1.0, 2.75], yaw: -14, lift: 0.1 },
    { side: 'R', t0: 0.52, t1: 0.66, to: [-1.0, 1.0], yaw: -10, lift: 0.07 },
  ],
  cues: [
    { t: 0.01, cue: 'weapon-in', value: 0.12 },
    { t: 0.13, cue: 'stomp.R', value: 0.5 },
    { t: 0.23, cue: 'arc', value: 1.3 },
    { t: 0.28, cue: 'stomp.L', value: 1 },
    { t: SWING_STRIKE, cue: 'stop', value: 0.07 },
    { t: SWING_STRIKE, cue: 'kick', value: 0.42 },
    { t: 0.29, cue: 'punch', value: 5 },
    { t: 0.29, cue: 'shake', value: 0.26 },
    { t: 0.32, cue: 'bite', value: 0.8 },
    { t: 0.36, cue: 'arc', value: 0 },
  ],
}

/**
 * 3. The rising cut. Out of the cleave's bite the body sinks deeper still,
 * squatting over its knees and turning in over the blade, the point dragged
 * back through the sand toward the front of the right foot, the free arm
 * hanging low. Then legs, hips, chest and arm drive up together: the left
 * foot stamps, the body uncoils left and springs up to its full height, and
 * the fist hauls the blade up out of the sand and through the whole front,
 * scooping everything there high into the air, until it is raised over the
 * head with the body stretched up and leaning back, looking up after them.
 * The free arm swings down and back past the hip as the counterweight, low.
 */
const RISE_STRIKE = 0.32
const SQUAT: Frame = {
  turn: -34, hips: -14, drop: 1.0, pitch: 26, bend: 10, shift: 0.05, nod: -8,
  hold: { at: [0.6, 2.5, -0.05], point: [-0.2, 0.8, -0.55] }, free: [40, -60, 0.78, 20, 1],
}
const TOP: Frame = {
  turn: 26, hips: 10, drop: -0.08, pitch: -8, bend: -9, shift: 0.05, nod: -18,
  hold: { at: [1.05, 0.95, 2.85], point: [0.05, -0.35, 0.94], out: 0.8 }, free: [150, -46, 0.86, 14, 1],
}
const rising = new Timeline()
  .key(0.14, { ...SQUAT, drop: 0.92 })
  .key(0.22, SQUAT)
  .cut(0.22, RISE_STRIKE + 0.05, [
    SQUAT,
    { turn: -14, hips: 2, drop: 0.78, pitch: 20, bend: 7, shift: 0.05, nod: -6, hold: { at: [0.85, 2.5, 0.3], point: [-0.35, 0.85, -0.3] }, free: [80, -55, 0.82, 18, 1] },
    { turn: 6, hips: 10, drop: 0.3, pitch: 6, bend: 0, shift: 0.05, nod: -10, hold: { at: [0.95, 2.35, 1.45], point: [-0.25, 0.75, 0.6] }, free: [130, -50, 0.86, 14, 1] },
    TOP,
  ], { lead: 0.3, lag: 0.08 })
  .key(0.56, { ...TOP, drop: 0.02, pitch: -6, hold: { ...TOP.hold!, at: [1.05, 0.9, 2.8] } })
  .key(0.76, { turn: -8, hips: -3, drop: 0.25, pitch: 3, bend: 0, nod: 0, hold: { at: [1.3, 1.1, 1.0], point: [-0.3, 0.8, 0.5] }, free: [30, -30, 0.76, 22, 0.7] })
  .key(0.93, SIDE)
const RISING: CombatMove = {
  name: 'rising',
  strike: RISE_STRIKE,
  duration: 0.96,
  chain: [0.54, 1.1],
  cancelAt: 0.58,
  recovery: RELEASE,
  keys: keys(rising, {
    'R.heel': [[0.3, 0], [0.38, 8], [0.56, 6], [0.72, 0]],
    advance: [[0.12, 0], [0.22, 0.25], [RISE_STRIKE, 1.1], [0.6, 1.3]],
  }),
  steps: [
    { side: 'R', t0: 0.03, t1: 0.13, to: [-1.15, 0.1], yaw: -16, lift: 0.08 },
    { side: 'L', t0: 0.22, t1: 0.3, to: [1.05, 2.0], yaw: 8, lift: 0.1 },
    { side: 'R', t0: 0.62, t1: 0.76, to: [-0.98, 0.95], yaw: -6, lift: 0.08 },
  ],
  cues: [
    { t: 0.01, cue: 'weapon-in', value: 0.12 },
    { t: 0.06, cue: 'eyes', value: 0.6 },
    { t: 0.13, cue: 'stomp.R', value: 0.6 },
    { t: 0.24, cue: 'arc', value: 1.4 },
    { t: 0.26, cue: 'scoop', value: 1.3 },
    { t: 0.3, cue: 'stomp.L', value: 1 },
    { t: RISE_STRIKE, cue: 'updraft', value: 1.2 },
    { t: RISE_STRIKE, cue: 'stop', value: 0.08 },
    { t: RISE_STRIKE, cue: 'kick', value: 0.45 },
    { t: RISE_STRIKE + 0.01, cue: 'punch', value: 7 },
    { t: RISE_STRIKE + 0.01, cue: 'shake', value: 0.3 },
    { t: 0.42, cue: 'arc', value: 0 },
    { t: 0.64, cue: 'eyes', value: 0 },
  ],
}

/** The finisher's times: crouch, take-off, the turn through the air, the blow, the landing (s). */
export const CYCLONE = { takeoff: 0.2, spin: [0.23, 0.55] as const, strike: 0.39, land: 0.7 } as const
/** How high the feet leave the sand at the top and how far it travels (m): about six g, the blow's own gravity. */
const LEAP = { air: 1.9, advance: 5.6 }

/**
 * 4. The cyclone: a backhand whip carried by a full turn, toward the
 * cutlass's own side. Out of the rising cut the body drops into a deep
 * crouch wound hard to the right, the sword arm brought across the front to
 * the right, the blade cocked, the free arm swung back. It springs forward
 * and up and turns one full circle to the left (anticlockwise seen from
 * above, the blade's side opening the room to swing): the hips fire first,
 * the chest unwinds after them, and the arm comes last and fastest, lashing
 * out from across the body to full stretch on the left at the blow and on
 * round behind in the follow-through, the free arm pulled in tight to spin
 * faster. The blade goes round half a turn more than the body. It comes
 * down hard on both feet, the arm dropping with the body into the landing's
 * crouch, the elbow down, and stands into the guard.
 */
function cyclone(): CombatMove {
  const { takeoff, spin, strike, land } = CYCLONE
  // wound right, the arm across the front well clear of the car's nose, the blade cocked straight up
  const COILED: Frame = { turn: -48, hips: -18, drop: 1.0, pitch: 22, bend: 8, nod: -12, head: 0.5, hold: { at: [0.0, 2.2, 1.05], point: [-0.05, 0.12, 0.99] }, free: [130, -30, 0.85, 20, 1] }
  const line = new Timeline()
    .key(0.07, { turn: -20, hips: -8, drop: 0.5, pitch: 10, bend: 3, hold: { at: [0.9, 2.3, 1.5], point: [-0.05, 0.4, 0.92] }, free: [80, -24, 0.82, 22, 1] })
    .key(0.16, { ...COILED, drop: 0.94 })
    .key(takeoff - 0.01, COILED)
    // the whip: the body's turn carries the chest round ahead of the arm, the arm lashing out from across the body to full stretch on the left, then on round behind
    .cut(takeoff - 0.01, spin[1] + 0.02, [
      COILED,
      { turn: -20, hips: 4, drop: 0.3, pitch: 10, bend: 4, nod: -6, head: 0.5, hold: { at: [0.7, 2.6, 1.45], point: [-0.05, 0.62, 0.78] }, free: [60, -10, 0.7, 24, 1] },
      { turn: 16, hips: 14, drop: 0.08, pitch: 4, bend: 0, nod: -4, head: 0.4, hold: { at: reachOut(16, 4, 74, 2, 2.15), point: [0.35, 0.92, 0.12] }, free: [20, -30, 0.62, 28, 1] },
      { turn: 34, hips: 16, drop: 0.12, pitch: 4, bend: -2, nod: -4, head: 0.4, hold: { at: reachOut(34, 4, 128, 6, 2.05), point: [0.85, 0.2, 0.05] }, free: [10, -34, 0.6, 28, 1] },
      { turn: 26, hips: 12, drop: 0.22, pitch: 8, bend: 2, nod: -2, head: 0.5, hold: { at: reachOut(26, 8, 140, 22, 1.8), point: [0.95, -0.25, -0.1] }, free: [40, -24, 0.7, 24, 1] },
    ], { lead: 0.3, lag: 0.12 })
    // reaching for the sand, then down hard into the landing's crouch, the arm coming down with the body
    .cut(land - 0.06, land + 0.1, [
      { turn: 18, hips: 8, drop: 0.26, pitch: 8, bend: 2, hold: { at: reachOut(18, 8, 120, 30, 1.7), point: [0.95, 0.1, -0.2] }, free: [50, -20, 0.75, 24, 1] },
      { turn: 2, hips: 2, drop: 0.98, pitch: 22, bend: 8, nod: 10, hold: { at: [1.75, 1.3, 0.45], point: [-0.35, 0.85, -0.4] }, free: [60, -30, 0.84, 20, 1] },
    ], { ease: smoothEase, lead: 0.2, lag: 0.15 })
    .key(land + 0.24, { turn: -6, hips: -2, drop: 0.72, pitch: 14, bend: 5, nod: 4, hold: { at: [1.5, 1.35, 0.3], point: [-0.35, 0.85, -0.4] }, free: [40, -22, 0.8, 22, 0.8] })
    .key(land + 0.42, { turn: -10, hips: -4, drop: 0.36, pitch: 6, bend: 2, nod: 0, hold: { at: [1.4, 1.1, 0.2], point: [-0.35, 0.85, -0.4] }, free: [20, -16, 0.75, 24, 0.6] })
    .key(1.34, SIDE)
  const k = keys(line, {
    // one full turn to the left, anticlockwise seen from above, fastest through the blow
    turn: [[spin[0], 0], [spin[0] + 0.05, 42], [strike, 190], [spin[1] - 0.05, 325], [spin[1], 360]],
    // the flight's constant speed over the sand: thrown, not slid
    advance: [[0.12, 0], [takeoff, 0.15], [land, LEAP.advance], [land + 0.1, LEAP.advance + 0.18]],
    air: flight(takeoff, land, LEAP.air),
    'R.free': [[takeoff - 0.01, 0], [takeoff + 0.04, 1], [land - 0.02, 1], [land + 0.05, 0]],
    'L.free': [[takeoff - 0.01, 0], [takeoff + 0.04, 1], [land - 0.02, 1], [land + 0.05, 0]],
    // pushed off, the trailing leg stretched back; tucked through the turn; reaching down a frame before the sand
    'R.lx': [[takeoff + 0.04, -0.2], [(takeoff + land) / 2, -0.3], [land - 0.03, -0.05]],
    'R.ly': [[takeoff + 0.04, -0.75], [(takeoff + land) / 2, 0.15], [land - 0.03, -0.1]],
    'R.lz': [[takeoff + 0.04, 0.35], [(takeoff + land) / 2, 0.75], [land - 0.1, 0.3], [land - 0.02, 0]],
    'R.lp': [[takeoff + 0.04, 40], [(takeoff + land) / 2, 22], [land - 0.03, 4]],
    'L.lx': [[takeoff + 0.04, -0.2], [(takeoff + land) / 2, -0.3], [land - 0.03, -0.05]],
    'L.ly': [[takeoff + 0.04, 0.45], [(takeoff + land) / 2, -0.1], [land - 0.03, 0.25]],
    'L.lz': [[takeoff + 0.04, 0.55], [(takeoff + land) / 2, 0.6], [land - 0.1, 0.25], [land - 0.02, 0]],
    'L.lp': [[takeoff + 0.04, 18], [(takeoff + land) / 2, 28], [land - 0.03, 6]],
  })
  const cues: MoveCue[] = [
    { t: 0.01, cue: 'weapon-in', value: 0.12 },
    { t: 0.04, cue: 'eyes', value: 1 },
    { t: takeoff, cue: 'leap', value: 1.3 },
    { t: takeoff, cue: 'punch', value: 8 },
    { t: takeoff, cue: 'pull', value: 2.6 },
    { t: spin[0], cue: 'arc', value: 1.5 },
    { t: spin[0] + 0.02, cue: 'whirl', value: 1.3 },
    { t: strike, cue: 'stop', value: 0.09 },
    { t: strike, cue: 'kick', value: 0.5 },
    { t: strike, cue: 'shake', value: 0.32 },
    { t: spin[1], cue: 'arc', value: 0 },
    { t: land, cue: 'touchdown', value: 1.4 },
    { t: land, cue: 'stop', value: 0.06 },
    { t: land + 0.3, cue: 'pull', value: 0 },
    { t: land + 0.34, cue: 'eyes', value: 0 },
  ]
  return {
    name: 'cyclone',
    strike,
    duration: 1.38,
    chain: [1.08, 1.5],
    cancelAt: 1.08,
    recovery: RELEASE,
    keys: k,
    steps: [
      { side: 'R', t0: 0.02, t1: 0.12, to: [-1.15, -0.35], yaw: -12, lift: 0.08 },
      // gathered under the body after the landing, before the hand-back
      { side: 'R', t0: land + 0.42, t1: land + 0.58, to: [-0.94, LEAP.advance + 0.22], yaw: 0, lift: 0.1 },
      { side: 'L', t0: land + 0.52, t1: land + 0.64, to: [0.94, LEAP.advance + 0.27], yaw: 0, lift: 0.1 },
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
const guard = new Timeline().key(0.16, {
  turn: -8, drop: 0.32, pitch: 6, bend: 8, nod: 6, head: 0.6,
  hold: { at: [0.95, 1.4, 1.6], point: [-0.62, 0.38, -0.68], out: 0.4 }, free: [-26, 20, 0.5, 40, 1],
})
export const IMPALA_GUARD: CombatMove = {
  name: 'guard',
  duration: 1e6,
  chain: [1e6, 1e6],
  keys: guard.keys({ 'w.wield': [[0.1, 1]], 'w.two': [[0.04, 0]], 'L.grip': [[0.06, 1]] }, REST),
  cues: [{ t: 0.0, cue: 'weapon-in', value: 0.16 }],
}

/** The rest's weapon angles, for the special's unwinding. */
export const IMPALA_REST: Pose = REST
