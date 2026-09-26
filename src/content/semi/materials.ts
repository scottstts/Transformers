import { Color, MeshBasicNodeMaterial, MeshPhysicalNodeMaterial, MeshStandardNodeMaterial, type Material, type Node } from 'three/webgpu'
import { clamp, color, float, mix, positionLocal, uniform, vec2 } from 'three/tsl'
import { N } from '../../rendering/noise.ts'

/**
 * TSL materials for the Semi transformer. Slot names are the contract with the
 * Blender build (blender/semi_build/smb/mats.py, and the gun's slots in
 * blender/weapons_build/wpn/mats.py): every slot the exporters write has a
 * material of the same key here.
 */

/** Emissive levels other modules animate. */
export const SEMI_LIGHTS = {
  /** headlight bar and clusters (the chest's light bar in robot form) */
  head: uniform(1.0),
  /** tail and marker reds: brighter while braking */
  tail: uniform(1.0),
  /** amber roof and side markers */
  marker: uniform(1.0),
  /** the robot's eyes */
  eyes: uniform(0.0),
}

type FloatNode = Node<'float'>

const tag = <M extends Material>(m: M, hex: number): M => ((m.userData.preview = hex), m)

/** Pearl white multi-coat under clearcoat: a faint low-frequency orange peel in the coat. */
function pearl(hex: number, rough: number): Material {
  const peel = N(positionLocal.xy.mul(3.1).add(positionLocal.z.mul(2.7))).b
  const m = new MeshPhysicalNodeMaterial()
  m.color = new Color(hex)
  m.metalness = 0
  m.roughnessNode = float(rough).add(peel.mul(0.05))
  m.clearcoat = 1
  m.clearcoatRoughnessNode = float(0.025).add(peel.mul(0.03))
  return tag(m, hex)
}

/** Piano-black trim: deep gloss under clearcoat. */
function gloss(hex: number): Material {
  const m = new MeshPhysicalNodeMaterial({ color: hex, metalness: 0, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.04 })
  return tag(m, hex)
}

/** Grained black plastic (valence, skirts, fenders): moulded texture, no coat. */
function grained(hex: number, rough: number): Material {
  const grain = N(positionLocal.xy.mul(3.3).add(positionLocal.z.mul(2.1))).b
  const m = new MeshStandardNodeMaterial()
  m.colorNode = color(hex).mul(grain.mul(0.25).add(0.85))
  m.metalness = 0
  m.roughnessNode = float(rough).add(grain.mul(0.12))
  return tag(m, hex)
}

/** Truck tyre rubber: scrubbed tread, darker sidewall grain. */
function rubber(): Material {
  const p = positionLocal
  const scrub = N(vec2(p.x.mul(1.4), p.y.add(p.z).mul(0.7))).r
  const m = new MeshStandardNodeMaterial()
  m.colorNode = mix(color(0x131314), color(0x222223), scrub.mul(scrub))
  m.metalness = 0
  m.roughnessNode = float(0.8).add(scrub.mul(0.12))
  return tag(m, 0x161617)
}

/** Metal with fine machining or brushing marks along one axis. */
function brushed(dark: number, light: number, metal: number, rough: number, along: 'x' | 'y' | 'z'): Material {
  const p = positionLocal
  const u = along === 'x' ? p.x : along === 'y' ? p.y : p.z
  const v = along === 'x' ? p.y.add(p.z) : along === 'y' ? p.x.add(p.z) : p.x.add(p.y)
  const streak = N(vec2(u.mul(0.05), v.mul(3.4))).g
  const m = new MeshStandardNodeMaterial()
  m.colorNode = mix(color(dark), color(light), streak)
  m.metalness = metal
  m.roughnessNode = float(rough).add(streak.mul(0.08))
  return tag(m, light)
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

/** Painted frame steel: satin black with road grime gathered low. */
function chassis(): Material {
  const p = positionLocal
  const grime = N(p.xy.mul(0.9).add(p.z.mul(0.6))).r
  const low = float(1).sub(clamp(p.z.mul(0.9), 0, 1))
  const m = new MeshStandardNodeMaterial()
  m.colorNode = mix(color(0x1a1b1d), color(0x2c2823), grime.mul(low).mul(0.8))
  m.metalness = 0.4
  m.roughnessNode = float(0.52).add(grime.mul(0.14))
  return tag(m, 0x1b1c1e)
}

/** The van's skin: white painted aluminium panels, a little road film low down and on the lower edges. */
function vanSkin(): Material {
  const p = positionLocal
  const film = N(vec2(p.y.mul(0.08), p.z.mul(1.9))).g
  const low = float(1).sub(clamp(p.z.sub(1.2).mul(0.7), 0, 1))
  const m = new MeshPhysicalNodeMaterial()
  m.colorNode = mix(color(0xe6e8e8), color(0xc9c7c0), film.mul(low).mul(0.45))
  m.metalness = 0.12
  m.roughnessNode = float(0.34).add(film.mul(0.08))
  m.clearcoat = 0.6
  m.clearcoatRoughness = 0.06
  return tag(m, 0xe4e6e6)
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

export function createSemiMaterials(): Record<string, Material> {
  const M: Record<string, Material> = {}
  M.paint = pearl(0xe9ebea, 0.28)
  M.trim = gloss(0x0c0d0e)
  M.blackMatte = grained(0x151617, 0.68)
  M.glass = tag(new MeshPhysicalNodeMaterial({ color: 0x07090b, metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03, ior: 1.52 }), 0x07090b)
  M.rubber = rubber()
  M.rim = brushed(0xaeb2b6, 0xc9cdd0, 1, 0.2, 'x')
  M.hubcap = std(0xd9dcde, 1, 0.12)
  M.chassis = chassis()
  M.steel = brushed(0x7e8286, 0x959a9e, 1, 0.36, 'y')
  M.lamp = emissive(0xf4f7ff, 14, SEMI_LIGHTS.head)
  M.amber = emissive(0xff8a1c, 6, SEMI_LIGHTS.marker)
  M.lightRed = emissive(0xff1a14, 8, SEMI_LIGHTS.tail)
  M.van = vanSkin()
  M.alu = brushed(0xb2b6b9, 0xc6cacd, 1, 0.3, 'y')
  M.tapeRed = coated(0xa8141b, 0, 0.25)
  M.tapeWhite = coated(0xdfe3e6, 0.3, 0.2)
  M.interior = std(0x0d0d0e, 0, 0.88)
  M.graphite = castAlloy(0x1d1f23, 0x2d3035, 0.8, 0.4)
  M.darkSteel = std(0x55595e, 1, 0.3)
  M.chrome = std(0xe0e3e6, 1, 0.08)
  M.mech = castAlloy(0x32363c, 0x41454c, 0.9, 0.4)
  M.blackChrome = std(0x0b0c0e, 1, 0.14)
  M.silver = castAlloy(0xc4c7cc, 0xd6d9de, 0.85, 0.34)
  M.orange = coated(0xe8641a, 0, 0.4)
  M.eye = emissive(0x2a8cff, 5, SEMI_LIGHTS.eyes)
  M.plastic = std(0x141516, 0, 0.6)
  return M
}
