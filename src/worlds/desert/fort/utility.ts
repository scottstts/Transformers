import { Matrix4 } from 'three/webgpu'
import { MeshWriter, chamferBox, cylinderY, prismY, revolveY, rect, strut, tube, type Vec2, type Vec3 } from './mesh'
import type { Cable, Module } from './plan'

const T = (x: number, y: number, z: number): Matrix4 => new Matrix4().makeTranslation(x, y, z)

/**
 * An elevated water tower: four splayed tubular legs on footings, braced in
 * three bays, a ring-beam under a welded tank with a conical roof and vent, a
 * railed catwalk round it, a caged ladder and the riser pipe down to a valve
 * pit. Frame: base centre.
 */
export function waterTower(w: MeshWriter, M: Matrix4, m: Module): void {
  const [W, H] = m.size
  const deck = H - 5.2
  const foot = W * 0.4, top = 1.6
  const legs: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
  const at = (sx: number, sz: number, y: number): Vec3 => {
    const h = foot + (top - foot) * (y / deck)
    return [sx * h, y, sz * h]
  }
  w.place(M)
  for (const [sx, sz] of legs) {
    const [x, , z] = at(sx, sz, 0)
    chamferBox(w, 'concrete', [x - 0.5, -0.2, z - 0.5], [x + 0.5, 0.3, z + 0.5], 0.04)
    strut(w, 'steel', at(sx, sz, 0.3), at(sx, sz, deck), 0.12, 10, M)
    w.place(M)
  }
  const bays = [0.4, deck * 0.36, deck * 0.7, deck - 0.1]
  for (let f = 0; f < 4; f++) {
    const [ax, az] = legs[f], [bx, bz] = legs[(f + 1) % 4]
    for (let b = 0; b < bays.length - 1; b++) {
      strut(w, 'steel', at(ax, az, bays[b]), at(bx, bz, bays[b + 1]), 0.04, 5, M)
      strut(w, 'steel', at(bx, bz, bays[b]), at(ax, az, bays[b + 1]), 0.04, 5, M)
      strut(w, 'steel', at(ax, az, bays[b + 1]), at(bx, bz, bays[b + 1]), 0.055, 6, M)
    }
  }
  w.place(M)
  // ring beam and the catwalk grating with its railing
  chamferBox(w, 'darkSteel', [-2.1, deck, -2.1], [2.1, deck + 0.3, 2.1], 0.03)
  prismY(w, 'darkSteel', rect(5.2, 5.2), deck + 0.3, deck + 0.38, 0.02)
  for (const [sx, sz] of legs) strut(w, 'steel', [sx * 2.55, deck + 0.38, sz * 2.55], [sx * 2.55, deck + 1.45, sz * 2.55], 0.03, 6, M)
  for (let f = 0; f < 4; f++) {
    const [ax, az] = legs[f], [bx, bz] = legs[(f + 1) % 4]
    for (const y of [deck + 0.9, deck + 1.45]) strut(w, 'steel', [ax * 2.55, y, az * 2.55], [bx * 2.55, y, bz * 2.55], 0.022, 5, M)
  }
  w.place(M)
  // the tank: shell, roof cone, vent
  const r = 2.1, y0 = deck + 0.38
  w.shade(0.75)
  revolveY(w, 'steel', [[r - 0.05, y0], [r, y0 + 0.05], [r, y0 + 1.4], [r + 0.02, y0 + 1.45], [r, y0 + 1.5], [r, y0 + 3.2], [r + 0.08, y0 + 3.28], [0.35, y0 + 4.05]],
    [[0.4, -1], [1, 0], [1, 0], [1, 0.5], [1, 0], [1, 0.1], [0.8, 1], [0.35, 1]], 24)
  w.shade(0.5)
  cylinderY(w, 'darkSteel', 0.35, y0 + 3.95, y0 + 4.3, 12, 0.03)
  prismY(w, 'darkSteel', rect(0.9, 0.9), y0 + 4.3, y0 + 4.4, 0.03)
  // ladder up a leg to the catwalk, and the riser to a valve pit
  const [lx, , lz] = at(1, 1, 0)
  for (const s of [-0.25, 0.25]) strut(w, 'darkSteel', [lx + 0.6 + s, 0.3, lz + 0.6], [2.2 + s, deck + 1.3, 2.9], 0.03, 5, M)
  for (let i = 1; i < 26; i++) {
    const t = i / 26
    const px = lx + 0.6 + (2.2 - lx - 0.6) * t, py = 0.3 + (deck + 1.0) * t, pz = lz + 0.6 + (2.9 - lz - 0.6) * t
    strut(w, 'darkSteel', [px - 0.25, py, pz], [px + 0.25, py, pz], 0.015, 4, M)
  }
  strut(w, 'galvanized', [0, deck, 0], [0, 0.4, 0], 0.14, 10, M)
  w.place(M)
  chamferBox(w, 'concrete', [-0.6, -0.1, -0.6], [0.6, 0.4, 0.6], 0.04)
}

