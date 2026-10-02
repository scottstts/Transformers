import { DataTexture, FloatType, HalfFloatType, LinearFilter, Matrix4, NearestFilter, RedFormat, StorageTexture, Vector3, type Mesh, type Node, type WebGPURenderer } from 'three/webgpu'
import { Fn, Loop, atan, clamp, cos, float, instanceIndex, int, ivec2, max, min, mix, sin, smoothstep, texture, textureLoad, textureStore, uniform, uvec2, vec2, vec3, vec4 } from 'three/tsl'
import type { CitadelFloor } from './floor'

/**
 * How much of the sky each point round the citadel sees: the ambient
 * occlusion of its walls, towers, halls and terraces, baked once.
 *
 * 1. The citadel's heights, top-down (the highest surface over every
 *    0.73 m cell), rasterized on the CPU from its meshes at start.
 * 2. One GPU compute pass: from every cell, at three heights over the
 *    floor under it (0.3, 2.5 and 7 m: the slices follow the tiers, read
 *    from the floor map), the horizon in 16 directions out to RADIUS, each
 *    occluder's elevation weighted down with its distance (obscurance: an
 *    alcove or an alley darkens, a hall across a court does not).
 *    From the horizons: the sky a level surface sees (cosine-weighted), and
 *    the sky a wall facing each direction sees, kept as its first Fourier
 *    terms over the azimuth (mean, cos and sin).
 *
 * A surface reads it out along its normal (clear of its own face), at its
 * height between the slices, and convolves the azimuth series with its
 * clamped cosine: directions behind the face weigh nothing, so an object
 * never darkens itself, only what stands in front of it does. (Four
 * world-axis quarters, each 180 degrees wide, let a curved or diagonal face
 * count its own body: every pillar and tower went dark up to the slices.)
 * Four texture fetches. It scales the ambient (sky and
 * bounce) light only; the sun's own shadows are the shadow maps'. Under a
 * roof (the cell's top above it) a level surface keeps a floor of light that
 * comes in from the open sides.
 *
 * What occludes the sky here is itself pale ceramic and paving, mostly in
 * sun: it hides the sky but sends its own light back. The visibility is
 * raised by the multi-bounce fit for such surroundings (BOUNCE_ALBEDO).
 * Taken as black, the occluders across every court left a dark band up the
 * shaded foot of each wall and pillar.
 */

const CELLS = 1536
/** heights of the slices over the ground (m); above the last the air is taken as open by 14 m */
const SLICES = [0.3, 2.5, 7]
const DIRECTIONS = 16
/** how far an occluder counts (m): its elevation is weighted by 1 - (distance / RADIUS)^2 */
const RADIUS = 16
/** first horizon sample (m) and the growth of each next one, out to RADIUS */
const FIRST = 0.6
const GROWTH = 1.45
const STEPS = Math.ceil(Math.log(RADIUS / FIRST) / Math.log(GROWTH))
/** the albedo of what a surface sees round it (the citadel's ceramic and paving), for the multi-bounce fit */
const BOUNCE_ALBEDO = 0.6
/** how far along its normal a surface looks up its visibility (m): across, clear of its own face; up, only to the first slice */
const OFFSET = [1.3, 0.3, 1.3] as const
/** least ambient a surface keeps (open sides under a roof, bounce off sunlit sand) */
const FLOOR = 0.3

export class SkyVisibility {
  /** world rectangle: its low corner (x, z) and size (m) */
  private readonly x0: number
  private readonly z0: number
  private readonly size: number
  private readonly heights: DataTexture
  private readonly top: Float32Array
  /** 2x2 atlas: per slice (mean, cos, sin, level) and the top height. One sampled texture binding. */
  private readonly visibility: StorageTexture
  /** 0 until baked: an unbaked map reads as open sky */
  private readonly baked = uniform(0)
  /** Diagnostic isolation without rebuilding materials. */
  readonly strength = uniform(1)
  private readonly floor: CitadelFloor

  constructor(meshes: readonly Mesh[], floor: CitadelFloor, centreX: number, centreZ: number, half: number) {
    this.floor = floor
    this.x0 = centreX - half
    this.z0 = centreZ - half
    this.size = half * 2
    this.top = this.rasterize(meshes)
    this.heights = new DataTexture(this.top, CELLS, CELLS, RedFormat, FloatType)
    this.heights.minFilter = this.heights.magFilter = NearestFilter
    this.heights.generateMipmaps = false
    this.heights.needsUpdate = true
    this.visibility = new StorageTexture(CELLS * 2, CELLS * 2)
    this.visibility.type = HalfFloatType
    this.visibility.minFilter = this.visibility.magFilter = LinearFilter
    this.visibility.generateMipmaps = false
  }

  /** The citadel's highest surface over a world point (m; 0 open ground, or outside the map). */
  topAt(x: number, z: number): number {
    const i = Math.floor(((x - this.x0) / this.size) * CELLS), j = Math.floor(((z - this.z0) / this.size) * CELLS)
    return i < 0 || j < 0 || i >= CELLS || j >= CELLS ? 0 : this.top[j * CELLS + i]
  }

