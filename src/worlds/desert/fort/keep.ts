import { Matrix4 } from 'three/webgpu'
import { MeshWriter, chamferBox, cylinderY, revolveY, strut, type Vec2, type Vec3 } from './mesh'
import { condenser, facade, windows, type Opening } from './buildings'
import { KEEP_BAY, KEEP_BAY_DEPTH } from './layout'

/**
 * The command keep, the fortress's landmark: a two-storey reinforced
 * concrete podium (38 x 24 m) with a four-storey tower rising from its
 * back half to a control room, the whole crowned by a radome.
 *
 *   podium  a weathered plinth course, armoured slit windows as real
 *           openings with deep reveals, a floor band, a parapet with its
 *           coping; the vehicle bay (the garrison's door) through the
 *           middle of the front, 9 m wide and 7 m high, with its blast door
 *           parked open on its track beside it and a fin framing it; the
 *           roof in front of the tower a terrace of plant;
 *   tower   16 x 16 m, four storeys of windows between floor bands and
 *           corner pilasters, set back from the podium's edges;
 *   crown   a cantilevered control room glazed on all four sides, the
 *           glass leaning out (no reflections of the room in it from
 *           below), under a deep overhanging roof with a radome, masts and
 *           an obstruction light.
 *
 * Frame: base centre, the bay facing +z.
 */
export const KEEP = { width: 38, depth: 24, height: 33.4 }

const T = (x: number, y: number, z: number): Matrix4 => new Matrix4().makeTranslation(x, y, z)
const Ry = (a: number): Matrix4 => new Matrix4().makeRotationY(a)

const PLINTH = 0.6
const FLOOR2 = 4.7
const PODIUM = 9.2
const WALL = 0.35
/** Tower: half-size, centre z, storey height, storeys; the control room's floor and roof. */
const TW = 8
const TZ = -3.2
const STOREY = 3.9
const STOREYS = 4
const CAB = PODIUM - 0.8 + STOREY * STOREYS
const CAB_TOP = CAB + 3.4

