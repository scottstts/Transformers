import type { RigDims } from '../asset/format'
import type { CombatMove } from './moves'

/** The complete burst, including its landing; controls return at this boundary (s). */
export const FLASH_TIME = 0.18
/** Requested travel as a multiple of the transformer's measured standing height. */
export const FLASH_HEIGHTS = 2.5
/** Half-width of the crowd impact front, in standing heights; independent of the body collider. */
export const FLASH_HALF_WIDTH = 0.65
/** Nominal forward kick (m/s), varied across the crowd before weight is applied. */
export const FLASH_KNOCK = 18
/** Nominal upward kick (m/s), varied independently before weight is applied. */
export const FLASH_LIFT = 4.5

/**
 * Shared dash fitted to each rig's leg length and standing height. Free feet
 * travel with the body instead of stretching planted legs across the burst;
 * the lead foot receives the landing while the rear leg trails. Translation
 * is owned by RobotCombat's swept trajectory, independently of pose blending.
 */
export function flashMove(d: RigDims): CombatMove {
  const leg = d.thigh + d.shin
  return {
    name: 'flash',
    duration: FLASH_TIME,
    chain: [FLASH_TIME, FLASH_TIME],
    keys: {
      turn: [[0.035, 0]],
      hipX: [[0.045, 0]],
      hipRoll: [[0.045, 0]],
      hipYaw: [[0.045, 0]],
      spineY: [[0.045, 0]],
      spineZ: [[0.045, 0]],
      chestY: [[0.045, 0]],
      chestZ: [[0.045, 0]],
      headY: [[0.045, 0]],
      headZ: [[0.045, 0]],
      hipDrop: [[0.035, leg * 0.065], [0.13, leg * 0.08], [FLASH_TIME, leg * 0.025]],
      hipPitch: [[0.04, 14], [0.12, 14], [FLASH_TIME, 3]],
      spineX: [[0.045, 7], [0.12, 7], [FLASH_TIME, 0]],
      chestX: [[0.05, 8], [0.12, 8], [FLASH_TIME, 1]],
      headX: [[0.045, -8], [0.12, -8], [FLASH_TIME, 0]],
      'R.az': [[0.045, 28], [0.13, 28]],
      'R.el': [[0.045, -32], [0.13, -32]],
      'R.reach': [[0.045, 0.86], [0.13, 0.86]],
      'R.elbow': [[0.045, 18]],
      'R.grip': [[0.035, 0.5]],
      'R.out': [[0.035, 0]],
      'R.wx': [[0.045, 0]],
      'R.wy': [[0.045, 0]],
      'R.wz': [[0.045, 0]],
      'L.az': [[0.045, 28], [0.13, 28]],
      'L.el': [[0.045, -32], [0.13, -32]],
      'L.reach': [[0.045, 0.86], [0.13, 0.86]],
      'L.elbow': [[0.045, 18]],
      'L.grip': [[0.035, 0.5]],
      'L.out': [[0.035, 0]],
      'L.wx': [[0.045, 0]],
      'L.wy': [[0.045, 0]],
      'L.wz': [[0.045, 0]],
      'w.wield': [[0.025, 0]],
      'w.two': [[0.025, 0]],
      'R.free': [[0.001, 1]],
      'L.free': [[0.001, 1]],
      'R.ly': [[0.045, leg * 0.06], [0.12, leg * 0.04], [FLASH_TIME, 0]],
      'L.ly': [[0.045, -leg * 0.16], [0.12, -leg * 0.12], [FLASH_TIME, 0]],
      'R.lz': [[0.045, leg * 0.035], [0.12, leg * 0.025], [FLASH_TIME, 0]],
      'L.lz': [[0.045, leg * 0.10], [0.12, leg * 0.07], [FLASH_TIME, 0]],
      'L.lp': [[0.045, 18], [0.12, 12], [FLASH_TIME, 0]],
      'R.heel': [[0.02, 0]],
      'L.heel': [[0.02, 0]],
    },
    cues: [{ t: 0, cue: 'weapon-out', value: 0.05 }, { t: 0, cue: 'servo', value: FLASH_TIME }],
  }
}
