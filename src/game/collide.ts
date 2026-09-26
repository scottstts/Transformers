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

/**
 * Static colliders binned on a square grid, so a body tests only what stands
 * near it: a fort holds thousands of capsules and circles, and a hundred
 * soldiers each testing all of them every frame cost more than the rest of
 * their simulation. Built once; queries allocate nothing (a stamp per
 * collider dedupes the ones spanning several cells).
 */
export class ColliderGrid {
  private readonly cell: number
  private readonly segments: readonly SegmentCollider[]
  private readonly circles: readonly CircleCollider[]
  private readonly bins = new Map<number, { s: number[]; c: number[] }>()
  private readonly segStamp: Uint32Array
  private readonly circStamp: Uint32Array
  private stamp = 0
  private readonly nearSeg: SegmentCollider[] = []
  private readonly nearCirc: CircleCollider[] = []

  constructor(segments: readonly SegmentCollider[], circles: readonly CircleCollider[], cell = 12) {
    this.cell = cell
    this.segments = segments
    this.circles = circles
    this.segStamp = new Uint32Array(segments.length)
    this.circStamp = new Uint32Array(circles.length)
    segments.forEach((s, i) => this.insert(Math.min(s.ax, s.bx) - s.r, Math.min(s.az, s.bz) - s.r, Math.max(s.ax, s.bx) + s.r, Math.max(s.az, s.bz) + s.r, (b) => b.s.push(i)))
    circles.forEach((c, i) => { if (c.r > 0) this.insert(c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r, (b) => b.c.push(i)) })
  }

  private key(ix: number, iz: number): number {
    return (ix + 32768) * 65536 + (iz + 32768)
  }

  private insert(x0: number, z0: number, x1: number, z1: number, add: (b: { s: number[]; c: number[] }) => void): void {
    const c = this.cell
    for (let ix = Math.floor(x0 / c); ix <= Math.floor(x1 / c); ix++) {
      for (let iz = Math.floor(z0 / c); iz <= Math.floor(z1 / c); iz++) {
        const k = this.key(ix, iz)
        let b = this.bins.get(k)
        if (!b) this.bins.set(k, b = { s: [], c: [] })
        add(b)
      }
    }
  }

  /** Push a circle out of what stands near it (see `pushOut`). */
  pushOut(p: { x: number; z: number }, r: number, out: Contact): Contact | null {
    const segs = this.nearSeg
    const circs = this.nearCirc
    segs.length = 0
    circs.length = 0
    const stamp = ++this.stamp
    const c = this.cell
    for (let ix = Math.floor((p.x - r) / c); ix <= Math.floor((p.x + r) / c); ix++) {
      for (let iz = Math.floor((p.z - r) / c); iz <= Math.floor((p.z + r) / c); iz++) {
        const b = this.bins.get(this.key(ix, iz))
        if (!b) continue
        for (const i of b.s) if (this.segStamp[i] !== stamp) { this.segStamp[i] = stamp; segs.push(this.segments[i]) }
        for (const i of b.c) if (this.circStamp[i] !== stamp) { this.circStamp[i] = stamp; circs.push(this.circles[i]) }
      }
    }
    if (!segs.length && !circs.length) return null
    return pushOut(p, r, segs, circs, out)
  }
}
