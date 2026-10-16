import type { CombatMove, MoveCue, Moveset } from '../../transformer/combat/moves'
import type { Key } from '../../transformer/combat/curves'

/**
 * The Roadster's combo: no weapon, its cannons are built into its hands
 * (combat.md). Swift and snapping: each blow lands within a quarter second
 * of the click and the body is ready again as the blast clears. Distances in
 * metres (the hips stand 3.62 m up, the arms are 1.96 m long, the stance's
 * feet 0.85 m out), angles in degrees (pose.ts).
 *
 * A palm faces its blast: the forearm turns the knuckles level (`wz` -90),
 * then the wrist bends back (`wy` -80), fingers up, the palm square ahead of
 * the arm (measured with tools/palm-probe.mjs). The cannon fires along the
 * palm's normal (fx/palm-blast.ts).
 */

/** A palm opened square ahead of its forearm, and its hand turned back to rest. */
const PALM = { wz: -90, wy: -80 }

/** 1. Right palm cannon: the left foot steps in, hips and chest drive the right palm straight out, and it fires. */
const PALM_R: CombatMove = {
  name: 'palm-right',
  strike: 0.24,
  duration: 0.68,
  chain: [0.32, 0.95],
  cancelAt: 0.34,
  keys: {
    hipDrop: [[0.1, 0.22], [0.24, 0.32], [0.52, 0.2]],
    hipX: [[0.1, -0.08], [0.24, 0.1], [0.55, 0.04]],
    hipYaw: [[0.1, -12], [0.22, 12], [0.55, 5]],
    hipPitch: [[0.1, -2], [0.24, 7], [0.6, 3]],
    spineZ: [[0.1, -6], [0.22, 7], [0.6, 3]],
    chestZ: [[0.12, -16], [0.24, 18], [0.45, 10], [0.65, 6]],
    chestX: [[0.12, 2], [0.24, 7], [0.6, 4]],
    headZ: [[0.12, 12], [0.24, -14], [0.6, -6]],
    headX: [[0.24, -4], [0.6, -2]],
    // drawn back to the ribs, then driven out level at the shoulder; the blast kicks it back a little
    'R.az': [[0.12, 25], [0.23, -2], [0.32, 0], [0.6, 8]],
    'R.el': [[0.12, -25], [0.23, 4], [0.3, 10], [0.6, -20]],
    'R.reach': [[0.12, 0.42], [0.23, 0.97], [0.3, 0.86], [0.6, 0.5]],
    'R.elbow': [[0.12, 35], [0.23, 6], [0.6, 25]],
    'R.wz': [[0.14, -70], [0.22, PALM.wz], [0.45, PALM.wz], [0.66, -20]],
    'R.wy': [[0.14, -40], [0.22, PALM.wy], [0.4, -75], [0.66, -10]],
    'R.grip': [[0.08, 0.3], [0.2, 0], [0.5, 0], [0.66, 0.5]],
    // the free arm guards the chest and pulls back against the push
    'L.az': [[0.12, -8], [0.24, -20], [0.6, -8]],
    'L.el': [[0.12, -10], [0.24, -25], [0.6, -15]],
    'L.reach': [[0.12, 0.55], [0.6, 0.5]],
    'L.elbow': [[0.2, 18]],
    'L.grip': [[0.1, 0.8]],
    'R.heel': [[0.18, 0], [0.26, 22], [0.55, 10]],
    advance: [[0.08, 0.06], [0.26, 0.7], [0.55, 0.85]],
  },
  steps: [{ side: 'L', t0: 0.05, t1: 0.2, to: [0.85, 1.0], yaw: 8, lift: 0.3 }],
  cues: [
    { t: 0.03, cue: 'servo', value: 0.35 },
    { t: 0.08, cue: 'charge.R', value: 0.16 },
    { t: 0.08, cue: 'shock', value: 0.16 },
    { t: 0.24, cue: 'palm.R', value: 1 },
    { t: 0.24, cue: 'kick', value: 0.25 },
  ],
}

