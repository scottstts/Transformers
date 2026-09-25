import type { CombatMove, Moveset } from '../../transformer/combat/moves'

/**
 * The racer's combo: quick hands, a kick, then the sword and a burst of
 * speed. A snap jab, a pivoting roundhouse, a draw-cut (the sword forms out
 * of the hand as it is drawn from the left hip, straight into a horizontal
 * slash) and an ERS dash: the power unit screams, the robot bursts forward
 * across the sand cutting as it passes, skids to a stop and flicks the blade.
 * Distances in metres (hips 2.1 m up, arms 1.4 m long), angles in degrees.
 *
 * The stance: left foot [0.36, -0.06], right [-0.36, -0.06] (the feet plant
 * just behind the hips).
 */

/** 1. Snap jab: the lead hand fires straight out and back over a short step. */
const JAB: CombatMove = {
  name: 'jab',
  strike: 0.2,
  duration: 0.55,
  chain: [0.32, 0.75],
  keys: {
    hipDrop: [[0.1, 0.08], [0.2, 0.11], [0.5, 0.08]],
    hipYaw: [[0.08, 6], [0.17, -9], [0.38, -5], [0.5, -4]],
    spineZ: [[0.1, 3], [0.19, -5], [0.42, -2]],
    chestZ: [[0.11, 8], [0.23, -14], [0.4, -8], [0.54, -6]],
    chestX: [[0.2, 5], [0.5, 3]],
    headZ: [[0.1, -8], [0.2, 14], [0.5, 7]],
    'L.az': [[0.1, 12], [0.2, 2], [0.3, 2], [0.5, 4]],
    'L.el': [[0.1, -28], [0.2, 10], [0.3, 7], [0.5, -24]],
    'L.reach': [[0.1, 0.44], [0.2, 0.94], [0.27, 0.86], [0.42, 0.48], [0.55, 0.52]],
    'L.elbow': [[0.1, 30], [0.2, 6], [0.5, 24]],
    'L.grip': [[0.08, 1]],
    'R.az': [[0.1, -8]],
    'R.el': [[0.1, -12]],
    'R.reach': [[0.1, 0.48]],
    'R.elbow': [[0.1, 18]],
    'R.grip': [[0.08, 1]],
    'R.heel': [[0.12, 0], [0.22, 12], [0.5, 6]],
    advance: [[0.1, 0.04], [0.22, 0.5], [0.5, 0.6]],
  },
  steps: [{ side: 'L', t0: 0.03, t1: 0.17, to: [0.4, 0.68], yaw: 6, lift: 0.16 }],
  cues: [{ t: 0.02, cue: 'servo', value: 0.25 }, { t: 0.2, cue: 'kick', value: 0.12 }],
}

