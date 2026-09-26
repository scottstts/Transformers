import { Matrix4 } from 'three/webgpu'
import { MeshWriter, chamferBox, cylinderY, revolveY, strut, type Vec3 } from './mesh'
import { GARAGE_DOOR } from './layout'
import { bollard } from './keep'
import { PAVING_TOP } from './paving'
import type { Module } from './plan'

/**
 * A three-bay maintenance garage, the districts' spawn doors: a steel
 * portal frame on a precast concrete dado, clad in corrugated sheet above
 * it, under a shallow pitched roof of corrugated galvanized steel with its
 * ridge cap, gutters and downpipes. The bays' roll-up doors are open or down
 * by `m.variant` (a bit per bay, from -x); an open bay shows the dark hall
 * inside with its strip lights. Door frames, drum housings, lamps over the
 * doors, yellow bollards at the jambs, turbine vents on the ridge and a
 * personnel door in the gable complete it.
 *
 * Frame: the doors face +z, the ridge along x; base centre.
 */
export const GARAGE = { width: 26, depth: 14, eave: 6.6, ridge: 7.9 }

const T = (x: number, y: number, z: number): Matrix4 => new Matrix4().makeTranslation(x, y, z)
const Ry = (a: number): Matrix4 => new Matrix4().makeRotationY(a)

const DADO = 1.2
const DOOR_H = 5.4
const BAYS = 3
/** Cladding flute pitch and depth (m): read as corrugation through the tilted normals (as the hangar's skin). */
const PITCH = 0.2
const DEPTH = 0.03

/** The x of each open bay's centre (garage frame). */
export function garageBays(open: number): number[] {
  const out: number[] = []
  for (let i = 0; i < BAYS; i++) if (open & (1 << i)) out.push(-GARAGE.width / 2 + (i + 0.5) * (GARAGE.width / BAYS))
  return out
}

/**
 * Corrugated sheet in the x-y plane facing +z (frame F), from x0 to x1,
 * between y0 and top(x): rows every half pitch, their normals tilted
 * alternately along x.
 */
function corrugated(w: MeshWriter, slot: string, F: Matrix4, x0: number, x1: number, y0: number, top: (x: number) => number): void {
  const n = Math.max(1, Math.round((x1 - x0) / (PITCH / 2)))
  const tilt = (0.6 * Math.PI * DEPTH) / PITCH
  const rows: Vec3[][] = [], normals: Vec3[][] = []
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n
    const k = i % 2 ? tilt : -tilt
    rows.push([[x, top(x), 0], [x, y0, 0]])
    normals.push([[k, 0, 1], [k, 0, 1]])
  }
  w.place(F)
  w.grid(slot, rows, normals)
}

