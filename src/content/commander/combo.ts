import type { Key } from '../transformer/combat/curves'
import { SOLDIER_CHANNELS, pose, type SoldierChannel } from '../soldier/poses'
import { POKE_PEAK, SLASH_PEAK } from '../bat/combat/audio/spear-models'
import { COMMANDER_POSES } from './poses'
import type { CommanderChannel, CommanderMove } from './moves'

/**
 * The commander's four-move combo: a heavy lancer on wheels, its lance's red
 * energy flaring through every blow. Moves 1 and 2 are its everyday pair; 3
 * and 4 follow only when it commits to the whole combo (the roll is the
 * post's, commander-post.ts), and 4 knocks the robot back.
 *
 *   1. the joust: sunk back with the lance couched, it dashes two metres on
 *      its wheels (dust thrown up behind them) and drives the point home at
 *      the end of the run, then brakes hard, skidding, the point riding up
 *   2. the pivot sweep: wound right on its wheels, the lance out past the
 *      right shoulder, it pivots round on them (dust from the turning wheels)
 *      and carries the lance flat across the whole front as it rolls in, the free arm thrown
 *      open, then loops the point up and back to the guard
 *   3. the sky splitter: reared up on its wheels, the lance raised over the
 *      head and blazing, it hangs a beat and brings it down with the whole
 *      body from a lunge into the sand in front: the ground bursts, chunks
 *      fly and a surge rolls out
 *   4. the whirlwind: coiled hard on its wheels, the lance drawn back and
 *      burning, it rolls in spinning a full turn and more with the lance held out level,
 *      leaving a ring of red light; it comes round through the robot,
 *      knocking it back, a surge of sand rolling out round it, and holds the
 *      finish a beat before it comes back to the guard
 *
 * Every move: an anticipation (it sinks and coils), a tightening beat, the
 * blow snapped through in a tenth of a second, follow-through past it and a
 * loop back to the guard, never a straight line back. The root turn is the
 * hips and leads; the chest's twist follows and overshoots. Each key pose is
 * whole (every body channel), so the monotone curves pass through them
 * without overshoot. The arm channels were fitted with
 * `node tools/commander-probe.mjs solve`, which keeps the 7 m lance and the
 * forearm off the body (poses.ts has the grip's geometry); `move <n>` and
 * `combo <pose>` check every frame between them, as tests/commander.test.ts
 * does.
 */

/** Keys for every body channel through `frames` (time, whole pose), plus the extra channels given (root, lance, a wheel's lift). */
function keyed(frames: ReadonlyArray<readonly [number, Float32Array]>, extra: Partial<Record<CommanderChannel, readonly Key[]>>): CommanderMove['keys'] {
  const keys: Partial<Record<CommanderChannel, readonly Key[]>> = {}
  SOLDIER_CHANNELS.forEach((name: SoldierChannel, i) => {
    keys[name] = frames.map(([t, p]) => [t, p[i]] as const)
  })
  return { ...keys, ...extra }
}

/** `base` with some body channels changed (a coil tightened, a stance sunk); the arm keeps its fitted angles. */
function tweak(base: Float32Array, changes: Partial<Record<SoldierChannel, number>>): Float32Array {
  const p = base.slice()
  for (const [name, value] of Object.entries(changes)) p[SOLDIER_CHANNELS.indexOf(name as SoldierChannel)] = value
  return p
}

const READY = COMMANDER_POSES.ready

