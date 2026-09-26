import type { CircleCollider, SegmentCollider } from '../../../game/types'
import type { Gate, Module, ModuleKind, Xz } from './plan'

/**
 * Laying a fort's modules out on its ground (plan.ts). Every module is an
 * oriented rectangle; a module is placed only where it fits: inside the wall
 * ring with room to spare from it, clear of the open yard, of the gate lanes
 * and of everything already there. What doesn't fit on one fort's irregular
 * octagon is tried elsewhere or left out, so seed variation never has to
 * repair a layout. Each placed module adds its colliders (by kind).
 *
 * The quadrants between the lanes are laid out by role, in a frame turned to
 * the quadrant's bisector: x across it (tangent), z out from the centre.
 */

/** Room kept between a module and the inner face of the walls (m). */
const WALL_CLEAR = 4.5
/** The open yard in the middle (radius, m) and the open lanes from the gates to it (width, m). */
export const YARD = 24
export const LANE = 18

/** Whether (x, z) lies inside the polygon `c`. */
export function insidePolygon(c: readonly Xz[], x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const [xi, zi] = c[i], [xj, zj] = c[j]
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

interface Obb { c: Xz; yaw: number; hw: number; hd: number }

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

const rot = (p: Xz, yaw: number): Xz => [p[0] * Math.cos(yaw) + p[1] * Math.sin(yaw), -p[0] * Math.sin(yaw) + p[1] * Math.cos(yaw)]
const add = (a: Xz, b: Xz): Xz => [a[0] + b[0], a[1] + b[1]]

/** Box collider as four capsule segments (radius r) around a rotated rectangle. */
export function boxSegments(at: Xz, yaw: number, w: number, d: number, r = 0.2): SegmentCollider[] {
  const hw = w / 2 - r, hd = d / 2 - r
  const c = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map((p) => add(at, rot(p as Xz, yaw)))
  return c.map((p, i) => ({ ax: p[0], az: p[1], bx: c[(i + 1) % 4][0], bz: c[(i + 1) % 4][1], r }))
}

function corners(o: Obb): Xz[] {
  return [[-o.hw, -o.hd], [o.hw, -o.hd], [o.hw, o.hd], [-o.hw, o.hd]].map((p) => add(o.c, rot(p as Xz, o.yaw)))
}

/** Separating-axis overlap of two oriented rectangles. */
function overlaps(a: Obb, b: Obb): boolean {
  const ca = corners(a), cb = corners(b)
  for (const o of [a, b]) {
    for (const axis of [rot([1, 0], o.yaw), rot([0, 1], o.yaw)]) {
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity
      for (const p of ca) { const d = p[0] * axis[0] + p[1] * axis[1]; a0 = Math.min(a0, d); a1 = Math.max(a1, d) }
      for (const p of cb) { const d = p[0] * axis[0] + p[1] * axis[1]; b0 = Math.min(b0, d); b1 = Math.max(b1, d) }
      if (a1 < b0 || b1 < a0) return false
    }
  }
  return true
}

/** Distance from the origin to the nearest point of a rectangle. */
function reachFromCentre(o: Obb): number {
  const l = rot(scale2(o.c, -1), -o.yaw)
  const x = Math.max(0, Math.abs(l[0]) - o.hw), z = Math.max(0, Math.abs(l[1]) - o.hd)
  return Math.hypot(x, z)
}
const scale2 = (a: Xz, k: number): Xz => [a[0] * k, a[1] * k]

function segmentDistance(p: Xz, a: Xz, b: Xz): number {
  const dx = b[0] - a[0], dz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t)
}

/** Modules that only stand on posts (the ground under them stays free to walk and to build on). */
const OVERHEAD = new Set<ModuleKind>(['sail'])

export class Layout {
  readonly modules: Module[] = []
  private readonly taken: Obb[] = []
  private readonly wallCorners: Xz[]
  private readonly segments: SegmentCollider[]
  private readonly circles: CircleCollider[]
  private readonly rand: () => number

  constructor(wallCorners: Xz[], gates: Gate[], segments: SegmentCollider[], circles: CircleCollider[], rand: () => number) {
    this.wallCorners = wallCorners
    this.segments = segments
    this.circles = circles
    this.rand = rand
    // the lanes from every gate to the yard stay open
    for (const g of gates) {
      const len = Math.hypot(g.at[0], g.at[1])
      this.reserve(scale2(g.at, 0.5), Math.atan2(g.at[0], g.at[1]), LANE, len + 6)
    }
  }

