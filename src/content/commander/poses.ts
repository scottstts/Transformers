import { pose } from '../soldier/poses'
import type { UnitPoses } from '../../game/enemies/soldier'

/**
 * The commander's key poses on the soldier's channels (poses.ts; its rig,
 * rig.ts, measures the right arm from a hanging arm, as the left).
 *
 * The lance is gripped 2.7 m from its tip with 4.2 m of shaft behind the
 * fist, and the fist's grip runs across it (a hammer grip: the shaft leaves
 * the thumb side toward the tip). So the shaft is level when the forearm
 * hangs; the wrist and the forearm's angle tip it up or down. Every pose
 * keeps the fist out to the right (or well in front) so the long butt runs
 * back outside the skirt plates. The arm channels came out of
 * `node tools/commander-probe.mjs solve`, which fits them to a fist place
 * and a shaft direction and keeps the shaft and forearm off the body;
 * `pose all` prints where each pose puts the shaft.
 */
/**
 * Squared up to fight: low on a staggered stance, the lance levelled at the
 * enemy (20 degrees up, the point 3.5 m out and turned in toward the line
 * ahead), the free hand up in front as a guard.
 */
const READY = pose({
  crouch: 0.3, lean: 8, twist: -8, headPitch: 6, headYaw: 6,
  'R.pitch': 5, 'R.out': 31, 'R.twist': -8, 'R.elbow': 46, 'R.wrist': -28, 'R.wristYaw': -4, 'R.wristRoll': 0,
  'L.pitch': 50, 'L.out': 20, 'L.elbow': 70, 'L.wrist': 10,
  'L.fwd': 0.6, 'L.lat': 0.1, 'R.fwd': -0.5, 'R.lat': 0.1, 'L.yaw': 8, 'R.yaw': -14,
})

export const COMMANDER_POSES: UnitPoses = {
  /**
   * At peace: upright, the lance carried at a slope (about 50 degrees, the
   * point up and ahead), the fist at the hip, the free hand loose.
   */
  guard: pose({
    crouch: 0.06, lean: 2, headPitch: 3,
    'R.pitch': -31, 'R.out': 22, 'R.twist': 8, 'R.elbow': 83, 'R.wrist': -12, 'R.wristYaw': 1, 'R.wristRoll': 10,
    'L.pitch': 6, 'L.out': 12, 'L.elbow': 24, 'L.wrist': 6,
    'R.fwd': -0.06, 'L.fwd': 0.08, 'L.yaw': 6, 'R.yaw': -6,
  }),
  ready: READY,
  /** Charging: crouched into the speed, the lance couched low and level like a lance at the tilt. */
  roll: pose({
    crouch: 0.38, lean: 17, twist: -6, headPitch: -8,
    'R.pitch': 12, 'R.out': 30, 'R.twist': -6, 'R.elbow': 40, 'R.wrist': -33, 'R.wristYaw': -5, 'R.wristRoll': 2,
    'L.pitch': 24, 'L.out': 16, 'L.elbow': 56, 'L.wrist': 6,
    'L.fwd': 0.5, 'L.lat': 0.06, 'R.fwd': -0.4, 'R.lat': 0.06,
  }),
  // the soldier's single slash: the commander fights with its combo (combo.ts) instead, so these hold the ready stance
  windup: READY,
  strike: READY,
  /** A blow to the head and chest: snapped back, the lance flung up and out, the free arm thrown wide. */
  hitHigh: pose({
    crouch: 0.24, lean: -14, bend: -8, side: 5, twist: 12, headPitch: -20, headYaw: -12,
    'R.pitch': -42, 'R.out': 42, 'R.elbow': 72, 'R.wrist': -24, 'R.wristYaw': -2, 'R.wristRoll': 6,
    'L.pitch': 70, 'L.out': 46, 'L.elbow': 50, 'L.wrist': 20,
    'L.fwd': 0.3, 'L.lat': 0.08, 'R.fwd': -0.55, 'R.lat': 0.12, 'L.yaw': 10, 'R.yaw': -18,
  }),
  /** A blow to the body: doubled over and turned away, the lance dropped level, the free arm pulled in. */
  hitLow: pose({
    crouch: 0.46, lean: 24, bend: 14, side: -6, twist: -16, headPitch: 18, headYaw: 10,
    'R.pitch': 4, 'R.out': 36, 'R.twist': -12, 'R.elbow': 66, 'R.wrist': -34, 'R.wristYaw': -5, 'R.wristRoll': 1,
    'L.pitch': 34, 'L.out': 2, 'L.elbow': 96, 'L.wrist': 10,
    'L.fwd': 0.5, 'L.lat': 0.05, 'R.fwd': -0.36, 'R.lat': 0.07, 'L.yaw': 8, 'R.yaw': -8,
  }),
  /** Flat on its back: legs free and bent, the lance arm flung out to the side, the shaft lying along it. */
  down: pose({
    headPitch: 18,
    'R.pitch': 10, 'R.out': 70, 'R.elbow': 20, 'R.wrist': -20, 'L.pitch': 40, 'L.out': 70, 'L.elbow': 50,
    'R.thigh': 30, 'R.knee': 60, 'L.thigh': 14, 'L.knee': 30, legsFree: 1,
  }),
  /** Thrown: limbs loose, the lance arm up and out of the way. */
  flung: pose({
    lean: -10, bend: -12, headPitch: 22,
    'R.pitch': 40, 'R.out': 60, 'R.elbow': 30, 'R.wrist': -20, 'L.pitch': 90, 'L.out': 55, 'L.elbow': 20,
    'R.thigh': 40, 'R.knee': 70, 'L.thigh': -10, 'L.knee': 40, legsFree: 1,
  }),
}
