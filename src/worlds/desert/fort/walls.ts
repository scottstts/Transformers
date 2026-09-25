import { Matrix4 } from 'three/webgpu'
import { MeshWriter, chamferBox, chamferRect, cylinderY, extrudeX, prismY, strut, type Vec2, type Vec3 } from './mesh'
import { CORNER_PILLAR, GATE_PILLAR, GATE_WIDTH, T_WALL } from './plan'

/**
 * The perimeter: precast T-wall slabs, corner pillars and the gates.
 *
 * Slab frame: x along the wall (the slab's width), y up, z across it (+z
 * outward), origin at the footing's centre on the sand. The footing is a
 * chamfered block; the stem stands on it, tapering from its base to a
 * chamfered top with two steel lifting loops, as cast slabs are.
 */
export function tWall(w: MeshWriter, M: Matrix4): void {
  const t = T_WALL
  const hw = (t.width - t.gap) / 2
  w.place(M)
  chamferBox(w, 'concrete', [-hw, -0.1, -t.foot / 2], [hw, t.footH, t.foot / 2], 0.05)
  // stem: a tapering section with chamfered top corners (u across the slab, v up)
  const c = 0.045
  const stem: Vec2[] = [
    [-t.stem / 2, t.footH], [t.stem / 2, t.footH],
    [t.top / 2, t.height - c], [t.top / 2 - c, t.height], [-t.top / 2 + c, t.height], [-t.top / 2, t.height - c],
  ]
  // stem ends are 1 cm inside the footing's ends: no coplanar faces at the junction
  extrudeX(w, 'concrete', stem, -hw + 0.012, hw - 0.012)
  // haunches: the fillet where the stem meets the footing, both sides
  for (const s of [-1, 1]) {
    const haunch: Vec2[] = s > 0
      ? [[t.stem / 2 - 0.02, t.footH - 0.01], [t.stem / 2 + 0.16, t.footH - 0.01], [t.stem / 2 - 0.004, t.footH + 0.16]]
      : [[-t.stem / 2 - 0.16, t.footH - 0.01], [-t.stem / 2 + 0.02, t.footH - 0.01], [-t.stem / 2 + 0.004, t.footH + 0.16]]
    extrudeX(w, 'concrete', haunch, -hw + 0.02, hw - 0.02)
  }
  // lifting loops: bent rebar hoops standing out of the top
  for (const x of [-hw * 0.5, hw * 0.5]) {
    const y = t.height - 0.02
    const pts: Vec3[] = [[x - 0.08, y, 0], [x - 0.07, y + 0.11, 0], [x, y + 0.15, 0], [x + 0.07, y + 0.11, 0], [x + 0.08, y, 0]]
    for (let i = 0; i < pts.length - 1; i++) strut(w, 'darkSteel', pts[i], pts[i + 1], 0.012, 5, M)
  }
}

/** A square concrete pillar with a cap and a recessed band (corner posts and gate posts). */
export function pillar(w: MeshWriter, M: Matrix4, size: number, height: number): void {
  w.place(M)
  const s = size / 2
  chamferBox(w, 'concrete', [-s, -0.1, -s], [s, height - 0.35, s], 0.06)
  chamferBox(w, 'concrete', [-s - 0.12, height - 0.4, -s - 0.12], [s + 0.12, height, s + 0.12], 0.07)
  // a slightly proud plinth at the foot
  chamferBox(w, 'concrete', [-s - 0.08, -0.1, -s - 0.08], [s + 0.08, 0.55, s + 0.08], 0.05)
}

export function cornerPillar(w: MeshWriter, M: Matrix4): void {
  pillar(w, M, CORNER_PILLAR.size, CORNER_PILLAR.height)
}

/**
 * A gate: the two pillars, a ground rail across the opening and the sliding
 * leaf, a welded steel frame of box sections with vertical bars and a
 * diagonal brace, parked open behind the wall on `leaf`'s side on its
 * rollers. Gate frame: x along the wall (opening centred at 0), z outward.
 */
export function gate(w: MeshWriter, M: Matrix4, leaf: 1 | -1): void {
  const off = GATE_WIDTH / 2 + GATE_PILLAR.size / 2
  for (const x of [-off, off]) pillar(w, M.clone().multiply(new Matrix4().makeTranslation(x, 0, 0)), GATE_PILLAR.size, GATE_PILLAR.height)
  w.place(M)
  // ground rail across the opening, flush in a concrete sill
  chamferBox(w, 'concrete', [-GATE_WIDTH / 2 - 0.2, -0.1, -0.5], [GATE_WIDTH / 2 + 0.2, 0.06, 0.5], 0.03)
  chamferBox(w, 'darkSteel', [-GATE_WIDTH / 2 - 0.2, 0.06, -0.05], [GATE_WIDTH / 2 + 0.2, 0.11, 0.05], 0.01)
  // the leaf, parked behind the wall (inside: -z), overlapping the slabs by its own width
  const width = GATE_WIDTH * 0.52, height = 4.6
  const x0 = leaf * (GATE_WIDTH / 2 + GATE_PILLAR.size + 0.4)
  const xa = Math.min(x0, x0 + leaf * width), xb = Math.max(x0, x0 + leaf * width)
  const z = -T_WALL.foot / 2 - 0.6
  const tube = (a: Vec3, b: Vec3, s = 0.09): void => {
    const lo: Vec3 = [Math.min(a[0], b[0]) - s, Math.min(a[1], b[1]) - s, Math.min(a[2], b[2]) - s]
    const hi: Vec3 = [Math.max(a[0], b[0]) + s, Math.max(a[1], b[1]) + s, Math.max(a[2], b[2]) + s]
    chamferBox(w, 'steel', lo, hi, 0.015)
  }
  const y0 = 0.45
  tube([xa, y0, z], [xb, y0, z], 0.1)
  tube([xa, y0 + height, z], [xb, y0 + height, z], 0.1)
  tube([xa, y0 + 0.1, z], [xa, y0 + height - 0.1, z], 0.1)
  tube([xb, y0 + 0.1, z], [xb, y0 + height - 0.1, z], 0.1)
  tube([xa + 0.1, y0 + height * 0.5, z], [xb - 0.1, y0 + height * 0.5, z], 0.07)
  const bars = Math.round(width / 0.32)
  for (let i = 1; i < bars; i++) {
    const x = xa + (i / bars) * (xb - xa)
    tube([x, y0 + 0.1, z], [x, y0 + height - 0.1, z], 0.028)
  }
  strut(w, 'steel', [xa + 0.1, y0 + 0.1, z], [xb - 0.1, y0 + height - 0.1, z], 0.06, 6, M)
  // rollers and their brackets
  for (const x of [xa + 0.6, xb - 0.6]) {
    const R = M.clone().multiply(new Matrix4().makeTranslation(x, 0.22, z)).multiply(new Matrix4().makeRotationZ(Math.PI / 2))
    w.place(R)
    cylinderY(w, 'rubber', 0.2, -0.07, 0.07, 14, 0.02)
    w.place(M)
    chamferBox(w, 'darkSteel', [x - 0.12, 0.2, z - 0.12], [x + 0.12, y0, z + 0.12], 0.02)
  }
  // posts of the guide the leaf rolls against at its top
  for (const x of [xa + 0.3, xb - 0.3]) {
    prismY(w, 'darkSteel', chamferRect(0.16, 0.16, 0.02, x, z - 0.35), 0, y0 + height + 0.3, 0.02)
  }
}
