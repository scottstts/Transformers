import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardNodeMaterial, Uint16BufferAttribute } from 'three/webgpu'
import { color, float, mix, normalWorld, positionWorld, smoothstep, vec2 } from 'three/tsl'
import { N } from '../../rendering/noise.ts'
import { valueNoise } from './terrain.ts'

/**
 * The land at the horizon: low foothills 1.8-2.3 km out and eroded ranges
 * behind them to 3 km, following the camera (a traveller never reaches
 * them). At that distance only the silhouette, the sun's modelling of the
 * slopes and the haze read, so that is all they carry: broad masses from
 * warped fbm (octaves turned against each other, so no lattice shows), rough
 * crests from its finer octaves, heights varying
 * along the horizon from low saddles to high massifs, and alluvial fans
 * spreading from their feet. Their colour varies in broad patches, darker
 * where the rock stands steep, paler on the fans; no strata (regular bands
 * read as a pattern, not as rock).
 *
 * The ring is cut into sectors so the half behind the camera is culled. Its
 * base lies under the terrain, whose swells hide where it begins.
 */
const INNER = 1800
const OUTER = 3000
const SEGMENTS = 768
const SECTORS = 16
const ROWS = 36
const BASE = -30

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

/** Height (m) over the base at a point `r` m out. */
function height(x: number, z: number, r: number): number {
  // two levels of warp: no crest runs straight, no two masses repeat
  const qx = x + (fbm(x / 1700 + 5.3, z / 1700, 3) - 0.5) * 1400
  const qz = z + (fbm(x / 1700, z / 1700 - 2.9, 3) - 0.5) * 1400
  const wx = qx + (fbm(qx / 600 - 1.1, qz / 600 + 8.2, 2) - 0.5) * 320
  const wz = qz + (fbm(qx / 600 + 4.6, qz / 600 - 3.3, 2) - 0.5) * 320
  // how tall the land stands along the horizon: low saddles to high massifs
  const massif = smooth(0.3, 0.72, fbm(x / 3400 + 1.7, z / 3400 - 4.1, 2))
  // mountains where the broad field runs high, shouldered rather than peaked; a rough crest from the finer octaves
  const field = fbm(wx / 1150, wz / 1150, 5)
  const range = Math.pow(smooth(0.4, 0.8, field), 1.3) * (80 + 280 * massif)
  const hills = smooth(0.38, 0.78, fbm(wx / 520, wz / 520, 4)) * (22 + 60 * massif)
  // the range rises behind the foothills; the foothills rise from the plain
  const back = smooth(INNER + 300, INNER + 800, r)
  const front = smooth(INNER, INNER + 260, r)
  const land = Math.max(hills * front, range * back)
  // alluvial fans: the foot of every slope eases out into the plain
  return land * (0.35 + 0.65 * smooth(0, 60, land))
}

function sectorGeometry(sector: number): BufferGeometry {
  const per = SEGMENTS / SECTORS
  const pos: number[] = []
  for (let j = 0; j <= ROWS; j++) {
    const r = INNER + (OUTER - INNER) * (j / ROWS) ** 1.25
    for (let i = 0; i <= per; i++) {
      const a = ((sector * per + i) / SEGMENTS) * Math.PI * 2
      const x = Math.cos(a) * r, z = Math.sin(a) * r
      pos.push(x, BASE + height(x, z, r), z)
    }
  }
  const idx: number[] = []
  const row = per + 1
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < per; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1
      // facing the camera at the centre (inward and up)
      idx.push(a, b, c, b, d, c)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setIndex(new Uint16BufferAttribute(idx, 1))
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

/** Weathered desert rock in broad patches of tone, varnished dark where steep, pale on the fans and flats. */
function landformMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial()
  const p = positionWorld
  const up = normalWorld.y
  const patches = N(p.xz.mul(0.0011)).r
  const mottle = N(p.xz.mul(0.006).add(vec2(p.y.mul(0.004), 0))).g
  const rock = mix(mix(color(0x8c6a52), color(0xa58a6e), smoothstep(0.3, 0.7, patches)), color(0x7a6a5c), smoothstep(0.55, 0.8, mottle).mul(0.5))
  const varnish = smoothstep(0.8, 0.45, up).mul(0.45)
  const fan = smoothstep(0.82, 0.95, up)
  m.colorNode = mix(mix(rock, color(0x5a4636), varnish), color(0xb89b78), fan.mul(0.7))
  m.roughnessNode = float(0.95)
  m.metalnessNode = float(0)
  return m
}

export function buildLandforms(): Group {
  const group = new Group()
  const material = landformMaterial()
  for (let s = 0; s < SECTORS; s++) group.add(new Mesh(sectorGeometry(s), material))
  return group
}
