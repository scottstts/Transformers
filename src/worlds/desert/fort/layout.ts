import type { SegmentCollider } from '../../../game/types'
import { sectorAt, type FortPlan, type Module, type ModuleKind, type Xz } from './plan'

/**
 * Laying the districts' modules out on their ground (districts.ts). Every
 * module is an oriented rectangle; a module is placed only where it fits:
 * wholly inside one district, clear of every wall line by that wall's own
 * margin (a T-wall's footing and a lane for a soldier behind it; the
 * rampart's whole body and its foot), off the reserved yards, lanes and
 * aprons, and clear of everything already placed. What doesn't fit is tried
 * elsewhere or left out, so seed variation never has to repair a layout.
 * Each placed module adds its colliders (by kind).
 */

/** Room kept between a module and a T-wall's line, and the rampart's foot line (m). */
const WALL_CLEAR = 4.5
const RAMPART_CLEAR = 7.5

/** Whether (x, z) lies inside the polygon `c`. */
export function insidePolygon(c: readonly Xz[], x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const [xi, zi] = c[i], [xj, zj] = c[j]
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

export function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const rot = (p: Xz, yaw: number): Xz => [p[0] * Math.cos(yaw) + p[1] * Math.sin(yaw), -p[0] * Math.sin(yaw) + p[1] * Math.cos(yaw)]
export const add = (a: Xz, b: Xz): Xz => [a[0] + b[0], a[1] + b[1]]

/** Box collider as four capsule segments (radius r) around a rotated rectangle. */
export function boxSegments(at: Xz, yaw: number, w: number, d: number, r = 0.2): SegmentCollider[] {
  const hw = w / 2 - r, hd = d / 2 - r
  const c = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map((p) => add(at, rot(p as Xz, yaw)))
  return c.map((p, i) => ({ ax: p[0], az: p[1], bx: c[(i + 1) % 4][0], bz: c[(i + 1) % 4][1], r }))
}

/** An oriented rectangle with its corners and bounding radius worked out once. */
interface Obb { c: Xz; yaw: number; hw: number; hd: number; pts: Xz[]; r: number }

function obb(c: Xz, yaw: number, hw: number, hd: number): Obb {
  const pts = ([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as Xz[]).map((p) => add(c, rot(p, yaw)))
  return { c, yaw, hw, hd, pts, r: Math.hypot(hw, hd) }
}

/** Separating-axis overlap of two oriented rectangles. */
function overlaps(a: Obb, b: Obb): boolean {
  if (Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1]) > a.r + b.r) return false
  for (const o of [a, b]) {
    const s = Math.sin(o.yaw), co = Math.cos(o.yaw)
    for (const [ax, az] of [[co, -s], [s, co]]) {
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity
      for (const p of a.pts) { const d = p[0] * ax + p[1] * az; a0 = Math.min(a0, d); a1 = Math.max(a1, d) }
      for (const p of b.pts) { const d = p[0] * ax + p[1] * az; b0 = Math.min(b0, d); b1 = Math.max(b1, d) }
      if (a1 < b0 || b1 < a0) return false
    }
  }
  return true
}

/** Distance from a point to a rectangle (0 inside). */
function pointToObb(p: Xz, o: Obb): number {
  const l = rot([p[0] - o.c[0], p[1] - o.c[1]], -o.yaw)
  return Math.hypot(Math.max(0, Math.abs(l[0]) - o.hw), Math.max(0, Math.abs(l[1]) - o.hd))
}

function pointToSegment(p: Xz, a: Xz, b: Xz): number {
  const dx = b[0] - a[0], dz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t)
}

/** Distance between a rectangle and a segment (0 if they cross). */
function segmentToObb(a: Xz, b: Xz, o: Obb): number {
  let d = Math.min(pointToObb(a, o), pointToObb(b, o))
  for (const p of o.pts) d = Math.min(d, pointToSegment(p, a, b))
  if (d > 0) {
    // a segment crossing the rectangle without an end or corner near it
    const l0 = rot([a[0] - o.c[0], a[1] - o.c[1]], -o.yaw), l1 = rot([b[0] - o.c[0], b[1] - o.c[1]], -o.yaw)
    for (let t = 0; t <= 1; t += 0.125) {
      const x = l0[0] + (l1[0] - l0[0]) * t, z = l0[1] + (l1[1] - l0[1]) * t
      if (Math.abs(x) <= o.hw && Math.abs(z) <= o.hd) return 0
    }
  }
  return d
}

/** Modules that only stand on posts (the ground under them stays free to walk and to build on). */
const OVERHEAD = new Set<ModuleKind>(['sail'])

