import {
  AdditiveBlending, MeshBasicNodeMaterial, MeshPhysicalNodeMaterial, MeshStandardNodeMaterial, StorageBufferAttribute,
  type Material, type Node,
} from 'three/webgpu'
import {
  Fn, attribute, color, float, instanceIndex, max, mix, normalGeometry, normalLocal, positionGeometry, smoothstep, storage, uniform, varying, vec2, vec3, vec4,
} from 'three/tsl'
import { N } from '../../rendering/noise'
import { blackbody } from '../../rendering/blackbody'

/**
 * The soldier's materials, drawn for the whole horde at once.
 *
 * Every vertex rides one bone (its `boneIndex`); the horde renderer keeps an
 * affine 3x4 world matrix per bone per drawn soldier in `rows` (three vec4
 * rows each) and one vec4 of state per soldier in `state`:
 *   x  heat (0..1): metal glowing after a cut or inside a blast
 *   y  dissolve (0..1): a destroyed part burning away
 *   z  lights (0..1): the status strips and visor light
 *   w  blade (0..1): how far the energy blade is ignited
 * A drawn instance's soldier slot is its instance index plus the mesh's
 * `userData.base` (the LOD tiers draw consecutive runs of the same buffers),
 * so one material per slot serves every tier.
 */
export interface HordeBuffers {
  rows: StorageBufferAttribute
  state: StorageBufferAttribute
  bones: number
}

export interface HordeNodes {
  /** skinned position (and normal, assigned) for the lit meshes */
  position: Node<'vec3'>
  /** the same, shrunk toward each bone's origin as its part dissolves (the shadow proxy) */
  shadowPosition: Node<'vec3'>
  /** the energy blade: its core stretched out along the bone by the ignition */
  bladePosition: Node<'vec3'>
  /** per-soldier state, in the fragment stage */
  state: Node<'vec4'>
  /** bone-frame position, in the fragment stage (the dissolve pattern sticks to the part) */
  local: Node<'vec3'>
}

export function hordeNodes(buffers: HordeBuffers): HordeNodes {
  const rows = storage(buffers.rows, 'vec4', buffers.rows.count).toReadOnly()
  const states = storage(buffers.state, 'vec4', buffers.state.count).toReadOnly()
  const base = uniform(0).onObjectUpdate(({ object }) => (object?.userData.base as number | undefined) ?? 0)
  const slot = instanceIndex.add(base.toUint())
  const state = states.element(slot)
  const bone = attribute('boneIndex', 'float').toUint()
  const row = slot.mul(buffers.bones).add(bone).mul(3)
  const r0 = rows.element(row)
  const r1 = rows.element(row.add(1))
  const r2 = rows.element(row.add(2))
  const apply = (p: Node<'vec3'>): Node<'vec3'> => {
    const h = vec4(p, 1)
    return vec3(r0.dot(h), r1.dot(h), r2.dot(h))
  }
  const skin = (p: Node<'vec3'>): Node<'vec3'> => Fn(() => {
    const n = normalGeometry
    normalLocal.assign(vec3(r0.xyz.dot(n), r1.xyz.dot(n), r2.xyz.dot(n)))
    return apply(p)
  })()
  const dissolve = state.y
  return {
    position: skin(positionGeometry),
    shadowPosition: apply(positionGeometry.mul(float(1).sub(dissolve.mul(dissolve)))),
    bladePosition: skin(vec3(positionGeometry.xy.mul(mix(float(0.5), float(1), state.w)), positionGeometry.z.mul(state.w))),
    state: varying(state, 'vSoldierState'),
    local: varying(positionGeometry, 'vSoldierLocal'),
  }
}

type Lit = MeshStandardNodeMaterial & { maskNode: unknown; emissiveNode: unknown }

/** Heat glow and the dissolve's burning edge on a lit surface; the part is discarded behind the edge. */
function damage(m: Lit, nodes: HordeNodes): Lit {
  const st = nodes.state
  const p = nodes.local
  const pattern = N(vec2(p.x.add(p.z.mul(0.7)).mul(1.9), p.y.add(p.z.mul(0.4)).mul(1.9))).r.mul(0.7)
    .add(N(p.xz.mul(7.3).add(p.y.mul(3.1))).g.mul(0.3))
  const front = st.y.mul(1.18)
  m.maskNode = pattern.greaterThan(front.sub(0.02))
  const edge = smoothstep(front.add(0.09), front, pattern).mul(st.y.greaterThan(0.001).select(float(1), float(0)))
  // heat: 1 is a dull cherry glow over the part (a blast's scorching), the burning edge is hotter
  const kelvin = max(st.x.mul(1250).add(600), edge.mul(2300).add(600))
  m.emissiveNode = blackbody(kelvin)
  return m
}

