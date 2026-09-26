import { GATE_WIDTH, type Cable, type FortPlan, type Gate, type Hangar, type Module, type ModuleKind, type Sector, type Xyz, type Xz } from './plan'
import { add, KEEP_BAY_DEPTH, rot, type Layout } from './layout'
import { GARAGE, garageBays } from './garage'
import { KEEP } from './keep'
import { GATEHOUSE } from './gatehouse'
import { CITADEL_GATES } from './citadel'
import { RAMPART } from './rampart'

/**
 * What stands in each district, by role (plan.ts). Every district is laid
 * out round its open yard, which stays clear to fight in, with its spawn
 * doors (garages, hangars, the keep's vehicle bay) facing it:
 *
 *   gate court  the main road from the main gate to the citadel's bridged
 *               gatehouse, poles and cables along it, flags before the
 *               citadel, guard garages facing the road, HESCO positions
 *               inside the gate;
 *   motor pool  maintenance garages, a canopy over tyres, drums and crates,
 *               container stacks;
 *   airfield    two Quonset hangars on their aprons, a helipad;
 *   comms       the radar dome, two lattice masts, a generator farm, a
 *               bunker, a water tower, the rear road;
 *   fuel        tank farms in their bunds, a water tower, generators;
 *   barracks    blocks of housing units under shade sails, the admin HQ,
 *               latrines, a water tank;
 *   citadel     the command keep and its parade ground, a helipad, a
 *               bunker, a garage, flags, and stairs up to the wall-walk.
 *
 * Positions are asked for in each wedge's own polar terms (`Zone.p`: radius
 * from the citadel's centre and a fraction of the half-angle across it) and
 * searched round until they fit (layout.ts).
 */

const yawTo = (from: Xz, to: Xz): number => Math.atan2(to[0] - from[0], to[1] - from[1])
/** The way every flag flies (fort frame yaw): one wind over the whole fortress. */
const WIND = 2.2

function mod(kind: ModuleKind, at: Xz, yaw: number, size: Xyz, variant = 0, detail = false, y = 0): Module {
  return { kind, at, yaw, size, variant, y, detail }
}

/** A district's frame for placing things: polar about the centre within its wedge, or plain offsets in the citadel. */
class Zone {
  readonly L: Layout
  readonly plan: FortPlan
  readonly s: Sector
  readonly rand: () => number
  private readonly mid: number
  private readonly half: number

  constructor(plan: FortPlan, L: Layout, s: Sector) {
    this.plan = plan
    this.L = L
    this.s = s
    this.rand = L.rand
    this.mid = (s.a0 + s.a1) / 2
    this.half = (s.a1 - s.a0) / 2
  }

  /** A point `r` m from the centre at `t` of the half-angle across the wedge (the citadel: offsets from the centre). */
  p(r: number, t: number): Xz {
    const C = this.plan.centre
    if (this.s.role === 'citadel') return [C[0] + r, C[1] + t]
    const a = this.mid + t * this.half
    return [C[0] + Math.sin(a) * r, C[1] + Math.cos(a) * r]
  }

  /** Heading from `at` toward the centre (for modules that face into the district's middle, use `yawTo`). */
  inward(at: Xz): number {
    return yawTo(at, this.plan.centre)
  }

  /** Try `make(at)` at `at`, then on a spiral round it out to `spread` m, until it places. */
  search(at: Xz, spread: number, tries: number, make: (at: Xz) => boolean): boolean {
    if (make(at)) return true
    for (let i = 0; i < tries; i++) {
      const r = spread * Math.sqrt((i + 1) / tries)
      const a = i * 2.39996
      if (make([at[0] + Math.cos(a) * r, at[1] + Math.sin(a) * r])) return true
    }
    return false
  }

  /** The district's yard: a clearing round `at` of radius `r`. */
  yard(at: Xz, r: number): void {
    this.s.yard = { at, r }
    this.L.clear(at, r)
  }

  /** A paved apron (not an obstacle: laid on ground that is already reserved or clear). */
  apron(at: Xz, yaw: number, w: number, d: number, markings: number): void {
    this.L.outside(mod('apron', at, yaw, [w, 0.03, d], markings))
  }

