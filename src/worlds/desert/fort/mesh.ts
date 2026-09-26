import { BufferAttribute, BufferGeometry, Matrix4, Vector3 } from 'three/webgpu'

/**
 * A material-slot mesh writer for the forts' modules. Builders work in a
 * module's local frame (metres, +y up, the module's front along +z) and pass
 * a placement matrix; the writer keeps one position / normal / shade buffer
 * per slot and bucket and emits one indexed BufferGeometry for each (one draw
 * each). Buckets are chosen by the caller around whole modules (`bucket`):
 * the fort splits into quadrants, so the view and each of the sun's shadow cascades
 * only draw the parts near them, and small props go into detail buckets that
 * are hidden from afar.
 *
 * Polygons are the modelling unit: a planar polygon is emitted flat with its
 * own normal (fan-triangulated: builders pass convex polygons); a surface
 * with analytic normals (cylinders, arches) passes them per vertex. `shade`
 * is a per-vertex 0..1 variation the materials use for per-part tone (one
 * wall slab weathered darker than the next).
 */
export type Vec3 = [number, number, number]

/** A slot's geometry in one bucket. */
export interface SlotGeometry {
  slot: string
  bucket: string
  geometry: BufferGeometry
}

class SlotBuffer {
  position: number[] = []
  normal: number[] = []
  shade: number[] = []
  index: number[] = []
}

export class MeshWriter {
  private readonly slots = new Map<string, SlotBuffer>()
  private current = ''
  /** current placement and its normal matrix */
  private M = new Matrix4()
  private readonly N = new Matrix4()
  private shadeValue = 0.5
  private triangles = 0

  /** Place the following polygons with `m` (module frame to fort frame). */
  place(m: Matrix4): this {
    this.M = m
    this.N.copy(m).invert().transpose()
    return this
  }

  /** The bucket the following polygons go to (until changed). */
  bucket(name: string): this {
    this.current = name
    return this
  }

  get currentBucket(): string {
    return this.current
  }

  /** Per-part tone variation for the following polygons. */
  shade(v: number): this {
    this.shadeValue = v
    return this
  }

  private slot(name: string): SlotBuffer {
    const key = `${name}|${this.current}`
    let s = this.slots.get(key)
    if (!s) this.slots.set(key, s = new SlotBuffer())
    return s
  }

  /** A planar convex polygon (counter-clockwise seen from its front), flat shaded. */
  poly(slot: string, pts: Vec3[]): void {
    if (pts.length < 3) return
    // Newell normal: robust for slightly non-planar quads
    const n = _n.set(0, 0, 0)
    const w: Vector3[] = pts.map((p) => new Vector3(...p).applyMatrix4(this.M))
    for (let i = 0; i < w.length; i++) {
      const p = w[i], q = w[(i + 1) % w.length]
      n.x += (p.y - q.y) * (p.z + q.z)
      n.y += (p.z - q.z) * (p.x + q.x)
      n.z += (p.x - q.x) * (p.y + q.y)
    }
    if (n.lengthSq() < 1e-14) return
    n.normalize()
    const s = this.slot(slot)
    const base = s.position.length / 3
    for (const p of w) {
      s.position.push(p.x, p.y, p.z)
      s.normal.push(n.x, n.y, n.z)
      s.shade.push(this.shadeValue)
    }
    for (let i = 1; i < w.length - 1; i++) s.index.push(base, base + i, base + i + 1)
    this.triangles += w.length - 2
  }

  /** A quad strip / grid with per-vertex normals (module frame): rows x cols, quads between. */
  grid(slot: string, rows: Vec3[][], normals: Vec3[][], closeCols = false): void {
    const s = this.slot(slot)
    const base = s.position.length / 3
    const R = rows.length
    const C = rows[0].length
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const p = _a.set(...rows[r][c]).applyMatrix4(this.M)
        const n = _n.set(...normals[r][c]).applyMatrix4(this.N).normalize()
        s.position.push(p.x, p.y, p.z)
        s.normal.push(n.x, n.y, n.z)
        s.shade.push(this.shadeValue)
      }
    }
    const cols = closeCols ? C : C - 1
    for (let r = 0; r < R - 1; r++) {
      for (let c = 0; c < cols; c++) {
        const c2 = (c + 1) % C
        const i0 = base + r * C + c, i1 = base + r * C + c2, i2 = base + (r + 1) * C + c2, i3 = base + (r + 1) * C + c
        s.index.push(i0, i1, i2, i0, i2, i3)
        this.triangles += 2
      }
    }
  }

  get triangleCount(): number {
    return this.triangles
  }

  /** One geometry per non-empty slot and bucket. */
  build(): SlotGeometry[] {
    const out: SlotGeometry[] = []
    for (const [key, s] of this.slots) {
      const [slot, bucket] = key.split('|')
      if (!s.index.length) continue
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(new Float32Array(s.position), 3))
      g.setAttribute('normal', new BufferAttribute(new Float32Array(s.normal), 3))
      g.setAttribute('shade', new BufferAttribute(new Float32Array(s.shade), 1))
      const n = s.position.length / 3
      g.setIndex(new BufferAttribute(n > 65535 ? new Uint32Array(s.index) : new Uint16Array(s.index), 1))
      g.computeBoundingSphere()
      g.computeBoundingBox()
      out.push({ slot, bucket, geometry: g })
    }
    return out
  }
}

