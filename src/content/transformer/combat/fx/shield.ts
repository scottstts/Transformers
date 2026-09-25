import {
  AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, Matrix4, Mesh, MeshBasicNodeMaterial, Vector3, Vector4,
  type Node, type Object3D,
} from 'three/webgpu'
import {
  Fn, Loop, abs, attribute, dot, exp, float, frontFacing, fwidth, int, max, min, mix, normalLocal, normalize, positionView, positionWorld,
  sin, smoothstep, sqrt, transformNormalToView, uniform, uniformArray, varying, vec3,
} from 'three/tsl'

/** Impacts shown at once; a new one takes the oldest slot. */
const IMPACTS = 8
/** Ripple speed across the shell (rad/s of arc) and an impact's life (s). */
const RIPPLE_SPEED = 2.6
const IMPACT_LIFE = 1.2
/** Formation and collapse times (s). */
const FORM_TIME = 0.35
const DROP_TIME = 0.25
/** Geodesic frequency of the tiling: 10 f^2 + 2 tiles over the sphere (12 of them pentagons). */
const FREQUENCY = 8
/** Clearance kept between the robot's parts and the field (m). */
const MARGIN = 0.35

/**
 * The guard's energy shield: an ellipsoidal field of glowing hexagonal tiles
 * round the robot.
 *
 * The tiles are geometry, not a texture mapping: a Goldberg tiling (the dual
 * of a geodesic sphere), so every hexagon is about the same size everywhere,
 * with none of the pinching an angular mapping gives at the top. Each tile's
 * vertices carry its centre direction and seed, and an edge coordinate
 * (0 at the centre, 1 on its outline), so the shader draws crisp glowing
 * outlines and lights whole tiles at a time:
 *
 *   outline  thin glowing tile edges, brighter toward the silhouette
 *   idle     tiles almost empty, each breathing faintly at its own pace
 *   hit      the tiles round the blow flare white-hot; a ring of lit tiles
 *            races out across the field; the whole field pulses
 *   form     tiles pop in from the ground up with a flash (and out again)
 *
 * The ellipsoid is fitted every frame to the robot's own parts (mesh bounds in
 * its heading frame), so each robot is enclosed whole, whatever its size or
 * pose. One mesh, one additive draw, no depth write; the far side shows
 * through dimmer.
 */
export class Shield {
  readonly mesh: Mesh
  private readonly form = uniform(0)
  private readonly pulse = uniform(0)
  private readonly clock = uniform(0)
  private readonly impacts: Vector4[]
  private cursor = 0
  private time = 0
  private target = 0
  private level = 0
  private readonly anchor: Object3D
  private readonly parts: Mesh[] = []
  /** fitted radii (x across, y up, z along the heading) and the centre's height, eased */
  private readonly radii = new Vector3(2, 3, 2)
  private centerY = 1.5
  private fitted = false
  private yaw = 0