  /** A paved road from a to b, `w` wide, its ground kept clear of buildings. */
  road(a: Xz, b: Xz, w: number): void {
    const at: Xz = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const yaw = yawTo(a, b)
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    this.L.reserve(at, yaw, w + 4, len)
    this.apron(at, yaw, w, len, 1)
  }

  /**
   * A maintenance garage facing `face`, its front apron paved and kept clear;
   * its open bays are spawn doors. Tried round `at`.
   */
  garage(at: Xz, face: Xz | number, spread = 18, open = 0b101): boolean {
    return this.search(at, spread, 50, (p) => {
      const yaw = typeof face === 'number' ? face : yawTo(p, face)
      const m = mod('garage', p, yaw, [GARAGE.width, GARAGE.ridge, GARAGE.depth], open)
      const apronAt = add(p, rot([0, GARAGE.depth / 2 + 6], yaw))
      const apron = mod('crates', apronAt, yaw, [GARAGE.width, 1, 12], 0)
      if (!this.L.fits(m, 0.8) || !this.L.fits(apron, 0)) return false
      this.L.fixed(m, 0.8)
      this.L.reserve(apronAt, yaw, GARAGE.width, 12)
      this.apron(apronAt, yaw, GARAGE.width - 0.6, 11.4, 2)
      for (const x of garageBays(open)) {
        this.plan.spawns.push({
          at: add(p, rot([x, GARAGE.depth / 2 - 4], yaw)),
          exit: add(p, rot([x, GARAGE.depth / 2 + 7], yaw)),
          sector: this.s.index,
        })
      }
      return true
    })
  }

