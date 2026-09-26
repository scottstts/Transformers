import { Matrix4, Vector3 } from 'three/webgpu'
import { MeshWriter, chamferBox, strut, type Vec2, type Vec3 } from './mesh'
import type { Module, RampartRun, Xz } from './plan'

/**
 * The citadel's rampart: cast-in-place reinforced concrete on a battered
 * face, 7.75 m to its crest. Section (u outward from the foot line, v up):
 * a projecting plinth with a weathered top, the outer face leaning back
 * 0.9 m over its height, a parapet crenellated with merlons and embrasures,
 * a 2.9 m wall-walk behind it at 6.2 m, and the vertical inner face. The
 * body is solid (4.2 m at the walk), as a rampart's is.
 *
 * The section is swept along each run with mitred joints at the trace's
 * corners, so the faces of adjacent stretches meet on the corner's bisector
 * and no face overlaps another. Runs are cast in pours of at most 7.5 m;
 * each pour carries its own tone (the formwork's lifts and the day's mix),
 * which is what marks cast walls. Merlons stand on the straight stretches
 * only, kept back from the corners; counterforts buttress the inner face;
 * a galvanized railing guards the walk's inner edge; lamps light the court.
 */
export const RAMPART = { walk: 6.2, sill: 7.15, top: 7.75, thick: 4.2, batter: 0.9, parapet: 0.6, toe: 0.4, plinth: 0.7 }

/** The outer face's inset at height v (m, negative: inward). */
const face = (v: number): number => (-RAMPART.batter * v) / RAMPART.top
const R = RAMPART
const PARAPET_IN = face(R.walk) - R.parapet

/** The section from the inner foot, up the inner face, across the walk, over the parapet's sill and down the outer face. */
const SECTION: Vec2[] = [
  [-R.thick, -0.25], [-R.thick, R.walk - 0.05], [-R.thick + 0.05, R.walk],
  [PARAPET_IN, R.walk], [PARAPET_IN, R.sill - 0.04], [PARAPET_IN + 0.04, R.sill],
  [face(R.sill) - 0.04, R.sill], [face(R.sill - 0.04), R.sill - 0.04],
  [face(R.plinth), R.plinth], [R.toe, R.plinth - 0.16], [R.toe, -0.25],
]
/** The section's inside (for each edge's outward direction). */
const SECTION_CORE: Vec2 = [-R.thick / 2, R.walk / 2]

/** Merlon length and embrasure width along the parapet (m); merlons stay this far from a run's corners. */
const MERLON = 2.8
const EMBRASURE = 0.9
const CORNER_KEEP = 1.4
/** Pour length (m), counterfort and lamp spacing, and how far from a run's ends (inside the gatehouses, beside the stairs) they keep. */
const POUR = 7.5
const COUNTERFORT = 9
const LAMP = 27
const END_KEEP = 19

interface Station { p: Xz; m: Xz }

