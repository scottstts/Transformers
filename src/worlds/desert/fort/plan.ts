import type { CircleCollider, SegmentCollider } from '../../../game/types'
import { Layout, insidePolygon, rng } from './layout'
import { planPerimeter } from './perimeter'
import { planCitadel } from './citadel'
import { planDividers, planNavigation } from './sectors'
import { planDistricts } from './districts'
import { planPosts } from './posts'

/**
 * The fortress plan: where everything stands, decided before any triangle
 * (fort/build.ts compiles it into geometry; the enemies read the same plan
 * for their districts, posts, spawn doors, gates and walls).
 *
 * One fortress for the 3 m robot soldiers, every part at its real size,
 * built in layers:
 *
 *   the perimeter  precast T-wall slabs under concertina wire on an
 *                  irregular ten-sided ring ~340 m across, watchtowers on its
 *                  corners, four gates (the main gate at the front, one on
 *                  each flank and a rear gate) with booths, booms and
 *                  barrier chicanes;
 *   the districts  six wards between the perimeter and the citadel, split by
 *                  T-wall dividers running out from the citadel's bastions,
 *                  each divider with its own gate: the gate court (the main
 *                  road in), the motor pool, the airfield, comms and power,
 *                  the fuel depot and the barracks, each laid out for its
 *                  role around an open yard to fight in;
 *   the citadel    a star-bastioned reinforced-concrete rampart with a
 *                  wall-walk, two gatehouses (the front one bridged), round
 *                  the command keep and its parade ground.
 *
 * Every district keeps its own garrison: posts and beats inside it, spawn
 * doors (garages, hangars, the keep's vehicle bay) and the gates that lead
 * out of it. `nav` routes a soldier from any district to any other through
 * the gates.
 *
 * Frame: the citadel's centre offset `centre` from the origin, +z the front
 * (the main gate), metres, y up; the site's yaw turns it in the world.
 */

export interface FortSite {
  id: string
  /** world position of the frame's origin and heading of the front (rad, three.js yaw about +y) */
  x: number
  z: number
  yaw: number
  seed: number
}

/** The desert's fortress: its main gate faces the start, a few hundred metres off. */
export const FORT_SITES: readonly FortSite[] = [
  { id: 'citadel', x: 0, z: 330, yaw: Math.PI, seed: 11 },
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
  /** slab centre positions at either end */
  a: Xz
  b: Xz
  slabs: number
  /** concertina wire along its top (the perimeter) */
  wire: boolean
}

/**
 * The citadel's rampart between two gatehouses: its outer foot line as an
 * open polyline, counter-clockwise round the citadel (the outside on its
 * right). Its ends stand inside the gatehouse towers.
 */
export interface RampartRun {
  points: Xz[]
}

export type GateKind = 'outer' | 'inner' | 'citadel'

