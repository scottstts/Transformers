import type { CircleCollider, SegmentCollider } from '../../../game/types'
import { LANE, Layout, YARD, boxSegments, insidePolygon, rng } from './layout'

export { LANE, YARD } from './layout'

/**
 * Fort plans: where everything in a fort stands, decided before any triangle
 * (fort/build.ts compiles the plan into geometry; the enemies read the same
 * plan for their posts, spawn doors, gates and walls).
 *
 * A fort is a forward operating base for the 3 m robot soldiers, every part
 * at its real size: a ring of 5.2 m precast T-wall slabs topped with
 * concertina wire on an irregular octagon ~180 m across, concrete pillars at
 * the corners, three gates (front and both flanks) each with a guard booth
 * and a raised boom, watchtowers on every corner, and two Quonset hangars at
 * the back that the garrison rolls out of. The rest is laid out by role in
 * the four quadrants between the gate lanes (layout.ts): barracks (rows of
 * housing units under shade sails), the command post (a two-storey HQ, the
 * old bunker, a lattice radio mast, a helipad), the supply yard (container
 * stacks, a motor-pool canopy, pallets, drums, tyres) and the fuel depot
 * (tanks in a bund, a water tower, generators). A wide yard stays open in the
 * middle to fight in, and the gate lanes stay open to it; power poles run
 * along the lanes and floodlight masts ring the yard.
 *
 * Frame: fort centre at the origin, +z the fort's front (its first gate),
 * metres, y up; the site's yaw turns it in the world.
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
  { id: 'north', x: 170, z: 265, yaw: 3.75, seed: 11, radius: 88 },
  { id: 'west', x: -350, z: 110, yaw: 1.2, seed: 23, radius: 80 },
  { id: 'south', x: 40, z: -380, yaw: 0.25, seed: 37, radius: 92 },
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
export type Xyz = [number, number, number]

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

/** What a placed module is: fort/build.ts picks its builder by kind. */
export type ModuleKind =
  | 'tower' | 'mast' | 'bunker' | 'hq' | 'chu' | 'latrine' | 'booth' | 'boom' | 'canopy' | 'sail'
  | 'container' | 'tank' | 'bund' | 'generator' | 'waterTower' | 'radioMast' | 'pole' | 'helipad'
  | 'hesco' | 'jersey' | 'blastWall' | 'sandbags' | 'drums' | 'crates' | 'tires' | 'waterTank'

export interface Module extends Placed {
  kind: ModuleKind
  /** footprint and height where the module is sized: width (x), height (y), depth (z) */
  size: Xyz
  /** variant (paint, count, arm state...) */
  variant: number
  /** floor height (a stacked container) */
  y: number
  /** small: drawn only from near (the detail buckets) */
  detail: boolean
}

/**
 * A guard post and its beat: the points a soldier at peace walks in turn
 * (fort frame), pausing at each; two points is pacing back and forth, more a
 * patrol loop. The first point is the post itself.
 */
export interface Post extends Placed {
  beat: Xz[]
}

/** A sagging cable between two attachment points (fort frame). */
export interface Cable {
  a: Xyz
  b: Xyz
  sag: number
}

export interface FortPlan {
  site: FortSite
  /** wall polygon corners (CCW), fort frame */
  corners: Xz[]
  walls: WallRun[]
  gates: Gate[]
  hangars: Hangar[]
  modules: Module[]
  cables: Cable[]
  /** where idle soldiers stand guard and the beat each walks from there, and the hangar doors they spawn from */
  posts: Post[]
  spawns: Array<{ at: Xz; exit: Xz }>
  /** collision in the fort frame: slab runs, buildings as segments, round things as circles */
  segments: SegmentCollider[]
  circles: CircleCollider[]
  /** the ring (m, fort centre) the car cannot pass, and the farthest wall corner */
  barrier: number
  outer: number
}

