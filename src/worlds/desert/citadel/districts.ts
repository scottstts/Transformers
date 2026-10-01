import { cellOf, fillPolygon, gridOver, type Grid } from './polygon'
import { districtAt, outsideSector, type CitadelPlan } from './plan'

/** The district raster's cell (m). */
const CELL = 2

/**
 * Which district every point of the citadel's grounds stands in, as a 2 m
 * raster of the plan's polygons (plan.ts `districtAt`: the highest tier
 * where they nest, an outer gate's passage its district within): a hundred
 * soldiers ask every frame, and a lookup is one array read.
 */
export class CitadelDistricts {
  private readonly grid: Grid
  private readonly cells: Uint8Array
  private readonly outside: number

  constructor(plan: CitadelPlan) {
    this.outside = outsideSector(plan)
    const { x0, z0, x1, z1 } = plan.bounds
    this.grid = gridOver(x0 - CELL, z0 - CELL, x1 + CELL, z1 + CELL, CELL)
    const g = this.grid
    this.cells = new Uint8Array(g.nx * g.nz).fill(this.outside)
    for (const s of [...plan.sectors].sort((a, b) => a.tier - b.tier)) fillPolygon(g, s.polygon, (c) => { this.cells[c] = s.index })
    // the outer gates' passages beyond the curtain's line
    const outer = plan.gates.filter((k) => k.kind === 'outer')
    for (const k of outer) {
      const reach = Math.hypot(k.inside[0] - k.at[0], k.inside[1] - k.at[1]) + k.width
      const i0 = Math.max(0, Math.floor((k.at[0] - reach - g.x0) / CELL)), i1 = Math.min(g.nx - 1, Math.floor((k.at[0] + reach - g.x0) / CELL))
      const j0 = Math.max(0, Math.floor((k.at[1] - reach - g.z0) / CELL)), j1 = Math.min(g.nz - 1, Math.floor((k.at[1] + reach - g.z0) / CELL))
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const c = j * g.nx + i
          if (this.cells[c] === this.outside) this.cells[c] = districtAt(plan, outer, g.x0 + (i + 0.5) * CELL, g.z0 + (j + 0.5) * CELL)
        }
      }
    }
  }

  /** The district at a fort-frame point (`sectors.length` outside the citadel). */
  at(x: number, z: number): number {
    const c = cellOf(this.grid, x, z)
    return c < 0 ? this.outside : this.cells[c]
  }
}
