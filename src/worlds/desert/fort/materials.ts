import { DoubleSide, MeshBasicNodeMaterial, MeshStandardNodeMaterial, type Material } from 'three/webgpu'
import { attribute, color, float, fwidth, max, min, mix, normalWorld, positionWorld, smoothstep, abs, fract, vec2 } from 'three/tsl'
import { N } from '../../../rendering/noise'

/**
 * Fort surfaces, all procedural in world space (the modules carry no UVs):
 * the weathering follows real causes. Wind-blown sand banks against the foot
 * of every wall and dusts every upward face; rain (rare, violent) runs down
 * from the top edges in streaks; the sun bleaches paint unevenly; steel
 * rusts where the coating is scratched. `shade` (per part, 0..1) lets two
 * neighbouring slabs or containers differ in tone.
 */

const SAND = color(0xc3a57c)

function dust(amount = 1) {
  const p = positionWorld
  const up = smoothstep(0.35, 0.95, normalWorld.y)
  const foot = smoothstep(0.9, 0.0, p.y).mul(N(p.xz.mul(0.35)).r.mul(0.6).add(0.5))
  const drift = N(p.xz.mul(0.07).add(p.y.mul(0.05))).g
  return min(float(1), up.mul(0.55).add(foot.mul(0.85)).mul(drift.mul(0.6).add(0.55)).mul(amount))
}

function concrete(): Material {
  const p = positionWorld
  const shade = attribute('shade', 'float')
  const m = new MeshStandardNodeMaterial()
  const blotch = N(p.xz.mul(0.045).add(p.y.mul(0.03))).r
  const pores = N(vec2(p.x.add(p.z).mul(2.3), p.y.mul(2.3))).b
  // run-off: long vertical streaks hanging from the tops of the slabs
  const streak = N(vec2(p.x.add(p.z.mul(0.7)).mul(1.7), p.y.mul(0.05))).g
  const runoff = smoothstep(0.55, 0.85, streak).mul(smoothstep(0.2, 0.9, normalWorld.y.oneMinus()))
  let base = mix(color(0x8d877e), color(0xaaa398), blotch.mul(0.6).add(shade.mul(0.4)))
  base = base.mul(pores.mul(0.12).add(0.94)).mul(float(1).sub(runoff.mul(0.18)))
  m.colorNode = mix(base, SAND, dust(0.9))
  m.roughnessNode = float(0.86).add(pores.mul(0.08))
  m.metalnessNode = float(0)
  return m
}

function steel(tone: number): Material {
  const p = positionWorld
  const shade = attribute('shade', 'float')
  const m = new MeshStandardNodeMaterial()
  const chip = smoothstep(0.66, 0.74, N(p.xz.mul(0.9).add(p.y.mul(0.6))).b)
  const rust = mix(color(0x6b3a22), color(0x8a4f2c), N(p.xy.mul(2.1)).r)
  const paint = color(tone).mul(shade.mul(0.16).add(0.9)).mul(N(p.xz.mul(0.2).add(p.y.mul(0.1))).g.mul(0.14).add(0.92))
  m.colorNode = mix(mix(paint, rust, chip.mul(0.8)), SAND, dust(0.6))
  m.metalnessNode = mix(float(0.35), float(0.2), chip)
  m.roughnessNode = float(0.55).add(chip.mul(0.3))
  return m
}

function galvanized(): Material {
  const p = positionWorld
  const m = new MeshStandardNodeMaterial()
  const spangle = N(p.xy.mul(3.3).add(p.z.mul(2.1))).r
  // long run-off stains down the sheets, not blotches
  const stain = N(vec2(p.x.add(p.z).mul(0.9), p.y.mul(0.04))).g
  const base = mix(mix(color(0x8c9194), color(0x9fa3a6), spangle), color(0x7a7163), smoothstep(0.6, 0.85, stain).mul(0.35))
  m.colorNode = mix(base, SAND, dust(0.7))
  m.metalnessNode = float(0.85).sub(dust(0.7).mul(0.6))
  m.roughnessNode = float(0.42).add(spangle.mul(0.12)).add(stain.mul(0.1))
  return m
}