export function garage(w: MeshWriter, M: Matrix4, m: Module): void {
  const { width: W, depth: D, eave: E, ridge: Rg } = GARAGE
  const x = W / 2, z = D / 2
  const bay = W / BAYS
  const hd = GARAGE_DOOR / 2
  const doors = Array.from({ length: BAYS }, (_, i) => ({ c: -x + (i + 0.5) * bay, open: (m.variant & (1 << i)) !== 0 }))
  const roofY = (zz: number): number => E + (Rg - E) * (1 - Math.abs(zz) / z)
  w.place(M)
  // floor slab and the dado: precast panels round the walls, broken at the doors
  chamferBox(w, 'pavement', [-x + 0.26, -0.12, -z + 0.26], [x - 0.26, PAVING_TOP, z - 0.26], 0.01)
  chamferBox(w, 'concrete', [-x, -0.15, -z], [x, DADO, -z + 0.25], 0.03)
  for (const sx of [-1, 1]) chamferBox(w, 'concrete', [sx > 0 ? x - 0.25 : -x, -0.15, -z + 0.26], [sx > 0 ? x : -x + 0.25, DADO, z - 0.26], 0.03)
  let from = -x
  for (const d of doors) {
    chamferBox(w, 'concrete', [from, -0.15, z - 0.25], [d.c - hd - 0.22, DADO, z], 0.03)
    from = d.c + hd + 0.22
  }
  chamferBox(w, 'concrete', [from, -0.15, z - 0.25], [x, DADO, z], 0.03)
  // cladding: the back and the front between the doors and over them, the gables up to the roof
  const back = M.clone().multiply(Ry(Math.PI)).multiply(T(0, 0, z - 0.02))
  w.shade(0.35)
  corrugated(w, 'prefab', back, -x + 0.05, x - 0.05, DADO, () => E)
  const front = M.clone().multiply(T(0, 0, z - 0.02))
  from = -x + 0.05
  for (const d of doors) {
    corrugated(w, 'prefab', front, from, d.c - hd - 0.22, DADO, () => DOOR_H + 0.95)
    from = d.c + hd + 0.22
  }
  corrugated(w, 'prefab', front, from, x - 0.05, DADO, () => DOOR_H + 0.95)
  corrugated(w, 'prefab', front, -x + 0.05, x - 0.05, DOOR_H + 0.95, () => E)
  for (const s of [-1, 1]) {
    const G = M.clone().multiply(Ry((s * Math.PI) / 2)).multiply(T(0, 0, x - 0.02))
    // in the gable's frame x runs along -s z of the garage
    corrugated(w, 'prefab', G, -z + 0.05, z - 0.05, DADO, (u) => roofY(u) - 0.08)
  }
  w.shade(0.5)
  w.place(M)
  // the portal frame's columns, proud of the cladding, at the corners and between the bays
  for (let i = 0; i <= BAYS; i++) {
    const cx = Math.max(-x + 0.17, Math.min(x - 0.17, -x + i * bay))
    chamferBox(w, 'steel', [cx - 0.17, 0, z - 0.2], [cx + 0.17, E - 0.05, z + 0.12], 0.02)
    chamferBox(w, 'steel', [cx - 0.17, 0, -z - 0.12], [cx + 0.17, E - 0.05, -z + 0.2], 0.02)
  }
  // the doors: frames, drum housings, lamps; a closed door's slats; an open bay's hall behind
  for (const d of doors) {
    const a = d.c - hd, b = d.c + hd
    chamferBox(w, 'darkSteel', [a - 0.22, 0, z - 0.3], [a, DOOR_H + 0.2, z + 0.14], 0.015)
    chamferBox(w, 'darkSteel', [b, 0, z - 0.3], [b + 0.22, DOOR_H + 0.2, z + 0.14], 0.015)
    chamferBox(w, 'darkSteel', [a - 0.22, DOOR_H, z - 0.3], [b + 0.22, DOOR_H + 0.2, z + 0.14], 0.015)
    chamferBox(w, 'steel', [a - 0.3, DOOR_H + 0.2, z - 0.05], [b + 0.3, DOOR_H + 1.0, z + 0.62], 0.04)
    w.place(M.clone().multiply(T(d.c, DOOR_H + 1.12, z + 0.2)))
    chamferBox(w, 'darkSteel', [-0.22, -0.08, -0.05], [0.22, 0.08, 0.3], 0.02)
    chamferBox(w, 'lamp', [-0.18, -0.1, 0.0], [0.18, -0.08, 0.26], 0.005)
    w.place(M)
    for (const bx of [a - 0.55, b + 0.55]) bollard(w, M.clone().multiply(T(bx, 0, z + 0.7)))
    w.place(M)
    if (!d.open) {
      // horizontal slats: a corrugated curtain in the opening, a bottom bar
      const S = M.clone().multiply(T(0, 0, z - 0.2)).multiply(new Matrix4().makeRotationZ(Math.PI / 2))
      w.shade(0.6)
      corrugated(w, 'galvanized', S, 0.05, DOOR_H, -b, () => -a)
      w.shade(0.5)
      w.place(M)
      chamferBox(w, 'darkSteel', [a, 0.02, z - 0.26], [b, 0.12, z - 0.14], 0.01)
      continue
    }
    // the hall seen through the opening
    const z0 = -z + 0.3, z1 = z - 0.3, h = E - 0.35
    const l = Math.max(-x + 0.3, d.c - bay / 2 + 0.02), r = Math.min(x - 0.3, d.c + bay / 2 - 0.02)
    w.poly('interior', [[l, 0.04, z0], [l, h, z0], [r, h, z0], [r, 0.04, z0]])
    w.poly('interior', [[l, h, z0], [l, h, z1], [r, h, z1], [r, h, z0]])
    for (const px of [l, r]) w.poly('interior', [[px, 0.04, z0], [px, 0.04, z1], [px, h, z1], [px, h, z0]])
    chamferBox(w, 'lamp', [d.c - 0.08, h - 0.06, z0 + 1], [d.c + 0.08, h, z1 - 1], 0.01)
    chamferBox(w, 'darkSteel', [l + 0.4, 0, z0], [l + 2.4, 0.95, z0 + 0.8], 0.03)
  }
  // the roof: two corrugated slopes over the eaves and gables, a ridge cap, gutters and downpipes
  const ov = 0.45
  const fall = (Rg - E) / z
  for (const s of [-1, 1]) {
    const n = Math.round((W + 2 * ov) / (PITCH / 2))
    const tilt = (0.6 * Math.PI * DEPTH) / PITCH
    const rows: Vec3[][] = [], normals: Vec3[][] = []
    for (let i = 0; i <= n; i++) {
      const rx = -x - ov + ((W + 2 * ov) * i) / n
      const k = i % 2 ? tilt : -tilt
      const eaveZ = s * (z + ov), eaveY = E + 0.12 - fall * ov
      rows.push(s > 0 ? [[rx, Rg + 0.12, 0], [rx, eaveY, eaveZ]] : [[rx, eaveY, eaveZ], [rx, Rg + 0.12, 0]])
      normals.push([[k, 1, s * fall], [k, 1, s * fall]])
    }
    w.grid('galvanized', rows, normals)
    // its underside over the overhangs
    const eaveY = E + 0.1 - fall * ov
    w.polyFacing('galvanized', [[-x - ov, eaveY, s * (z + ov)], [x + ov, eaveY, s * (z + ov)], [x + ov, E + 0.1, s * z], [-x - ov, E + 0.1, s * z]], [0, -1, 0])
    w.place(M.clone().multiply(T(0, eaveY - 0.06, s * (z + ov + 0.06))).multiply(new Matrix4().makeRotationZ(Math.PI / 2)))
    cylinderY(w, 'galvanized', 0.09, -x - ov, x + ov, 10, 0)
    w.place(M)
    for (const sx of [-1, 1]) strut(w, 'galvanized', [sx * (x + 0.1), eaveY - 0.1, s * (z + ov + 0.06)], [sx * (x + 0.1), 0.2, s * (z + 0.12)], 0.05, 8, M)
    w.place(M)
  }
  chamferBox(w, 'darkSteel', [-x - ov, Rg + 0.1, -0.22], [x + ov, Rg + 0.22, 0.22], 0.04)
  // barge boards along the gables' slopes
  for (const sx of [-1, 1]) for (const s of [-1, 1]) {
    strut(w, 'darkSteel', [sx * (x + ov), Rg + 0.1, 0], [sx * (x + ov), E + 0.05 - fall * ov, s * (z + ov)], 0.05, 4, M)
  }
  w.place(M)
  // turbine vents on the ridge
  for (const vx of [-x + bay / 2, 0, x - bay / 2]) {
    w.place(M.clone().multiply(T(vx, Rg + 0.2, 0)))
    cylinderY(w, 'galvanized', 0.16, 0, 0.35, 10, 0.02)
    revolveY(w, 'galvanized', [[0.2, 0.35], [0.34, 0.5], [0.32, 0.72], [0.18, 0.84], [0.02, 0.88]], [[0.4, -1], [1, -0.2], [1, 0.4], [0.5, 1], [0, 1]], 14)
  }
  w.place(M)
  // a personnel door and its hood in the +x gable
  const G = M.clone().multiply(Ry(Math.PI / 2)).multiply(T(0, 0, x))
  w.place(G)
  chamferBox(w, 'darkSteel', [-0.62, 0, -0.1], [0.62, 2.35, 0.08], 0.01)
  chamferBox(w, 'steel', [-0.5, 0.05, 0.08], [0.5, 2.25, 0.12], 0.01)
  chamferBox(w, 'darkSteel', [0.3, 1.05, 0.12], [0.42, 1.12, 0.2], 0.005)
  chamferBox(w, 'darkSteel', [-0.85, 2.55, -0.02], [0.85, 2.65, 0.7], 0.02)
  chamferBox(w, 'concrete', [-0.9, -0.15, 0.02], [0.9, 0.18, 1.2], 0.03)
  w.place(M)
}
