import { Matrix4, Vector3, type Mesh } from 'three/webgpu'

/**
 * The citadel's solid occupancy over a square grid, top-down, for the AO bake
 * (sky-visibility.ts): per cell its top, and the lower end of the solid span
 * that reaches the top (0 for a body standing on the ground).
 *
 * Each column is resolved from its own surfaces rather than from the lowest
 * and highest points of whatever touches it:
 * - A broad (non-vertical) face crossing a cell's centre is a surface there,
 *   facing up or down. Read downwards, an up face enters a solid and a down
 *   face leaves it: whatever shows its underside has air below. (A winding
 *   count is not used: a bevel strip's up face whose down face misses the
 *   cell centre left it open and stood a lintel on the ground.) A body with
 *   no face under its top stands on the ground: a wall's or a tower's
 *   interior cells hold only their cap and are solid to the ground.
 * - A face with a small projection covers the cells its edges cross (a
 *   broad projected rectangle would invent masses across open courts): an
 *   upright one is solid over its own height, a level one (a narrow cap's
 *   fan) is a surface facing up or down. An upright face leaning out over
 *   the air (a corbel flaring to a crown) is also an underside at its foot:
 *   without it, the next down face below (a band's shoulder) closed the
 *   crown's solid and stood it on the shaft's foot.
 * - The bottom is where the solid reaching the top ends. Low trim, kerbs and
 *   steps under a lintel are a separate span below the gap: they never join
 *   the lintel into a column to the ground.
 *
 * Cells off the walkable floor (building cutouts) are resolved the same way. A
 * cutout follows a module's foot: round a tapering tower it reaches past the
 * shaft, under the crown's overhang. Filled to the ground there, it stood a
 * ring of solid up to the crown round the shaft, and the shaft read its AO
 * from inside it.
 */
export interface Occupancy {
  top: Float32Array
  bottom: Float32Array
}

/** Gaps narrower than this (m) between solids in a column are closed (touching modules). */
const GAP = 0.25
/** Surfaces this close (m) count as level with each other: a part resting on another stays solid through the joint. */
const JOINT = 0.05
const UP = 1, DOWN = -1, SIDE = 0
/** An upright face leaning out over this much (the down component of its unit normal) shows its underside. */
const OVERHANG = 0.2

/**
 * Rasterize `meshes` over `cells`² cells of a square from (x0, z0), `size` m
 * wide. `floor` is each cell's walkable floor height (NaN off it); the floor
 * is the column's least top and is not itself an occluder span.
 *
 * Two walks over the triangles: the first takes the tops and sides and counts
 * each column's surfaces; only a column showing an underside can hold air
 * under its top, so the second keeps the surfaces of those columns alone.
 */
export function rasterizeOccupancy(meshes: readonly Mesh[], cells: number, x0: number, z0: number, size: number, floor: Float32Array): Occupancy {
  const n = cells * cells
  const cell = size / cells
  const top = new Float32Array(n)
  const bottom = new Float32Array(n)
  for (let k = 0; k < n; k++) if (Number.isFinite(floor[k])) top[k] = floor[k]
  // 1: tops; sides, each cell's a list (overlapping sides merge, as the resolve would join them); surface counts
  const sides = new Sides(n)
  const counts = new Uint32Array(n + 1)
  const faced = new Uint8Array(n)
  walk(meshes, cells, x0, z0, cell, (k, y, facing) => {
    if (y > top[k]) top[k] = y
    counts[k + 1]++
    faced[k] |= facing === UP ? 1 : 2
  }, (k, low, high) => {
    if (high > top[k]) top[k] = high
    sides.add(k, low, high)
  })
  // 2: the surfaces of the columns with an underside, by cell
  for (let k = 0; k < n; k++) counts[k + 1] = (faced[k] & 2 ? counts[k + 1] : 0) + counts[k]
  const ys = new Float32Array(counts[n]), faces = new Int8Array(counts[n])
  const fill = counts.slice(0, n)
  walk(meshes, cells, x0, z0, cell, (k, y, facing) => {
    if (!(faced[k] & 2)) return
    ys[fill[k]] = y
    faces[fill[k]++] = facing
  }, null)
  const column = new Column()
  for (let k = 0; k < n; k++) {
    // a column of up faces only stands on the ground
    if (faced[k] === 1) continue
    column.clear()
    for (let e = counts[k]; e < counts[k + 1]; e++) column.surface(ys[e], faces[e])
    for (let e = sides.head[k]; e >= 0; e = sides.next[e]) column.side(sides.low[e], sides.high[e])
    bottom[k] = column.bottom()
  }
  return { top, bottom }
}