/** Container paint: three sun-bleached liveries picked by `shade`. */
function containerPaint(): Material {
  const p = positionWorld
  const shade = attribute('shade', 'float')
  const m = new MeshStandardNodeMaterial()
  const livery = mix(mix(color(0x8c3f25), color(0xa58b5f), smoothstep(0.3, 0.4, shade)), color(0x56603f), smoothstep(0.62, 0.72, shade))
  // sun bleaching: broad and gentle; scratches: short horizontal scrapes, sparse
  const bleach = N(p.xz.mul(0.03).add(p.y.mul(0.02))).r
  const scratch = smoothstep(0.8, 0.86, N(vec2(p.x.add(p.z).mul(2.6), p.y.mul(11))).b).mul(smoothstep(0.45, 0.6, N(p.xz.mul(0.35).add(p.y.mul(0.3))).g))
  const rust = mix(color(0x5a2e1a), color(0x7d4526), N(p.xy.mul(1.7)).g)
  m.colorNode = mix(mix(livery.mul(bleach.mul(0.14).add(0.9)), rust, scratch.mul(0.7)), SAND, dust(0.7))
  m.metalnessNode = float(0.3).sub(scratch.mul(0.1))
  m.roughnessNode = float(0.58).add(bleach.mul(0.12)).add(scratch.mul(0.2))
  return m
}

/**
 * Gabion (HESCO): sand-coloured geotextile behind a welded wire mesh of
 * 7.6 cm squares. The mesh is shaded analytically with its screen footprint
 * (fwidth), fading to its average cover before it can alias.
 */
function gabion(): Material {
  const p = positionWorld
  const m = new MeshStandardNodeMaterial()
  const pitch = 0.076 * 1.6
  const n = normalWorld
  // pick the two in-plane coordinates of the face (sides are vertical)
  const u = mix(p.x, p.z, abs(n.x).greaterThan(abs(n.z)).select(float(1), float(0)))
  const g = vec2(u, p.y).div(pitch)
  const fw = max(fwidth(g), vec2(1e-4))
  const line = vec2(0.06).div(fw)
  const d = abs(fract(g.add(0.5)).sub(0.5)).div(fw)
  const wire = max(smoothstep(line.x.add(1), line.x, d.x), smoothstep(line.y.add(1), line.y, d.y))
  const fade = smoothstep(0.6, 0.2, max(fw.x, fw.y))
  const cover = mix(float(0.12), wire, fade)
  const cloth = mix(color(0xa9956d), color(0xbfa983), N(p.xz.mul(0.5).add(p.y.mul(0.8))).r).mul(N(vec2(u.mul(4.1), p.y.mul(4.1))).b.mul(0.12).add(0.92))
  m.colorNode = mix(mix(cloth, color(0x6f6a62), cover), SAND, dust(0.5))
  m.metalnessNode = cover.mul(0.5)
  m.roughnessNode = float(0.88).sub(cover.mul(0.35))
  return m
}

/** Pine boards and plywood: pale, sun-greyed timber with grain along the boards. */
function wood(): Material {
  const p = positionWorld
  const shade = attribute('shade', 'float')
  const m = new MeshStandardNodeMaterial()
  const grain = N(vec2(p.x.add(p.z).mul(0.6), p.y.mul(9))).r
  const tone = mix(color(0x8a7050), color(0xa99171), N(p.xz.mul(0.8).add(p.y.mul(0.5))).g.mul(0.6).add(shade.mul(0.4)))
  const grey = mix(tone, color(0x8b8478), smoothstep(0.3, 0.8, N(p.xz.mul(0.12)).b).mul(0.5))
  m.colorNode = mix(grey.mul(grain.mul(0.14).add(0.92)), SAND, dust(0.6))
  m.metalnessNode = float(0)
  m.roughnessNode = float(0.84).add(grain.mul(0.1))
  return m
}

/** Painted insulated panels (housing units, booths, condensers): off-white to beige by `shade`, dusty, sun-chalked. */
function prefab(): Material {
  const p = positionWorld
  const shade = attribute('shade', 'float')
  const m = new MeshStandardNodeMaterial()
  const tone = mix(mix(color(0xc9c4b6), color(0xb5aa92), smoothstep(0.3, 0.45, shade)), color(0x8f8c72), smoothstep(0.7, 0.82, shade))
  const chalk = N(p.xz.mul(0.05).add(p.y.mul(0.03))).r
  const streak = smoothstep(0.6, 0.85, N(vec2(p.x.add(p.z).mul(1.3), p.y.mul(0.06))).g)
  m.colorNode = mix(tone.mul(chalk.mul(0.1).add(0.93)).mul(float(1).sub(streak.mul(0.1))), SAND, dust(0.7))
  m.metalnessNode = float(0.15)
  m.roughnessNode = float(0.62).add(chalk.mul(0.12))
  return m
}

