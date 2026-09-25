import type { CircleCollider, SegmentCollider } from '../../../game/types'

/**
 * Fort plans: where everything in a fort stands, decided before any triangle
 * (fort/build.ts compiles the plan into geometry; the enemies read the same
 * plan for their posts, spawn doors, gates and walls).
 *
 * A fort is a garrison compound for the 3 m robot soldiers, scaled to them:
 * a ring of 5.2 m precast T-wall slabs on an irregular octagon, concrete
 * pillars at the corners, two gates on opposite sides, watchtowers inside
 * four corners, a Quonset hangar the garrison rolls out of, a command bunker,
 * container stacks, fuel tanks, gabion (HESCO) cover and floodlight masts,
 * with an open yard in the middle to fight in. Frame: fort centre at the
 * origin, +z the fort's front (its first gate), metres, y up; the site's yaw
 * turns it in the world.
 */

export interface FortSite {
  id: string
  /** world position of the centre and heading of the front (rad, three.js yaw about +y) */
  x: number
  z: number
  yaw: number
  seed: number
  /** wall ring's mean corner radius (m) */
  radius: number
}

/** The desert's forts: landmarks at driving distance from the start. */
export const FORT_SITES: readonly FortSite[] = [
  { id: 'north', x: 150, z: 205, yaw: 3.75, seed: 11, radius: 44 },
  { id: 'west', x: -290, z: 95, yaw: 1.2, seed: 23, radius: 40 },
  { id: 'south', x: 40, z: -310, yaw: 0.25, seed: 37, radius: 46 },
]

/** Precast T-wall slab: width along the wall, total height, stem thickness at base / top, footing depth and height. */
export const T_WALL = { width: 1.6, height: 5.2, stem: 0.42, top: 0.3, foot: 1.9, footH: 0.5, gap: 0.035 }
/** Corner pillar footprint (square) and height; gate pillar likewise. */
export const CORNER_PILLAR = { size: 3.0, height: 6.0 }
export const GATE_PILLAR = { size: 1.9, height: 6.6 }
/** Gate opening between the pillars (m): room for the truck robot to walk in. */
export const GATE_WIDTH = 15
/** Distance of the car barrier ring outside the wall's farthest corner (m). */
export const BARRIER_MARGIN = 14

export type Xz = [number, number]

export interface WallRun {
  /** slab centre positions and the run's direction (unit, along the wall) */
  a: Xz
  b: Xz
  slabs: number
}

export interface Gate {
  /** gate centre on the wall line, its outward normal, and waypoints just inside and outside */
  at: Xz
  out: Xz
  inside: Xz
  outside: Xz
  /** pillars either side of the opening */
  pillars: [Xz, Xz]
  /** which side the sliding leaf is parked on (+1 toward `pillars[1]`) */
  leaf: 1 | -1
}

export interface Placed {
  at: Xz
  /** heading of the module's front (+z) in the fort frame (rad) */
  yaw: number
}

export interface Hangar extends Placed {
  width: number
  length: number
  height: number
  door: { width: number; height: number }
}

export interface Box extends Placed {
  size: [number, number, number]
  /** variant index (container paint, crate kind...) */
  kind: number
  /** height of its floor (a stacked container) */
  y?: number
}

export interface FortPlan {
  site: FortSite
  /** wall polygon corners (CCW), fort frame */
  corners: Xz[]
  walls: WallRun[]
  gates: Gate[]
  towers: Placed[]
  hangars: Hangar[]
  bunker: Box
  containers: Box[]
  tanks: Placed[]
  hescos: Box[]
  barriers: Placed[]
  masts: Placed[]
  /** where idle soldiers stand guard (facing outward-ish), and the hangar doors they spawn from */
  posts: Placed[]
  spawns: Array<{ at: Xz; exit: Xz }>
  /** collision in the fort frame: slab runs, buildings as segments, round things as circles */
  segments: SegmentCollider[]
  circles: CircleCollider[]
  /** the ring (m, fort centre) the car cannot pass, and the farthest wall corner */
  barrier: number
  outer: number
}