export function keep(w: MeshWriter, M: Matrix4): void {
  const x = KEEP.width / 2, z = KEEP.depth / 2
  const bay = KEEP_BAY / 2
  w.place(M)
  // the plinth course round the facades, broken for the bay
  const plinth = (x0: number, z0: number, x1: number, z1: number): void => chamferBox(w, 'concrete', [x0, -0.2, z0], [x1, PLINTH, z1], 0.08)
  plinth(-x - 0.3, z - 0.6, -bay, z + 0.3)
  plinth(bay, z - 0.6, x + 0.3, z + 0.3)
  plinth(-x - 0.3, -z - 0.3, x + 0.3, -z + 0.6)
  plinth(-x - 0.3, -z + 0.6, -x + 0.6, z - 0.6)
  plinth(x - 0.6, -z + 0.6, x + 0.3, z - 0.6)
  // facades: slit windows on both floors; the front's bay runs through both, the blast door covers the right of it
  const slits = (xs: number[]): Opening[] => windows(xs, 1.0, 1.2, 3.0)
  const upper = (xs: number[]): Opening[] => windows(xs, 1.2, 0.9, 2.6)
  const frontLower = [...slits([-16.5, -13.5, -10.5, -7.5, 16.5]), { x: 0, w: KEEP_BAY, sill: 0, head: FLOOR2 - PLINTH }]
  const frontUpper = [...upper([-16.5, -13.5, -10.5, -7.5, 7.5, 10.5, 13.5, 16.5]), { x: 0, w: KEEP_BAY, sill: 0, head: 7.0 - FLOOR2 - 0.35 }]
  const backXs = [-15, -11.25, -7.5, -3.75, 0, 3.75, 7.5, 11.25, 15]
  const endXs = [-8, -4, 0, 4, 8]
  const faces: Array<[number, number, Opening[], Opening[]]> = [
    [0, x, frontLower, frontUpper],
    [Math.PI, x, slits(backXs), upper(backXs)],
    [Math.PI / 2, z - WALL, slits(endXs), upper(endXs)],
    [-Math.PI / 2, z - WALL, slits(endXs), upper(endXs)],
  ]
  for (const [yaw, span, lower, up] of faces) {
    const d = yaw === 0 || yaw === Math.PI ? z : x
    const F = M.clone().multiply(Ry(yaw)).multiply(T(0, 0, d))
    w.place(F)
    // the bay runs through both floors: the floor band breaks round it
    facade(w, 'plaster', -span, span, PLINTH, FLOOR2, WALL, lower)
    facade(w, 'plaster', -span, span, FLOOR2 + 0.35, PODIUM - 0.8, WALL, up)
    if (yaw === 0) {
      chamferBox(w, 'concrete', [-span - 0.05, FLOOR2, -WALL], [-bay, FLOOR2 + 0.35, 0.06], 0.03)
      chamferBox(w, 'concrete', [bay, FLOOR2, -WALL], [span + 0.05, FLOOR2 + 0.35, 0.06], 0.03)
    } else chamferBox(w, 'concrete', [-span - 0.05, FLOOR2, -WALL], [span + 0.05, FLOOR2 + 0.35, 0.06], 0.03)
    chamferBox(w, 'plaster', [-span, PODIUM - 0.8, -WALL], [span, PODIUM, 0], 0.02)
    chamferBox(w, 'concrete', [-span - 0.07, PODIUM, -WALL - 0.07], [span + 0.07, PODIUM + 0.1, 0.07], 0.02)
  }
  w.place(M)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const [xa, xb] = sx > 0 ? [x - 0.14, x + 0.2] : [-x - 0.2, -x + 0.14]
    const [za, zb] = sz > 0 ? [z - 0.14, z + 0.2] : [-z - 0.2, -z + 0.14]
    chamferBox(w, 'plaster', [xa, PLINTH, za], [xb, PODIUM, zb], 0.03)
  }
  // floors seen through the windows, the roof slab
  chamferBox(w, 'interior', [-x + WALL, PLINTH, -z + WALL], [x - WALL, PLINTH + 0.05, z - WALL - KEEP_BAY_DEPTH], 0.01)
  const behind = z - KEEP_BAY_DEPTH
  chamferBox(w, 'interior', [-x + WALL, FLOOR2, -z + WALL], [-bay - 0.02, FLOOR2 + 0.35, z - WALL], 0.01)
  chamferBox(w, 'interior', [bay + 0.02, FLOOR2, -z + WALL], [x - WALL, FLOOR2 + 0.35, z - WALL], 0.01)
  chamferBox(w, 'interior', [-bay - 0.02, FLOOR2, -z + WALL], [bay + 0.02, FLOOR2 + 0.35, behind - 0.02], 0.01)
  chamferBox(w, 'concrete', [-x + WALL, PODIUM - 1.1, -z + WALL], [x - WALL, PODIUM - 0.8, z - WALL], 0.01)
  bayRoom(w, M, z)
  w.place(M)
  blastDoor(w, z)
  // the fin framing the bay on its left
  chamferBox(w, 'concrete', [-bay - 1.9, -0.2, z - 0.2], [-bay - 0.9, PODIUM + 0.3, z + 1.3], 0.06)
  // the terrace: plant on the roof before the tower
  for (const cx of [-14, -10.5, 10.5, 14]) condenser(w, M.clone().multiply(T(cx, PODIUM - 0.8, z - 2.6)))
  w.place(M)
  chamferBox(w, 'darkSteel', [-2.2, PODIUM - 0.8, z - 4.2], [-0.8, PODIUM - 0.1, z - 2.8], 0.03)
  for (const vx of [4, 5.2]) {
    w.place(M.clone().multiply(T(vx, 0, z - 3.4)))
    cylinderY(w, 'galvanized', 0.18, PODIUM - 0.8, PODIUM + 0.6, 10, 0.02)
    cylinderY(w, 'galvanized', 0.3, PODIUM + 0.6, PODIUM + 0.75, 10, 0.03)
  }
  w.place(M)
  tower(w, M.clone().multiply(T(0, 0, TZ)))
}

