import { DataTexture, FloatType, NearestFilter, RGBAFormat, type Node } from 'three/webgpu'
import { float, floor, int, ivec2, positionLocal, sin, smoothstep, sqrt, textureLoad, varying, vec2, vec3 } from 'three/tsl'
import type { Ground } from '../../game/ground'

/**
 * The desert's landform: one height field, evaluated by the CPU (the car's
 * wheels, the robot, the camera, effects) and by the GPU (the terrain mesh,
 * ground decals) from the same formula (`landform`), written once over an
 * arithmetic interface with a number and a TSL implementation, so the two
 * cannot drift apart.
 *
 * - Flat pads (the fortress and its car ring) are exactly level; the land
 *   eases in beyond them.
 * - Broad swells everywhere, gentle near the fortress, fuller further out.
 * - Transverse dunes across the wind in dune fields that come and go: a
 *   gentle windward (stoss) rise and a steep lee face, crests bent and broken
 *   by noise. A lee face drops away fast enough to throw a quick car into the air.
 * - Patches of whoops: long low bumps the suspension rides.
 *
 * The noise is value noise on a 256-cell periodic lattice. Each lattice texel
 * holds its cell's four corner values (one texture load per octave on the
 * GPU, one array read on the CPU).
 */

/** A level pad: exactly flat within `r0`, the land fully in by `r1` (m). */
export interface TerrainPad {
  x: number
  z: number
  r0: number
  r1: number
}

/** Wind (unit, world xz) the dunes lie across; the sand's ripples share it (materials.ts). */
export const DUNE_WIND = { x: 0.8, z: 0.6 }

const T = {
  /** swells: wavelengths (m) and heights (m, peak to peak of the noise's full range) */
  swell: [[560, 14], [210, 5]] as const,
  /** swell height near the pads, as a share of the full swell */
  swellNear: 0.35,
  /** dunes: wavelength (m), crest height (m), lee skew (0 symmetric; toward 1 a steeper lee) */
  duneWavelength: 140,
  duneHeight: 5,
  duneSkew: 0.6,
  /** dune field patches (m) and crest height variation along the crests (m) */
  duneField: 1100,
  duneCrest: 150,
  /** crest wander (wavelengths of warp, and the noise scale in m) */
  warp: [[480, 0.7], [160, 0.22]] as const,
  /** whoops: wavelength (m), height (m), patch scale (m) */
  bumps: [34, 0.8, 420] as const,
  /** where the wild land begins past a pad's r0 (m): starts, full */
  wild: [120, 520] as const,
}

/** Arithmetic the landform is written in: plain numbers on the CPU, TSL nodes on the GPU. */
interface Ops<V> {
  c(v: number): V
  add(a: V, b: V): V
  sub(a: V, b: V): V
  mul(a: V, b: V): V
  sin(a: V): V
  sqrt(a: V): V
  smoothstep(e0: number, e1: number, x: V): V
  /** value noise in 0..1 at lattice coordinates */
  noise(x: V, z: V): V
}

// Lattice: random corner values; texel (i, j) carries corners (i, j), (i+1, j), (i, j+1), (i+1, j+1).
const LATTICE = 256
const corners = new Float32Array(LATTICE * LATTICE * 4)
{
  const values = new Float32Array(LATTICE * LATTICE)
  let s = 0x9e3779b9 >>> 0
  for (let i = 0; i < values.length; i++) {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    values[i] = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const at = (i: number, j: number): number => values[(j & 255) * LATTICE + (i & 255)]
  for (let j = 0; j < LATTICE; j++) {
    for (let i = 0; i < LATTICE; i++) {
      const k = (j * LATTICE + i) * 4
      corners[k] = at(i, j)
      corners[k + 1] = at(i + 1, j)
      corners[k + 2] = at(i, j + 1)
      corners[k + 3] = at(i + 1, j + 1)
    }
  }
}

const quintic = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10)

const NUMBER: Ops<number> = {
  c: (v) => v,
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  mul: (a, b) => a * b,
  sin: Math.sin,
  sqrt: Math.sqrt,
  smoothstep: (e0, e1, x) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)
  },
  noise: (x, z) => {
    const fx = Math.floor(x), fz = Math.floor(z)
    const k = (((fz & 255) << 8) | (fx & 255)) << 2
    const a = corners[k], b = corners[k + 1], c = corners[k + 2], d = corners[k + 3]
    const u = quintic(x - fx), v = quintic(z - fz)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  },
}

let latticeTexture: DataTexture | null = null
function lattice(): DataTexture {
  if (!latticeTexture) {
    latticeTexture = new DataTexture(corners, LATTICE, LATTICE, RGBAFormat, FloatType)
    latticeTexture.magFilter = latticeTexture.minFilter = NearestFilter
    latticeTexture.generateMipmaps = false
    latticeTexture.needsUpdate = true
  }
  return latticeTexture
}

type N = Node<'float'>
const NODE: Ops<N> = {
  c: (v) => float(v),
  add: (a, b) => a.add(b),
  sub: (a, b) => a.sub(b),
  mul: (a, b) => a.mul(b),
  sin: (a) => sin(a),
  sqrt: (a) => sqrt(a),
  smoothstep: (e0, e1, x) => smoothstep(float(e0), float(e1), x),
  noise: (x, z) => {
    const cell = floor(vec2(x, z))
    const f = vec2(x, z).sub(cell)
    const u = f.mul(f).mul(f).mul(f.mul(f.mul(6).sub(15)).add(10))
    const q = textureLoad(lattice(), ivec2(int(cell.x).bitAnd(int(255)), int(cell.y).bitAnd(int(255))))
    return q.x.add(q.y.sub(q.x).mul(u.x)).add(q.z.sub(q.x).mul(u.y)).add(q.x.sub(q.y).sub(q.z).add(q.w).mul(u.x).mul(u.y)) as unknown as N
  },
}

