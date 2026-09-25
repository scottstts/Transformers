import type { CombatMove, Moveset } from '../../transformer/combat/moves'

/**
 * The truck robot's combo: a brawler's hands, then the axe, then the jets.
 * Intensity climbs: a stepping cross, a pivoting hook, the axe drawn over the
 * shoulder (it forms in the hand) and a diagonal cleave, and a
 * thruster charge that skids the robot across the sand into a leaping overhead
 * slam. Distances in metres (the robot's hips are 3.1 m up, its arms 2.1 m
 * long), angles in degrees; see pose.ts for the channels.
 *
 * Feet start the combo in the stance: left [0.59, 0], right [-0.59, 0] in the
 * first move's ground frame; every move's frame starts where the body stands.
 */

/** 1. Stepping right cross: the lead foot steps in, hips and torso drive the fist through. */
const CROSS: CombatMove = {
  name: 'cross',
  strike: 0.33,
  duration: 0.8,
  chain: [0.5, 1.0],
  keys: {
    hipDrop: [[0.14, 0.16], [0.34, 0.2], [0.66, 0.14]],
    hipX: [[0.16, -0.08], [0.36, 0.1], [0.7, 0.05]],
    hipYaw: [[0.13, -10], [0.28, 10], [0.62, 5]],
    hipPitch: [[0.16, -2], [0.34, 6], [0.7, 3]],
    spineZ: [[0.15, -5], [0.31, 6], [0.66, 3]],
    chestZ: [[0.17, -12], [0.36, 16], [0.58, 9], [0.78, 6]],
    chestX: [[0.16, 3], [0.33, 6], [0.7, 4]],
    headZ: [[0.16, 14], [0.33, -16], [0.7, -8]],
    headX: [[0.33, -6], [0.7, -4]],
    'R.az': [[0.16, 22], [0.32, 8], [0.42, 9], [0.72, 8]],
    'R.el': [[0.16, -30], [0.32, 12], [0.42, 8], [0.72, -24]],
    'R.reach': [[0.16, 0.42], [0.32, 0.94], [0.42, 0.87], [0.64, 0.48], [0.8, 0.52]],
    'R.elbow': [[0.16, 34], [0.32, 8], [0.72, 26]],
    'R.grip': [[0.12, 1]],
    'L.az': [[0.16, -4], [0.33, -16], [0.72, -8]],
    'L.el': [[0.16, -14], [0.33, -22], [0.72, -16]],
    'L.reach': [[0.16, 0.5], [0.72, 0.52]],
    'L.elbow': [[0.2, 14]],
    'L.grip': [[0.12, 1]],
    'R.heel': [[0.2, 0], [0.36, 24], [0.7, 12]],
    advance: [[0.14, 0.08], [0.36, 0.7], [0.75, 0.85]],
  },
  steps: [{ side: 'L', t0: 0.08, t1: 0.3, to: [0.64, 1.0], yaw: 8, lift: 0.28 }],
  cues: [{ t: 0.04, cue: 'servo', value: 0.4 }, { t: 0.33, cue: 'kick', value: 0.22 }],
}

/** 2. Pivoting left hook: the rear foot comes through, the torso whips the bent arm across. */
const HOOK: CombatMove = {
  name: 'hook',
  strike: 0.41,
  duration: 0.9,
  chain: [0.6, 1.1],
  keys: {
    hipDrop: [[0.18, 0.22], [0.42, 0.3], [0.8, 0.18]],
    hipX: [[0.18, 0.1], [0.42, -0.08], [0.8, -0.02]],
    hipYaw: [[0.16, 12], [0.36, -20], [0.76, -8]],
    hipPitch: [[0.2, 4], [0.42, 8], [0.8, 4]],
    spineZ: [[0.18, 8], [0.39, -12], [0.8, -4]],
    chestZ: [[0.2, 10], [0.41, -28], [0.52, -30], [0.8, -12]],
    chestY: [[0.2, -4], [0.42, 6], [0.8, 2]],
    chestX: [[0.2, 6], [0.42, 10], [0.8, 6]],
    headZ: [[0.2, -10], [0.42, 26], [0.8, 12]],
    'L.az': [[0.2, 30], [0.33, 16], [0.42, -26], [0.52, -34], [0.8, -8]],
    'L.el': [[0.2, -18], [0.33, -4], [0.42, 0], [0.52, -4], [0.8, -18]],
    'L.reach': [[0.2, 0.6], [0.33, 0.74], [0.42, 0.72], [0.8, 0.52]],
    'L.elbow': [[0.2, 40], [0.33, 82], [0.45, 86], [0.8, 20]],
    'L.wz': [[0.33, 20], [0.8, 0]],
    'L.grip': [[0.1, 1]],
    'R.az': [[0.2, -2], [0.42, -14], [0.8, -8]],
    'R.el': [[0.2, -20], [0.42, -14], [0.8, -18]],
    'R.reach': [[0.2, 0.46], [0.8, 0.5]],
    'R.elbow': [[0.3, 18]],
    'R.grip': [[0.1, 1]],
    'L.heel': [[0.3, 0], [0.44, 18], [0.8, 6]],
    advance: [[0.14, 0.08], [0.44, 0.85], [0.8, 1.0]],
  },
  steps: [
    { side: 'R', t0: 0.06, t1: 0.32, to: [-0.52, 1.05], yaw: -6, lift: 0.3 },
    { side: 'L', t0: 0.4, t1: 0.56, to: [0.66, 0.65], yaw: -22, lift: 0.12 },
  ],
  cues: [{ t: 0.08, cue: 'servo', value: 0.45 }, { t: 0.41, cue: 'kick', value: 0.34 }, { t: 0.42, cue: 'shake', value: 0.14 }],
}

