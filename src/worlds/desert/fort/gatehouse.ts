import { Matrix4 } from 'three/webgpu'
import { MeshWriter, chamferBox, cylinderY, prismY, rect, strut } from './mesh'
import { facade, windows, type Opening } from './buildings'
import type { Module } from './plan'
import { RAMPART } from './rampart'

/**
 * A citadel gatehouse: two concrete towers flanking the opening, the
 * rampart's ends buried in them. Each tower stands on a weathered plinth, a
 * solid lower block up to a string course level with the rampart's crest,
 * then a guard storey whose walls are real openings (slits to the field, a
 * window to the court), and a crenellated parapet round its roof with a
 * searchlight. Steel guide channels on the towers' passage faces carry the
 * lift gate. The front gatehouse (variant 1) is bridged: a concrete box
 * girder 9.3 m over the passage, crenellated on its field side, the lift
 * gate's lower edge hanging just under it. The passage is paved through.
 *
 * Frame: origin at the gate's centre on the rampart's foot line, +z
 * outward, x along the wall; `m.size[0]` is the opening.
 */
export const GATEHOUSE = { tower: 10, depth: 11.5, front: 3.4, height: 13.6 }

const T = (x: number, y: number, z: number): Matrix4 => new Matrix4().makeTranslation(x, y, z)
const Ry = (a: number): Matrix4 => new Matrix4().makeRotationY(a)
/** The guard storey: floor, top of its walls; the lift gate's plane (frame z); the bridge's soffit and deck. */
const STOREY = [RAMPART.top + 0.5, GATEHOUSE.height - 1.4] as const
const GATE_Z = -0.9
const SOFFIT = 9.3
const DECK = 10.7

export function gatehouse(w: MeshWriter, M: Matrix4, m: Module): void {
  const W = m.size[0]
  const G = GATEHOUSE
  const bridged = m.variant === 1
  const tz = G.front - G.depth / 2
  for (const s of [-1, 1]) {
    const Tw = M.clone().multiply(T(s * (W / 2 + G.tower / 2), 0, tz))
    tower(w, Tw, s, bridged)
  }
  w.place(M)
  // the passage: paved through, a drainage grate across it under the gate
  const pz0 = G.front - G.depth, pz1 = G.front
  const panels = Math.ceil((pz1 - pz0) / 4)
  for (let i = 0; i < panels; i++) {
    const a = pz0 + (i / panels) * (pz1 - pz0), b = pz0 + ((i + 1) / panels) * (pz1 - pz0)
    for (const [x0, x1] of [[-W / 2, 0], [0, W / 2]]) chamferBox(w, 'pavement', [x0 + 0.004, -0.12, a + 0.004], [x1 - 0.004, 0.03, b - 0.004], 0.012)
  }
  chamferBox(w, 'darkSteel', [-W / 2 + 0.05, 0.025, GATE_Z - 0.25], [W / 2 - 0.05, 0.036, GATE_Z + 0.25], 0.004)
  if (!bridged) return
  // the bridge: a box girder into both towers, edge beams, parapets (crenellated to the field)
  const x0 = -W / 2 - 0.1, x1 = W / 2 + 0.1, z0 = -6.2, z1 = 2.4
  chamferBox(w, 'concrete', [x0, SOFFIT, z0], [x1, DECK, z1], 0.08)
  for (const [a, b] of [[z1 - 0.55, z1], [z0, z0 + 0.55]]) chamferBox(w, 'concrete', [x0, SOFFIT - 0.35, a], [x1, SOFFIT + 0.02, b], 0.05)
  chamferBox(w, 'concrete', [x0, DECK - 0.02, z1 - 0.5], [x1, DECK + 1.2, z1], 0.05)
  chamferBox(w, 'concrete', [x0, DECK - 0.02, z0], [x1, DECK + 1.1, z0 + 0.45], 0.05)
  const n = Math.max(2, Math.floor((W + 1) / 3.2))
  for (let i = 0; i < n; i++) {
    const c = -W / 2 + (i + 0.5) * (W / n)
    chamferBox(w, 'concrete', [c - 1.05, DECK + 1.18, z1 - 0.5], [c + 1.05, DECK + 1.85, z1], 0.05)
  }
  // the lift gate raised into the girder: its lower edge and stiffeners show under the soffit
  chamferBox(w, 'steel', [-W / 2 + 0.05, SOFFIT - 0.62, GATE_Z - 0.14], [W / 2 - 0.05, SOFFIT + 0.02, GATE_Z + 0.14], 0.02)
  chamferBox(w, 'darkSteel', [-W / 2 + 0.05, SOFFIT - 0.7, GATE_Z - 0.18], [W / 2 - 0.05, SOFFIT - 0.6, GATE_Z + 0.18], 0.015)
  chamferBox(w, 'darkSteel', [-W / 2 + 0.05, SOFFIT - 0.34, GATE_Z + 0.14], [W / 2 - 0.05, SOFFIT - 0.26, GATE_Z + 0.2], 0.01)
  // lamps under the soffit, either side of the gate
  for (const z of [GATE_Z + 1.6, GATE_Z - 2.4]) {
    for (const x of [-W / 4, W / 4]) {
      chamferBox(w, 'darkSteel', [x - 0.4, SOFFIT - 0.16, z - 0.16], [x + 0.4, SOFFIT + 0.01, z + 0.16], 0.02)
      chamferBox(w, 'lamp', [x - 0.34, SOFFIT - 0.18, z - 0.11], [x + 0.34, SOFFIT - 0.16, z + 0.11], 0.005)
    }
  }
}