/** 2. Roundhouse: pivot on the lead foot, the right leg whips round at chest height. */
const ROUNDHOUSE: CombatMove = {
  name: 'roundhouse',
  strike: 0.4,
  duration: 0.95,
  chain: [0.66, 1.1],
  keys: {
    hipDrop: [[0.12, 0.12], [0.34, 0.02], [0.6, 0.02], [0.8, 0.1]],
    hipYaw: [[0.12, -10], [0.34, 62], [0.46, 70], [0.7, 18], [0.9, 4]],
    hipRoll: [[0.12, 0], [0.34, 14], [0.5, 16], [0.75, 2]],
    hipPitch: [[0.12, 2], [0.36, -10], [0.6, -6], [0.8, 2]],
    spineY: [[0.34, 6], [0.6, 6], [0.8, 0]],
    spineZ: [[0.37, -18], [0.53, -20], [0.84, -4]],
    chestZ: [[0.14, 6], [0.39, -24], [0.55, -26], [0.88, -6]],
    chestY: [[0.34, -8], [0.6, -8], [0.8, 0]],
    headZ: [[0.12, -4], [0.34, -24], [0.5, -26], [0.8, -6]],
    'L.az': [[0.2, -10], [0.4, 6], [0.8, -4]],
    'L.el': [[0.2, -8], [0.4, 0], [0.8, -14]],
    'L.reach': [[0.2, 0.5], [0.4, 0.56], [0.8, 0.5]],
    'L.elbow': [[0.2, 20]],
    'L.grip': [[0.08, 1]],
    'R.az': [[0.2, 10], [0.4, 46], [0.7, 12], [0.9, -6]],
    'R.el': [[0.2, -30], [0.4, -54], [0.7, -30], [0.9, -14]],
    'R.reach': [[0.2, 0.6], [0.4, 0.8], [0.8, 0.5]],
    'R.elbow': [[0.3, 10]],
    'R.grip': [[0.08, 1]],
    'L.heel': [[0.16, 22], [0.6, 24], [0.76, 0]],
    advance: [[0.2, 0.16], [0.5, 0.5], [0.65, 0.68], [0.9, 0.75]],
  },
  steps: [
    // the support foot pivots on its ball as the hips come round
    { side: 'L', t0: 0.04, t1: 0.18, to: [0.38, 0.38], yaw: -70, lift: 0.1 },
    { side: 'R', t0: 0.18, t1: 0.64, to: [-0.34, 0.9], yaw: -10, via: [0.05, 1.45, 1.75], viaYaw: -80, point: 40 },
    { side: 'L', t0: 0.66, t1: 0.82, to: [0.38, 0.55], yaw: 0, lift: 0.1 },
  ],
  cues: [{ t: 0.05, cue: 'servo', value: 0.45 }, { t: 0.4, cue: 'kick', value: 0.28 }, { t: 0.41, cue: 'shake', value: 0.1 }],
}

/**
 * 3. Draw-cut: the right hand crosses to the left hip; the sword forms out of it
 * as it is drawn and the draw becomes a horizontal slash across to the right.
 */
const DRAW_CUT: CombatMove = {
  name: 'draw-cut',
  strike: 0.42,
  duration: 1.05,
  chain: [0.74, 1.3],
  keys: {
    hipDrop: [[0.14, 0.18], [0.3, 0.2], [0.46, 0.3], [0.9, 0.16]],
    hipYaw: [[0.14, 14], [0.3, 6], [0.46, -16], [0.62, -22], [1.0, -6]],
    hipPitch: [[0.14, 6], [0.46, 10], [1.0, 4]],
    spineZ: [[0.14, 10], [0.46, -10], [0.62, -14], [1.0, -4]],
    chestZ: [[0.14, 24], [0.3, 10], [0.46, -26], [0.62, -34], [1.0, -10]],
    chestX: [[0.14, 10], [0.46, 8], [1.0, 4]],
    headZ: [[0.14, -20], [0.46, 18], [0.62, 24], [1.0, 8]],
    // the right hand crosses to the left hip for the hilt
    'R.az': [[0.14, -58]],
    'R.el': [[0.14, -52]],
    'R.reach': [[0.14, 0.6]],
    'R.elbow': [[0.14, 30], [0.46, 20], [1.0, 20]],
    'R.grip': [[0.12, 0.7], [0.2, 1]],
    'L.az': [[0.14, 10], [0.46, 36], [0.7, 30], [1.0, -6]],
    'L.el': [[0.14, -20], [0.46, -42], [1.0, -16]],
    'L.reach': [[0.14, 0.55], [0.46, 0.8], [1.0, 0.5]],
    'L.elbow': [[0.3, 12]],
    'L.grip': [[0.08, 1]],
    // the sword: drawn from the left hip tip-back, swept across at chest height, into the guard
    'w.x': [[0.16, -0.85], [0.3, -0.4], [0.4, 0.15], [0.5, 0.5], [0.62, 0.62], [1.0, -0.1]],
    'w.y': [[0.16, 0.3], [0.3, 0.6], [0.4, 0.68], [0.5, 0.5], [0.62, 0.25], [1.0, 0.45]],
    'w.z': [[0.16, -0.5], [0.3, -0.2], [0.4, -0.05], [0.5, 0.0], [0.62, -0.1], [1.0, -0.2]],
    'w.yaw': [[0.16, -150], [0.3, -65], [0.4, 20], [0.5, 90], [0.62, 118], [1.0, -4]],
    'w.pitch': [[0.16, 100], [0.3, 92], [0.4, 90], [0.5, 90], [0.62, 96], [1.0, 60]],
    'w.roll': [[0.16, 90], [0.3, 90], [0.62, 90], [1.0, 0]],
    'w.wield': [[0.12, 0], [0.2, 1]],
    'R.heel': [[0.3, 0]],
    'L.heel': [[0.3, 0], [0.5, 16], [0.9, 6]],
    advance: [[0.2, 0.08], [0.46, 0.9], [0.72, 1.05]],
  },
  steps: [
    { side: 'R', t0: 0.2, t1: 0.42, to: [-0.4, 1.1], yaw: -12, lift: 0.18 },
    { side: 'L', t0: 0.54, t1: 0.72, to: [0.38, 0.65], yaw: 6, lift: 0.12 },
  ],
  cues: [
    { t: 0.03, cue: 'servo', value: 0.3 },
    { t: 0.2, cue: 'weapon-in', value: 0.18 },
    { t: 0.42, cue: 'kick', value: 0.22 },
  ],
}

