import { Matrix4 } from 'three/webgpu'
import { MeshWriter, chamferBox, cylinderY, type Vec3 } from './mesh'
import type { Hangar } from './plan'

const PLINTH = 0.5
/** Corrugation: pitch along the hangar and depth (m). */
const PITCH = 0.5
const DEPTH = 0.06
const ARCH_SEG = 24

/**
 * The garrison's Quonset hangar, the soldiers' spawn door. A semicircular
 * arch of corrugated galvanized steel on a concrete plinth: the skin is a
 * true corrugated surface (a row every half pitch, its normals across the
 * flutes), lined inside; end walls of flat plate follow the arch and close the
 * skin's edge. The front wall carries the big door opening with a steel
 * frame, the rolled-up door's drum housing above it, a lamp, and a personnel
 * door; the dark interior (floor, lining, lit strips) shows through it.
 * Frame: the door faces +z, floor at y = 0.
 */
export function hangar(w: MeshWriter, M: Matrix4, h: Hangar): void {
  const R = h.width / 2
  const L = h.length / 2
  const cy = PLINTH
  w.place(M)
  // plinth under both skirts and the end walls
  chamferBox(w, 'concrete', [-R - 0.35, -0.2, -L - 0.35], [-R + 0.25, PLINTH, L + 0.35], 0.05)
  chamferBox(w, 'concrete', [R - 0.25, -0.2, -L - 0.35], [R + 0.35, PLINTH, L + 0.35], 0.05)
  chamferBox(w, 'concrete', [-R + 0.2, -0.2, -L - 0.35], [R - 0.2, PLINTH, -L + 0.3], 0.05)
  // interior floor (dark, oil-stained)
  chamferBox(w, 'interior', [-R + 0.2, -0.1, -L + 0.3], [R - 0.2, 0.12, L - 0.1], 0.02)

  // the corrugated skin: rows every half pitch at the flutes' mid-depth, their normals tilted
  // alternately up and down the slope of a sine corrugation (r' = pi D / P at the mid points), so the
  // interpolated normal shades each flute as the sine it is; the silhouette's 5 cm relief is below notice
  const rows: Vec3[][] = []
  const normals: Vec3[][] = []
  const count = Math.round((2 * L) / (PITCH / 2))
  // (a little under the true slope: at a distance the flutes would otherwise shimmer)
  const slope = (0.6 * Math.PI * DEPTH) / PITCH
  const r = R + DEPTH / 2
  for (let i = 0; i <= count; i++) {
    const z = -L + (i / count) * 2 * L
    const tilt = i % 2 === 0 ? slope : -slope
    const row: Vec3[] = []
    const nrow: Vec3[] = []
    // columns run from +x over the top to -x: the quads face outward
    for (let k = 0; k <= ARCH_SEG; k++) {
      const a = Math.PI * (k / ARCH_SEG)
      const c = Math.cos(a), sn = Math.sin(a)
      row.push([c * r, cy + sn * r, z])
      nrow.push([c, sn, tilt])
    }
    rows.push(row)
    normals.push(nrow)
  }
  w.grid('galvanized', rows, normals)
  // lining inside
  const inner: Vec3[][] = []
  const inN: Vec3[][] = []
  for (const z of [-L + 0.25, L - 0.25]) {
    const row: Vec3[] = []
    const nrow: Vec3[] = []
    for (let k = 0; k <= ARCH_SEG; k++) {
      const a = Math.PI * (1 - k / ARCH_SEG)
      row.push([Math.cos(a) * (R - 0.25), cy + Math.sin(a) * (R - 0.25), z])
      nrow.push([-Math.cos(a), -Math.sin(a), 0])
    }
    inner.push(row)
    inN.push(nrow)
  }
  w.grid('interior', inner, inN)
  // lit strips along the ceiling
  for (const x of [-2.6, 2.6]) {
    const y = cy + Math.sqrt((R - 0.3) ** 2 - x * x) - 0.12
    chamferBox(w, 'lamp', [x - 0.12, y - 0.06, -L + 1.5], [x + 0.12, y, L - 1.5], 0.02)
  }

  endWall(w, M, R, L, cy, h, true)
  endWall(w, M.clone().multiply(new Matrix4().makeRotationY(Math.PI)), R, L, cy, h, false)
}