export function rampart(w: MeshWriter, run: RampartRun, seed: number): void {
  const pts = run.points
  const nseg = pts.length - 1
  const tan: Xz[] = [], nrm: Xz[] = [], lens: number[] = []
  for (let i = 0; i < nseg; i++) {
    const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1]
    const l = Math.hypot(dx, dz)
    tan.push([dx / l, dz / l])
    nrm.push([dz / l, -dx / l])
    lens.push(l)
  }
  // the offset per metre of u at each vertex: the mitre between the segments meeting there
  const mitre = (i: number): Xz => {
    if (i === 0) return nrm[0]
    if (i === nseg) return nrm[nseg - 1]
    const a = nrm[i - 1], b = nrm[i]
    const k = 1 + a[0] * b[0] + a[1] * b[1]
    return [(a[0] + b[0]) / k, (a[1] + b[1]) / k]
  }
  const at = (s: Station, u: number, v: number): Vec3 => [s.p[0] + s.m[0] * u, v, s.p[1] + s.m[1] * u]
  w.place(new Matrix4())
  let travelled = 0
  const total = lens.reduce((a, b) => a + b, 0)
  for (let i = 0; i < nseg; i++) {
    const t = tan[i], n = nrm[i], L = lens[i]
    const pours = Math.max(1, Math.ceil(L / POUR))
    for (let j = 0; j < pours; j++) {
      const s0 = (j / pours) * L, s1 = ((j + 1) / pours) * L
      const A: Station = { p: [pts[i][0] + t[0] * s0, pts[i][1] + t[1] * s0], m: j === 0 ? mitre(i) : n }
      const B: Station = { p: [pts[i][0] + t[0] * s1, pts[i][1] + t[1] * s1], m: j === pours - 1 ? mitre(i + 1) : n }
      w.shade(hash(seed + i * 7.13 + j * 3.31))
      for (let k = 0; k < SECTION.length - 1; k++) {
        const [u0, v0] = SECTION[k], [u1, v1] = SECTION[k + 1]
        // this edge's outward direction in the section, into the world
        let eu = v1 - v0, ev = -(u1 - u0)
        const mu = (u0 + u1) / 2 - SECTION_CORE[0], mv = (v0 + v1) / 2 - SECTION_CORE[1]
        if (eu * mu + ev * mv < 0) { eu = -eu; ev = -ev }
        w.polyFacing('concrete', [at(A, u0, v0), at(A, u1, v1), at(B, u1, v1), at(B, u0, v0)], [n[0] * eu, ev, n[1] * eu])
      }
    }
    w.shade(0.5)
    // merlons along the straight stretch, clear of its corners
    const usable = L - 2 * CORNER_KEEP
    const count = Math.floor((usable + EMBRASURE) / (MERLON + EMBRASURE))
    if (count > 0) {
      const span = count * MERLON + (count - 1) * EMBRASURE
      for (let k = 0; k < count; k++) {
        const s0 = CORNER_KEEP + (usable - span) / 2 + k * (MERLON + EMBRASURE)
        merlon(w, pts[i], t, n, s0, s0 + MERLON)
      }
    }
    // railing posts along the walk's inner edge
    const posts = Math.max(1, Math.round(L / 2.4))
    for (let k = 0; k <= posts; k++) {
      const s = (k / posts) * L
      const m = k === 0 ? mitre(i) : k === posts ? mitre(i + 1) : n
      const u = -R.thick + 0.1
      const p: Vec3 = [pts[i][0] + t[0] * s + m[0] * u, R.walk, pts[i][1] + t[1] * s + m[1] * u]
      strut(w, 'galvanized', p, [p[0], R.walk + 1.05, p[2]], 0.028, 6)
    }
    for (const y of [R.walk + 0.55, R.walk + 1.05]) {
      const u = -R.thick + 0.1
      const a = mitre(i), b = mitre(i + 1)
      strut(w, 'galvanized', [pts[i][0] + a[0] * u, y, pts[i][1] + a[1] * u], [pts[i + 1][0] + b[0] * u, y, pts[i + 1][1] + b[1] * u], 0.024, 6)
    }
    // counterforts and lamps on the inner face, drainage spouts through the parapet
    for (let s = COUNTERFORT / 2; s < L - 2; s += COUNTERFORT) {
      const along = travelled + s
      if (s < 2.5 || along < END_KEEP || along > total - END_KEEP) continue
      counterfort(w, pts[i], t, n, s)
    }
    for (let s = LAMP / 2; s < L - 3; s += LAMP) {
      const along = travelled + s
      if (along < END_KEEP || along > total - END_KEEP) continue
      lamp(w, frame(pts[i], t, n, s))
    }
    for (let s = 6; s < L - 3; s += 12) spout(w, frame(pts[i], t, n, s))
    w.place(new Matrix4())
    travelled += L
  }
}