/** 2. Left palm cannon: the hips pivot back the other way on a step through, the left palm fires, a little harder. */
const PALM_L: CombatMove = {
  name: 'palm-left',
  strike: 0.27,
  duration: 0.74,
  chain: [0.36, 1.0],
  cancelAt: 0.38,
  keys: {
    hipDrop: [[0.12, 0.26], [0.27, 0.36], [0.56, 0.22]],
    hipX: [[0.12, 0.08], [0.27, -0.1], [0.6, -0.04]],
    hipYaw: [[0.12, 12], [0.25, -14], [0.6, -5]],
    hipPitch: [[0.12, -2], [0.27, 8], [0.62, 3]],
    spineZ: [[0.12, 6], [0.25, -8], [0.62, -3]],
    chestZ: [[0.14, 16], [0.27, -20], [0.48, -10], [0.68, -6]],
    chestX: [[0.14, 2], [0.27, 8], [0.62, 4]],
    headZ: [[0.14, -12], [0.27, 14], [0.62, 6]],
    headX: [[0.27, -4], [0.62, -2]],
    'L.az': [[0.12, 25], [0.26, -2], [0.34, 0], [0.64, 8]],
    'L.el': [[0.12, -22], [0.26, 2], [0.33, 8], [0.64, -20]],
    'L.reach': [[0.12, 0.42], [0.26, 0.97], [0.33, 0.86], [0.64, 0.5]],
    'L.elbow': [[0.12, 35], [0.26, 6], [0.64, 25]],
    'L.wz': [[0.15, -70], [0.25, PALM.wz], [0.48, PALM.wz], [0.7, -20]],
    'L.wy': [[0.15, -40], [0.25, PALM.wy], [0.43, -75], [0.7, -10]],
    'L.grip': [[0.1, 0.3], [0.22, 0], [0.52, 0], [0.7, 0.5]],
    // the right hand, opened by the first blast, closes into a guard
    'R.az': [[0.14, -6], [0.27, -20], [0.62, -8]],
    'R.el': [[0.14, -12], [0.27, -25], [0.62, -15]],
    'R.reach': [[0.14, 0.55], [0.62, 0.5]],
    'R.elbow': [[0.2, 18]],
    'R.wz': [[0.2, 0]],
    'R.wy': [[0.2, 0]],
    'R.grip': [[0.14, 0.8]],
    'L.heel': [[0.2, 0], [0.29, 22], [0.58, 10]],
    advance: [[0.08, 0.06], [0.28, 0.75], [0.6, 0.9]],
  },
  steps: [{ side: 'R', t0: 0.05, t1: 0.22, to: [-0.85, 1.1], yaw: -8, lift: 0.3 }],
  cues: [
    { t: 0.03, cue: 'servo', value: 0.4 },
    { t: 0.09, cue: 'charge.L', value: 0.18 },
    { t: 0.09, cue: 'shock', value: 0.18 },
    { t: 0.27, cue: 'palm.L', value: 1.15 },
    { t: 0.27, cue: 'kick', value: 0.3 },
  ],
}

/**
 * 3. Arc storm: a wide braced step in and both palms up, then the energy
 * shocks: six pulses in under a second, the palms firing in turn while the
 * hips carry the aim from the left of the front round to the right, every
 * pulse throwing arcs out over the whole front half circle; the last, both
 * palms together, the heaviest.
 */
const PULSES = [0.3, 0.44, 0.58, 0.72, 0.86, 1.0] as const
const STORM_FINAL = 1.16
/** The pulses' sides, the firing palm thrust out as the other draws back. */
const PULSE_SIDE = ['R', 'L', 'R', 'L', 'R', 'L'] as const