  /** A Quonset hangar facing `face`, its door apron paved; the door is a spawn door. */
  hangar(at: Xz, face: Xz, spread = 16): boolean {
    return this.search(at, spread, 40, (p) => {
      const yaw = yawTo(p, face)
      const h: Hangar = { at: p, yaw, width: 18, length: 26, height: 9, door: { width: 9, height: 6.4 } }
      const body = mod('crates', p, yaw, [h.width + 1, h.height, h.length + 1])
      const doorAt = add(p, rot([0, h.length / 2], yaw))
      const apronAt = add(doorAt, rot([0, 6.5], yaw))
      const apron = mod('crates', apronAt, yaw, [h.door.width + 12, 1, 12])
      if (!this.L.fits(body, 0) || !this.L.fits(apron, 0)) return false
      this.plan.hangars.push(h)
      this.L.reserve(p, yaw, h.width + 1, h.length + 1)
      this.L.reserve(apronAt, yaw, h.door.width + 12, 12)
      this.apron(apronAt, yaw, h.width, 12, 2)
      const r = 0.4, hw = h.width / 2 - r, hl = h.length / 2 - r, dw = h.door.width / 2 + 0.3
      const q = (x: number, z: number): Xz => add(p, rot([x, z], yaw))
      const seg = (a: Xz, b: Xz): void => { this.plan.segments.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], r }) }
      seg(q(-hw, -hl), q(hw, -hl)); seg(q(hw, -hl), q(hw, hl)); seg(q(-hw, hl), q(-hw, -hl)); seg(q(hw, hl), q(dw, hl)); seg(q(-dw, hl), q(-hw, hl))
      this.plan.spawns.push({ at: q(0, h.length / 2 - 4), exit: q(0, h.length / 2 + 7), sector: this.s.index })
      return true
    })
  }

  /** Floodlight masts round the yard, their lamps turned on it. */
  masts(count: number, r: number, from = 0.6): void {
    const { at } = this.s.yard
    for (let k = 0; k < count; k++) {
      const a = from + (k / count) * Math.PI * 2
      this.search([at[0] + Math.sin(a) * r, at[1] + Math.cos(a) * r], 6, 12, (p) => this.L.place(mod('mast', p, yawTo(p, at), [1.4, 15, 1.4]), 0.6))
    }
  }

  /** A generic placement searched round `at`. */
  put(kind: ModuleKind, at: Xz, yaw: number | Xz, size: Xyz, variant = 0, detail = false, pad = 1, spread = 14): boolean {
    return this.search(at, spread, 30, (p) => this.L.place(mod(kind, p, typeof yaw === 'number' ? yaw : yawTo(p, yaw), size, variant, detail), pad))
  }

  /** Container stacks: a pair side by side, some two high, searched round `at`. */
  containers(at: Xz, yaw: number, spread = 12): void {
    this.search(at, spread, 30, (p) => {
      const ms: Module[] = []
      for (const s of [-1, 1]) ms.push(mod('container', add(p, rot([s * 1.3, 0], yaw)), yaw, [2.44, 2.59, 12.19], Math.floor(this.rand() * 4)))
      if (!this.L.group(ms, 0.6)) return false
      for (const s of [-1, 1]) {
        if (this.rand() < 0.6) this.L.outside({ ...mod('container', add(p, rot([s * 1.3, 0], yaw)), yaw + (this.rand() - 0.5) * 0.03, [2.44, 2.59, 12.19], Math.floor(this.rand() * 4)), y: 2.59 })
      }
      return true
    })
  }

  /** Housing units in rows facing each other across walkways under shade sails. */
  barracks(at: Xz, yaw: number, spread = 16): boolean {
    const rows = 3, per = 4, dx = 7.2, dz = 7.8
    return this.search(at, spread, 40, (p) => {
      const ms: Module[] = []
      const q = (x: number, z: number): Xz => add(p, rot([x, z], yaw))
      for (let r = 0; r < rows; r++) {
        for (let i = 0; i < per; i++) ms.push(mod('chu', q((i - (per - 1) / 2) * dx, (r - 1) * dz), yaw + (r % 2 ? 0 : Math.PI), [6.06, 2.9, 2.44], Math.floor(this.rand() * 3)))
      }
      for (let r = 0; r < rows - 1; r++) ms.push(mod('sail', q(0, (r - 0.5) * dz), yaw, [(per - 1) * dx + 8.4, 4.8, dz - 3], r))
      return this.L.group(ms, 0.9)
    })
  }

  /** Fuel tanks in a bund with their manifold and pump. */
  tankFarm(at: Xz, yaw: number, spread = 14): boolean {
    return this.search(at, spread, 40, (p) => {
      const ms: Module[] = [mod('bund', p, yaw, [22, 1.1, 14])]
      for (const i of [-1, 0, 1]) ms.push(mod('tank', add(p, rot([i * 6.2, -0.6], yaw)), yaw + Math.PI, [3.2, 4.2, 10.2]))
      return this.L.group(ms, 1)
    })
  }

  /** A HESCO fighting position: an L of gabion cells. */
  hesco(at: Xz, yaw: number, spread = 8): boolean {
    return this.search(at, spread, 20, (p) => this.L.group([
      mod('hesco', p, yaw, [8.56, 2.2, 1.07], 0),
      mod('hesco', add(p, rot([4.28 + 0.535, -2.14 - 0.535 - 0.02], yaw)), yaw + Math.PI / 2, [4.28, 2.2, 1.07], 1),
    ], 0.6))
  }

  /** Scattered clutter wherever it fits in the district: pallets and crates, drum clusters, tyres, sandbags. */
  clutter(n: number): void {
    const kinds: Array<[ModuleKind, Xyz, number]> = [
      ['crates', [3.4, 1.8, 2.4], 0], ['drums', [2.4, 1, 2.4], 5], ['crates', [2.4, 1.2, 2.4], 2],
      ['tires', [2.2, 1.2, 2.2], 3], ['drums', [2, 1, 2], 3], ['sandbags', [5.2, 1.4, 0.7], 2], ['crates', [3.4, 1.8, 2.4], 1],
    ]
    const b = this.s.bounds
    for (let i = 0; i < n; i++) {
      const [kind, size, variant] = kinds[i % kinds.length]
      const a = this.rand() * Math.PI * 2, r = Math.sqrt(this.rand()) * b.r * 0.8
      this.search([b.at[0] + Math.sin(a) * r, b.at[1] + Math.cos(a) * r], b.r * 0.4, 24, (p) => this.L.place(mod(kind, p, this.rand() * Math.PI * 2, size, variant, true), 0.8))
    }
  }
}

