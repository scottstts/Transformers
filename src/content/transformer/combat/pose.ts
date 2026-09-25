import type { GaitLeg } from '../model/rig'

/**
 * The fighting pose as one flat vector of named channels, so a move can start
 * from whatever the last one left (capture), ease anything it does not key
 * back to neutral, and blend with the gait by a single weight.
 *
 * Units and frames (authoring frame: x = robot left, -y = forward, z = up):
 *  - pelvis: `hipX` shift (m, + toward the robot's left), `hipDrop` (m, down),
 *    `hipPitch` (deg, + leans forward), `hipRoll` (deg, + drops the left hip),
 *    `hipYaw` (deg, + turns the hips to the left);
 *  - `spine*`, `chest*`, `head*`: Euler X / Y / Z on top of the stand (deg;
 *    X + bends forward, Y + tilts the top toward the robot's left, Z + turns left);
 *  - arms, per side, relative to that shoulder in the chest frame and mirrored
 *    so a number means the same on either side: `az` (deg, 0 straight ahead,
 *    + outward, - across the body), `el` (deg, -90 hanging, 0 level, 90 up),
 *    `reach` (share of the arm's full length), `elbow` (deg, roll of the elbow
 *    about the shoulder-hand line, + outward and up), `wx / wy / wz` (wrist,
 *    deg) and `grip` (0 the stand's open hand, 1 a closed fist);
 *  - weapon, for the main hand, in the body frame (the robot's heading, at
 *    the pelvis; the torso's twist and lean do not turn it): the grip point
 *    from the main shoulder's rest place in arm lengths (`w.x` + outward,
 *    `w.y` + forward, `w.z` + up), its
 *    orientation (deg: `w.yaw` + toward the outer side, `w.pitch` + tips the
 *    head forward, `w.roll` about the haft) from upright with the edge facing
 *    forward, `w.wield` (0..1 the main hand is driven by the weapon) and
 *    `w.two` (0..1 the other hand on the off grip);
 *  - `R.heel` / `L.heel` (deg): heel raised, pivoting on the toe;
 *  - root motion in the move's ground frame: `advance` (m, forward), `strafe`
 *    (m, + left), `turn` (deg, + left) and `air` (m, the lowest foot's height);
 *  - free legs, per side: `free` (0..1) hands the foot from the ground planner
 *    to a target carried with the body, `lx` (m, + outward of its stance
 *    station), `ly` (m, + forward), `lz` (m, up from the ground under the
 *    lowest foot) and `lp` (deg, + toe down). A leap or a dash too fast to step
 *    carries its feet this way; the planner re-plants them where they land.
 */
export const CHANNEL_NAMES = [
  'hipX', 'hipDrop', 'hipPitch', 'hipRoll', 'hipYaw',
  'spineX', 'spineY', 'spineZ', 'chestX', 'chestY', 'chestZ', 'headX', 'headY', 'headZ',
  'R.az', 'R.el', 'R.reach', 'R.elbow', 'R.wx', 'R.wy', 'R.wz', 'R.grip',
  'L.az', 'L.el', 'L.reach', 'L.elbow', 'L.wx', 'L.wy', 'L.wz', 'L.grip',
  'w.x', 'w.y', 'w.z', 'w.yaw', 'w.pitch', 'w.roll', 'w.wield', 'w.two',
  'R.heel', 'L.heel', 'advance', 'strafe', 'turn', 'air',
  'R.free', 'R.lx', 'R.ly', 'R.lz', 'R.lp', 'L.free', 'L.lx', 'L.ly', 'L.lz', 'L.lp',
] as const

export type Channel = typeof CHANNEL_NAMES[number]
export const CHANNELS = CHANNEL_NAMES.length
export const CH = Object.fromEntries(CHANNEL_NAMES.map((name, i) => [name, i])) as Record<Channel, number>

/** Per-side offset of the eight arm channels: az, el, reach, elbow, wx, wy, wz, grip. */
export const ARM = { R: CH['R.az'], L: CH['L.az'] } as const
export const WEAPON = CH['w.x']
/** Per-side offset of the five free-leg channels: free, lx, ly, lz, lp. */
export const LEG = { R: CH['R.free'], L: CH['L.free'] } as const
/** Channels a move carries across into the next one rather than easing to neutral. */
export const ROOT_CHANNELS: ReadonlySet<number> = new Set([CH.advance, CH.strafe, CH.turn])

export type Side = 'R' | 'L'
export const SIDES = ['R', 'L'] as const

/** A foot target in the model frame: lateral x (m, + left), `step` ahead of its station, lift, pitch and yaw (rad). */
export interface CombatLeg extends GaitLeg {
  x: number
  yaw: number
}

/** The combat pose handed to the rig: channel values and the planted / stepping feet. */
export interface CombatPose {
  readonly v: Float32Array
  readonly legs: Record<Side, CombatLeg>
}

export function createCombatPose(): CombatPose {
  return {
    v: new Float32Array(CHANNELS),
    legs: { R: { x: 0, step: 0, up: 0, pitch: 0, yaw: 0 }, L: { x: 0, step: 0, up: 0, pitch: 0, yaw: 0 } },
  }
}