/**
 * 4. ERS dash: crouched with the sword held back, the power unit screams and
 * the robot bursts nine metres forward, cutting across as it passes, skids to
 * a stop in the sand and flicks the blade down to its side.
 */
const DASH: CombatMove = {
  name: 'dash',
  strike: 0.58,
  duration: 1.95,
  chain: [1.95, 1.95],
  keys: {
    hipDrop: [[0.3, 0.38], [0.55, 0.3], [0.7, 0.42], [1.0, 0.36], [1.5, 0.14], [1.9, 0.08]],
    hipPitch: [[0.3, 14], [0.48, 20], [0.62, 14], [0.9, 8], [1.5, 4]],
    hipYaw: [[0.27, 20], [0.47, 10], [0.6, -12], [0.92, -10], [1.46, 6], [1.9, 2]],
    spineX: [[0.32, 4], [0.52, 6], [0.94, 3]],
    spineZ: [[0.3, 10], [0.5, 6], [0.64, -8], [0.98, -10], [1.5, 4]],
    chestZ: [[0.33, 22], [0.52, 16], [0.68, -18], [1.04, -14], [1.54, 8], [1.9, 2]],
    chestX: [[0.34, 4], [0.55, 6], [0.98, 3]],
    headX: [[0.3, -14], [0.5, -20], [0.9, -8], [1.5, 0]],
    headZ: [[0.3, -18], [0.62, 20], [1.0, 26], [1.5, -8]],
    'L.az': [[0.3, -14], [0.55, -10], [0.62, 30], [1.0, 40], [1.5, 6]],
    'L.el': [[0.3, -12], [0.55, -24], [0.62, -40], [1.0, -44], [1.5, -18]],
    'L.reach': [[0.3, 0.7], [0.62, 0.8], [1.5, 0.5]],
    'L.elbow': [[0.3, 20]],
    'L.grip': [[0.08, 1]],
    'R.elbow': [[0.3, 30], [0.62, 10], [1.4, 20], [1.9, 20]],
    'R.grip': [[0.08, 1]],
    // held back low for the draw, swept across in the pass, flicked down to the right
    'w.x': [[0.3, 0.4], [0.5, 0.42], [0.56, 0.05], [0.62, -0.55], [1.0, -0.62], [1.3, 0.1], [1.45, 0.42], [1.9, 0.38]],
    'w.y': [[0.3, -0.18], [0.5, 0.05], [0.56, 0.86], [0.62, 0.86], [1.0, 0.8], [1.3, 0.66], [1.45, 0.36], [1.9, 0.28]],
    'w.z': [[0.3, -0.5], [0.5, -0.45], [0.56, -0.28], [0.62, -0.24], [1.0, -0.24], [1.3, -0.05], [1.45, -0.55], [1.9, -0.6]],
    'w.yaw': [[0.3, 150], [0.5, 115], [0.56, 30], [0.62, -70], [1.0, -85], [1.3, 0], [1.45, 40], [1.9, 36]],
    'w.pitch': [[0.3, 105], [0.5, 94], [0.62, 90], [1.0, 88], [1.3, 60], [1.45, 150], [1.9, 145]],
    'w.roll': [[0.3, 90], [0.62, 90], [1.3, 60], [1.45, 0]],
    'w.wield': [[0.1, 1]],
    'R.heel': [[0.3, 28], [0.5, 30], [0.62, 0]],
    'L.heel': [[0.3, 10], [0.5, 20], [0.62, 0]],
    advance: [[0.3, 0.06], [0.36, 0.24], [0.6, 8.6], [0.75, 9.9], [1.0, 10.3]],
  },
  steps: [
    { side: 'R', t0: 0.04, t1: 0.24, to: [-0.46, -0.5], yaw: -14, lift: 0.14 },
    // the burst: two long skimming strides, then both feet plough to a stop
    { side: 'R', t0: 0.36, t1: 0.47, to: [-0.4, 4.4], yaw: 0, lift: 0.16 },
    { side: 'L', t0: 0.44, t1: 0.57, to: [0.42, 8.1], yaw: 10, lift: 0.14 },
    { side: 'R', t0: 0.52, t1: 0.66, to: [-0.46, 8.6], yaw: -20, lift: 0.1 },
    { side: 'L', t0: 0.58, t1: 0.95, to: [0.5, 10.5], yaw: 25, lift: 0 },
    { side: 'R', t0: 0.66, t1: 0.98, to: [-0.5, 9.7], yaw: -25, lift: 0 },
    { side: 'L', t0: 1.3, t1: 1.52, to: [0.38, 10.2], yaw: 0, lift: 0.08 },
  ],
  cues: [
    { t: 0.04, cue: 'servo', value: 0.4 },
    { t: 0.26, cue: 'ers', value: 1 },
    { t: 0.34, cue: 'punch', value: 11 },
    { t: 0.34, cue: 'pull', value: 3.5 },
    { t: 0.36, cue: 'shake', value: 0.25 },
    { t: 0.58, cue: 'stop', value: 0.07 },
    { t: 0.58, cue: 'kick', value: 0.4 },
    { t: 0.66, cue: 'ers', value: 0 },
    { t: 1.1, cue: 'pull', value: 0 },
    { t: 1.36, cue: 'servo', value: 0.3 },
  ],
}

