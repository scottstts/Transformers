import { Matrix4 } from 'three/webgpu'
import { MeshWriter, chamferBox, cylinderY, prismY, rect, strut, tube, type Vec3 } from './mesh'
import type { Module } from './plan'

const T = (x: number, y: number, z: number): Matrix4 => new Matrix4().makeTranslation(x, y, z)
const Ry = (a: number): Matrix4 => new Matrix4().makeRotationY(a)

/** An opening in a facade: centre, width, sill and head heights above the facade's foot; a door has no sill. */
interface Opening { x: number; w: number; sill: number; head: number }

/**
 * A facade with openings, built as real openings: the wall between them is
 * solid blocks (below the sills, the piers, above the heads). A window is
 * lined with a steel frame and a mullion, the glass set back in it and the
 * dark room behind; a door opening is left for its leaf. The facade lies in
 * the x-y plane, its outer face at z = 0 (+z outward), `t` thick.
 */
function facade(w: MeshWriter, slot: string, x0: number, x1: number, y0: number, y1: number, t: number, openings: Opening[]): void {
  const edges = [x0, ...openings.flatMap((o) => [o.x - o.w / 2, o.x + o.w / 2]), x1]
  // piers between the openings, full height; sill and head blocks under and over each
  for (let i = 0; i < edges.length; i += 2) if (edges[i + 1] - edges[i] > 1e-3) chamferBox(w, slot, [edges[i], y0, -t], [edges[i + 1], y1, 0], 0.02)
  for (const o of openings) {
    const { x, sill, head } = o
    const hw = o.w / 2
    if (sill > 0) chamferBox(w, slot, [x - hw, y0, -t], [x + hw, y0 + sill, 0], 0.015)
    chamferBox(w, slot, [x - hw, y0 + head, -t], [x + hw, y1, 0], 0.015)
    if (sill <= 0) continue
    // sill: a projecting drip, the frame round the opening, the mullion and the glass behind it
    chamferBox(w, 'darkSteel', [x - hw - 0.04, y0 + sill - 0.05, -0.02], [x + hw + 0.04, y0 + sill, 0.07], 0.01)
    const f = 0.06, gz = -t * 0.55
    chamferBox(w, 'darkSteel', [x - hw, y0 + sill, gz - 0.04], [x - hw + f, y0 + head, gz + 0.04], 0.008)
    chamferBox(w, 'darkSteel', [x + hw - f, y0 + sill, gz - 0.04], [x + hw, y0 + head, gz + 0.04], 0.008)
    chamferBox(w, 'darkSteel', [x - hw + f, y0 + head - f, gz - 0.04], [x + hw - f, y0 + head, gz + 0.04], 0.008)
    chamferBox(w, 'darkSteel', [x - hw + f, y0 + sill, gz - 0.04], [x + hw - f, y0 + sill + f, gz + 0.04], 0.008)
    chamferBox(w, 'darkSteel', [x - 0.025, y0 + sill + f, gz - 0.035], [x + 0.025, y0 + head - f, gz + 0.035], 0.006)
    w.poly('glass', [[x - hw + f, y0 + sill + f, gz], [x + hw - f, y0 + sill + f, gz], [x + hw - f, y0 + head - f, gz], [x - hw + f, y0 + head - f, gz]])
    // the dark room behind
    w.poly('interior', [[x - hw, y0 + sill, -t + 0.01], [x + hw, y0 + sill, -t + 0.01], [x + hw, y0 + head, -t + 0.01], [x - hw, y0 + head, -t + 0.01]])
  }
}

const windows = (xs: number[], w: number, sill: number, head: number): Opening[] => xs.map((x) => ({ x, w, sill, head }))

/** A split A/C condenser: a louvred case, a fan guard, feet, its pipes. Frame: base centre, the fan facing +z. */
function condenser(w: MeshWriter, M: Matrix4): void {
  w.place(M)
  chamferBox(w, 'prefab', [-0.45, 0.05, -0.18], [0.45, 0.72, 0.18], 0.025)
  chamferBox(w, 'darkSteel', [-0.4, 0, -0.16], [-0.3, 0.05, 0.16], 0.005)
  chamferBox(w, 'darkSteel', [0.3, 0, -0.16], [0.4, 0.05, 0.16], 0.005)
  w.place(M.clone().multiply(T(-0.08, 0.39, 0.18)).multiply(new Matrix4().makeRotationX(Math.PI / 2)))
  cylinderY(w, 'darkSteel', 0.24, 0, 0.02, 16, 0.005)
  cylinderY(w, 'interior', 0.2, -0.01, 0.021, 16, 0)
  w.place(M)
  for (const y of [0.25, 0.32]) strut(w, 'darkSteel', [0.42, y, -0.1], [0.42, y, -0.3], 0.012, 5, M)
}

