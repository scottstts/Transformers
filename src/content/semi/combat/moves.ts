import type { Key } from '../../transformer/combat/curves'
import type { CombatMove, Moveset } from '../../transformer/combat/moves'

/**
 * The Semi's combo. It stands head and shoulders over everything it fights,
 * so its hands stay out of it: two kicks from seven metres up, then the gun.
 * A push kick, a turning side kick, the machine gun swept across the front
 * from the hip and the coil cannon fired into the ground ahead. Distances in
 * metres (hips 4.2 m up, legs 3.65 m, arms 2.7 m), angles in degrees; see
 * pose.ts for the channels.
 *
 * The stance: left foot [1.04, 0.05], right [-1.04, 0.05] (wide, planted just
 * ahead of the hips).
 *
 * The gun is held one-handed, braced along the forearm like an arm cannon:
 * the robot's shoulders stand 3.2 m apart against 2.7 m arms, so the left
 * hand can never reach the foregrip in front of the body. Its weapon
 * channels place the pistol grip from the right shoulder; `w.pitch` 90 with
 * `w.roll` 180 points the barrels level ahead, top up (more pitch aims lower).
 */

/** 1. Push kick: the right knee chambers high and the sole drives straight out, the body leaning back over the planted left leg. */
const PUSH_KICK: CombatMove = {
  name: 'push-kick',
  strike: 0.38,
  duration: 0.9,
  chain: [0.52, 1.05],
  cancelAt: 0.62,
  keys: {
    hipDrop: [[0.12, 0.14], [0.3, 0.05], [0.44, 0.06], [0.7, 0.18], [0.86, 0.12]],
    hipPitch: [[0.12, 4], [0.34, -12], [0.46, -10], [0.72, 3], [0.88, 1]],
    hipYaw: [[0.14, 6], [0.36, 14], [0.72, 4]],
    hipX: [[0.14, 0.16], [0.4, 0.22], [0.76, 0.04]],
    hipRoll: [[0.14, 3], [0.38, -4], [0.72, 0]],
    spineX: [[0.34, 7], [0.72, 2]],
    chestX: [[0.36, 5], [0.72, 2]],
    chestZ: [[0.14, -6], [0.38, -10], [0.72, -2]],
    headX: [[0.36, -5], [0.72, -2]],
    'L.az': [[0.14, -10], [0.72, -6]],
    'L.el': [[0.14, 14], [0.72, 6]],
    'L.reach': [[0.14, 0.42], [0.72, 0.46]],
    'L.elbow': [[0.14, 30]],
    'L.grip': [[0.08, 1]],
    'R.az': [[0.2, 16], [0.4, 24], [0.76, 8]],
    'R.el': [[0.2, -40], [0.4, -48], [0.76, -30]],
    'R.reach': [[0.2, 0.62], [0.76, 0.56]],
    'R.elbow': [[0.2, 22]],
    'R.grip': [[0.08, 1]],
    'L.heel': [[0.28, 10], [0.5, 12], [0.72, 0]],
    advance: [[0.14, 0.05], [0.38, 0.35], [0.62, 1.05], [0.86, 1.2]],
  },
  steps: [
    { side: 'R', t0: 0.06, t1: 0.6, to: [-1.0, 1.75], yaw: 4, via: [-0.5, 3.0, 1.9], viaYaw: -6, point: -38 },
    { side: 'L', t0: 0.64, t1: 0.82, to: [1.02, 1.2], yaw: 0, lift: 0.22 },
  ],
  cues: [
    { t: 0.03, cue: 'servo', value: 0.35 },
    { t: 0.38, cue: 'kick', value: 0.3 },
    { t: 0.38, cue: 'gust', value: 0.8 },
    { t: 0.39, cue: 'shake', value: 0.16 },
  ],
}

/**
 * 2. Turning side kick: the hips turn right on the pivoting right foot, the
 * left knee comes across and the heel drives out at a soldier's head, the
 * torso leaning away from it and the eyes on the target.
 */