/** One tower, in its own frame (centred, +z outward); `s` the side it stands on (the passage is toward -s x). */
function tower(w: MeshWriter, M: Matrix4, s: number, bridged: boolean): void {
  const G = GATEHOUSE
  const hx = G.tower / 2, hz = G.depth / 2
  const [y0, y1] = STOREY
  const H = G.height
  const t = 0.45
  w.place(M)
  prismY(w, 'concrete', rect(G.tower + 0.5, G.depth + 0.5), -0.2, 1.05, 0.22)
  chamferBox(w, 'concrete', [-hx, 0.9, -hz], [hx, RAMPART.top + 0.15, hz], 0.06)
  chamferBox(w, 'concrete', [-hx - 0.16, RAMPART.top + 0.15, -hz - 0.16], [hx + 0.16, y0, hz + 0.16], 0.05)
  // the guard storey: slits to the field, a window to the court and one over the passage unless the bridge meets it
  const slit = (xs: number[]): Opening[] => windows(xs, 0.42, 0.9, 2.9)
  const faces: Array<[number, number, Opening[]]> = [
    [0, hx, slit([-2.4, 2.4])],
    [Math.PI, hx, windows([0], 1.4, 1.0, 2.5)],
    [Math.PI / 2, hz - t, s > 0 ? slit([-2.6, 2.6]) : bridged ? [] : slit([0])],
    [-Math.PI / 2, hz - t, s < 0 ? slit([-2.6, 2.6]) : bridged ? [] : slit([0])],
  ]
  for (const [yaw, span, openings] of faces) {
    const d = yaw === 0 || yaw === Math.PI ? hz : hx
    const F = M.clone().multiply(Ry(yaw)).multiply(T(0, 0, d))
    w.place(F)
    facade(w, 'concrete', -span, span, y0, y1, t, openings)
  }
  w.place(M)
  // the storey's floor and roof slab seen through the openings, the parapet band and its merlons
  chamferBox(w, 'interior', [-hx + t, y0, -hz + t], [hx - t, y0 + 0.05, hz - t], 0.01)
  chamferBox(w, 'concrete', [-hx + t, y1 - 0.3, -hz + t], [hx - t, y1 + 0.1, hz - t], 0.01)
  for (const [a, b] of [[[-hx - 0.1, -hz - 0.1], [hx + 0.1, -hz + 0.45]], [[-hx - 0.1, hz - 0.45], [hx + 0.1, hz + 0.1]], [[-hx - 0.1, -hz + 0.45], [-hx + 0.45, hz - 0.45]], [[hx - 0.45, -hz + 0.45], [hx + 0.1, hz - 0.45]]] as Array<[[number, number], [number, number]]>) {
    chamferBox(w, 'concrete', [a[0], y1, a[1]], [b[0], y1 + 0.6, b[1]], 0.04)
  }
  // merlons: three a side along the long faces, two on the short ones, corners solid
  const crest = (x0: number, x1: number, z0: number, z1: number): void => chamferBox(w, 'concrete', [x0, y1 + 0.58, z0], [x1, H, z1], 0.05)
  for (const z of [[-hz - 0.1, -hz + 0.45], [hz - 0.45, hz + 0.1]]) {
    for (const [a, b] of [[-hx - 0.1, -hx + 1.7], [-1.0, 1.0], [hx - 1.7, hx + 0.1]]) crest(a, b, z[0], z[1])
  }
  for (const x of [[-hx - 0.1, -hx + 0.45], [hx - 0.45, hx + 0.1]]) {
    for (const [a, b] of [[-hz + 0.45, -hz + 1.7], [-1.9, -0.3], [0.3, 1.9], [hz - 1.7, hz - 0.45]]) crest(x[0], x[1], a, b)
  }
  // a searchlight on the field corner away from the passage, a whip antenna on the other
  const sx = s * (hx - 1.1)
  w.place(M.clone().multiply(T(sx, 0, hz - 1.1)))
  cylinderY(w, 'darkSteel', 0.16, y1 + 0.1, y1 + 0.9, 10, 0.02)
  const S = M.clone().multiply(T(sx, y1 + 1.15, hz - 1.1)).multiply(new Matrix4().makeRotationX(Math.PI / 2 - 0.3))
  w.place(S)
  cylinderY(w, 'darkSteel', 0.34, -0.38, 0.32, 16, 0.04)
  cylinderY(w, 'lamp', 0.27, 0.32, 0.34, 16, 0)
  w.place(M.clone().multiply(T(-sx, 0, -hz + 1.2)))
  cylinderY(w, 'darkSteel', 0.035, y1 + 0.1, y1 + 5.2, 6, 0)
  w.place(M)
  // the lift gate's guide channel on the passage face, and a lamp over the passage on the field side
  const px = -s * hx
  const gz = GATE_Z - (G.front - hz)
  const top = bridged ? SOFFIT : RAMPART.top
  chamferBox(w, 'darkSteel', [px - s * 0.02 - 0.14, 0, gz - 0.2], [px - s * 0.02 + 0.14, top, gz + 0.2], 0.02)
  chamferBox(w, 'darkSteel', [px - s * 0.25 - 0.12, 6.2, hz - 0.9], [px - s * 0.25 + 0.12, 6.55, hz - 0.5], 0.02)
  strut(w, 'darkSteel', [px - s * 0.1, 6.4, hz - 0.7], [px - s * 0.7, 6.6, hz - 0.7], 0.035, 6, M)
  const L = M.clone().multiply(T(px - s * 0.85, 6.55, hz - 0.7)).multiply(new Matrix4().makeRotationZ(s * 0.5))
  w.place(L)
  chamferBox(w, 'darkSteel', [-0.25, -0.1, -0.2], [0.25, 0.08, 0.2], 0.02)
  chamferBox(w, 'lamp', [-0.2, -0.12, -0.16], [0.2, -0.1, 0.16], 0.005)
  w.place(M)
  // a steel door into the tower from the court
  chamferBox(w, 'darkSteel', [-0.75, 0.9, -hz - 0.04], [0.75, 3.2, -hz + 0.02], 0.02)
  chamferBox(w, 'steel', [-0.62, 1.0, -hz - 0.08], [0.62, 3.05, -hz - 0.03], 0.015)
  chamferBox(w, 'concrete', [-1.0, -0.2, -hz - 1.3], [1.0, 0.9, -hz - 0.02], 0.03)
}
