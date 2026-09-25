import { Matrix4 } from 'three/webgpu'
import { MeshWriter, chamferBox, cylinderY, extrudeX, prismY, rect, strut, type Vec2, type Vec3 } from './mesh'
import type { Box } from './plan'

const T = (x: number, y: number, z: number): Matrix4 => new Matrix4().makeTranslation(x, y, z)

/**
 * A reinforced-concrete command bunker: a chamfered block with a thickened
 * roof slab, a sandbag parapet round the roof, vision slits with steel
 * shutters, a recessed blast door behind an L-shaped screen wall, an A/C
 * unit, and an antenna mast with a dish. Frame: the door faces +z.
 */
export function bunker(w: MeshWriter, M: Matrix4, b: Box): void {
  const [W, H, D] = b.size
  const x = W / 2, z = D / 2
  w.place(M)
  chamferBox(w, 'concrete', [-x, -0.2, -z], [x, H - 0.5, z], 0.12)
  chamferBox(w, 'concrete', [-x - 0.3, H - 0.55, -z - 0.3], [x + 0.3, H, z + 0.3], 0.1)
  // sandbag parapet: courses of bags round the roof edge
  const bag = (cx: number, cz: number, along: 'x' | 'z', y: number, k: number): void => {
    const l = 0.62, t = 0.36, h = 0.2
    const [hx, hz] = along === 'x' ? [l / 2, t / 2] : [t / 2, l / 2]
    w.shade((k * 0.37) % 1)
    chamferBox(w, 'sandbag', [cx - hx, y, cz - hz], [cx + hx, y + h, cz + hz], 0.08)
  }
  for (let course = 0; course < 3; course++) {
    const y = H + course * 0.19
    const off = course % 2 ? 0.31 : 0
    for (let u = -x + 0.1 + off; u < x - 0.3; u += 0.64) {
      bag(u + 0.31, z + 0.05, 'x', y, Math.round(u * 7) + course)
      bag(u + 0.31, -z - 0.05, 'x', y, Math.round(u * 5) + course)
    }
    for (let v = -z + 0.5 + off; v < z - 0.5; v += 0.64) {
      bag(x + 0.05, v + 0.31, 'z', y, Math.round(v * 3) + course)
      bag(-x - 0.05, v + 0.31, 'z', y, Math.round(v * 11) + course)
    }
  }
  w.shade(0.5)
  // vision slits with steel shutters (front and sides)
  for (const sx of [-x * 0.6, x * 0.6]) {
    chamferBox(w, 'interior', [sx - 0.9, H - 1.6, z - 0.02], [sx + 0.9, H - 1.2, z + 0.01], 0.01)
    chamferBox(w, 'darkSteel', [sx - 1.0, H - 1.15, z], [sx + 1.0, H - 1.05, z + 0.4], 0.02)
  }
  // recessed blast door behind a screen wall
  chamferBox(w, 'darkSteel', [-0.8, 0.05, z - 0.02], [0.8, 2.9, z + 0.06], 0.03)
  chamferBox(w, 'steel', [-0.7, 0.1, z + 0.06], [0.7, 2.8, z + 0.12], 0.02)
  chamferBox(w, 'concrete', [-2.6, -0.2, z + 2.2], [1.4, 3.2, z + 2.6], 0.06)
  chamferBox(w, 'concrete', [-2.6, -0.2, z + 0.2], [-2.2, 3.2, z + 2.2], 0.06)
  // A/C unit on the side
  chamferBox(w, 'galvanized', [x + 0.02, 0.6, -1.4], [x + 0.9, 1.9, 0.2], 0.04)
  chamferBox(w, 'interior', [x + 0.9, 0.8, -1.2], [x + 0.93, 1.7, 0.0], 0.01)
  // antenna mast with guys, and a dish on the roof
  const mx = -x + 1.2, mz = -z + 1.2
  w.place(T(mx, 0, mz).premultiply(M))
  cylinderY(w, 'steel', 0.09, H, H + 9, 8, 0.01)
  cylinderY(w, 'darkSteel', 0.2, H + 9, H + 9.5, 8, 0.02)
  w.place(M)
  for (const [gx, gz] of [[x - 1, -z + 0.6], [-x + 0.6, z - 1], [x - 1, z - 1]] as Array<[number, number]>) {
    strut(w, 'darkSteel', [mx, H + 7.5, mz], [gx, H + 0.02, gz], 0.012, 4, M)
  }
  w.place(M)
  const dish = T(x - 2.2, H + 1.1, -z + 2.2).premultiply(M).multiply(new Matrix4().makeRotationX(-0.9))
  w.place(T(x - 2.2, 0, -z + 2.2).premultiply(M))
  cylinderY(w, 'steel', 0.12, H, H + 1.1, 8, 0.01)
  w.place(dish)
  cylinderY(w, 'galvanized', 1.0, 0, 0.12, 18, 0.05)
  cylinderY(w, 'darkSteel', 0.12, 0.12, 0.7, 8, 0.02)
  w.place(M)
}

