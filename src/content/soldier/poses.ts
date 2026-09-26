import type { SoldierPose } from './rig'

/**
 * The soldier's animation as one flat vector of named channels (degrees and
 * metres, the rig's conventions), so behaviour can ease toward a key pose,
 * blend two, and lay spring-driven hit reactions on top, all without
 * allocating. `writePose` hands the vector to the rig.
 */
export const SOLDIER_CHANNELS = [
  'crouch', 'lean', 'roll', 'bend', 'side', 'twist', 'headPitch', 'headYaw',
  'R.pitch', 'R.out', 'R.twist', 'R.elbow', 'R.wrist', 'R.wristYaw', 'R.wristRoll',
  'L.pitch', 'L.out', 'L.twist', 'L.elbow', 'L.wrist', 'L.wristYaw', 'L.wristRoll',
  'R.fwd', 'R.lat', 'R.lift', 'R.yaw', 'L.fwd', 'L.lat', 'L.lift', 'L.yaw',
  'R.thigh', 'R.knee', 'L.thigh', 'L.knee', 'legsFree',
] as const

export type SoldierChannel = typeof SOLDIER_CHANNELS[number]
export const SC = Object.fromEntries(SOLDIER_CHANNELS.map((n, i) => [n, i])) as Record<SoldierChannel, number>
export const SOLDIER_CHANNEL_COUNT = SOLDIER_CHANNELS.length

function pose(values: Partial<Record<SoldierChannel, number>>): Float32Array {
  const v = new Float32Array(SOLDIER_CHANNEL_COUNT)
  for (const [k, x] of Object.entries(values)) v[SC[k as SoldierChannel]] = x as number
  return v
}

/**
 * Key poses. The blade is in the right hand; the hilt runs through the fist
 * along the hand's forward axis. Shoulder pitch, elbow and wrist all turn it
 * in the same plane, so with the arm in front of the body the blade's
 * elevation above horizontal is their sum (a hanging arm holds it level).
 */
