import type { Fort } from '../../worlds/desert/fort'
import type { FortPlan } from '../../worlds/desert/fort/plan'
import { ColliderGrid, type Contact } from '../collide'

/** Flow grid cell (m), clearance kept from the colliders beyond a body's radius (m), and how far ahead a body steers along the flow (cells). */
const CELL = 2
const MARGIN = 0.3
const LOOKAHEAD = 3
/** Near a field's goal (m) the body goes straight for it; near a gate's waypoint it makes for the far side. */
const STRAIGHT = 5
const REACHED = 2.5
const FAR = 0xffff
/** Field keys: gate waypoints are gate * 2 + side; a district's yard is this plus its index. */
const YARD_FIELD = 10000

/**
 * Finding the way about a fortress for a body of a given radius.
 *
 * Between districts it follows the plan's gate graph (plan.ts `nav`): the
 * waypoint on its own side of the next gate, then the one on the far side;
 * crossing the gate's line puts it in the next district. Within a district
 * the way to a gate's waypoint is a flow field over a 2 m grid of the
 * fortress (its colliders grown by the body's radius are walls): each field
 * is the distance from every open cell to that waypoint, and a body steers
 * for the cell a few steps down its gradient, so it rounds the keep, the
 * garages and the container stacks instead of pressing against them. Every
 * field (each gate's two waypoints, each district's yard) is built with the
 * nav, at boot: built on first use they would hitch the frame a garrison
 * first took a gate.
 */
export class FortNav {
  private readonly plan: FortPlan
  private readonly x0: number
  private readonly z0: number
  private readonly nx: number
  private readonly nz: number
  private readonly open: Uint8Array
  /** per gate waypoint (gate * 2 + side, 0 its -out side): distance in tenths of a cell */
  private readonly fields = new Map<number, Uint16Array>()
  private readonly heap: Heap