/** Rendered, painted concrete (the HQ): warm sand-coloured render, faded and stained by run-off from the parapet. */
function plaster(): Material {
  const p = positionWorld
  const m = new MeshStandardNodeMaterial()
  const blotch = N(p.xz.mul(0.06).add(p.y.mul(0.05))).r
  const texture = N(vec2(p.x.add(p.z).mul(3.1), p.y.mul(3.1))).b
  const runoff = smoothstep(0.6, 0.86, N(vec2(p.x.add(p.z.mul(0.7)).mul(1.4), p.y.mul(0.05))).g).mul(smoothstep(0.2, 0.9, normalWorld.y.oneMinus()))
  const base = mix(color(0xb9a484), color(0xcbb898), blotch).mul(texture.mul(0.08).add(0.96)).mul(float(1).sub(runoff.mul(0.14)))
  m.colorNode = mix(base, SAND, dust(0.8))
  m.metalnessNode = float(0)
  m.roughnessNode = float(0.9)
  return m
}

/** Canvas (shade sails): a tan acrylic fabric, the weave only as a faint tone variation. Both sides. */
function canvas(): Material {
  const p = positionWorld
  const shade = attribute('shade', 'float')
  const m = new MeshStandardNodeMaterial()
  const tone = mix(color(0xb8a27a), color(0x7d7a5c), smoothstep(0.45, 0.6, shade))
  m.colorNode = mix(tone.mul(N(p.xz.mul(0.4)).r.mul(0.1).add(0.94)), SAND, dust(0.4))
  m.metalnessNode = float(0)
  m.roughnessNode = float(0.92)
  m.side = DoubleSide
  return m
}

/** Moulded polyethylene (tanks, latrines, insulators): matte, a colour by `shade`. */
function poly(): Material {
  const p = positionWorld
  const shade = attribute('shade', 'float')
  const m = new MeshStandardNodeMaterial()
  const tone = mix(mix(color(0x2e3a2c), color(0x3b5566), smoothstep(0.3, 0.45, shade)), color(0x6d6a60), smoothstep(0.7, 0.82, shade))
  m.colorNode = mix(tone.mul(N(p.xz.mul(0.3).add(p.y.mul(0.2))).g.mul(0.1).add(0.95)), SAND, dust(0.5))
  m.metalnessNode = float(0)
  m.roughnessNode = float(0.7)
  return m
}

/**
 * Road paint (the helipad's markings, the boom's white bands): a worn white.
 * Laid a few millimetres over the surface it marks, it is biased toward the
 * camera so it never fights with it at a distance.
 */
function paint(hex: number, worn: boolean): Material {
  const p = positionWorld
  const m = new MeshStandardNodeMaterial()
  const wear = worn ? smoothstep(0.55, 0.8, N(p.xz.mul(1.3)).r) : float(0)
  m.colorNode = mix(mix(color(hex), color(0x8d877e), wear), SAND, dust(worn ? 0.9 : 0.4))
  m.metalnessNode = float(0)
  m.roughnessNode = float(0.7)
  if (worn) {
    m.polygonOffset = true
    m.polygonOffsetFactor = -2
    m.polygonOffsetUnits = -4
  }
  return m
}

/** Sandbags: woven polypropylene sacks, sun-bleached, each bag its own tone (`shade`). */
function sandbag(): Material {
  const p = positionWorld
  const shade = attribute('shade', 'float')
  const m = new MeshStandardNodeMaterial()
  const tone = mix(color(0x8f7c5b), color(0xaa9670), shade)
  m.colorNode = mix(tone.mul(N(vec2(p.x.add(p.z).mul(5.3), p.y.mul(5.3))).b.mul(0.1).add(0.95)), SAND, dust(0.7))
  m.metalnessNode = float(0)
  m.roughnessNode = float(0.95)
  return m
}

function std(hex: number, metal: number, rough: number): Material {
  const m = new MeshStandardNodeMaterial()
  m.colorNode = mix(color(hex), SAND, dust(0.5))
  m.metalnessNode = float(metal)
  m.roughnessNode = float(rough)
  return m
}

function emissive(hex: number, level: number): Material {
  const m = new MeshBasicNodeMaterial()
  m.colorNode = color(hex).mul(level)
  m.userData.emissive = true
  return m
}

export function createFortMaterials(): Record<string, Material> {
  const interior = std(0x121211, 0, 0.95)
  interior.side = DoubleSide
  return {
    concrete: concrete(),
    steel: steel(0x7a7263),
    darkSteel: steel(0x3c3d3a),
    galvanized: galvanized(),
    container: containerPaint(),
    gabion: gabion(),
    rubber: std(0x191919, 0, 0.9),
    glass: std(0x0b0d0f, 0.2, 0.08),
    interior,
    sandbag: sandbag(),
    wood: wood(),
    prefab: prefab(),
    plaster: plaster(),
    canvas: canvas(),
    poly: poly(),
    paint: paint(0xdedad0, true),
    signalRed: paint(0xa3261c, false),
    lamp: emissive(0xfff2d8, 2.2),
    beacon: emissive(0xff3018, 6),
  }
}
