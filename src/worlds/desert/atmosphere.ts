import { Color, Data3DTexture, DataTexture, DataUtils, HalfFloatType, LinearFilter, RGBAFormat, ClampToEdgeWrapping, Vector3, type Node } from 'three/webgpu'
import { Fn, acos, asin, cameraPosition, clamp, dot, float, length, normalize, output, positionWorld, sqrt, texture, texture3D, uniform, vec2, vec3, vec4 } from 'three/tsl'

/**
 * The desert's air: one scattering model (Rayleigh molecules and a dusty
 * Mie haze of warm, slightly absorbing grains, over a spherical planet) that
 * gives the sky, the sun's colour at the ground and the aerial perspective
 * of every surface, so the horizon, the haze over the dunes and the far
 * ridges agree by construction.
 *
 * The sun never moves, so everything is integrated once on the CPU at start
 * (a few tens of ms) into two small half-float tables:
 *
 * - sky: radiance by direction (azimuth from the sun, elevation);
 * - aerial perspective: inscattered light and transmittance along a view
 *   ray from the camera, by direction and distance.
 *
 * A surface's colour is then `L * T + S` with one 3D texture fetch (the
 * scene's fog node), and the sky one 2D fetch. Multiple scattering is an
 * isotropic term in proportion to the single scattering's source.
 *
 * Units: metres. The sun's irradiance at the top of the air is scaled so
 * that what reaches the ground has the game's sun intensity (`SUN_LUX`, the
 * directional light's intensity), so sky and sun keep their physical ratio.
 */

/** unit direction toward the sun (the shadows are cast along it) */
export const SUN_DIRECTION = new Vector3(-0.55, 0.42, -0.72).normalize()
/** the directional light's intensity: the sun's illuminance at the ground, in the renderer's units */
export const SUN_LUX = 3.4

const PLANET = 6360e3
const TOP = 6460e3
const RAYLEIGH = [5.802e-6, 13.558e-6, 33.1e-6]
const RAYLEIGH_HEIGHT = 8000
/** desert haze: dust scatters strongly forward and absorbs a little blue (warm grains) */
const DUST = 1.6e-4
const DUST_ALBEDO = [0.93, 0.9, 0.84]
const DUST_HEIGHT = 1300
const DUST_G = 0.78
/** multiple scattering: isotropic radiance per unit of single-scattering source */
const MULTIPLE = 1
/** the camera's height over the ground for the tables (m): it stays near the sand */
const EYE = 3
/** the sand's albedo (linear): the ground seen below the horizon and the bounce the environment bakes */
export const SAND_ALBEDO = [0.42, 0.33, 0.23]

const SKY_W = 128
const SKY_H = 64
const AP_AZIMUTH = 32
const AP_ELEVATION = 16
const AP_SLICES = 32
/** aerial perspective: farthest distance tabulated (m), and the elevations it spans (rad) */
const AP_FAR = 24000
const AP_ELEVATIONS: [number, number] = [-0.45, 0.75]

type RGB = [number, number, number]

const sunElevation = Math.asin(SUN_DIRECTION.y)

function density(h: number): [number, number] {
  return [Math.exp(-h / RAYLEIGH_HEIGHT), Math.exp(-Math.max(0, h) / DUST_HEIGHT)]
}

/** scattering (per channel) and extinction at altitude h */
function coefficients(h: number, scatterR: RGB, scatterM: RGB, extinction: RGB): void {
  const [r, m] = density(h)
  for (let c = 0; c < 3; c++) {
    scatterR[c] = RAYLEIGH[c] * r
    scatterM[c] = DUST * DUST_ALBEDO[c] * m
    extinction[c] = RAYLEIGH[c] * r + DUST * m
  }
}

/** Distance from radius `r` along elevation `sin` to the top of the air, and to the ground (Infinity when it clears it). */
function reach(r: number, sin: number): { top: number; ground: number } {
  const b = r * sin
  const top = -b + Math.sqrt(Math.max(0, b * b - (r * r - TOP * TOP)))
  const disc = b * b - (r * r - PLANET * PLANET)
  const ground = sin < 0 && disc >= 0 ? -b - Math.sqrt(disc) : Infinity
  return { top, ground }
}