/** 1. Sunk back on the rear wheel, the lance couched at the hip, the free hand out at the enemy. */
const COUCH = pose({
  crouch: 0.5, lean: -2, side: -3, twist: -14, headPitch: 6, headYaw: 16,
  'R.pitch': -26, 'R.out': 28, 'R.twist': -19, 'R.elbow': 63, 'R.wrist': -36, 'R.wristYaw': -12, 'R.wristRoll': -5,
  'L.pitch': 60, 'L.out': 12, 'L.elbow': 40, 'L.wrist': 10,
  'R.fwd': -0.75, 'R.lat': 0.12, 'R.yaw': -16, 'L.fwd': 0.7, 'L.lat': 0.1, 'L.yaw': 8,
})
/** 1. Leaning into the dash, the lance level and low. */
const CHARGE = pose({
  crouch: 0.56, lean: 26, bend: 8, twist: -4, headPitch: -12, headYaw: 4,
  'R.pitch': 16, 'R.out': 37, 'R.twist': 1, 'R.elbow': 63, 'R.wrist': -51, 'R.wristYaw': -3, 'R.wristRoll': 19,
  'L.pitch': -10, 'L.out': 30, 'L.elbow': 50,
  'R.fwd': -0.45, 'R.lat': 0.08, 'L.fwd': 0.55, 'L.lat': 0.08,
})
/** 1. Driven home: the chest whips through, the arm straight behind the point, the free arm flung back. */
const HOME = pose({
  crouch: 0.5, lean: 24, bend: 10, side: 2, twist: 16, headPitch: -6, headYaw: -8,
  'R.pitch': 72, 'R.out': 0, 'R.twist': 37, 'R.elbow': 0, 'R.wrist': -51, 'R.wristYaw': -36, 'R.wristRoll': 8,
  'L.pitch': -20, 'L.out': 40, 'L.elbow': 40,
  'R.fwd': -0.5, 'R.lat': 0.1, 'L.fwd': 0.8, 'L.lat': 0.1,
})
/** 1. Braking: leant back against the skid, the point riding up. */
const BRAKE = pose({
  crouch: 0.52, lean: -8, bend: -4, side: -3, twist: 8, headPitch: 4,
  'R.pitch': 19, 'R.out': 29, 'R.twist': -1, 'R.elbow': 28, 'R.wrist': -42, 'R.wristYaw': -5, 'R.wristRoll': 1,
  'L.pitch': 50, 'L.out': 30, 'L.elbow': 50, 'L.wrist': 8,
  'R.fwd': -0.35, 'R.lat': 0.14, 'R.yaw': -24, 'L.fwd': 0.95, 'L.lat': 0.14, 'L.yaw': 14,
})

const JOUST: CommanderMove = {
  name: 'joust',
  duration: 1.0,
  strike: 0.42,
  chain: 0.66,
  keys: keyed([[0.16, COUCH], [0.24, tweak(COUCH, { crouch: 0.55, side: -4 })], [0.36, CHARGE], [0.42, HOME], [0.5, tweak(HOME, { crouch: 0.55, lean: 27 })], [0.64, BRAKE], [0.98, READY]], {
    advance: [[0.16, -0.25], [0.24, -0.3], [0.36, 1.05], [0.42, 1.5], [0.52, 1.72], [0.72, 1.78]],
    turn: [[0.16, -10], [0.24, -12], [0.36, -2], [0.42, 4], [0.6, 8], [0.92, 0]],
    glow: [[0.16, 1.6], [0.24, 2.0], [0.36, 2.4], [0.42, 3.0], [0.56, 1.8], [0.82, 1.1]],
  }),
  blow: { arc: 40, strength: 0.65 },
  cues: [
    { t: 0.02, cue: 'servo', value: 0.5 },
    { t: 0.24, cue: 'skid', value: 1 },
    { t: 0.42 - POKE_PEAK, cue: 'poke', value: 1 },
    { t: 0.42, cue: 'flash', value: 1 },
    { t: 0.5, cue: 'skid', value: 0.8 },
  ],
}