export const POSES = {
  /** at a post: weight on both wheels, the blade lowered forward, the free hand loose */
  guard: pose({
    crouch: 0.07, lean: 3, headPitch: 4,
    'R.pitch': 12, 'R.out': 16, 'R.elbow': 34, 'R.wrist': -72,
    'L.pitch': 6, 'L.out': 13, 'L.elbow': 26, 'L.wrist': 8,
    'R.fwd': -0.08, 'L.fwd': 0.1, 'L.yaw': 8, 'R.yaw': -6,
  }),
  /** squared up to fight: low on a staggered stance, the blade up and forward, the free hand guarding */
  ready: pose({
    crouch: 0.26, lean: 11, twist: -8, headPitch: -6, headYaw: 6,
    'R.pitch': 58, 'R.out': 22, 'R.twist': 12, 'R.elbow': 70, 'R.wrist': -80, 'R.wristRoll': 10,
    'L.pitch': 42, 'L.out': 20, 'L.elbow': 70, 'L.wrist': 10,
    'L.fwd': 0.38, 'L.lat': 0.06, 'R.fwd': -0.34, 'R.lat': 0.08, 'L.yaw': 10, 'R.yaw': -14,
  }),
  /** skating in a charge: crouched and leaning into it, the blade held low and forward, the free arm swinging forward */
  roll: pose({
    crouch: 0.34, lean: 20, headPitch: -14,
    'R.pitch': 12, 'R.out': 24, 'R.elbow': 36, 'R.wrist': -80,
    'L.pitch': 34, 'L.out': 12, 'L.elbow': 46,
    'L.fwd': 0.28, 'R.fwd': -0.22, 'L.lat': 0.04, 'R.lat': 0.04,
  }),
  /** the slash's wind-up: the blade drawn high over the right shoulder, chest turned away */
  windup: pose({
    crouch: 0.22, lean: -2, twist: -26, bend: -4, side: -6, headPitch: -8, headYaw: 20,
    'R.pitch': 150, 'R.out': 34, 'R.twist': -18, 'R.elbow': 70, 'R.wrist': -34,
    'L.pitch': 54, 'L.out': 14, 'L.elbow': 62, 'L.wrist': 6,
    'L.fwd': 0.44, 'L.lat': 0.08, 'R.fwd': -0.3, 'R.lat': 0.08, 'L.yaw': 12, 'R.yaw': -16,
  }),
  /** the slash's follow-through: down and across, the chest whipped round, body driven forward */
  strike: pose({
    crouch: 0.36, lean: 20, twist: 30, bend: 8, side: 4, headPitch: 4, headYaw: -12,
    'R.pitch': 34, 'R.out': -14, 'R.twist': 26, 'R.elbow': 14, 'R.wrist': -86,
    'L.pitch': 20, 'L.out': 26, 'L.elbow': 40, 'L.wrist': 0,
    'L.fwd': 0.62, 'L.lat': 0.1, 'R.fwd': -0.36, 'R.lat': 0.06, 'L.yaw': 16, 'R.yaw': -10,
  }),
  /**
   * A blow to the head and chest: snapped back from it, the head thrown
   * back, the blade arm flung wide and low, the free forearm up across the
   * face, the rear wheel skidding back under the weight.
   */
  hitHigh: pose({
    crouch: 0.2, lean: -16, bend: -10, side: 5, twist: 12, headPitch: -24, headYaw: -14,
    'R.pitch': 30, 'R.out': 44, 'R.twist': 10, 'R.elbow': 24, 'R.wrist': -60,
    'L.pitch': 96, 'L.out': 18, 'L.elbow': 110, 'L.wrist': 20,
    'L.fwd': 0.3, 'L.lat': 0.06, 'R.fwd': -0.42, 'R.lat': 0.1, 'L.yaw': 12, 'R.yaw': -18,
  }),
  /**
   * A blow to the body: doubled over it and turned away, the head dropped,
   * both arms pulled in to the stomach, low on its knees.
   */
  hitLow: pose({
    crouch: 0.38, lean: 28, bend: 18, side: -6, twist: -18, headPitch: 22, headYaw: 10,
    'R.pitch': 22, 'R.out': 8, 'R.elbow': 76, 'R.wrist': -70,
    'L.pitch': 38, 'L.out': -4, 'L.elbow': 100, 'L.wrist': 10,
    'L.fwd': 0.46, 'L.lat': 0.05, 'R.fwd': -0.3, 'R.lat': 0.07, 'L.yaw': 8, 'R.yaw': -8,
  }),
  /** flat on its back: legs free and bent, arms flung out */
  down: pose({
    crouch: 0, lean: 0, headPitch: 18,
    'R.pitch': 60, 'R.out': 60, 'R.elbow': 30, 'L.pitch': 40, 'L.out': 70, 'L.elbow': 50,
    'R.thigh': 30, 'R.knee': 60, 'L.thigh': 14, 'L.knee': 30, legsFree: 1,
  }),
  /** thrown: limbs flailing loose */
  flung: pose({
    crouch: 0, lean: -10, bend: -12, headPitch: 22,
    'R.pitch': 110, 'R.out': 40, 'R.elbow': 30, 'L.pitch': 90, 'L.out': 55, 'L.elbow': 20,
    'R.thigh': 40, 'R.knee': 70, 'L.thigh': -10, 'L.knee': 40, legsFree: 1,
  }),
} as const

/** out = a + (b - a) * t per channel. */
export function blend(out: Float32Array, a: Float32Array, b: Float32Array, t: number): Float32Array {
  for (let i = 0; i < out.length; i++) out[i] = a[i] + (b[i] - a[i]) * t
  return out
}

/** Ease `cur` toward `target` with a first-order response of `rate` (1/s). */
export function approach(cur: Float32Array, target: Float32Array, rate: number, dt: number): void {
  const k = 1 - Math.exp(-rate * dt)
  for (let i = 0; i < cur.length; i++) cur[i] += (target[i] - cur[i]) * k
}

/** Write a channel vector into the rig's pose. */
export function writePose(v: Float32Array, p: SoldierPose): void {
  p.crouch = v[SC.crouch]
  p.lean = v[SC.lean]
  p.roll = v[SC.roll]
  p.bend = v[SC.bend]
  p.side = v[SC.side]
  p.twist = v[SC.twist]
  p.headPitch = v[SC.headPitch]
  p.headYaw = v[SC.headYaw]
  for (const s of ['R', 'L'] as const) {
    const o = s === 'R' ? SC['R.pitch'] : SC['L.pitch']
    const a = p.arms[s]
    a.pitch = v[o]; a.out = v[o + 1]; a.twist = v[o + 2]; a.elbow = v[o + 3]; a.wrist = v[o + 4]; a.wristYaw = v[o + 5]; a.wristRoll = v[o + 6]
    const f = s === 'R' ? SC['R.fwd'] : SC['L.fwd']
    const foot = p.feet[s]
    foot.fwd = v[f]; foot.lat = v[f + 1]; foot.lift = v[f + 2]; foot.yaw = v[f + 3]
    const l = s === 'R' ? SC['R.thigh'] : SC['L.thigh']
    p.legs[s].pitch = v[l]
    p.legs[s].knee = v[l + 1]
  }
  p.legsFree = v[SC.legsFree]
}