// transmittance toward the sun by altitude (the sun is fixed): a table the marches read
const SUN_TABLE = 96
const SUN_TABLE_TOP = 40000
const sunTable = new Float32Array(SUN_TABLE * 3)
{
  const sR: RGB = [0, 0, 0], sM: RGB = [0, 0, 0], e: RGB = [0, 0, 0]
  for (let i = 0; i < SUN_TABLE; i++) {
    const h = (i / (SUN_TABLE - 1)) ** 2 * SUN_TABLE_TOP
    const r = PLANET + h
    const { top } = reach(r, Math.sin(sunElevation))
    const depth = [0, 0, 0]
    const steps = 80
    for (let k = 0; k < steps; k++) {
      const t = top * ((k + 0.5) / steps) ** 2
      const dt = top * (2 * (k + 0.5) / steps) / steps
      const hs = Math.sqrt(r * r + t * t + 2 * r * t * Math.sin(sunElevation)) - PLANET
      coefficients(hs, sR, sM, e)
      for (let c = 0; c < 3; c++) depth[c] += e[c] * dt
    }
    for (let c = 0; c < 3; c++) sunTable[i * 3 + c] = Math.exp(-depth[c])
  }
}

function sunTransmittance(h: number, out: RGB): RGB {
  const x = Math.sqrt(Math.min(1, Math.max(0, h / SUN_TABLE_TOP))) * (SUN_TABLE - 1)
  const i = Math.min(SUN_TABLE - 2, Math.floor(x)), f = x - i
  for (let c = 0; c < 3; c++) out[c] = sunTable[i * 3 + c] * (1 - f) + sunTable[(i + 1) * 3 + c] * f
  return out
}

const groundSun = sunTransmittance(EYE, [0, 0, 0])
const luminance = (c: ArrayLike<number>): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
/**
 * The sun's colour at the ground after white balance: a camera balanced for
 * daylight sees a low sun as a warm white, not the orange its raw spectrum
 * through 2.4 air masses would give. The balance applies to the whole model
 * (the sky is balanced with it), so the ratios between sun, sky and haze stay physical.
 */
const SUN_TINT: RGB = [1, 0.9, 0.75]
/** the sun's irradiance above the air, balanced and scaled so the ground receives SUN_LUX of luminance */
const SOLAR: RGB = SUN_TINT.map((v, c) => v * SUN_LUX / luminance(SUN_TINT) / groundSun[c]) as RGB

/** The sun at the ground: the directional light's colour (luminance 1; its intensity is SUN_LUX). */
export const SUN_COLOR = new Color(SOLAR[0] * groundSun[0] / SUN_LUX, SOLAR[1] * groundSun[1] / SUN_LUX, SOLAR[2] * groundSun[2] / SUN_LUX)

const rayleighPhase = (mu: number): number => 3 / (16 * Math.PI) * (1 + mu * mu)
function miePhase(mu: number): number {
  const g = DUST_G, g2 = g * g
  return 3 / (8 * Math.PI) * (1 - g2) * (1 + mu * mu) / ((2 + g2) * Math.pow(1 + g2 - 2 * g * mu, 1.5))
}

/**
 * March a view ray from the eye: `elevation` (rad), `azimuth` from the sun
 * (rad). Calls `record(t, inscatter, transmittance)` at each distance in
 * `marks` (ascending, m; Infinity: the end of the ray).
 */
function march(elevation: number, azimuth: number, marks: readonly number[], record: (k: number, inscatter: RGB, transmittance: RGB) => void, steps: number): void {
  const r0 = PLANET + EYE
  const sin = Math.sin(elevation)
  const mu = Math.cos(elevation) * Math.cos(sunElevation) * Math.cos(azimuth) + sin * Math.sin(sunElevation)
  const pR = rayleighPhase(mu), pM = miePhase(mu)
  const { top, ground } = reach(r0, sin)
  const end = Math.min(top, ground)
  const S: RGB = [0, 0, 0], T: RGB = [1, 1, 1]
  const sR: RGB = [0, 0, 0], sM: RGB = [0, 0, 0], e: RGB = [0, 0, 0], ts: RGB = [0, 0, 0]
  let t = 0
  let k = 0
  // one mark: steps crowd toward the eye (quadratically), where a near-horizontal ray is in the haze; several: even steps between them
  const crowd = marks.length === 1
  for (const mark of marks) {
    const to = Math.min(mark, end)
    const n = crowd ? steps : Math.max(2, Math.ceil(steps / marks.length))
    for (let i = 0; i < n; i++) {
      const a = crowd ? t + (to - t) * (i / n) ** 2 : t + (to - t) * (i / n)
      const b = crowd ? t + (to - t) * ((i + 1) / n) ** 2 : t + (to - t) * ((i + 1) / n)
      const dt = b - a
      const tm = (a + b) / 2
      const h = Math.sqrt(r0 * r0 + tm * tm + 2 * r0 * tm * sin) - PLANET
      coefficients(h, sR, sM, e)
      sunTransmittance(h, ts)
      for (let c = 0; c < 3; c++) {
        const step = Math.exp(-e[c] * dt)
        const source = SOLAR[c] * ts[c] * (sR[c] * pR + sM[c] * pM + MULTIPLE * (sR[c] + sM[c]) / (4 * Math.PI))
        // exact integral of a constant source over the step
        S[c] += T[c] * source * (1 - step) / Math.max(e[c], 1e-12)
        T[c] *= step
      }
    }
    t = to
    record(k++, S, T)
  }
}