export function planDistricts(plan: FortPlan, L: Layout, rand: () => number): void {
  watchtowers(plan, L)
  gateFurniture(plan, L, rand)
  const zones = plan.sectors.map((s) => new Zone(plan, L, s))
  // the yards first, so nothing is built on them
  for (const z of zones) {
    const at = z.s.role === 'citadel' ? z.p(0, 22) : z.p(z.s.role === 'comms' ? 90 : z.s.role === 'gate' ? 98 : 95, 0)
    z.yard(at, z.s.role === 'gate' ? 24 : z.s.role === 'citadel' ? 18 : 14)
  }
  for (const z of zones) {
    switch (z.s.role) {
      case 'gate': gateCourt(z); break
      case 'motorPool': motorPool(z); break
      case 'airfield': airfield(z); break
      case 'comms': comms(z); break
      case 'fuel': fuel(z); break
      case 'barracks': barracksDistrict(z); break
      case 'citadel': citadel(z); break
    }
  }
  // any district still without a spawn door gets a garage wherever there is room
  for (const z of zones) {
    if (plan.spawns.some((s) => s.sector === z.s.index)) continue
    if (!L.anywhere(z.s.index, z.s.yard.at, (at) => mod('garage', at, yawTo(at, z.s.yard.at), [GARAGE.width, GARAGE.ridge, GARAGE.depth], 0b111), 0.8)) continue
    const g = L.modules[L.modules.length - 1]
    for (const x of garageBays(0b111)) plan.spawns.push({ at: add(g.at, rot([x, GARAGE.depth / 2 - 4], g.yaw)), exit: add(g.at, rot([x, GARAGE.depth / 2 + 7], g.yaw)), sector: z.s.index })
  }
  for (const z of zones) z.clutter(z.s.role === 'citadel' ? 4 : z.s.role === 'gate' || z.s.role === 'comms' ? 10 : 7)
  paveGates(plan, zones)
}

/** Watchtowers inside the perimeter's corners; where a divider meets the corner, beside it in the roomier wedge. */
function watchtowers(plan: FortPlan, L: Layout): void {
  const C = plan.centre
  for (const c of plan.corners) {
    const r = Math.hypot(c[0] - C[0], c[1] - C[1])
    const u: Xz = [(C[0] - c[0]) / r, (C[1] - c[1]) / r]
    const spoke = plan.spokes.find((s) => Math.hypot(s[1][0] - c[0], s[1][1] - c[1]) < 1e-3)
    let at: Xz = add(c, [u[0] * 5.6, u[1] * 5.6])
    if (spoke) {
      // off the divider's line, toward whichever side leaves the tower furthest from the perimeter's edges
      const side: Xz = [-u[1], u[0]]
      let best = -Infinity
      for (const s of [-1, 1]) {
        const p = add(c, [u[0] * 7.5 + side[0] * s * 5.2, u[1] * 7.5 + side[1] * s * 5.2])
        const room = Math.min(...plan.corners.map((a, i) => distToSeg(p, a, plan.corners[(i + 1) % plan.corners.length])))
        if (room > best) { best = room; at = p }
      }
    }
    L.fixed(mod('tower', at, yawTo(at, C), [4.6, 13, 4.6]), 2.6)
  }
}

function distToSeg(p: Xz, a: Xz, b: Xz): number {
  const dx = b[0] - a[0], dz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t)
}

/** The perimeter gates: a booth and a raised boom inside, sandbag positions, jersey barriers lining the approach; the dividers' gates: sandbags. */
function gateFurniture(plan: FortPlan, L: Layout, rand: () => number): void {
  /** the gate lane's width: sandbag positions stand either side of it */
  const LANE = 18
  for (const g of plan.gates) {
    if (g.kind === 'citadel') continue
    const along: Xz = [-g.out[1], g.out[0]]
    const yawIn = Math.atan2(-g.out[0], -g.out[1])
    const at = (o: number, a: number): Xz => add(g.at, add([g.out[0] * o, g.out[1] * o], [along[0] * a, along[1] * a]))
    if (g.kind === 'outer') {
      const side = rand() < 0.5 ? 1 : -1
      L.fixed(mod('booth', at(-6.5, side * (GATE_WIDTH / 2 + 2.4)), yawIn + (side > 0 ? -Math.PI / 2 : Math.PI / 2), [2.6, 3, 2.6]), 0)
      L.fixed(mod('boom', at(-3.2, side * (GATE_WIDTH / 2 - 0.4)), Math.atan2(along[0], along[1]) + (side > 0 ? Math.PI : 0), [0.5, 1.2, GATE_WIDTH - 1.5], 1, true), 0.4)
      // jersey barriers lining the approach outside (end on to the gate); the opening stays its full width
      const radial = Math.atan2(-g.out[1], g.out[0])
      for (const sgn of [-1, 1]) {
        for (const d of [4.5, 9.2, 14]) {
          const p = at(d, sgn * (GATE_WIDTH / 2 + 1.4 + (d > 5 ? 0.9 : 0)))
          L.outside(mod('jersey', p, radial + (rand() - 0.5) * 0.12, [3.6, 1.1, 0.85]))
          plan.segments.push({ ax: p[0] - g.out[0] * 1.8, az: p[1] - g.out[1] * 1.8, bx: p[0] + g.out[0] * 1.8, bz: p[1] + g.out[1] * 1.8, r: 0.4 })
        }
      }
    }
    // sandbag positions either side behind the wall (both sides of a divider)
    for (const o of g.kind === 'outer' ? [-11] : [-11, 11]) {
      for (const s of [-1, 1]) L.place(mod('sandbags', at(o, s * (LANE / 2 + 3.5)), o < 0 ? yawIn : yawIn + Math.PI, [5.2, 1.4, 0.7], 2, true), 0.3)
    }
  }
}