export const F1_MOVES: Moveset = {
  moves: [JAB, ROUNDHOUSE, DRAW_CUT, DASH],
  recover: 0.85,
  recoverCues: [{ t: 0.0, cue: 'weapon-out', value: 0.4 }],
}

/**
 * The guard (held with the right mouse button): the racer crosses its
 * forearms in an X in front of its visor, sinks onto bent knees and leans
 * into it, a light fighter covering up. The shield forms round it
 * (fighter.ts); the pose holds for as long as the guard does.
 */
export const F1_GUARD: CombatMove = {
  name: 'guard',
  duration: 1e6,
  chain: [1e6, 1e6],
  keys: {
    hipDrop: [[0.14, 0.2]],
    hipPitch: [[0.14, 10]],
    spineX: [[0.16, 5]],
    chestX: [[0.16, 6]],
    headX: [[0.18, 6]],
    'R.az': [[0.13, -30]],
    'R.el': [[0.13, 16]],
    'R.reach': [[0.13, 0.52]],
    'R.elbow': [[0.13, 55]],
    'R.grip': [[0.08, 1]],
    'L.az': [[0.15, -30]],
    'L.el': [[0.15, 26]],
    'L.reach': [[0.15, 0.5]],
    'L.elbow': [[0.15, 55]],
    'L.grip': [[0.08, 1]],
  },
  cues: [{ t: 0.02, cue: 'servo', value: 0.2 }],
}