interface WallLine { a: Xz; b: Xz; clear: number; box: [number, number, number, number] }

export class Layout {
  readonly modules: Module[] = []
  private readonly taken: Obb[] = []
  private readonly clearings: Array<{ c: Xz; r: number }> = []
  private readonly lines: WallLine[] = []
  private readonly plan: FortPlan
  readonly rand: () => number

  constructor(plan: FortPlan, rand: () => number) {
    this.plan = plan
    this.rand = rand
    const line = (a: Xz, b: Xz, clear: number): void => {
      this.lines.push({ a, b, clear, box: [Math.min(a[0], b[0]) - clear, Math.min(a[1], b[1]) - clear, Math.max(a[0], b[0]) + clear, Math.max(a[1], b[1]) + clear] })
    }
    const ring = (pts: readonly Xz[], clear: number): void => pts.forEach((p, i) => line(p, pts[(i + 1) % pts.length], clear))
    ring(plan.corners, WALL_CLEAR)
    ring(plan.citadel, RAMPART_CLEAR)
    for (const [a, b] of plan.spokes) line(a, b, WALL_CLEAR)
    // every gate's lane stays open either side of it
    for (const g of plan.gates) {
      const yaw = Math.atan2(g.out[0], g.out[1])
      this.reserve(g.at, yaw, g.width + 4, 2 * (g.kind === 'citadel' ? 30 : 16))
    }
    for (const m of plan.modules) this.fixed(m, 0.5)
  }

  /** Keep a rectangle free of modules (hangars' aprons, the lanes, the roads). */
  reserve(at: Xz, yaw: number, w: number, d: number): void {
    this.taken.push(obb(at, yaw, w / 2, d / 2))
  }

  /** Keep a circle free (a yard to fight in). */
  clear(at: Xz, r: number): void {
    this.clearings.push({ c: at, r })
  }

  /** Whether `m` (grown by `pad` all round) fits: in one district, clear of its walls, the clearings and everything placed. */
  fits(m: Module, pad: number): boolean {
    const o = obb(m.at, m.yaw, m.size[0] / 2 + pad, m.size[2] / 2 + pad)
    const sector = sectorAt(this.plan, m.at[0], m.at[1])
    if (sector === this.plan.sectors.length) return false
    for (const p of o.pts) if (sectorAt(this.plan, p[0], p[1]) !== sector) return false
    for (const l of this.lines) {
      if (o.c[0] + o.r < l.box[0] || o.c[0] - o.r > l.box[2] || o.c[1] + o.r < l.box[1] || o.c[1] - o.r > l.box[3]) continue
      if (segmentToObb(l.a, l.b, o) < l.clear) return false
    }
    for (const c of this.clearings) if (pointToObb(c.c, o) < c.r) return false
    if (OVERHEAD.has(m.kind)) return true
    for (const t of this.taken) if (overlaps(o, t)) return false
    return true
  }

  /** Place `m` if it fits (see `fits`); returns whether it was placed. */
  place(m: Module, pad = 1): boolean {
    if (!this.fits(m, pad)) return false
    this.commit(m, pad)
    return true
  }

  /** Place `m` where the plan puts it (towers, gate furniture), taking its ground. */
  fixed(m: Module, pad = 0.5): void {
    this.commit(m, pad)
  }

  /** Lay `m` without checks or colliders (outside the walls, a stacked container, paving on reserved ground). */
  outside(m: Module): void {
    this.modules.push(m)
  }

  /**
   * All of `ms` or none (a row of housing units, a depot and its tanks, a
   * canopy and what it shelters). The members are composed by the caller, so
   * they are checked only against what is already placed, not each other.
   */
  group(ms: Module[], pad = 1): boolean {
    for (const m of ms) if (!this.fits(m, pad)) return false
    for (const m of ms) this.commit(m, pad)
    return true
  }

  private commit(m: Module, pad: number): void {
    this.modules.push(m)
    if (!OVERHEAD.has(m.kind) && m.kind !== 'apron') this.taken.push(obb(m.at, m.yaw, m.size[0] / 2 + pad, m.size[2] / 2 + pad))
    this.collide(m)
  }