/** The HQ block itself (m): width, height to the parapet, depth; its module's footprint adds the stair and walkway. */
export const HQ_BLOCK = { width: 20, height: 7.8, depth: 11 }

/**
 * The command post: a two-storey block of rendered concrete (20 x 11 m,
 * 7.8 m to the parapet). Windows are real openings on both floors, a floor
 * band marks the slab, a steel stair climbs the east end to a walkway along
 * the front with its railing, the entrance has a canopy and a sandbag screen,
 * and the roof carries condensers, a water tank, a dish and whip antennas.
 * The front and back facades run the full width; the end facades butt into
 * them (no coincident faces at the corners). Frame: the entrance faces +z.
 */
export function hq(w: MeshWriter, M: Matrix4): void {
  const W = HQ_BLOCK.width, H = HQ_BLOCK.height, D = HQ_BLOCK.depth
  const x = W / 2, z = D / 2, t = 0.3
  const floor2 = 3.7
  w.place(M)
  // plinth and floor slabs
  chamferBox(w, 'concrete', [-x - 0.15, -0.2, -z - 0.15], [x + 0.15, 0.35, z + 0.15], 0.04)
  chamferBox(w, 'interior', [-x + t, 0.35, -z + t], [x - t, 0.4, z - t], 0.01)
  // facades: front and back with six windows a floor (the front's middle bay is the entrance), the ends with two
  const front = [-7.5, -4.5, 4.5, 7.5]
  const ends = [-2.4, 2.4]
  for (const [yaw, span, lower, upper] of [
    [0, x, [...windows(front, 1.5, 1.0, 2.4), { x: 0, w: 2.6, sill: 0, head: 2.65 }], windows([...front, -1.5, 1.5].sort((a, b) => a - b), 1.5, 0.95, 2.35)],
    [Math.PI, x, windows([-7.5, -4.5, -1.5, 1.5, 4.5, 7.5], 1.5, 1.0, 2.4), windows([-7.5, -4.5, -1.5, 1.5, 4.5, 7.5], 1.5, 0.95, 2.35)],
    [Math.PI / 2, z - t, windows(ends, 1.5, 1.0, 2.4), windows(ends, 1.5, 0.95, 2.35)],
    [-Math.PI / 2, z - t, windows(ends, 1.5, 1.0, 2.4), windows(ends, 1.5, 0.95, 2.35)],
  ] as Array<[number, number, Opening[], Opening[]]>) {
    const d = yaw === 0 || yaw === Math.PI ? z : x
    const F = M.clone().multiply(Ry(yaw)).multiply(T(0, 0, d))
    w.place(F)
    facade(w, 'plaster', -span, span, 0.35, floor2, t, lower)
    facade(w, 'plaster', -span, span, floor2 + 0.35, H - 0.6, t, upper)
    // the floor band (the slab's edge) and the parapet with its coping
    chamferBox(w, 'concrete', [-span - 0.05, floor2, -t], [span + 0.05, floor2 + 0.35, 0.06], 0.03)
    chamferBox(w, 'plaster', [-span, H - 0.6, -t], [span, H, 0], 0.02)
    chamferBox(w, 'concrete', [-span - 0.06, H, -t - 0.06], [span + 0.06, H + 0.1, 0.06], 0.02)
  }
  w.place(M)
  // corners: proud pilasters over the joints
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const [xa, xb] = sx > 0 ? [x - 0.12, x + 0.18] : [-x - 0.18, -x + 0.12]
      const [za, zb] = sz > 0 ? [z - 0.12, z + 0.18] : [-z - 0.18, -z + 0.12]
      chamferBox(w, 'plaster', [xa, 0.35, za], [xb, H, zb], 0.03)
    }
  }
  // roof slab (inside the parapet) and the upper floor seen through the windows
  chamferBox(w, 'concrete', [-x + t, H - 0.9, -z + t], [x - t, H - 0.6, z - t], 0.01)
  chamferBox(w, 'interior', [-x + t, floor2, -z + t], [x - t, floor2 + 0.35, z - t], 0.01)
  // entrance: the door frame and its two leaves set in the opening, a canopy on brackets, steps, a sandbag screen
  chamferBox(w, 'darkSteel', [-1.3, 0.35, z - 0.22], [-1.18, 3.0, z - 0.04], 0.01)
  chamferBox(w, 'darkSteel', [1.18, 0.35, z - 0.22], [1.3, 3.0, z - 0.04], 0.01)
  chamferBox(w, 'darkSteel', [-1.18, 2.88, z - 0.22], [1.18, 3.0, z - 0.04], 0.01)
  chamferBox(w, 'steel', [-1.16, 0.38, z - 0.18], [-0.02, 2.86, z - 0.1], 0.01)
  chamferBox(w, 'steel', [0.02, 0.38, z - 0.18], [1.16, 2.86, z - 0.1], 0.01)
  chamferBox(w, 'darkSteel', [-2.3, 3.15, z], [2.3, 3.3, z + 1.8], 0.03)
  for (const sx of [-2.1, 2.1]) strut(w, 'darkSteel', [sx, 2.4, z], [sx, 3.15, z + 1.6], 0.04, 6, M)
  w.place(M)
  chamferBox(w, 'concrete', [-2.2, -0.1, z + 0.1], [2.2, 0.23, z + 1.3], 0.03)
  // the east stair: stringers, treads and a landing up to the walkway along the front
  const sx0 = x + 0.4
  const steps = 12
  const rise = (floor2 + 0.35) / steps
  for (const zz of [z - 0.2, z + 0.9]) strut(w, 'darkSteel', [sx0 + 4.2, 0.05, zz], [sx0 + 0.2, floor2 + 0.3, zz], 0.07, 6, M)
  strut(w, 'steel', [sx0 + 4.3, 1.0, z + 0.95], [sx0 + 0.2, floor2 + 1.3, z + 0.95], 0.022, 6, M)
  w.place(M)
  for (let i = 1; i <= steps; i++) {
    const px = sx0 + 4.2 - (i / steps) * 4.0
    chamferBox(w, 'darkSteel', [px - 0.17, i * rise - 0.04, z - 0.18], [px + 0.17, i * rise, z + 0.88], 0.008)
  }
  chamferBox(w, 'darkSteel', [x, floor2 + 0.3, z - 0.1], [x + 1.4, floor2 + 0.38, z + 1.3], 0.02)
  // the walkway along the front on cantilever brackets, and its railing
  chamferBox(w, 'darkSteel', [-x, floor2 + 0.3, z + 0.02], [x, floor2 + 0.38, z + 1.3], 0.02)
  for (let px = -x + 0.5; px <= x + 1.2; px += 2.5) {
    strut(w, 'darkSteel', [Math.min(px, x + 1.3), floor2 - 0.8, z + 0.02], [Math.min(px, x + 1.3), floor2 + 0.3, z + 1.2], 0.035, 5, M)
    strut(w, 'steel', [Math.min(px, x + 1.3), floor2 + 0.38, z + 1.25], [Math.min(px, x + 1.3), floor2 + 1.45, z + 1.25], 0.025, 6, M)
  }
  for (const y of [floor2 + 0.9, floor2 + 1.45]) strut(w, 'steel', [-x, y, z + 1.25], [x + 1.35, y, z + 1.25], 0.022, 6, M)
  w.place(M)
  // roof: condensers, a tank, a dish and antennas
  for (const cx of [-6, -3.5, 5.5]) condenser(w, M.clone().multiply(T(cx, H - 0.6, -z + 1.6)))
  w.place(M)
  cylinderY(w, 'poly', 0.8, H - 0.6, H + 1.1, 16, 0.05)
  w.place(M.clone().multiply(T(x - 3, 0, 1)))
  cylinderY(w, 'steel', 0.08, H - 0.6, H + 0.8, 8, 0.01)
  w.place(M.clone().multiply(T(x - 3, H + 0.9, 1)).multiply(new Matrix4().makeRotationX(-0.8)))
  cylinderY(w, 'galvanized', 0.75, 0, 0.1, 18, 0.04)
  cylinderY(w, 'darkSteel', 0.08, 0.1, 0.55, 8, 0.02)
  for (const [ax, az, h] of [[-x + 1, -z + 1, 6], [-x + 1.8, -z + 1, 4.5]] as Array<[number, number, number]>) {
    w.place(M.clone().multiply(T(ax, 0, az)))
    cylinderY(w, 'darkSteel', 0.03, H - 0.6, H - 0.6 + h, 6, 0)
  }
  w.place(M)
  // a sandbag screen off the entrance's flank
  sandbagRun(w, M.clone().multiply(T(-4.5, 0, z + 2.6)), 4.4, 5)
}