const _a = new Vector3()
const _n = new Vector3()

// ------------------------------------------------------------------ 2D helpers

export type Vec2 = [number, number]

export function polyArea(p: Vec2[]): number {
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length]
    s += x0 * y1 - x1 * y0
  }
  return s / 2
}

export function ccw(p: Vec2[]): Vec2[] {
  return polyArea(p) >= 0 ? p.slice() : p.slice().reverse()
}

/** Offset a CCW polygon outward by d (negative insets), mitred. */
export function offsetPoly(p: Vec2[], d: number): Vec2[] {
  const n = p.length
  const out: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const a = p[(i + n - 1) % n], b = p[i], c = p[(i + 1) % n]
    const e0x = b[0] - a[0], e0y = b[1] - a[1]
    const e1x = c[0] - b[0], e1y = c[1] - b[1]
    const l0 = Math.hypot(e0x, e0y) || 1, l1 = Math.hypot(e1x, e1y) || 1
    const n0x = e0y / l0, n0y = -e0x / l0
    const n1x = e1y / l1, n1y = -e1x / l1
    let mx = n0x + n1x, my = n0y + n1y
    const ml = Math.hypot(mx, my)
    if (ml < 1e-9) { mx = n0x; my = n0y } else { mx /= ml; my /= ml }
    const k = 1 / Math.max(0.3, mx * n0x + my * n0y)
    out.push([b[0] + mx * d * k, b[1] + my * d * k])
  }
  return out
}

export function chamferRect(w: number, h: number, c: number, cx = 0, cy = 0): Vec2[] {
  const hw = w / 2, hh = h / 2
  c = Math.min(c, hw * 0.9, hh * 0.9)
  return [[cx + hw, cy + hh - c], [cx + hw - c, cy + hh], [cx - hw + c, cy + hh], [cx - hw, cy + hh - c],
    [cx - hw, cy - hh + c], [cx - hw + c, cy - hh], [cx + hw - c, cy - hh], [cx + hw, cy - hh + c]]
}

export function rect(w: number, h: number, cx = 0, cy = 0): Vec2[] {
  return [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]]
}

// ------------------------------------------------------------------ builders

/**
 * A prism from a CCW (x, z) footprint between heights y0 and y1, its top
 * edge chamfered by `bevel` (the base sits in or on the sand: no bevel).
 * Flat faces: the chamfer strip catches the light as a machined edge does.
 */
export function prismY(w: MeshWriter, slot: string, footprint: Vec2[], y0: number, y1: number, bevel = 0, bottom = false): void {
  const p = ccw(footprint)
  const n = p.length
  const top = bevel > 0 ? offsetPoly(p, -bevel) : p
  const yb = y1 - bevel
  // footprint (x, z) is CCW seen from +y when z is flipped: (x, z) plane viewed from above has z down-screen
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const [ax, az] = p[i], [bx, bz] = p[j]
    w.poly(slot, [[ax, y0, az], [ax, yb, az], [bx, yb, bz], [bx, y0, bz]])
    if (bevel > 0) {
      const [cx, cz] = top[i], [dx, dz] = top[j]
      w.poly(slot, [[ax, yb, az], [cx, y1, cz], [dx, y1, dz], [bx, yb, bz]])
    }
  }
  w.poly(slot, top.map(([x, z]) => [x, y1, z] as Vec3).reverse())
  if (bottom) w.poly(slot, p.map(([x, z]) => [x, y0, z] as Vec3))
}