function standard(nodes: HordeNodes, spec: { color: Node<'vec3'> | Node<'color'>; metal: Node<'float'> | number; rough: Node<'float'>; coat?: number }): Lit {
  const m = (spec.coat ? new MeshPhysicalNodeMaterial() : new MeshStandardNodeMaterial()) as Lit
  m.colorNode = spec.color
  m.metalnessNode = typeof spec.metal === 'number' ? float(spec.metal) : spec.metal
  m.roughnessNode = spec.rough
  if (spec.coat) {
    const phys = m as unknown as MeshPhysicalNodeMaterial
    phys.clearcoatNode = float(spec.coat)
    phys.clearcoatRoughnessNode = float(0.05)
  }
  m.positionNode = nodes.position
  return damage(m, nodes)
}

/**
 * Slot materials (the Blender preview's `sol/mats.py` slots): satin anodised
 * alloy with fine brushing and handling smudges, gloss black clear-coated
 * polymer shells, satin black housings, tyre rubber, machined castings and
 * steel, smoked visor glass, the unit's red paint, and the emissive strips
 * and blade (unlit, no shadow).
 */
export function createSoldierMaterials(nodes: HordeNodes): Record<string, Material> {
  const p = nodes.local
  const brush = N(vec2(p.x.add(p.y).mul(0.6), p.z.mul(9.5))).b
  const smudge = N(p.xz.mul(1.3).add(p.y.mul(0.7))).r
  const grain = N(p.xy.mul(5.1).add(p.z.mul(3.7))).g
  const M: Record<string, Material> = {}
  M.alloy = standard(nodes, {
    color: mix(color(0x9ea3a9), color(0xc9cdd2), brush.mul(0.4).add(smudge.mul(0.6))),
    metal: 1,
    rough: float(0.24).add(brush.mul(0.08)).add(smudge.mul(0.12)),
  })
  M.alloyDark = standard(nodes, { color: mix(color(0x5c6167), color(0x767b82), smudge), metal: 1, rough: float(0.34).add(smudge.mul(0.1)) })
  M.shell = standard(nodes, { color: color(0x0b0c0e), metal: 0, rough: float(0.3).add(smudge.mul(0.12)), coat: 1 })
  M.polymer = standard(nodes, { color: color(0x151618).mul(grain.mul(0.3).add(0.85)), metal: 0, rough: float(0.55).add(grain.mul(0.15)) })
  M.rubber = standard(nodes, { color: color(0x121212).mul(grain.mul(0.2).add(0.9)), metal: 0, rough: float(0.9) })
  M.mech = standard(nodes, { color: mix(color(0x2c3035), color(0x3d4248), grain), metal: 0.9, rough: float(0.36).add(grain.mul(0.1)) })
  M.steel = standard(nodes, { color: mix(color(0x80858b), color(0x9aa0a6), brush), metal: 1, rough: float(0.22).add(smudge.mul(0.1)) })
  M.visor = standard(nodes, { color: color(0x040506), metal: 0.2, rough: float(0.05), coat: 1 })
  M.red = standard(nodes, { color: color(0xb3231a).mul(smudge.mul(0.15).add(0.9)), metal: 0, rough: float(0.4).add(smudge.mul(0.1)), coat: 0.6 })

  const glow = new MeshBasicNodeMaterial()
  glow.positionNode = nodes.position
  glow.colorNode = color(0x6fd8ff).mul(nodes.state.z.mul(7))
  glow.userData.emissive = true
  M.glow = glow

  const blade = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending })
  blade.positionNode = nodes.bladePosition
  // a white-hot core under a cyan sheath: brighter toward the axis
  const along = smoothstep(0, 0.12, p.z).mul(smoothstep(1.25, 1.05, p.z))
  blade.colorNode = mix(color(0x6fd8ff), color(0xeafcff), float(0.55)).mul(nodes.state.w.mul(18).mul(along.mul(0.5).add(0.5)))
  blade.userData.emissive = true
  M.blade = blade
  return M
}

/** What the sun's shadow pass draws for the whole horde: the proxy, shrinking as parts dissolve. */
export function createShadowMaterial(nodes: HordeNodes): Material {
  const m = new MeshBasicNodeMaterial({ colorWrite: false })
  m.positionNode = nodes.shadowPosition
  return m
}