  /**
   * `anchor` is the body the field centres on (the pelvis); `root` holds the
   * meshes it must enclose; `color` is linear.
   */
  constructor(color: [number, number, number], anchor: Object3D, root: Object3D) {
    this.anchor = anchor
    root.traverse((o) => { if ((o as Mesh).isMesh) this.parts.push(o as Mesh) })
    this.impacts = Array.from({ length: IMPACTS }, () => new Vector4(0, 1, 0, 99))
    const impacts = uniformArray(this.impacts, 'vec4')
    const form = this.form
    const pulse = this.pulse
    const time = this.clock
    const tint = vec3(...color)
    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false })
    const cell = varying(attribute('cell', 'vec4'), 'vShieldCell')
    const edge = varying(attribute('edge', 'float'), 'vShieldEdge')
    m.colorNode = Fn(() => {
      const c = cell.xyz
      const seed = cell.w
      // outline: the tile's own edge coordinate, filtered by its screen footprint
      const fw = max(fwidth(edge), float(1e-4))
      const width = float(0.05)
      const outline = smoothstep(float(1).sub(width).sub(fw.mul(1.5)), float(1).sub(width), edge)
      // silhouette weight from the view: the outlines gather at the rim
      const n = normalize(transformNormalToView(normalLocal))
      const v = normalize(positionView.negate())
      const rim = float(1).sub(abs(dot(n, v))).pow(2.5)
      // each tile breathes at its own pace
      const breath = sin(time.mul(float(1.3).add(seed.mul(1.7))).add(seed.mul(40))).mul(0.5).add(0.5)
      // blows, per tile (the tile's centre decides): tiles near the point flare, a ring of tiles races out
      const core = float(0).toVar()
      const ring = float(0).toVar()
      Loop(int(IMPACTS), ({ i }) => {
        const k = impacts.element(i) as unknown as Node<'vec4'>
        const age = k.w
        const live = age.lessThan(IMPACT_LIFE).select(float(1), float(0))
        const ang = sqrt(max(float(0), float(2).sub(dot(c, k.xyz).mul(2))))
        core.addAssign(exp(ang.mul(ang).mul(-55)).mul(exp(age.mul(-5))).mul(live))
        const r = age.mul(RIPPLE_SPEED)
        ring.addAssign(exp(ang.sub(r).pow(2).mul(-90)).mul(exp(age.mul(-2.6))).mul(live))
      })
      // formation: tiles pop in from the ground up (and drop out top down), flashing as they arrive
      const at = c.y.mul(0.5).add(0.5).mul(0.8).add(seed.mul(0.2))
      const since = form.sub(at)
      const shown = smoothstep(0.0, 0.05, since)
      const arriving = exp(since.div(0.07).pow(2).negate()).mul(form.lessThan(1).select(float(1), float(0)))
      const fill = breath.pow(6).mul(0.05).add(0.01).add(ring.mul(0.7)).add(core.mul(2.6)).add(arriving.mul(0.5))
      // kept low enough that the tint survives the tone map: bright lines bloomed to white
      const lines = outline.mul(float(0.22).add(rim.mul(0.9)).add(ring.mul(1.6)).add(core.mul(2.4)).add(pulse.mul(0.35)).add(arriving.mul(1.4)))
      const glow = tint.mul(lines.add(fill.mul(float(1).sub(outline))))
      // the flaring tiles burn toward white
      const hot = min(float(1), core.mul(0.6))
      const light = mix(glow, vec3(1, 1, 1).mul(lines.add(fill).mul(0.8)), hot)
      const back = frontFacing.select(float(1), float(0.35))
      const above = smoothstep(0.0, 0.2, positionWorld.y)
      return light.mul(shown).mul(back).mul(above)
    })()
    this.mesh = new Mesh(goldberg(FREQUENCY), m)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 4
    this.mesh.visible = false
  }

  /** Form (true) or drop (false) the field. */
  set(on: boolean): void {
    this.target = on ? 1 : 0
    if (on && this.level === 0) this.fitted = false
  }

  get raised(): boolean {
    return this.target > 0 && this.level > 0.5
  }

  /** The field's horizontal radius at `height` m above the sand (0 while it is down). */
  reach(height: number): number {
    if (!this.raised) return 0
    const u = (height - this.centerY) / this.radii.y
    const k = Math.sqrt(Math.max(0, 1 - u * u))
    return Math.max(this.radii.x, this.radii.z) * k
  }

  /** A blow lands at `at` (world): its tiles flare and the ripple starts there. */
  hit(at: Vector3, strength: number): void {
    const d = this.toUnit(at, _d)
    const slot = this.impacts[this.cursor]
    this.cursor = (this.cursor + 1) % IMPACTS
    slot.set(d.x, d.y, d.z, 0)
    this.pulse.value = Math.min(1.5, this.pulse.value + 0.4 + strength * 0.5)
  }

  /** Where a blow coming from `from` meets the field (world). */
  surfacePoint(from: Vector3, out: Vector3): Vector3 {
    const d = this.toUnit(from, _d)
    d.y = Math.max(d.y, -0.2)
    d.normalize()
    return out.copy(d).multiply(this.radii).applyAxisAngle(_up, this.yaw).add(_c.set(this.mesh.position.x, this.centerY, this.mesh.position.z))
  }

  update(dt: number, yaw: number): void {
    this.time += dt
    this.clock.value = this.time
    const rate = this.target > this.level ? 1 / FORM_TIME : 1 / DROP_TIME
    this.level = this.target > this.level ? Math.min(1, this.level + dt * rate) : Math.max(0, this.level - dt * rate)
    this.form.value = this.level
    this.pulse.value = Math.max(0, this.pulse.value - dt * 2.5)
    for (const k of this.impacts) k.w += dt
    this.mesh.visible = this.level > 0
    if (!this.mesh.visible) return
    this.yaw = yaw
    this.fit(dt)
    const p = _c.setFromMatrixPosition(this.anchor.matrixWorld)
    this.mesh.position.set(p.x, this.centerY, p.z)
    this.mesh.rotation.set(0, yaw, 0)
    this.mesh.scale.copy(this.radii)
  }

  warm(on: boolean): void {
    this.mesh.visible = on || this.level > 0
    this.form.value = on ? 1 : this.level
  }

  /**
   * Fit the ellipsoid to the robot's parts: their bounds' corners in the
   * heading frame round the pelvis, the smallest ellipsoid of a fixed shape
   * (centred at 46 % of the height, its vertical radius 64 % of it) that holds
   * them, a margin out. Eased, so a swinging arm swells it smoothly.
   */
  private fit(dt: number): void {
    const p = _c.setFromMatrixPosition(this.anchor.matrixWorld)
    const cos = Math.cos(this.yaw), sin = Math.sin(this.yaw)
    let top = 0, wide = 0.5, deep = 0.5
    const pts = _pts
    let n = 0
    for (const mesh of this.parts) {
      if (!mesh.visible) continue
      const g = mesh.geometry
      if (!g.boundingBox) g.computeBoundingBox()
      const b = g.boundingBox!
      for (let i = 0; i < 8; i++) {
        _v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(mesh.matrixWorld)
        const dx = _v.x - p.x, dz = _v.z - p.z
        // heading frame: x across, z along the heading
        const x = dx * cos - dz * sin, z = dx * sin + dz * cos
        if (n < MAX_POINTS) { pts[n * 3] = x; pts[n * 3 + 1] = _v.y; pts[n * 3 + 2] = z; n++ }
        top = Math.max(top, _v.y)
        wide = Math.max(wide, Math.abs(x))
        deep = Math.max(deep, Math.abs(z))
      }
    }
    const c = top * 0.46, ay = Math.max(0.5, top * 0.64)
    let m = 0
    for (let i = 0; i < n; i++) {
      const x = pts[i * 3] / wide, y = (pts[i * 3 + 1] - c) / ay, z = pts[i * 3 + 2] / deep
      m = Math.max(m, x * x + y * y + z * z)
    }
    m = Math.sqrt(m)
    const k = this.fitted ? 1 - Math.exp(-dt * 6) : 1
    this.fitted = true
    this.radii.x += (wide * m + MARGIN - this.radii.x) * k
    this.radii.y += (ay * m + MARGIN - this.radii.y) * k
    this.radii.z += (deep * m + MARGIN - this.radii.z) * k
    this.centerY += (c - this.centerY) * k
  }

  /** A world point as a direction on the unit sphere the tiles are laid on. */
  private toUnit(at: Vector3, out: Vector3): Vector3 {
    this.mesh.updateMatrixWorld()
    return out.copy(at).applyMatrix4(_inv.copy(this.mesh.matrixWorld).invert()).normalize()
  }
}