function half(values: Float32Array): Uint16Array {
  const out = new Uint16Array(values.length)
  for (let i = 0; i < values.length; i++) out[i] = DataUtils.toHalfFloat(values[i])
  return out
}

// ---- the sky: radiance by (azimuth from the sun, elevation), the ground below the horizon
const skyData = new Float32Array(SKY_W * SKY_H * 4)
/** elevation of sky row v (0..1): rows crowd toward the horizon */
const skyElevation = (v: number): number => {
  const x = v * 2 - 1
  return Math.sign(x) * x * x * Math.PI / 2
}
/** irradiance on the ground from the sky above it (cosine-weighted) */
const skyIrradiance: RGB = [0, 0, 0]
{
  const rows: number[] = []
  for (let j = 0; j < SKY_H; j++) rows.push(skyElevation((j + 0.5) / SKY_H))
  for (let j = 0; j < SKY_H; j++) {
    for (let i = 0; i < SKY_W; i++) {
      const az = ((i + 0.5) / SKY_W) * Math.PI
      march(rows[j], az, [Infinity], (_, S) => skyData.set([S[0], S[1], S[2], 1], (j * SKY_W + i) * 4), 48)
    }
  }
  // sky irradiance on level ground: the upper rows, cosine-weighted, both halves of the azimuth
  for (let j = 0; j < SKY_H; j++) {
    const el = rows[j]
    if (el <= 0) continue
    const lo = skyElevation(j / SKY_H), hi = skyElevation((j + 1) / SKY_H)
    const band = 2 * Math.PI * (Math.sin(Math.max(0, hi)) ** 2 - Math.sin(Math.max(0, lo)) ** 2) / 2
    for (let c = 0; c < 3; c++) {
      let mean = 0
      for (let i = 0; i < SKY_W; i++) mean += skyData[(j * SKY_W + i) * 4 + c]
      skyIrradiance[c] += (mean / SKY_W) * band
    }
  }
  // below the horizon: the sand, lit by the sun and the sky, seen through the air in between
  const sun = SOLAR.map((v, c) => v * groundSun[c] * Math.sin(sunElevation)) as RGB
  for (let j = 0; j < SKY_H; j++) {
    const el = rows[j]
    if (el >= 0) continue
    for (let i = 0; i < SKY_W; i++) {
      const az = ((i + 0.5) / SKY_W) * Math.PI
      march(el, az, [Infinity], (_, S, T) => {
        const o = (j * SKY_W + i) * 4
        for (let c = 0; c < 3; c++) skyData[o + c] = S[c] + T[c] * SAND_ALBEDO[c] * (sun[c] + skyIrradiance[c]) / Math.PI
      }, 16)
    }
  }
}

/** Radiance of the sand in full sun and open sky (linear): the bounce the environment bakes from below. */
export const SAND_RADIANCE = new Color(...SAND_ALBEDO.map((a, c) => a * (SOLAR[c] * groundSun[c] * Math.sin(sunElevation) + skyIrradiance[c]) / Math.PI) as RGB)

// ---- aerial perspective: inscatter (rgb) and transmittance (a) by (azimuth, elevation, sqrt distance)
const apData = new Float32Array(AP_AZIMUTH * AP_ELEVATION * AP_SLICES * 4)
{
  const marks: number[] = []
  for (let s = 0; s < AP_SLICES; s++) marks.push(AP_FAR * ((s + 0.5) / AP_SLICES) ** 2)
  for (let j = 0; j < AP_ELEVATION; j++) {
    const el = AP_ELEVATIONS[0] + (AP_ELEVATIONS[1] - AP_ELEVATIONS[0]) * (j / (AP_ELEVATION - 1))
    for (let i = 0; i < AP_AZIMUTH; i++) {
      const az = (i / (AP_AZIMUTH - 1)) * Math.PI
      march(el, az, marks, (s, S, T) => {
        apData.set([S[0], S[1], S[2], luminance(T) / luminance([1, 1, 1])], ((s * AP_ELEVATION + j) * AP_AZIMUTH + i) * 4)
      }, 160)
    }
  }
}

function table2D(data: Float32Array, w: number, h: number): DataTexture {
  const t = new DataTexture(half(data), w, h, RGBAFormat, HalfFloatType)
  t.magFilter = t.minFilter = LinearFilter
  t.wrapS = t.wrapT = ClampToEdgeWrapping
  t.generateMipmaps = false
  t.needsUpdate = true
  return t
}