/**
 * A 40 ft ISO container (12.19 x 2.59 x 2.44 m): corner posts with corner
 * castings, top and bottom rails, trapezoidal corrugated side walls, a
 * corrugated roof, twin doors at the back end with four locking bars.
 * Frame: length along z, doors at -z, floor at y = 0 (`b.y` stacks it).
 */
export function container(w: MeshWriter, M: Matrix4, b: Box, y = 0): void {
  const W = 2.44, H = 2.59, L = 12.19
  const x = W / 2, z = L / 2
  w.place(T(0, y, 0).premultiply(M))
  w.shade(b.kind / 3 + 0.15)
  // corner posts, castings and rails
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    chamferBox(w, 'container', [sx * x - (sx > 0 ? 0.16 : 0), 0, sz * z - (sz > 0 ? 0.16 : 0)], [sx * x + (sx < 0 ? 0.16 : 0), H, sz * z + (sz < 0 ? 0.16 : 0)], 0.015)
    for (const cy of [0, H - 0.12]) {
      chamferBox(w, 'darkSteel', [sx * x - 0.09, cy, sz * z - 0.09], [sx * x + 0.09, cy + 0.12, sz * z + 0.09], 0.01)
    }
  }
  for (const sx of [-1, 1]) {
    chamferBox(w, 'container', [sx * x - 0.08, 0, -z], [sx * x + 0.08, 0.16, z], 0.015)
    chamferBox(w, 'container', [sx * x - 0.08, H - 0.14, -z], [sx * x + 0.08, H, z], 0.015)
  }
  chamferBox(w, 'darkSteel', [-x, 0, -z + 0.1], [x, 0.14, z - 0.1], 0.01)
  // corrugated side walls: trapezoid flutes 0.28 m pitch, 3.6 cm deep, set just inside the rails
  const pitch = 0.28, depth = 0.036
  for (const sx of [-1, 1]) {
    const prof: Vec2[] = []
    const n = Math.floor((L - 0.4) / pitch)
    const z0 = -(n * pitch) / 2
    for (let i = 0; i <= n; i++) {
      const zz = z0 + i * pitch
      prof.push([zz, 0], [zz + pitch * 0.18, depth], [zz + pitch * 0.5, depth], [zz + pitch * 0.68, 0])
    }
    // flute strips: each facet a flat quad between the rails
    const xo = sx * (x - 0.05)
    for (let i = 0; i < prof.length - 1; i++) {
      const [za, da] = prof[i], [zb, db] = prof[i + 1]
      const xa = xo + sx * da, xb = xo + sx * db
      if (sx > 0) w.poly('container', [[xa, 0.16, za], [xb, 0.16, zb], [xb, H - 0.14, zb], [xa, H - 0.14, za]].reverse() as Vec3[])
      else w.poly('container', [[xa, 0.16, za], [xb, 0.16, zb], [xb, H - 0.14, zb], [xa, H - 0.14, za]])
    }
  }
  // roof and front end wall (flat panels with a shallow pressing), rear doors
  chamferBox(w, 'container', [-x + 0.06, H - 0.16, -z + 0.12], [x - 0.06, H - 0.03, z - 0.12], 0.02)
  chamferBox(w, 'container', [-x + 0.1, 0.14, z - 0.16], [x - 0.1, H - 0.14, z - 0.06], 0.01)
  for (const sx of [-1, 1]) {
    chamferBox(w, 'container', [sx > 0 ? 0.01 : -x + 0.12, 0.16, -z + 0.03], [sx > 0 ? x - 0.12 : -0.01, H - 0.16, -z + 0.1], 0.01)
    for (const bx of [0.35, 0.8]) {
      const px = sx * bx
      prismY(w, 'darkSteel', rect(0.05, 0.05, px, -z + 0.01), 0.2, H - 0.2, 0.01)
      chamferBox(w, 'darkSteel', [px - 0.06, 1.05, -z - 0.06], [px + 0.06, 1.35, -z + 0.03], 0.01)
    }
  }
  w.shade(0.5)
}