/** A short run of sandbags (courses) along x centred at the frame's origin. */
function sandbagRun(w: MeshWriter, M: Matrix4, len: number, courses: number): void {
  const l = 0.62, t = 0.36, h = 0.19
  for (let c = 0; c < courses; c++) {
    for (let u = -len / 2 + (c % 2 ? l / 2 : 0); u < len / 2 - l * 0.4; u += l + 0.01) {
      const k = Math.abs(Math.sin(u * 91.7 + c * 13.3))
      w.shade(k)
      w.place(M.clone().multiply(T(u + l / 2, c * h, (k - 0.5) * 0.04)).multiply(Ry((k - 0.5) * 0.08)))
      chamferBox(w, 'sandbag', [-l / 2, 0, -t / 2], [l / 2, h + 0.015, t / 2], 0.075)
    }
  }
  w.shade(0.5)
}

/**
 * A containerised housing unit (6.06 x 2.44 m, 2.59 m tall) on concrete
 * blocks: a steel frame with corner posts, ribbed insulated wall panels, a
 * door with its hood and a steel step, a barred window, an A/C condenser on
 * the end wall and its conduit. Frame: length along x, the door on +z.
 */
export function chu(w: MeshWriter, M: Matrix4, m: Module): void {
  const L = 6.06, D = 2.44, H = 2.59, lift = 0.3
  const x = L / 2, z = D / 2
  w.place(M)
  for (const bx of [-x + 0.3, x - 0.3]) for (const bz of [-z + 0.3, z - 0.3]) chamferBox(w, 'concrete', [bx - 0.22, -0.1, bz - 0.22], [bx + 0.22, lift, bz + 0.22], 0.02)
  w.shade(0.2 + m.variant * 0.3)
  const B = M.clone().multiply(T(0, lift, 0))
  w.place(B)
  // frame: posts, rails; panels set in; roof with a slight fall
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) chamferBox(w, 'prefab', [sx * x - (sx > 0 ? 0.12 : 0), 0, sz * z - (sz > 0 ? 0.12 : 0)], [sx * x + (sx < 0 ? 0.12 : 0), H, sz * z + (sz < 0 ? 0.12 : 0)], 0.012)
  chamferBox(w, 'prefab', [-x, 0, -z], [x, 0.16, z], 0.012)
  chamferBox(w, 'prefab', [-x, H - 0.14, -z], [x, H, z], 0.012)
  chamferBox(w, 'prefab', [-x + 0.08, 0.16, -z + 0.04], [x - 0.08, H - 0.14, z - 0.04], 0.01)
  prismY(w, 'prefab', rect(L - 0.1, D - 0.1), H, H + 0.05, 0.03)
  // panel ribs on the long walls (the door side between its openings)
  for (let i = 1; i < 6; i++) {
    const rx = -x + (i * L) / 6
    if (rx > x - 2.1 && rx < x - 0.6) continue
    for (const sz of [-1, 1]) chamferBox(w, 'prefab', [rx - 0.03, 0.2, sz * (z - 0.04) - (sz > 0 ? 0 : 0.03)], [rx + 0.03, H - 0.18, sz * (z - 0.04) + (sz > 0 ? 0.03 : 0)], 0.008)
  }
  // door near the +x end with its hood, a steel step
  const dx = x - 1.35
  chamferBox(w, 'darkSteel', [dx - 0.5, 0.16, z - 0.04], [dx + 0.5, 2.2, z + 0.02], 0.01)
  chamferBox(w, 'prefab', [dx - 0.44, 0.2, z + 0.02], [dx + 0.44, 2.14, z + 0.06], 0.01)
  chamferBox(w, 'darkSteel', [dx + 0.28, 1.0, z + 0.06], [dx + 0.36, 1.08, z + 0.12], 0.004)
  chamferBox(w, 'prefab', [dx - 0.65, 2.28, z - 0.02], [dx + 0.65, 2.36, z + 0.55], 0.015)
  w.place(M)
  chamferBox(w, 'darkSteel', [dx - 0.55, 0.1, z + 0.1], [dx + 0.55, 0.16, z + 0.75], 0.01)
  for (const sx of [-0.5, 0.5]) chamferBox(w, 'darkSteel', [dx + sx - 0.03, -0.05, z + 0.12], [dx + sx + 0.03, 0.1, z + 0.72], 0.005)
  w.place(B)
  // window with bars toward the other end
  const wx = -x + 1.6
  chamferBox(w, 'darkSteel', [wx - 0.62, 0.95, z - 0.04], [wx + 0.62, 1.95, z + 0.01], 0.01)
  w.poly('glass', [[wx - 0.55, 1.02, z + 0.012], [wx + 0.55, 1.02, z + 0.012], [wx + 0.55, 1.88, z + 0.012], [wx - 0.55, 1.88, z + 0.012]])
  for (let i = 0; i < 6; i++) {
    const bx = wx - 0.5 + i * 0.2
    chamferBox(w, 'darkSteel', [bx - 0.012, 0.98, z + 0.03], [bx + 0.012, 1.92, z + 0.055], 0.003)
  }
  chamferBox(w, 'darkSteel', [wx - 0.62, 1.92, z + 0.01], [wx + 0.62, 1.97, z + 0.07], 0.005)
  // A/C condenser on the -x end wall on a bracket, its conduit up the wall
  w.shade(0.5)
  condenser(w, B.clone().multiply(T(-x - 0.26, 0.9, 0.2)).multiply(Ry(-Math.PI / 2)))
  w.place(B)
  chamferBox(w, 'darkSteel', [-x - 0.45, 0.82, -0.3], [-x, 0.88, 0.7], 0.01)
  strut(w, 'darkSteel', [-x - 0.02, 1.2, 0.55], [-x - 0.02, H - 0.2, 0.55], 0.025, 5, B)
  w.place(M)
}