const skyTexture = table2D(skyData, SKY_W, SKY_H)
const apTexture = new Data3DTexture(half(apData), AP_AZIMUTH, AP_ELEVATION, AP_SLICES)
apTexture.format = RGBAFormat
apTexture.type = HalfFloatType
apTexture.magFilter = apTexture.minFilter = LinearFilter
apTexture.wrapS = apTexture.wrapT = apTexture.wrapR = ClampToEdgeWrapping
apTexture.generateMipmaps = false
apTexture.needsUpdate = true

const sunUniform = uniform(SUN_DIRECTION)
const sunAzimuth = vec2(SUN_DIRECTION.x, SUN_DIRECTION.z).normalize()

/** Azimuth from the sun (0..1 over 0..pi) of a unit direction. */
const azimuthFromSun = (dir: Node<'vec3'>): Node<'float'> => {
  const flat = dir.xz.div(length(dir.xz).max(1e-5))
  return acos(clamp(dot(flat, sunAzimuth), -1, 1)).div(Math.PI)
}

/** Sky radiance (linear, no sun disc) along a unit direction. */
export const skyRadiance = (dir: Node<'vec3'>): Node<'vec3'> => {
  const el = asin(clamp(dir.y, -1, 1)).div(Math.PI / 2)
  // invert the row mapping: v = (1 + sign * sqrt|x|) / 2
  const v = float(0.5).add(el.sign().mul(sqrt(el.abs())).mul(0.5))
  return texture(skyTexture, vec2(azimuthFromSun(dir), v)).rgb
}

/** how nearly a unit direction looks into the sun (0..1) */
export const sunward = (dir: Node<'vec3'>): Node<'float'> => dot(dir, sunUniform).max(0)

const cell = (x: Node<'float'>, n: number): Node<'float'> => x.mul(n - 1).add(0.5).div(n)

/**
 * Aerial perspective from the camera to a world point: `rgb` the light the
 * air adds on the way, `a` the share of the surface's own light that gets through.
 */
export const aerial = (point: Node<'vec3'>): Node<'vec4'> => {
  const v = point.sub(cameraPosition)
  const d = length(v).max(1e-3)
  const dir = v.div(d)
  const u = cell(azimuthFromSun(dir), AP_AZIMUTH)
  const e = cell(clamp(asin(clamp(dir.y, -1, 1)).sub(AP_ELEVATIONS[0]).div(AP_ELEVATIONS[1] - AP_ELEVATIONS[0]), 0, 1), AP_ELEVATION)
  // slices sit at sqrt-spaced distances; before the first, the air adds nothing yet
  const w = sqrt(d.div(AP_FAR)).mul(AP_SLICES).sub(0.5).div(AP_SLICES - 1)
  const s = texture3D(apTexture, vec3(u, e, cell(clamp(w, 0, 1), AP_SLICES)))
  const near = clamp(d.div(AP_FAR * (0.5 / AP_SLICES) ** 2), 0, 1)
  return vec4(s.rgb.mul(near), s.a.oneMinus().mul(near).oneMinus())
}

/** The scene's fog node: every lit surface seen through the air (its own light dimmed, the air's added). */
export const aerialFog = (): Node<'vec4'> => Fn(() => {
  const air = aerial(positionWorld)
  return vec4(output.rgb.mul(air.a).add(air.rgb.mul(output.a)), output.a)
})() as Node<'vec4'>

/** Normalized direction from the camera to the shaded point. */
export const viewDirection = (): Node<'vec3'> => normalize(positionWorld.sub(cameraPosition))

/** Diagnostics: sky radiance at (azimuth from sun, elevation) rad, and aerial perspective at a distance, from the CPU tables. */
export function atmosphereProbe(azimuth: number, elevation: number, distance: number): { sky: number[]; inscatter: number[]; transmittance: number } {
  const i = Math.min(SKY_W - 1, Math.round(azimuth / Math.PI * SKY_W - 0.5))
  const x = elevation / (Math.PI / 2)
  const j = Math.min(SKY_H - 1, Math.max(0, Math.round((0.5 + Math.sign(x) * Math.sqrt(Math.abs(x)) * 0.5) * SKY_H - 0.5)))
  const sky = Array.from(skyData.slice((j * SKY_W + i) * 4, (j * SKY_W + i) * 4 + 3))
  const ai = Math.round(azimuth / Math.PI * (AP_AZIMUTH - 1))
  const aj = Math.round(Math.min(1, Math.max(0, (elevation - AP_ELEVATIONS[0]) / (AP_ELEVATIONS[1] - AP_ELEVATIONS[0]))) * (AP_ELEVATION - 1))
  const as = Math.min(AP_SLICES - 1, Math.max(0, Math.round(Math.sqrt(distance / AP_FAR) * AP_SLICES - 0.5)))
  const o = ((as * AP_ELEVATION + aj) * AP_AZIMUTH + ai) * 4
  return { sky, inscatter: Array.from(apData.slice(o, o + 3)), transmittance: apData[o + 3] }
}