/**
 * Every triangle of the meshes in world space, as the cells it occupies: a
 * broad one as a surface at each cell centre inside it; a small one along
 * the cells its edges cross, as a surface if level, else as a side over its
 * height (skipped when `side` is null).
 */
function walk(meshes: readonly Mesh[], cells: number, x0: number, z0: number, cell: number, surface: (k: number, y: number, facing: number) => void, side: ((k: number, low: number, high: number) => void) | null): void {
  const m = new Matrix4()
  const a = new Vector3(), b = new Vector3(), c = new Vector3()
  let edgeLow = 0, edgeHigh = 0, edgeFacing = SIDE, edgeUnder = false
  const edge = (k: number): void => {
    if (edgeFacing !== SIDE) { surface(k, edgeLow, edgeFacing); return }
    if (side) side(k, edgeLow, edgeHigh)
    if (edgeUnder) surface(k, edgeLow, DOWN)
  }
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false)
    m.copy(mesh.matrixWorld)
    const pos = mesh.geometry.getAttribute('position')
    const index = mesh.geometry.getIndex()
    const count = index ? index.count : pos.count
    for (let t = 0; t < count; t += 3) {
      const ia = index ? index.getX(t) : t, ib = index ? index.getX(t + 1) : t + 1, ic = index ? index.getX(t + 2) : t + 2
      a.fromBufferAttribute(pos, ia).applyMatrix4(m)
      b.fromBufferAttribute(pos, ib).applyMatrix4(m)
      c.fromBufferAttribute(pos, ic).applyMatrix4(m)
      const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - x0) / cell))
      const i1 = Math.min(cells - 1, Math.floor((Math.max(a.x, b.x, c.x) - x0) / cell))
      const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z, c.z) - z0) / cell))
      const j1 = Math.min(cells - 1, Math.floor((Math.max(a.z, b.z, c.z) - z0) / cell))
      if (i1 < i0 || j1 < j0) continue
      // the projected area, signed: positive for a face looking up
      const cross = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z)
      const facing = cross > 0 ? UP : DOWN
      if (Math.abs(cross) / 2 < cell * cell) {
        // small but level (a narrow cap's fan): a surface at its mean height; upright: a side over its
        // height, and if it leans over (a corbel's flare under a crown), an underside at its foot
        const nx = (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y)
        const nz = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
        const level = cross * cross > nx * nx + nz * nz
        edgeUnder = !level && facing === DOWN && cross * cross > OVERHANG * OVERHANG * (cross * cross + nx * nx + nz * nz)
        if (!level && !side && !edgeUnder) continue
        edgeFacing = level ? facing : SIDE
        edgeLow = level ? (a.y + b.y + c.y) / 3 : Math.min(a.y, b.y, c.y)
        edgeHigh = level ? edgeLow : Math.max(a.y, b.y, c.y)
        edgeCells(cells, (a.x - x0) / cell, (a.z - z0) / cell, (b.x - x0) / cell, (b.z - z0) / cell, edge)
        edgeCells(cells, (b.x - x0) / cell, (b.z - z0) / cell, (c.x - x0) / cell, (c.z - z0) / cell, edge)
        edgeCells(cells, (c.x - x0) / cell, (c.z - z0) / cell, (a.x - x0) / cell, (a.z - z0) / cell, edge)
        continue
      }
      // a broad one: its plane at every cell centre inside it
      const det = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z)
      for (let j = j0; j <= j1; j++) {
        const z = z0 + (j + 0.5) * cell
        for (let i = i0; i <= i1; i++) {
          const x = x0 + (i + 0.5) * cell
          const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / det
          const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / det
          if (u < -0.02 || v < -0.02 || u + v > 1.02) continue
          surface(j * cells + i, u * a.y + v * b.y + (1 - u - v) * c.y, facing)
        }
      }
    }
  }
}

