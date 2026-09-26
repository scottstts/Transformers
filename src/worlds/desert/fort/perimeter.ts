import type { SegmentCollider } from '../../../game/types'
import { boxSegments } from './layout'
import { CORNER_PILLAR, GATE_PILLAR, GATE_WIDTH, T_WALL, type Gate, type GateKind, type Module, type WallRun, type Xz } from './plan'
import type { Dividers } from './sectors'

/**
 * The perimeter and the T-wall lines it shares with the dividers.
 *
 * The perimeter is an irregular ten-sided ring about the citadel's centre:
 * a corner on every divider's ray (so each divider meets the ring at a
 * corner pillar, never mid-run), two more framing the front edge with the
 * main gate and two framing the rear edge with the rear gate. The flank
 * gates sit on the edges between the front dividers and the side ones.
 */

const add = (a: Xz, b: Xz): Xz => [a[0] + b[0], a[1] + b[1]]
const scale = (a: Xz, k: number): Xz => [a[0] * k, a[1] * k]

/** The ring's corners about the centre: bearing (deg; the dividers' own come from the citadel) and radius (m). */
const FRONT = 25
const BACK = 160
const RADII = { front: 178, frontDivider: 190, side: 172, backDivider: 175, back: 150 }

/** The stem's face, not the footing's toe: the footing is low, and a body's own radius covers its feet. */
export const WALL_R = 0.55

export interface Perimeter {
  corners: Xz[]
  walls: WallRun[]
  gates: Gate[]
  segments: SegmentCollider[]
  /** corner pillars (their colliders come with them as modules) */
  pillars: Module[]
}

/**
 * Slabs along a - b between `t0` and `t1` (distance from a), leaving an
 * opening (plus its gate pillars) round every centre in `gaps`: the runs go
 * into `walls`, their capsules into `segments`.
 */
export function slabLine(a: Xz, b: Xz, t0: number, t1: number, gaps: ReadonlyArray<{ c: number; width: number }>, wire: boolean, walls: WallRun[], segments: SegmentCollider[]): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const dir: Xz = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
  const runs: Array<[number, number]> = []
  let from = t0
  for (const g of [...gaps].sort((p, q) => p.c - q.c)) {
    runs.push([from, g.c - g.width / 2 - GATE_PILLAR.size])
    from = g.c + g.width / 2 + GATE_PILLAR.size
  }
  runs.push([from, t1])
  for (const [u0, u1] of runs) {
    if (u1 - u0 < T_WALL.width) continue
    const slabs = Math.floor((u1 - u0) / T_WALL.width)
    const used = slabs * T_WALL.width
    const m = (u0 + u1) / 2
    const ea = add(a, scale(dir, m - used / 2)), eb = add(a, scale(dir, m + used / 2))
    walls.push({ a: ea, b: eb, slabs, wire })
    segments.push({ ax: ea[0], az: ea[1], bx: eb[0], bz: eb[1], r: WALL_R })
  }
}

/**
 * A gate in the line a - b at distance `c` from a: its pillars' colliders,
 * its waypoints `before` m behind it (-out) and `beyond` m in front (+out).
 */
export function lineGate(a: Xz, b: Xz, c: number, out: Xz, kind: GateKind, width: number, before: number, beyond: number, leaf: 1 | -1, segments: SegmentCollider[]): Gate {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const dir: Xz = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
  const at = add(a, scale(dir, c))
  const p0 = add(a, scale(dir, c - width / 2 - GATE_PILLAR.size / 2))
  const p1 = add(a, scale(dir, c + width / 2 + GATE_PILLAR.size / 2))
  for (const p of [p0, p1]) segments.push(...boxSegments(p, Math.atan2(dir[0], dir[1]), GATE_PILLAR.size, GATE_PILLAR.size, 0.3))
  // the pillars are listed along `along` = (-out.z, out.x), as the gate builder lays them out
  const along: Xz = [-out[1], out[0]]
  const flip = dir[0] * along[0] + dir[1] * along[1] < 0
  return {
    kind, at, out, width, leaf,
    inside: add(at, scale(out, -before)),
    outside: add(at, scale(out, beyond)),
    pillars: flip ? [p1, p0] : [p0, p1],
    sectors: [-1, -1],
  }
}

