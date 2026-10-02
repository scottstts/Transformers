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
  strike: 0.48,
  duration: 0.98,
  chain: [0.62, 1.2],
  cancelAt: 0.66,
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
    hipDrop: [[0.18, 0.3], [0.34, 0.34], [0.43, 0.18], [0.53, 0.52], [0.62, 0.42], [0.92, 0.2]],
    hipX: [[0.19, -0.16], [0.34, -0.18], [0.45, 0.16], [0.55, 0.2], [0.92, 0.04]],
    hipRoll: [[0.22, -5], [0.37, -7], [0.49, 6], [0.6, 8], [0.92, 1]],
    hipYaw: [[0.19, -14], [0.33, -22], [0.44, 20], [0.52, 24], [0.92, 8]],
    hipPitch: [[0.21, -4], [0.34, -7], [0.47, 12], [0.55, 16], [0.92, 6]],
    spineX: [[0.22, -3], [0.38, -6], [0.5, 12], [0.56, 14], [0.92, 5]],
    spineZ: [[0.22, -8], [0.36, -14], [0.46, 14], [0.55, 16], [0.92, 4]],
    chestZ: [[0.24, -18], [0.4, -32], [0.49, 26], [0.56, 34], [0.92, 10]],
    chestX: [[0.25, -4], [0.41, -9], [0.54, 16], [0.62, 18], [0.92, 7]],
    headZ: [[0.22, 12], [0.39, 24], [0.48, -18], [0.88, -8]],
    headX: [[0.39, 8], [0.49, -12], [0.83, -4]],
    // the right hand reaches over the shoulder for the haft
    'R.az': [[0.12, 30], [0.22, 26]],
    'R.el': [[0.12, 30], [0.22, 64]],
    'R.reach': [[0.12, 0.6], [0.22, 0.55]],
    'R.elbow': [[0.12, 50], [0.22, 70], [0.43, 60], [0.49, 20], [0.83, 30]],
    'R.grip': [[0.22, 0.6], [0.3, 1]],
    'L.az': [[0.15, -8], [0.37, -14], [0.53, 24], [0.92, -6]],
    'L.el': [[0.15, -12], [0.37, -8], [0.53, -30], [0.92, -18]],
    'L.reach': [[0.15, 0.5], [0.53, 0.68], [0.92, 0.55]],
    'L.elbow': [[0.22, 24], [0.49, 12], [0.83, 20]],
    'L.grip': [[0.15, 1]],
    // The head lags behind the hip drive, accelerates through the cut and
    // stays low afterwards. No weightless lift back into an upright display pose.
    'w.x': [[0.22, 0.05], [0.4, 0.12], [0.45, -0.22], [0.5, -0.45], [0.6, -0.55], [0.92, -0.2]],
    'w.y': [[0.22, -0.05], [0.4, 0.1], [0.45, 0.56], [0.5, 0.78], [0.6, 0.72], [0.92, 0.7]],
    'w.z': [[0.22, 0.3], [0.4, 0.48], [0.45, 0.16], [0.5, -0.35], [0.6, -0.55], [0.92, -0.35]],
    'w.yaw': [[0.22, 15], [0.4, 32], [0.45, 0], [0.5, -28], [0.6, -42], [0.92, -10]],
    'w.pitch': [[0.22, -60], [0.4, -42], [0.45, 45], [0.5, 124], [0.6, 162], [0.92, 160]],
    'w.roll': [[0.22, 0], [0.4, 5], [0.5, -10], [0.92, -20]],
    'w.wield': [[0.11, 0], [0.22, 1]],
    'w.two': [[0.22, 0]],
    'L.heel': [[0.37, 0]],
    'R.heel': [[0.43, 0], [0.51, 26], [0.66, 20], [0.88, 8]],
    advance: [[0.33, 0.12], [0.51, 1.2], [0.7, 1.4]],
  },
  steps: [
    { side: 'L', t0: 0.32, t1: 0.45, to: [0.68, 1.6], yaw: 18, lift: 0.3 },
    { side: 'R', t0: 0.55, t1: 0.71, to: [-0.6, 0.9], yaw: -8, lift: 0.18 },
  ],
  cues: [
    { t: 0.03, cue: 'servo', value: 0.5 },
    { t: 0.19, cue: 'weapon-in', value: 0.22 },
    { t: 0.37, cue: 'servo', value: 0.35 },
    { t: 0.48, cue: 'axe-stump', value: 1 },
    { t: 0.48, cue: 'stop', value: 0.06 },
    { t: 0.48, cue: 'kick', value: 0.45 },
    { t: 0.48, cue: 'punch', value: 6 },
    { t: 0.49, cue: 'shake', value: 0.24 },
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
  strike: 0.92,
  duration: 2.2,
  chain: [1.58, 2.2],
  cancelAt: 1.58,
  keys: {
    // Arch back at the apex, then hinge hard forward through the blow and
    // absorb the landing in the knees; stand up only while pulling the axe back.
    hipDrop: [[0.16, 0.55], [0.46, 0.5], [0.65, 0.24], [0.84, 0.42], [0.95, 0.9], [1.05, 0.94], [1.21, 0.72], [1.44, 0.26], [1.72, 0.04]],
    hipX: [[0.16, -0.1], [0.46, -0.08], [0.72, -0.04], [0.95, 0.12], [1.24, 0.04], [1.69, 0]],
    hipRoll: [[0.16, -3], [0.46, -4], [0.72, -2], [0.95, 4], [1.24, 2], [1.69, 0]],
    hipPitch: [[0.16, 16], [0.29, 26], [0.46, 24], [0.65, -2], [0.8, 6], [0.92, 28], [1.02, 30], [1.19, 22], [1.44, 7], [1.72, 0]],
    hipYaw: [[0.16, -8], [0.46, -6], [0.66, -12], [0.88, 8], [1.08, 2], [1.44, 4], [1.69, 0]],
    spineX: [[0.18, 6], [0.48, 10], [0.68, -8], [0.82, 2], [0.93, 15], [1.04, 17], [1.21, 11], [1.46, 3], [1.72, 0]],
    chestX: [[0.19, 4], [0.49, 8], [0.71, -12], [0.83, 0], [0.95, 15], [1.07, 18], [1.22, 11], [1.48, 3], [1.72, 0]],
    chestZ: [[0.19, -10], [0.49, -6], [0.72, -14], [0.93, 12], [1.16, 8], [1.46, 4], [1.69, 0]],
    // the head keeps its eyes on the blade, not on the sand under the chest
    headX: [[0.16, -12], [0.46, -18], [0.65, 0], [0.93, -22], [1.08, -26], [1.44, -8], [1.72, 0]],
    headZ: [[0.16, 8], [0.95, 0]],
    'R.elbow': [[0.16, 20], [0.58, 30], [0.72, 60], [0.95, 10], [1.5, 25]],
    'L.elbow': [[0.16, 24], [0.65, 30], [0.75, 60], [0.95, 10], [1.44, 20]],
    'R.grip': [[0.07, 1], [1.56, 1], [1.81, 0]],
    // The empty hand is received where the carry left it, low at the hip.
    'R.az': [[0.16, -3], [1.16, -3], [1.5, -14]],
    'R.el': [[0.16, -22], [1.16, -22], [1.5, -64]],
    'R.reach': [[0.16, 0.5], [1.16, 0.5], [1.5, 0.9]],
    // Lift -> cocked behind the helmet -> whip down to the bite -> held in the
    // cut -> dragged back out -> a low carry at the hip, edge forward.
    'w.x': [[0.16, 0.25], [0.46, 0.25], [0.58, -0.1], [0.72, -0.3], [0.82, -0.36], [0.92, -0.38], [1.08, -0.38], [1.32, -0.38], [1.41, -0.18], [1.5, -0.05]],
    'w.y': [[0.16, 0.25], [0.46, 0.3], [0.58, 0.42], [0.72, 0.4], [0.82, 1.0], [0.92, 1.25], [1.08, 1.22], [1.29, 0.68], [1.5, 0.35]],
    'w.z': [[0.16, -0.45], [0.46, -0.4], [0.58, 0.35], [0.72, 0.85], [0.82, 0.4], [0.92, -0.9], [1.08, -0.9], [1.29, -1.07], [1.5, -0.88]],
    'w.yaw': [[0.16, 15], [0.46, 15], [0.72, 0], [1.32, 0], [1.5, -10]],
    'w.pitch': [[0.16, 115], [0.46, 110], [0.58, 30], [0.72, -35], [0.82, 40], [0.92, 116], [1.08, 118], [1.29, 112], [1.5, 100]],
    'w.roll': [[0.16, 0], [1.5, 0]],
    'w.wield': [[0.13, 1], [1.56, 1], [1.85, 0]],
    // one hand on the axe: the free arm reaches forward under the raised axe and sweeps back to counter the chop
    'w.two': [[0.18, 0]],
    'L.az': [[0.16, -6], [0.46, -2], [0.75, -4], [0.84, 40], [0.93, 110], [1.08, 115], [1.58, 10], [2.13, 10]],
    'L.el': [[0.16, -8], [0.46, 0], [0.75, 0], [0.84, -45], [0.93, -50], [1.08, -52], [1.58, -22], [2.13, -60]],
    'L.reach': [[0.16, 0.55], [0.46, 0.6], [0.75, 0.6], [0.93, 0.92], [1.08, 0.92], [1.58, 0.55], [2.13, 0.8]],
    'L.grip': [[0.07, 1], [1.39, 1], [1.89, 0]],
    'R.heel': [[0.16, 20], [0.46, 30], [0.65, 0], [0.95, 0]],
    'L.heel': [[0.16, 6], [0.46, 12], [0.65, 0]],
    advance: [[0.16, 0.08], [0.22, 0.3], [0.46, 6.6], [0.72, 8.0], [0.95, 8.6], [1.07, 8.7]],
    air: [[0.48, 0], [0.72, 0.85], [0.81, 0.7], [0.92, 0]],
  },
  steps: [
    { side: 'R', t0: 0.03, t1: 0.15, to: [-0.66, -0.35], yaw: -10, lift: 0.2 },
    // dragged by the jets: both feet plough through the sand
    { side: 'L', t0: 0.19, t1: 0.46, to: [0.62, 6.6], yaw: 6, lift: 0 },
    { side: 'R', t0: 0.21, t1: 0.46, to: [-0.66, 5.9], yaw: -8, lift: 0 },
    // the leap: both feet land around the blow
    { side: 'L', t0: 0.48, t1: 0.92, to: [0.66, 9.3], yaw: 10, lift: 0.5 },
    { side: 'R', t0: 0.52, t1: 0.95, to: [-0.66, 8.1], yaw: -10, lift: 0.4 },
    // Regather the stance as it stands, before hand-back.
    { side: 'R', t0: 1.21, t1: 1.38, to: [-0.59, 8.7], yaw: 0, lift: 0.18 },
    { side: 'L', t0: 1.39, t1: 1.56, to: [0.59, 8.7], yaw: 0, lift: 0.14 },
  ],
  cues: [
    { t: 0.03, cue: 'servo', value: 0.5 },
    { t: 0.15, cue: 'boost', value: 1 },
    { t: 0.16, cue: 'weapon-in', value: 0.28 },
    { t: 0.16, cue: 'punch', value: 9 },
    { t: 0.16, cue: 'pull', value: 3.2 },
    { t: 0.18, cue: 'shake', value: 0.35 },
    { t: 0.46, cue: 'boost', value: 0 },
    { t: 0.49, cue: 'servo', value: 0.35 },
    { t: 0.92, cue: 'slam', value: 1 },
    { t: 1.08, cue: 'servo', value: 0.55 },
    { t: 1.32, cue: 'pull', value: 0 },
    { t: 1.33, cue: 'weapon-out', value: 0.22 },
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
