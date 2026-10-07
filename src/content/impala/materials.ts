import { Color, LinearSRGBColorSpace, MeshBasicNodeMaterial, MeshPhysicalNodeMaterial, MeshStandardNodeMaterial, type Material, type Node } from 'three/webgpu'
import { abs, color, float, fract, mix, positionLocal, smoothstep, uniform, vec2 } from 'three/tsl'
import { N } from '../../rendering/noise.ts'

/**
 * TSL materials for the Impala. Slot names are the contract with the Blender
 * build (blender/impala_build/kit.py `materials()`, robot_geometry.py, and
 * the cutlass's slots in cutlass.py): every slot the exporters write has a
 * material of the same key here, with the build's linear base colour,
 * metalness, roughness and coat.
 *
 * The glass is opaque, clear-coated and dark (as the windows read from
 * outside): a blended pane is reactive coverage to the temporal resolve
 * (rendering-and-boot.md), and a windscreen-sized one would shimmer; every
 * car's glass is drawn this way.
 */

/** Emissive levels other modules animate. */
export const IMPALA_LIGHTS = {
  /** the quad sealed-beam headlamps (the chest's in robot form) */
  head: uniform(1.0),
  /** the round tail lamps: brighter while braking */
  tail: uniform(1.0),
  /** the parking and marker lamps */
  marker: uniform(1.0),
  /** the robot's eyes, 0 dark .. 1 running, above 1 blazing */
  eyes: uniform(0.0),
}

type FloatNode = Node<'float'>

/** A Blender linear colour as a three colour. */
const linear = (r: number, g: number, b: number): Color => new Color().setRGB(r, g, b, LinearSRGBColorSpace)

const tag = <M extends Material>(m: M, c: Color): M => ((m.userData.preview = c.getHex()), m)

/** A plain slot: the build's colour, metalness and roughness. */
function plain(c: Color, metalness: number, roughness: number): Material {
  return tag(new MeshStandardNodeMaterial({ color: c, metalness, roughness }), c)
}

/** A coated slot (the build's Coat Weight): a clear coat over it. */
function coated(c: Color, metalness: number, roughness: number, coat: number, coatRoughness = 0.17): Material {
  return tag(new MeshPhysicalNodeMaterial({ color: c, metalness, roughness, clearcoat: coat, clearcoatRoughness: coatRoughness }), c)
}

/**
 * Tuxedo black lacquer: a faintly metallic black base under a thick, glossy
 * clear coat. The coat carries a little orange peel (its roughness wanders
 * at a few centimetres) and the base a faint low-frequency variation, so the
 * long panels hold their reflections like a polished car, not a mirror.
 */
function lacquer(): Material {
  const p = positionLocal
  const peel = N(p.xy.mul(9.3).add(p.z.mul(7.1))).r
  const sheen = N(p.xy.mul(0.6).add(p.z.mul(0.4))).g
  const base = linear(0.002, 0.006, 0.014)
  const m = new MeshPhysicalNodeMaterial()
  m.colorNode = color(base).mul(sheen.mul(0.16).add(0.92))
  m.metalness = 0.24
  m.roughnessNode = float(0.12).add(sheen.mul(0.04))
  m.clearcoat = 0.92
  m.clearcoatRoughnessNode = float(0.055).add(peel.mul(0.03))
  return tag(m, base)
}

/** Chrome plate: a near-mirror, with the faint wiping marks of a polished bumper. */
function chrome(): Material {
  const p = positionLocal
  const wipe = N(vec2(p.x.add(p.y).mul(2.1), p.z.mul(14))).b
  const c = linear(0.72, 0.76, 0.8)
  const m = new MeshStandardNodeMaterial()
  m.colorNode = color(c).mul(wipe.mul(0.05).add(0.97))
  m.metalness = 1
  m.roughnessNode = float(0.085).add(wipe.mul(0.025))
  return tag(m, c)
}