/**
 * A horizontal fuel tank on two concrete saddles: a cylindrical shell with
 * dished heads, a manway on top, a walkway ladder and a feed pipe to the
 * ground. Frame: axis along z.
 */
export function fuelTank(w: MeshWriter, M: Matrix4): void {
  const R = 1.45, L = 8.2
  w.place(M)
  for (const z of [-L * 0.3, L * 0.3]) {
    chamferBox(w, 'concrete', [-1.3, -0.2, z - 0.45], [1.3, 0.9, z + 0.45], 0.06)
    chamferBox(w, 'darkSteel', [-1.2, 0.9, z - 0.2], [1.2, 1.2, z + 0.2], 0.02)
  }
  const A = T(0, 1.0 + R, 0).premultiply(M).multiply(new Matrix4().makeRotationX(Math.PI / 2))
  w.place(A)
  w.shade(0.8)
  cylinderY(w, 'steel', R, -L / 2, L / 2, 28, 0, [false, false])
  // dished heads: a shallow cone ring and a cap
  const head = (s: number): void => {
    const y0 = s * L / 2
    const rows: Vec3[][] = []
    const normals: Vec3[][] = []
    for (let j = 0; j <= 3; j++) {
      const t = j / 3
      const r = R * Math.cos(t * Math.PI * 0.42)
      const y = y0 + s * R * 0.32 * Math.sin(t * Math.PI * 0.5)
      rows.push(Array.from({ length: 29 }, (_, k) => [Math.cos((k / 28) * Math.PI * 2) * r, y, -Math.sin((k / 28) * Math.PI * 2) * r] as Vec3))
      normals.push(Array.from({ length: 29 }, (_, k) => {
        const a = (k / 28) * Math.PI * 2
        const ny = s * Math.sin(t * Math.PI * 0.45)
        const c = Math.sqrt(1 - ny * ny)
        return [Math.cos(a) * c, ny, -Math.sin(a) * c] as Vec3
      }))
    }
    if (s < 0) { rows.reverse(); normals.reverse() }
    w.grid('steel', rows, normals)
    const cap = y0 + s * R * 0.32
    const rc = R * Math.cos(Math.PI * 0.42)
    const ring = Array.from({ length: 28 }, (_, k) => [Math.cos((k / 28) * Math.PI * 2) * rc, cap, -Math.sin((k / 28) * Math.PI * 2) * rc] as Vec3)
    w.poly('steel', s > 0 ? ring : ring.reverse())
  }
  head(1)
  head(-1)
  w.shade(0.5)
  w.place(M)
  // manway and pipe
  cylinderY(w, 'darkSteel', 0.35, 1.0 + 2 * R - 0.1, 1.0 + 2 * R + 0.25, 14, 0.03)
  strut(w, 'darkSteel', [R * 0.7, 1.4, L / 2 - 0.3], [R * 0.7, 0.05, L / 2 + 1.2], 0.07, 8, M)
  w.place(M)
}

/**
 * A gabion (HESCO) cell: wire-mesh faces over geotextile, the sand fill
 * bulging the faces out and slumped at the top, steel coil posts at the
 * corners. Frame: centred, floor at y = 0.
 */
export function gabion(w: MeshWriter, M: Matrix4, b: Box): void {
  const [W, H, D] = b.size
  const x = W / 2, z = D / 2
  w.place(M)
  const bulge = 0.08
  const seg = 5
  for (let f = 0; f < 4; f++) {
    const R = M.clone().multiply(new Matrix4().makeRotationY((f * Math.PI) / 2))
    w.place(R)
    const hw = f % 2 ? z : x
    const hd = f % 2 ? x : z
    const rows: Vec3[][] = []
    const normals: Vec3[][] = []
    for (let j = 0; j <= seg; j++) {
      const v = j / seg
      const row: Vec3[] = []
      const nrow: Vec3[] = []
      for (let i = 0; i <= seg; i++) {
        const u = (i / seg) * 2 - 1
        const b0 = bulge * (1 - u * u) * Math.sin(Math.PI * Math.min(1, v * 1.1))
        row.push([u * hw, v * H, hd + b0])
        const du = -2 * u * bulge * Math.sin(Math.PI * Math.min(1, v * 1.1)) / hw
        const dv = bulge * (1 - u * u) * Math.PI * Math.cos(Math.PI * Math.min(1, v * 1.1)) / H
        const l = Math.hypot(du, dv, 1)
        nrow.push([-du / l, -dv / l, 1 / l])
      }
      rows.push(row)
      normals.push(nrow)
    }
    w.grid('gabion', rows, normals)
  }
  w.place(M)
  // slumped sand top and corner coil posts
  prismY(w, 'sandbag', rect(W - 0.04, D - 0.04), H - 0.3, H - 0.12, 0.12)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    w.place(T(sx * x, 0, sz * z).premultiply(M))
    cylinderY(w, 'galvanized', 0.035, 0, H + 0.02, 6, 0.005)
  }
  w.place(M)
}

