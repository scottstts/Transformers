import { Color, LinearSRGBColorSpace, MeshBasicNodeMaterial, MeshPhysicalNodeMaterial, MeshStandardNodeMaterial, type Material, type Node } from 'three/webgpu'
import { abs, clamp, color, float, fract, fwidth, max, mix, positionLocal, smoothstep, uniform, vec2 } from 'three/tsl'
import { N } from '../../rendering/noise.ts'

/**
 * TSL materials for the Roadster. Slot names are the contract with the
 * Blender build (blender/roadster_build/rdb/kit.py `materials()` and
 * r_helmet.py): every slot the export writes has a material of the same key
 * here, at the build's linear base colour, metalness, roughness and coat.
 *
 * The glass is opaque, clear-coated and dark, as on every car (a blended pane
 * is reactive coverage to the temporal resolve and shimmers at windscreen
 * size); the cabin behind it is hidden.
 */

/** Emissive levels other modules animate. */
export const ROADSTER_LIGHTS = {
  /** the light bar and headlamp lenses (the chest's light bar in robot form) */
  head: uniform(1.0),
  /** the arched red tail bar: brighter while braking */
  tail: uniform(1.0),
  /** amber markers: they blink while it transforms */
  marker: uniform(1.0),
  /** the visor, 0 dark .. 1 running, above 1 blazing (a fight's flare, the special) */
  visor: uniform(0.0),
  /** the cabin's red ambient strips and screen */
  cabin: uniform(1.0),
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
function coated(c: Color, metalness: number, roughness: number, coat: number, coatRoughness = 0.06): Material {
  return tag(new MeshPhysicalNodeMaterial({ color: c, metalness, roughness, clearcoat: coat, clearcoatRoughness: coatRoughness }), c)
}

/**
 * Pearl white: a white base under a thick clear coat, with the faint
 * colour shift of the mica in a pearl coat (a thin-film layer, weak) and the
 * coat's orange peel wandering its roughness at a few centimetres, so the
 * long panels hold their reflections like a polished car rather than a mirror.
 */
function pearl(c: Color, roughness: number, coat: number): Material {
  const p = positionLocal
  const peel = N(p.xy.mul(9.1).add(p.z.mul(6.7))).r
  const m = new MeshPhysicalNodeMaterial({ metalness: 0, clearcoat: coat, iridescence: 0.16, iridescenceIOR: 1.45 })
  m.iridescenceThicknessRange = [280, 420]
  m.colorNode = color(c)
  m.roughnessNode = float(roughness)
  m.clearcoatRoughnessNode = float(0.05).add(peel.mul(0.028))
  return tag(m, c)
}

/** Cast and machined alloy: fine turning marks across it, a satin sheen. */
function alloy(c: Color, metalness: number, roughness: number, coat = 0): Material {
  const p = positionLocal
  const grain = N(vec2(p.x.add(p.z).mul(5.2), p.y.mul(0.7))).g
  const m = coat > 0 ? new MeshPhysicalNodeMaterial({ clearcoat: coat, clearcoatRoughness: 0.15 }) : new MeshStandardNodeMaterial()
  m.colorNode = color(c).mul(grain.mul(0.14).add(0.93))
  m.metalness = metalness
  m.roughnessNode = float(roughness).add(grain.mul(0.06))
  return tag(m, c)
}

/** Brushed copper-bronze: brushing along one axis, a darker patina in the low spots. */
function bronze(c: Color, metalness: number, roughness: number): Material {
  const p = positionLocal
  const brush = N(vec2(p.z.mul(0.05), p.x.add(p.y).mul(4.4))).g
  const patina = N(p.xy.mul(1.4).add(p.z.mul(0.9))).b
  const m = new MeshStandardNodeMaterial()
  m.colorNode = color(c).mul(brush.mul(0.16).add(patina.mul(0.1)).add(0.87))
  m.metalness = metalness
  m.roughnessNode = float(roughness).add(brush.mul(0.06)).add(patina.mul(0.04))
  return tag(m, c)
}

/**
 * Carbon twill under a clear coat: a 2x2 twill of 3.8 mm tows (the build's
 * checker), its two tow directions catching the light differently. The tows
 * are far below a pixel at play distance, so the weave fades to its mean by
 * its own screen footprint (fwidth): drawn at full contrast it would alias
 * into moire across every carbon part.
 */
function twill(dark: Color, light: Color, metalness: number, roughness: number, coat: number): Material {
  const p = positionLocal.mul(260)
  const u = p.x.add(p.y), v = p.z.add(p.y.mul(0.5))
  const cell = fract(u.add(v).mul(0.5))
  const tow = smoothstep(0.42, 0.58, cell).mul(smoothstep(1, 0.84, cell))
  const along = abs(fract(u.mul(0.5)).sub(0.5)).mul(2)
  const weave = mix(tow, float(1).sub(tow), smoothstep(0.45, 0.55, along))
  const blur = clamp(max(fwidth(u), fwidth(v)).mul(1.4), 0, 1)
  const k = mix(weave, float(0.5), blur)
  const m = new MeshPhysicalNodeMaterial({ metalness, clearcoat: coat, clearcoatRoughness: 0.04 })
  m.colorNode = mix(color(dark), color(light), k)
  m.roughnessNode = float(roughness).add(k.sub(0.5).mul(0.08))
  return tag(m, dark)
}

/** Tyre rubber: scrubbed tread, a darker, finer sidewall grain. */
function rubber(): Material {
  const p = positionLocal
  const scrub = N(vec2(p.x.mul(1.3), p.y.add(p.z).mul(0.8))).r
  const c = linear(0.01, 0.01, 0.011)
  const m = new MeshStandardNodeMaterial()
  m.colorNode = mix(color(c), color(linear(0.022, 0.021, 0.02)), smoothstep(0.45, 0.9, scrub))
  m.metalness = 0
  m.roughnessNode = float(0.78).add(scrub.mul(0.1))
  return tag(m, c)
}

/** Alcantara and carpet: a soft nap in colour and sheen. */
function nap(c: Color, roughness: number): Material {
  const p = positionLocal
  const grain = N(p.xy.mul(23).add(p.z.mul(19))).r
  const m = new MeshStandardNodeMaterial()
  m.colorNode = color(c).mul(grain.mul(0.14).add(0.93))
  m.metalness = 0
  m.roughnessNode = float(roughness).sub(grain.mul(0.05))
  return tag(m, c)
}

/** A lit lamp: its colour at a level an animated uniform scales. */
function emissive(c: Color, intensity: number, level: FloatNode): Material {
  const m = new MeshBasicNodeMaterial()
  m.colorNode = color(c).mul(level.mul(intensity))
  m.userData.emissive = true
  return tag(m, c)
}

export function createRoadsterMaterials(): Record<string, Material> {
  const M: Record<string, Material> = {}
  // pearl white: the car's body and the robot's armour share it
  M.paint = pearl(linear(0.78, 0.78, 0.76), 0.22, 1)
  M.armour = pearl(linear(0.8, 0.8, 0.78), 0.3, 0.8)
  M.plate = plain(linear(0.8, 0.8, 0.8), 0, 0.5)
  M.seatwhite = nap(linear(0.74, 0.74, 0.73), 0.55)
  M.satin = coated(linear(0.02, 0.021, 0.024), 0.15, 0.45, 0.3, 0.2)
  M.trim = coated(linear(0.012, 0.012, 0.014), 0, 0.1, 1)
  M.carbon = twill(linear(0.012, 0.013, 0.015), linear(0.024, 0.025, 0.028), 0.2, 0.32, 0.6)
  M.weave = twill(linear(0.012, 0.012, 0.014), linear(0.024, 0.025, 0.028), 0.3, 0.3, 0.8)
  M.graphite = alloy(linear(0.028, 0.029, 0.032), 0.85, 0.38)
  M.gunmetal = alloy(linear(0.1, 0.1, 0.11), 0.92, 0.3)
  M.titanium = alloy(linear(0.2, 0.19, 0.175), 0.9, 0.4)
  M.caliper = alloy(linear(0.55, 0.56, 0.58), 0.9, 0.35)
  M.wheel = alloy(linear(0.55, 0.56, 0.57), 0.6, 0.3, 0.5)
  M.chrome = plain(linear(0.8, 0.8, 0.82), 1, 0.08)
  M.bronze = bronze(linear(0.38, 0.2, 0.09), 0.95, 0.3)
  M.nozzle = bronze(linear(0.8, 0.62, 0.38), 1, 0.22)
  M.rubber = rubber()
  // the bronze-tinted glazing as it reads from outside: dark, a clear coat for its reflections (see the header)
  const glass = linear(0.012, 0.008, 0.005)
  M.glass = tag(new MeshPhysicalNodeMaterial({ color: glass, metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, ior: 1.5 }), glass)
  M.smoke = coated(linear(0.035, 0.035, 0.038), 0, 0.06, 1, 0.03)
  M.marker = coated(linear(0.07, 0.012, 0.008), 0, 0.05, 1, 0.03)
  M.carpet = nap(linear(0.012, 0.012, 0.013), 0.9)
  M.alcantara = nap(linear(0.16, 0.16, 0.165), 0.95)
  M.interior = plain(linear(0.022, 0.022, 0.024), 0.1, 0.45)
  // the robot's helmet: dark gloss over a metallic base, the faceplate darker still
  M.helmet = coated(linear(0.013, 0.015, 0.019), 0.55, 0.28, 0.35, 0.08)
  M.faceplate = coated(linear(0.008, 0.01, 0.013), 0.4, 0.22, 0.35, 0.08)
  // lamps and lights
  M.lightbar = emissive(linear(0.92, 0.95, 1), 6, ROADSTER_LIGHTS.head)
  M.lens = emissive(linear(0.88, 0.91, 0.96), 3.5, ROADSTER_LIGHTS.head)
  M.tail = emissive(linear(0.85, 0.02, 0.01), 5, ROADSTER_LIGHTS.tail)
  M.amber = emissive(linear(0.95, 0.45, 0.05), 2, ROADSTER_LIGHTS.marker)
  M.ambient = emissive(linear(1, 0.012, 0.01), 4, ROADSTER_LIGHTS.cabin)
  M.screen = emissive(linear(0.04, 0.056, 0.08), 1, ROADSTER_LIGHTS.cabin)
  // the visor: hot white, the character's colour
  M.visor = emissive(linear(0.9, 0.95, 1), 8, ROADSTER_LIGHTS.visor)
  M.plastic = plain(linear(0.02, 0.022, 0.025), 0, 0.6)
  return M
}
