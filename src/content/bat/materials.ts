import { MeshBasicNodeMaterial, MeshPhysicalNodeMaterial, MeshStandardNodeMaterial, type Material, type Node } from 'three/webgpu'
import { abs, clamp, color, float, mix, normalLocal, positionLocal, smoothstep, uniform, vec2, vec3 } from 'three/tsl'
import { N } from '../../rendering/noise.ts'

/**
 * TSL materials for the Bat (the Tumbler) transformer. Slot names are the
 * contract with the Blender build (blender/bat_build/btb/mats.py, and the
 * spear's slots in blender/weapons_build/wpn/mats.py): every slot the
 * exporters write has a material of the same key here.
 */

/** Emissive levels other modules animate. */
export const BAT_LIGHTS = {
  /** the front lamps (the chest chevron's in robot form) */
  head: uniform(1.0),
  /** the rear reds on the inner lamp rails: brighter while braking */
  tail: uniform(1.0),
  /** the amber side markers */
  marker: uniform(1.0),
  /** the robot's eyes */
  eyes: uniform(0.0),
  /** heat of the afterburner's petals and liner, 0 cold .. 1 at full burn */
  nozzle: uniform(0.0),
}

type FloatNode = Node<'float'>

const tag = <M extends Material>(m: M, hex: number): M => ((m.userData.preview = hex), m)

/**
 * The Tumbler's flat military black: a satin coat over faceted panels, with
 * desert dust settled into it (heavier low down and on upward faces) and a
 * faint low-frequency variation in the sheen, so the big planes read as
 * painted metal rather than a flat fill.
 */
function armour(hex: number, metal: number, rough: number, dusty: number): Material {
  const p = positionLocal
  const sheen = N(p.xy.mul(0.7).add(p.z.mul(0.45))).r
  const grit = N(p.xz.mul(4.1).add(p.y.mul(3.3))).g
  const up = smoothstep(0.35, 0.95, normalLocal.z)
  const low = float(1).sub(clamp(p.z.mul(0.8), 0, 1))
  const dust = clamp(grit.mul(0.6).add(sheen.mul(0.4)).mul(up.mul(0.6).add(low.mul(0.5))).mul(dusty), 0, 1)
  const m = new MeshStandardNodeMaterial()
  m.colorNode = mix(color(hex).mul(sheen.mul(0.12).add(0.94)), color(0x5a5146), dust.mul(0.35))
  m.metalness = metal
  m.roughnessNode = float(rough).add(sheen.mul(0.08)).add(dust.mul(0.2))
  return tag(m, hex)
}

/** Brushed bronze: fine brushing along one axis, a warmer, darker patina in the low spots. */
function bronze(dark: number, light: number, rough: number): Material {
  const p = positionLocal
  const brush = N(vec2(p.z.mul(0.05), p.x.add(p.y).mul(4.2))).g
  const patina = N(p.xy.mul(1.3).add(p.z.mul(0.9))).b
  const m = new MeshStandardNodeMaterial()
  m.colorNode = mix(color(dark), color(light), brush.mul(0.6).add(patina.mul(0.4)))
  m.metalness = 1
  m.roughnessNode = float(rough).add(brush.mul(0.07)).add(patina.mul(0.06))
  return tag(m, light)
}

/** Off-road tyre rubber: scrubbed tread, a darker, finer sidewall grain. */
function rubber(): Material {
  const p = positionLocal
  const scrub = N(vec2(p.x.mul(1.3), p.y.add(p.z).mul(0.8))).r
  const m = new MeshStandardNodeMaterial()
  m.colorNode = mix(color(0x111112), color(0x232322), scrub.mul(scrub)).add(vec3(0.012, 0.01, 0.007).mul(smoothstep(0.5, 0.9, scrub)))
  m.metalness = 0
  m.roughnessNode = float(0.84).add(scrub.mul(0.1))
  return tag(m, 0x141414)
}

/** Cast and machined structure of the robot: fine turning marks, satin sheen. */
function castAlloy(dark: number, light: number, metal: number, rough: number): Material {
  const p = positionLocal
  const grain = N(vec2(p.x.add(p.z).mul(6.0), p.y.mul(0.8))).g
  const m = new MeshStandardNodeMaterial()
  m.colorNode = mix(color(dark), color(light), grain)
  m.metalness = metal
  m.roughnessNode = float(rough).add(grain.mul(0.08))
  return tag(m, light)
}

/** Painted tube frame and arms: satin black-grey with grime gathered low. */
function chassis(): Material {
  const p = positionLocal
  const grime = N(p.xy.mul(0.9).add(p.z.mul(0.6))).r
  const low = float(1).sub(clamp(p.z.mul(0.9), 0, 1))
  const m = new MeshStandardNodeMaterial()
  m.colorNode = mix(color(0x1e2023), color(0x2e2923), grime.mul(low).mul(0.8))
  m.metalness = 0.55
  m.roughnessNode = float(0.5).add(grime.mul(0.12))
  return tag(m, 0x202225)
}