/** A frame on the foot line at distance s along a stretch: x along it, y up, z inward (right-handed). */
function frame(p: Xz, t: Xz, n: Xz, s: number): Matrix4 {
  return new Matrix4().makeBasis(new Vector3(t[0], 0, t[1]), new Vector3(0, 1, 0), new Vector3(-n[0], 0, -n[1])).setPosition(p[0] + t[0] * s, 0, p[1] + t[1] * s)
}

/** A merlon on the parapet's sill between s0 and s1: its outer face continues the battered face; chamfered crest. */
function merlon(w: MeshWriter, p: Xz, t: Xz, n: Xz, s0: number, s1: number): void {
  const sec: Vec2[] = [
    [PARAPET_IN, R.sill], [face(R.sill), R.sill], [face(R.top - 0.05), R.top - 0.05],
    [face(R.top) - 0.05, R.top], [PARAPET_IN + 0.05, R.top], [PARAPET_IN, R.top - 0.05],
  ]
  const P = (s: number, u: number, v: number): Vec3 => [p[0] + t[0] * s + n[0] * u, v, p[1] + t[1] * s + n[1] * u]
  const core: Vec2 = [(PARAPET_IN + face(R.sill)) / 2, (R.sill + R.top) / 2]
  for (let k = 0; k < sec.length; k++) {
    const [u0, v0] = sec[k], [u1, v1] = sec[(k + 1) % sec.length]
    // the underside sits on the sill: not drawn
    if (k === 0) continue
    let eu = v1 - v0, ev = -(u1 - u0)
    if (eu * ((u0 + u1) / 2 - core[0]) + ev * ((v0 + v1) / 2 - core[1]) < 0) { eu = -eu; ev = -ev }
    w.polyFacing('concrete', [P(s0, u0, v0), P(s0, u1, v1), P(s1, u1, v1), P(s1, u0, v0)], [n[0] * eu, ev, n[1] * eu])
  }
  w.polyFacing('concrete', sec.map(([u, v]) => P(s0, u, v)), [-t[0], 0, -t[1]])
  w.polyFacing('concrete', sec.map(([u, v]) => P(s1, u, v)), [t[0], 0, t[1]])
}

/** A counterfort against the inner face at s: a buttress with a sloping face, 0.9 m wide. */
function counterfort(w: MeshWriter, p: Xz, t: Xz, n: Xz, s: number): void {
  const sec: Vec2[] = [[-R.thick + 0.02, -0.2], [-R.thick - 0.8, -0.2], [-R.thick - 0.26, R.walk - 0.9], [-R.thick + 0.02, R.walk - 0.6]]
  const P = (a: number, u: number, v: number): Vec3 => [p[0] + t[0] * a + n[0] * u, v, p[1] + t[1] * a + n[1] * u]
  const a0 = s - 0.45, a1 = s + 0.45
  w.shade(0.62)
  // the sloping face and the weathered top
  for (const [k0, k1, up] of [[1, 2, 0.45], [2, 3, 1]] as Array<[number, number, number]>) {
    const [u0, v0] = sec[k0], [u1, v1] = sec[k1]
    w.polyFacing('concrete', [P(a0, u0, v0), P(a0, u1, v1), P(a1, u1, v1), P(a1, u0, v0)], [-n[0], up, -n[1]])
  }
  w.polyFacing('concrete', sec.map(([u, v]) => P(a0, u, v)), [-t[0], 0, -t[1]])
  w.polyFacing('concrete', sec.map(([u, v]) => P(a1, u, v)), [t[0], 0, t[1]])
  w.shade(0.5)
}