/** Cast and machined alloy: fine turning marks across it, a satin sheen. */
function alloy(c: Color, metalness: number, roughness: number, coat = 0): Material {
  const p = positionLocal
  const grain = N(vec2(p.x.add(p.z).mul(5.2), p.y.mul(0.7))).g
  const m = coat > 0 ? new MeshPhysicalNodeMaterial({ clearcoat: coat, clearcoatRoughness: 0.17 }) : new MeshStandardNodeMaterial()
  m.colorNode = color(c).mul(grain.mul(0.14).add(0.93))
  m.metalness = metalness
  m.roughnessNode = float(roughness).add(grain.mul(0.06))
  return tag(m, c)
}

/** Brushed bronze: fine brushing along one axis, a darker patina in the low spots. */
function bronze(): Material {
  const p = positionLocal
  const brush = N(vec2(p.z.mul(0.05), p.x.add(p.y).mul(4.4))).g
  const patina = N(p.xy.mul(1.4).add(p.z.mul(0.9))).b
  const c = linear(0.26, 0.17, 0.07)
  const m = new MeshStandardNodeMaterial()
  m.colorNode = color(c).mul(brush.mul(0.18).add(patina.mul(0.12)).add(0.86))
  m.metalness = 0.84
  m.roughnessNode = float(0.3).add(brush.mul(0.06)).add(patina.mul(0.05))
  return tag(m, c)
}

/** Bias-ply rubber: scrubbed tread, a darker, finer sidewall grain. */
function rubber(): Material {
  const p = positionLocal
  const scrub = N(vec2(p.x.mul(1.3), p.y.add(p.z).mul(0.8))).r
  const c = linear(0.006, 0.007, 0.009)
  const m = new MeshStandardNodeMaterial()
  // scrubbed: worn a little lighter where the tread meets the sand
  m.colorNode = mix(color(c), color(linear(0.018, 0.018, 0.018)), smoothstep(0.45, 0.9, scrub))
  m.metalness = 0
  m.roughnessNode = float(0.76).add(scrub.mul(0.12))
  return tag(m, c)
}

/** Leather and vinyl upholstery: a soft grain in colour and sheen. */
function upholstery(c: Color, roughness: number): Material {
  const p = positionLocal
  const grain = N(p.xy.mul(23).add(p.z.mul(19))).r
  const m = new MeshStandardNodeMaterial()
  m.colorNode = color(c).mul(grain.mul(0.16).add(0.92))
  m.metalness = 0
  m.roughnessNode = float(roughness).add(grain.mul(0.1))
  return tag(m, c)
}

/** A lit lamp: its filament's colour at a level an animated uniform scales. */
function emissive(c: Color, intensity: number, level: FloatNode): Material {
  const m = new MeshBasicNodeMaterial()
  m.colorNode = color(c).mul(level.mul(intensity))
  m.userData.emissive = true
  return tag(m, c)
}