/**
 * 3. The axe forms over the right shoulder. A one-handed diagonal cleave
 * carries the robot into a long step; the left hand takes the haft in guard.
 */
const CLEAVE: CombatMove = {
  name: 'cleave',
  strike: 0.72,
  duration: 1.35,
  chain: [0.98, 1.6],
  keys: {
    hipDrop: [[0.3, 0.12], [0.52, 0.16], [0.74, 0.5], [1.1, 0.28]],
    hipX: [[0.3, -0.08], [0.52, -0.1], [0.74, 0.12], [1.1, 0.04]],
    hipYaw: [[0.28, -10], [0.48, -16], [0.67, 18], [1.06, 8]],
    hipPitch: [[0.3, -3], [0.52, -5], [0.74, 12], [1.1, 6]],
    spineX: [[0.3, -3], [0.52, -6], [0.74, 12], [1.1, 5]],
    spineZ: [[0.3, -6], [0.52, -12], [0.72, 12], [1.25, 4]],
    chestZ: [[0.3, -16], [0.52, -30], [0.7, 26], [0.8, 30], [1.25, 10]],
    chestX: [[0.32, -4], [0.55, -9], [0.79, 14], [1.27, 7]],
    headZ: [[0.3, 12], [0.52, 24], [0.72, -18], [1.25, -8]],
    headX: [[0.52, 8], [0.74, -12], [1.2, -4]],
    // the right hand reaches over the shoulder for the haft
    'R.az': [[0.16, 30], [0.3, 26]],
    'R.el': [[0.16, 30], [0.3, 64]],
    'R.reach': [[0.16, 0.6], [0.3, 0.55]],
    'R.elbow': [[0.16, 50], [0.3, 70], [0.6, 60], [0.74, 20], [1.2, 30]],
    'R.grip': [[0.3, 0.6], [0.4, 1]],
    'L.az': [[0.2, -8], [0.5, -14], [0.74, 4], [1.0, -10]],
    'L.el': [[0.2, -12], [0.5, -8], [0.74, -24], [1.0, -12]],
    'L.reach': [[0.2, 0.5], [0.74, 0.56], [1.0, 0.6]],
    'L.elbow': [[0.3, 24], [0.74, 12], [1.2, 20]],
    'L.grip': [[0.2, 1]],
    // the axe: over the right shoulder, head back; up and wound; the cleave; the guard
    'w.x': [[0.3, 0.05], [0.52, 0.1], [0.66, -0.28], [0.74, -0.45], [0.9, -0.55], [1.25, -0.2]],
    'w.y': [[0.3, -0.05], [0.52, 0.1], [0.66, 0.6], [0.74, 0.75], [0.9, 0.62], [1.25, 0.45]],
    'w.z': [[0.3, 0.3], [0.52, 0.45], [0.66, 0.1], [0.74, -0.35], [0.9, -0.55], [1.25, -0.15]],
    'w.yaw': [[0.3, 15], [0.52, 30], [0.66, -5], [0.74, -25], [0.9, -40], [1.25, -10]],
    'w.pitch': [[0.3, -60], [0.52, -35], [0.66, 60], [0.74, 120], [0.9, 150], [1.25, 50]],
    'w.roll': [[0.3, 0], [0.52, 0], [0.74, -10], [1.25, -20]],
    'w.wield': [[0.14, 0], [0.3, 1]],
    'w.two': [[1.08, 0], [1.25, 1]],
    'L.heel': [[0.5, 0]],
    'R.heel': [[0.6, 0], [0.76, 26], [1.0, 20], [1.25, 8]],
    advance: [[0.45, 0.12], [0.76, 1.2], [1.05, 1.4]],
  },
  steps: [
    { side: 'L', t0: 0.5, t1: 0.7, to: [0.62, 1.6], yaw: 14, lift: 0.32 },
    { side: 'R', t0: 0.82, t1: 0.97, to: [-0.55, 0.8], yaw: -4, lift: 0.18 },
  ],
  cues: [
    { t: 0.04, cue: 'servo', value: 0.5 },
    { t: 0.26, cue: 'weapon-in', value: 0.34 },
    { t: 0.5, cue: 'servo', value: 0.35 },
    { t: 0.72, cue: 'kick', value: 0.45 },
    { t: 0.74, cue: 'shake', value: 0.2 },
  ],
}