  constructor(plan: FortPlan, radius: number) {
    this.plan = plan
    const pad = 16
    const xs = plan.corners.map((c) => c[0]), zs = plan.corners.map((c) => c[1])
    this.x0 = Math.min(...xs) - pad
    this.z0 = Math.min(...zs) - pad
    this.nx = Math.ceil((Math.max(...xs) + pad - this.x0) / CELL)
    this.nz = Math.ceil((Math.max(...zs) + pad - this.z0) / CELL)
    this.open = new Uint8Array(this.nx * this.nz)
    this.heap = new Heap(this.nx * this.nz * 8)
    const grid = new ColliderGrid(plan.segments, plan.circles, 8)
    const contact: Contact = { nx: 0, nz: 0, depth: 0 }
    const p = { x: 0, z: 0 }
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        p.x = this.x0 + (i + 0.5) * CELL
        p.z = this.z0 + (j + 0.5) * CELL
        this.open[j * this.nx + i] = grid.pushOut(p, radius + MARGIN, contact) ? 0 : 1
      }
    }
    plan.gates.forEach((g, gi) => {
      this.field(gi * 2, g.inside)
      this.field(gi * 2 + 1, g.outside)
    })
    plan.sectors.forEach((s, k) => this.field(YARD_FIELD + k, s.yard.at))
  }

  /**
   * The next point (fort frame) for a body at (x, z) in district `from` on
   * its way to district `to`; false when it is already there (it goes
   * straight) or no gate leads there.
   */
  next(x: number, z: number, from: number, to: number, out: { x: number; z: number }): boolean {
    if (from === to || from < 0 || to < 0) return false
    const gi = this.plan.nav[from][to]
    if (gi < 0) return false
    const g = this.plan.gates[gi]
    const behind = g.sectors[0] === from
    const near = behind ? g.inside : g.outside
    const far = behind ? g.outside : g.inside
    // in the gate's lane and up to its near waypoint (or past it): through to the far side
    const ux = far[0] - near[0], uz = far[1] - near[1]
    const ul = Math.hypot(ux, uz)
    const along = ((x - near[0]) * ux + (z - near[1]) * uz) / ul
    const across = Math.abs((x - near[0]) * uz - (z - near[1]) * ux) / ul
    if (along > -REACHED && across < g.width / 2 - 1) {
      out.x = far[0]
      out.z = far[1]
      return true
    }
    const d = Math.hypot(near[0] - x, near[1] - z)
    if (d <= STRAIGHT || !this.follow(x, z, gi * 2 + (behind ? 0 : 1), near, out)) {
      out.x = near[0]
      out.z = near[1]
    }
    return true
  }

  /**
   * Toward (tx, tz) within district `sector`: straight there when nothing
   * stands between (along open cells), otherwise down the district's field
   * toward its yard, where it opens up; returns whether it detoured.
   */
  approach(x: number, z: number, tx: number, tz: number, sector: number, out: { x: number; z: number }): boolean {
    out.x = tx
    out.z = tz
    if (sector < 0 || sector >= this.plan.sectors.length || this.clear(x, z, tx, tz)) return false
    const yard = this.plan.sectors[sector].yard.at
    if (Math.hypot(yard[0] - x, yard[1] - z) <= STRAIGHT) return false
    return this.follow(x, z, YARD_FIELD + sector, yard, out)
  }

  /** Whether the segment between two points runs over open cells only. */
  clear(x0: number, z0: number, x1: number, z1: number): boolean {
    const d = Math.hypot(x1 - x0, z1 - z0)
    const n = Math.ceil(d / (CELL * 0.5))
    for (let k = 1; k <= n; k++) {
      const c = this.cell(x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n)
      if (c >= 0 && !this.open[c]) return false
    }
    return true
  }

  /** Whether an open cell holds (x, z) (tests and tools). */
  walkable(x: number, z: number): boolean {
    const c = this.cell(x, z)
    return c >= 0 && this.open[c] === 1
  }

  private cell(x: number, z: number): number {
    const i = Math.floor((x - this.x0) / CELL), j = Math.floor((z - this.z0) / CELL)
    return i < 0 || j < 0 || i >= this.nx || j >= this.nz ? -1 : j * this.nx + i
  }

  /** A point LOOKAHEAD cells down field `key`'s gradient from (x, z); false if the body is off the field. */
  private follow(x: number, z: number, key: number, goal: readonly [number, number], out: { x: number; z: number }): boolean {
    const field = this.field(key, goal)
    let c = this.cell(x, z)
    if (c < 0) return false
    if (field[c] === FAR) {
      // pushed into a wall's margin: step to the nearest open neighbour first
      c = this.best(field, c, true)
      if (c < 0) return false
    }
    // down the gradient, as far ahead as the straight line there stays open (never cutting a corner)
    let to = -1
    for (let k = 0; k < LOOKAHEAD; k++) {
      const n = this.best(field, c, false)
      if (n < 0 || field[n] >= field[c]) break
      if (to >= 0 && !this.clear(x, z, this.cx(n), this.cz(n))) break
      c = to = n
    }
    if (to < 0) to = c
    out.x = this.cx(to)
    out.z = this.cz(to)
    return true
  }

  private cx(c: number): number {
    return this.x0 + ((c % this.nx) + 0.5) * CELL
  }

  private cz(c: number): number {
    return this.z0 + (Math.floor(c / this.nx) + 0.5) * CELL
  }

  /** The neighbour of `c` lowest on the field (any reachable one, if `any`), or -1. */
  private best(field: Uint16Array, c: number, any: boolean): number {
    const i = c % this.nx, j = Math.floor(c / this.nx)
    let best = -1, bd = any ? FAR : field[c]
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue
        const ii = i + di, jj = j + dj
        if (ii < 0 || jj < 0 || ii >= this.nx || jj >= this.nz) continue
        const n = jj * this.nx + ii
        if (field[n] < bd) { bd = field[n]; best = n }
      }
    }
    return best
  }

  /** The distance field to `goal` (Dijkstra over the open cells, eight ways, no corner cutting), built once. */
  private field(key: number, goal: readonly [number, number]): Uint16Array {
    let f = this.fields.get(key)
    if (f) return f
    f = new Uint16Array(this.nx * this.nz).fill(FAR)
    const start = this.cell(goal[0], goal[1])
    if (start >= 0) {
      const heap = this.heap
      heap.size = 0
      f[start] = 0
      heap.push(start, 0)
      const nx = this.nx, nz = this.nz, open = this.open
      while (heap.size) {
        const c = heap.pop()
        // a stale entry: the cell was reached shorter since
        if (heap.key > f[c]) continue
        const i = c % nx, j = Math.floor(c / nx)
        const base = f[c]
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue
            const ii = i + di, jj = j + dj
            if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue
            const n = jj * nx + ii
            if (!open[n]) continue
            if (di && dj && (!open[j * nx + ii] || !open[jj * nx + i])) continue
            const d = base + (di && dj ? 14 : 10)
            if (d < f[n]) { f[n] = d; heap.push(n, d) }
          }
        }
      }
    }
    this.fields.set(key, f)
    return f
  }
}