/** Short paved thresholds through every T-wall gate. */
function paveGates(plan: FortPlan, zones: Zone[]): void {
  for (const g of plan.gates) {
    if (g.kind === 'citadel') continue
    const z = zones[g.sectors[0] < zones.length ? g.sectors[0] : g.sectors[1]]
    z.apron(g.at, Math.atan2(g.out[0], g.out[1]), g.width - 0.4, 16, 0)
  }
}

function gateCourt(z: Zone): void {
  const plan = z.plan
  const main = plan.gates.find((g) => g.kind === 'outer' && g.sectors.includes(z.s.index))!
  const citadelGate = plan.gates.find((g) => g.kind === 'citadel' && g.sectors.includes(z.s.index))!
  // the main road, from the citadel's gatehouse to the main gate
  const from: Xz = add(citadelGate.at, [citadelGate.out[0] * (GATEHOUSE.front + 0.05), citadelGate.out[1] * (GATEHOUSE.front + 0.05)])
  const to: Xz = add(main.at, [-main.out[0] * 1.2, -main.out[1] * 1.2])
  z.road(from, to, 14)
  poles(z, from, to)
  // flags before the citadel, three each side of the road
  const yaw = yawTo(from, to)
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const p = add(from, rot([s * (13 + i * 4.5), 11], yaw))
    z.L.place(mod('flagpole', p, WIND, [0.8, 12, 0.8], i + (s > 0 ? 3 : 0)), 0.4)
  }
  // the guard garages facing the road across the court
  for (const s of [-1, 1]) z.garage(z.p(92, s * 0.62), [0, z.p(92, s * 0.62)[1]], 20, s > 0 ? 0b011 : 0b110)
  // HESCO positions inside the main gate and before the citadel
  for (const s of [-1, 1]) {
    z.hesco(add(main.at, rot([s * 24, -20], Math.atan2(main.out[0], main.out[1]))), Math.atan2(main.out[0], main.out[1]) + (s > 0 ? 0 : Math.PI))
    z.hesco(z.p(70, s * 0.5), yaw + (s > 0 ? Math.PI : 0))
  }
  z.masts(4, 30)
  // a guard canopy and quarters on the court's flanks
  z.put('canopy', z.p(130, -0.62), z.s.yard.at, [18, 6.2, 11])
  z.put('chu', z.p(128, 0.55), z.s.yard.at, [6.06, 2.9, 2.44], 1)
  z.put('chu', z.p(134, 0.62), z.s.yard.at, [6.06, 2.9, 2.44], 2)
  z.containers(z.p(62, -0.72), yaw + Math.PI / 2)
  z.containers(z.p(62, 0.72), yaw + Math.PI / 2)
  z.put('generator', z.p(118, 0.72), Math.PI / 2, [3.6, 2.2, 1.6], 1)
  z.put('waterTank', z.p(116, -0.78), 0, [3.2, 3.6, 3.2])
  // the checkpoint: an inspection canopy either side of the road inside the main gate, a bunker covering it
  for (const s of [-1, 1]) z.put('canopy', z.p(132, s * 0.24), [0, z.p(132, s * 0.24)[1]], [20, 6.4, 11], 0, false, 0.8, 10)
  z.put('bunker', z.p(128, 0.66), z.s.yard.at, [12, 4.6, 9], 0, false, 1, 12)
  // the garrison's administration block on the court's open flank
  z.put('hq', z.p(142, -0.7), z.s.yard.at, [30, 7.8, 14], 0, false, 0.8, 14)
  z.containers(z.p(146, 0.55), yaw + Math.PI / 2)
  z.containers(z.p(112, 0.85), yaw)
  z.containers(z.p(112, -0.85), yaw)
}