/** A concrete jersey barrier, 3.6 m long, the New Jersey safety profile scaled 1.4x. Frame: length along x. */
export function jerseyBarrier(w: MeshWriter, M: Matrix4): void {
  const k = 1.4
  const prof: Vec2[] = [
    [-0.305 * k, 0], [0.305 * k, 0], [0.305 * k, 0.076 * k], [0.18 * k, 0.33 * k], [0.075 * k, 0.81 * k], [-0.075 * k, 0.81 * k], [-0.18 * k, 0.33 * k], [-0.305 * k, 0.076 * k],
  ]
  w.place(M)
  extrudeX(w, 'concrete', prof, -1.8, 1.8)
  // lifting slots and the pin-and-loop joints at the ends
  for (const s of [-1, 1]) chamferBox(w, 'darkSteel', [s * 1.8 - 0.08, 0.4, -0.05], [s * 1.8 + 0.08, 0.7, 0.05], 0.01)
}

/**
 * A floodlight mast: a tapered steel pole on a bolted base plate over a
 * concrete footing, a cabinet at its foot, a crossbar with four lamp heads
 * aimed into the yard. Frame: the lamps face +z.
 */
export function mast(w: MeshWriter, M: Matrix4): void {
  const H = 15
  w.place(M)
  chamferBox(w, 'concrete', [-0.7, -0.2, -0.7], [0.7, 0.4, 0.7], 0.05)
  chamferBox(w, 'darkSteel', [-0.42, 0.4, -0.42], [0.42, 0.46, 0.42], 0.01)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    w.place(T(sx * 0.32, 0.46, sz * 0.32).premultiply(M))
    cylinderY(w, 'galvanized', 0.03, 0, 0.08, 6, 0.005)
  }
  w.place(M)
  // taper: stacked frusta
  const rows: Vec3[][] = []
  const normals: Vec3[][] = []
  for (const [y, r] of [[0.46, 0.2], [H * 0.5, 0.15], [H, 0.1]] as Array<[number, number]>) {
    rows.push(Array.from({ length: 13 }, (_, k) => [Math.cos((k / 12) * Math.PI * 2) * r, y, -Math.sin((k / 12) * Math.PI * 2) * r] as Vec3))
    normals.push(Array.from({ length: 13 }, (_, k) => [Math.cos((k / 12) * Math.PI * 2), 0.007, -Math.sin((k / 12) * Math.PI * 2)] as Vec3))
  }
  w.grid('galvanized', rows, normals)
  chamferBox(w, 'galvanized', [-0.35, 0.4, 0.22], [0.35, 1.6, 0.62], 0.03)
  // crossbar and lamp heads
  chamferBox(w, 'darkSteel', [-1.6, H - 0.1, -0.08], [1.6, H + 0.06, 0.08], 0.02)
  for (const x of [-1.25, -0.42, 0.42, 1.25]) {
    const L = T(x, H + 0.35, 0.1).premultiply(M).multiply(new Matrix4().makeRotationX(Math.PI / 2 - 0.5))
    w.place(L)
    chamferBox(w, 'darkSteel', [-0.3, -0.25, -0.22], [0.3, 0.12, 0.22], 0.04)
    chamferBox(w, 'lamp', [-0.25, 0.12, -0.18], [0.25, 0.14, 0.18], 0.01)
    w.place(M)
    strut(w, 'darkSteel', [x, H + 0.06, 0], [x, H + 0.2, 0.05], 0.03, 5, M)
  }
  w.place(M)
}