/**
 * A gate guard booth: a plinth, steel walls under a continuous window band
 * with mullions, a door, a flat overhanging roof with a condenser and a whip
 * antenna. Frame: its door faces +z.
 */
export function booth(w: MeshWriter, M: Matrix4): void {
  const s = 1.2, H = 2.7
  w.place(M)
  chamferBox(w, 'concrete', [-s - 0.15, -0.1, -s - 0.15], [s + 0.15, 0.25, s + 0.15], 0.03)
  for (let f = 0; f < 4; f++) {
    const F = M.clone().multiply(Ry((f * Math.PI) / 2))
    w.place(F)
    const door = f === 0
    if (door) {
      chamferBox(w, 'prefab', [-s, 0.25, s - 0.1], [-0.45, 1.1, s], 0.01)
      chamferBox(w, 'darkSteel', [-0.45, 0.25, s - 0.08], [0.45, 2.2, s - 0.02], 0.01)
      chamferBox(w, 'prefab', [0.45, 0.25, s - 0.1], [s, 1.1, s], 0.01)
      chamferBox(w, 'prefab', [-0.45, 2.2, s - 0.1], [0.45, H - 0.35, s], 0.01)
    } else chamferBox(w, 'prefab', [-s, 0.25, s - 0.1], [s, 1.1, s], 0.01)
    chamferBox(w, 'prefab', [-s, H - 0.35, s - 0.1], [s, H, s], 0.01)
    const glass = (a: number, b: number): void => w.poly('glass', [[a, 1.1, s - 0.05], [b, 1.1, s - 0.05], [b, H - 0.35, s - 0.05], [a, H - 0.35, s - 0.05]])
    if (door) { glass(-s + 0.05, -0.47); glass(0.47, s - 0.05) } else glass(-s + 0.05, s - 0.05)
    for (const mx of door ? [-s + 0.04, s - 0.04] : [-s + 0.04, 0, s - 0.04]) chamferBox(w, 'darkSteel', [mx - 0.04, 1.1, s - 0.09], [mx + 0.04, H - 0.35, s], 0.006)
  }
  w.place(M)
  chamferBox(w, 'interior', [-s + 0.1, 0.25, -s + 0.1], [s - 0.1, 0.3, s - 0.1], 0.01)
  chamferBox(w, 'darkSteel', [-s - 0.45, H, -s - 0.45], [s + 0.45, H + 0.16, s + 0.45], 0.03)
  condenser(w, M.clone().multiply(T(-0.3, H + 0.16, -0.4)))
  w.place(M.clone().multiply(T(s, 0, -s)))
  cylinderY(w, 'darkSteel', 0.02, H + 0.16, H + 3.2, 5, 0)
  w.place(M)
}