/** A box with every edge chamfered (x0..x1, y0..y1, z0..z1). */
export function chamferBox(w: MeshWriter, slot: string, min: Vec3, max: Vec3, c: number): void {
  const [x0, y0, z0] = min, [x1, y1, z1] = max
  c = Math.min(c, (x1 - x0) * 0.45, (y1 - y0) * 0.45, (z1 - z0) * 0.45)
  // a box whose corners are cut: 26 faces (6 main, 12 edge strips, 8 corner triangles)
  const X = [x0, x0 + c, x1 - c, x1], Y = [y0, y0 + c, y1 - c, y1], Z = [z0, z0 + c, z1 - c, z1]
  const v = (i: number, j: number, k: number): Vec3 => [X[i], Y[j], Z[k]]
  // main faces
  w.poly(slot, [v(3, 1, 1), v(3, 2, 1), v(3, 2, 2), v(3, 1, 2)]) // +x
  w.poly(slot, [v(0, 1, 2), v(0, 2, 2), v(0, 2, 1), v(0, 1, 1)]) // -x
  w.poly(slot, [v(1, 3, 1), v(1, 3, 2), v(2, 3, 2), v(2, 3, 1)]) // +y
  w.poly(slot, [v(1, 0, 2), v(1, 0, 1), v(2, 0, 1), v(2, 0, 2)]) // -y
  w.poly(slot, [v(1, 1, 3), v(2, 1, 3), v(2, 2, 3), v(1, 2, 3)]) // +z
  w.poly(slot, [v(2, 1, 0), v(1, 1, 0), v(1, 2, 0), v(2, 2, 0)]) // -z
  // edge strips
  w.poly(slot, [v(2, 3, 1), v(2, 3, 2), v(3, 2, 2), v(3, 2, 1)]) // +x+y
  w.poly(slot, [v(0, 2, 1), v(0, 2, 2), v(1, 3, 2), v(1, 3, 1)]) // -x+y
  w.poly(slot, [v(3, 1, 1), v(3, 1, 2), v(2, 0, 2), v(2, 0, 1)]) // +x-y
  w.poly(slot, [v(1, 0, 1), v(1, 0, 2), v(0, 1, 2), v(0, 1, 1)]) // -x-y
  w.poly(slot, [v(1, 2, 3), v(2, 2, 3), v(2, 3, 2), v(1, 3, 2)]) // +y+z
  w.poly(slot, [v(1, 3, 1), v(2, 3, 1), v(2, 2, 0), v(1, 2, 0)]) // +y-z
  w.poly(slot, [v(1, 0, 2), v(2, 0, 2), v(2, 1, 3), v(1, 1, 3)]) // -y+z
  w.poly(slot, [v(1, 1, 0), v(2, 1, 0), v(2, 0, 1), v(1, 0, 1)]) // -y-z
  w.poly(slot, [v(3, 1, 2), v(3, 2, 2), v(2, 2, 3), v(2, 1, 3)]) // +x+z
  w.poly(slot, [v(1, 1, 3), v(1, 2, 3), v(0, 2, 2), v(0, 1, 2)]) // -x+z
  w.poly(slot, [v(2, 1, 0), v(2, 2, 0), v(3, 2, 1), v(3, 1, 1)]) // +x-z
  w.poly(slot, [v(0, 1, 1), v(0, 2, 1), v(1, 2, 0), v(1, 1, 0)]) // -x-z
  // corners
  w.poly(slot, [v(3, 2, 2), v(2, 3, 2), v(2, 2, 3)])
  w.poly(slot, [v(0, 2, 2), v(1, 2, 3), v(1, 3, 2)])
  w.poly(slot, [v(3, 2, 1), v(2, 2, 0), v(2, 3, 1)])
  w.poly(slot, [v(0, 2, 1), v(1, 3, 1), v(1, 2, 0)])
  w.poly(slot, [v(3, 1, 2), v(2, 1, 3), v(2, 0, 2)])
  w.poly(slot, [v(0, 1, 2), v(1, 0, 2), v(1, 1, 3)])
  w.poly(slot, [v(3, 1, 1), v(2, 0, 1), v(2, 1, 0)])
  w.poly(slot, [v(0, 1, 1), v(1, 1, 0), v(1, 0, 1)])
}

/**
 * An extrusion of a CCW (u, v) profile along local x from x0 to x1: the
 * profile's u runs along z, v along y. End caps flat. For slabs, rails and
 * section-profiled members (a T-wall's cross section).
 */
export function extrudeX(w: MeshWriter, slot: string, profile: Vec2[], x0: number, x1: number, caps = true): void {
  const p = ccw(profile)
  const n = p.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const [au, av] = p[i], [bu, bv] = p[j]
    w.poly(slot, [[x0, av, au], [x1, av, au], [x1, bv, bu], [x0, bv, bu]])
  }
  if (caps) {
    // (u, v) maps to (z, y): a CCW profile faces -x as listed
    w.poly(slot, p.map(([u, v]) => [x1, v, u] as Vec3).reverse())
    w.poly(slot, p.map(([u, v]) => [x0, v, u] as Vec3))
  }
}