/** 2. Wound right on the wheels, the lance out past the right shoulder, the free arm across the chest. */
const WOUND = pose({
  crouch: 0.36, lean: 6, roll: 3, side: -8, twist: -32, headPitch: 4, headYaw: 26,
  'R.pitch': 68, 'R.out': 31, 'R.twist': 1, 'R.elbow': 0, 'R.wrist': -57, 'R.wristYaw': -6, 'R.wristRoll': 30,
  'L.pitch': 50, 'L.out': -10, 'L.elbow': 90, 'L.wrist': 10,
  'R.fwd': -0.55, 'R.lat': 0.14, 'R.yaw': -14, 'L.fwd': 0.6, 'L.lat': 0.1, 'L.yaw': 8,
})
/** 2. The coil tightened. */
const WOUND_TIGHT = pose({
  crouch: 0.38, lean: 6, roll: 4, side: -10, twist: -36, headPitch: 4, headYaw: 30,
  'R.pitch': 68, 'R.out': 35, 'R.twist': 1, 'R.elbow': 0, 'R.wrist': -57, 'R.wristYaw': -6, 'R.wristRoll': 39,
  'L.pitch': 52, 'L.out': -12, 'L.elbow': 94, 'L.wrist': 10,
  'R.fwd': -0.58, 'R.lat': 0.14, 'R.yaw': -14, 'L.fwd': 0.6, 'L.lat': 0.1, 'L.yaw': 8,
})
/** 2. Through the front: square on, the lance flat at the enemy. */
const ACROSS = pose({
  crouch: 0.42, lean: 10,
  'R.pitch': 69, 'R.out': 37, 'R.twist': 5, 'R.elbow': 0, 'R.wrist': -52, 'R.wristYaw': -9, 'R.wristRoll': 2,
  'L.pitch': 30, 'L.out': 40, 'L.elbow': 50, 'L.wrist': 5,
  'R.fwd': -0.5, 'R.lat': 0.1, 'R.yaw': -18, 'L.fwd': 0.85, 'L.lat': 0.25,
})
/** 2. Swept on to the left, the chest whipped past the hips, the free arm thrown open. */
const SWEPT = pose({
  crouch: 0.42, lean: 12, roll: -4, side: 8, twist: 34, headPitch: 2, headYaw: -18,
  'R.pitch': 11, 'R.out': 50, 'R.twist': 4, 'R.elbow': 66, 'R.wrist': -51, 'R.wristYaw': -13, 'R.wristRoll': 1,
  'L.pitch': 15, 'L.out': 75, 'L.elbow': 20,
  'R.fwd': -0.5, 'R.lat': 0.1, 'R.yaw': -20, 'L.fwd': 0.9, 'L.lat': 0.3, 'L.yaw': 4,
})
/** 2. Follow-through: the point rising as the swing spends itself. */
const OPEN = pose({
  crouch: 0.4, lean: 8, roll: -3, side: 6, twist: 38, headYaw: -20,
  'R.pitch': 1, 'R.out': 50, 'R.twist': 14, 'R.elbow': 91, 'R.wrist': -48, 'R.wristYaw': -1, 'R.wristRoll': 0,
  'L.pitch': 10, 'L.out': 70, 'L.elbow': 24,
  'R.fwd': -0.5, 'R.lat': 0.1, 'R.yaw': -20, 'L.fwd': 0.9, 'L.lat': 0.3, 'L.yaw': 4,
})
/** 2 and 3. Looping back: the point up and round to the right, toward the guard. */
const LOOP = pose({
  crouch: 0.34, lean: 8, side: 2, twist: 12, headPitch: 4, headYaw: -4,
  'R.pitch': 0, 'R.out': 38, 'R.twist': 15, 'R.elbow': 84, 'R.wrist': -50, 'R.wristYaw': 4, 'R.wristRoll': 6,
  'L.pitch': 40, 'L.out': 30, 'L.elbow': 60, 'L.wrist': 8,
  'R.fwd': -0.5, 'R.lat': 0.1, 'R.yaw': -16, 'L.fwd': 0.7, 'L.lat': 0.15, 'L.yaw': 8,
})

const PIVOT: CommanderMove = {
  name: 'pivot sweep',
  duration: 1.0,
  strike: 0.33,
  chain: 0.66,
  keys: keyed([[0.16, WOUND], [0.24, WOUND_TIGHT], [0.33, ACROSS], [0.4, SWEPT], [0.52, OPEN], [0.72, LOOP], [0.98, READY]], {
    turn: [[0.16, -28], [0.24, -34], [0.33, 0], [0.4, 22], [0.52, 30], [0.75, 10], [0.98, 0]],
    advance: [[0.16, 0.1], [0.24, 0.1], [0.33, 1.35], [0.45, 1.75], [0.7, 1.8]],
    'L.lift': [[0.24, 0], [0.29, 0.25], [0.34, 0]],
    glow: [[0.16, 1.5], [0.24, 2.0], [0.33, 3.0], [0.48, 1.9], [0.75, 1.1]],
  }),
  blow: { arc: 150, strength: 0.75 },
  cues: [
    { t: 0.02, cue: 'servo', value: 0.55 },
    { t: 0.25, cue: 'skid', value: 0.9 },
    { t: 0.33 - SLASH_PEAK, cue: 'slash', value: 1.1 },
    { t: 0.33, cue: 'flash', value: 0.8 },
  ],
}

