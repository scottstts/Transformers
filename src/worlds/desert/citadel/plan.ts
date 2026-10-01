import type { CircleCollider, SegmentCollider } from '../../../game/types'
import { insidePolygon } from './polygon'
import { planPosts } from './posts'

/**
 * The citadel's plan: the exported plan data (blender/citadel_build,
 * `citadel.plan.json` on the asset CDN) in the shape the game reads. Fort
 * frame: metres, +z the front (the main gate), y up; `site` places it in the
 * world. Everything here is plain data, decided by the Blender build; the
 * game adds the garrisons' posts (posts.ts), normalises the gates' sides from
 * their waypoints (the export lists some gates' districts the other way
 * round) and routes the districts itself (`route`: never through the
 * outside, which the export's routes sometimes took).
 */

export type Xz = [number, number]

export interface CitadelSite {
  /** world position of the frame's origin and heading of the front (rad, three.js yaw about +y) */
  x: number
  z: number
  yaw: number
}

export type SectorRole =
  | 'forecourt' | 'hangars' | 'foundry' | 'condensers' | 'array' | 'postern'
  | 'processional' | 'barracks' | 'hydroponics' | 'armoury' | 'innerWard' | 'citadel'

/** A district: its outline, tier, open yard to fight in, garrison size and a circle holding it all (simulation and detail distances). */
export interface Sector {
  index: number
  role: SectorRole
  tier: number
  polygon: Xz[]
  yard: { at: Xz; r: number }
  garrison: number
  bounds: { at: Xz; r: number }
}

export type GateKind = 'outer' | 'spur' | 'ramp' | 'crown'

export interface Gate {
  id: string
  kind: GateKind
  /** gate centre, its unit normal, and waypoints on its -out and +out sides */
  at: Xz
  out: Xz
  inside: Xz
  outside: Xz
  /** the clear opening (m) */
  width: number
  /** the districts it joins: on its -out side (`inside`) and its +out side (`outside`); `sectors.length` is outside the citadel */
  sectors: [number, number]
  /** floor height at the gate (m) */
  y: number
}

/** A door soldiers roll out of: inside it, the point in front of it they make for, its district and floor height. */
export interface Spawn {
  at: Xz
  exit: Xz
  sector: number
  y: number
}

/**
 * A guard post and its beat: the points a soldier at peace walks in turn,
 * pausing at each; two points is pacing back and forth, more a patrol loop.
 * The first point is the post itself.
 */
export interface Post {
  at: Xz
  yaw: number
  beat: Xz[]
  sector: number
}

export type Surface = 'sand' | 'ceramic' | 'deck'

/** A walkable floor primitive: level, or a ramp rising from `y[0]` at `axis[0]` to `y[1]` at `axis[1]`. */
export type FloorPiece =
  | { kind: 'flat'; polygon: Xz[]; y: number; surface: Surface; district: number }
  | { kind: 'ramp'; polygon: Xz[]; axis: [Xz, Xz]; y: [number, number]; surface: Surface; district: number }

/** A patch overriding the surface class of the floor under it. */
export interface SurfacePatch {
  polygon: Xz[]
  surface: Surface
  y: number
}

/** The exported plan (`citadel.plan.json`), as far as the game reads it. */
export interface CitadelPlanData {
  site: CitadelSite & { seed: number }
  tiers: Array<{ id: string; y: number }>
  outline: Record<'O' | 'M' | 'I' | 'C' | 'K', Xz[]>
  outer: number
  barrier: number
  districts: Array<Omit<Sector, 'role'> & { role: string }>
  gates: Array<Omit<Gate, 'sectors' | 'kind'> & { kind: string; sectors: [number, number]; soffit: number }>
  floor: FloorPiece[]
  surfaces: SurfacePatch[]
  colliders: { segments: SegmentCollider[]; circles: CircleCollider[] }
  spawns: Spawn[]
}

export interface CitadelPlan {
  site: CitadelSite
  /** the outer curtain's polygon (O), counter-clockwise */
  outline: Xz[]
  sectors: Sector[]
  gates: Gate[]
  /** nav[a][b]: the gate a soldier in district a takes toward district b (-1: same district); `sectors.length` is outside */
  nav: number[][]
  floor: FloorPiece[]
  surfaces: SurfacePatch[]
  spawns: Spawn[]
  posts: Post[]
  /** collision: walls and building sides as capsules, round things as circles (2D: the floor is one layer) */
  segments: SegmentCollider[]
  circles: CircleCollider[]
  /** the ring (m, about the frame origin) the car cannot pass, and the farthest wall corner */
  barrier: number
  outer: number
  /** a rectangle holding every floor primitive (the citadel's grounds), fort frame */
  bounds: { x0: number; z0: number; x1: number; z1: number }
}

/** The district index for "outside the citadel". */
export const outsideSector = (plan: Pick<CitadelPlan, 'sectors'>): number => plan.sectors.length

/** Sector roles the game knows; an export with another one is an error, not a silent default. */
const ROLES: readonly SectorRole[] = ['forecourt', 'hangars', 'foundry', 'condensers', 'array', 'postern', 'processional', 'barracks', 'hydroponics', 'armoury', 'innerWard', 'citadel']
const KINDS: readonly GateKind[] = ['outer', 'spur', 'ramp', 'crown']

