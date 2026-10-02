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
  strike: 0.16,
  duration: 0.44,
  chain: [0.22, 0.6],
  cancelAt: 0.24,
  keys: {
    hipDrop: [[0.08, 0.08], [0.16, 0.11], [0.4, 0.08]],
    hipYaw: [[0.06, 6], [0.14, -9], [0.3, -5], [0.4, -4]],
    spineZ: [[0.08, 3], [0.15, -5], [0.34, -2]],
    chestZ: [[0.09, 8], [0.18, -14], [0.32, -8], [0.43, -6]],
    chestX: [[0.16, 5], [0.4, 3]],
    headZ: [[0.08, -8], [0.16, 14], [0.4, 7]],
    'L.az': [[0.08, 12], [0.16, 2], [0.24, 2], [0.4, 4]],
    'L.el': [[0.08, -28], [0.16, 10], [0.24, 7], [0.4, -24]],
    'L.reach': [[0.08, 0.44], [0.16, 0.94], [0.22, 0.86], [0.34, 0.48], [0.44, 0.52]],
    'L.elbow': [[0.08, 30], [0.16, 6], [0.4, 24]],
    'L.grip': [[0.06, 1]],
    'R.az': [[0.08, -8]],
    'R.el': [[0.08, -12]],
    'R.reach': [[0.08, 0.48]],
    'R.elbow': [[0.08, 18]],
    'R.grip': [[0.06, 1]],
    'R.heel': [[0.1, 0], [0.18, 12], [0.4, 6]],
    advance: [[0.08, 0.04], [0.18, 0.5], [0.4, 0.6]],
  },
  steps: [{ side: 'L', t0: 0.02, t1: 0.14, to: [0.4, 0.68], yaw: 6, lift: 0.16 }],
  cues: [{ t: 0.02, cue: 'servo', value: 0.25 }, { t: 0.16, cue: 'kick', value: 0.12 }],
}

/** 2. Roundhouse: pivot on the lead foot, the right leg whips round at chest height. */
const ROUNDHOUSE: CombatMove = {
  name: 'roundhouse',
  strike: 0.32,
  duration: 0.76,
  chain: [0.53, 0.88],
  cancelAt: 0.53,
  keys: {
    hipDrop: [[0.1, 0.12], [0.27, 0.02], [0.48, 0.02], [0.64, 0.1]],
    hipYaw: [[0.1, -10], [0.27, 62], [0.37, 70], [0.56, 18], [0.72, 4]],
    hipRoll: [[0.1, 0], [0.27, 14], [0.4, 16], [0.6, 2]],
    hipPitch: [[0.1, 2], [0.29, -10], [0.48, -6], [0.64, 2]],
    spineY: [[0.27, 6], [0.48, 6], [0.64, 0]],
    spineZ: [[0.3, -18], [0.42, -20], [0.67, -4]],
    chestZ: [[0.11, 6], [0.31, -24], [0.44, -26], [0.7, -6]],
    chestY: [[0.27, -8], [0.48, -8], [0.64, 0]],
    headZ: [[0.1, -4], [0.27, -24], [0.4, -26], [0.64, -6]],
    'L.az': [[0.16, -10], [0.32, 6], [0.64, -4]],
    'L.el': [[0.16, -8], [0.32, 0], [0.64, -14]],
    'L.reach': [[0.16, 0.5], [0.32, 0.56], [0.64, 0.5]],
    'L.elbow': [[0.16, 20]],
    'L.grip': [[0.06, 1]],
    'R.az': [[0.16, 10], [0.32, 46], [0.56, 12], [0.72, -6]],
    'R.el': [[0.16, -30], [0.32, -54], [0.56, -30], [0.72, -14]],
    'R.reach': [[0.16, 0.6], [0.32, 0.8], [0.64, 0.5]],
    'R.elbow': [[0.24, 10]],
    'R.grip': [[0.06, 1]],
    'L.heel': [[0.13, 22], [0.48, 24], [0.61, 0]],
    advance: [[0.16, 0.16], [0.4, 0.5], [0.52, 0.68], [0.72, 0.75]],
  },
  steps: [
    // the support foot pivots on its ball as the hips come round
    { side: 'L', t0: 0.03, t1: 0.14, to: [0.38, 0.38], yaw: -70, lift: 0.1 },
    { side: 'R', t0: 0.14, t1: 0.51, to: [-0.34, 0.9], yaw: -10, via: [0.05, 1.45, 1.75], viaYaw: -80, point: 40 },
    { side: 'L', t0: 0.53, t1: 0.66, to: [0.38, 0.55], yaw: 0, lift: 0.1 },
  ],
  cues: [{ t: 0.04, cue: 'servo', value: 0.45 }, { t: 0.32, cue: 'stop', value: 0.04 }, { t: 0.32, cue: 'kick', value: 0.28 }, { t: 0.32, cue: 'punch', value: 4 }, { t: 0.33, cue: 'shake', value: 0.12 }],
}

