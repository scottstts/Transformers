import { DataTexture, FloatType, HalfFloatType, LinearFilter, NearestFilter, RedFormat, RGFormat, StorageTexture, type Mesh, type Node, type WebGPURenderer } from 'three/webgpu'
import { Fn, Loop, atan, clamp, cos, float, instanceIndex, int, ivec2, max, min, mix, select, sin, smoothstep, texture, textureLoad, textureStore, uniform, uvec2, vec2, vec3, vec4 } from 'three/tsl'
import type { CitadelFloor } from './floor'
import { groundLevels, rasterizeOccupancy } from './occupancy'

/**
 * How much of the sky each point round the citadel sees: the ambient
 * occlusion of its walls, towers, halls and terraces, baked once.
 *
 * 1. The citadel's occupancy, top-down, over every 0.73 m cell, rasterized
 *    on the CPU from its meshes at start (occupancy.ts): the top, and where
 *    the solid reaching it ends. A lintel is not a wall to the ground.
 * 2. One GPU compute pass: from every cell, at three heights over the
 *    ground under it (0.3, 2.5 and 7 m: the slices follow the tiers; the
 *    floor map, carried into the open ring of a cutout), the horizon in 16 directions out to RADIUS, each
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
  /** the ground the slices stand on per cell (groundLevels) */
  private readonly ground: DataTexture
  private readonly top: Float32Array
  /** 2x2 atlas: per slice (mean, cos, sin, level), and the top height and ground. One sampled texture binding. */
  private readonly visibility: StorageTexture
  /** 0 until baked: an unbaked map reads as open sky */
  private readonly baked = uniform(0)
  /** Diagnostic isolation without rebuilding materials. */
  readonly strength = uniform(1)

  constructor(meshes: readonly Mesh[], floor: CitadelFloor, centreX: number, centreZ: number, half: number) {
    this.x0 = centreX - half
    this.z0 = centreZ - half
    this.size = half * 2
    // the paving and deck are the floor map's (its heights below); their faces must not close the gap under a roof or lintel
    const occluders = meshes.filter((m) => !/:(paving|deck|light):/.test(m.name))
    const cell = this.size / CELLS
    const floorCells = new Float32Array(CELLS * CELLS)
    for (let j = 0; j < CELLS; j++) for (let i = 0; i < CELLS; i++) floorCells[j * CELLS + i] = floor.rasterHeight(this.x0 + (i + 0.5) * cell, this.z0 + (j + 0.5) * cell)
    const occupancy = rasterizeOccupancy(occluders, CELLS, this.x0, this.z0, this.size, floorCells)
    const { top, bottom } = occupancy
    this.ground = new DataTexture(groundLevels(floorCells, occupancy, CELLS), CELLS, CELLS, RedFormat, FloatType)
    this.ground.minFilter = this.ground.magFilter = NearestFilter
    this.ground.generateMipmaps = false
    this.ground.needsUpdate = true
    this.top = top
    const spans = new Float32Array(top.length * 2)
    for (let k = 0; k < top.length; k++) { spans[k * 2] = top[k]; spans[k * 2 + 1] = bottom[k] }
    this.heights = new DataTexture(spans, CELLS, CELLS, RGFormat, FloatType)
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

  /** Bake the visibility on the GPU (one compute pass, at start). */
  bake(renderer: WebGPURenderer): void {
    const cell = this.size / CELLS
    // `name` is supported by TSL at runtime but absent from r186's typings.
    const radialSteps = { start: 0, end: STEPS, name: 'radialStep' }
    const kernel = Fn(() => {
      const i = int(instanceIndex.mod(CELLS))
      const j = int(instanceIndex.div(CELLS))
      const at = vec2(float(i).add(0.5), float(j).add(0.5)).mul(cell)
      const out = ivec2(i, j)
      // the slices stand over the ground under the cell
      const base = textureLoad(this.ground, out).r
      SLICES.forEach((slice, s) => {
        const y = base.add(slice)
        const series = vec3(0).toVar()
        const up = float(0).toVar()
        // Nested TSL Loops each default to `i`; give them distinct shader
        // indices so radial steps cannot replace the azimuth in `dir`.
        Loop(DIRECTIONS, ({ i: azimuth }) => {
          const angle = float(azimuth).mul((2 * Math.PI) / DIRECTIONS)
          const dir = vec2(cos(angle), sin(angle))
          const horizon = float(0).toVar()
          const lower = float(1e6).toVar()
          const dist = float(FIRST).toVar()
          Loop(radialSteps, () => {
            const q = at.add(dir.mul(dist)).div(cell)
            const texel = ivec2(clamp(q, vec2(0), vec2(CELLS - 1)))
            const span = textureLoad(this.heights, texel)
            const h = span.r
            const near = float(1).sub(dist.div(RADIUS).pow(2)).max(0)
            horizon.assign(max(horizon, h.sub(y).div(dist).mul(near)))
            // Retain the open angles below an overhead span. Grounded
            // bodies have a zero lower horizon and keep the original AO.
            const low = max(span.g.sub(y), 0).div(dist)
            lower.assign(min(lower, select(h.greaterThan(y), low, float(1e6))))
            dist.mulAssign(GROWTH)
          })
          const theta = atan(horizon)
          const below = min(lower, horizon)
          const bottomTheta = atan(below)
          // a level surface: the sky above the horizon, cosine-weighted; a wall facing this way: its share of the sky there
          up.addAssign(float(1).div(horizon.mul(horizon).add(1)).add(below.mul(below).div(below.mul(below).add(1))))
          const wall = float(1).sub(theta.sub(bottomTheta).mul(2).add(sin(theta.mul(2)).sub(sin(bottomTheta.mul(2)))).div(Math.PI))
          series.addAssign(vec3(1, dir.x.mul(2), dir.y.mul(2)).mul(wall))
        })
        textureStore(this.visibility, uvec2(out).add(uvec2((s % 2) * CELLS, Math.floor(s / 2) * CELLS)), vec4(series.div(DIRECTIONS), up.div(DIRECTIONS)))
      })
      // the cell's top over its ground (a roof over a floor, or a solid mass), and the ground
      const top = textureLoad(this.heights, out).r.sub(base)
      textureStore(this.visibility, uvec2(out).add(uvec2(CELLS, CELLS)), vec4(top, base, 0, 0))
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
    // the cell's (top, ground), unfiltered: roof occupancy is discrete, and
    // filtering a tower's height with open ground invents a roof beyond its
    // footprint and darkens that edge
    const cell = textureLoad(this.visibility, ivec2(tileUv.mul(CELLS)).add(ivec2(CELLS, CELLS)))
    // the slice pair the height over the ground falls between
    const y = p.y.sub(cell.g)
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
    const roofed = smoothstep(0.2, 0.8, cell.r.sub(y)).mul(max(n.y, 0).pow(2))
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