  /** The highest surface over every cell, from the meshes' triangles in world space. */
  private rasterize(meshes: readonly Mesh[]): Float32Array {
    const h = new Float32Array(CELLS * CELLS)
    const cell = this.size / CELLS
    const m = new Matrix4()
    const a = new Vector3(), b = new Vector3(), c = new Vector3()
    for (const mesh of meshes) {
      mesh.updateWorldMatrix(true, false)
      m.copy(mesh.matrixWorld)
      const pos = mesh.geometry.getAttribute('position')
      const index = mesh.geometry.getIndex()
      const count = index ? index.count : pos.count
      for (let t = 0; t < count; t += 3) {
        const ia = index ? index.getX(t) : t, ib = index ? index.getX(t + 1) : t + 1, ic = index ? index.getX(t + 2) : t + 2
        a.fromBufferAttribute(pos, ia).applyMatrix4(m)
        b.fromBufferAttribute(pos, ib).applyMatrix4(m)
        c.fromBufferAttribute(pos, ic).applyMatrix4(m)
        const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - this.x0) / cell))
        const i1 = Math.min(CELLS - 1, Math.floor((Math.max(a.x, b.x, c.x) - this.x0) / cell))
        const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z, c.z) - this.z0) / cell))
        const j1 = Math.min(CELLS - 1, Math.floor((Math.max(a.z, b.z, c.z) - this.z0) / cell))
        if (i1 < i0 || j1 < j0) continue
        const top = Math.max(a.y, b.y, c.y)
        // A vertical/very thin projected triangle covers its edges, not its
        // bounding rectangle. Filling a diagonal wall's rectangle invented
        // solid masses across open courts and made rectangular AO stains.
        const area = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / 2
        if (area < cell * cell) {
          rasterEdge(h, CELLS, (a.x - this.x0) / cell, (a.z - this.z0) / cell, (b.x - this.x0) / cell, (b.z - this.z0) / cell, top)
          rasterEdge(h, CELLS, (b.x - this.x0) / cell, (b.z - this.z0) / cell, (c.x - this.x0) / cell, (c.z - this.z0) / cell, top)
          rasterEdge(h, CELLS, (c.x - this.x0) / cell, (c.z - this.z0) / cell, (a.x - this.x0) / cell, (a.z - this.z0) / cell, top)
          continue
        }
        // a broad one: its plane at every cell centre inside it
        const det = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z)
        for (let j = j0; j <= j1; j++) {
          const z = this.z0 + (j + 0.5) * cell
          for (let i = i0; i <= i1; i++) {
            const x = this.x0 + (i + 0.5) * cell
            const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / det
            const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / det
            if (u < -0.02 || v < -0.02 || u + v > 1.02) continue
            const y = u * a.y + v * b.y + (1 - u - v) * c.y
            if (y > h[j * CELLS + i]) h[j * CELLS + i] = y
          }
        }
      }
    }
    return h
  }

  /** Bake the visibility on the GPU (one compute pass, at start). */
  bake(renderer: WebGPURenderer): void {
    const cell = this.size / CELLS
    const kernel = Fn(() => {
      const i = int(instanceIndex.mod(CELLS))
      const j = int(instanceIndex.div(CELLS))
      const at = vec2(float(i).add(0.5), float(j).add(0.5)).mul(cell)
      const out = ivec2(i, j)
      // the slices stand over the floor under the cell
      const base = this.floor.node(at.add(vec2(this.x0, this.z0))).height
      SLICES.forEach((slice, s) => {
        const y = base.add(slice)
        const series = vec3(0).toVar()
        const up = float(0).toVar()
        Loop(DIRECTIONS, ({ i: k }) => {
          const angle = float(k).mul((2 * Math.PI) / DIRECTIONS)
          const dir = vec2(cos(angle), sin(angle))
          const horizon = float(0).toVar()
          const dist = float(FIRST).toVar()
          Loop(STEPS, () => {
            const q = at.add(dir.mul(dist)).div(cell)
            const texel = ivec2(clamp(q, vec2(0), vec2(CELLS - 1)))
            const h = textureLoad(this.heights, texel).r
            const near = float(1).sub(dist.div(RADIUS).pow(2)).max(0)
            horizon.assign(max(horizon, h.sub(y).div(dist).mul(near)))
            dist.mulAssign(GROWTH)
          })
          const theta = atan(horizon)
          // a level surface: the sky above the horizon, cosine-weighted; a wall facing this way: its share of the sky there
          up.addAssign(float(1).div(horizon.mul(horizon).add(1)))
          const wall = float(1).sub(theta.mul(2).add(sin(theta.mul(2))).div(Math.PI))
          series.addAssign(vec3(1, dir.x.mul(2), dir.y.mul(2)).mul(wall))
        })
        textureStore(this.visibility, uvec2(out).add(uvec2((s % 2) * CELLS, Math.floor(s / 2) * CELLS)), vec4(series.div(DIRECTIONS), up.div(DIRECTIONS)))
      })
      // the cell's top over its floor (a roof over a floor, or a solid mass)
      const top = textureLoad(this.heights, out).r.sub(base)
      textureStore(this.visibility, uvec2(out).add(uvec2(CELLS, CELLS)), vec4(top, 0, 0, 0))
    })().compute(CELLS * CELLS, [64])
    renderer.compute(kernel)
    this.baked.value = 1
  }

  /**
   * The sky a surface at world `position` with unit `normal` sees (0..1): its
   * ambient occlusion. 1 outside the citadel's rectangle, and before the bake.
   */
  node(position: Node<'vec3'>, normal: Node<'vec3'>): Node<'float'> {
    const p = position.add(normal.mul(vec3(...OFFSET)))
    const uv = p.xz.sub(vec2(this.x0, this.z0)).div(this.size)
    const inside = smoothstep(0, 0.02, min(min(uv.x, uv.y), min(float(1).sub(uv.x), float(1).sub(uv.y))))
    // Clamp to each tile's texel centres so bilinear filtering never crosses a slice boundary.
    const tileUv = clamp(uv, vec2(0.5 / CELLS), vec2(1 - 0.5 / CELLS))
    const sample = (x: number, y: number) => texture(this.visibility, tileUv.add(vec2(x, y)).mul(0.5))
    // the slice pair the height over the floor falls between
    const y = p.y.sub(this.floor.node(p.xz).height)
    const t01 = clamp(y.sub(SLICES[0]).div(SLICES[1] - SLICES[0]), 0, 1)
    const t12 = clamp(y.sub(SLICES[1]).div(SLICES[2] - SLICES[1]), 0, 1)
    const open = smoothstep(SLICES[2], 14, y)
    // (mean, cos, sin, level) at its height; open air above the slices
    const c = mix(mix(mix(sample(0, 0), sample(1, 0), t01), sample(0, 1), t12), vec4(1, 0, 0, 1), open)
    const n = normal
    const across = n.x.mul(n.x).add(n.z.mul(n.z))
    // the azimuth series convolved with the face's clamped cosine: mean + pi/4 (a cos + b sin)
    const facing = clamp(c.x.add(c.y.mul(n.x).add(c.z.mul(n.z)).div(across.sqrt().max(1e-4)).mul(Math.PI / 4)), 0, 1)
    // across, up and down shares sum to one for a unit normal; a downward face sees the mean round it
    let sky = across.mul(facing).add(max(n.y, 0).pow(2).mul(c.w)).add(max(n.y.negate(), 0).pow(2).mul(c.x))
    // under a roof a level surface sees only what comes in at the sides
    const roofed = smoothstep(0.2, 0.8, sample(1, 1).r.sub(y)).mul(max(n.y, 0).pow(2))
    sky = mix(sky, sky.min(c.x.mul(0.5)), roofed)
    const visibility = mix(float(1), max(multiBounce(sky), FLOOR), inside.mul(this.baked).mul(this.strength))
    return visibility as Node<'float'>
  }
}