/** The vehicle bay behind the opening: a dark hall with a paved floor and strip lights. */
function bayRoom(w: MeshWriter, M: Matrix4, z: number): void {
  const bay = KEEP_BAY / 2
  const z0 = z - KEEP_BAY_DEPTH, z1 = z - WALL
  const top = 7.0
  const ceil = 7.0
  for (let i = 0; i < 3; i++) {
    const a = z0 + (i / 3) * (z1 - z0), b = z0 + ((i + 1) / 3) * (z1 - z0)
    for (const [xa, xb] of [[-bay, 0], [0, bay]]) chamferBox(w, 'pavement', [xa + 0.004, -0.12, a + 0.004], [xb - 0.004, 0.03, b - 0.004], 0.012)
  }
  // the continuation of the paving out through the opening's reveal
  chamferBox(w, 'pavement', [-bay + 0.004, -0.12, z1 + 0.004], [bay - 0.004, 0.03, z + 0.3], 0.012)
  w.poly('interior', [[-bay, 0, z0], [-bay, 0, z1], [-bay, top, z1], [-bay, top, z0]])
  w.poly('interior', [[bay, 0, z1], [bay, 0, z0], [bay, top, z0], [bay, top, z1]])
  w.poly('interior', [[-bay, 0, z0], [-bay, top, z0], [bay, top, z0], [bay, 0, z0]])
  w.poly('interior', [[-bay, ceil, z0], [-bay, ceil, z1], [bay, ceil, z1], [bay, ceil, z0]])
  for (const lx of [-2, 2]) chamferBox(w, 'lamp', [lx - 0.1, ceil - 0.06, z0 + 1], [lx + 0.1, ceil, z1 - 1], 0.01)
  // steel buffer at the back wall, yellow bollards guarding the reveal
  chamferBox(w, 'darkSteel', [-bay + 0.5, 0.4, z0], [bay - 0.5, 0.75, z0 + 0.25], 0.03)
  for (const bx of [-bay - 0.45, bay + 0.45]) bollard(w, M.clone().multiply(T(bx, 0, z + 1.05)))
}

/** A steel bollard filled with concrete, painted, with a domed cap. Frame: base centre. */
export function bollard(w: MeshWriter, M: Matrix4): void {
  w.place(M)
  revolveY(w, 'safety', [[0.13, -0.1], [0.13, 1.0], [0.1, 1.08], [0.001, 1.12]], [[1, 0], [1, 0.2], [0.6, 1], [0, 1]], 12)
}

/** The bay's blast door, a stiffened steel slab rolled open on its track along the facade. */
function blastDoor(w: MeshWriter, z: number): void {
  const bay = KEEP_BAY / 2
  const x0 = bay + 0.2, x1 = x0 + KEEP_BAY + 0.4
  chamferBox(w, 'steel', [x0, 0.04, z + 0.22], [x1, 7.25, z + 0.68], 0.04)
  for (const y of [1.2, 3.6, 6.0]) chamferBox(w, 'darkSteel', [x0 + 0.1, y - 0.12, z + 0.66], [x1 - 0.1, y + 0.12, z + 0.8], 0.02)
  for (const xs of [x0 + 0.1, x1 - 0.35]) chamferBox(w, 'darkSteel', [xs, 0.2, z + 0.66], [xs + 0.25, 7.0, z + 0.8], 0.02)
  // the top track on brackets across the bay and the door's run, the floor guide
  chamferBox(w, 'darkSteel', [-bay - 0.6, 7.3, z + 0.05], [x1 + 0.4, 7.7, z + 0.85], 0.03)
  chamferBox(w, 'darkSteel', [-bay - 0.6, 0, z + 0.3], [x1 + 0.4, 0.05, z + 0.6], 0.01)
}