function pulseKeys(side: 'R' | 'L'): { reach: Key[]; wz: Key[]; wy: Key[] } {
  const reach: Key[] = [[0.22, 0.86]]
  for (let k = 0; k < PULSES.length; k++) {
    const t = PULSES[k]
    const firing = PULSE_SIDE[k] === side
    reach.push([t, firing ? 0.97 : 0.82], [t + 0.07, firing ? 0.9 : 0.86])
  }
  reach.push([STORM_FINAL - 0.06, 0.8], [STORM_FINAL, 0.98], [STORM_FINAL + 0.12, 0.88], [1.5, 0.5])
  return { reach, wz: [[0.18, PALM.wz], [1.32, PALM.wz], [1.55, -10]], wy: [[0.2, PALM.wy], [1.3, -70], [1.55, -8]] }
}
const STORM_R = pulseKeys('R')
const STORM_L = pulseKeys('L')

const ARC_STORM: CombatMove = {
  name: 'arc-storm',
  strike: STORM_FINAL,
  duration: 1.62,
  chain: [1.3, 1.8],
  cancelAt: 1.32,
  keys: {
    hipDrop: [[0.2, 0.46], [1.0, 0.46], [STORM_FINAL - 0.05, 0.4], [STORM_FINAL + 0.05, 0.52], [1.5, 0.24]],
    hipX: [[0.2, 0.12], [1.2, 0.08], [1.5, 0.03]],
    hipPitch: [[0.2, 6], [1.0, 6], [STORM_FINAL, 10], [1.5, 3]],
    // the aim carried across the front: from the left round to the right, then square for the last
    hipYaw: [[0.22, 10], [1.0, -10], [STORM_FINAL, 0], [1.5, 0]],
    spineZ: [[0.22, 6], [1.0, -6], [STORM_FINAL, 0]],
    chestZ: [[0.22, 12], [1.0, -12], [STORM_FINAL, 0]],
    chestX: [[0.2, 4], [STORM_FINAL - 0.05, 2], [STORM_FINAL, 8], [1.5, 3]],
    headX: [[0.2, -3], [1.5, -1]],
    'R.az': [[0.2, -6], [1.32, -8], [1.5, 8]],
    'R.el': [[0.2, 2], [STORM_FINAL, 4], [1.32, 6], [1.55, -20]],
    'R.reach': STORM_R.reach,
    'R.elbow': [[0.2, 10], [1.32, 10], [1.55, 25]],
    'R.wz': STORM_R.wz,
    'R.wy': STORM_R.wy,
    'R.grip': [[0.14, 0], [1.34, 0], [1.55, 0.5]],
    'L.az': [[0.2, -6], [1.32, -8], [1.5, 8]],
    'L.el': [[0.2, 2], [STORM_FINAL, 4], [1.32, 6], [1.55, -20]],
    'L.reach': STORM_L.reach,
    'L.elbow': [[0.2, 10], [1.32, 10], [1.55, 25]],
    'L.wz': STORM_L.wz,
    'L.wy': STORM_L.wy,
    'L.grip': [[0.14, 0], [1.34, 0], [1.55, 0.5]],
    'R.heel': [[0.2, 0], [STORM_FINAL, 0], [STORM_FINAL + 0.08, 14], [1.45, 4]],
    advance: [[0.06, 0.05], [0.22, 0.55], [1.0, 0.6], [STORM_FINAL, 0.75], [1.4, 0.95]],
  },
  steps: [
    { side: 'L', t0: 0.04, t1: 0.2, to: [1.12, 1.2], yaw: 10, lift: 0.3 },
    { side: 'R', t0: 0.1, t1: 0.24, to: [-1.0, 0.1], yaw: -10, lift: 0.18 },
  ],
  cues: [
    { t: 0.03, cue: 'servo', value: 0.45 },
    { t: 0.12, cue: 'charge.R', value: 0.18 },
    { t: 0.14, cue: 'charge.L', value: 0.3 },
    ...PULSES.map((t, k): MoveCue => ({ t, cue: `arc.${PULSE_SIDE[k]}`, value: 0.7 })),
    ...PULSES.map((t): MoveCue => ({ t, cue: 'shake', value: 0.1 })),
    { t: STORM_FINAL, cue: 'arcs', value: 1 },
    { t: STORM_FINAL, cue: 'kick', value: 0.4 },
    { t: STORM_FINAL, cue: 'punch', value: 5 },
  ].sort((a, b) => a.t - b.t),
}