/** The game's plan from the exported data. */
export function citadelPlan(data: CitadelPlanData): CitadelPlan {
  const sectors: Sector[] = data.districts.map((d) => {
    if (!ROLES.includes(d.role as SectorRole)) throw new Error(`Citadel plan: unknown district role ${d.role}`)
    return { index: d.index, role: d.role as SectorRole, tier: d.tier, polygon: d.polygon, yard: d.yard, garrison: d.garrison, bounds: d.bounds }
  })
  sectors.forEach((s, i) => { if (s.index !== i) throw new Error('Citadel plan: districts out of order') })
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
  for (const f of data.floor) for (const [x, z] of f.polygon) {
    x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z)
  }
  const plan: CitadelPlan = {
    site: { x: data.site.x, z: data.site.z, yaw: data.site.yaw },
    outline: data.outline.O,
    sectors,
    gates: [],
    nav: [],
    floor: data.floor,
    surfaces: data.surfaces,
    spawns: data.spawns.map((s) => ({ at: s.at, exit: s.exit, sector: s.sector, y: s.y })),
    posts: [],
    segments: data.colliders.segments.map((s) => ({ ax: s.ax, az: s.az, bx: s.bx, bz: s.bz, r: s.r })),
    circles: data.colliders.circles.map((c) => ({ x: c.x, z: c.z, r: c.r })),
    barrier: data.barrier,
    outer: data.outer,
    bounds: { x0, z0, x1, z1 },
  }
  const outside = outsideSector(plan)
  // the outer gates' passages (barbicans, gatehouses) stand beyond the curtain's line: they belong to the district within
  const outerGates = data.gates.filter((g) => g.kind === 'outer')
  for (const g of data.gates) {
    if (!KINDS.includes(g.kind as GateKind)) throw new Error(`Citadel plan: unknown gate kind ${g.kind}`)
    const a = districtAt(plan, outerGates, g.inside[0], g.inside[1])
    const b = districtAt(plan, outerGates, g.outside[0], g.outside[1])
    const joins = [...g.sectors].sort().join()
    if ([a, b].sort().join() !== joins) throw new Error(`Citadel plan: gate ${g.id} joins ${joins}, its waypoints stand in ${a} and ${b}`)
    plan.gates.push({ id: g.id, kind: g.kind as GateKind, at: g.at, out: g.out, inside: g.inside, outside: g.outside, width: g.width, sectors: [a, b], y: g.y })
  }
  plan.nav = route(plan)
  for (let a = 0; a <= outside; a++) {
    for (let b = 0; b <= outside; b++) if (a !== b && plan.nav[a][b] < 0) throw new Error(`Citadel plan: no way from district ${a} to ${b}`)
  }
  planPosts(plan)
  return plan
}

/**
 * The gate graph's routes: nav[a][b] is the first gate on the shortest way
 * from district a's yard to b's (through each gate's centre), never through
 * the outside: routing out one gate and in another sent soldiers round the
 * walls. The outside is only ever where a route starts or ends.
 */
function route(plan: CitadelPlan): number[][] {
  const outside = outsideSector(plan)
  const n = outside + 1
  const where = (k: number, g: Gate): Xz => (k < outside ? plan.sectors[k].yard.at : g.outside)
  const nav: number[][] = []
  for (let a = 0; a < n; a++) {
    const dist = new Array<number>(n).fill(Infinity)
    const first = new Array<number>(n).fill(-1)
    const done = new Array<boolean>(n).fill(false)
    dist[a] = 0
    for (;;) {
      let k = -1
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (k < 0 || dist[i] < dist[k])) k = i
      if (k < 0) break
      done[k] = true
      // the outside is an end, never a way through
      if (k === outside && k !== a) continue
      plan.gates.forEach((g, gi) => {
        const side = g.sectors.indexOf(k)
        if (side < 0) return
        const other = g.sectors[1 - side]
        const from = where(k, g), to = where(other, g)
        const d = dist[k] + Math.hypot(g.at[0] - from[0], g.at[1] - from[1]) + Math.hypot(to[0] - g.at[0], to[1] - g.at[1])
        if (d < dist[other]) {
          dist[other] = d
          first[other] = k === a ? gi : first[k]
        }
      })
    }
    nav.push(first.map((gi, b) => (b === a ? -1 : gi)))
  }
  return nav
}

/**
 * The district a fort-frame point stands in, from the polygons: the highest
 * tier's where they nest (the crown sits within the inner ward's outline),
 * then an outer gate's passage (its district within), else outside.
 * `CitadelDistricts` rasterizes this for the game's lookups.
 */
export function districtAt(plan: Pick<CitadelPlan, 'sectors'>, outerGates: ReadonlyArray<Pick<Gate, 'at' | 'out' | 'inside' | 'width'>>, x: number, z: number): number {
  let best = -1
  for (const s of plan.sectors) if (insidePolygon(s.polygon, x, z) && (best < 0 || s.tier > plan.sectors[best].tier)) best = s.index
  if (best >= 0) return best
  for (const g of outerGates) {
    const ux = g.inside[0] - g.at[0], uz = g.inside[1] - g.at[1]
    const length = Math.hypot(ux, uz)
    const along = ((x - g.at[0]) * ux + (z - g.at[1]) * uz) / length
    const across = Math.abs((x - g.at[0]) * uz - (z - g.at[1]) * ux) / length
    if (along >= 0 && along <= length && across <= g.width / 2 + 1) {
      for (const s of plan.sectors) if (insidePolygon(s.polygon, g.inside[0], g.inside[1])) return s.index
    }
  }
  return plan.sectors.length
}