/** Timber poles down both sides of the main road, wired pole to pole. */
function poles(z: Zone, a: Xz, b: Xz): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const dir: Xz = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
  const across: Xz = [-dir[1], dir[0]]
  const cables: Cable[] = z.plan.cables
  for (const side of [-1, 1]) {
    let last: Xz | null = null
    for (let d = 16; d < len - 14; d += 17) {
      const at = add(add(a, [dir[0] * d, dir[1] * d]), [across[0] * side * 10.4, across[1] * side * 10.4])
      // (none in the yard: the line stops either side of it)
      if (!z.L.place(mod('pole', at, Math.atan2(across[0], across[1]) + (side > 0 ? 0 : Math.PI), [0.4, 9, 0.4], Math.round(d / 17) % 3 === 0 ? 1 : 0, true), 0.2)) {
        last = null
        continue
      }
      if (last) for (const o of [-0.9, 0, 0.9]) {
        const off: Xz = [across[0] * o * side, across[1] * o * side]
        cables.push({ a: [last[0] + off[0], 8.6, last[1] + off[1]], b: [at[0] + off[0], 8.6, at[1] + off[1]], sag: 0.55 })
      }
      last = at
    }
  }
}

/*
 * The four flank districts share a shape: a narrow inner band against the
 * rampart (r 65-80 m from the centre), the yard between the two divider
 * gates (r ~95), and a wide outer band (r 118-170) for the big buildings.
 */

function motorPool(z: Zone): void {
  const y = z.s.yard.at
  for (const s of [-1, 1]) z.garage(z.p(142, s * 0.6), y, 20, s > 0 ? 0b111 : 0b101)
  z.search(z.p(123, 0), 8, 40, (p) => {
    const yaw = yawTo(p, y)
    const q = (x: number, zz: number): Xz => add(p, rot([x, zz], yaw))
    // a canopy over tyres, drums and crates along its back, the front left open
    return z.L.group([
      mod('canopy', p, yaw, [24, 6.6, 13]),
      mod('tires', q(-8, -3.5), 0, [2.2, 1.6, 2.2], 4, true),
      mod('drums', q(-3, -4), z.rand() * 6, [2.6, 1, 2.6], 7, true),
      mod('crates', q(3.5, -3.8), yaw + 0.1, [3.4, 1.8, 2.4], 1, true),
      mod('tires', q(8.5, -3.2), 0, [2.2, 1.2, 2.2], 3, true),
    ], 0.8)
  })
  for (const [r, t] of [[162, -0.32], [162, 0.32]] as Array<[number, number]>) z.containers(z.p(r, t), yawTo(z.p(r, t), z.plan.centre), 10)
  z.hesco(z.p(72, -0.3), yawTo(z.p(72, -0.3), y))
  z.put('crates', z.p(70, 0.4), 0.3, [3.4, 1.8, 2.4], 1, true, 0.8, 6)
  z.put('tank', z.p(118, -0.72), yawTo(z.p(118, -0.72), y) + Math.PI / 2, [3.2, 4.2, 10.2], 0, false, 1, 10)
  z.put('generator', z.p(118, 0.72), Math.PI / 2, [3.6, 2.2, 1.6], 2, false, 0.6, 10)
  z.masts(2, 21)
}

function airfield(z: Zone): void {
  const y = z.s.yard.at
  for (const s of [-1, 1]) z.hangar(z.p(142, s * 0.5), y, 20)
  z.put('helipad', z.p(152, 0), y, [16, 0.25, 16], 0, false, 1, 10)
  z.put('generator', z.p(72, 0.45), Math.PI / 2, [3.6, 2.2, 1.6], 0, false, 0.6, 8)
  z.put('drums', z.p(72, -0.4), 0, [2.4, 1, 2.4], 7, true, 0.8, 8)
  z.put('tank', z.p(118, 0.78), yawTo(z.p(118, 0.78), y), [3.2, 4.2, 10.2], 0, false, 1, 10)
  z.put('waterTank', z.p(118, -0.8), 0, [3.2, 3.6, 3.2], 0, false, 0.6, 10)
  z.masts(2, 21)
}

