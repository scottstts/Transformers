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
 *    from the floor map), the horizon in 16 directions out to ~36 m.
 *    From the horizons: the sky a level surface sees (cosine-weighted), and
 *    the sky a wall facing each of the four quarters sees (so a wall is not
 *    darkened by itself, only by what stands in front of it).
 *
 * A surface reads it 1 m out along its normal (clear of its own wall), at
 * its height between the slices, weighting the quarters and the level value
 * by its normal: three texture fetches. It scales the ambient (sky and
 * bounce) light only; the sun's own shadows are the shadow maps'. Under a
 * roof (the cell's top above it) a level surface keeps a floor of light that
 * comes in from the open sides.
 */

const CELLS = 1536
/** heights of the slices over the ground (m); above the last the air is taken as open by 14 m */
const SLICES = [0.3, 2.5, 7]
const DIRECTIONS = 16
const STEPS = 12
/** first horizon sample (m) and the growth of each next one (to ~36 m) */
const FIRST = 0.6
const GROWTH = 1.45
/** how far along its normal a surface looks up its visibility (m): across, clear of its own face; up, only to the first slice */
const OFFSET = [1, 0.3, 1] as const
/** least ambient a surface keeps (open sides under a roof, bounce off sunlit sand) */
const FLOOR = 0.3

export class SkyVisibility {
  /** world rectangle: its low corner (x, z) and size (m) */
  private readonly x0: number
  private readonly z0: number
  private readonly size: number
  private readonly heights: DataTexture
  private readonly top: Float32Array
  /** per slice: the quarters' visibility (+x, +z, -x, -z) */
  private readonly quarters: StorageTexture[]
  /** the level visibility at each slice (r, g, b) and the cell's top height (a) */
  private readonly level: StorageTexture
  /** 0 until baked: an unbaked map reads as open sky */
  private readonly baked = uniform(0)
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
    const target = (): StorageTexture => {
      const t = new StorageTexture(CELLS, CELLS)
      t.type = HalfFloatType
      t.minFilter = t.magFilter = LinearFilter
      t.generateMipmaps = false
      return t
    }
    this.quarters = SLICES.map(target)
    this.level = target()
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
        // a triangle within a couple of cells (or standing on edge: a wall) marks every cell it spans with its top
        const area = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / 2
        if ((i1 - i0 <= 1 && j1 - j0 <= 1) || area < cell * cell) {
          for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (top > h[j * CELLS + i]) h[j * CELLS + i] = top
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
      const levels: Node<'float'>[] = []
      SLICES.forEach((slice, s) => {
        const y = base.add(slice)
        const quarter = vec4(0).toVar()
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
            horizon.assign(max(horizon, h.sub(y).div(dist)))
            dist.mulAssign(GROWTH)
          })
          const theta = atan(horizon)
          // a level surface: the sky above the horizon, cosine-weighted; a wall facing this way: its share of the sky there
          up.addAssign(float(1).div(horizon.mul(horizon).add(1)))
          const wall = float(1).sub(theta.mul(2).add(sin(theta.mul(2))).div(Math.PI))
          quarter.addAssign(vec4(max(dir.x, 0), max(dir.y, 0), max(dir.x.negate(), 0), max(dir.y.negate(), 0)).mul(wall))
        })
        // each quarter's weights sum to 16 / pi over the circle
        textureStore(this.quarters[s], uvec2(out), quarter.mul(Math.PI / DIRECTIONS))
        levels.push(up.div(DIRECTIONS))
      })
      // the cell's top over its floor (a roof over a floor, or a solid mass)
      const top = textureLoad(this.heights, out).r.sub(base)
      textureStore(this.level, uvec2(out), vec4(levels[0], levels[1], levels[2], top))
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
    const level = texture(this.level, uv)
    // the slice pair the height over the floor falls between
    const y = p.y.sub(this.floor.node(p.xz).height)
    const t01 = clamp(y.sub(SLICES[0]).div(SLICES[1] - SLICES[0]), 0, 1)
    const t12 = clamp(y.sub(SLICES[1]).div(SLICES[2] - SLICES[1]), 0, 1)
    const low = mix(texture(this.quarters[0], uv), texture(this.quarters[1], uv), t01)
    const high = texture(this.quarters[2], uv)
    const open = smoothstep(SLICES[2], 14, y)
    const quarters = mix(mix(low, high, t12), vec4(1), open)
    const levelSky = mix(mix(mix(level.r, level.g, t01), level.b, t12), float(1), open)
    // the normal's share toward each quarter and up; a downward face sees what the quarters see
    const n = normal
    const wq = vec4(max(n.x, 0), max(n.z, 0), max(n.x.negate(), 0), max(n.z.negate(), 0)).pow(2)
    const wUp = max(n.y, 0).pow(2)
    const wDown = max(n.y.negate(), 0).pow(2)
    const side = quarters.x.add(quarters.y).add(quarters.z).add(quarters.w).mul(0.25)
    let sky = wq.dot(quarters).add(wUp.mul(levelSky)).add(wDown.mul(side)).div(wq.x.add(wq.y).add(wq.z).add(wq.w).add(wUp).add(wDown).max(1e-4))
    // under a roof a level surface sees only what comes in at the sides
    const roofed = smoothstep(0.2, 0.8, level.a.sub(y)).mul(wUp)
    sky = mix(sky, sky.min(side.mul(0.5)), roofed)
    const visibility = mix(float(1), max(sky, FLOOR), inside.mul(this.baked))
    return visibility as Node<'float'>
  }
}