/**
 * A guyed lattice radio mast: a triangular section of three tubular legs
 * with zig-zag bracing on every face, climbing to a platform with dipole
 * arrays, a microwave dish and a red obstruction light; guyed at two levels
 * to three anchor blocks. Frame: base centre; `m.size[1]` its height.
 */
export function radioMast(w: MeshWriter, M: Matrix4, m: Module): void {
  const H = m.size[1]
  const rr = 0.55
  const leg = (k: number): [number, number] => [Math.sin((k * 2 * Math.PI) / 3) * rr, Math.cos((k * 2 * Math.PI) / 3) * rr]
  w.place(M)
  chamferBox(w, 'concrete', [-1.1, -0.2, -1.1], [1.1, 0.5, 1.1], 0.05)
  for (let k = 0; k < 3; k++) {
    const [x, z] = leg(k)
    strut(w, 'galvanized', [x, 0.5, z], [x, H, z], 0.045, 6, M)
  }
  const bay = 1.4
  for (let y = 0.5, i = 0; y + bay <= H; y += bay, i++) {
    for (let k = 0; k < 3; k++) {
      const [ax, az] = leg(k), [bx, bz] = leg((k + 1) % 3)
      strut(w, 'galvanized', i % 2 ? [ax, y, az] : [bx, y, bz], i % 2 ? [bx, y + bay, bz] : [ax, y + bay, az], 0.016, 4, M)
      strut(w, 'galvanized', [ax, y + bay, az], [bx, y + bay, bz], 0.014, 4, M)
    }
  }
  w.place(M)
  // top platform, antennas, dish, obstruction light
  prismY(w, 'darkSteel', [[0, 1.0], [0.87, -0.5], [-0.87, -0.5]], H - 0.1, H, 0.02)
  for (let k = 0; k < 3; k++) {
    const [x, z] = leg(k)
    strut(w, 'darkSteel', [x * 1.4, H - 2.4, z * 1.4], [x * 1.4, H + 2.2, z * 1.4], 0.03, 6, M)
    for (const y of [H - 1.8, H - 0.8, H + 0.8]) strut(w, 'darkSteel', [x * 1.4 - z * 0.35, y, z * 1.4 + x * 0.35], [x * 1.4 + z * 0.35, y, z * 1.4 - x * 0.35], 0.012, 4, M)
    strut(w, 'darkSteel', [x, H - 2.2, z], [x * 1.4, H - 2.2, z * 1.4], 0.02, 4, M)
  }
  w.place(M.clone().multiply(T(0, H * 0.7, rr * 0.9)).multiply(new Matrix4().makeRotationX(Math.PI / 2)))
  revolveY(w, 'galvanized', [[0.01, 0.25], [0.35, 0.18], [0.6, 0.02], [0.62, 0]], [[0, 1], [0.3, 1], [0.6, 1], [1, 0]], 18)
  cylinderY(w, 'darkSteel', 0.62, -0.3, 0, 18, 0.03, [true, false])
  w.place(M)
  cylinderY(w, 'darkSteel', 0.05, H, H + 2.6, 6, 0)
  w.place(M.clone().multiply(T(0, H + 2.6, 0)))
  cylinderY(w, 'beacon', 0.12, 0, 0.22, 10, 0.03)
  w.place(M)
  // guys to three anchors
  for (let k = 0; k < 3; k++) {
    const a = (k * 2 * Math.PI) / 3 + Math.PI / 3
    const ax = Math.sin(a) * 7.5, az = Math.cos(a) * 7.5
    chamferBox(w, 'concrete', [ax - 0.5, -0.2, az - 0.5], [ax + 0.5, 0.35, az + 0.5], 0.04)
    for (const y of [H * 0.45, H * 0.85]) strut(w, 'darkSteel', [ax, 0.35, az], [Math.sin(a) * rr, y, Math.cos(a) * rr], 0.012, 4, M)
    w.place(M)
  }
}

