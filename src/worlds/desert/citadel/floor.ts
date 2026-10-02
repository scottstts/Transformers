import { DataTexture, FloatType, NearestFilter, RedFormat, type Node } from 'three/webgpu'
import { clamp, float, floor, int, ivec2, select, textureLoad, uniform, vec2 } from 'three/tsl'
import { cellOf, fillPolygon, gridOver, insidePolygon, type Grid } from './polygon'
import type { CitadelPlan, CitadelSite, Surface } from './plan'

/**
 * The citadel's walkable floor (plan.ts `floor`): one height and one surface
 * class per point, from its primitives (level polygons and ramps). The floor
 * is single-valued, so a point lies on at most one level.
 *
 * - CPU: the exact height and class at a world point, from the primitives
 *   binned on an 8 m grid (`height`, `surface`; NaN / null off the floor:
 *   the open desert, and the footprints of walls and buildings). The last
 *   primitive hit is tried first: queries come in runs over one place.
 * - GPU: a floor map (`node`): every 0.5 m cell's height and class in one
 *   float, for marks drawn over the floor (their height and the level they
 *   belong to) and the ambient occlusion's slices. Off the floor it reads as
 *   sand at height 0, the desert's pad.
 */

export const SURFACES: readonly Surface[] = ['sand', 'ceramic', 'deck']
/** A surface's code in the floor map (its index in SURFACES). */
export const SURFACE_CODE: Record<Surface, number> = { sand: 0, ceramic: 1, deck: 2 }
/** The floor map packs a cell as height + CLASS_STEP * class (heights stay far below it; float32 keeps 0.3 mm there). */
const CLASS_STEP = 1000
const BIN = 8
const MAP_CELL = 0.5

interface Piece {
  poly: ReadonlyArray<readonly [number, number]>
  x0: number
  z0: number
  x1: number
  z1: number
  /** level: y0 = y1; a ramp rises from y0 at (ax, az) along (ux, uz)/len to y1 */
  y0: number
  y1: number
  ax: number
  az: number
  ux: number
  uz: number
  len: number
  code: number
}

export class CitadelFloor {
  private readonly pieces: Piece[]
  private readonly patches: Piece[]
  private readonly bins: Grid
  /** CSR bins: the pieces (and, offset by pieces.length, patches) over each bin */
  private readonly start: Int32Array
  private readonly items: Int32Array
  private readonly site: CitadelSite
  private readonly c: number
  private readonly s: number
  private last = -1
  /** the floor map: a 0.5 m grid of the fort frame and its packed cells */
  readonly map: Grid
  readonly cells: Float32Array
  /** CPU-only coverage of the floor raster, distinguishing a sand floor at 0 from no floor. */
  private readonly coverage: Uint8Array
  private readonly texture: DataTexture
  private readonly cosYaw = uniform(0)
  private readonly sinYaw = uniform(0)

  constructor(plan: CitadelPlan) {
    this.site = plan.site
    this.c = Math.cos(plan.site.yaw)
    this.s = Math.sin(plan.site.yaw)
    this.cosYaw.value = this.c
    this.sinYaw.value = this.s
    this.pieces = plan.floor.map((f) => piece(f.polygon, f.kind === 'ramp' ? f.y : [f.y, f.y], f.kind === 'ramp' ? f.axis : null, SURFACE_CODE[f.surface]))
    this.patches = plan.surfaces.map((p) => piece(p.polygon, [p.y, p.y], null, SURFACE_CODE[p.surface]))
    const { x0, z0, x1, z1 } = plan.bounds
    this.bins = gridOver(x0 - BIN, z0 - BIN, x1 + BIN, z1 + BIN, BIN)
    const all = [...this.pieces, ...this.patches]
    const counts = new Int32Array(this.bins.nx * this.bins.nz + 1)
    const each = (p: Piece, visit: (bin: number) => void): void => {
      const g = this.bins
      const i0 = Math.floor((p.x0 - g.x0) / BIN), i1 = Math.floor((p.x1 - g.x0) / BIN)
      const j0 = Math.floor((p.z0 - g.z0) / BIN), j1 = Math.floor((p.z1 - g.z0) / BIN)
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) visit(j * g.nx + i)
    }
    for (const p of all) each(p, (b) => counts[b + 1]++)
    for (let b = 0; b < counts.length - 1; b++) counts[b + 1] += counts[b]
    this.start = counts
    this.items = new Int32Array(counts[counts.length - 1])
    const fill = counts.slice()
    all.forEach((p, k) => each(p, (b) => { this.items[fill[b]++] = k }))