  /** Keep a rectangle free of modules (the hangars, their aprons, the lanes). */
  reserve(at: Xz, yaw: number, w: number, d: number): void {
    this.taken.push({ c: at, yaw, hw: w / 2, hd: d / 2 })
  }

  /** Whether `m` (grown by `pad` all round) fits: inside the walls with room, off the yard, clear of everything placed. */
  fits(m: Module, pad: number): boolean {
    const o: Obb = { c: m.at, yaw: m.yaw, hw: m.size[0] / 2 + pad, hd: m.size[2] / 2 + pad }
    if (reachFromCentre(o) < YARD) return false
    for (const p of corners(o)) {
      if (!insidePolygon(this.wallCorners, p[0], p[1])) return false
      for (let i = 0; i < this.wallCorners.length; i++) {
        if (segmentDistance(p, this.wallCorners[i], this.wallCorners[(i + 1) % this.wallCorners.length]) < WALL_CLEAR) return false
      }
    }
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

  /** Place `m` outside the walls (its colliders are the caller's). */
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
    if (!OVERHEAD.has(m.kind)) this.taken.push({ c: m.at, yaw: m.yaw, hw: m.size[0] / 2 + pad, hd: m.size[2] / 2 + pad })
    this.collide(m)
  }

  /** The colliders a module stands in the way with. */
  private collide(m: Module): void {
    const [w, , d] = m.size
    const circle = (at: Xz, r: number): void => { this.circles.push({ x: at[0], z: at[1], r }) }
    const local = (x: number, z: number): Xz => add(m.at, rot([x, z], m.yaw))
    switch (m.kind) {
      case 'tower': circle(m.at, 2.6); break
      case 'mast': circle(m.at, 0.6); break
      case 'pole': circle(m.at, 0.25); break
      case 'radioMast': circle(m.at, 1.4); break
      case 'boom': circle(local(0, 0), 0.4); break
      case 'drums': case 'tires': case 'waterTank': circle(m.at, Math.max(w, d) / 2); break
      case 'waterTower': for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) circle(local(x * w * 0.4, z * d * 0.4), 0.35); break
      case 'sail': for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) circle(local(x * w / 2, z * d / 2), 0.2); break
      case 'canopy': {
        const bays = Math.max(1, Math.round(w / 6))
        for (let i = 0; i <= bays; i++) for (const z of [-1, 1]) circle(local(-w / 2 + (i * w) / bays, z * d / 2), 0.3)
        break
      }
      case 'helipad': break
      case 'hesco': case 'blastWall': case 'sandbags': {
        const a = local(-w / 2 + d / 2, 0), b = local(w / 2 - d / 2, 0)
        this.segments.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], r: d / 2 })
        break
      }
      case 'bund': this.segments.push(...boxSegments(m.at, m.yaw, w, d, 0.35)); break
      default: this.segments.push(...boxSegments(m.at, m.yaw, w, d, Math.min(0.3, w / 4, d / 4)))
    }
  }

  /** Place `make(at, yaw)` wherever it first fits, scanning rings from the walls inward; whether it was placed. */
  anywhere(make: (at: Xz, yaw: number) => Module, pad: number, outer: number): boolean {
    for (let r = outer; r > YARD + 6; r -= 3) {
      const steps = Math.ceil((2 * Math.PI * r) / 4)
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2
        if (this.place(make([Math.sin(a) * r, Math.cos(a) * r], a + Math.PI), pad)) return true
      }
    }
    return false
  }

  /** Whether a module of `kind` has been placed. */
  has(kind: ModuleKind): boolean {
    return this.modules.some((m) => m.kind === kind)
  }

  // ---------------------------------------------------------------- quadrants

  /** Lay out a quadrant of the fort (bisector `angle`, from +z toward +x) for its role. */
  quadrant(role: string, angle: number, R: number): void {
    const q = new Quadrant(this, angle, R, this.rand)
    if (role === 'barracks') q.barracks()
    else if (role === 'command') q.command()
    else if (role === 'supply') q.supply()
    else q.fuel()
  }

  /** Scatter clutter over a quadrant's free ground (after every building has its place). */
  clutter(angle: number, R: number): void {
    new Quadrant(this, angle, R, this.rand).clutter()
  }
}

