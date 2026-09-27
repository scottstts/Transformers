import type { Vector3 } from 'three/webgpu'

/**
 * The ground's height field: what the car's wheels, the robot's feet, the
 * camera and every effect that meets the ground stand on. The world supplies
 * it; a flat world is `FLAT_GROUND`.
 */
export interface Ground {
  /** height of the ground (m) at a world point */
  height(x: number, z: number): number
}

export const FLAT_GROUND: Ground = { height: () => 0 }

/** Finite-difference step for gradients (m): finer than any feature the ground carries. */
const STEP = 0.35

/** The ground's upward unit normal at (x, z), into `out`. */
export function groundNormal(ground: Ground, x: number, z: number, out: Vector3): Vector3 {
  const hx = (ground.height(x + STEP, z) - ground.height(x - STEP, z)) / (2 * STEP)
  const hz = (ground.height(x, z + STEP) - ground.height(x, z - STEP)) / (2 * STEP)
  return out.set(-hx, 1, -hz).normalize()
}

/** Steepest the ground ever gets (rise per metre), with margin: bounds a ray march's step. */
const MAX_SLOPE = 0.6

/**
 * Distance along a unit ray to where it meets the ground, or Infinity within
 * `range`. Marches by the vertical clearance over the steepest slope (it can
 * never step through the surface), then refines the crossing by bisection.
 */
export function groundRay(ground: Ground, from: Vector3, dir: Vector3, range: number): number {
  const horizontal = Math.hypot(dir.x, dir.z)
  const closing = Math.max(1e-3, -dir.y + horizontal * MAX_SLOPE)
  let t = 0
  let above = from.y - ground.height(from.x, from.z)
  if (above <= 0) return 0
  for (let i = 0; i < 96 && t < range; i++) {
    const step = Math.min(25, Math.max(0.05, above / closing))
    const next = Math.min(range, t + step)
    const h = from.y + dir.y * next - ground.height(from.x + dir.x * next, from.z + dir.z * next)
    if (h <= 0) {
      let a = t, b = next
      for (let k = 0; k < 12; k++) {
        const m = (a + b) * 0.5
        const hm = from.y + dir.y * m - ground.height(from.x + dir.x * m, from.z + dir.z * m)
        if (hm > 0) a = m
        else b = m
      }
      return (a + b) * 0.5
    }
    if (next >= range) break
    t = next
    above = h
  }
  return Infinity
}

/** Put `v` at `lift` m over the ground under it (an effect placed by height above the sand). */
export function onGround(ground: Ground, v: Vector3, lift = 0): Vector3 {
  v.y = ground.height(v.x, v.z) + lift
  return v
}