/**
 * The afterburner's titanium petals and liner: heat-tinted metal (straw to
 * blue bands) that glows from inside while the jet burns, the hottest at the
 * lip's inner edge. `heat` is the burn (BAT_LIGHTS.nozzle).
 */
function nozzle(heat: FloatNode): Material {
  const p = positionLocal
  const tint = N(p.xz.mul(5.3).add(p.y.mul(2.1))).g
  const temper = mix(color(0x6f5a44), color(0x3e4a66), smoothstep(0.35, 0.8, tint))
  const flicker = N(vec2(p.x.mul(3.7).add(p.z.mul(2.9)), p.y.mul(1.7))).b.mul(0.35).add(0.8)
  const m = new MeshStandardNodeMaterial()
  m.colorNode = temper
  m.metalness = 1
  m.roughnessNode = float(0.3).add(tint.mul(0.1))
  // glowing metal: dull red at a light burn to orange-white at full (blackbody-like ramp)
  const glow = mix(vec3(1.0, 0.18, 0.03), vec3(1.0, 0.62, 0.3), heat)
  m.emissiveNode = glow.mul(heat.mul(heat).mul(6).mul(flicker))
  return tag(m, 0x6f5a44)
}

function emissive(hex: number, intensity: number, level: FloatNode): Material {
  const m = new MeshBasicNodeMaterial()
  m.colorNode = color(hex).mul(level.mul(intensity))
  m.userData.emissive = true
  return tag(m, hex)
}

const std = (hex: number, metalness: number, roughness: number): Material =>
  tag(new MeshStandardNodeMaterial({ color: hex, metalness, roughness }), hex)

export function createBatMaterials(): Record<string, Material> {
  const M: Record<string, Material> = {}
  M.armor = armour(0x25272a, 0.48, 0.43, 1)
  M.armorDark = armour(0x121314, 0.3, 0.66, 0.6)
  M.bronze = bronze(0x6e5334, 0x8a6a45, 0.34)
  // smoked canopy glass: dark, clear coat, subdued reflections
  M.glass = tag(new MeshPhysicalNodeMaterial({ color: 0x090c10, metalness: 0.15, roughness: 0.14, clearcoat: 0.35, clearcoatRoughness: 0.03, ior: 1.52 }), 0x090c10)
  M.rubber = rubber()
  M.rim = castAlloy(0x151617, 0x1f2022, 0.8, 0.44)
  M.chassis = chassis()
  M.copper = bronze(0x5e2a18, 0x7c3a22, 0.38)
  M.steel = castAlloy(0x7c8084, 0x959a9e, 1, 0.34)
  M.nozzle = nozzle(BAT_LIGHTS.nozzle)
  M.lamp = emissive(0xf4f7ff, 12, BAT_LIGHTS.head)
  M.amber = emissive(0xff8a1c, 5, BAT_LIGHTS.marker)
  M.lightRed = emissive(0xff1a14, 6, BAT_LIGHTS.tail)
  M.interior = std(0x0b0b0c, 0, 0.9)
  M.graphite = castAlloy(0x1d1f22, 0x2b2d31, 0.8, 0.4)
  M.darkSteel = castAlloy(0x42464b, 0x52575c, 1, 0.3)
  M.chrome = std(0xd8dbde, 1, 0.1)
  M.mech = castAlloy(0x2e3136, 0x3a3e44, 0.9, 0.42)
  M.blackChrome = std(0x0b0c0e, 1, 0.16)
  M.eye = emissive(0xffb23a, 4, BAT_LIGHTS.eyes)
  M.plastic = std(0x141516, 0, 0.6)
  return M
}

/**
 * The spear's own slots (blender/weapons_build/wpn/spear.py): the black
 * lacquered shaft, its brushed bronze fittings and the fluted blade (bright
 * bronze flats, a dark patina in the flutes, honed edges).
 */
export function createSpearMaterials(): Record<string, Material> {
  const M = createBatMaterials()
  const p = positionLocal
  // deep black lacquer: a gloss clear coat over a faintly warm black
  const orange = N(p.xy.mul(2.9).add(p.z.mul(3.3))).b
  const lacquer = new MeshPhysicalNodeMaterial()
  lacquer.colorNode = color(0x07070a)
  lacquer.metalness = 0.1
  lacquer.roughnessNode = float(0.3).add(orange.mul(0.06))
  lacquer.clearcoat = 1
  lacquer.clearcoatRoughnessNode = float(0.03).add(orange.mul(0.03))
  M.lacquer = tag(lacquer, 0x07070a)
  M.bronzeDark = bronze(0x3a2a1a, 0x4d3822, 0.42)
  // honed edges: bright steel-bronze, the grinding marks running along the edge
  const hone = N(vec2(p.z.mul(0.4), abs(p.x).mul(60))).g
  const edge = new MeshStandardNodeMaterial()
  edge.colorNode = mix(color(0xb59a78), color(0xd8c3a2), hone)
  edge.metalness = 1
  edge.roughnessNode = float(0.14).add(hone.mul(0.06))
  M.edge = tag(edge, 0xd0b894)
  return M
}