/**
 * 4. Thruster charge: the robot gathers low with the axe held back, the back
 * jets fire and it skids across the sand, leaps and brings the axe down
 * overhead into the ground in front of it. The off hand braces after impact
 * and releases while the axe dissolves low, before the empty hand recovers.
 * The axe is gone and the hand released within a second of the blow; from
 * then a click starts the next combo straight from this pose (its chain
 * window) while the off hand's wrist is still unwinding.
 */
const CHARGE: CombatMove = {
  name: 'charge',
  strike: 1.58,
  duration: 3.25,
  chain: [2.4, 3.25],
  keys: {
    // Land, absorb the blow through the knees, then stand up before lowering
    // the arm. The chest and head settle behind the pelvis rather than in unison.
    hipDrop: [[0.3, 0.55], [0.85, 0.5], [1.16, 0.3], [1.62, 0.78], [1.74, 0.7], [1.93, 0.5], [2.26, 0.18], [2.57, 0.04]],
    hipPitch: [[0.3, 16], [0.5, 26], [0.85, 24], [1.16, 4], [1.56, 8], [1.84, 6], [2.26, 4], [2.57, 0]],
    hipYaw: [[0.3, -8], [0.85, -4], [1.62, 2], [2.26, 4], [2.57, 0]],
    spineX: [[0.3, 6], [0.85, 10], [1.16, -6], [1.62, 4], [2.29, 2], [2.57, 0]],
    chestX: [[0.3, 4], [0.85, 8], [1.16, -12], [1.65, 6], [1.87, 4], [2.32, 3], [2.57, 0]],
    chestZ: [[0.3, -10], [0.85, -6], [1.62, 2], [2.29, 6], [2.57, 0]],
    headX: [[0.3, -12], [0.85, -18], [1.16, 0], [1.62, -14], [2.29, -6], [2.57, 0]],
    headZ: [[0.3, 8], [1.62, 0]],
    'R.elbow': [[0.3, 20], [1.02, 30], [1.22, 60], [1.62, 10], [2.29, 30]],
    'L.elbow': [[0.3, 24], [1.16, 30], [1.3, 60], [1.62, 10], [2.26, 20]],
    'R.grip': [[0.1, 1], [2.35, 1], [2.57, 0]],
    // Receive the empty hand in the same low guard as the last weapon pose.
    // Recovery then lowers the whole arm, instead of blending straight to hang.
    'R.az': [[0.3, -3]],
    'R.el': [[0.3, -22]],
    'R.reach': [[0.3, 0.5]],
    'R.wx': [[1.58, 0], [2.29, 172]],
    'R.wy': [[1.58, 0], [2.29, -63]],
    'R.wz': [[1.58, 0], [2.29, 27]],
    // Lift -> apex -> accelerating descent -> low follow-through -> carry.
    // Keep the weapon frame under control until the metal has dissolved.
    'w.x': [[0.3, 0.25], [0.85, 0.25], [1.02, -0.1], [1.22, -0.2], [1.4, -0.2], [1.58, -0.4], [2.1, -0.4], [2.29, -0.2]],
    'w.y': [[0.3, 0.25], [0.85, 0.3], [1.02, 0.42], [1.22, 0.6], [1.4, 0.9], [1.58, 0.75], [1.7, 1.0], [2.1, 0.95], [2.29, 0.7]],
    'w.z': [[0.3, -0.45], [0.85, -0.4], [1.02, 0.35], [1.22, 0.8], [1.4, 0.4], [1.58, -0.3], [2.1, -0.3], [2.29, -0.35]],
    'w.yaw': [[0.3, 15], [0.85, 15], [1.22, 0], [2.29, -10]],
    'w.pitch': [[0.3, 115], [0.85, 110], [1.02, 30], [1.22, -25], [1.4, 65], [1.58, 170], [1.7, 180], [2.1, 178], [2.29, 160]],
    'w.roll': [[0.3, 0], [1.58, 0], [2.29, -20]],
    'w.wield': [[0.1, 1], [2.35, 1], [2.57, 0]],
    'w.two': [[0.24, 0], [1.58, 0], [1.95, 1], [1.98, 1], [2.4, 0]],
    'L.az': [[0.3, -6], [0.85, -2], [1.9, 6], [3.15, 10]],
    'L.el': [[0.3, -8], [0.85, 0], [1.9, -20], [3.15, -60]],
    'L.reach': [[0.3, 0.55], [0.85, 0.6], [1.9, 0.55], [3.15, 0.8]],
    // Unwind the wrist after the supporting hand has left the haft, not
    // during the short grip release itself.
    'L.wx': [[1.5, 110], [1.82, 140], [2.4, 130], [2.9, 50], [3.25, 0]],
    'L.wy': [[1.5, -30], [1.82, -40], [2.4, -36], [2.9, -15], [3.25, 0]],
    'L.wz': [[1.5, 10], [1.82, 13], [2.4, 12], [3.25, 0]],
    'L.grip': [[0.1, 1], [2.4, 1], [3.15, 0]],
    'R.heel': [[0.3, 20], [0.85, 30], [1.16, 0], [1.62, 0]],
    'L.heel': [[0.3, 6], [0.85, 12], [1.16, 0]],
    advance: [[0.3, 0.08], [0.4, 0.3], [0.85, 6.6], [1.22, 8.0], [1.62, 8.6], [1.79, 8.7]],
    air: [[0.88, 0], [1.22, 0.85], [1.4, 0.7], [1.58, 0]],
  },
  steps: [
    { side: 'R', t0: 0.06, t1: 0.26, to: [-0.66, -0.35], yaw: -10, lift: 0.2 },
    // dragged by the jets: both feet plough through the sand
    { side: 'L', t0: 0.34, t1: 0.86, to: [0.62, 6.6], yaw: 6, lift: 0 },
    { side: 'R', t0: 0.36, t1: 0.86, to: [-0.66, 5.9], yaw: -8, lift: 0 },
    // the leap: both feet land around the blow
    { side: 'L', t0: 0.88, t1: 1.58, to: [0.66, 9.3], yaw: 10, lift: 0.5 },
    { side: 'R', t0: 0.94, t1: 1.62, to: [-0.66, 8.1], yaw: -10, lift: 0.4 },
    // Regather the stance with the weight on the other foot, before hand-back.
    { side: 'R', t0: 1.92, t1: 2.14, to: [-0.59, 8.7], yaw: 0, lift: 0.18 },
    { side: 'L', t0: 2.18, t1: 2.41, to: [0.59, 8.7], yaw: 0, lift: 0.14 },
  ],
  cues: [
    { t: 0.04, cue: 'servo', value: 0.5 },
    { t: 0.26, cue: 'boost', value: 1 },
    { t: 0.28, cue: 'punch', value: 9 },
    { t: 0.28, cue: 'pull', value: 3.2 },
    { t: 0.3, cue: 'shake', value: 0.35 },
    { t: 0.86, cue: 'boost', value: 0 },
    { t: 0.9, cue: 'servo', value: 0.35 },
    { t: 1.58, cue: 'slam', value: 1 },
    { t: 1.84, cue: 'servo', value: 0.55 },
    { t: 1.96, cue: 'pull', value: 0 },
    { t: 2.04, cue: 'weapon-out', value: 0.3 },
  ],
}

export const CYBERTRUCK_MOVES: Moveset = {
  moves: [CROSS, HOOK, CLEAVE, CHARGE],
  recover: 1.15,
  recoverCues: [{ t: 0.0, cue: 'weapon-out', value: 0.5 }],
}
