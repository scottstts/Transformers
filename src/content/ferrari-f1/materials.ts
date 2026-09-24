import { Color, MeshBasicNodeMaterial, MeshPhysicalNodeMaterial, MeshStandardNodeMaterial, type Material, type Node } from 'three/webgpu'
import { abs, color, float, floor, fract, fwidth, max, mix, normalLocal, positionLocal, smoothstep, step, uniform, vec2 } from 'three/tsl'
import { N } from '../../rendering/noise.ts'

/**
 * TSL materials for the Ferrari F1 transformer. Slot names are the contract
 * with the Blender build (blender/ferrari-f1_build/f1b/mats.py): every slot the
 * exporter writes has a material of the same key here.
 */

/** Emissive levels other modules animate. */
export const F1_LIGHTS = {
  /** rear rain light (the robot's heel lights) */
  rain: uniform(1.0),
  /** the robot's eyes */
  eyes: uniform(0.0),
  /** power-core glow */
  core: uniform(0.0),
}

type FloatNode = Node<'float'>

const tag = <M extends Material>(m: M, hex: number): M => ((m.userData.preview = hex), m)

/**
 * 2x2 twill of 3 mm tows seen along one projection: warp tows run along v
 * where (i - j) mod 4 < 2, weft tows along u elsewhere. Returns 0 / 1 per tow
 * with a soft ridge across each tow, faded to 0.5 once a tow is smaller than a
 * pixel (no moire at driving distance).
 */
function twill(u: FloatNode, v: FloatNode): FloatNode {
  const i = floor(u)
  const j = floor(v)
  const warp = step(2.0, fract(i.sub(j).div(4.0)).mul(4.0))
  const across = mix(fract(u), fract(v), warp)
  const ridge = float(1.0).sub(abs(across.sub(0.5)).mul(2.0)).pow(0.6)
  const tone = mix(float(0.25), float(0.85), warp).mul(ridge.mul(0.35).add(0.65))
  const footprint = max(fwidth(u), fwidth(v))
  return mix(tone, float(0.5), smoothstep(0.35, 0.9, footprint))
}

/** Twill weave on the part's dominant plane (cheap triplanar: three projections, sharpened weights). */
function weave(): FloatNode {
  const p = positionLocal.mul(330.0)
  const w = abs(normalLocal).pow(6.0)
  const sum = w.x.add(w.y).add(w.z)
  return twill(p.y, p.z).mul(w.x).add(twill(p.x, p.z).mul(w.y)).add(twill(p.x, p.y).mul(w.z)).div(sum)
}

/** Lacquered (or matte) visible carbon: the weave shifts tone and gloss tow by tow. */
function carbon(lacquered: boolean): Material {
  const t = weave()
  const smudge = N(positionLocal.xz.mul(0.37).add(positionLocal.y.mul(0.21))).g
  const m = new MeshPhysicalNodeMaterial()
  m.colorNode = mix(color(0x0c0d0f), color(0x25272b), t).mul(smudge.mul(0.2).add(0.9))
  m.metalnessNode = float(lacquered ? 0.3 : 0.2)
  m.roughnessNode = float(lacquered ? 0.34 : 0.58).sub(t.mul(0.12))
  if (lacquered) {
    m.clearcoat = 1
    m.clearcoatRoughness = 0.04
  }
  return tag(m, lacquered ? 0x131416 : 0x18191b)
}

/** Deep gloss race paint under clearcoat, with a faint low-frequency orange peel in the coat. */
function paint(hex: number): Material {
  const peel = N(positionLocal.xy.mul(3.3).add(positionLocal.z.mul(2.9))).b
  const m = new MeshPhysicalNodeMaterial()
  m.color = new Color(hex)
  m.metalness = 0
  m.roughnessNode = float(0.3).add(peel.mul(0.05))
  m.clearcoat = 1
  m.clearcoatRoughnessNode = float(0.025).add(peel.mul(0.03))
  return tag(m, hex)
}

/** Slick tyre rubber: scrubbed tread, darker sidewall grain. */
function rubber(): Material {
  const p = positionLocal
  const scrub = N(vec2(p.x.mul(1.7), p.y.add(p.z).mul(0.8))).r
  const m = new MeshStandardNodeMaterial()
  m.colorNode = mix(color(0x141415), color(0x232324), scrub.mul(scrub))
  m.metalness = 0
  m.roughnessNode = float(0.78).add(scrub.mul(0.14))
  return tag(m, 0x19191a)
}

/** Dark cast and machined structure of the robot: fine turning marks, satin sheen. */
function castAlloy(dark: number, light: number, metal: number, rough: number): Material {
  const p = positionLocal
  const grain = N(vec2(p.x.add(p.z).mul(7.0), p.y.mul(0.8))).g
  const m = new MeshStandardNodeMaterial()
  m.colorNode = mix(color(dark), color(light), grain)
  m.metalness = metal
  m.roughnessNode = float(rough).add(grain.mul(0.08))
  return tag(m, light)
}

function emissive(hex: number, intensity: number, level: FloatNode): Material {
  const m = new MeshBasicNodeMaterial()
  m.colorNode = color(hex).mul(level.mul(intensity))
  m.userData.emissive = true
  return tag(m, hex)
}

const std = (hex: number, metalness: number, roughness: number): Material =>
  tag(new MeshStandardNodeMaterial({ color: hex, metalness, roughness }), hex)

const coated = (hex: number, metalness: number, roughness: number): Material =>
  tag(new MeshPhysicalNodeMaterial({ color: hex, metalness, roughness, clearcoat: 1, clearcoatRoughness: 0.03 }), hex)

export function createF1Materials(): Record<string, Material> {
  const M: Record<string, Material> = {}
  M.paint = paint(0x8e0c18)
  M.paintWhite = paint(0xe8e8e4)
  M.carbon = carbon(true)
  M.carbonMatte = carbon(false)
  M.rubber = rubber()
  M.tyreMark = std(0xf0c21c, 0, 0.62)
  M.rim = castAlloy(0x16171a, 0x222428, 0.9, 0.32)
  M.brake = std(0x2d2926, 0.1, 0.72)
  M.titanium = castAlloy(0x7f8286, 0x969a9e, 1, 0.34)
  M.mirror = std(0xd8dde2, 1, 0.04)
  M.glass = tag(new MeshPhysicalNodeMaterial({ color: 0x0b0d10, metalness: 0, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03, ior: 1.52 }), 0x0b0d10)
  M.yellow = coated(0xffcc12, 0, 0.38)
  M.graphite = castAlloy(0x1d1f22, 0x2e3135, 0.8, 0.38)
  M.darkSteel = std(0x5a5f65, 1, 0.3)
  M.chrome = std(0xe0e3e6, 1, 0.08)
  M.mech = castAlloy(0x353940, 0x444950, 0.9, 0.38)
  M.interior = std(0x0d0d0e, 0, 0.88)
  M.gold = std(0xb88a3a, 1, 0.3)
  M.silver = std(0xd4d7dc, 0.85, 0.36)
  M.blackChrome = std(0x0b0c0e, 1, 0.14)
  M.lightRed = emissive(0xff1a14, 10, F1_LIGHTS.rain)
  M.eye = emissive(0x1f6fff, 4, F1_LIGHTS.eyes)
  M.visor = emissive(0xffe7b0, 14, F1_LIGHTS.eyes)
  M.core = emissive(0xffc860, 6, F1_LIGHTS.core)
  M.plastic = std(0x141516, 0, 0.6)
  return M
}
