import type { Citadel, CitadelPlan } from '../../worlds/desert/citadel'
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
/** A field covers the districts it serves this far beyond their outlines (m); round a gate's outer side, this far about its waypoint. */
const FIELD_MARGIN = 24
const OUTSIDE_REACH = 60

/** A flow field over a window of the grid: its first cell, its size, and every cell's distance in tenths of a cell. */
interface Field {
  i0: number
  j0: number
  nx: number
  nz: number
  d: Uint16Array
}

/**
 * Finding the way about the citadel for a body of a given radius. Its floor
 * is one layer (every edge between levels is walled), so the way is found
 * in 2D.
 *
 * Between districts it follows the plan's gate graph (plan.ts `nav`): the
 * waypoint on its own side of the next gate, then the one on the far side;
 * crossing the gate's line puts it in the next district. Within a district
 * the way to a gate's waypoint is a flow field over a 2 m grid (the
 * colliders grown by the body's radius are walls): each field is the
 * distance from every open cell to that waypoint, and a body steers for the
 * cell a few steps down its gradient, so it rounds the halls, towers and
 * domes instead of pressing against them.
 *
 * A gate's fields cover only the two districts it joins (a yard's only its
 * district), with a margin: whoever follows one stands in one of them.
 * Fields over the whole 1.1 km grounds would take ~35 MB and seconds. Every
 * field is built with the nav, at boot: built on first use they would
 * hitch the frame a garrison first took a gate.
 */
export class CitadelNav {
  private readonly plan: CitadelPlan
  private readonly x0: number
  private readonly z0: number
  private readonly nx: number
  private readonly nz: number
  private readonly open: Uint8Array
  /** the colliders (fort frame): a body in a wall's margin steps out on its own side */
  private readonly grid: ColliderGrid
  /** per gate waypoint (gate * 2 + side, 0 its -out side) and per yard */
  private readonly fields = new Map<number, Field>()
  private readonly heap: Heap