/** A cylinder along local y from y0 to y1 with smooth sides and chamfered, flat caps. */
export function cylinderY(w: MeshWriter, slot: string, r: number, y0: number, y1: number, seg = 16, chamfer = 0, caps: [boolean, boolean] = [true, true]): void {
  const c = Math.min(chamfer, r * 0.4, (y1 - y0) * 0.4)
  const ring = (rad: number, y: number): Vec3[] => Array.from({ length: seg + 1 }, (_, k) => {
    const a = (k / seg) * Math.PI * 2
    return [Math.cos(a) * rad, y, -Math.sin(a) * rad] as Vec3
  })
  const nrm = (ny: number): Vec3[] => Array.from({ length: seg + 1 }, (_, k) => {
    const a = (k / seg) * Math.PI * 2
    const s = Math.sqrt(1 - ny * ny)
    return [Math.cos(a) * s, ny, -Math.sin(a) * s] as Vec3
  })
  w.grid(slot, [ring(r, y0 + c), ring(r, y1 - c)], [nrm(0), nrm(0)])
  if (c > 0) {
    if (caps[1]) w.grid(slot, [ring(r, y1 - c), ring(r - c, y1)], [nrm(0.707), nrm(0.707)])
    if (caps[0]) w.grid(slot, [ring(r - c, y0), ring(r, y0 + c)], [nrm(-0.707), nrm(-0.707)])
  }
  if (caps[1]) w.poly(slot, ring(r - c, y1).slice(0, seg))
  if (caps[0]) w.poly(slot, ring(r - c, y0).slice(0, seg).reverse())
}

/**
 * A surface of revolution about local y: `profile` is (radius, y) from bottom
 * to top, `normals` the profile's (radial, y) normals (smooth rows). Radius
 * 0 closes a pole.
 */
export function revolveY(w: MeshWriter, slot: string, profile: Vec2[], normals: Vec2[], seg = 16): void {
  const rows: Vec3[][] = []
  const nrm: Vec3[][] = []
  for (let i = 0; i < profile.length; i++) {
    const [r, y] = profile[i]
    const [nr, ny] = normals[i]
    const l = Math.hypot(nr, ny) || 1
    rows.push(Array.from({ length: seg + 1 }, (_, k) => {
      const a = (k / seg) * Math.PI * 2
      return [Math.cos(a) * r, y, -Math.sin(a) * r] as Vec3
    }))
    nrm.push(Array.from({ length: seg + 1 }, (_, k) => {
      const a = (k / seg) * Math.PI * 2
      return [(Math.cos(a) * nr) / l, ny / l, (-Math.sin(a) * nr) / l] as Vec3
    }))
  }
  w.grid(slot, rows, nrm)
}

/** A tube through `points` (a polyline: a cable, a coil), radius r, `sides` round; its ends open. */
export function tube(w: MeshWriter, slot: string, points: Vec3[], r: number, sides = 4): void {
  if (points.length < 2) return
  const rows: Vec3[][] = []
  const nrm: Vec3[][] = []
  const P = points.map((p) => new Vector3(...p))
  // parallel-transported frame along the polyline: no twisting flips
  const t0 = P[1].clone().sub(P[0]).normalize()
  let n = Math.abs(t0.y) < 0.9 ? new Vector3(0, 1, 0).cross(t0).normalize() : new Vector3(1, 0, 0).cross(t0).normalize()
  let prevT = t0
  for (let i = 0; i < P.length; i++) {
    const t = (i < P.length - 1 ? P[i + 1].clone().sub(P[i]) : P[i].clone().sub(P[i - 1])).normalize()
    const axis = prevT.clone().cross(t)
    const s = axis.length()
    if (s > 1e-6) n = n.applyAxisAngle(axis.normalize(), Math.asin(Math.min(1, s)))
    prevT = t
    const b = t.clone().cross(n).normalize()
    const row: Vec3[] = []
    const nr: Vec3[] = []
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2
      const d = n.clone().multiplyScalar(Math.cos(a)).addScaledVector(b, Math.sin(a))
      row.push([P[i].x + d.x * r, P[i].y + d.y * r, P[i].z + d.z * r])
      nr.push([d.x, d.y, d.z])
    }
    rows.push(row)
    nrm.push(nr)
  }
  w.grid(slot, rows, nrm)
}

/** A straight tube (member) between two points, radius r: cylinderY placed along a - b. */
export function strut(w: MeshWriter, slot: string, a: Vec3, b: Vec3, r: number, seg = 8, base = new Matrix4()): void {
  const A = new Vector3(...a), B = new Vector3(...b)
  const d = B.clone().sub(A)
  const L = d.length()
  const y = d.normalize()
  const x = Math.abs(y.y) < 0.95 ? new Vector3(0, 1, 0).cross(y).normalize() : new Vector3(1, 0, 0)
  const z = x.clone().cross(y)
  const m = new Matrix4().makeBasis(x, y, z).setPosition(A)
  const saved = new Matrix4().copy(base)
  w.place(saved.clone().multiply(m))
  cylinderY(w, slot, r, 0, L, seg, 0)
  w.place(saved)
}