const MAX_POINTS = 16384
const _pts = new Float32Array(MAX_POINTS * 3)
const _inv = new Matrix4()
const _c = new Vector3()
const _d = new Vector3()
const _v = new Vector3()
const _up = new Vector3(0, 1, 0)

/**
 * A Goldberg tiling of the unit sphere: the icosahedron's faces subdivided at
 * `f`, projected to the sphere; each vertex becomes a tile whose corners are
 * its surrounding triangles' centroids. Every tile is a fan from its centre
 * with `cell` (centre direction, seed) and `edge` (0 centre, 1 outline),
 * facing out. Tiles well below the equator are left out (the field stands on
 * the sand).
 */
export function goldberg(f: number): BufferGeometry {
  const t = (1 + Math.sqrt(5)) / 2
  const ico = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    .map(([x, y, z]) => new Vector3(x, y, z).normalize())
  const faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]]
  const verts: Vector3[] = []
  const key = new Map<string, number>()
  const vid = (p: Vector3): number => {
    const q = p.clone().normalize()
    // integer keys: toFixed would tell -0 from 0 and duplicate the vertices on the axes
    const k = `${Math.round(q.x * 1e5)},${Math.round(q.y * 1e5)},${Math.round(q.z * 1e5)}`
    let i = key.get(k)
    if (i === undefined) { i = verts.length; verts.push(q); key.set(k, i) }
    return i
  }
  const tris: Array<[number, number, number]> = []
  for (const [a, b, c] of faces) {
    const A = ico[a], B = ico[b], C = ico[c]
    const P = (i: number, j: number): number => vid(A.clone().addScaledVector(B.clone().sub(A), i / f).addScaledVector(C.clone().sub(A), j / f))
    for (let i = 0; i < f; i++) {
      for (let j = 0; j < f - i; j++) {
        tris.push([P(i, j), P(i + 1, j), P(i, j + 1)])
        if (j < f - i - 1) tris.push([P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)])
      }
    }
  }
  const around: number[][] = verts.map(() => [])
  tris.forEach((tri, k) => { for (const i of tri) around[i].push(k) })
  const centroid = tris.map(([a, b, c]) => verts[a].clone().add(verts[b]).add(verts[c]).normalize())
  const pos: number[] = []
  const cell: number[] = []
  const edge: number[] = []
  const nrm: number[] = []
  const idx: number[] = []
  let seedState = 7
  verts.forEach((v, i) => {
    if (v.y < -0.8) return
    // tangent basis with t1 x t2 = v: increasing angle runs counter-clockwise seen from outside
    const t1 = v.clone().cross(Math.abs(v.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)).normalize()
    const t2 = v.clone().cross(t1)
    const corners = around[i].map((k) => centroid[k]).sort((p, q) => Math.atan2(p.dot(t2), p.dot(t1)) - Math.atan2(q.dot(t2), q.dot(t1)))
    seedState = (seedState * 16807) % 2147483647
    const seed = seedState / 2147483647
    const base = pos.length / 3
    const push = (p: Vector3, e: number): void => {
      pos.push(p.x, p.y, p.z)
      nrm.push(p.x, p.y, p.z)
      cell.push(v.x, v.y, v.z, seed)
      edge.push(e)
    }
    push(v, 0)
    for (const c of corners) push(c, 1)
    for (let k = 0; k < corners.length; k++) idx.push(base, base + 1 + k, base + 1 + ((k + 1) % corners.length))
  })
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3))
  g.setAttribute('cell', new BufferAttribute(new Float32Array(cell), 4))
  g.setAttribute('edge', new BufferAttribute(new Float32Array(edge), 1))
  g.setIndex(idx)
  return g
}