const SIDE_KICK: CombatMove = {
  name: 'side-kick',
  strike: 0.5,
  duration: 1.1,
  chain: [0.72, 1.3],
  cancelAt: 0.8,
  keys: {
    hipYaw: [[0.16, -24], [0.4, -62], [0.56, -66], [0.84, -20], [1.05, -4]],
    hipRoll: [[0.2, -2], [0.46, -12], [0.62, -12], [0.9, 0]],
    hipPitch: [[0.2, 4], [0.46, -4], [0.9, 2]],
    hipDrop: [[0.14, 0.2], [0.44, 0.1], [0.62, 0.12], [0.9, 0.2], [1.05, 0.12]],
    hipX: [[0.18, -0.16], [0.46, -0.24], [0.9, -0.06]],
    spineY: [[0.46, -10], [0.64, -10], [0.95, 0]],
    spineZ: [[0.2, -8], [0.46, -12], [0.9, -4]],
    chestZ: [[0.2, -6], [0.46, 6], [0.62, 8], [0.95, 0]],
    headZ: [[0.2, 12], [0.46, 44], [0.62, 46], [0.95, 8]],
    headX: [[0.46, 4], [0.95, 0]],
    'L.az': [[0.2, 10], [0.46, 40], [0.7, 30], [1.0, -6]],
    'L.el': [[0.2, -20], [0.46, -34], [0.7, -30], [1.0, -16]],
    'L.reach': [[0.2, 0.55], [0.46, 0.8], [1.0, 0.5]],
    'L.elbow': [[0.2, 18]],
    'L.grip': [[0.08, 1]],
    'R.az': [[0.2, -14], [0.46, -24], [0.9, -8]],
    'R.el': [[0.2, 16], [0.46, 22], [0.9, 6]],
    'R.reach': [[0.2, 0.42], [0.9, 0.46]],
    'R.elbow': [[0.2, 34]],
    'R.grip': [[0.08, 1]],
    advance: [[0.2, 0.1], [0.5, 0.5], [0.85, 0.9], [1.05, 1.0]],
  },
  steps: [
    // the support foot pivots on its ball as the hips come round
    { side: 'R', t0: 0.06, t1: 0.2, to: [-0.95, 0.65], yaw: -60, lift: 0.08 },
    { side: 'L', t0: 0.2, t1: 0.78, to: [0.4, 1.5], yaw: -40, via: [-0.2, 3.1, 2.2], viaYaw: -95, point: 12 },
    { side: 'R', t0: 0.82, t1: 1.0, to: [-1.02, 0.95], yaw: -6, lift: 0.2 },
  ],
  cues: [
    { t: 0.05, cue: 'servo', value: 0.45 },
    { t: 0.5, cue: 'kick', value: 0.38 },
    { t: 0.5, cue: 'gust', value: 1 },
    { t: 0.51, cue: 'shake', value: 0.2 },
  ],
}

/** The machine gun's sweep: from the right to the left of the front (deg of `w.yaw`, + right), and when. */
const SWEEP = { from: 38, to: -38, t0: 0.5, t1: 1.6 }
/**
 * The hip-fire hold: the grip ahead of the right shoulder at the hip, the
 * barrels 20 degrees down: the rounds strike the crowd pressing in (a body
 * 4 m out is hit at chest height) and the sand about 11 m out.
 */
const HIP = { r: 0.5, x: -0.04, z: -0.64, pitch: 110 }

/** The grip on its arc about the right shoulder while the barrels aim `yaw` (deg, + right). */
function hip(t: number, yaw: number): Record<'w.x' | 'w.y' | 'w.z' | 'w.yaw' | 'w.pitch' | 'w.roll', Key> {
  const a = yaw * Math.PI / 180
  return {
    'w.x': [t, HIP.x + Math.sin(a) * HIP.r],
    'w.y': [t, Math.cos(a) * HIP.r],
    'w.z': [t, HIP.z],
    'w.yaw': [t, yaw],
    'w.pitch': [t, HIP.pitch],
    'w.roll': [t, 180],
  }
}

/** Keys of several weapon poses, channel by channel. */
function holds(...poses: Array<Record<string, Key>>): Partial<Record<string, Key[]>> {
  const out: Partial<Record<string, Key[]>> = {}
  for (const pose of poses) for (const [name, key] of Object.entries(pose)) (out[name] ??= []).push(key)
  return out
}

/** The machine gun's firing window in the sweep (move time, s). */
export const SWEEP_FIRE_WINDOW: readonly [number, number] = [SWEEP.t0, SWEEP.t1]

/**
 * 3. Sweep: the gun forms in the right hand as it comes forward to the hip;
 * a wide braced step, then the machine gun swept from right to left across
 * the front, the torso turning with it, the left arm out against the recoil.
 */