/**
 * 4. Singularity: the right arm comes up before the body, the fist clenches
 * and the air round it warps into a field that drags everything in toward
 * it, the bodies taking blow after blow as they are crushed together; then
 * the arm is swung out to the right side in one fast stroke and the field
 * bursts outward, throwing everything round the robot off in every
 * direction. Both feet are planted wide; the left hand braces the right
 * forearm while the field holds.
 */
const FIELD = { on: 0.3, off: 1.56 } as const
const RELEASE = 1.64
/** The field's centre: in front of the raised fist, on the ground (m ahead of the standing point). */
export const FIELD_AHEAD = 3.4
/** While the field holds, the fist strains: a small tremor through the arm and chest. */
const TREMOR: Key[] = []
const TREMOR_CHEST: Key[] = []
for (let t = 0.42, k = 0; t < 1.42; t += 0.1, k++) {
  TREMOR.push([t, 38 + (k % 2 ? 2.4 : -2.4)])
  TREMOR_CHEST.push([t, k % 2 ? 1.2 : -1.2])
}

const SINGULARITY: CombatMove = {
  name: 'singularity',
  strike: RELEASE,
  duration: 2.6,
  chain: [1.95, 2.6],
  cancelAt: 1.98,
  keys: {
    hipDrop: [[0.24, 0.38], [1.45, 0.42], [1.56, 0.36], [RELEASE, 0.5], [1.95, 0.46], [2.5, 0.18]],
    hipPitch: [[0.24, -4], [1.45, -5], [RELEASE, 6], [1.95, 4], [2.5, 1]],
    hipYaw: [[0.24, 4], [1.45, 6], [1.56, 10], [RELEASE, -22], [1.95, -20], [2.5, -4]],
    spineZ: [[0.24, 3], [1.56, 6], [RELEASE, -12], [1.95, -10], [2.5, -2]],
    chestZ: [[0.24, 6], [1.45, 8], [1.56, 14], [RELEASE, -38], [1.72, -40], [1.95, -32], [2.55, -6]],
    chestX: [[0.24, -4], ...TREMOR_CHEST, [1.45, -4], [RELEASE, 6], [2.5, 2]],
    headX: [[0.24, -6], [1.45, -6], [RELEASE, 2], [2.5, 0]],
    headZ: [[0.24, 4], [RELEASE, -18], [1.95, -14], [2.5, -2]],
    // raised before the body, the fist above the brow and out ahead; swung out flat to the right side as
    // the torso turns 70 degrees after it (the arm's own 20 degrees outward put it square to the right),
    // held, then brought back round in front over half a second (lowered at once, the wrist and shoulder whipped)
    'R.out': [[0.1, 0], [0.24, 0.6], [1.5, 0.6], [RELEASE, 0], [2.5, 0]],
    'R.az': [[0.24, -12], [1.45, -12], [1.56, -22], [RELEASE, 20], [1.8, 26], [1.95, 22], [2.25, 16], [2.55, 10]],
    'R.el': [[0.24, 38], ...TREMOR, [1.45, 38], [1.56, 34], [RELEASE, 4], [1.95, 2], [2.55, -22]],
    'R.reach': [[0.24, 0.74], [1.45, 0.74], [1.56, 0.7], [RELEASE, 0.97], [1.95, 0.95], [2.55, 0.5]],
    'R.elbow': [[0.24, 50], [1.45, 50], [RELEASE, 10], [1.95, 10], [2.55, 25]],
    'R.wz': [[0.24, -20], [1.45, -20], [RELEASE, -60], [1.95, -55], [2.55, 0]],
    'R.wy': [[0.3, 0]],
    'R.grip': [[0.12, 0.6], [0.3, 1], [1.95, 1], [2.55, 0.4]],
    // the left fist chambered at the hip while the field holds (the deep chest leaves no room to brace across it),
    // then flung back against the swing
    'L.az': [[0.24, 12], [1.45, 12], [RELEASE, 20], [1.95, 25], [2.5, 6]],
    'L.el': [[0.24, -42], [1.45, -42], [RELEASE, -30], [1.95, -32], [2.5, -18]],
    'L.reach': [[0.24, 0.46], [1.45, 0.46], [RELEASE, 0.7], [1.95, 0.68], [2.5, 0.5]],
    'L.elbow': [[0.24, 30], [RELEASE, 15], [2.5, 18]],
    'L.grip': [[0.2, 1], [1.95, 1], [2.5, 0.6]],
    advance: [[0.06, 0.04], [0.26, 0.45], [1.5, 0.5], [RELEASE, 0.75], [2.0, 0.85]],
  },
  steps: [
    { side: 'R', t0: 0.04, t1: 0.18, to: [-1.12, 0.25], yaw: -14, lift: 0.22 },
    { side: 'L', t0: 0.12, t1: 0.26, to: [1.15, 0.65], yaw: 12, lift: 0.22 },
    // the swing drives the weight onto the right foot; the left skids round after it
    { side: 'L', t0: RELEASE, t1: RELEASE + 0.18, to: [1.0, 0.95], yaw: -12, lift: 0 },
    // the stance gathered again as it settles
    { side: 'R', t0: 2.1, t1: 2.28, to: [-0.85, 0.85], yaw: 0, lift: 0.16 },
    { side: 'L', t0: 2.26, t1: 2.44, to: [0.85, 0.85], yaw: 0, lift: 0.14 },
  ],
  cues: [
    { t: 0.03, cue: 'servo', value: 0.5 },
    { t: 0.16, cue: 'servo', value: 0.35 },
    { t: FIELD.on, cue: 'field', value: 1 },
    { t: FIELD.on, cue: 'shake', value: 0.15 },
    { t: 0.9, cue: 'shake', value: 0.12 },
    { t: 1.4, cue: 'shake', value: 0.18 },
    { t: FIELD.off, cue: 'field', value: 0 },
    { t: RELEASE, cue: 'release', value: 1 },
    { t: RELEASE, cue: 'kick', value: 0.6 },
    { t: RELEASE, cue: 'punch', value: 9 },
    { t: RELEASE, cue: 'stop', value: 0.07 },
    { t: RELEASE + 0.02, cue: 'shake', value: 0.5 },
  ],
}