/** An end wall: flat plate strips under the arch (outer face at z = L), lined inside; the front has the door. */
function endWall(w: MeshWriter, M: Matrix4, R: number, L: number, cy: number, h: Hangar, front: boolean): void {
  w.place(M)
  const Ro = R + DEPTH + 0.02
  const top = (x: number): number => cy + Math.sqrt(Math.max(0, Ro * Ro - x * x))
  const dw = h.door.width / 2, dh = h.door.height
  const xs: number[] = []
  for (let k = 0; k <= ARCH_SEG; k++) xs.push(-Ro * Math.cos((Math.PI * k) / ARCH_SEG))
  if (front) xs.push(-dw, dw)
  xs.sort((a, b) => a - b)
  const z = L + 0.02, zi = L - 0.22
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i], x1 = xs[i + 1]
    if (x1 - x0 < 1e-4) continue
    const inDoor = front && x0 >= -dw - 1e-6 && x1 <= dw + 1e-6
    const y0 = inDoor ? dh : PLINTH
    const t0 = top(x0), t1 = top(x1)
    if (Math.min(t0, t1) <= y0) continue
    w.poly('galvanized', [[x0, y0, z], [x1, y0, z], [x1, t1, z], [x0, t0, z]])
    w.poly('interior', [[x1, y0, zi], [x0, y0, zi], [x0, t0 - 0.2, zi], [x1, t1 - 0.2, zi]])
  }
  if (!front) return
  // door reveal: the wall's thickness round the opening, a steel frame, the drum housing, a lamp
  w.poly('interior', [[-dw, dh, zi], [-dw, dh, z], [-dw, 0.12, z], [-dw, 0.12, zi]])
  w.poly('interior', [[dw, dh, z], [dw, dh, zi], [dw, 0.12, zi], [dw, 0.12, z]])
  w.poly('interior', [[-dw, dh, zi], [dw, dh, zi], [dw, dh, z], [-dw, dh, z]])
  chamferBox(w, 'steel', [-dw - 0.35, 0.1, L - 0.05], [-dw, dh + 0.35, L + 0.2], 0.03)
  chamferBox(w, 'steel', [dw, 0.1, L - 0.05], [dw + 0.35, dh + 0.35, L + 0.2], 0.03)
  chamferBox(w, 'steel', [-dw - 0.35, dh, L - 0.05], [dw + 0.35, dh + 0.35, L + 0.2], 0.03)
  chamferBox(w, 'darkSteel', [-dw - 0.2, dh + 0.35, L - 0.02], [dw + 0.2, dh + 1.15, L + 0.72], 0.08)
  // the rolled-up slats show under the housing
  const D = M.clone().multiply(new Matrix4().makeTranslation(0, dh + 0.3, L + 0.4)).multiply(new Matrix4().makeRotationZ(Math.PI / 2))
  w.place(D)
  cylinderY(w, 'galvanized', 0.28, -dw, dw, 16, 0.02)
  w.place(M)
  // lamp over the door, and a personnel door to one side
  chamferBox(w, 'darkSteel', [-0.35, dh + 1.3, L], [0.35, dh + 1.55, L + 0.45], 0.03)
  chamferBox(w, 'lamp', [-0.28, dh + 1.26, L + 0.05], [0.28, dh + 1.3, L + 0.4], 0.01)
  const px = dw + 2.4
  if (px + 0.8 < R - 1) {
    chamferBox(w, 'steel', [px - 0.75, PLINTH, L], [px + 0.75, PLINTH + 3.4, L + 0.08], 0.02)
    chamferBox(w, 'darkSteel', [px - 0.62, PLINTH + 0.02, L + 0.08], [px + 0.62, PLINTH + 3.2, L + 0.12], 0.01)
    chamferBox(w, 'darkSteel', [px + 0.35, PLINTH + 1.6, L + 0.12], [px + 0.5, PLINTH + 1.7, L + 0.22], 0.01)
  }
}