const SWEEP_FIRE: CombatMove = {
  name: 'sweep',
  strike: 0.6,
  duration: 2.2,
  chain: [1.85, 2.5],
  cancelAt: 1.9,
  keys: {
    ...holds(hip(0.36, SWEEP.from), hip(SWEEP.t0, SWEEP.from), hip(1.05, 0), hip(SWEEP.t1, SWEEP.to), hip(1.95, SWEEP.to * 0.6)),
    'w.wield': [[0.06, 0], [0.24, 1]],
    'w.two': [[0.2, 0]],
    'R.grip': [[0.12, 0.6], [0.24, 1]],
    'R.elbow': [[0.2, 10]],
    hipDrop: [[0.2, 0.22], [0.4, 0.34], [1.6, 0.34], [2.1, 0.2]],
    hipPitch: [[0.3, 4], [0.5, 7], [1.6, 7], [2.1, 3]],
    hipX: [[0.3, 0.06], [1.6, -0.06], [2.1, 0]],
    hipYaw: [[0.36, -6], [SWEEP.t0, -8], [SWEEP.t1, 8], [2.1, 4]],
    spineZ: [[0.36, -6], [SWEEP.t0, -8], [SWEEP.t1, 10], [2.1, 4]],
    chestZ: [[0.36, -10], [SWEEP.t0, -14], [SWEEP.t1, 16], [2.1, 6]],
    chestX: [[0.4, 4], [1.6, 5], [2.1, 2]],
    headZ: [[0.36, -16], [SWEEP.t0, -20], [SWEEP.t1, 22], [2.1, 6]],
    headX: [[0.4, 6], [1.6, 6], [2.1, 2]],
    'L.az': [[0.3, 36], [SWEEP.t0, 40], [SWEEP.t1, 30], [2.1, 8]],
    'L.el': [[0.3, -32], [1.6, -36], [2.1, -24]],
    'L.reach': [[0.3, 0.72], [1.6, 0.74], [2.1, 0.55]],
    'L.elbow': [[0.3, 16]],
    'L.grip': [[0.08, 1]],
    'R.heel': [[0.3, 8], [1.6, 8], [1.9, 0]],
    advance: [[0.14, 0.05], [0.38, 0.45], [2.0, 0.6]],
  },
  steps: [
    { side: 'L', t0: 0.08, t1: 0.34, to: [1.25, 1.05], yaw: 8, lift: 0.3 },
    { side: 'R', t0: 0.2, t1: 0.44, to: [-1.2, 0.05], yaw: -12, lift: 0.18 },
  ],
  cues: [
    { t: 0.03, cue: 'servo', value: 0.4 },
    { t: 0.06, cue: 'weapon-in', value: 0.3 },
    { t: SWEEP.t0 - 0.05, cue: 'fire', value: 1 },
    { t: SWEEP.t0 - 0.04, cue: 'kick', value: 0.2 },
    { t: SWEEP.t1 + 0.02, cue: 'fire', value: 0 },
  ],
}

/** The cannon's hold: the arm straight out ahead of the shoulder, barrels 38 degrees down into the sand ahead. */
const CANNON = { x: -0.08, y: 0.74, z: -0.3, pitch: 128 }
/** When the cannon fires, and its slug lands (about 10 m out, at 260 m/s). */
export const CANNON_FIRE = 0.95
export const CANNON_LANDS = 1.0

/**
 * 4. Cannon: a long lunge, the gun raised straight out from the shoulder
 * and aimed down into the ground ten metres ahead (the blast reaches back to
 * the crowd pressing in on it), the coils charging, then the blast:
 * the gun bucks up, the body rocks back over the rear leg and the ground
 * ahead goes up. It lowers the smoking gun to its hip and lets it go.
 */