const rot = (p: Xz, yaw: number): Xz => [p[0] * Math.cos(yaw) + p[1] * Math.sin(yaw), -p[0] * Math.sin(yaw) + p[1] * Math.cos(yaw)]
const add = (a: Xz, b: Xz): Xz => [a[0] + b[0], a[1] + b[1]]
const scale = (a: Xz, k: number): Xz => [a[0] * k, a[1] * k]
const lerp2 = (a: Xz, b: Xz, t: number): Xz => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

export function planFort(site: FortSite): FortPlan {
  const rand = rng(site.seed)
  const R = site.radius
  // irregular octagon: corners at 22.5 + k 45 deg, radii within +-6 %; the front gate edge faces +z
  const corners: Xz[] = []
  for (let k = 0; k < 8; k++) {
    const a = Math.PI / 8 + (k * Math.PI) / 4 + (rand() - 0.5) * 0.06
    const r = R * (1 + (rand() - 0.5) * 0.12)
    corners.push([Math.sin(a) * r, Math.cos(a) * r])
  }
  let area = 0
  for (let k = 0; k < 8; k++) area += corners[k][0] * corners[(k + 1) % 8][1] - corners[(k + 1) % 8][0] * corners[k][1]
  if (area < 0) corners.reverse()
  // gate edges: the front (the edge crossing +z) and both flanks; the hangars fill the back
  const mid = (k: number): Xz => lerp2(corners[k], corners[(k + 1) % 8], 0.5)
  let front = 0, right = 0, left = 0
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
    const s0 = half + 0.05, s1 = len - half - 0.05
    const runs: Array<[number, number]> = []
    if (gateEdges.includes(k)) {
      const c = len / 2 + (rand() - 0.5) * len * 0.08
      const g0 = c - GATE_WIDTH / 2 - GATE_PILLAR.size, g1 = c + GATE_WIDTH / 2 + GATE_PILLAR.size
      runs.push([s0, g0], [g1, s1])
      const at = add(a, scale(dir, c))
      const p0 = add(a, scale(dir, c - GATE_WIDTH / 2 - GATE_PILLAR.size / 2))
      const p1 = add(a, scale(dir, c + GATE_WIDTH / 2 + GATE_PILLAR.size / 2))
      gates.push({ at, out, inside: add(at, scale(out, -8)), outside: add(at, scale(out, 10)), pillars: [p0, p1], leaf: rand() < 0.5 ? 1 : -1 })
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
    segments.push(...boxSegments(a, Math.atan2(dir[0], dir[1]), CORNER_PILLAR.size, CORNER_PILLAR.size, 0.3))
  }
  gates.sort((a, b) => b.at[1] - a.at[1])
  const outer = Math.max(...corners.map((c) => Math.hypot(c[0], c[1])))

  const L = new Layout(corners, gates, segments, circles, rand)

  // watchtowers inside every corner, pulled toward the centre
  for (const c of corners) {
    const r = Math.hypot(c[0], c[1])
    L.fixed({ kind: 'tower', at: scale(c, (r - 5.4) / r), yaw: Math.atan2(c[0], c[1]) + Math.PI, size: [4.6, 13, 4.6], variant: 0, y: 0, detail: false }, 2.6)
  }

  // the garrison hangars at the back, side by side, their doors facing the yard
  const hangars: Hangar[] = []
  const spawns: FortPlan['spawns'] = []
  for (const sx of [-1, 1]) {
    const h: Hangar = { at: [sx * 13 + (rand() - 0.5) * 2, -R * 0.56], yaw: 0, width: 18, length: 26, height: 9, door: { width: 9, height: 6.4 } }
    hangars.push(h)
    L.reserve(h.at, h.yaw, h.width + 1, h.length + 1)
    const r = 0.4, hw = h.width / 2 - r, hl = h.length / 2 - r, dw = h.door.width / 2 + 0.3
    const p = (x: number, z: number): Xz => add(h.at, rot([x, z], h.yaw))
    const seg = (a: Xz, b: Xz): SegmentCollider => ({ ax: a[0], az: a[1], bx: b[0], bz: b[1], r })
    segments.push(seg(p(-hw, -hl), p(hw, -hl)), seg(p(hw, -hl), p(hw, hl)), seg(p(-hw, hl), p(-hw, -hl)), seg(p(hw, hl), p(dw, hl)), seg(p(-dw, hl), p(-hw, hl)))
    const doorAt = add(h.at, rot([0, h.length / 2], h.yaw))
    spawns.push({ at: add(h.at, rot([0, h.length / 2 - 4], h.yaw)), exit: add(doorAt, rot([0, 7], h.yaw)) })
    // the apron in front of the door stays clear, wide enough for the guards pacing either side of it
    L.reserve(add(doorAt, rot([0, 5], h.yaw)), h.yaw, h.door.width + 14, 9)
  }
  // between and behind the hangars: generators feeding them, drums, a fuel bowser's worth of drums
  L.place({ kind: 'generator', at: [0, -R * 0.62], yaw: Math.PI / 2, size: [3.6, 2.2, 1.6], variant: 0, y: 0, detail: false }, 0.6)
  L.place({ kind: 'drums', at: [0, -R * 0.5], yaw: rand() * 6, size: [2.4, 1, 2.4], variant: 5, y: 0, detail: true }, 0.4)

  // the gates: a booth beside the lane just inside, the boom raised, sandbag positions, barriers outside
  for (const g of gates) {
    const along: Xz = [-g.out[1], g.out[0]]
    const yawIn = Math.atan2(-g.out[0], -g.out[1])
    const side = rand() < 0.5 ? 1 : -1
    L.fixed({ kind: 'booth', at: add(g.at, add(scale(g.out, -6.5), scale(along, side * (GATE_WIDTH / 2 + 2.4)))), yaw: yawIn + (side > 0 ? -Math.PI / 2 : Math.PI / 2), size: [2.6, 3, 2.6], variant: 0, y: 0, detail: false }, 0)
    L.fixed({ kind: 'boom', at: add(g.at, add(scale(g.out, -3.2), scale(along, side * (GATE_WIDTH / 2 - 0.4)))), yaw: Math.atan2(along[0], along[1]) + (side > 0 ? Math.PI : 0), size: [0.5, 1.2, GATE_WIDTH - 1.5], variant: 1, y: 0, detail: true }, 0.4)
    // sandbag positions either side, behind the wall
    for (const s of [-1, 1]) {
      const at = add(g.at, add(scale(g.out, -11), scale(along, s * (LANE / 2 + 3.5))))
      L.place({ kind: 'sandbags', at, yaw: yawIn, size: [5.2, 1.4, 0.7], variant: 2, y: 0, detail: true }, 0.3)
    }
    // jersey barriers lining the approach outside (end on to the gate); the opening stays its full width
    const radial = Math.atan2(-g.out[1], g.out[0])
    for (const sgn of [-1, 1]) {
      for (const d of [4.5, 9.2, 14]) {
        const at = add(g.at, add(scale(along, sgn * (GATE_WIDTH / 2 + 1.4 + (d > 5 ? 0.9 : 0))), scale(g.out, d)))
        L.outside({ kind: 'jersey', at, yaw: radial + (rand() - 0.5) * 0.12, size: [3.6, 1.1, 0.85], variant: 0, y: 0, detail: false })
        segments.push({ ax: at[0] - g.out[0] * 1.8, az: at[1] - g.out[1] * 1.8, bx: at[0] + g.out[0] * 1.8, bz: at[1] + g.out[1] * 1.8, r: 0.4 })
      }
    }
  }

  // floodlight masts ringing the yard, on the diagonals
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2 + (rand() - 0.5) * 0.1
    const at: Xz = [Math.sin(a) * (YARD + 3), Math.cos(a) * (YARD + 3)]
    L.fixed({ kind: 'mast', at, yaw: Math.atan2(-at[0], -at[1]), size: [1.4, 15, 1.4], variant: 0, y: 0, detail: false }, 0.6)
  }

  // the quadrants between the lanes, each with a role (their order varies by fort)
  const roles = ['fuel', 'barracks', 'supply', 'command']
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[roles[i], roles[j]] = [roles[j], roles[i]]
  }
  // the command post wants the back (it sits behind the hangars' flank), the fuel depot away from the hangars
  const quadrants = [-Math.PI / 4, Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4]
  roles.forEach((role, i) => L.quadrant(role, quadrants[i], R))
  // what a tight quadrant could not take goes wherever there is room
  for (const size of [18, 14]) if (!L.has('helipad')) L.anywhere((at, yaw) => ({ kind: 'helipad', at, yaw, size: [size, 0.25, size], variant: 0, y: 0, detail: false }), 1, R * 0.8)
  if (!L.has('bunker')) L.anywhere((at, yaw) => ({ kind: 'bunker', at, yaw, size: [12, 4.6, 9], variant: 0, y: 0, detail: false }), 1, R * 0.8)
  for (const a of quadrants) L.clutter(a, R)

  // power poles along the lanes, wired pole to pole
  const cables: Cable[] = []
  for (const g of gates) {
    const along: Xz = [-g.out[1], g.out[0]]
    const side = rand() < 0.5 ? 1 : -1
    const reach = Math.hypot(g.at[0], g.at[1])
    const axis = scale(g.at, 1 / reach)
    let last: Xz | null = null
    for (let d = reach - 10; d > YARD + 4; d -= 17) {
      const at = add(scale(axis, d), scale(along, side * (LANE / 2 + 0.8)))
      if (!L.place({ kind: 'pole', at, yaw: Math.atan2(along[0], along[1]), size: [0.4, 9, 0.4], variant: 0, y: 0, detail: true }, 0.2)) continue
      if (last) for (const o of [-0.9, 0, 0.9]) {
        const a0 = add(last, scale(along, o)), b0 = add(at, scale(along, o))
        cables.push({ a: [a0[0], 8.6, a0[1]], b: [b0[0], 8.6, b0[1]], sag: 0.55 })
      }
      last = at
    }
  }

  // guard posts and their beats: patrols circling the yard (alternate ones the other way round),
  // sentries pacing along the wall inside each gate, pairs walking the lanes, guards pacing before the hangars
  const posts: Post[] = []
  for (let i = 0; i < 18; i++) {
    const a0 = (i / 18) * Math.PI * 2 + rand() * 0.2
    const r = YARD * (0.55 + rand() * 0.3)
    const dir = i % 2 ? 1 : -1
    const beat: Xz[] = []
    for (let k = 0; k < 12; k++) {
      const a = a0 + (dir * k * Math.PI) / 6
      beat.push([Math.sin(a) * r, Math.cos(a) * r])
    }
    posts.push({ at: beat[0], yaw: Math.atan2(beat[0][0], beat[0][1]), beat })
  }
  for (const g of gates) {
    const along: Xz = [-g.out[1], g.out[0]]
    const facing = Math.atan2(g.out[0], g.out[1])
    for (const s of [-1, 1]) {
      const at = add(g.inside, scale(along, s * 3.4))
      posts.push({ at, yaw: facing, beat: [at, add(at, scale(along, s * 4))] })
    }
    for (const s of [-1, 1]) {
      const at = add(add(g.inside, scale(g.out, -10)), scale(along, s * 4))
      posts.push({ at, yaw: facing, beat: [at, add(at, scale(g.out, -14))] })
    }
  }
  for (const h of hangars) {
    const door = add(h.at, rot([0, h.length / 2 + 3], h.yaw))
    for (const s of [-1, 1]) {
      const at = add(door, rot([s * (h.door.width / 2 + 1.5), 0], h.yaw))
      posts.push({ at, yaw: h.yaw, beat: [at, add(at, rot([s * 4.5, 1.5], h.yaw))] })
    }
  }

  return {
    site, corners, walls, gates, hangars, modules: L.modules, cables, posts, spawns,
    segments, circles, barrier: outer + BARRIER_MARGIN, outer,
  }
}

/** Whether a fort-frame point lies inside the wall polygon. */
export function insideWalls(plan: Pick<FortPlan, 'corners'>, x: number, z: number): boolean {
  return insidePolygon(plan.corners, x, z)
}

