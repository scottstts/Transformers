import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardNodeMaterial, Uint16BufferAttribute } from 'three/webgpu'
import { color, dot, float, mix, normalFlat, normalViewGeometry, positionWorld, smoothstep } from 'three/tsl'
import { N } from '../../rendering/noise.ts'
import { DUNE_WIND, valueNoise } from './terrain.ts'

/**
 * The land at the horizon: a sea of megadunes 1.8-3.6 km out, following the
 * camera (a traveller never reaches it). At that distance only the
 * silhouette, the sun's modelling of the slopes and the haze read, so that is
 * all it carries. Transverse draa lie across the same wind as the near dunes
 * (`DUNE_WIND`): a long gentle stoss, a sharp brink and a slip face at about
 * the angle of repose, with flat corridors between them. Their crests are
 * bent by warped fbm and rise and fall along their length (peaks and
 * saddles), and smaller oblique dunes ride over them. Height grows with
 * distance, so the far ridges show over the near ones through more haze.
 *
 * The ring is cut into sectors so the half behind the camera is culled. Its
 * base lies under the terrain, whose swells hide where it begins.
 */
const INNER = 1800
const OUTER = 3600
const SEGMENTS = 1536
const SECTORS = 32
const ROWS = 48
const BASE = -30

/** draa spacing and the oblique dunes riding over them (m) */
const DRAA_WAVELENGTH = 900
const SECONDARY_WAVELENGTH = 250
/** how far the oblique set is turned from the draa (rad) */
const SECONDARY_TURN = 1.15
/** highest draa crest at the near and far edge of the ring (m) */
const DRAA_HEIGHT_NEAR = 70
const DRAA_HEIGHT_FAR = 150

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** cos and sin of the turn between octaves: no octave's lattice lines up with another's */
const TURN_C = Math.cos(0.83), TURN_S = Math.sin(0.83)

/** fbm of the landform's value noise (0..1), each octave turned and offset against the last */
function fbm(x: number, z: number, octaves: number): number {
  let sum = 0, amp = 0.5, total = 0
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x + o * 17.3, z - o * 9.1) * amp
    total += amp
    amp *= 0.5
    const tx = (x * TURN_C - z * TURN_S) * 2.03, tz = (x * TURN_S + z * TURN_C) * 2.03
    x = tx
    z = tz
  }
  return sum / total
}

/**
 * One dune across its wavelength (phase 0..1, running downwind):
 * a flat corridor, the stoss rising and rounding over toward the brink, then
 * the slip face falling straight and easing into an apron at its foot.
 */
const CORRIDOR = 0.12, BRINK = 0.67
function profile(phase: number): number {
  const t = phase - Math.floor(phase)
  if (t < CORRIDOR) return 0
  if (t < BRINK) {
    const x = (t - CORRIDOR) / (BRINK - CORRIDOR)
    return x * 0.55 + x * x * (3 - 2 * x) * 0.45
  }
  return (1 - (t - BRINK) / (1 - BRINK)) ** 1.15
}

const WIND_X = DUNE_WIND.x, WIND_Z = DUNE_WIND.z
const OBLIQUE_X = WIND_X * Math.cos(SECONDARY_TURN) - WIND_Z * Math.sin(SECONDARY_TURN)
const OBLIQUE_Z = WIND_X * Math.sin(SECONDARY_TURN) + WIND_Z * Math.cos(SECONDARY_TURN)

/** Height (m) over the base at a point `r` m from the ring's centre. */
export function duneHeight(x: number, z: number, r: number): number {
  // downwind and across the wind: the slip faces look downwind
  const along = x * WIND_X + z * WIND_Z
  const across = z * WIND_X - x * WIND_Z
  // sinuous crests: the phase (running downwind) is bent by fbm across the wind, slowly along it
  const bend = (fbm(across / 1600 + 3.1, along / 2600, 3) - 0.5) * 900 + (fbm(across / 520, along / 900 + 7.7, 2) - 0.5) * 180
  const draa = profile((along + bend) / DRAA_WAVELENGTH)
  // crest height rises and falls along the horizon (saddles to peaks), and along each crest
  const range = smooth(0.28, 0.72, fbm(x / 2600 + 1.7, z / 2600 - 4.1, 2))
  const peaks = 0.65 + 0.35 * fbm(x / 700 - 6.2, z / 700 + 2.4, 2)
  const reach = DRAA_HEIGHT_NEAR + (DRAA_HEIGHT_FAR - DRAA_HEIGHT_NEAR) * smooth(INNER, OUTER, r)
  const tall = reach * (0.3 + 0.7 * range) * peaks
  // oblique dunes riding over the draa, strongest on their upper slopes
  const oblique = x * OBLIQUE_X + z * OBLIQUE_Z
  const obliqueBend = (fbm(x / 800 + 9.4, z / 800 - 1.3, 2) - 0.5) * 220
  const secondary = profile((oblique + obliqueBend) / SECONDARY_WAVELENGTH) * (0.4 + 0.6 * draa)
  const land = tall * draa + (6 + 0.16 * tall) * secondary
  // the near edge rises out of the plain
  return land * smooth(INNER, INNER + 380, r)
}