/** 3. Reared up on the wheels, the lance raised over the head, the free hand pointing it at the enemy. */
const REARED = pose({
  crouch: 0.18, lean: -10, bend: -8, twist: -12, headPitch: -12, headYaw: 10,
  'R.pitch': 100, 'R.out': 24, 'R.twist': 45, 'R.elbow': 0, 'R.wrist': -54, 'R.wristYaw': -37, 'R.wristRoll': 39,
  'L.pitch': 85, 'L.out': 15, 'L.elbow': 20, 'L.wrist': 10,
  'R.fwd': -0.6, 'R.lat': 0.1, 'R.yaw': -16, 'L.fwd': 0.55, 'L.lat': 0.1, 'L.yaw': 8,
})
/** 3. The hang at the top: leant back, the lance near upright and blazing. */
const HUNG = pose({
  crouch: 0.12, lean: -14, bend: -10, twist: -16, headPitch: -14, headYaw: 12,
  'R.pitch': 102, 'R.out': 3, 'R.twist': 33, 'R.elbow': 0, 'R.wrist': -53, 'R.wristYaw': -30, 'R.wristRoll': 6,
  'L.pitch': 90, 'L.out': 15, 'L.elbow': 16, 'L.wrist': 10,
  'R.fwd': -0.62, 'R.lat': 0.1, 'R.yaw': -16, 'L.fwd': 0.55, 'L.lat': 0.1, 'L.yaw': 8,
})
/** 3. Coming over: the body pitching into the lunge, the lance falling forward. */
const OVER = pose({
  crouch: 0.45, lean: 14, bend: 4,
  'R.pitch': 77, 'R.out': 48, 'R.twist': 66, 'R.elbow': 53, 'R.wrist': -60, 'R.wristYaw': -12, 'R.wristRoll': 45,
  'L.pitch': 50, 'L.out': 24, 'L.elbow': 50, 'L.wrist': 8,
  'R.fwd': -0.55, 'R.lat': 0.1, 'R.yaw': -16, 'L.fwd': 0.9, 'L.lat': 0.12, 'L.yaw': 8,
})
/** 3. Split: down from a deep lunge, the whole body hinged over the lead wheel, the point at the sand. */
const SPLIT = pose({
  crouch: 0.85, lean: 32, bend: 20, side: 2, twist: 8, headPitch: 14,
  'R.pitch': 87, 'R.out': 31, 'R.twist': 39, 'R.elbow': 0, 'R.wrist': -57, 'R.wristYaw': -28, 'R.wristRoll': -45,
  'L.pitch': 15, 'L.out': 45, 'L.elbow': 30,
  'R.fwd': -0.75, 'R.lat': 0.1, 'R.yaw': -16, 'L.fwd': 1.2, 'L.lat': 0.14, 'L.yaw': 10,
})

const SPLITTER: CommanderMove = {
  name: 'sky splitter',
  duration: 1.3,
  strike: 0.58,
  chain: 0.98,
  keys: keyed([[0.32, REARED], [0.44, HUNG], [0.52, OVER], [0.58, SPLIT], [0.76, tweak(SPLIT, { crouch: 0.8, lean: 30, bend: 18 })], [0.98, LOOP], [1.28, READY]], {
    advance: [[0.32, -0.3], [0.44, -0.35], [0.58, 1.5], [0.76, 1.6], [1.05, 1.65]],
    turn: [[0.32, -10], [0.44, -14], [0.58, 4], [0.8, 4], [1.2, 0]],
    'L.lift': [[0.44, 0], [0.51, 0.32], [0.58, 0]],
    glow: [[0.32, 2.2], [0.44, 2.8], [0.58, 3.6], [0.8, 2.0], [1.15, 1.1]],
  }),
  blow: { arc: 50, strength: 0.9 },
  cues: [
    { t: 0.04, cue: 'servo', value: 0.7 },
    { t: 0.3, cue: 'charge', value: 1 },
    { t: 0.44, cue: 'servo', value: 0.9 },
    { t: 0.58 - SLASH_PEAK, cue: 'slash', value: 1.2 },
    { t: 0.58, cue: 'slam', value: 1 },
  ],
}