function comms(z: Zone): void {
  const plan = z.plan
  const rear = plan.gates.find((g) => g.kind === 'outer' && g.sectors.includes(z.s.index))
  const citadelGate = plan.gates.find((g) => g.kind === 'citadel' && g.sectors.includes(z.s.index))
  if (rear && citadelGate) {
    const from: Xz = add(citadelGate.at, [citadelGate.out[0] * (GATEHOUSE.front + 0.05), citadelGate.out[1] * (GATEHOUSE.front + 0.05)])
    z.road(from, add(rear.at, [-rear.out[0] * 1.2, -rear.out[1] * 1.2]), 10)
  }
  const y = z.s.yard.at
  z.put('radar', z.p(104, 0.55), y, [14.4, 15.6, 14.4], 0, false, 1.5, 20)
  z.put('radioMast', z.p(118, -0.5), 0, [3.4, 34, 3.4], 0, false, 1.2)
  z.put('radioMast', z.p(76, -0.72), 0, [3.4, 28, 3.4], 0, false, 1.2)
  // the generator farm: four sets in a row
  z.search(z.p(74, 0.66), 12, 40, (p) => {
    const yaw = yawTo(p, y)
    return z.L.group([0, 1, 2, 3].map((i) => mod('generator', add(p, rot([(i - 1.5) * 4.6, 0], yaw)), yaw + Math.PI / 2, [3.6, 2.2, 1.6], i)), 0.5)
  })
  z.put('bunker', z.p(126, -0.22), y, [12, 4.6, 9], 0, false, 1, 16)
  z.put('waterTower', z.p(126, 0.25), 0, [5, 15, 5], 0, false, 1, 16)
  z.garage(z.p(106, -0.72), y, 18, 0b011)
  z.containers(z.p(128, 0.8), yawTo(z.p(128, 0.8), y) + Math.PI / 2)
  z.containers(z.p(128, -0.85), yawTo(z.p(128, -0.85), y) + Math.PI / 2)
  // the signals section's quarters and fighting positions on the district's back corners
  for (const t of [-0.62, 0.62]) {
    z.put('chu', z.p(118, t), y, [6.06, 2.9, 2.44], 2, false, 0.9, 10)
    z.hesco(z.p(100, t * 1.25), yawTo(z.p(100, t * 1.25), y))
  }
  z.masts(3, 24)
}

function fuel(z: Zone): void {
  const y = z.s.yard.at
  for (const t of [-0.5, 0.5]) z.tankFarm(z.p(150, t), yawTo(z.p(150, t), y), 12)
  z.garage(z.p(130, 0), y, 12, 0b110)
  z.put('waterTower', z.p(72, -0.42), 0, [5, 15, 5], 0, false, 1, 8)
  z.search(z.p(72, 0.45), 8, 30, (p) => z.L.group([
    mod('generator', p, yawTo(p, y) + Math.PI / 2, [3.6, 2.2, 1.6], 0),
    mod('generator', add(p, rot([2.6, 0], yawTo(p, y))), yawTo(p, y) + Math.PI / 2, [3.6, 2.2, 1.6], 1),
  ], 0.5))
  z.put('drums', z.p(118, 0.78), 0, [2.4, 1, 2.4], 7, true, 0.8, 8)
  z.put('drums', z.p(116, -0.78), 0, [2.4, 1, 2.4], 5, true, 0.8, 8)
  z.masts(2, 21)
}