export interface Gate {
  kind: GateKind
  /** gate centre on the wall line, its unit normal, and waypoints on its -out and +out sides */
  at: Xz
  out: Xz
  inside: Xz
  outside: Xz
  /** pillars either side of the opening (T-wall gates) */
  pillars: [Xz, Xz]
  /** which side the sliding leaf is parked on (+1 toward `pillars[1]`) */
  leaf: 1 | -1
  /** the clear opening (m) */
  width: number
  /** the sectors it joins: on its -out side and its +out side */
  sectors: [number, number]
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
  | 'garage' | 'keep' | 'radar' | 'gatehouse' | 'apron' | 'flagpole' | 'pillar' | 'stair'

export interface Module extends Placed {
  kind: ModuleKind
  /** footprint and height where the module is sized: width (x), height (y), depth (z) */
  size: Xyz
  /** variant (paint, count, arm state, markings...) */
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
  sector: number
}

/** A door soldiers roll out of: inside it, the point in front of it they make for, and its district. */
export interface Spawn {
  at: Xz
  exit: Xz
  sector: number
}

/** A sagging cable between two attachment points (fort frame). */
export interface Cable {
  a: Xyz
  b: Xyz
  sag: number
}

export type SectorRole = 'gate' | 'motorPool' | 'airfield' | 'comms' | 'fuel' | 'barracks' | 'citadel'

/**
 * A district: a wedge of the ward between two dividers (angles about
 * `centre`, a0 < a1, measured from +z toward +x), or the citadel inside the
 * rampart. It keeps an open yard to fight in and a garrison of `garrison`.
 */
export interface Sector {
  index: number
  role: SectorRole
  /** wedge bounds (rad); the citadel's are NaN */
  a0: number
  a1: number
  yard: { at: Xz; r: number }
  garrison: number
  /** a circle holding the whole district (fort frame): simulation and detail distances */
  bounds: { at: Xz; r: number }
}

export interface FortPlan {
  site: FortSite
  /** the citadel's centre: the dividers radiate from it */
  centre: Xz
  /** perimeter polygon corners (CCW), fort frame */
  corners: Xz[]
  /** the rampart's outer foot polygon (CCW) */
  citadel: Xz[]
  walls: WallRun[]
  ramparts: RampartRun[]
  gates: Gate[]
  sectors: Sector[]
  /** divider angles about `centre` (rad, ascending), and each divider's line from the rampart to its perimeter corner */
  dividers: number[]
  spokes: Array<[Xz, Xz]>
  /** nav[a][b]: the gate a soldier in sector a takes toward sector b (-1: same sector); `sectors.length` is outside */
  nav: number[][]
  hangars: Hangar[]
  modules: Module[]
  cables: Cable[]
  posts: Post[]
  spawns: Spawn[]
  /** collision in the fort frame: slab runs, buildings as segments, round things as circles */
  segments: SegmentCollider[]
  circles: CircleCollider[]
  /** the ring (m, about the frame origin) the car cannot pass, and the farthest wall corner */
  barrier: number
  outer: number
}

/** The sector index for "outside the perimeter". */
export const outsideSector = (plan: Pick<FortPlan, 'sectors'>): number => plan.sectors.length

export function planFort(site: FortSite): FortPlan {
  const rand = rng(site.seed)
  const centre: Xz = [0, -12]
  const citadel = planCitadel(centre)
  const dividers = planDividers(centre, citadel.anchors)
  const perimeter = planPerimeter(centre, dividers, rand)
  const segments: SegmentCollider[] = [...perimeter.segments, ...citadel.segments]
  const circles: CircleCollider[] = []
  const sectors = dividers.sectors
  const plan: FortPlan = {
    site, centre, corners: perimeter.corners, citadel: citadel.polygon,
    walls: [...perimeter.walls], ramparts: citadel.ramparts, gates: [...perimeter.gates, ...citadel.gates],
    sectors, dividers: dividers.angles, spokes: [], nav: [], hangars: [], modules: [...perimeter.pillars, ...citadel.modules], cables: [], posts: [], spawns: [],
    segments, circles, barrier: 0, outer: 0,
  }
  // the dividers' slabs and gates (they need the perimeter's corners they run to)
  dividers.build(plan, perimeter.corners, rand)
  const outer = Math.max(...plan.corners.map((c) => Math.hypot(c[0], c[1])))
  plan.outer = outer
  plan.barrier = outer + BARRIER_MARGIN
  plan.nav = planNavigation(plan)

  const L = new Layout(plan, rand)
  planDistricts(plan, L, rand)
  plan.modules = L.modules
  planPosts(plan, rand)
  return plan
}

/** Whether a fort-frame point lies inside the perimeter. */
export function insideWalls(plan: Pick<FortPlan, 'corners'>, x: number, z: number): boolean {
  return insidePolygon(plan.corners, x, z)
}

/** The district a fort-frame point is in (`outsideSector` beyond the perimeter). */
export function sectorAt(plan: Pick<FortPlan, 'corners' | 'citadel' | 'centre' | 'dividers' | 'sectors'>, x: number, z: number): number {
  if (!insidePolygon(plan.corners, x, z)) return plan.sectors.length
  if (insidePolygon(plan.citadel, x, z)) return plan.sectors.length - 1
  const a = Math.atan2(x - plan.centre[0], z - plan.centre[1])
  const d = plan.dividers
  for (let k = 0; k < d.length - 1; k++) if (a >= d[k] && a < d[k + 1]) return k + 1
  // the wedge that wraps round through +-pi
  return 0
}