/** One column's surfaces and sides, resolved to the bottom of the solid reaching its top. */
class Column {
  private surfaces = 0
  private intervals = 0
  private ys = new Float64Array(64)
  private faces = new Int8Array(64)
  private lows = new Float64Array(128)
  private highs = new Float64Array(128)

  clear(): void {
    this.surfaces = 0
    this.intervals = 0
  }

  /** A level surface, kept highest first, a down face before an up face at a joint. */
  surface(y: number, facing: number): void {
    if (this.surfaces === this.ys.length) {
      this.ys = grow(this.ys)
      const faces = new Int8Array(this.faces.length * 2)
      faces.set(this.faces)
      this.faces = faces
    }
    const ys = this.ys, faces = this.faces
    let p = this.surfaces++
    while (p > 0 && (ys[p - 1] < y - JOINT || (ys[p - 1] < y + JOINT && faces[p - 1] === UP && facing === DOWN))) { ys[p] = ys[p - 1]; faces[p] = faces[p - 1]; p-- }
    ys[p] = y
    faces[p] = facing
  }

  /** A solid height range, kept by its upper end, highest first. */
  side(low: number, high: number): void {
    if (this.intervals === this.lows.length) {
      this.lows = grow(this.lows)
      this.highs = grow(this.highs)
    }
    const lows = this.lows, highs = this.highs
    let p = this.intervals++
    while (p > 0 && highs[p - 1] < high) { lows[p] = lows[p - 1]; highs[p] = highs[p - 1]; p-- }
    lows[p] = low
    highs[p] = high
  }

  bottom(): number {
    // downwards through the surfaces: solid from an up face to the next down face
    let solidFrom = NaN
    for (let p = 0, count = this.surfaces; p < count; p++) {
      const y = this.ys[p]
      if (this.faces[p] === UP) {
        if (Number.isNaN(solidFrom)) solidFrom = y
        continue
      }
      this.side(y, Number.isNaN(solidFrom) ? y : solidFrom)
      solidFrom = NaN
    }
    if (!Number.isNaN(solidFrom)) this.side(-Infinity, solidFrom)
    // the span joined to the top, down to its first gap
    let low = this.lows[0]
    for (let p = 1; p < this.intervals && this.highs[p] >= low - GAP; p++) low = Math.min(low, this.lows[p])
    return this.intervals && Number.isFinite(low) ? Math.max(low, 0) : 0
  }
}

/** Upright sides per cell, as linked lists; a side overlapping the cell's latest merges into it. */
class Sides {
  count = 0
  readonly head: Int32Array
  next = new Int32Array(1 << 16)
  low = new Float32Array(1 << 16)
  high = new Float32Array(1 << 16)

  constructor(cells: number) {
    this.head = new Int32Array(cells).fill(-1)
  }

  add(k: number, low: number, high: number): void {
    const e = this.head[k]
    if (e >= 0 && low <= this.high[e] + GAP && high >= this.low[e] - GAP) {
      this.low[e] = Math.min(this.low[e], low)
      this.high[e] = Math.max(this.high[e], high)
      return
    }
    if (this.count === this.next.length) {
      const next = new Int32Array(this.count * 2)
      next.set(this.next)
      this.next = next
      this.low = grow(this.low)
      this.high = grow(this.high)
    }
    const s = this.count++
    this.next[s] = e
    this.low[s] = low
    this.high[s] = high
    this.head[k] = s
  }
}