function barracksDistrict(z: Zone): void {
  const y = z.s.yard.at
  for (const t of [-0.55, 0.55]) z.barracks(z.p(146, t), yawTo(z.p(146, t), y), 12)
  z.garage(z.p(126, 0), y, 10, 0b101)
  z.hesco(z.p(72, 0.25), yawTo(z.p(72, 0.25), y))
  z.put('sandbags', z.p(70, -0.4), yawTo(z.p(70, -0.4), y), [5.2, 1.4, 0.7], 2, true, 0.3, 6)
  z.search(z.p(118, -0.8), 10, 30, (p) => z.L.group([0, 1, 2].map((i) => mod('latrine', add(p, rot([i * 1.45, 0], yawTo(p, y))), yawTo(p, y), [1.3, 2.4, 1.3], i, true)), 0.3))
  z.put('waterTank', z.p(118, 0.8), 0, [3.2, 3.6, 3.2], 0, false, 0.6, 8)
  z.put('generator', z.p(166, 0), Math.PI / 2, [3.6, 2.2, 1.6], 1, false, 0.6, 12)
  z.masts(2, 21)
}

function citadel(z: Zone): void {
  const plan = z.plan
  const C = plan.centre
  // the keep at the back of the court, its vehicle bay facing the front gate: a spawn door
  const keepAt: Xz = [C[0], C[1] - 16]
  z.L.fixed(mod('keep', keepAt, 0, [KEEP.width, KEEP.height, KEEP.depth]), 1)
  plan.spawns.push({ at: [keepAt[0], keepAt[1] + KEEP.depth / 2 - KEEP_BAY_DEPTH + 4], exit: [keepAt[0], keepAt[1] + KEEP.depth / 2 + 8], sector: z.s.index })
  // the parade ground before it, and the road in from the gatehouse
  const gate = plan.gates.find((g) => g.kind === 'citadel' && g.out[1] > 0)!
  const parade: Xz = [C[0], C[1] + 16]
  z.apron(parade, 0, 56, 28, 3)
  const inner: Xz = [gate.at[0], gate.at[1] - (GATEHOUSE.depth - GATEHOUSE.front)]
  z.apron([inner[0], (inner[1] + parade[1] + 14) / 2], 0, CITADEL_GATES.front - 0.4, inner[1] - parade[1] - 14, 1)
  z.put('helipad', z.p(34, -18), 0, [16, 0.25, 16], 0, false, 1, 6)
  z.put('bunker', z.p(-33, -20), Math.PI / 2, [12, 4.6, 9], 0, false, 1, 6)
  z.garage(z.p(-37, 16), Math.PI / 2, 6, 0b111)
  for (const s of [-1, 1]) for (let i = 0; i < 2; i++) z.L.place(mod('flagpole', z.p(s * (12 + i * 4.5), -1.5), WIND, [0.8, 12, 0.8], i + (s > 0 ? 2 : 0)), 0.3)
  for (const [x, zz] of [[-30, 32], [30, 32], [-26, 2], [26, 2]]) z.put('mast', z.p(x, zz), z.s.yard.at, [1.4, 15, 1.4], 0, false, 0.6, 5)
  z.put('generator', z.p(30, -34), Math.PI / 2, [3.6, 2.2, 1.6], 2, false, 0.5, 6)
  z.put('waterTank', z.p(-26, -34), 0, [3.2, 3.6, 3.2], 0, false, 0.6, 6)
  for (const s of [-1, 1]) z.put('sandbags', z.p(s * 34, 24), s > 0 ? -Math.PI / 2 : Math.PI / 2, [6.2, 1.4, 0.7], 3, true, 0.3, 6)
  // stairs up the rampart's inner face either side of the front gatehouse, rising away from it
  const innerFace = gate.at[1] - RAMPART.thick
  const len = STAIR_LENGTH
  for (const s of [-1, 1]) {
    const x0 = gate.at[0] + s * (CITADEL_GATES.front / 2 + GATEHOUSE.tower + 1.5)
    const at: Xz = [x0 + s * len / 2, innerFace - STAIR_WIDTH / 2 - 0.02]
    const m = mod('stair', at, s > 0 ? 0 : Math.PI, [len, RAMPART.walk, STAIR_WIDTH], s > 0 ? 0 : 1)
    z.L.fixed(m, 0.3)
  }
}

/** The rampart stair's flight length and width (m): a 0.18 m rise on a 0.3 m going to the wall-walk. */
export const STAIR_WIDTH = 1.8
export const STAIR_LENGTH = Math.ceil(RAMPART.walk / 0.18) * 0.3 + 1.2

/** The gates that lead out of a district. */
export function gatesOf(plan: FortPlan, sector: number): Gate[] {
  return plan.gates.filter((g) => g.sectors.includes(sector))
}