/**
 * A motor-pool canopy: square hollow-section columns on footings, eaves
 * beams, pitched lattice trusses at every bay, purlins and a corrugated roof
 * falling to the back, X-bracing in the end bays and a gutter. Frame: open
 * front toward +z, `m.size` = width (x), eaves height, depth (z).
 */
export function canopy(w: MeshWriter, M: Matrix4, m: Module): void {
  const [W, H, D] = m.size
  const x = W / 2, z = D / 2
  const bays = Math.max(1, Math.round(W / 6))
  const back = H - 0.7
  // the roof's underside height at depth u: H at the open front, falling to `back`
  const at = (u: number): number => H - (H - back) * ((z - u) / D)
  w.place(M)
  for (let i = 0; i <= bays; i++) {
    const cx = -x + (i * W) / bays
    for (const sz of [-1, 1]) {
      const cz = sz * z
      const top = at(cz)
      chamferBox(w, 'concrete', [cx - 0.4, -0.2, cz - 0.4], [cx + 0.4, 0.3, cz + 0.4], 0.04)
      chamferBox(w, 'darkSteel', [cx - 0.28, 0.3, cz - 0.28], [cx + 0.28, 0.34, cz + 0.28], 0.01)
      chamferBox(w, 'steel', [cx - 0.13, 0.34, cz - 0.13], [cx + 0.13, top - 0.2, cz + 0.13], 0.015)
    }
    // the truss: top chord along the roof, bottom chord level, zig-zag web
    const tzA = z, tzB = -z
    strut(w, 'steel', [cx, at(tzA) - 0.1, tzA], [cx, at(tzB) - 0.1, tzB], 0.06, 6, M)
    strut(w, 'steel', [cx, back - 0.9, tzA], [cx, back - 0.9, tzB], 0.05, 6, M)
    const webs = 6
    for (let k = 0; k < webs; k++) {
      const za = tzA - (k / webs) * D, zb = tzA - ((k + 1) / webs) * D
      strut(w, 'steel', [cx, k % 2 ? back - 0.9 : at(za) - 0.12, za], [cx, k % 2 ? at(zb) - 0.12 : back - 0.9, zb], 0.03, 5, M)
    }
    w.place(M)
  }
  // eaves beams and purlins
  for (const sz of [-1, 1]) chamferBox(w, 'steel', [-x - 0.2, at(sz * z) - 0.22, sz * z - 0.12], [x + 0.2, at(sz * z) - 0.02, sz * z + 0.12], 0.015)
  for (let k = 1; k < 6; k++) {
    const pz = z - (k / 6) * D
    chamferBox(w, 'darkSteel', [-x - 0.2, at(pz) - 0.02, pz - 0.05], [x + 0.2, at(pz) + 0.1, pz + 0.05], 0.01)
  }
  // X-bracing in the end bays' back walls
  for (const cx of [-x, x - W / bays]) {
    strut(w, 'darkSteel', [cx, 0.4, -z], [cx + W / bays, at(-z) - 0.3, -z], 0.025, 5, M)
    strut(w, 'darkSteel', [cx + W / bays, 0.4, -z], [cx, at(-z) - 0.3, -z], 0.025, 5, M)
  }
  w.place(M)
  // corrugated roof: rows every half pitch across the width, normals tilted alternately along x
  const pitch = 0.2, depthZ = 0.035
  const n = Math.round((W + 0.6) / (pitch / 2))
  const slope = (0.6 * Math.PI * depthZ) / pitch
  const fall = (H - back) / D
  const rows: Vec3[][] = [], normals: Vec3[][] = []
  for (let i = 0; i <= n; i++) {
    const rx = -x - 0.3 + (i / n) * (W + 0.6)
    const tilt = i % 2 ? slope : -slope
    rows.push([[rx, at(-z - 0.4) + 0.12, -z - 0.4], [rx, at(z + 0.5) + 0.12, z + 0.5]])
    normals.push([[tilt, 1, -fall], [tilt, 1, -fall]])
  }
  // rows run along x; the quads between them face up
  w.grid('galvanized', rows, normals)
  const under = rows.map((r) => r.map(([px, py, pz]) => [px, py - 0.012, pz] as Vec3).reverse())
  const underN = normals.map((r) => r.map(() => [0, -1, 0] as Vec3))
  w.grid('galvanized', under, underN)
  // gutter along the low back edge
  w.place(M.clone().multiply(T(0, at(-z - 0.4) + 0.02, -z - 0.45)).multiply(new Matrix4().makeRotationZ(Math.PI / 2)))
  cylinderY(w, 'galvanized', 0.09, -x - 0.3, x + 0.3, 10, 0, [true, true])
  w.place(M)
}