export function planPerimeter(centre: Xz, dividers: Dividers, rand: () => number): Perimeter {
  const deg = Math.PI / 180
  const spec: Array<{ a: number; r: number; divider: number }> = [
    { a: -FRONT * deg, r: RADII.front, divider: -1 },
    { a: FRONT * deg, r: RADII.front, divider: -1 },
    { a: BACK * deg, r: RADII.back, divider: -1 },
    { a: -BACK * deg, r: RADII.back, divider: -1 },
  ]
  dividers.angles.forEach((a, i) => {
    const side = Math.abs(Math.abs(a) - Math.PI / 2) < 0.05
    spec.push({ a, r: side ? RADII.side : Math.abs(a) < Math.PI / 2 ? RADII.frontDivider : RADII.backDivider, divider: i })
  })
  spec.sort((p, q) => p.a - q.a)
  const corners: Xz[] = spec.map((s) => {
    const r = s.r * (1 + (rand() - 0.5) * 0.04)
    return [centre[0] + Math.sin(s.a) * r, centre[1] + Math.cos(s.a) * r]
  })
  const n = corners.length
  // counter-clockwise (positive area): a slab's +z (its outer face) is then (dz, -dx) of its run
  let area = 0
  for (let k = 0; k < n; k++) area += corners[k][0] * corners[(k + 1) % n][1] - corners[(k + 1) % n][0] * corners[k][1]
  if (area < 0) {
    corners.reverse()
    spec.reverse()
  }

  const walls: WallRun[] = []
  const gates: Gate[] = []
  const segments: SegmentCollider[] = []
  const pillars: Module[] = []
  const half = CORNER_PILLAR.size / 2
  // the gated edges: the front and rear edges, and the edge before each side divider on the front's side
  const sideDividers = dividers.angles.map((a, i) => ({ a, i })).filter((d) => Math.abs(Math.abs(d.a) - Math.PI / 2) < 0.05)
  // (either winding: an edge is gated by the pair of corners it joins)
  const is = (s: { a: number }, deg0: number): boolean => Math.abs(s.a - deg0 * deg) < 1e-6
  const gated = (k: number): boolean => {
    const p = spec[k], q = spec[(k + 1) % n]
    const pair = (u: number, v: number): boolean => (is(p, u) && is(q, v)) || (is(p, v) && is(q, u))
    if (pair(-FRONT, FRONT) || pair(BACK, -BACK)) return true
    // a flank edge: between a side divider and the front divider on its side
    return sideDividers.some((d) => {
      const front = dividers.angles.findIndex((a) => Math.abs(a) < Math.PI / 2 && Math.sign(a) === Math.sign(d.a))
      return (p.divider === d.i && q.divider === front) || (q.divider === d.i && p.divider === front)
    })
  }
  for (let k = 0; k < n; k++) {
    const a = corners[k], b = corners[(k + 1) % n]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const dir: Xz = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
    // outward: away from the centre
    let out: Xz = [dir[1], -dir[0]]
    const mid = add(a, scale(dir, len / 2))
    if ((mid[0] - centre[0]) * out[0] + (mid[1] - centre[1]) * out[1] < 0) out = [-out[0], -out[1]]
    const gaps: Array<{ c: number; width: number }> = []
    if (gated(k)) {
      const c = len / 2 + (rand() - 0.5) * len * 0.06
      gaps.push({ c, width: GATE_WIDTH })
      gates.push(lineGate(a, b, c, out, 'outer', GATE_WIDTH, 9, 11, rand() < 0.5 ? 1 : -1, segments))
    }
    slabLine(a, b, half + 0.05, len - half - 0.05, gaps, true, walls, segments)
    // the corner pillar, square to the edge leaving it (or to its divider)
    const d = spec[k].divider
    const yaw = d >= 0 ? dividers.angles[d] : Math.atan2(dir[0], dir[1])
    pillars.push({ kind: 'pillar', at: a, yaw, size: [CORNER_PILLAR.size, CORNER_PILLAR.height, CORNER_PILLAR.size], variant: 0, y: 0, detail: false })
  }
  // the main gate first
  gates.sort((p, q) => q.at[1] - p.at[1])
  return { corners, walls, gates, segments, pillars }
}
