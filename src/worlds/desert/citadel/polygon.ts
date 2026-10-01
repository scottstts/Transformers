/** Polygons in the fort frame's (x, z): containment and rasterization onto grids. */

export type Polygon = ReadonlyArray<readonly [number, number]>

/** Whether (x, z) lies inside the polygon (even-odd). */
export function insidePolygon(poly: Polygon, x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j]
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** A square grid over a rectangle of the fort frame: `cell` m, its low corner at (x0, z0). */
export interface Grid {
  x0: number
  z0: number
  cell: number
  nx: number
  nz: number
}

export function gridOver(x0: number, z0: number, x1: number, z1: number, cell: number): Grid {
  return { x0, z0, cell, nx: Math.ceil((x1 - x0) / cell), nz: Math.ceil((z1 - z0) / cell) }
}

/** The cell (row-major index) holding (x, z), or -1 off the grid. */
export function cellOf(g: Grid, x: number, z: number): number {
  const i = Math.floor((x - g.x0) / g.cell), j = Math.floor((z - g.z0) / g.cell)
  return i < 0 || j < 0 || i >= g.nx || j >= g.nz ? -1 : j * g.nx + i
}

/**
 * Every cell whose centre lies inside the polygon (even-odd), row by row:
 * the polygon's crossings of each row's centre line bound its spans.
 */
export function fillPolygon(g: Grid, poly: Polygon, visit: (cell: number) => void): void {
  let z0 = Infinity, z1 = -Infinity
  for (const [, z] of poly) { z0 = Math.min(z0, z); z1 = Math.max(z1, z) }
  const j0 = Math.max(0, Math.floor((z0 - g.z0) / g.cell - 0.5)), j1 = Math.min(g.nz - 1, Math.ceil((z1 - g.z0) / g.cell - 0.5))
  const xs: number[] = []
  for (let j = j0; j <= j1; j++) {
    const z = g.z0 + (j + 0.5) * g.cell
    xs.length = 0
    for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
      const [xi, zi] = poly[i], [xk, zk] = poly[k]
      if ((zi > z) !== (zk > z)) xs.push(xi + ((z - zi) * (xk - xi)) / (zk - zi))
    }
    xs.sort((a, b) => a - b)
    for (let s = 0; s + 1 < xs.length; s += 2) {
      const i0 = Math.max(0, Math.ceil((xs[s] - g.x0) / g.cell - 0.5)), i1 = Math.min(g.nx - 1, Math.floor((xs[s + 1] - g.x0) / g.cell - 0.5))
      for (let i = i0; i <= i1; i++) visit(j * g.nx + i)
    }
  }
}