export function createImpalaMaterials(): Record<string, Material> {
  const M: Record<string, Material> = {}
  M.paint = lacquer()
  M.chrome = chrome()
  M.steel = alloy(linear(0.19, 0.24, 0.29), 0.88, 0.32)
  M.dark = alloy(linear(0.03, 0.041, 0.053), 0.82, 0.39)
  M.bronze = bronze()
  M.rubber = rubber()
  // the glass as it reads from outside: dark, a clear coat for its reflections (see the header)
  const glass = linear(0.006, 0.008, 0.01)
  M.glass = tag(new MeshPhysicalNodeMaterial({ color: glass, metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, ior: 1.52 }), glass)
  M.clear = coated(linear(0.63, 0.65, 0.62), 0.05, 0.25, 0.3)
  // the redline tyres' stripe, the red trim
  M.redline = plain(linear(0.4, 0.016, 0.009), 0, 0.48)
  M.ivory = plain(linear(0.62, 0.55, 0.4), 0.03, 0.47)
  M.red = coated(linear(0.45, 0.014, 0.007), 0.22, 0.25, 0.45)
  M.enamel_blue = coated(linear(0.008, 0.055, 0.22), 0.25, 0.25, 0.4)
  M.plate = plain(linear(0.72, 0.69, 0.51), 0.2, 0.4)
  M.plate_ink = plain(linear(0.006, 0.023, 0.12), 0, 0.4)
  M.tan = upholstery(linear(0.33, 0.205, 0.073), 0.57)
  M.leather = upholstery(linear(0.006, 0.016, 0.025), 0.62)
  M.machined = alloy(linear(0.28, 0.33, 0.37), 0.94, 0.21)
  M.mask_alloy = alloy(linear(0.24, 0.27, 0.3), 0.72, 0.44)
  M.head_brow_alloy = alloy(linear(0.18, 0.16, 0.12), 0.94, 0.31)
  M.robot_graphite = alloy(linear(0.017, 0.021, 0.03), 0.77, 0.27, 0.28)
  // lamps: tungsten sealed beams and bulbs, the tail lamps behind their red lenses, amber markers
  M.lamp = emissive(linear(1, 0.86, 0.68), 10, IMPALA_LIGHTS.head)
  M.bulb_glass = emissive(linear(1, 0.8, 0.58), 6, IMPALA_LIGHTS.head)
  M.clear_lens = emissive(linear(1, 0.84, 0.66), 3, IMPALA_LIGHTS.marker)
  M.amber = emissive(linear(1, 0.36, 0.04), 4, IMPALA_LIGHTS.marker)
  M.red_lens = emissive(linear(1, 0.035, 0.015), 5, IMPALA_LIGHTS.tail)
  // the robot's eyes: the core's cyan-blue, the lens's deeper blue
  M.eye_core = emissive(linear(0.05, 0.32, 1), 5, IMPALA_LIGHTS.eyes)
  M.head_eye = emissive(linear(0.012, 0.05, 0.9), 3.6, IMPALA_LIGHTS.eyes)
  M.plastic = plain(linear(0.02, 0.022, 0.025), 0, 0.6)
  return M
}

/**
 * The cutlass's own slots (blender/impala_build/cutlass.py): a dark steel
 * blade with its grinding marks running along it, a bright ground edge, the
 * knuckle-bow guard's forged steel (hammer marks in its sheen) and the grip's
 * wrapped dark leather, its turns set at an angle round it.
 */
export function createCutlassMaterials(): Record<string, Material> {
  const M: Record<string, Material> = {}
  const p = positionLocal
  const grind = N(vec2(p.x.mul(38), p.z.mul(0.5))).g
  const blade = new MeshStandardNodeMaterial()
  const steel = linear(0.16, 0.18, 0.21)
  blade.colorNode = mix(color(steel), color(linear(0.21, 0.23, 0.26)), grind)
  blade.metalness = 0.97
  blade.roughnessNode = float(0.27).add(grind.mul(0.08))
  M.blade = tag(blade, steel)
  const hone = N(vec2(p.z.mul(0.4), abs(p.x).mul(70))).g
  const edge = new MeshStandardNodeMaterial()
  const bright = linear(0.48, 0.5, 0.54)
  edge.colorNode = color(bright).mul(hone.mul(0.1).add(0.95))
  edge.metalness = 0.97
  edge.roughnessNode = float(0.14).add(hone.mul(0.05))
  M.edge = tag(edge, bright)
  const hammer = N(p.xy.mul(31).add(p.z.mul(27))).r
  const guard = new MeshStandardNodeMaterial()
  const forged = linear(0.105, 0.124, 0.148)
  guard.colorNode = color(forged).mul(hammer.mul(0.2).add(0.9))
  guard.metalness = 0.98
  guard.roughnessNode = float(0.34).add(hammer.mul(0.1))
  M.guard = tag(guard, forged)
  // the wrap: turns 2.2 cm apart, wound at an angle (the along-and-round coordinate's fraction), a groove between
  const turns = fract(p.z.mul(45).add(p.x.add(p.y).mul(18)))
  const groove = smoothstep(0.04, 0.16, turns).mul(smoothstep(0.96, 0.84, turns))
  const wrap = new MeshStandardNodeMaterial()
  const hide = linear(0.013, 0.01, 0.008)
  wrap.colorNode = color(hide).mul(groove.mul(0.5).add(0.6))
  wrap.metalness = 0
  wrap.roughnessNode = float(0.75).sub(groove.mul(0.15))
  M.grip = tag(wrap, hide)
  return M
}