  /** The colliders a module stands in the way with. */
  private collide(m: Module): void {
    const [w, , d] = m.size
    const circles = this.plan.circles, segments = this.plan.segments
    const circle = (at: Xz, r: number): void => { circles.push({ x: at[0], z: at[1], r }) }
    const local = (x: number, z: number): Xz => add(m.at, rot([x, z], m.yaw))
    const seg = (a: Xz, b: Xz, r: number): void => { segments.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], r }) }
    switch (m.kind) {
      case 'tower': circle(m.at, 2.6); break
      case 'mast': circle(m.at, 0.6); break
      case 'pole': circle(m.at, 0.25); break
      case 'flagpole': circle(m.at, 0.5); break
      case 'radioMast': circle(m.at, 1.4); break
      case 'radar': circle(m.at, 7.3); break
      case 'boom': circle(local(0, 0), 0.4); break
      case 'drums': case 'tires': case 'waterTank': circle(m.at, Math.max(w, d) / 2); break
      case 'waterTower': for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) circle(local(x * w * 0.4, z * d * 0.4), 0.35); break
      case 'sail': for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) circle(local(x * w / 2, z * d / 2), 0.2); break
      case 'canopy': {
        const bays = Math.max(1, Math.round(w / 6))
        for (let i = 0; i <= bays; i++) for (const z of [-1, 1]) circle(local(-w / 2 + (i * w) / bays, z * d / 2), 0.3)
        break
      }
      case 'helipad': case 'apron': case 'gatehouse': break
      case 'hesco': case 'blastWall': case 'sandbags': {
        seg(local(-w / 2 + d / 2, 0), local(w / 2 - d / 2, 0), d / 2)
        break
      }
      case 'garage': {
        // the front stays open across the bays whose doors are up (variant: a bit per bay)
        const bays = 3, bay = w / bays, r = 0.3
        const hw = w / 2 - r, hd = d / 2 - r
        seg(local(-hw, -hd), local(hw, -hd), r)
        seg(local(hw, -hd), local(hw, hd), r)
        seg(local(-hw, hd), local(-hw, -hd), r)
        let from = -hw
        for (let i = 0; i < bays; i++) {
          if (!(m.variant & (1 << i))) continue
          const x0 = -w / 2 + (i + 0.5) * bay - GARAGE_DOOR / 2
          if (x0 - from > 0.05) seg(local(from, hd), local(x0, hd), r)
          from = x0 + GARAGE_DOOR
        }
        if (hw - from > 0.05) seg(local(from, hd), local(hw, hd), r)
        break
      }
      case 'keep': {
        const r = 0.35, hw = w / 2 - r, hd = d / 2 - r, bay = KEEP_BAY / 2 + 0.4
        seg(local(-hw, -hd), local(hw, -hd), r)
        seg(local(hw, -hd), local(hw, hd), r)
        seg(local(-hw, hd), local(-hw, -hd), r)
        seg(local(hw, hd), local(bay, hd), r)
        seg(local(-bay, hd), local(-hw, hd), r)
        // the bay's own walls inside, and the blast door parked open on the facade
        seg(local(bay, hd), local(bay, hd - KEEP_BAY_DEPTH), r)
        seg(local(-bay, hd), local(-bay, hd - KEEP_BAY_DEPTH), r)
        seg(local(-bay, hd - KEEP_BAY_DEPTH), local(bay, hd - KEEP_BAY_DEPTH), r)
        seg(local(bay, d / 2 + 0.45), local(bay + KEEP_BAY + 0.6, d / 2 + 0.45), 0.3)
        break
      }
      case 'bund': segments.push(...boxSegments(m.at, m.yaw, w, d, 0.35)); break
      default: segments.push(...boxSegments(m.at, m.yaw, w, d, Math.min(0.3, w / 4, d / 4)))
    }
  }

  /** Place `make(at, yaw)` wherever it first fits in `sector`, scanning its bounds from `near` outward; whether it was placed. */
  anywhere(sector: number, near: Xz, make: (at: Xz) => Module, pad: number): boolean {
    const b = this.plan.sectors[sector].bounds
    for (let r = 0; r < b.r * 1.5; r += 3) {
      const steps = Math.max(1, Math.ceil((2 * Math.PI * r) / 4))
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2
        const at: Xz = [near[0] + Math.sin(a) * r, near[1] + Math.cos(a) * r]
        if (sectorAt(this.plan, at[0], at[1]) !== sector) continue
        if (this.place(make(at), pad)) return true
      }
    }
    return false
  }

  /** Whether a module of `kind` has been placed. */
  has(kind: ModuleKind): boolean {
    return this.modules.some((m) => m.kind === kind)
  }
}

/** A garage's roll-up door width, and the keep's vehicle bay: opening and depth (m); the builders use the same. */
export const GARAGE_DOOR = 5.6
export const KEEP_BAY = 9
export const KEEP_BAY_DEPTH = 12
