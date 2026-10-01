import { AdditiveBlending, MeshBasicNodeMaterial, type Material } from 'three/webgpu'
import { color, float, mix, smoothstep, vec2 } from 'three/tsl'
import { N } from '../../rendering/noise'
import { standard, type HordeNodes } from '../soldier/materials'

/**
 * The commander's slot materials on the horde renderer's skinning (its own
 * renderer instance, capacity 2: the living one and the last one's debris).
 * Colours, metalness, roughness and coat are the Blender preview's
 * (`cmd/mats.py`), with the soldier's wear: fine brushing on the alloys,
 * handling smudges on the gloss armour, grain on the frame. The light strips
 * and optics follow `lights` (state z); the lance's energy core follows
 * `blade` (state w), which the fight drives above 1 through a wind-up and at
 * a strike (unlit, additive, no shadow).
 */
export function createCommanderMaterials(nodes: HordeNodes): Record<string, Material> {
  const p = nodes.local
  const brush = N(vec2(p.x.add(p.y).mul(0.6), p.z.mul(9.5))).b
  const smudge = N(p.xz.mul(1.3).add(p.y.mul(0.7))).r
  const grain = N(p.xy.mul(5.1).add(p.z.mul(3.7))).g
  const M: Record<string, Material> = {}
  M.ceramic = standard(nodes, { color: color(0xe6e8ec).mul(smudge.mul(0.06).add(0.96)), metal: 0.15, rough: float(0.22).add(smudge.mul(0.08)), coat: 0.6 })
  M.silver = standard(nodes, { color: mix(color(0x98a0aa), color(0xb0b8c2), brush), metal: 0.85, rough: float(0.24).add(brush.mul(0.06)), coat: 0.2 })
  M.obsidian = standard(nodes, { color: color(0x0d0f13), metal: 0.45, rough: float(0.18).add(smudge.mul(0.08)), coat: 0.7 })
  M.structure = standard(nodes, { color: mix(color(0x1f2227), color(0x2a2d33), grain), metal: 0.8, rough: float(0.34).add(grain.mul(0.08)), coat: 0.1 })
  M.steel = standard(nodes, { color: mix(color(0x737c88), color(0x86909b), brush), metal: 0.95, rough: float(0.2).add(smudge.mul(0.06)) })
  M.rubber = standard(nodes, { color: color(0x101114).mul(grain.mul(0.2).add(0.9)), metal: 0, rough: float(0.74).add(grain.mul(0.1)) })
  M.crimson = standard(nodes, { color: color(0x7a0613).mul(smudge.mul(0.12).add(0.92)), metal: 0.3, rough: float(0.28).add(smudge.mul(0.06)), coat: 0.5 })
  M.visor = standard(nodes, { color: color(0x07090d), metal: 0.2, rough: float(0.08), coat: 0.8 })
  M.head_alloy = standard(nodes, { color: mix(color(0xa6a9af), color(0xb6b9bf), brush), metal: 0.72, rough: float(0.29).add(brush.mul(0.05)), coat: 0.18 })
  M.face_alloy = standard(nodes, { color: mix(color(0xc6c9cd), color(0xd4d7db), brush), metal: 0.62, rough: float(0.28).add(brush.mul(0.05)), coat: 0.18 })
  M.casque = standard(nodes, { color: mix(color(0x3f4147), color(0x494b51), smudge), metal: 0.82, rough: float(0.26).add(smudge.mul(0.06)), coat: 0.15 })

  const light = (hex: number, level: number): Material => {
    const m = new MeshBasicNodeMaterial()
    m.positionNode = nodes.position
    m.colorNode = color(hex).mul(nodes.state.z.mul(level))
    m.userData.emissive = true
    return m
  }
  M.glow = light(0xff0a22, 6)
  M.optic = light(0xff0803, 3)
  M.optic_core = light(0xffd8c5, 4)

  // the lance's energy core: red, whitening at its hottest; brighter toward its middle
  const blade = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending })
  blade.positionNode = nodes.position
  const energy = nodes.state.w
  const along = smoothstep(0, 0.1, p.z).mul(smoothstep(0.86, 0.6, p.z))
  blade.colorNode = mix(color(0xff1a30), color(0xffd0c8), smoothstep(1.6, 3.4, energy).mul(0.55)).mul(energy.mul(8).mul(along.mul(0.6).add(0.4)))
  blade.userData.emissive = true
  M.blade = blade
  return M
}