/** A quadrant's frame and its role layouts. */
class Quadrant {
  private readonly L: Layout
  private readonly angle: number
  private readonly R: number
  private readonly rand: () => number

  constructor(L: Layout, angle: number, R: number, rand: () => number) {
    this.L = L
    this.angle = angle
    this.R = R
    this.rand = rand
  }

  /** A module at quadrant-frame (x across, z out) with its front turned `yaw` from facing out. */
  private m(kind: ModuleKind, x: number, z: number, yaw: number, size: [number, number, number], variant = 0, detail = false, y = 0): Module {
    return { kind, at: rot([x, z], this.angle), yaw: this.angle + yaw, size, variant, y, detail }
  }

  /** Try `make(x, z)` over candidate spots, nearest the preferred one first, until `accept` places it. */
  private search(x0: number, z0: number, spread: number, tries: number, make: (x: number, z: number) => boolean): boolean {
    if (make(x0, z0)) return true
    for (let i = 0; i < tries; i++) {
      const r = spread * Math.sqrt((i + 1) / tries)
      const a = i * 2.39996
      if (make(x0 + Math.cos(a) * r, z0 + Math.sin(a) * r)) return true
    }
    return false
  }

  /** Rows of housing units under shade sails, latrines, a water tank and the barracks' generator. */
  barracks(): void {
    const R = this.R
    const rows = 3, per = 4, dx = 7.2, dz = 7.8
    this.search(0, R * 0.52, R * 0.18, 40, (x, z) => {
      const ms: Module[] = []
      for (let r = 0; r < rows; r++) {
        for (let i = 0; i < per; i++) {
          const ux = x + (i - (per - 1) / 2) * dx
          // rows face each other across the walkways
          ms.push(this.m('chu', ux, z + (r - 1) * dz, r % 2 ? 0 : Math.PI, [6.06, 2.9, 2.44], Math.floor(this.rand() * 3)))
        }
      }
      for (let r = 0; r < rows - 1; r++) ms.push(this.m('sail', x, z + (r - 0.5) * dz, 0, [(per - 1) * dx + 8.4, 4.8, dz - 3], r))
      return this.L.group(ms, 0.9)
    })
    this.search(-R * 0.2, R * 0.72, R * 0.2, 30, (x, z) => this.L.group([0, 1, 2].map((i) => this.m('latrine', x + i * 1.45, z, Math.PI, [1.3, 2.4, 1.3], i, true)), 0.3))
    this.search(R * 0.24, R * 0.68, R * 0.2, 30, (x, z) => this.L.place(this.m('waterTank', x, z, 0, [3.2, 3.6, 3.2]), 0.6))
    this.search(R * 0.26, R * 0.36, R * 0.2, 30, (x, z) => this.L.place(this.m('generator', x, z, Math.PI / 2, [3.6, 2.2, 1.6], 1), 0.6))
  }

  /** The HQ with blast walls before its door, the old bunker, a lattice radio mast and a helipad. */
  command(): void {
    const R = this.R
    // the HQ's footprint takes in its stair (east end) and its walkway (front); its door faces the yard,
    // or, where the quadrant is too tight for that, along it (its blast wall and generator turned with it)
    for (const turn of [0, Math.PI / 2, -Math.PI / 2]) {
      // a point in the HQ's own frame (x along its front, z out of its door) into the quadrant frame
      const off = (x: number, z: number, u: number, v: number): [number, number] => add([x, z], rot([u, v], Math.PI + turn))
      const placed = this.search(0, R * 0.48, R * 0.24, 60, (x, z) => this.L.group([
        this.m('hq', x, z, Math.PI + turn, [30, 7.8, 14]),
        this.m('blastWall', ...off(x, z, 0, 11), Math.PI + turn, [11.2, 5.2, 1.9]),
        this.m('generator', ...off(x, z, -17.6, -1), Math.PI / 2 + turn, [3.6, 2.2, 1.6], 2),
      ], 0.8))
      if (placed) break
    }
    for (const size of [20, 16]) if (this.search(0, R * 0.72, R * 0.3, 80, (x, z) => this.L.place(this.m('helipad', x, z, Math.PI, [size, 0.25, size]), 1))) break
    this.search(-R * 0.3, R * 0.62, R * 0.2, 40, (x, z) => this.L.place(this.m('bunker', x, z, Math.PI, [12, 4.6, 9]), 1))
    this.search(R * 0.3, R * 0.62, R * 0.2, 40, (x, z) => this.L.place(this.m('radioMast', x, z, 0, [3.4, 34, 3.4]), 1.2))
    this.search(R * 0.28, R * 0.38, R * 0.2, 20, (x, z) => this.L.place(this.m('sandbags', x, z, Math.PI, [6.2, 1.4, 0.7], 3, true), 0.3))
  }