/** Where and when the combo's blows land (hits.ts). */
export const ROADSTER_TIMES = {
  pulses: PULSES,
  stormFinal: STORM_FINAL,
  field: FIELD,
  release: RELEASE,
} as const

export const ROADSTER_MOVES: Moveset = {
  moves: [PALM_R, PALM_L, ARC_STORM, SINGULARITY],
  recover: 1.0,
}

/**
 * The guard (held with the right mouse button): both forearms raised before
 * the face, fists closed, the gullwing doors they carry turned out as the
 * shields they are, elbows in over the ribs, knees bent and the weight low.
 * The energy shield forms round it (fighter.ts); the pose holds for as long
 * as the guard does.
 */
export const ROADSTER_GUARD: CombatMove = {
  name: 'guard',
  duration: 1e6,
  chain: [1e6, 1e6],
  keys: {
    hipDrop: [[0.18, 0.34]],
    hipPitch: [[0.18, 7]],
    spineX: [[0.2, 4]],
    chestX: [[0.2, 6]],
    headX: [[0.22, 8]],
    'R.az': [[0.16, -16]],
    'R.el': [[0.16, 30]],
    'R.reach': [[0.16, 0.42]],
    'R.elbow': [[0.16, 22]],
    'R.grip': [[0.1, 1]],
    'L.az': [[0.18, -16]],
    'L.el': [[0.18, 34]],
    'L.reach': [[0.18, 0.44]],
    'L.elbow': [[0.18, 22]],
    'L.grip': [[0.1, 1]],
  },
  cues: [{ t: 0.02, cue: 'servo', value: 0.3 }],
}