/**
 * A shade sail: a tensioned fabric hypar between four posts at alternating
 * heights, its edges cut in catenaries, tensioned to the posts' tops by
 * short wires, each post guyed to a ground anchor. Frame: `m.size` = span
 * across the posts (x), mean height, span (z).
 */
export function sail(w: MeshWriter, M: Matrix4, m: Module): void {
  const [W, H, D] = m.size
  const x = W / 2, z = D / 2
  const hi = H + 0.55, lo = H - 0.55
  const corners: Array<[number, number, number]> = [[-x, lo, -z], [x, hi, -z], [x, lo, z], [-x, hi, z]]
  w.place(M)
  for (const [px, py, pz] of corners) {
    chamferBox(w, 'concrete', [px - 0.3, -0.2, pz - 0.3], [px + 0.3, 0.25, pz + 0.3], 0.03)
    w.place(M.clone().multiply(T(px, 0, pz)))
    cylinderY(w, 'galvanized', 0.1, 0.25, py + 0.35, 10, 0.02)
    w.place(M)
    // a guy out to an anchor
    const gx = px + Math.sign(px) * 1.6
    strut(w, 'darkSteel', [px, py + 0.2, pz], [gx, 0.02, pz + Math.sign(pz) * 0.8], 0.01, 4, M)
    w.place(M)
  }
  // the fabric: a bilinear hypar inset from the posts, each edge pulled in along a catenary-like cut
  // (deepest mid-edge, fading across the sail), with a slight belly under its own weight
  const nu = 10, nv = 6
  const inset = 0.45
  const cutX = 0.06 * W, cutZ = 0.1 * D
  const point = (u: number, v: number): Vec3 => {
    const a = corners[0], b = corners[1], c = corners[2], d = corners[3]
    const lerp = (p: number[], q: number[], t: number): number[] => p.map((pv, i) => pv + (q[i] - pv) * t)
    const p = lerp(lerp(a, b, u), lerp(d, c, u), v)
    const ez = cutX * Math.sin(Math.PI * u) * (1 - 2 * v)
    const ex = cutZ * Math.sin(Math.PI * v) * (1 - 2 * u)
    const sag = -0.18 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v)
    return [p[0] * (1 - (2 * inset) / W) + ex, p[1] + sag, p[2] * (1 - (2 * inset) / D) + ez]
  }
  const rows: Vec3[][] = [], normals: Vec3[][] = []
  const e = 0.01
  for (let j = 0; j <= nv; j++) {
    const row: Vec3[] = [], nrm: Vec3[] = []
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv
      row.push(point(u, v))
      // central differences (clamped at the edges)
      const u0 = point(Math.max(0, u - e), v), u1 = point(Math.min(1, u + e), v)
      const v0 = point(u, Math.max(0, v - e)), v1 = point(u, Math.min(1, v + e))
      const a = [u1[0] - u0[0], u1[1] - u0[1], u1[2] - u0[2]], b = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]]
      const nx = a[1] * b[2] - a[2] * b[1], ny = a[2] * b[0] - a[0] * b[2], nz = a[0] * b[1] - a[1] * b[0]
      const l = Math.hypot(nx, ny, nz) || 1
      // the normal of the side the grid winds as its front (DoubleSide flips it for the other)
      nrm.push([nx / l, ny / l, nz / l])
    }
    rows.push(row)
    normals.push(nrm)
  }
  w.shade(0.3 + m.variant * 0.35)
  w.grid('canvas', rows, normals)
  w.shade(0.5)
  // the corner wires from the fabric's corners to the posts
  const fc = [point(0, 0), point(1, 0), point(1, 1), point(0, 1)]
  corners.forEach(([px, py, pz], i) => strut(w, 'darkSteel', [px, py + 0.1, pz], fc[i], 0.012, 4, M))
  w.place(M)
}