/** A binary min-heap of cells keyed by distance; `key` is the last popped cell's (stale entries are left in and skipped). */
class Heap {
  private readonly cells: Int32Array
  private readonly keys: Uint16Array
  size = 0
  key = 0

  constructor(capacity: number) {
    this.cells = new Int32Array(capacity)
    this.keys = new Uint16Array(capacity)
  }

  push(c: number, k: number): void {
    let i = this.size++
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.keys[p] <= k) break
      this.cells[i] = this.cells[p]
      this.keys[i] = this.keys[p]
      i = p
    }
    this.cells[i] = c
    this.keys[i] = k
  }

  pop(): number {
    const top = this.cells[0]
    this.key = this.keys[0]
    const c = this.cells[--this.size], k = this.keys[this.size]
    let i = 0
    for (;;) {
      let m = i * 2 + 1
      if (m >= this.size) break
      if (m + 1 < this.size && this.keys[m + 1] < this.keys[m]) m++
      if (this.keys[m] >= k) break
      this.cells[i] = this.cells[m]
      this.keys[i] = this.keys[m]
      i = m
    }
    this.cells[i] = c
    this.keys[i] = k
    return top
  }
}

/**
 * The next point on a soldier's way from district `from` to district `to`
 * of `fort`, in world space (FortNav.next). Returns false when no gate is
 * needed (or none leads there).
 */
export function waypoint(fort: Fort, nav: FortNav, x: number, z: number, from: number, to: number, out: { x: number; z: number }): boolean {
  fort.toLocal(x, z, _l)
  if (!nav.next(_l.x, _l.z, from, to, _l)) return false
  fort.toWorld(_l.x, _l.z, out)
  return true
}

/**
 * Toward a world point in the soldier's own district `sector`, round
 * whatever stands between (FortNav.approach): writes the point to steer for
 * into `out` (the point itself when the way is clear).
 */
export function approach(fort: Fort, nav: FortNav, x: number, z: number, tx: number, tz: number, sector: number, out: { x: number; z: number }): void {
  fort.toLocal(x, z, _l)
  fort.toLocal(tx, tz, _t)
  if (nav.approach(_l.x, _l.z, _t.x, _t.z, sector, _l)) fort.toWorld(_l.x, _l.z, out)
  else { out.x = tx; out.z = tz }
}

/** Whether two districts share a gate (a garrison follows its target one district over, no further). */
export function adjacent(fort: Fort, a: number, b: number): boolean {
  if (a === b) return true
  for (const g of fort.plan.gates) if ((g.sectors[0] === a && g.sectors[1] === b) || (g.sectors[0] === b && g.sectors[1] === a)) return true
  return false
}

const _l = { x: 0, z: 0 }
const _t = { x: 0, z: 0 }