/** A floodlight on the inner face under the walk, aimed down into the court. Frame: foot line, z inward. */
function lamp(w: MeshWriter, F: Matrix4): void {
  const z = R.thick
  w.place(F)
  chamferBox(w, 'darkSteel', [-0.16, 4.5, z - 0.02], [0.16, 4.95, z + 0.06], 0.01)
  strut(w, 'darkSteel', [0, 4.72, z + 0.05], [0, 4.85, z + 0.6], 0.03, 6, F)
  const H = F.clone().multiply(new Matrix4().makeTranslation(0, 4.8, z + 0.72)).multiply(new Matrix4().makeRotationX(0.6))
  w.place(H)
  chamferBox(w, 'darkSteel', [-0.28, -0.1, -0.18], [0.28, 0.08, 0.18], 0.02)
  chamferBox(w, 'lamp', [-0.23, -0.12, -0.14], [0.23, -0.1, 0.14], 0.005)
  w.place(new Matrix4())
}

/** A steel spout draining the walk out through the parapet's foot. Frame: foot line, z inward. */
function spout(w: MeshWriter, F: Matrix4): void {
  const u = face(R.walk)
  w.place(F)
  chamferBox(w, 'darkSteel', [-0.09, R.walk - 0.12, -u - 0.4], [0.09, R.walk + 0.02, -u + 0.05], 0.012)
  w.place(new Matrix4())
}

/**
 * A straight concrete stair up the rampart's inner face to the walk: a solid
 * stepped flight (0.18 m rises on a 0.3 m going) ending in a landing level
 * with the walk, a galvanized handrail on its open side. Frame: rising
 * toward +x, the wall on +z (variant 1: on -z); `m.size` = length, height
 * (the walk), width.
 */
export function rampStair(w: MeshWriter, M: Matrix4, m: Module): void {
  const [L, H, W] = m.size
  const wall = m.variant === 1 ? -1 : 1
  const n = Math.ceil(H / 0.18)
  const rise = H / n, going = 0.3
  const x0 = -L / 2
  const z0 = -W / 2, z1 = W / 2
  const xLand = x0 + n * going
  /** the open side */
  const zo = -wall * W / 2
  w.place(M)
  w.shade(0.45)
  // treads, risers and both stepped sides; the landing and its end face
  for (let i = 0; i < n; i++) {
    const a = x0 + i * going, b = a + going, y = (i + 1) * rise, yb = i * rise
    w.polyFacing('concrete', [[a, y, z0], [b, y, z0], [b, y, z1], [a, y, z1]], [0, 1, 0])
    w.polyFacing('concrete', [[a, yb, z0], [a, y, z0], [a, y, z1], [a, yb, z1]], [-1, 0, 0])
    // the side against the wall is hidden
    w.polyFacing('concrete', [[a, -0.2, zo], [b, -0.2, zo], [b, y, zo], [a, y, zo]], [0, 0, Math.sign(zo)])
  }
  w.polyFacing('concrete', [[xLand, H, z0], [L / 2, H, z0], [L / 2, H, z1], [xLand, H, z1]], [0, 1, 0])
  w.polyFacing('concrete', [[xLand, -0.2, zo], [L / 2, -0.2, zo], [L / 2, H, zo], [xLand, H, zo]], [0, 0, Math.sign(zo)])
  w.polyFacing('concrete', [[L / 2, -0.2, z0], [L / 2, H, z0], [L / 2, H, z1], [L / 2, -0.2, z1]], [1, 0, 0])
  w.shade(0.5)
  // handrail on the open side: posts every third step, a rail along the pitch and across the landing
  const zr = -wall * (W / 2 - 0.08)
  for (let i = 1; i < n; i += 3) {
    const x = x0 + (i + 0.5) * going, y = (i + 1) * rise
    strut(w, 'galvanized', [x, y, zr], [x, y + 1.0, zr], 0.026, 6, M)
  }
  strut(w, 'galvanized', [x0 + 1.5 * going, 2 * rise + 1.0, zr], [xLand, H + 1.0, zr], 0.022, 6, M)
  strut(w, 'galvanized', [xLand, H + 1.0, zr], [L / 2 - 0.05, H + 1.0, zr], 0.022, 6, M)
  strut(w, 'galvanized', [L / 2 - 0.1, H, zr], [L / 2 - 0.1, H + 1.0, zr], 0.026, 6, M)
  w.place(M)
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}