/** The whole ring's positions and normals (rows outward, columns round the ring, wrapping). */
function ringGrid(): { pos: Float32Array, normal: Float32Array } {
  const cols = SEGMENTS, rows = ROWS + 1
  const pos = new Float32Array(cols * rows * 3)
  for (let j = 0; j < rows; j++) {
    const r = INNER + (OUTER - INNER) * (j / ROWS) ** 1.35
    for (let i = 0; i < cols; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2
      const x = Math.cos(a) * r, z = Math.sin(a) * r
      const k = (j * cols + i) * 3
      pos[k] = x
      pos[k + 1] = BASE + duneHeight(x, z, r)
      pos[k + 2] = z
    }
  }
  // normals from the grid's neighbours: continuous across the sectors' seams
  const normal = new Float32Array(pos.length)
  for (let j = 0; j < rows; j++) {
    const j0 = Math.max(0, j - 1), j1 = Math.min(rows - 1, j + 1)
    for (let i = 0; i < cols; i++) {
      const i0 = (i + cols - 1) % cols, i1 = (i + 1) % cols
      const a0 = (j * cols + i0) * 3, a1 = (j * cols + i1) * 3
      const r0 = (j0 * cols + i) * 3, r1 = (j1 * cols + i) * 3
      const tx = pos[a1] - pos[a0], ty = pos[a1 + 1] - pos[a0 + 1], tz = pos[a1 + 2] - pos[a0 + 2]
      const sx = pos[r1] - pos[r0], sy = pos[r1 + 1] - pos[r0 + 1], sz = pos[r1 + 2] - pos[r0 + 2]
      // round the ring × outward points up
      let nx = ty * sz - tz * sy, ny = tz * sx - tx * sz, nz = tx * sy - ty * sx
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz }
      const l = Math.hypot(nx, ny, nz)
      const k = (j * cols + i) * 3
      normal[k] = nx / l
      normal[k + 1] = ny / l
      normal[k + 2] = nz / l
    }
  }
  return { pos, normal }
}

function sectorGeometry(grid: { pos: Float32Array, normal: Float32Array }, sector: number): BufferGeometry {
  const per = SEGMENTS / SECTORS
  const row = per + 1
  const pos = new Float32Array(row * (ROWS + 1) * 3)
  const normal = new Float32Array(pos.length)
  for (let j = 0; j <= ROWS; j++) {
    for (let i = 0; i <= per; i++) {
      const src = (j * SEGMENTS + ((sector * per + i) % SEGMENTS)) * 3
      const dst = (j * row + i) * 3
      for (let c = 0; c < 3; c++) {
        pos[dst + c] = grid.pos[src + c]
        normal[dst + c] = grid.normal[src + c]
      }
    }
  }
  const idx = new Uint16Array(ROWS * per * 6)
  let n = 0
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < per; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1
      // facing the camera at the centre (inward and up)
      idx[n++] = a; idx[n++] = b; idx[n++] = c
      idx[n++] = b; idx[n++] = d; idx[n++] = c
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(normal, 3))
  g.setIndex(new Uint16BufferAttribute(idx, 1))
  g.computeBoundingSphere()
  return g
}

/**
 * Dune sand: one warm tone with only broad, faint variation (the slopes'
 * shading carries the form), and the corridors' coarser, greyer floor.
 * The brinks are sharp: where the smooth normal turns far from the face's
 * own, the face's own takes over, so the sunlit stoss and the shaded slip
 * face meet along a line instead of a blur one vertex wide.
 */
function landformMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial()
  const p = positionWorld
  const broad = N(p.xz.mul(0.00035)).r
  const sand = mix(color(0xc29a72), color(0xd0ab84), smoothstep(0.3, 0.7, broad))
  const corridor = smoothstep(14, 3, p.y.sub(BASE))
  m.colorNode = mix(sand, color(0xa89078), corridor.mul(0.6))
  const crease = smoothstep(0.02, 0.12, float(1).sub(dot(normalViewGeometry, normalFlat)))
  m.normalNode = mix(normalViewGeometry, normalFlat, crease).normalize()
  m.roughnessNode = float(0.95)
  m.metalnessNode = float(0)
  return m
}

export function buildLandforms(): Group {
  const group = new Group()
  const material = landformMaterial()
  const grid = ringGrid()
  for (let s = 0; s < SECTORS; s++) group.add(new Mesh(sectorGeometry(grid, s), material))
  return group
}