/**
 * A timber power pole: a tapered, treated pole, a crossarm with three pin
 * insulators, a pole-top transformer on some, a street lamp arm facing the
 * lane. Frame: base centre, the crossarm along x.
 */
export function pole(w: MeshWriter, M: Matrix4, m: Module): void {
  const H = m.size[1]
  w.place(M)
  revolveY(w, 'wood', [[0.16, -0.3], [0.15, H * 0.5], [0.12, H], [0.08, H + 0.08]], [[1, 0.01], [1, 0.01], [1, 0.01], [0.5, 1]], 10)
  chamferBox(w, 'wood', [-1.2, H - 0.5, -0.07], [1.2, H - 0.36, 0.07], 0.012)
  for (const x of [-0.9, 0, 0.9]) {
    w.place(M.clone().multiply(T(x, 0, 0)))
    cylinderY(w, 'darkSteel', 0.015, H - 0.36, H - 0.24, 5, 0)
    revolveY(w, 'poly', [[0.06, H - 0.26], [0.07, H - 0.2], [0.045, H - 0.12], [0.035, H - 0.06]], [[0.5, -1], [1, 0.3], [1, 0.4], [0.3, 1]], 8)
  }
  w.place(M)
  strut(w, 'darkSteel', [0, H - 0.9, 0], [-0.8, H - 0.43, 0], 0.02, 4, M)
  strut(w, 'darkSteel', [0, H - 0.9, 0], [0.8, H - 0.43, 0], 0.02, 4, M)
  if (m.variant % 2 === 1) {
    w.place(M.clone().multiply(T(0, 0, -0.45)))
    cylinderY(w, 'galvanized', 0.32, H - 3.1, H - 2.0, 14, 0.04)
    w.place(M)
  }
  // lamp arm out over the lane (+z)
  strut(w, 'darkSteel', [0, H - 1.6, 0.12], [0, H - 1.25, 1.6], 0.035, 6, M)
  w.place(M.clone().multiply(T(0, H - 1.28, 1.7)))
  chamferBox(w, 'darkSteel', [-0.18, -0.08, -0.3], [0.18, 0.05, 0.3], 0.03)
  chamferBox(w, 'glass', [-0.14, -0.1, -0.24], [0.14, -0.08, 0.24], 0.01)
  w.place(M)
}

/** Cables sagging between poles: a catenary-like parabola from `a` to `b` dipping `sag` m mid-span. */
export function cables(w: MeshWriter, list: readonly Cable[]): void {
  w.place(new Matrix4())
  for (const c of list) {
    const pts: Vec3[] = []
    const n = 10
    for (let i = 0; i <= n; i++) {
      const t = i / n
      pts.push([c.a[0] + (c.b[0] - c.a[0]) * t, c.a[1] + (c.b[1] - c.a[1]) * t - 4 * c.sag * t * (1 - t), c.a[2] + (c.b[2] - c.a[2]) * t])
    }
    tube(w, 'rubber', pts, 0.014, 4)
  }
}

/**
 * A helipad: a raised octagonal concrete pad with a chamfered edge, a painted
 * touchdown ring and an H, and flush edge lights round the rim. The paint is
 * a separate slot biased toward the camera (materials.ts), a few millimetres
 * above the pad. Frame: centred, the H across x.
 */
