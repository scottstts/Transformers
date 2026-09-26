import type { SegmentCollider } from '../../../game/types'
import { boxSegments } from './layout'
import type { Gate, Module, RampartRun, Xz } from './plan'
import { RAMPART } from './rampart'
import { GATEHOUSE } from './gatehouse'

/**
 * The citadel: a reinforced-concrete rampart on a star trace round the keep.
 * A rectangle of curtain walls (108 x 92 m) whose four corners are pointed
 * bastions: each corner pushed out along its diagonal, its faces running
 * back to shoulders on the curtains either side, so every stretch of wall
 * can be seen from a neighbouring bastion. Two gatehouses pierce it, a
 * bridged one on the front curtain and a plain one on the rear.
 *
 * The rampart is planned as its outer foot line: `ramparts` are the runs
 * between the gatehouses (their ends buried in the towers), `polygon` the
 * whole closed trace (the citadel district's boundary).
 */

/** Curtain half-extents, bastion shoulder distance from the corner along each curtain, and the point's push out along the diagonal (m). */
const HALF_X = 54
const HALF_Z = 46
const SHOULDER = 16
const POINT = 6
/** Gate openings: front (bridged) and rear. */
export const CITADEL_GATES = { front: 16, rear: 14 }

/** Where a divider leaves the citadel: its point on the rampart's foot and how far into the rampart its slabs start. */
export interface CitadelAnchor {
  at: Xz
  inset: number
}

export interface Citadel {
  polygon: Xz[]
  ramparts: RampartRun[]
  gates: Gate[]
  modules: Module[]
  segments: SegmentCollider[]
  anchors: CitadelAnchor[]
}

export function planCitadel(centre: Xz): Citadel {
  const [cx, cz] = centre
  const a = HALF_X, b = HALF_Z, s = SHOULDER, t = POINT
  const P = (x: number, z: number): Xz => [cx + x, cz + z]
  // round from the front curtain's middle (its winding is set below)
  const trace: Xz[] = [
    P(0, b), P(a - s, b), P(a + t, b + t), P(a, b - s),
    P(a, -b + s), P(a + t, -b - t), P(a - s, -b),
    P(0, -b), P(-a + s, -b), P(-a - t, -b - t), P(-a, -b + s),
    P(-a, b - s), P(-a - t, b + t), P(-a + s, b),
  ]
  // a run's outward normal is (dz, -dx) of its direction: at the front curtain the outside is +z, so the
  // trace must run toward -x there
  if (trace[1][0] > trace[0][0]) trace.reverse()
  const polygon = trace.slice()

  // the runs between the gatehouses: from the front gate's tower round to the rear gate's, both ways
  const front = trace.findIndex((p) => p[0] === cx && p[1] === cz + b)
  const rear = trace.findIndex((p) => p[0] === cx && p[1] === cz - b)
  const halfFront = CITADEL_GATES.front / 2 + GATEHOUSE.tower / 2
  const halfRear = CITADEL_GATES.rear / 2 + GATEHOUSE.tower / 2
  const n = trace.length
  const walk = (from: number, to: number): Xz[] => {
    const pts: Xz[] = []
    for (let i = from; ; i = (i + 1) % n) {
      pts.push(trace[i])
      if (i === to) break
    }
    return pts
  }
  // replace a gate's mid point by the tower centre on the run's side of it
  const toward = (p: Xz, q: Xz, d: number): Xz => {
    const l = Math.hypot(q[0] - p[0], q[1] - p[1])
    return [p[0] + ((q[0] - p[0]) / l) * d, p[1] + ((q[1] - p[1]) / l) * d]
  }
  const runA = walk(front, rear)
  runA[0] = toward(runA[0], runA[1], halfFront)
  runA[runA.length - 1] = toward(runA[runA.length - 1], runA[runA.length - 2], halfRear)
  const runB = walk(rear, front)
  runB[0] = toward(runB[0], runB[1], halfRear)
  runB[runB.length - 1] = toward(runB[runB.length - 1], runB[runB.length - 2], halfFront)
  const ramparts: RampartRun[] = [{ points: runA }, { points: runB }]

  // colliders: a capsule down the middle of the rampart's body, from its plinth's toe to its inner face
  const segments: SegmentCollider[] = []
  const r = (RAMPART.thick + RAMPART.toe) / 2
  const inward = RAMPART.thick - r
  for (const run of ramparts) {
    for (let i = 0; i < run.points.length - 1; i++) {
      const p = run.points[i], q = run.points[i + 1]
      const l = Math.hypot(q[0] - p[0], q[1] - p[1])
      const nx = (q[1] - p[1]) / l, nz = -(q[0] - p[0]) / l
      segments.push({ ax: p[0] - nx * inward, az: p[1] - nz * inward, bx: q[0] - nx * inward, bz: q[1] - nz * inward, r })
    }
  }

  // gatehouses on the curtains' middles, facing out; their towers' colliders, the passage left open
  const gates: Gate[] = []
  const modules: Module[] = []
  for (const [side, width] of [[1, CITADEL_GATES.front], [-1, CITADEL_GATES.rear]] as const) {
    const at = P(0, side * b)
    const out: Xz = [0, side]
    const yaw = side > 0 ? 0 : Math.PI
    modules.push({ kind: 'gatehouse', at, yaw, size: [width, GATEHOUSE.height, GATEHOUSE.depth], variant: side > 0 ? 1 : 0, y: 0, detail: false })
    for (const sx of [-1, 1]) {
      const tx = sx * (width / 2 + GATEHOUSE.tower / 2)
      const tz = side * (GATEHOUSE.front - GATEHOUSE.depth / 2)
      segments.push(...boxSegments([at[0] + tx, at[1] + tz], 0, GATEHOUSE.tower, GATEHOUSE.depth, 0.4))
    }
    gates.push({
      kind: 'citadel', at, out, width, leaf: 1,
      inside: [at[0], at[1] - side * (GATEHOUSE.depth - GATEHOUSE.front + 5)],
      outside: [at[0], at[1] + side * (GATEHOUSE.front + 8)],
      pillars: [[at[0] - width / 2, at[1]], [at[0] + width / 2, at[1]]],
      sectors: [-1, -1],
    })
  }

  // dividers leave from the bastions' points and the flank curtains' middles; the slabs start far enough into
  // the rampart that its battered face still covers their ends at the slabs' full height
  const anchors: CitadelAnchor[] = [
    ...[[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([sx, sz]) => ({ at: P(sx * (a + t), sz * (b + t)), inset: 1.6 })),
    { at: P(a, 0), inset: 0.9 },
    { at: P(-a, 0), inset: 0.9 },
  ]
  return { polygon, ramparts, gates, modules, segments, anchors }
}