  constructor(plan: CitadelPlan, radius: number) {
    this.plan = plan
    const pad = 16
    const b = plan.bounds
    this.x0 = b.x0 - pad
    this.z0 = b.z0 - pad
    this.nx = Math.ceil((b.x1 + pad - this.x0) / CELL)
    this.nz = Math.ceil((b.z1 + pad - this.z0) / CELL)
    this.open = new Uint8Array(this.nx * this.nz)
    let largest = 0
    const grid = this.grid = new ColliderGrid(plan.segments, plan.circles, 8)
    const contact: Contact = { nx: 0, nz: 0, depth: 0 }
    const p = { x: 0, z: 0 }
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        p.x = this.x0 + (i + 0.5) * CELL
        p.z = this.z0 + (j + 0.5) * CELL
        this.open[j * this.nx + i] = grid.pushOut(p, radius + MARGIN, contact) ? 0 : 1
      }
    }
    // each field's window: the districts it serves
    const windows = new Map<number, Omit<Field, 'd'>>()
    plan.gates.forEach((g, gi) => {
      const w = this.window(g.sectors, g.outside)
      windows.set(gi * 2, w)
      windows.set(gi * 2 + 1, w)
    })
    plan.sectors.forEach((s, k) => windows.set(YARD_FIELD + k, this.window([k], s.yard.at)))
    for (const w of windows.values()) largest = Math.max(largest, w.nx * w.nz)
    this.heap = new Heap(largest * 8)
    plan.gates.forEach((g, gi) => {
      this.field(gi * 2, g.inside, windows.get(gi * 2)!)
      this.field(gi * 2 + 1, g.outside, windows.get(gi * 2 + 1)!)
    })
    plan.sectors.forEach((s, k) => this.field(YARD_FIELD + k, s.yard.at, windows.get(YARD_FIELD + k)!))
  }

  /** The grid window holding districts `sectors` (outside the citadel: round `near`), with the margin. */
  private window(sectors: readonly number[], near: readonly [number, number]): Omit<Field, 'd'> {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
    for (const k of sectors) {
      const points = k < this.plan.sectors.length ? this.plan.sectors[k].polygon
        : [[near[0] - OUTSIDE_REACH, near[1] - OUTSIDE_REACH], [near[0] + OUTSIDE_REACH, near[1] + OUTSIDE_REACH]]
      for (const [x, z] of points) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z) }
    }
    const i0 = Math.max(0, Math.floor((x0 - FIELD_MARGIN - this.x0) / CELL)), i1 = Math.min(this.nx - 1, Math.floor((x1 + FIELD_MARGIN - this.x0) / CELL))
    const j0 = Math.max(0, Math.floor((z0 - FIELD_MARGIN - this.z0) / CELL)), j1 = Math.min(this.nz - 1, Math.floor((z1 + FIELD_MARGIN - this.z0) / CELL))
    return { i0, j0, nx: i1 - i0 + 1, nz: j1 - j0 + 1 }
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
    // in the gate's lane and up to its near waypoint (or past it): through to the far side, by the far
    // waypoint's field (a waypoint may stand off the gate's axis, up a ramp: the straight line clips the wall)
    const ux = far[0] - near[0], uz = far[1] - near[1]
    const ul = Math.hypot(ux, uz)
    const along = ((x - near[0]) * ux + (z - near[1]) * uz) / ul
    const across = Math.abs((x - near[0]) * uz - (z - near[1]) * ux) / ul
    if (along > -REACHED && across < g.width / 2 - 1) {
      if (Math.hypot(far[0] - x, far[1] - z) <= STRAIGHT || !this.follow(x, z, gi * 2 + (behind ? 1 : 0), out)) {
        out.x = far[0]
        out.z = far[1]
      }
      return true
    }
    const d = Math.hypot(near[0] - x, near[1] - z)
    if (d <= STRAIGHT || !this.follow(x, z, gi * 2 + (behind ? 0 : 1), out)) {
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
    return this.follow(x, z, YARD_FIELD + sector, out)
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
  private follow(x: number, z: number, key: number, out: { x: number; z: number }): boolean {
    const field = this.fields.get(key)
    if (!field) return false
    let c = this.cell(x, z)
    if (c < 0 || this.value(field, c) < 0) return false
    if (this.value(field, c) === FAR) {
      // in a wall's margin: the lowest open neighbour on the body's own side (one across a thin wall is not reachable)
      c = this.beside(field, c, x, z)
      if (c < 0) return false
    }
    // down the gradient, as far ahead as the straight line there stays open (never cutting a corner)
    let to = -1
    for (let k = 0; k < LOOKAHEAD; k++) {
      const n = this.best(field, c)
      if (n < 0 || this.value(field, n) >= this.value(field, c)) break
      if (to >= 0 && !this.clear(x, z, this.cx(n), this.cz(n))) break
      c = to = n
    }
    if (to < 0) to = c
    out.x = this.cx(to)
    out.z = this.cz(to)
    return true
  }

  /** The field's distance at grid cell `c`, or -1 outside its window. */
  private value(f: Field, c: number): number {
    const i = (c % this.nx) - f.i0, j = Math.floor(c / this.nx) - f.j0
    return i < 0 || j < 0 || i >= f.nx || j >= f.nz ? -1 : f.d[j * f.nx + i]
  }

  private cx(c: number): number {
    return this.x0 + ((c % this.nx) + 0.5) * CELL
  }

  private cz(c: number): number {
    return this.z0 + (Math.floor(c / this.nx) + 0.5) * CELL
  }

  /** The neighbour of grid cell `c` lowest on the field that a body at (x, z) reaches in a straight line without crossing a collider, or -1. */
  private beside(f: Field, c: number, x: number, z: number): number {
    const i = c % this.nx, j = Math.floor(c / this.nx)
    let best = -1, bd = FAR
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj
        if (ii < 0 || jj < 0 || ii >= this.nx || jj >= this.nz) continue
        const n = jj * this.nx + ii
        const v = this.value(f, n)
        if (v < 0 || v >= bd || this.crosses(x, z, this.cx(n), this.cz(n))) continue
        bd = v
        best = n
      }
    }
    return best
  }

  /** Whether the straight way between two points passes through a collider (sampled every quarter metre). */
  private crosses(x0: number, z0: number, x1: number, z1: number): boolean {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.25)
    for (let k = 1; k <= n; k++) {
      _q.x = x0 + ((x1 - x0) * k) / n
      _q.z = z0 + ((z1 - z0) * k) / n
      if (this.grid.pushOut(_q, 0.01, _contact)) return true
    }
    return false
  }

  /**
   * The neighbour of grid cell `c` lower on the field than it (the lowest), or
   * -1: by the field's own moves (open cells, no diagonal past a closed one),
   * so a body never steps round the end of a thin wall through it.
   */
  private best(f: Field, c: number): number {
    const i = c % this.nx, j = Math.floor(c / this.nx)
    const open = this.open, nx = this.nx
    let best = -1, bd = this.value(f, c)
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue
        const ii = i + di, jj = j + dj
        if (ii < 0 || jj < 0 || ii >= this.nx || jj >= this.nz) continue
        const n = jj * nx + ii
        if (!open[n] || (di && dj && (!open[j * nx + ii] || !open[jj * nx + i]))) continue
        const v = this.value(f, n)
        if (v >= 0 && v < bd) { bd = v; best = n }
      }
    }
    return best
  }

  /** The distance field to `goal` over window `w` (Dijkstra over its open cells, eight ways, no corner cutting). */
  private field(key: number, goal: readonly [number, number], w: Omit<Field, 'd'>): void {
    const f: Field = { ...w, d: new Uint16Array(w.nx * w.nz).fill(FAR) }
    this.fields.set(key, f)
    const gi = Math.floor((goal[0] - this.x0) / CELL) - w.i0, gj = Math.floor((goal[1] - this.z0) / CELL) - w.j0
    if (gi < 0 || gj < 0 || gi >= w.nx || gj >= w.nz) return
    const heap = this.heap
    heap.size = 0
    const start = gj * w.nx + gi
    f.d[start] = 0
    heap.push(start, 0)
    const nx = w.nx, nz = w.nz, open = this.open, gnx = this.nx, d = f.d
    // the grid cell of window cell (i, j)
    const o = w.j0 * gnx + w.i0
    while (heap.size) {
      const c = heap.pop()
      // a stale entry: the cell was reached shorter since
      if (heap.key > d[c]) continue
      const i = c % nx, j = Math.floor(c / nx)
      const base = d[c]
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue
          const ii = i + di, jj = j + dj
          if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue
          if (!open[o + jj * gnx + ii]) continue
          if (di && dj && (!open[o + j * gnx + ii] || !open[o + jj * gnx + i])) continue
          const n = jj * nx + ii
          const v = base + (di && dj ? 14 : 10)
          if (v < d[n]) { d[n] = v; heap.push(n, v) }
        }
      }
    }
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
 * of the citadel, in world space (CitadelNav.next). Returns false when no gate is
 * needed (or none leads there).
 */
