import { Matrix4 } from 'three/webgpu'
import { MeshWriter, chamferBox, cylinderY, revolveY, strut, type Vec2 } from './mesh'

const T = (x: number, y: number, z: number): Matrix4 => new Matrix4().makeTranslation(x, y, z)

/**
 * The comms district's radar: a drum of cast concrete (the equipment room)
 * on a weathered plinth, a steel door with its hood and a louvred intake,
 * a steel deck ringed by a railing on its roof, and the radome, a truncated
 * sphere of panelled GRP (materials.ts `radome`) on a steel collar, with an
 * obstruction light on top. A caged ladder climbs the drum to the deck.
 * Frame: base centre, the door facing +z.
 */
export function radar(w: MeshWriter, M: Matrix4): void {
  const drum = 6.2, H = 5.5
  w.place(M)
  revolveY(w, 'concrete', [[drum + 0.5, -0.2], [drum + 0.5, 0.25], [drum + 0.05, 0.45]], [[1, 0], [1, 0.6], [0.4, 1]], 40)
  w.shade(0.55)
  cylinderY(w, 'concrete', drum, 0.3, H, 40, 0.06, [false, true])
  w.shade(0.5)
  // a band course at the drum's head, the deck and its railing
  revolveY(w, 'concrete', [[drum + 0.12, H - 0.55], [drum + 0.12, H - 0.25]], [[1, 0], [1, 0]], 40)
  cylinderY(w, 'darkSteel', drum + 0.8, H, H + 0.22, 40, 0.04)
  const posts = 28
  for (let k = 0; k < posts; k++) {
    const a = (k / posts) * Math.PI * 2
    const x = Math.sin(a) * (drum + 0.65), z = Math.cos(a) * (drum + 0.65)
    strut(w, 'galvanized', [x, H + 0.22, z], [x, H + 1.3, z], 0.03, 5, M)
  }
  w.place(M)
  for (const y of [H + 0.75, H + 1.3]) {
    revolveY(w, 'galvanized', [[drum + 0.62, y - 0.025], [drum + 0.68, y - 0.025], [drum + 0.68, y + 0.025], [drum + 0.62, y + 0.025], [drum + 0.62, y - 0.025]],
      [[0, -1], [1, 0], [0, 1], [-1, 0], [0, -1]], 48)
  }
  // the collar and the radome: a truncated sphere seated on it
  const collar = 5.2, top = H + 0.22 + 0.8
  cylinderY(w, 'galvanized', collar, H + 0.22, top, 40, 0.05)
  const R = 6
  const cy = top + Math.sqrt(R * R - (collar - 0.05) ** 2)
  const a0 = -Math.asin((cy - top) / R)
  const prof: Vec2[] = [], nrm: Vec2[] = []
  for (let k = 0; k <= 20; k++) {
    const a = a0 + ((Math.PI / 2 - a0) * k) / 20
    prof.push([Math.max(0.001, Math.cos(a) * R), cy + Math.sin(a) * R])
    nrm.push([Math.cos(a), Math.sin(a)])
  }
  revolveY(w, 'radome', prof, nrm, 48)
  cylinderY(w, 'darkSteel', 0.14, cy + R - 0.05, cy + R + 0.25, 10, 0.02)
  cylinderY(w, 'beacon', 0.1, cy + R + 0.25, cy + R + 0.42, 10, 0.03)
  // the door, its hood and a louvred intake beside it, on the drum's +z face
  const F = M.clone().multiply(T(0, 0, drum))
  w.place(F)
  // (the step stands over the plinth's weathered top; the door sits on it)
  chamferBox(w, 'concrete', [-1.1, -0.2, -0.3], [1.1, 0.47, 1.3], 0.03)
  chamferBox(w, 'darkSteel', [-0.75, 0.47, -0.35], [0.75, 2.92, 0.06], 0.02)
  chamferBox(w, 'steel', [-0.62, 0.5, 0.06], [0.62, 2.78, 0.11], 0.01)
  chamferBox(w, 'darkSteel', [0.38, 1.5, 0.11], [0.5, 1.6, 0.2], 0.005)
  chamferBox(w, 'darkSteel', [-1.0, 3.05, -0.1], [1.0, 3.15, 0.75], 0.02)
  chamferBox(w, 'darkSteel', [1.3, 1.2, -0.5], [2.3, 2.2, 0.05], 0.015)
  for (let y = 1.3; y < 2.1; y += 0.1) w.poly('darkSteel', [[1.35, y, 0.12], [2.25, y, 0.12], [2.25, y + 0.07, 0.06], [1.35, y + 0.07, 0.06]])
  // the caged ladder up the drum's side to the deck
  const L = M.clone().multiply(new Matrix4().makeRotationY(Math.PI / 2)).multiply(T(0, 0, drum))
  w.place(L)
  for (const x of [-0.3, 0.3]) strut(w, 'darkSteel', [x, 0.3, 0.25], [x, H + 1.3, 0.25], 0.03, 6, L)
  for (let y = 0.6; y < H; y += 0.3) strut(w, 'darkSteel', [-0.3, y, 0.25], [0.3, y, 0.25], 0.016, 4, L)
  for (let y = 2.4; y <= H + 1.2; y += 1.0) {
    const hoop: Array<[number, number, number]> = []
    for (let k = 0; k <= 8; k++) {
      const a = (k / 8) * Math.PI
      hoop.push([Math.cos(a) * 0.4, y, 0.25 + Math.sin(a) * 0.45])
    }
    for (let k = 0; k < 8; k++) strut(w, 'darkSteel', hoop[k], hoop[k + 1], 0.014, 4, L)
  }
  w.place(M)
}