const CANNON_BLAST: CombatMove = {
  name: 'cannon',
  strike: CANNON_LANDS,
  duration: 2.5,
  chain: [1.95, 2.6],
  cancelAt: 1.95,
  keys: {
    'w.x': [[0.36, CANNON.x], [CANNON_FIRE, CANNON.x], [1.05, CANNON.x - 0.02], [1.45, CANNON.x], [1.95, HIP.x]],
    'w.y': [[0.36, CANNON.y], [CANNON_FIRE, CANNON.y], [1.05, CANNON.y - 0.14], [1.45, CANNON.y - 0.04], [1.95, HIP.r]],
    'w.z': [[0.36, CANNON.z], [CANNON_FIRE, CANNON.z], [1.05, CANNON.z + 0.1], [1.45, CANNON.z], [1.95, HIP.z]],
    'w.yaw': [[0.36, -3], [1.45, -3], [1.95, 8]],
    'w.pitch': [[0.36, CANNON.pitch], [CANNON_FIRE, CANNON.pitch], [1.05, CANNON.pitch - 26], [1.45, CANNON.pitch - 6], [1.95, HIP.pitch + 6]],
    'w.roll': [[0.36, 180], [1.95, 180]],
    'w.wield': [[0.05, 1]],
    'w.two': [[0.1, 0]],
    'R.grip': [[0.08, 1]],
    'R.elbow': [[0.3, 6]],
    hipDrop: [[0.2, 0.3], [0.44, 0.72], [CANNON_FIRE, 0.76], [1.1, 0.66], [1.5, 0.6], [2.3, 0.2]],
    hipPitch: [[0.3, 6], [0.5, 12], [CANNON_FIRE, 12], [1.08, 2], [1.5, 7], [2.3, 2]],
    hipX: [[0.3, 0.12], [0.5, 0.08], [2.3, 0]],
    hipYaw: [[0.3, 8], [0.5, 12], [1.5, 10], [2.3, 2]],
    spineX: [[0.5, 6], [CANNON_FIRE, 7], [1.08, -6], [1.5, 3], [2.3, 0]],
    chestX: [[0.5, 5], [CANNON_FIRE, 6], [1.08, -7], [1.5, 2], [2.3, 0]],
    chestZ: [[0.5, 4], [1.5, 4], [2.3, 0]],
    headX: [[0.5, 10], [CANNON_FIRE, 10], [1.08, 0], [1.5, 6], [2.3, 0]],
    'L.az': [[0.3, -20], [CANNON_FIRE, -22], [1.08, 20], [1.6, 4]],
    'L.el': [[0.3, -26], [CANNON_FIRE, -28], [1.08, -46], [1.6, -30]],
    'L.reach': [[0.3, 0.55], [1.08, 0.8], [1.6, 0.56]],
    'L.elbow': [[0.3, 32], [1.08, 14], [1.6, 24]],
    'L.grip': [[0.08, 1]],
    'R.heel': [[0.4, 18], [CANNON_FIRE, 18], [1.1, 24], [1.6, 10], [2.1, 0]],
    advance: [[0.14, 0.1], [0.44, 1.25], [0.8, 1.4]],
  },
  steps: [
    { side: 'L', t0: 0.06, t1: 0.42, to: [1.3, 1.65], yaw: 6, lift: 0.36 },
    { side: 'R', t0: 0.2, t1: 0.48, to: [-1.2, -0.45], yaw: -18, lift: 0 },
    { side: 'R', t0: 1.6, t1: 1.9, to: [-1.04, 1.05], yaw: -4, lift: 0.26 },
  ],
  cues: [
    { t: 0.02, cue: 'weapon-in', value: 0.25 },
    { t: 0.04, cue: 'servo', value: 0.5 },
    { t: 0.4, cue: 'charge', value: 1 },
    { t: 0.4, cue: 'punch', value: 4 },
    { t: 0.4, cue: 'pull', value: 2.4 },
    { t: 0.6, cue: 'servo', value: 0.35 },
    { t: CANNON_FIRE, cue: 'cannon', value: 1 },
    { t: CANNON_FIRE, cue: 'charge', value: 0 },
    { t: 1.5, cue: 'pull', value: 0 },
    { t: 1.95, cue: 'weapon-out', value: 0.35 },
  ],
}

export const SEMI_MOVES: Moveset = {
  moves: [PUSH_KICK, SIDE_KICK, SWEEP_FIRE, CANNON_BLAST],
  recover: 1.2,
  recoverCues: [{ t: 0.0, cue: 'weapon-out', value: 0.45 }, { t: 0.0, cue: 'fire', value: 0 }, { t: 0.0, cue: 'charge', value: 0 }],
}

/**
 * The guard (held with the right mouse button): the right forearm laid
 * across the chest like a bar and the left fist up by the face, knees bent
 * and weight low, chin down. The shield forms round it (fighter.ts).
 */
export const SEMI_GUARD: CombatMove = {
  name: 'guard',
  duration: 1e6,
  chain: [1e6, 1e6],
  keys: {
    hipDrop: [[0.2, 0.4]],
    hipPitch: [[0.2, 8]],
    spineX: [[0.22, 4]],
    chestX: [[0.22, 6]],
    headX: [[0.24, 9]],
    'R.az': [[0.18, -38]],
    'R.el': [[0.18, 8]],
    'R.reach': [[0.18, 0.46]],
    'R.elbow': [[0.18, 58]],
    'R.grip': [[0.1, 1]],
    'L.az': [[0.2, -8]],
    'L.el': [[0.2, 34]],
    'L.reach': [[0.2, 0.36]],
    'L.elbow': [[0.2, 22]],
    'L.grip': [[0.1, 1]],
  },
  cues: [{ t: 0.02, cue: 'servo', value: 0.3 }],
}