    // the floor map: each primitive over the cells whose centres it holds, then the surface patches on their level
    this.map = gridOver(x0 - 2, z0 - 2, x1 + 2, z1 + 2, MAP_CELL)
    const n = this.map.nx * this.map.nz
    const height = new Float32Array(n).fill(-Infinity)
    const code = new Uint8Array(n)
    for (const p of this.pieces) {
      fillPolygon(this.map, p.poly, (cell) => {
        const y = levelAt(p, this.map.x0 + ((cell % this.map.nx) + 0.5) * MAP_CELL, this.map.z0 + (Math.floor(cell / this.map.nx) + 0.5) * MAP_CELL)
        if (y > height[cell]) { height[cell] = y; code[cell] = p.code }
      })
    }
    for (const p of this.patches) fillPolygon(this.map, p.poly, (cell) => { if (Math.abs(height[cell] - p.y0) < 0.05) code[cell] = p.code })
    this.cells = new Float32Array(n)
    this.coverage = new Uint8Array(n)
    for (let k = 0; k < n; k++) {
      this.coverage[k] = height[k] === -Infinity ? 0 : 1
      this.cells[k] = this.coverage[k] ? height[k] + CLASS_STEP * code[k] : 0
    }
    this.texture = new DataTexture(this.cells, this.map.nx, this.map.nz, RedFormat, FloatType)
    this.texture.minFilter = this.texture.magFilter = NearestFilter
    this.texture.generateMipmaps = false
    this.texture.needsUpdate = true
  }

  /** world (x, z) into the fort frame */
  private local(x: number, z: number): { x: number; z: number } {
    const dx = x - this.site.x, dz = z - this.site.z
    _p.x = dx * this.c - dz * this.s
    _p.z = dx * this.s + dz * this.c
    return _p
  }

  /** The floor primitive under a fort-frame point (index), or -1. */
  private find(x: number, z: number): number {
    const last = this.last
    if (last >= 0 && holds(this.pieces[last], x, z)) return last
    const b = cellOf(this.bins, x, z)
    if (b < 0) return -1
    let best = -1, top = -Infinity
    for (let k = this.start[b]; k < this.start[b + 1]; k++) {
      const i = this.items[k]
      if (i >= this.pieces.length) continue
      const p = this.pieces[i]
      if (!holds(p, x, z)) continue
      // on a shared edge between levels, the higher one
      const y = levelAt(p, x, z)
      if (y > top) { top = y; best = i }
    }
    if (best >= 0) this.last = best
    return best
  }

  /** Floor height at a world point (m), or NaN off the floor. */
  height(x: number, z: number): number {
    const p = this.local(x, z)
    const i = this.find(p.x, p.z)
    return i < 0 ? NaN : levelAt(this.pieces[i], p.x, p.z)
  }

  /** Constant-time CPU read of the GPU floor raster for startup bakes; NaN off the floor. */
  rasterHeight(x: number, z: number): number {
    const p = this.local(x, z), m = this.map
    const i = Math.floor((p.x - m.x0) / m.cell), j = Math.floor((p.z - m.z0) / m.cell)
    if (i < 0 || j < 0 || i >= m.nx || j >= m.nz) return NaN
    const k = j * m.nx + i
    if (!this.coverage[k]) return NaN
    const v = this.cells[k]
    return v - CLASS_STEP * Math.floor(v / CLASS_STEP + 1e-4)
  }

  /** Surface class at a world point, or null off the floor. */
  surface(x: number, z: number): Surface | null {
    const p = this.local(x, z)
    const i = this.find(p.x, p.z)
    if (i < 0) return null
    const piece = this.pieces[i]
    const y = levelAt(piece, p.x, p.z)
    const b = cellOf(this.bins, p.x, p.z)
    for (let k = this.start[b]; k < this.start[b + 1]; k++) {
      const j = this.items[k] - this.pieces.length
      if (j < 0) continue
      const patch = this.patches[j]
      if (Math.abs(patch.y0 - y) < 0.05 && holds(patch, p.x, p.z)) return SURFACES[patch.code]
    }
    return SURFACES[piece.code]
  }

  /**
   * The floor map at a world xz node: (height, surface code). Off the map,
   * and off the floor within it, sand at 0.
   */
  node(xz: Node<'vec2'>): { height: Node<'float'>; code: Node<'float'> } {
    const m = this.map
    const d = xz.sub(vec2(this.site.x, this.site.z))
    const lx = d.x.mul(this.cosYaw).sub(d.y.mul(this.sinYaw))
    const lz = d.x.mul(this.sinYaw).add(d.y.mul(this.cosYaw))
    const i = floor(lx.sub(m.x0).div(m.cell)), j = floor(lz.sub(m.z0).div(m.cell))
    const on = i.greaterThanEqual(0).and(j.greaterThanEqual(0)).and(i.lessThan(m.nx)).and(j.lessThan(m.nz))
    const texel = textureLoad(this.texture, ivec2(int(clamp(i, 0, m.nx - 1)), int(clamp(j, 0, m.nz - 1)))).r
    const v = select(on, texel, float(0))
    const code = floor(v.div(CLASS_STEP).add(1e-4))
    return { height: v.sub(code.mul(CLASS_STEP)) as Node<'float'>, code: code as Node<'float'> }
  }
}

function piece(poly: ReadonlyArray<readonly [number, number]>, y: readonly [number, number], axis: readonly [readonly [number, number], readonly [number, number]] | null, code: number): Piece {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
  for (const [x, z] of poly) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z) }
  const ax = axis ? axis[0][0] : 0, az = axis ? axis[0][1] : 0
  const ux = axis ? axis[1][0] - ax : 1, uz = axis ? axis[1][1] - az : 0
  const len = Math.hypot(ux, uz) || 1
  return { poly, x0, z0, x1, z1, y0: y[0], y1: y[1], ax, az, ux: ux / len, uz: uz / len, len, code }
}

function holds(p: Piece, x: number, z: number): boolean {
  return x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1 && insidePolygon(p.poly, x, z)
}

/** The primitive's height at a fort-frame point: its level, or the ramp's plane through its step midpoints. */
function levelAt(p: Piece, x: number, z: number): number {
  if (p.y0 === p.y1) return p.y0
  const t = Math.min(1, Math.max(0, ((x - p.ax) * p.ux + (z - p.az) * p.uz) / p.len))
  return p.y0 + (p.y1 - p.y0) * t
}

const _p = { x: 0, z: 0 }
