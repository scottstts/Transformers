import type { CircleCollider, SegmentCollider } from '../types'

/** Small stand-off from scenery, in metres; tangent travel remains possible. */
const CLEARANCE = 0.002

/**
 * Continuous circle sweep along a unit direction, against circles and wall
 * capsules expanded by the robot radius. Bounds the whole burst at launch,
 * so a thin wall cannot be skipped even at 30 Hz. No stepping or allocation.
 */
export function flashClearance(x: number, z: number, dx: number, dz: number, distance: number, radius: number,
  circles: readonly CircleCollider[], segments: readonly SegmentCollider[]): number {
  let reach = distance
  for (const c of circles) {
    if (c.r <= 0) continue
    reach = Math.min(reach, circleEntry(x - c.x, z - c.z, dx, dz, radius + c.r))
  }
  for (const s of segments) {
    const ex = s.bx - s.ax, ez = s.bz - s.az
    const length = Math.hypot(ex, ez)
    const r = radius + s.r
    reach = Math.min(reach, circleEntry(x - s.ax, z - s.az, dx, dz, r), circleEntry(x - s.bx, z - s.bz, dx, dz, r))
    if (length < 1e-6) continue
    const ux = ex / length, uz = ez / length
    const along = (x - s.ax) * ux + (z - s.az) * uz
    const across = (x - s.ax) * -uz + (z - s.az) * ux
    const speed = dx * -uz + dz * ux
    if (Math.abs(speed) < 1e-8) continue
    // Already against the strip: allow moving away, block moving into it.
    if (along >= 0 && along <= length && Math.abs(across) < r && across * speed < 0) return 0
    for (let side = -1; side <= 1; side += 2) {
      if (speed * side >= 0) continue
      const t = (side * r - across) / speed
      if (t < 0 || t > reach) continue
      const station = along + t * (dx * ux + dz * uz)
      if (station >= 0 && station <= length) reach = t
    }
  }
  return Math.max(0, reach < distance ? reach - CLEARANCE : distance)
}

function circleEntry(x: number, z: number, dx: number, dz: number, r: number): number {
  const toward = x * dx + z * dz
  const outside = x * x + z * z - r * r
  if (outside <= 0) return toward < 0 ? 0 : Infinity
  if (toward >= 0) return Infinity
  const discriminant = toward * toward - outside
  return discriminant > 0 ? -toward - Math.sqrt(discriminant) : Infinity
}
