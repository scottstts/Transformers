import { CORNER_PILLAR, GATE_WIDTH, sectorAt, type FortPlan, type Gate, type Sector, type SectorRole, type Xz } from './plan'
import { lineGate, slabLine } from './perimeter'
import type { CitadelAnchor } from './citadel'

/**
 * The districts: six wedges of the ward about the citadel's centre, split
 * by T-wall dividers that run straight out from the citadel (from each
 * bastion's point and from the middle of each flank curtain) to a corner of
 * the perimeter, and the citadel itself. A wedge's membership is its bearing
 * from the centre, so finding a body's district is a polygon test (the
 * perimeter, the citadel) and an angle.
 *
 * Each divider has a gate halfway along it. With the perimeter's gates and
 * the citadel's two, they make the graph a soldier walks between districts
 * (`planNavigation`).
 */

/** Garrison per district by role: the citadel and the gate court hold the most. */
const GARRISON: Record<SectorRole, number> = { gate: 18, motorPool: 14, airfield: 14, comms: 14, fuel: 12, barracks: 16, citadel: 22 }

export interface Dividers {
  /** divider bearings about the centre (rad, ascending) */
  angles: number[]
  sectors: Sector[]
  /** lay the dividers' slabs and gates, once the perimeter's corners are known */
  build(plan: FortPlan, corners: Xz[], rand: () => number): void
}

/** The role of the wedge centred on bearing `a` (rad): the gate court faces the front. */
function roleOf(a: number): SectorRole {
  const d = (a * 180) / Math.PI
  if (Math.abs(d) < 30) return 'gate'
  if (Math.abs(d) > 150) return 'comms'
  if (d > 0) return d < 90 ? 'motorPool' : 'airfield'
  return d > -90 ? 'barracks' : 'fuel'
}

export function planDividers(centre: Xz, anchors: readonly CitadelAnchor[]): Dividers {
  const spokes = anchors.map((p) => ({ ...p, a: Math.atan2(p.at[0] - centre[0], p.at[1] - centre[1]) })).sort((p, q) => p.a - q.a)
  const angles = spokes.map((s) => s.a)
  const sectors: Sector[] = []
  // wedge 0 wraps round through +-pi (sectorAt's convention), then one per gap between dividers
  const n = angles.length
  for (let k = 0; k < n; k++) {
    const a0 = k === 0 ? angles[n - 1] - Math.PI * 2 : angles[k - 1]
    const a1 = angles[k]
    const mid = (a0 + a1) / 2
    sectors.push({ index: k, role: roleOf(Math.atan2(Math.sin(mid), Math.cos(mid))), a0, a1, yard: { at: [0, 0], r: 0 }, garrison: 0, bounds: { at: [0, 0], r: 0 } })
  }
  sectors.push({ index: n, role: 'citadel', a0: NaN, a1: NaN, yard: { at: [0, 0], r: 0 }, garrison: 0, bounds: { at: [0, 0], r: 0 } })
  for (const s of sectors) s.garrison = GARRISON[s.role]

  const build = (plan: FortPlan, corners: Xz[], rand: () => number): void => {
    plan.spokes = []
    spokes.forEach((s) => {
      // the perimeter corner on this ray
      let corner = corners[0], best = Infinity
      for (const c of corners) {
        const b = Math.atan2(c[0] - centre[0], c[1] - centre[1])
        const d = Math.abs(Math.atan2(Math.sin(b - s.a), Math.cos(b - s.a)))
        if (d < best) { best = d; corner = c }
      }
      // from inside the rampart's face (keyed into it) to the corner pillar's inner face
      const dir: Xz = [Math.sin(s.a), Math.cos(s.a)]
      const a: Xz = [s.at[0] - dir[0] * s.inset, s.at[1] - dir[1] * s.inset]
      const len = Math.hypot(corner[0] - a[0], corner[1] - a[1])
      plan.spokes.push([s.at, corner])
      // the gate near the citadel's end: the gates between districts make a ring round the rampart
      const c = s.inset + GATE_WIDTH / 2 + 14 + (len - s.inset - CORNER_PILLAR.size / 2 - GATE_WIDTH - 28) * 0.18
      const out: Xz = [dir[1], -dir[0]]
      const gate = lineGate(a, corner, c, out, 'inner', GATE_WIDTH, 9, 9, rand() < 0.5 ? 1 : -1, plan.segments)
      plan.gates.push(gate)
      slabLine(a, corner, 0, len - CORNER_PILLAR.size / 2 - 0.05, [{ c, width: GATE_WIDTH }], false, plan.walls, plan.segments)
    })
    // every gate learns the districts either side of it
    for (const g of plan.gates) assignSides(plan, g)
    // bounds: the wedge's corners (its spokes' ends and the perimeter corners between)
    for (const sec of plan.sectors) {
      const pts: Xz[] = sec.role === 'citadel'
        ? plan.citadel
        : [...plan.spokes.filter((sp) => near(bearing(centre, sp[0]), sec.a0) || near(bearing(centre, sp[0]), sec.a1)).flat(),
          ...corners.filter((c) => within(bearing(centre, c), sec.a0, sec.a1))]
      const cx = pts.reduce((v, p) => v + p[0], 0) / pts.length
      const cz = pts.reduce((v, p) => v + p[1], 0) / pts.length
      sec.bounds = { at: [cx, cz], r: Math.max(...pts.map((p) => Math.hypot(p[0] - cx, p[1] - cz))) }
    }
  }
  return { angles, sectors, build }
}

const bearing = (c: Xz, p: Xz): number => Math.atan2(p[0] - c[0], p[1] - c[1])
const near = (a: number, b: number): boolean => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 1e-3
function within(a: number, a0: number, a1: number): boolean {
  const u = a0 + ((((a - a0) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2))
  return u >= a0 - 1e-6 && u <= a1 + 1e-6
}

function assignSides(plan: FortPlan, g: Gate): void {
  g.sectors = [sectorAt(plan, g.inside[0], g.inside[1]), sectorAt(plan, g.outside[0], g.outside[1])]
}

/**
 * The next gate from every district (and outside) toward every other: a
 * breadth-first search over the districts joined by gates, never passing
 * through the outside. nav[a][b] is -1 for a === b.
 */
export function planNavigation(plan: FortPlan): number[][] {
  const count = plan.sectors.length + 1
  const nav: number[][] = []
  for (let from = 0; from < count; from++) {
    const next = new Array<number>(count).fill(-1)
    const seen = new Array<boolean>(count).fill(false)
    seen[from] = true
    // breadth first: the first gate taken out of `from` on the way to each district
    const queue: Array<[number, number]> = []
    plan.gates.forEach((g, gi) => {
      const [p, q] = g.sectors
      const to = p === from ? q : q === from ? p : -1
      if (to >= 0 && !seen[to]) { seen[to] = true; next[to] = gi; queue.push([to, gi]) }
    })
    while (queue.length) {
      const [at, first] = queue.shift()!
      // never out through one gate and in through another: the way lies inside the walls
      if (at === plan.sectors.length) continue
      for (const g of plan.gates) {
        const [p, q] = g.sectors
        const to = p === at ? q : q === at ? p : -1
        if (to >= 0 && !seen[to]) { seen[to] = true; next[to] = first; queue.push([to, first]) }
      }
    }
    nav.push(next)
  }
  return nav
}