function rng(seed: number): () => number {
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
const scale = (a: Xz, k: number): Xz => [a[0] * k, a[1] * k]
const lerp2 = (a: Xz, b: Xz, t: number): Xz => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

/** Box collider as four capsule segments (radius r) around a rotated rectangle. */
function boxSegments(at: Xz, yaw: number, w: number, d: number, r = 0.2): SegmentCollider[] {
  const hw = w / 2 - r, hd = d / 2 - r
  const c = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map((p) => add(at, rot(p as Xz, yaw)))
  return c.map((p, i) => ({ ax: p[0], az: p[1], bx: c[(i + 1) % 4][0], bz: c[(i + 1) % 4][1], r }))
}

export function planFort(site: FortSite): FortPlan {
  const rand = rng(site.seed)
  const R = site.radius
  // irregular octagon: corners at 22.5 + k 45 deg, radii within +-7 %; the front gate edge (k = 0) faces +z
  const corners: Xz[] = []
  for (let k = 0; k < 8; k++) {
    // angle from +z toward +x; the edge between the last and first corners crosses +z
    const a = Math.PI / 8 + (k * Math.PI) / 4 + (rand() - 0.5) * 0.08
    const r = R * (1 + (rand() - 0.5) * 0.14)
    corners.push([Math.sin(a) * r, Math.cos(a) * r])
  }
  // edge k runs corners[k] -> corners[k+1]; make the polygon CCW in (x, z)
  let area = 0
  for (let k = 0; k < 8; k++) area += corners[k][0] * corners[(k + 1) % 8][1] - corners[(k + 1) % 8][0] * corners[k][1]
  if (area < 0) corners.reverse()
  // gate edges: the front (the edge crossing +z) and both flanks; the hangar fills the back
  const mid = (k: number): Xz => lerp2(corners[k], corners[(k + 1) % 8], 0.5)
  let front = 0
  let right = 0
  let left = 0
  for (let k = 1; k < 8; k++) {
    if (mid(k)[1] > mid(front)[1]) front = k
    if (mid(k)[0] > mid(right)[0]) right = k
    if (mid(k)[0] < mid(left)[0]) left = k
  }
  const gateEdges = [front, right, left]

  const walls: WallRun[] = []
  const gates: Gate[] = []
  const segments: SegmentCollider[] = []
  const circles: CircleCollider[] = []
  const half = CORNER_PILLAR.size / 2
  // the stem's face, not the footing's toe: the footing is low, and the robot's own radius covers its feet
  const wallR = 0.55
  for (let k = 0; k < 8; k++) {
    const a = corners[k], b = corners[(k + 1) % 8]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const dir: Xz = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
    const out: Xz = [dir[1], -dir[0]]
    // runs start and end at the corner pillars' faces
    const s0 = half + 0.05, s1 = len - half - 0.05
    const runs: Array<[number, number]> = []
    if (gateEdges.includes(k)) {
      const c = len / 2 + (rand() - 0.5) * len * 0.12
      const g0 = c - GATE_WIDTH / 2 - GATE_PILLAR.size, g1 = c + GATE_WIDTH / 2 + GATE_PILLAR.size
      runs.push([s0, g0], [g1, s1])
      const at = add(a, scale(dir, c))
      const p0 = add(a, scale(dir, c - GATE_WIDTH / 2 - GATE_PILLAR.size / 2))
      const p1 = add(a, scale(dir, c + GATE_WIDTH / 2 + GATE_PILLAR.size / 2))
      gates.push({ at, out, inside: add(at, scale(out, -7)), outside: add(at, scale(out, 9)), pillars: [p0, p1], leaf: rand() < 0.5 ? 1 : -1 })
      for (const p of [p0, p1]) segments.push(...boxSegments(p, Math.atan2(dir[0], dir[1]), GATE_PILLAR.size, GATE_PILLAR.size, 0.3))
    } else runs.push([s0, s1])
    for (const [u0, u1] of runs) {
      const slabs = Math.max(1, Math.floor((u1 - u0) / T_WALL.width))
      const used = slabs * T_WALL.width
      const m = (u0 + u1) / 2
      const ra = add(a, scale(dir, m - used / 2)), rb = add(a, scale(dir, m + used / 2))
      walls.push({ a: ra, b: rb, slabs })
      segments.push({ ax: ra[0], az: ra[1], bx: rb[0], bz: rb[1], r: wallR })
    }
    // corner pillar
    segments.push(...boxSegments(a, Math.atan2(dir[0], dir[1]), CORNER_PILLAR.size, CORNER_PILLAR.size, 0.3))
  }
  // the front gate first
  gates.sort((a, b) => b.at[1] - a.at[1])
  const outer = Math.max(...corners.map((c) => Math.hypot(c[0], c[1])))

  // watchtowers inside every other corner, pulled toward the centre
  const towers: Placed[] = []
  for (let k = 1; k < 8; k += 2) {
    const c = corners[k]
    const r = Math.hypot(c[0], c[1])
    const at = scale(c, (r - 5.2) / r)
    towers.push({ at, yaw: Math.atan2(c[0], c[1]) })
    circles.push({ x: at[0], z: at[1], r: 2.6 })
  }
  // floodlight masts inside the other corners that are not gates' neighbours
  const masts: Placed[] = []
  for (let k = 0; k < 8; k += 2) {
    const c = corners[k]
    const r = Math.hypot(c[0], c[1])
    const at = scale(c, (r - 4.4) / r)
    masts.push({ at, yaw: Math.atan2(-c[0], -c[1]) })
    circles.push({ x: at[0], z: at[1], r: 0.6 })
  }

  // the garrison hangar at the back, its door facing the yard
  const hangar: Hangar = { at: [(rand() - 0.5) * 6, -R * 0.52], yaw: 0, width: 17, length: 22, height: 8.4, door: { width: 8.5, height: 6.0 } }
  const hangars = [hangar]
  // its sides and back, and the front either side of the door (the garrison rolls out through it)
  {
    const r = 0.4, hw = hangar.width / 2 - r, hl = hangar.length / 2 - r, dw = hangar.door.width / 2 + 0.3
    const p = (x: number, z: number): Xz => add(hangar.at, rot([x, z], hangar.yaw))
    const seg = (a: Xz, b: Xz): SegmentCollider => ({ ax: a[0], az: a[1], bx: b[0], bz: b[1], r })
    segments.push(seg(p(-hw, -hl), p(hw, -hl)), seg(p(hw, -hl), p(hw, hl)), seg(p(-hw, hl), p(-hw, -hl)), seg(p(hw, hl), p(dw, hl)), seg(p(-dw, hl), p(-hw, hl)))
  }
  const doorAt = add(hangar.at, rot([0, hangar.length / 2], hangar.yaw))
  const spawns = [{ at: add(hangar.at, rot([0, hangar.length / 2 - 4], hangar.yaw)), exit: add(doorAt, rot([0, 6], hangar.yaw)) }]

  // command bunker in the back-left quarter, facing the yard
  const bunkerAt: Xz = [-R * 0.52, -R * 0.36 + (rand() - 0.5) * 3]
  const bunker: Box = { at: bunkerAt, yaw: Math.atan2(-bunkerAt[0], -bunkerAt[1]) + (rand() - 0.5) * 0.15, size: [12, 4.6, 9], kind: 0 }
  segments.push(...boxSegments(bunker.at, bunker.yaw, bunker.size[0], bunker.size[2], 0.3))

  // containers in the back-right quarter beside the hangar: a stack of two and a single, 40 ft (12.2 x 2.6 x 2.44)
  const containers: Box[] = []
  const cx = R * 0.5, cz = -R * 0.3 + (rand() - 0.5) * 3
  const cyaw = -0.55 + (rand() - 0.5) * 0.1
  const box: [number, number, number] = [2.44, 2.59, 12.19]
  containers.push({ at: [cx, cz - 1.6], yaw: cyaw, size: box, kind: 0 })
  containers.push({ at: [cx, cz - 1.6], yaw: cyaw + 0.03, size: box, kind: 1, y: 2.59 })
  containers.push({ at: add([cx, cz], rot([3.3, 0.8], cyaw)), yaw: cyaw - 0.05, size: box, kind: 2 })
  for (const c of containers) if (!c.y) segments.push(...boxSegments(c.at, c.yaw, 2.44, 12.19, 0.2))

  // fuel tanks in the front-left quarter, lying along the wall side by side
  const tankAt: Xz = [-R * 0.5, R * 0.48]
  const radial = Math.hypot(tankAt[0], tankAt[1])
  const out: Xz = [tankAt[0] / radial, tankAt[1] / radial]
  const along = Math.atan2(out[0], out[1]) + Math.PI / 2
  const tanks: Placed[] = [
    { at: add(tankAt, scale(out, -1.8)), yaw: along },
    { at: add(tankAt, scale(out, 1.8)), yaw: along },
  ]
  for (const t of tanks) segments.push(...boxSegments(t.at, t.yaw, 3.4, 9.5, 0.4))

  // gabion cover lines inside each gate, offset so the gate stays open
  const hescos: Box[] = []
  const barriers: Placed[] = []
  for (const g of gates) {
    const along: Xz = [-g.out[1], g.out[0]]
    const side = rand() < 0.5 ? 1 : -1
    const base = add(g.inside, scale(g.out, -4))
    for (let i = 0; i < 4; i++) {
      const at = add(base, scale(along, side * (5 + i * 2.1)))
      hescos.push({ at, yaw: Math.atan2(along[0], along[1]), size: [2.1, 2.3, 2.1], kind: i })
    }
    const a0 = add(base, scale(along, side * 4)), a1 = add(base, scale(along, side * (5 + 3 * 2.1 + 1)))
    segments.push({ ax: a0[0], az: a0[1], bx: a1[0], bz: a1[1], r: 1.1 })
    // jersey barriers lining the approach either side (end on to the gate); the opening stays its full width
    const radial = Math.atan2(-g.out[1], g.out[0])
    for (const sgn of [-1, 1]) {
      for (const d of [4.5, 9.2]) {
        const at = add(g.at, add(scale(along, sgn * (GATE_WIDTH / 2 + 1.4 + (d > 5 ? 0.9 : 0))), scale(g.out, d)))
        barriers.push({ at, yaw: radial + (rand() - 0.5) * 0.12 })
        segments.push({ ax: at[0] - g.out[0] * 1.8, az: at[1] - g.out[1] * 1.8, bx: at[0] + g.out[0] * 1.8, bz: at[1] + g.out[1] * 1.8, r: 0.4 })
      }
    }
  }

  // guard posts: a ring round the yard and a pair inside each gate
  const posts: Placed[] = []
  const n = 10
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.3
    const r = R * (0.3 + rand() * 0.14)
    const at: Xz = [Math.sin(a) * r, Math.cos(a) * r]
    posts.push({ at, yaw: Math.atan2(at[0], at[1]) })
  }
  for (const g of gates) {
    const along: Xz = [-g.out[1], g.out[0]]
    for (const s of [-1, 1]) posts.push({ at: add(g.inside, scale(along, s * 3.2)), yaw: Math.atan2(g.out[0], g.out[1]) })
  }

  return {
    site, corners, walls, gates, towers, hangars, bunker, containers, tanks, hescos, barriers, masts, posts, spawns,
    segments, circles, barrier: outer + BARRIER_MARGIN, outer,
  }
}

/** Whether a fort-frame point lies inside the wall polygon. */
export function insideWalls(plan: FortPlan, x: number, z: number): boolean {
  const c = plan.corners
  let inside = false
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const [xi, zi] = c[i], [xj, zj] = c[j]
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}