export function helipad(w: MeshWriter, M: Matrix4, m: Module): void {
  const r = m.size[0] / 2
  const oct: Vec2[] = Array.from({ length: 8 }, (_, k) => {
    const a = Math.PI / 8 + (k * Math.PI) / 4
    return [Math.cos(a) * r, Math.sin(a) * r]
  })
  w.place(M)
  prismY(w, 'concrete', oct, -0.2, 0.2, 0.06)
  const y = 0.203
  // touchdown ring
  const ring = (r0: number, r1: number): void => {
    const n = 40
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2
      w.poly('paint', [[Math.cos(a0) * r1, y, -Math.sin(a0) * r1], [Math.cos(a1) * r1, y, -Math.sin(a1) * r1], [Math.cos(a1) * r0, y, -Math.sin(a1) * r0], [Math.cos(a0) * r0, y, -Math.sin(a0) * r0]])
    }
  }
  ring(r * 0.62, r * 0.68)
  // the H: two uprights and a bar
  const quad = (x0: number, z0: number, x1: number, z1: number): void => w.poly('paint', [[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]])
  quad(-2.2, -3, -1.4, 3)
  quad(1.4, -3, 2.2, 3)
  quad(-1.4, -0.4, 1.4, 0.4)
  // rim lights
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4
    const px = Math.cos(a) * (r - 0.5), pz = Math.sin(a) * (r - 0.5)
    w.place(M.clone().multiply(T(px, 0.2, pz)))
    cylinderY(w, 'darkSteel', 0.14, 0, 0.06, 10, 0.02)
    cylinderY(w, 'glass', 0.09, 0.06, 0.1, 10, 0.02)
  }
  w.place(M)
}

/**
 * A fuel bund: a concrete floor falling to a sump, ringed by a low
 * retaining wall, a steel stile over it, the tanks' outlet manifold running
 * along the front to a pump skid. Frame: the pump faces +z.
 */
export function bund(w: MeshWriter, M: Matrix4, m: Module): void {
  const [W, H, D] = m.size
  const x = W / 2, z = D / 2, t = 0.3
  w.place(M)
  chamferBox(w, 'concrete', [-x, -0.1, -z], [x, 0.12, z], 0.03)
  chamferBox(w, 'concrete', [-x, 0.12, z - t], [x, H, z], 0.04)
  chamferBox(w, 'concrete', [-x, 0.12, -z], [x, H, -z + t], 0.04)
  chamferBox(w, 'concrete', [-x, 0.12, -z + t], [-x + t, H, z - t], 0.04)
  chamferBox(w, 'concrete', [x - t, 0.12, -z + t], [x, H, z - t], 0.04)
  // stile: three treads up to the wall's top on either side of the front wall
  for (let i = 1; i <= 3; i++) {
    const d = (3 - i) * 0.26 + 0.02
    chamferBox(w, 'darkSteel', [x - 2.2, i * 0.3 - 0.04, z + d], [x - 1.4, i * 0.3, z + d + 0.26], 0.008)
    chamferBox(w, 'darkSteel', [x - 2.2, i * 0.3 - 0.04, z - t - d - 0.26], [x - 1.4, i * 0.3, z - t - d], 0.008)
  }
  // manifold along the front inside the wall, out through it to the pump skid
  strut(w, 'darkSteel', [-6.2, 0.55, z - 1.2], [6.2, 0.55, z - 1.2], 0.08, 10, M)
  for (const tx of [-6.2, 0, 6.2]) strut(w, 'darkSteel', [tx, 1.3, z - 2.4], [tx, 0.55, z - 1.2], 0.06, 8, M)
  strut(w, 'darkSteel', [2, 0.55, z - 1.2], [2, 0.55, z + 1.6], 0.08, 10, M)
  w.place(M)
  chamferBox(w, 'darkSteel', [1.2, 0, z + 1.4], [3.2, 0.14, z + 2.6], 0.02)
  chamferBox(w, 'steel', [1.4, 0.14, z + 1.6], [2.6, 0.9, z + 2.4], 0.04)
  w.place(M.clone().multiply(T(2.85, 0, z + 2.0)))
  cylinderY(w, 'steel', 0.2, 0.14, 0.75, 12, 0.03)
  w.place(M)
}