/**
 * A diesel generator set: a skid over its belly fuel tank, the acoustic
 * enclosure with louvred intake panels on both long sides, access doors, a
 * control panel, an exhaust stack with a rain cap, lifting eyes and its cable
 * run into the ground. Frame: length along x.
 */
export function generator(w: MeshWriter, M: Matrix4, m: Module): void {
  const [L, H, D] = m.size
  const x = L / 2, z = D / 2
  w.place(M)
  chamferBox(w, 'darkSteel', [-x, 0, -z], [x, 0.18, z], 0.02)
  chamferBox(w, 'darkSteel', [-x + 0.15, 0.18, -z + 0.1], [x - 0.15, 0.55, z - 0.1], 0.03)
  w.shade(0.3 + m.variant * 0.25)
  chamferBox(w, 'steel', [-x + 0.05, 0.55, -z + 0.02], [x - 0.05, H - 0.15, z - 0.02], 0.04)
  prismY(w, 'steel', rect(L - 0.06, D + 0.02), H - 0.15, H, 0.05)
  // louvre panels: angled slats in a frame on both sides of the intake end
  for (const sz of [-1, 1]) {
    const F = M.clone().multiply(Ry(sz > 0 ? 0 : Math.PI))
    w.place(F)
    const lx0 = sz > 0 ? -x + 0.25 : -x + 0.25, lx1 = lx0 + 1.2
    chamferBox(w, 'darkSteel', [lx0 - 0.05, 0.75, z - 0.02], [lx1 + 0.05, H - 0.35, z + 0.02], 0.008)
    for (let yy = 0.85; yy < H - 0.45; yy += 0.09) {
      w.poly('darkSteel', [[lx0, yy, z + 0.03], [lx1, yy, z + 0.03], [lx1, yy + 0.07, z - 0.01], [lx0, yy + 0.07, z - 0.01]])
    }
    // access doors: seams and handles
    for (const dx0 of [0.3, 1.4]) {
      chamferBox(w, 'steel', [dx0, 0.7, z - 0.02], [dx0 + 1.0, H - 0.3, z + 0.01], 0.01)
      chamferBox(w, 'darkSteel', [dx0 + 0.85, 1.2, z + 0.01], [dx0 + 0.9, 1.4, z + 0.05], 0.005)
    }
    w.place(M)
  }
  // control panel at the end, the stack, the eyes, the cable
  chamferBox(w, 'darkSteel', [x - 0.04, 0.9, -0.4], [x + 0.03, 1.7, 0.4], 0.01)
  chamferBox(w, 'glass', [x + 0.03, 1.3, -0.25], [x + 0.035, 1.6, 0.25], 0.004)
  w.place(M.clone().multiply(T(x - 0.6, 0, 0)))
  cylinderY(w, 'darkSteel', 0.1, H, H + 1.1, 10, 0.01)
  w.place(M.clone().multiply(T(x - 0.6, H + 1.15, 0)).multiply(new Matrix4().makeRotationZ(-0.5)))
  cylinderY(w, 'darkSteel', 0.14, -0.02, 0.02, 10, 0)
  w.place(M)
  for (const ex of [-x + 0.4, x - 0.4]) strut(w, 'darkSteel', [ex, H, 0], [ex, H + 0.15, 0], 0.03, 5, M)
  tube(w, 'rubber', [[-x + 0.1, 0.4, z - 0.3], [-x - 0.4, 0.3, z - 0.3], [-x - 0.9, 0.06, z - 0.1], [-x - 2.2, 0.04, z + 0.4]], 0.03, 6)
  w.shade(0.5)
}

