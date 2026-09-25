import type { CircleCollider, SegmentCollider } from './types'

/** The push that last resolved an overlap: its unit normal (x, z) and depth (m). */
export interface Contact { nx: number; nz: number; depth: number }

/**
 * Push a circle (centre `p`, radius r) out of the capsules and circles it
 * overlaps; returns the deepest contact's normal (or null). Capsules are the
 * walls and building sides, circles the round things. Moves `p` in place.
 */
export function pushOut(p: { x: number; z: number }, r: number, segments: readonly SegmentCollider[], circles: readonly CircleCollider[], out: Contact): Contact | null {
  let hit = false
  out.depth = 0
  for (const s of segments) {
    const ex = s.bx - s.ax, ez = s.bz - s.az
    const len2 = ex * ex + ez * ez
    let t = len2 > 0 ? ((p.x - s.ax) * ex + (p.z - s.az) * ez) / len2 : 0
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const dx = p.x - (s.ax + ex * t), dz = p.z - (s.az + ez * t)
    const d = Math.hypot(dx, dz)
    const min = s.r + r
    if (d < min && d > 1e-5) {
      const depth = min - d
      p.x += (dx / d) * depth
      p.z += (dz / d) * depth
      if (depth > out.depth) { out.nx = dx / d; out.nz = dz / d; out.depth = depth }
      hit = true
    }
  }
  for (const c of circles) {
    if (c.r <= 0) continue
    const dx = p.x - c.x, dz = p.z - c.z
    const d = Math.hypot(dx, dz)
    const min = c.r + r
    if (d < min && d > 1e-5) {
      const depth = min - d
      p.x += (dx / d) * depth
      p.z += (dz / d) * depth
      if (depth > out.depth) { out.nx = dx / d; out.nz = dz / d; out.depth = depth }
      hit = true
    }
  }
  return hit ? out : null
}