/** 4. Coiled hard right on the wheels, the lance drawn back and burning, the eyes on the enemy over the shoulder. */
const COILED = pose({
  crouch: 0.6, lean: 10, side: -6, twist: -42, headPitch: 4, headYaw: 42,
  'R.pitch': -19, 'R.out': 48, 'R.twist': -31, 'R.elbow': 59, 'R.wrist': -2, 'R.wristYaw': -10, 'R.wristRoll': -16,
  'L.pitch': 64, 'L.out': 30, 'L.elbow': 64, 'L.wrist': 10,
  'R.fwd': -0.65, 'R.lat': 0.16, 'R.yaw': -20, 'L.fwd': 0.75, 'L.lat': 0.18, 'L.yaw': 10,
})
/** 4. The whirl: the lance held out level at arm's length, the point leading, the free arm out wide against the spin. */
const WHIRL = pose({
  crouch: 0.44, lean: 12, side: 5, twist: 12, headPitch: 2, headYaw: -8,
  'R.pitch': -6, 'R.out': 49, 'R.twist': -4, 'R.elbow': 63, 'R.wrist': -43, 'R.wristYaw': -6, 'R.wristRoll': 0,
  'L.pitch': 20, 'L.out': 75, 'L.elbow': 18,
  'R.fwd': -0.4, 'R.lat': 0.22, 'L.fwd': 0.4, 'L.lat': 0.22,
})
/** 4. The finish: the lance swept on low across the front, held a beat. */
const SPENT = pose({
  crouch: 0.52, lean: 14, side: 4, twist: 22, headPitch: 4, headYaw: -10,
  'R.pitch': -3, 'R.out': 45, 'R.twist': -13, 'R.elbow': 52, 'R.wrist': -44, 'R.wristYaw': -12, 'R.wristRoll': -3,
  'L.pitch': 20, 'L.out': 65, 'L.elbow': 20,
  'R.fwd': -0.45, 'R.lat': 0.2, 'R.yaw': -10, 'L.fwd': 0.55, 'L.lat': 0.2, 'L.yaw': 6,
})

const WHIRLWIND: CommanderMove = {
  name: 'whirlwind',
  duration: 1.85,
  strike: 1.0,
  chain: 1.85,
  keys: keyed([[0.45, COILED], [0.62, tweak(COILED, { crouch: 0.64, side: -8 })], [0.74, WHIRL], [1.12, WHIRL], [1.3, SPENT], [1.5, SPENT], [1.82, READY]], {
    turn: [[0.45, -70], [0.62, -78], [0.74, 10], [1.0, 330], [1.14, 388], [1.32, 370], [1.55, 360]],
    advance: [[0.45, -0.25], [0.74, 0.3], [1.0, 2.2], [1.3, 2.5]],
    glow: [[0.3, 2.6], [0.62, 3.4], [1.0, 3.8], [1.35, 1.9], [1.75, 1.1]],
  }),
  blow: { arc: 360, strength: 1, knockback: true },
  cues: [
    { t: 0.05, cue: 'servo', value: 0.8 },
    { t: 0.3, cue: 'charge', value: 0.8 },
    { t: 0.52, cue: 'charge', value: 1.2 },
    { t: 0.62, cue: 'servo', value: 1 },
    { t: 0.72, cue: 'skid', value: 1.2 },
    { t: 1.0 - SLASH_PEAK, cue: 'slash', value: 1.4 },
    { t: 1.0, cue: 'whirl', value: 1 },
  ],
}

export const COMMANDER_MOVES: readonly CommanderMove[] = [JOUST, PIVOT, SPLITTER, WHIRLWIND]
