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
  chain: [0.42, 1.0],
  cancelAt: 0.44,
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
  chain: [0.54, 1.1],
  cancelAt: 0.56,
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
 * carries the robot into a long step; the free arm counterbalances the head
 * as it follows through into a low carry.
 */
const CLEAVE: CombatMove = {
  name: 'cleave',
  strike: 0.72,
  duration: 1.35,
  chain: [0.92, 1.6],
  cancelAt: 0.98,
  recovery: {
    // Keep the haft in its safe forward frame while it dissolves. The off
    // hand leaves first; the shoulder lowers only after the main grip releases.
    'w.x': [[0.4, -0.2]],
    'w.y': [[0.4, 0.7]],
    'w.z': [[0.4, -0.35]],
    'w.yaw': [[0.4, -10]],
    'w.pitch': [[0.4, 160]],
    'w.roll': [[0.4, -20]],
    'w.two': [[0.32, 0]],
    'w.wield': [[0.28, 1], [0.68, 0]],
    'R.az': [[0.28, -3], [0.68, 8]],
    'R.el': [[0.28, -22], [0.68, -65]],
    'R.reach': [[0.28, 0.5], [0.68, 0.9]],
    'R.wx': [[0.32, 172], [1.14, 0]],
    'R.wy': [[0.32, -63], [1.14, 0]],
    'R.wz': [[0.32, 27], [1.14, 0]],
    'L.az': [[0.3, -6], [0.68, 8]],
    'L.el': [[0.3, -18], [0.68, -65]],
    'L.reach': [[0.3, 0.55], [0.68, 0.9]],
  },
  keys: {
    // Sit into the rear hip, push off it, then catch the heavy head over the
    // lead knee. Hips unwind before spine, chest and finally the axe head.
    hipDrop: [[0.24, 0.3], [0.46, 0.34], [0.6, 0.18], [0.8, 0.52], [0.94, 0.42], [1.3, 0.2]],
    hipX: [[0.26, -0.16], [0.46, -0.18], [0.66, 0.16], [0.84, 0.2], [1.3, 0.04]],
    hipRoll: [[0.3, -5], [0.5, -7], [0.73, 6], [0.92, 8], [1.3, 1]],
    hipYaw: [[0.26, -14], [0.44, -22], [0.63, 20], [0.79, 24], [1.3, 8]],
    hipPitch: [[0.28, -4], [0.46, -7], [0.7, 12], [0.84, 16], [1.3, 6]],
    spineX: [[0.3, -3], [0.51, -6], [0.75, 12], [0.86, 14], [1.3, 5]],
    spineZ: [[0.3, -8], [0.49, -14], [0.68, 14], [0.83, 16], [1.3, 4]],
    chestZ: [[0.32, -18], [0.54, -32], [0.73, 26], [0.86, 34], [1.3, 10]],
    chestX: [[0.34, -4], [0.56, -9], [0.81, 16], [0.94, 18], [1.3, 7]],
    headZ: [[0.3, 12], [0.52, 24], [0.72, -18], [1.25, -8]],
    headX: [[0.52, 8], [0.74, -12], [1.2, -4]],
    // the right hand reaches over the shoulder for the haft
    'R.az': [[0.16, 30], [0.3, 26]],
    'R.el': [[0.16, 30], [0.3, 64]],
    'R.reach': [[0.16, 0.6], [0.3, 0.55]],
    'R.elbow': [[0.16, 50], [0.3, 70], [0.6, 60], [0.74, 20], [1.2, 30]],
    'R.grip': [[0.3, 0.6], [0.4, 1]],
    'L.az': [[0.2, -8], [0.5, -14], [0.8, 24], [1.3, -6]],
    'L.el': [[0.2, -12], [0.5, -8], [0.8, -30], [1.3, -18]],
    'L.reach': [[0.2, 0.5], [0.8, 0.68], [1.3, 0.55]],
    'L.elbow': [[0.3, 24], [0.74, 12], [1.2, 20]],
    'L.grip': [[0.2, 1]],
    // The head lags behind the hip drive, accelerates through the cut and
    // stays low afterwards. No weightless lift back into an upright display pose.
    'w.x': [[0.3, 0.05], [0.54, 0.12], [0.66, -0.22], [0.75, -0.45], [0.92, -0.55], [1.3, -0.2]],
    'w.y': [[0.3, -0.05], [0.54, 0.1], [0.66, 0.56], [0.75, 0.78], [0.92, 0.72], [1.3, 0.7]],
    'w.z': [[0.3, 0.3], [0.54, 0.48], [0.66, 0.16], [0.75, -0.35], [0.92, -0.55], [1.3, -0.35]],
    'w.yaw': [[0.3, 15], [0.54, 32], [0.66, 0], [0.75, -28], [0.92, -42], [1.3, -10]],
    'w.pitch': [[0.3, -60], [0.54, -42], [0.66, 45], [0.75, 124], [0.92, 162], [1.3, 160]],
    'w.roll': [[0.3, 0], [0.54, 5], [0.75, -10], [1.3, -20]],
    'w.wield': [[0.14, 0], [0.3, 1]],
    'w.two': [[0.3, 0]],
    'L.heel': [[0.5, 0]],
    'R.heel': [[0.6, 0], [0.76, 26], [1.0, 20], [1.25, 8]],
    advance: [[0.45, 0.12], [0.76, 1.2], [1.05, 1.4]],
  },
  steps: [
    { side: 'L', t0: 0.43, t1: 0.66, to: [0.68, 1.6], yaw: 18, lift: 0.3 },
    { side: 'R', t0: 0.83, t1: 1.06, to: [-0.6, 0.9], yaw: -8, lift: 0.18 },
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
 * jets fire and it skids across the sand, leaps with the axe raised and whips it
 * down one-handed in a full-body chop, the free arm sweeping back against it: the hips, spine and chest
 * hinge forward over the lead knee and the blade bites the sand well ahead,
 * cutting it. It drags the axe back out of the cut as it stands, carrying it
 * low at the hip while it dissolves; from then a click starts the next combo
 * straight from this pose (its chain window).
 */
const CHARGE: CombatMove = {
  name: 'charge',
  strike: 1.28,
  duration: 2.95,
  chain: [2.15, 2.95],
  cancelAt: 2.15,
  keys: {
    // Arch back at the apex, then hinge hard forward through the blow and
    // absorb the landing in the knees; stand up only while pulling the axe back.
    hipDrop: [[0.22, 0.55], [0.6, 0.5], [0.86, 0.24], [1.16, 0.42], [1.32, 0.9], [1.46, 0.94], [1.66, 0.72], [1.96, 0.26], [2.3, 0.04]],
    hipX: [[0.22, -0.1], [0.6, -0.08], [0.96, -0.04], [1.32, 0.12], [1.7, 0.04], [2.27, 0]],
    hipRoll: [[0.22, -3], [0.6, -4], [0.96, -2], [1.32, 4], [1.7, 2], [2.27, 0]],
    hipPitch: [[0.22, 16], [0.38, 26], [0.6, 24], [0.86, -2], [1.08, 6], [1.28, 28], [1.42, 30], [1.64, 22], [1.96, 7], [2.3, 0]],
    hipYaw: [[0.22, -8], [0.6, -6], [0.88, -12], [1.21, 8], [1.5, 2], [1.96, 4], [2.27, 0]],
    spineX: [[0.24, 6], [0.62, 10], [0.9, -8], [1.12, 2], [1.3, 15], [1.44, 17], [1.66, 11], [1.99, 3], [2.3, 0]],
    chestX: [[0.26, 4], [0.64, 8], [0.94, -12], [1.14, 0], [1.32, 15], [1.48, 18], [1.68, 11], [2.02, 3], [2.3, 0]],
    chestZ: [[0.26, -10], [0.64, -6], [0.96, -14], [1.3, 12], [1.6, 8], [1.99, 4], [2.27, 0]],
    // the head keeps its eyes on the blade, not on the sand under the chest
    headX: [[0.22, -12], [0.6, -18], [0.86, 0], [1.3, -22], [1.5, -26], [1.96, -8], [2.3, 0]],
    headZ: [[0.22, 8], [1.32, 0]],
    'R.elbow': [[0.22, 20], [0.76, 30], [0.96, 60], [1.32, 10], [2.05, 25]],
    'L.elbow': [[0.22, 24], [0.86, 30], [1.0, 60], [1.32, 10], [1.96, 20]],
    'R.grip': [[0.1, 1], [2.12, 1], [2.4, 0]],
    // The empty hand is received where the carry left it, low at the hip.
    'R.az': [[0.22, -3], [1.6, -3], [2.05, -14]],
    'R.el': [[0.22, -22], [1.6, -22], [2.05, -64]],
    'R.reach': [[0.22, 0.5], [1.6, 0.5], [2.05, 0.9]],
    // Lift -> cocked behind the helmet -> whip down to the bite -> held in the
    // cut -> dragged back out -> a low carry at the hip, edge forward.
    'w.x': [[0.22, 0.25], [0.6, 0.25], [0.76, -0.1], [0.96, -0.3], [1.12, -0.36], [1.28, -0.38], [1.5, -0.38], [1.8, -0.38], [1.92, -0.18], [2.05, -0.05]],
    'w.y': [[0.22, 0.25], [0.6, 0.3], [0.76, 0.42], [0.96, 0.4], [1.12, 1.0], [1.28, 1.25], [1.5, 1.22], [1.76, 0.68], [2.05, 0.35]],
    'w.z': [[0.22, -0.45], [0.6, -0.4], [0.76, 0.35], [0.96, 0.85], [1.12, 0.4], [1.28, -0.9], [1.5, -0.9], [1.76, -1.07], [2.05, -0.88]],
    'w.yaw': [[0.22, 15], [0.6, 15], [0.96, 0], [1.8, 0], [2.05, -10]],
    'w.pitch': [[0.22, 115], [0.6, 110], [0.76, 30], [0.96, -35], [1.12, 40], [1.28, 116], [1.5, 118], [1.76, 112], [2.05, 100]],
    'w.roll': [[0.22, 0], [2.05, 0]],
    'w.wield': [[0.18, 1], [2.12, 1], [2.45, 0]],
    // one hand on the axe: the free arm reaches forward under the raised axe and sweeps back to counter the chop
    'w.two': [[0.24, 0]],
    'L.az': [[0.22, -6], [0.6, -2], [1.0, -4], [1.15, 40], [1.3, 110], [1.5, 115], [2.15, 10], [2.85, 10]],
    'L.el': [[0.22, -8], [0.6, 0], [1.0, 0], [1.15, -45], [1.3, -50], [1.5, -52], [2.15, -22], [2.85, -60]],
    'L.reach': [[0.22, 0.55], [0.6, 0.6], [1.0, 0.6], [1.3, 0.92], [1.5, 0.92], [2.15, 0.55], [2.85, 0.8]],
    'L.grip': [[0.1, 1], [1.9, 1], [2.5, 0]],
    'R.heel': [[0.22, 20], [0.6, 30], [0.86, 0], [1.32, 0]],
    'L.heel': [[0.22, 6], [0.6, 12], [0.86, 0]],
    advance: [[0.22, 0.08], [0.3, 0.3], [0.6, 6.6], [0.96, 8.0], [1.32, 8.6], [1.49, 8.7]],
    air: [[0.62, 0], [0.96, 0.85], [1.1, 0.7], [1.28, 0]],
  },
  steps: [
    { side: 'R', t0: 0.04, t1: 0.2, to: [-0.66, -0.35], yaw: -10, lift: 0.2 },
    // dragged by the jets: both feet plough through the sand
    { side: 'L', t0: 0.26, t1: 0.6, to: [0.62, 6.6], yaw: 6, lift: 0 },
    { side: 'R', t0: 0.28, t1: 0.6, to: [-0.66, 5.9], yaw: -8, lift: 0 },
    // the leap: both feet land around the blow
    { side: 'L', t0: 0.62, t1: 1.28, to: [0.66, 9.3], yaw: 10, lift: 0.5 },
    { side: 'R', t0: 0.68, t1: 1.32, to: [-0.66, 8.1], yaw: -10, lift: 0.4 },
    // Regather the stance as it stands, before hand-back.
    { side: 'R', t0: 1.66, t1: 1.88, to: [-0.59, 8.7], yaw: 0, lift: 0.18 },
    { side: 'L', t0: 1.9, t1: 2.13, to: [0.59, 8.7], yaw: 0, lift: 0.14 },
  ],
  cues: [
    { t: 0.04, cue: 'servo', value: 0.5 },
    { t: 0.2, cue: 'boost', value: 1 },
    { t: 0.22, cue: 'weapon-in', value: 0.28 },
    { t: 0.22, cue: 'punch', value: 9 },
    { t: 0.22, cue: 'pull', value: 3.2 },
    { t: 0.24, cue: 'shake', value: 0.35 },
    { t: 0.6, cue: 'boost', value: 0 },
    { t: 0.64, cue: 'servo', value: 0.35 },
    { t: 1.28, cue: 'slam', value: 1 },
    { t: 1.5, cue: 'servo', value: 0.55 },
    { t: 1.8, cue: 'pull', value: 0 },
    { t: 1.82, cue: 'weapon-out', value: 0.3 },
  ],
}

export const CYBERTRUCK_MOVES: Moveset = {
  moves: [CROSS, HOOK, CLEAVE, CHARGE],
  recover: 1.15,
  recoverCues: [{ t: 0.0, cue: 'weapon-out', value: 0.5 }],
}

/**
 * The guard (held with the right mouse button): a boxer's high guard, both
 * fists up in front of the helmet with the forearms upright and the elbows
 * in over the ribs, knees bent and weight low, chin tucked. The shield forms
 * round it (fighter.ts); the pose holds for as long as the guard does.
 */
export const CYBERTRUCK_GUARD: CombatMove = {
  name: 'guard',
  duration: 1e6,
  chain: [1e6, 1e6],
  keys: {
    hipDrop: [[0.18, 0.34]],
    hipPitch: [[0.18, 8]],
    spineX: [[0.2, 4]],
    chestX: [[0.2, 7]],
    headX: [[0.22, 8]],
    'R.az': [[0.16, -6]],
    'R.el': [[0.16, 24]],
    'R.reach': [[0.16, 0.4]],
    'R.elbow': [[0.16, 22]],
    'R.grip': [[0.1, 1]],
    'L.az': [[0.18, -4]],
    'L.el': [[0.18, 28]],
    'L.reach': [[0.18, 0.42]],
    'L.elbow': [[0.18, 20]],
    'L.grip': [[0.1, 1]],
  },
  cues: [{ t: 0.02, cue: 'servo', value: 0.3 }],
}
