import { Matrix4 } from 'three/webgpu'
import { MeshWriter, chamferBox, cylinderY, prismY, rect, strut, type Vec3 } from './mesh'

/** Watchtower dimensions (m): leg spread at the foot and at the deck, deck height, cab. */
export const TOWER = { foot: 4.6, top: 3.4, deck: 9.2, cab: 3.8, cabH: 2.7 }

/**
 * A steel watchtower: four battered legs of square hollow section on
 * concrete pads, K-braced in three bays, a chequer-plate deck, an armoured
 * cab (plate walls under a continuous window band with mullions, a sloped
 * roof with overhang), a ladder up one leg into a hatch, and a searchlight
 * on the roof. Frame: y up, z toward the fort's centre (the cab's front).
 */
export function watchtower(w: MeshWriter, M: Matrix4): void {
  const T = TOWER
  const legs: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
  const at = (sx: number, sz: number, y: number): Vec3 => {
    const h = (T.foot + (T.top - T.foot) * (y / T.deck)) / 2
    return [sx * h, y, sz * h]
  }
  w.place(M)
  for (const [sx, sz] of legs) {
    const [x, , z] = at(sx, sz, 0)
    chamferBox(w, 'concrete', [x - 0.55, -0.2, z - 0.55], [x + 0.55, 0.35, z + 0.55], 0.06)
    strut(w, 'steel', at(sx, sz, 0.35), at(sx, sz, T.deck), 0.13, 8, M)
    w.place(M)
    chamferBox(w, 'darkSteel', [x - 0.3, 0.35, z - 0.3], [x + 0.3, 0.42, z + 0.3], 0.01)
  }
  // K-bracing in three bays on every face, and horizontal girts
  const bays = [0.4, 3.3, 6.2, T.deck - 0.2]
  for (let f = 0; f < 4; f++) {
    const [ax, az] = legs[f], [bx, bz] = legs[(f + 1) % 4]
    for (let b = 0; b < bays.length - 1; b++) {
      const y0 = bays[b], y1 = bays[b + 1]
      strut(w, 'steel', at(ax, az, y0), at(bx, bz, y1), 0.055, 6, M)
      strut(w, 'steel', at(bx, bz, y0), at(ax, az, y1), 0.055, 6, M)
      strut(w, 'steel', at(ax, az, y1), at(bx, bz, y1), 0.07, 6, M)
    }
  }
  w.place(M)
  // deck: a steel-edged platform wider than the leg head
  const d = T.cab / 2 + 0.55
  chamferBox(w, 'darkSteel', [-d, T.deck, -d], [d, T.deck + 0.28, d], 0.04)
  // cab: lower armour plate walls, a window band with mullions, the roof
  const c = T.cab / 2
  const y0 = T.deck + 0.28, yw = y0 + 1.25, yt = y0 + T.cabH
  const wallT = 0.12
  for (let f = 0; f < 4; f++) {
    const R = M.clone().multiply(new Matrix4().makeRotationY((f * Math.PI) / 2))
    w.place(R)
    chamferBox(w, 'steel', [-c, y0, c - wallT], [c, yw, c], 0.02)
    chamferBox(w, 'steel', [-c, yt - 0.35, c - wallT], [c, yt, c], 0.02)
    // window: glass set back behind mullions
    chamferBox(w, 'glass', [-c + 0.1, yw, c - wallT * 0.7], [c - 0.1, yt - 0.35, c - wallT * 0.4], 0.005)
    for (const x of [-c + 0.06, -c / 3, c / 3, c - 0.06]) chamferBox(w, 'steel', [x - 0.06, yw, c - wallT], [x + 0.06, yt - 0.35, c + 0.01], 0.01)
    // armour: an angled apron plate below the window
    chamferBox(w, 'steel', [-c - 0.02, y0 + 0.2, c], [c + 0.02, y0 + 0.9, c + 0.06], 0.015)
  }
  w.place(M)
  // roof: sloped, overhanging, with a trim edge
  const r = c + 0.55
  chamferBox(w, 'darkSteel', [-r, yt, -r], [r, yt + 0.18, r], 0.03)
  prismY(w, 'darkSteel', rect(2 * r - 0.8, 2 * r - 0.8), yt + 0.18, yt + 0.42, 0.18)
  // searchlight on a pedestal
  cylinderY(w, 'darkSteel', 0.14, yt + 0.42, yt + 0.95, 10, 0.02)
  const S = M.clone().multiply(new Matrix4().makeTranslation(0, yt + 1.18, 0)).multiply(new Matrix4().makeRotationX(Math.PI / 2 - 0.25))
  w.place(S)
  cylinderY(w, 'darkSteel', 0.3, -0.35, 0.3, 16, 0.04)
  cylinderY(w, 'lamp', 0.24, 0.3, 0.32, 16, 0)
  w.place(M)
  // a vertical ladder outside the deck edge on the back face, bracketed to the girts, with grab rails over the deck
  const lz = -(d + 0.32)
  for (const x of [-0.32, 0.32]) strut(w, 'darkSteel', [x, 0.3, lz], [x, T.deck + 1.25, lz], 0.035, 6, M)
  for (let y = 0.6; y < T.deck + 0.2; y += 0.38) strut(w, 'darkSteel', [-0.32, y, lz], [0.32, y, lz], 0.018, 5, M)
  for (const y of [2.5, 5.2, 7.9]) {
    const face = -(T.foot + (T.top - T.foot) * (y / T.deck)) / 2
    for (const x of [-0.32, 0.32]) strut(w, 'darkSteel', [x, y, lz], [x, y, face], 0.03, 5, M)
  }
  for (const x of [-0.32, 0.32]) strut(w, 'darkSteel', [x, T.deck + 1.25, lz], [x, T.deck + 1.25, -d + 0.1], 0.035, 6, M)
  w.place(M)
}