export function waypoint(citadel: Citadel, nav: CitadelNav, x: number, z: number, from: number, to: number, out: { x: number; z: number }): boolean {
  citadel.toLocal(x, z, _l)
  if (!nav.next(_l.x, _l.z, from, to, _l)) return false
  citadel.toWorld(_l.x, _l.z, out)
  return true
}

/**
 * Toward a world point in the soldier's own district `sector`, round
 * whatever stands between (CitadelNav.approach): writes the point to steer for
 * into `out` (the point itself when the way is clear).
 */
export function approach(citadel: Citadel, nav: CitadelNav, x: number, z: number, tx: number, tz: number, sector: number, out: { x: number; z: number }): void {
  citadel.toLocal(x, z, _l)
  citadel.toLocal(tx, tz, _t)
  if (nav.approach(_l.x, _l.z, _t.x, _t.z, sector, _l)) citadel.toWorld(_l.x, _l.z, out)
  else { out.x = tx; out.z = tz }
}

/** Whether two districts share a gate (a garrison follows its target one district over, no further). */
export function adjacent(citadel: Citadel, a: number, b: number): boolean {
  if (a === b) return true
  for (const g of citadel.plan.gates) if ((g.sectors[0] === a && g.sectors[1] === b) || (g.sectors[0] === b && g.sectors[1] === a)) return true
  return false
}

const _l = { x: 0, z: 0 }
const _t = { x: 0, z: 0 }
const _q = { x: 0, z: 0 }
const _contact: Contact = { nx: 0, nz: 0, depth: 0 }