  /** Container stacks and a motor-pool canopy sheltering tyres, drums and crates. */
  supply(): void {
    const R = this.R
    this.search(0, R * 0.62, R * 0.2, 40, (x, z) => {
      const ms: Module[] = [this.m('canopy', x, z, Math.PI, [24, 6.6, 13])]
      // under it: stacked tyres, drums and crates along the back, the front left open
      ms.push(this.m('tires', x - 8, z + 3.5, 0, [2.2, 1.6, 2.2], 4, true))
      ms.push(this.m('drums', x - 3, z + 4, this.rand() * 6, [2.6, 1, 2.6], 7, true))
      ms.push(this.m('crates', x + 3.5, z + 3.8, 0.1, [3.4, 1.8, 2.4], 1, true))
      ms.push(this.m('tires', x + 8.5, z + 3.2, 0, [2.2, 1.2, 2.2], 3, true))
      return this.L.group(ms, 0.8)
    })
    // container stacks: pairs side by side, some two high
    for (const [px, pz] of [[-0.24, 0.4], [0.24, 0.4], [0, 0.34]] as Array<[number, number]>) {
      this.search(R * px, R * pz, R * 0.14, 30, (x, z) => {
        const yaw = Math.PI / 2 + (this.rand() - 0.5) * 0.06
        const ms: Module[] = []
        for (const s of [-1, 1]) {
          const cx = x + s * 1.3
          ms.push(this.m('container', cx, z, yaw, [2.44, 2.59, 12.19], Math.floor(this.rand() * 4)))
        }
        if (!this.L.group(ms, 0.6)) return false
        // stacked: a second tier on some (their ground is the lower one's)
        for (const s of [-1, 1]) if (this.rand() < 0.6) this.L.outside({ ...this.m('container', x + s * 1.3, z, yaw + (this.rand() - 0.5) * 0.03, [2.44, 2.59, 12.19], Math.floor(this.rand() * 4)), y: 2.59 })
        return true
      })
    }
  }

  /** Fuel tanks inside a bund, a water tower and the depot's generators. */
  fuel(): void {
    const R = this.R
    this.search(0, R * 0.56, R * 0.18, 40, (x, z) => {
      const ms: Module[] = [this.m('bund', x, z, Math.PI, [22, 1.1, 14])]
      for (const i of [-1, 0, 1]) ms.push(this.m('tank', x + i * 6.2, z + 0.6, 0, [3.2, 4.2, 10.2]))
      return this.L.group(ms, 1)
    })
    this.search(R * 0.3, R * 0.4, R * 0.2, 40, (x, z) => this.L.place(this.m('waterTower', x, z, 0, [5, 15, 5]), 1))
    this.search(-R * 0.3, R * 0.4, R * 0.2, 40, (x, z) => this.L.group([
      this.m('generator', x, z, Math.PI / 2, [3.6, 2.2, 1.6], 0),
      this.m('generator', x, z + 2.6, Math.PI / 2, [3.6, 2.2, 1.6], 1),
    ], 0.5))
  }

  /** Scattered clutter wherever it fits: pallets and crates, drum clusters, tyres, a sandbag position. */
  clutter(): void {
    const R = this.R
    const kinds: Array<[ModuleKind, [number, number, number], number]> = [
      ['crates', [3.4, 1.8, 2.4], 0], ['drums', [2.4, 1, 2.4], 5], ['crates', [2.4, 1.2, 2.4], 2],
      ['tires', [2.2, 1.2, 2.2], 3], ['drums', [2, 1, 2], 3], ['sandbags', [5.2, 1.4, 0.7], 2],
    ]
    for (const [kind, size, variant] of kinds) {
      const x = (this.rand() - 0.5) * R * 0.6, z = R * (0.35 + this.rand() * 0.4)
      this.search(x, z, R * 0.25, 24, (px, pz) => this.L.place(this.m(kind, px, pz, this.rand() * Math.PI * 2, size, variant, true), 0.8))
    }
  }
}