function grow<T extends Float32Array | Float64Array>(array: T): T {
  const next = new (array.constructor as new (length: number) => T)(array.length * 2)
  next.set(array)
  return next
}

/** How far (cells) a floor reaches into the open cells of a cutout beside it, and the clearance it needs there (m). */
const GROUND_REACH = 4
const GROUND_CLEAR = 1

/**
 * The ground the AO slices stand on in each cell: its walkable floor. A
 * cutout follows a module's foot; round a tapering shaft it reaches past the
 * shaft, and the open ring there takes the floor beside it. At 0 instead, the
 * ring's slices lay inside the terrace and a shaft's lookups crossed from one
 * ground to the other at a different height on every facet: dark wedges.
 * Cutout cells occupied at that floor (a building's body or roof) stay at 0.
 */
export function groundLevels(floor: Float32Array, { top, bottom }: Occupancy, cells: number): Float32Array {
  let ground = Float32Array.from(floor)
  let next = new Float32Array(ground.length)
  for (let pass = 0; pass < GROUND_REACH; pass++) {
    next.set(ground)
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
      const k = j * cells + i
      if (!Number.isNaN(ground[k])) continue
      let best = NaN
      if (i > 0 && !(ground[k - 1] <= best)) best = ground[k - 1]
      if (i < cells - 1 && !(ground[k + 1] <= best)) best = ground[k + 1]
      if (j > 0 && !(ground[k - cells] <= best)) best = ground[k - cells]
      if (j < cells - 1 && !(ground[k + cells] <= best)) best = ground[k + cells]
      if (Number.isNaN(best)) continue
      if (top[k] <= best + GROUND_CLEAR || bottom[k] >= best + GROUND_CLEAR) next[k] = best
    }
    const swap = ground
    ground = next
    next = swap
  }
  for (let k = 0; k < ground.length; k++) if (Number.isNaN(ground[k])) ground[k] = 0
  return ground
}

/** Supercover DDA in cell coordinates: visit only cells crossed by an edge. */
export function edgeCells(cells: number, ax: number, az: number, bx: number, bz: number, visit: (k: number) => void): void {
  let i = Math.floor(ax), j = Math.floor(az)
  const endI = Math.floor(bx), endJ = Math.floor(bz)
  const dx = bx - ax, dz = bz - az, sx = Math.sign(dx), sz = Math.sign(dz)
  const stepX = dx === 0 ? Infinity : 1 / Math.abs(dx), stepZ = dz === 0 ? Infinity : 1 / Math.abs(dz)
  let nextX = dx === 0 ? Infinity : ((sx > 0 ? i + 1 : i) - ax) / dx
  let nextZ = dz === 0 ? Infinity : ((sz > 0 ? j + 1 : j) - az) / dz
  const write = (x: number, z: number): void => {
    if (x >= 0 && z >= 0 && x < cells && z < cells) visit(z * cells + x)
  }
  write(i, j)
  for (let left = Math.abs(endI - i) + Math.abs(endJ - j) + 1; (i !== endI || j !== endJ) && left-- > 0;) {
    if (Math.abs(nextX - nextZ) < 1e-10) {
      write(i + sx, j); write(i, j + sz)
      i += sx; j += sz; nextX += stepX; nextZ += stepZ
    } else if (nextX < nextZ) { i += sx; nextX += stepX }
    else { j += sz; nextZ += stepZ }
    write(i, j)
  }
}

/** The highest `height` over the cells an edge crosses. */
export function rasterEdge(heights: Float32Array, cells: number, ax: number, az: number, bx: number, bz: number, height: number): void {
  edgeCells(cells, ax, az, bx, bz, (k) => { heights[k] = Math.max(heights[k], height) })
}