/**
 * 3. Draw-cut, iaido: the right hand crosses to the hilt at the left hip and
 * the body coils over it, sinking; the coil tightens a beat while the sword
 * forms out of the hand, then hips, spine and chest unwind in turn and the
 * blade leaves the hip and crosses the whole front at chest height in a
 * tenth of a second, the right foot landing with it. It opens wide to the
 * right, held a moment, and settles into the guard.
 */
const DRAW_CUT: CombatMove = {
  name: 'draw-cut',
  strike: 0.26,
  duration: 0.72,
  chain: [0.42, 0.95],
  cancelAt: 0.46,
  keys: {
    hipDrop: [[0.1, 0.18], [0.19, 0.24], [0.26, 0.34], [0.36, 0.3], [0.65, 0.16]],
    hipX: [[0.1, 0.06], [0.19, 0.08], [0.27, -0.08], [0.4, -0.05], [0.7, 0]],
    // the hips lead the unwinding, the spine and chest follow through
    hipYaw: [[0.1, 14], [0.19, 18], [0.24, -10], [0.3, -22], [0.4, -24], [0.7, -6]],
    hipPitch: [[0.1, 6], [0.26, 10], [0.7, 4]],
    spineZ: [[0.12, 10], [0.19, 13], [0.23, 8], [0.28, -10], [0.34, -14], [0.7, -4]],
    chestZ: [[0.12, 24], [0.19, 30], [0.23, 20], [0.28, -16], [0.33, -32], [0.4, -36], [0.7, -10]],
    chestX: [[0.1, 10], [0.27, 8], [0.7, 4]],
    headZ: [[0.1, -20], [0.19, -24], [0.27, 18], [0.36, 24], [0.7, 8]],
    // the right hand crosses to the left hip for the hilt
    'R.az': [[0.1, -58]],
    'R.el': [[0.1, -52]],
    'R.reach': [[0.1, 0.6]],
    'R.elbow': [[0.1, 30], [0.26, 20], [0.7, 20]],
    'R.grip': [[0.08, 0.7], [0.14, 1]],
    // the free arm drawn back against the cut
    'L.az': [[0.1, 10], [0.19, 6], [0.27, 36], [0.4, 32], [0.7, -6]],
    'L.el': [[0.1, -20], [0.27, -42], [0.7, -16]],
    'L.reach': [[0.1, 0.55], [0.27, 0.82], [0.7, 0.5]],
    'L.elbow': [[0.2, 12]],
    'L.grip': [[0.08, 1]],
    // the sword: tip-back at the left hip, pressed back as the coil tightens, swept across at chest height, opened wide, into the guard
    'w.x': [[0.08, -0.85], [0.19, -0.86], [0.21, -0.62], [0.23, -0.2], [0.26, 0.3], [0.29, 0.55], [0.36, 0.64], [0.7, -0.1]],
    'w.y': [[0.08, 0.3], [0.19, 0.32], [0.21, 0.62], [0.23, 0.68], [0.26, 0.62], [0.29, 0.42], [0.36, 0.24], [0.7, 0.45]],
    'w.z': [[0.08, -0.5], [0.19, -0.5], [0.21, -0.32], [0.23, -0.12], [0.26, -0.02], [0.29, -0.02], [0.36, -0.1], [0.7, -0.2]],
    'w.yaw': [[0.08, -150], [0.19, -158], [0.23, -40], [0.26, 40], [0.29, 100], [0.36, 124], [0.7, -4]],
    'w.pitch': [[0.08, 100], [0.19, 102], [0.23, 91], [0.26, 90], [0.29, 90], [0.36, 96], [0.7, 60]],
    'w.roll': [[0.08, 90], [0.36, 90], [0.7, 0]],
    'w.wield': [[0.08, 0], [0.13, 1]],
    'R.heel': [[0.2, 0]],
    'L.heel': [[0.22, 0], [0.32, 16], [0.62, 6]],
    advance: [[0.14, 0.08], [0.28, 0.95], [0.5, 1.05]],
  },
  steps: [
    { side: 'R', t0: 0.13, t1: 0.27, to: [-0.4, 1.1], yaw: -12, lift: 0.18 },
    { side: 'L', t0: 0.33, t1: 0.46, to: [0.38, 0.65], yaw: 6, lift: 0.12 },
  ],
  cues: [
    { t: 0.02, cue: 'servo', value: 0.3 },
    { t: 0.12, cue: 'weapon-in', value: 0.13 },
    { t: 0.26, cue: 'stop', value: 0.05 },
    { t: 0.26, cue: 'kick', value: 0.3 },
    { t: 0.26, cue: 'punch', value: 5 },
    { t: 0.27, cue: 'shake', value: 0.16 },
  ],
}

/**
 * 4. ERS dash: crouched with the sword held back, the power unit screams and
 * the robot bursts nine metres forward, cutting across as it passes, skids to
 * a stop in the sand and flicks the blade down to its side.
 */