/**
 * Visibility raised by the light its occluders send back (Jimenez et al.
 * 2016, the GTAO multi-bounce fit), for surroundings of BOUNCE_ALBEDO.
 */
export function multiBounce(visibility: Node<'float'>): Node<'float'> {
  const a = 2.0404 * BOUNCE_ALBEDO - 0.3324, b = -4.7951 * BOUNCE_ALBEDO + 0.6417, c = 2.7552 * BOUNCE_ALBEDO + 0.6903
  const v = visibility
  return max(v, v.mul(a).add(b).mul(v).add(c).mul(v)) as Node<'float'>
}

/** Supercover DDA in cell coordinates: visit only cells crossed by an edge. */
export function rasterEdge(heights: Float32Array, cells: number, ax: number, az: number, bx: number, bz: number, height: number): void {
  let i = Math.floor(ax), j = Math.floor(az)
  const endI = Math.floor(bx), endJ = Math.floor(bz)
  const dx = bx - ax, dz = bz - az, sx = Math.sign(dx), sz = Math.sign(dz)
  const stepX = dx === 0 ? Infinity : 1 / Math.abs(dx), stepZ = dz === 0 ? Infinity : 1 / Math.abs(dz)
  let nextX = dx === 0 ? Infinity : ((sx > 0 ? i + 1 : i) - ax) / dx
  let nextZ = dz === 0 ? Infinity : ((sz > 0 ? j + 1 : j) - az) / dz
  const write = (x: number, z: number): void => {
    if (x >= 0 && z >= 0 && x < cells && z < cells) {
      const at = z * cells + x
      heights[at] = Math.max(heights[at], height)
    }
  }
  write(i, j)
  for (let left = Math.abs(endI - i) + Math.abs(endJ - j) + 1; (i !== endI || j !== endJ) && left-- > 0;) {
    if (Math.abs(nextX - nextZ) < 1e-10) {
      write(i + sx, j); write(i, j + sz)
      i += sx; j += sz; nextX += stepX; nextZ += stepZ
    } else if (nextX < nextZ) { i += sx; nextX += stepX }
    else { j += sz; nextZ += stepZ }
    write(i, j)
  }
}