/**
 * A boom barrier at a gate: a steel cabinet housing the drive, the pivot, a
 * counterweight, and the red-and-white arm raised open. Frame: the arm lowers
 * along +z; `m.size[2]` is its length.
 */
export function boom(w: MeshWriter, M: Matrix4, m: Module): void {
  const len = Math.min(m.size[2], 7)
  w.place(M)
  chamferBox(w, 'concrete', [-0.45, -0.1, -0.45], [0.45, 0.15, 0.45], 0.02)
  chamferBox(w, 'steel', [-0.3, 0.15, -0.3], [0.3, 1.1, 0.3], 0.03)
  prismY(w, 'steel', rect(0.66, 0.66), 1.1, 1.16, 0.03)
  // arm raised to 84 degrees about the pivot at the cabinet's top
  const A = M.clone().multiply(T(0.36, 1.0, 0)).multiply(new Matrix4().makeRotationX(-(84 * Math.PI) / 180))
  w.place(A)
  chamferBox(w, 'darkSteel', [-0.05, -0.1, -0.1], [0.12, 0.1, 0.1], 0.01)
  const segs = Math.round(len / 0.6)
  for (let i = 0; i < segs; i++) {
    const z0 = 0.1 + (i * (len - 0.1)) / segs, z1 = 0.1 + ((i + 1) * (len - 0.1)) / segs
    chamferBox(w, i % 2 ? 'paint' : 'signalRed', [0, -0.055, z0], [0.1, 0.055, z1 - 0.004], 0.012)
  }
  chamferBox(w, 'darkSteel', [0, -0.09, -0.75], [0.1, 0.09, -0.1], 0.015)
  w.place(M)
}