/** The landform in any arithmetic: height (m) at world (x, z). */
function landform<V>(o: Ops<V>, x: V, z: V, pads: readonly TerrainPad[]): V {
  const n = (scale: number, ox: number, oz: number): V => o.noise(o.add(o.mul(x, o.c(1 / scale)), o.c(ox)), o.add(o.mul(z, o.c(1 / scale)), o.c(oz)))
  const centred = (v: V, height: number): V => o.mul(o.sub(v, o.c(0.5)), o.c(height))

  let pad = o.c(1)
  let wild = o.c(1)
  for (const p of pads) {
    const dx = o.sub(x, o.c(p.x)), dz = o.sub(z, o.c(p.z))
    const d = o.sqrt(o.add(o.mul(dx, dx), o.mul(dz, dz)))
    pad = o.mul(pad, o.smoothstep(p.r0, p.r1, d))
    wild = o.mul(wild, o.smoothstep(p.r0 + T.wild[0], p.r0 + T.wild[1], d))
  }

  // broad swells, gentler near the pads
  const swell = o.add(centred(n(T.swell[0][0], 17.3, 5.1), T.swell[0][1]), centred(n(T.swell[1][0], 3.7, 41.9), T.swell[1][1]))
  const swellScale = o.add(o.c(T.swellNear), o.mul(wild, o.c(1 - T.swellNear)))

  // transverse dunes: the phase runs against the wind, so the steep face is downwind (the lee)
  const field = o.smoothstep(0.38, 0.62, n(T.duneField, 91.1, 12.6))
  const crest = o.add(o.c(0.4), o.mul(n(T.duneCrest, 7.9, 66.2), o.c(0.6)))
  const amplitude = o.mul(o.mul(o.mul(wild, field), crest), o.c(T.duneHeight))
  const warp = o.add(centred(n(T.warp[0][0], 29.4, 3.3), T.warp[0][1]), centred(n(T.warp[1][0], 55.5, 80.8), T.warp[1][1]))
  const along = o.add(o.mul(x, o.c(DUNE_WIND.x)), o.mul(z, o.c(DUNE_WIND.z)))
  const theta = o.mul(o.add(o.mul(along, o.c(-1 / T.duneWavelength)), warp), o.c(Math.PI * 2))
  const profile = o.sin(o.add(theta, o.mul(o.sin(theta), o.c(T.duneSkew))))
  const dunes = o.mul(amplitude, o.mul(o.add(profile, o.c(1)), o.c(0.5)))

  // whoops, in patches
  const bumps = o.mul(centred(n(T.bumps[0], 71.2, 23.8), T.bumps[1]), o.smoothstep(0.55, 0.75, n(T.bumps[2], 44.4, 9.9)))

  return o.mul(pad, o.add(o.add(o.mul(swell, swellScale), dunes), bumps))
}

/**
 * A mesh laid on the ground (a tyre track, a footprint, a scorch mark): its
 * vertices are world xz at a small lift, raised onto the landform, and the
 * landform's slope under them for the shading (a varying).
 */
export interface GroundDecal {
  position: Node<'vec3'>
  slope: Node<'vec2'>
  /** the sky a point sees there (ambient occlusion by the scenery), when the world provides it */
  occlusion: Occlusion | null
}

/** Ambient occlusion by the world's scenery at a world position with a unit normal (0..1). */
export type Occlusion = (position: Node<'vec3'>, normal: Node<'vec3'>) => Node<'float'>

/** Finite-difference step (m) for slopes in shaders at the finest mesh spacing. */
const SLOPE_STEP = 0.5

export class DesertTerrain implements Ground {
  readonly pads: readonly TerrainPad[]
  /** the scenery's ambient occlusion over the ground (the fortress's), for the ground and what lies on it */
  occlusion: Occlusion | null = null

  constructor(pads: readonly TerrainPad[]) {
    this.pads = pads
  }

  height(x: number, z: number): number {
    return landform(NUMBER, x, z, this.pads)
  }

  /** Height (m) at a world xz node, for vertex shaders. */
  heightNode(xz: Node<'vec2'>): N {
    return landform(NODE, xz.x as unknown as N, xz.y as unknown as N, this.pads)
  }

  /** Vertex nodes for a decal mesh whose local frame is the world (see `GroundDecal`). */
  decal(): GroundDecal {
    const xz = positionLocal.xz
    const h: N = this.heightNode(xz).toVar()
    return { position: positionLocal.add(vec3(0, h, 0)), slope: varying(this.slopeNode(xz, h)), occlusion: this.occlusion }
  }

  /**
   * -gradient (the slope a height-field normal takes: n = (s.x, 1, s.y)) at a
   * world xz node: forward differences `step` m from `h0`, the height already
   * found there (two more evaluations).
   */
  slopeNode(xz: Node<'vec2'>, h0: N, step: N | number = SLOPE_STEP): Node<'vec2'> {
    const e = typeof step === 'number' ? float(step) : step
    const hx = this.heightNode(xz.add(vec2(e, 0))).sub(h0)
    const hz = this.heightNode(xz.add(vec2(0, e))).sub(h0)
    return vec2(hx, hz).div(e).negate()
  }
}

/** Value noise in 0..1 at lattice coordinates (the landform's own), for other scenery built on the CPU. */
export const valueNoise = NUMBER.noise