/** The tower and its crown, in a frame centred on the tower's footprint. */
function tower(w: MeshWriter, M: Matrix4): void {
  const base = PODIUM - 0.8
  const xs = [-5.4, -1.8, 1.8, 5.4]
  for (let f = 0; f < 4; f++) {
    const yaw = (f * Math.PI) / 2
    const span = f % 2 === 0 ? TW : TW - WALL
    const F = M.clone().multiply(Ry(yaw)).multiply(T(0, 0, TW))
    w.place(F)
    for (let k = 0; k < STOREYS; k++) {
      const y0 = base + k * STOREY + (k === 0 ? 0 : 0.3)
      facade(w, 'plaster', -span, span, y0, base + (k + 1) * STOREY, WALL, windows(xs, 1.4, k === 0 ? 1.2 : 0.9, 2.75))
      if (k > 0) chamferBox(w, 'concrete', [-span - 0.05, base + k * STOREY, -WALL], [span + 0.05, base + k * STOREY + 0.3, 0.06], 0.03)
    }
  }
  w.place(M)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const [xa, xb] = sx > 0 ? [TW - 0.14, TW + 0.24] : [-TW - 0.24, -TW + 0.14]
    const [za, zb] = sz > 0 ? [TW - 0.14, TW + 0.24] : [-TW - 0.24, -TW + 0.14]
    chamferBox(w, 'plaster', [xa, base, za], [xb, CAB, zb], 0.03)
  }
  for (let k = 1; k < STOREYS; k++) chamferBox(w, 'interior', [-TW + WALL, base + k * STOREY, -TW + WALL], [TW - WALL, base + k * STOREY + 0.3, TW - WALL], 0.01)
  // the control room: a cantilevered floor, glass leaning out between corner posts and mullions, the roof
  const o = TW + 1.0
  chamferBox(w, 'concrete', [-o, CAB, -o], [o, CAB + 0.45, o], 0.06)
  chamferBox(w, 'interior', [-TW + WALL, CAB - 0.3, -TW + WALL], [TW - WALL, CAB, TW - WALL], 0.01)
  const lo = o - 0.25, hi = o + 0.35, y0 = CAB + 0.45, y1 = CAB_TOP
  chamferBox(w, 'darkSteel', [-lo, y0, -lo], [lo, y0 + 0.35, lo], 0.02)
  for (let f = 0; f < 4; f++) {
    const R = M.clone().multiply(Ry((f * Math.PI) / 2))
    w.place(R)
    const g0 = y0 + 0.35
    w.poly('glass', [[-lo, g0, lo], [lo, g0, lo], [hi, y1, hi], [-hi, y1, hi]])
    // mullions every 2.4 m along the leaning face
    for (let k = -3; k <= 3; k++) {
      const u = k / 3.6
      strut(w, 'darkSteel', [u * lo, g0, lo + 0.02], [u * hi, y1, hi + 0.02], 0.05, 6, R)
    }
    strut(w, 'darkSteel', [-lo, g0, lo], [-hi, y1, hi], 0.09, 6, R)
    w.place(R)
    chamferBox(w, 'darkSteel', [-hi - 0.1, y1 - 0.25, hi - 0.25], [hi + 0.1, y1, hi + 0.08], 0.02)
  }
  w.place(M)
  // the roof, deep eaves with a fascia
  const r = hi + 0.9
  chamferBox(w, 'concrete', [-r, y1, -r], [r, y1 + 0.55, r], 0.06)
  chamferBox(w, 'darkSteel', [-r - 0.05, y1 + 0.55, -r - 0.05], [r + 0.05, y1 + 0.7, r + 0.05], 0.02)
  // the radome on its drum, masts and the obstruction light
  const top = y1 + 0.7
  cylinderY(w, 'galvanized', 2.2, top, top + 0.85, 24, 0.05)
  const R0 = 2.8, cy = top + 0.85 + Math.sqrt(R0 * R0 - 2.15 * 2.15)
  const prof: Vec2[] = [], nrm: Vec2[] = []
  const a0 = -Math.asin((cy - top - 0.85) / R0)
  for (let k = 0; k <= 12; k++) {
    const a = a0 + ((Math.PI / 2 - a0) * k) / 12
    prof.push([Math.max(0.001, Math.cos(a) * R0), cy + Math.sin(a) * R0])
    nrm.push([Math.cos(a), Math.sin(a)])
  }
  revolveY(w, 'radome', prof, nrm, 32)
  for (const [mx, mz, h] of [[r - 1.2, r - 1.2, 7.5], [-r + 1.2, -r + 1.2, 5.5]] as Array<[number, number, number]>) {
    w.place(M.clone().multiply(T(mx, 0, mz)))
    cylinderY(w, 'darkSteel', 0.07, top, top + h, 8, 0.01)
    for (let k = 1; k < 4; k++) {
      const yy = top + (h * k) / 4
      strut(w, 'darkSteel', [-0.45, yy, 0] as Vec3, [0.45, yy, 0] as Vec3, 0.015, 4, M.clone().multiply(T(mx, 0, mz)))
    }
    w.place(M.clone().multiply(T(mx, 0, mz)))
    cylinderY(w, 'beacon', 0.1, top + h, top + h + 0.2, 10, 0.03)
  }
  w.place(M)
}