const DASH: CombatMove = {
  name: 'dash',
  strike: 0.38,
  duration: 1.3,
  chain: [1.08, 1.3],
  cancelAt: 1.02,
  keys: {
    hipDrop: [[0.18, 0.38], [0.36, 0.3], [0.47, 0.42], [0.66, 0.36], [0.94, 0.14], [1.25, 0.08]],
    hipPitch: [[0.18, 14], [0.31, 20], [0.41, 14], [0.6, 8], [0.94, 4]],
    hipYaw: [[0.16, 20], [0.31, 10], [0.4, -12], [0.61, -10], [0.91, 6], [1.25, 2]],
    spineX: [[0.19, 4], [0.34, 6], [0.62, 3]],
    spineZ: [[0.18, 10], [0.33, 6], [0.42, -8], [0.65, -10], [0.94, 4]],
    chestZ: [[0.2, 22], [0.34, 16], [0.45, -18], [0.68, -14], [0.97, 8], [1.25, 2]],
    chestX: [[0.21, 4], [0.36, 6], [0.65, 3]],
    headX: [[0.18, -14], [0.33, -20], [0.6, -8], [0.94, 0]],
    headZ: [[0.18, -18], [0.41, 20], [0.66, 26], [0.94, -8]],
    'L.az': [[0.18, -14], [0.36, -10], [0.41, 30], [0.66, 40], [0.94, 6]],
    'L.el': [[0.18, -12], [0.36, -24], [0.41, -40], [0.66, -44], [0.94, -18]],
    'L.reach': [[0.18, 0.7], [0.41, 0.8], [0.94, 0.5]],
    'L.elbow': [[0.18, 20]],
    'L.grip': [[0.05, 1]],
    'R.elbow': [[0.18, 30], [0.41, 10], [0.87, 20], [1.25, 20]],
    'R.grip': [[0.05, 1]],
    // held back low for the draw, swept across in the pass, flicked down to the right
    'w.x': [[0.18, 0.4], [0.33, 0.42], [0.36, 0.05], [0.41, -0.55], [0.66, -0.62], [0.8, 0.1], [0.9, 0.42], [1.25, 0.38]],
    'w.y': [[0.18, -0.18], [0.33, 0.05], [0.36, 0.86], [0.41, 0.86], [0.66, 0.8], [0.8, 0.66], [0.9, 0.36], [1.25, 0.28]],
    'w.z': [[0.18, -0.5], [0.33, -0.45], [0.36, -0.28], [0.41, -0.24], [0.66, -0.24], [0.8, -0.05], [0.9, -0.55], [1.25, -0.6]],
    'w.yaw': [[0.18, 150], [0.33, 115], [0.36, 30], [0.41, -70], [0.66, -85], [0.8, 0], [0.9, 40], [1.25, 36]],
    'w.pitch': [[0.18, 105], [0.33, 94], [0.41, 90], [0.66, 88], [0.8, 60], [0.9, 150], [1.25, 145]],
    'w.roll': [[0.18, 90], [0.41, 90], [0.8, 60], [0.9, 0]],
    'w.wield': [[0.06, 1], [0.92, 1], [1.28, 0]],
    'R.heel': [[0.18, 28], [0.33, 30], [0.41, 0]],
    'L.heel': [[0.18, 10], [0.33, 20], [0.41, 0]],
    advance: [[0.18, 0.06], [0.22, 0.24], [0.4, 8.6], [0.5, 9.9], [0.66, 10.3]],
  },
  steps: [
    { side: 'R', t0: 0.02, t1: 0.14, to: [-0.46, -0.5], yaw: -14, lift: 0.14 },
    // the burst: two long skimming strides, then both feet plough to a stop
    { side: 'R', t0: 0.22, t1: 0.31, to: [-0.4, 4.4], yaw: 0, lift: 0.16 },
    { side: 'L', t0: 0.28, t1: 0.37, to: [0.42, 8.1], yaw: 10, lift: 0.14 },
    { side: 'R', t0: 0.34, t1: 0.44, to: [-0.46, 8.6], yaw: -20, lift: 0.1 },
    { side: 'L', t0: 0.38, t1: 0.63, to: [0.5, 10.5], yaw: 25, lift: 0 },
    { side: 'R', t0: 0.44, t1: 0.65, to: [-0.5, 9.7], yaw: -25, lift: 0 },
    { side: 'L', t0: 0.8, t1: 0.96, to: [0.38, 10.2], yaw: 0, lift: 0.08 },
  ],
  cues: [
    { t: 0.02, cue: 'servo', value: 0.4 },
    { t: 0.12, cue: 'weapon-in', value: 0.16 },
    { t: 0.16, cue: 'ers', value: 1 },
    { t: 0.21, cue: 'punch', value: 11 },
    { t: 0.21, cue: 'pull', value: 3.5 },
    { t: 0.22, cue: 'shake', value: 0.25 },
    { t: 0.38, cue: 'stop', value: 0.07 },
    { t: 0.38, cue: 'kick', value: 0.4 },
    { t: 0.39, cue: 'shake', value: 0.18 },
    { t: 0.44, cue: 'ers', value: 0 },
    { t: 0.71, cue: 'pull', value: 0 },
    { t: 0.84, cue: 'servo', value: 0.3 },
    { t: 0.86, cue: 'weapon-out', value: 0.2 },
  ],
}

export const F1_MOVES: Moveset = {
  moves: [JAB, ROUNDHOUSE, DRAW_CUT, DASH],
  recover: 0.7,
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
