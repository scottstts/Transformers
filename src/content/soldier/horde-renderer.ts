import { Group, InstancedBufferGeometry, Mesh, StorageBufferAttribute, type BufferGeometry, type Material } from 'three/webgpu'
import type { SoldierAsset } from './asset'
import { createShadowMaterial, createSoldierMaterials, hordeNodes } from './materials'
import { SHADOW_ONLY_LAYER } from '../../rendering/layers'

/** Soldiers drawn at most at once (every fort's garrison and its debris). */
export const HORDE_CAPACITY = 96

/** One soldier to draw this frame: its bone rows (bones x 12 floats, affine world rows) and state. */
export interface HordeInstance {
  readonly rows: Float32Array
  heat: number
  dissolve: number
  lights: number
  blade: number
  /** distance to the camera (m): picks the detail tier; the list arrives sorted by it */
  distance: number
}

/** Detail tiers by distance (m): LOD0 up close, LOD1 across a fort, LOD2 beyond. */
export const LOD_DISTANCE = [26, 70] as const
/** Soldiers cast shadows inside this distance of the camera (the sun's shadow box is ~16 m around the focus). */
const SHADOW_DISTANCE = 42

/**
 * The whole horde in a fixed number of draws: one mesh per material slot per
 * detail tier (a run of instances each), plus one shadow proxy. The meshes
 * share two storage buffers: every drawn soldier's bone matrices and its
 * state (materials.ts). The caller culls and sorts; `draw` packs the list
 * tier by tier into the buffers, uploads only the part in use and sets each
 * mesh's run. Nothing here depends on how many soldiers there are, and a
 * soldier broken into pieces is the same instance with its bones flying apart.
 */
export class HordeRenderer {
  readonly object = new Group()
  readonly bones: number
  private readonly rows: StorageBufferAttribute
  private readonly state: StorageBufferAttribute
  private readonly tiers: Array<{ meshes: Mesh[]; geometries: InstancedBufferGeometry[] }> = []
  private readonly shadow: Mesh
  private readonly shadowGeometry: InstancedBufferGeometry
  private readonly counts = [0, 0, 0]

  constructor(asset: SoldierAsset) {
    this.bones = asset.manifest.bones.length
    this.rows = new StorageBufferAttribute(new Float32Array(HORDE_CAPACITY * this.bones * 12), 4)
    this.state = new StorageBufferAttribute(new Float32Array(HORDE_CAPACITY * 4), 4)
    const nodes = hordeNodes({ rows: this.rows, state: this.state, bones: this.bones })
    const materials = createSoldierMaterials(nodes)
    for (const lod of asset.lods) {
      const meshes: Mesh[] = []
      const geometries: InstancedBufferGeometry[] = []
      for (const { material, geometry } of lod) {
        const m: Material | undefined = materials[material]
        if (!m) throw new Error(`Soldier asset slot ${material} has no material`)
        const g = instanced(geometry)
        const mesh = new Mesh(g, m)
        mesh.frustumCulled = false
        mesh.castShadow = false
        mesh.receiveShadow = !m.userData.emissive
        mesh.matrixAutoUpdate = false
        mesh.visible = false
        // additive blade glow after the opaque horde
        if (material === 'blade') mesh.renderOrder = 2
        this.object.add(mesh)
        meshes.push(mesh)
        geometries.push(g)
      }
      this.tiers.push({ meshes, geometries })
    }
    this.shadowGeometry = instanced(asset.shadow)
    this.shadow = new Mesh(this.shadowGeometry, createShadowMaterial(nodes))
    this.shadow.layers.set(SHADOW_ONLY_LAYER)
    this.shadow.castShadow = true
    this.shadow.receiveShadow = false
    this.shadow.frustumCulled = false
    this.shadow.matrixAutoUpdate = false
    this.shadow.visible = false
    this.object.add(this.shadow)
  }

  /** Draw `list` (culled, sorted near to far) this frame. */
  draw(list: readonly HordeInstance[]): void {
    const n = Math.min(list.length, HORDE_CAPACITY)
    const rows = this.rows.array as Float32Array
    const state = this.state.array as Float32Array
    const stride = this.bones * 12
    const counts = this.counts
    counts[0] = counts[1] = counts[2] = 0
    let shadows = 0
    for (let i = 0; i < n; i++) {
      const s = list[i]
      rows.set(s.rows, i * stride)
      state[i * 4] = s.heat
      state[i * 4 + 1] = s.dissolve
      state[i * 4 + 2] = s.lights
      state[i * 4 + 3] = s.blade
      counts[s.distance < LOD_DISTANCE[0] ? 0 : s.distance < LOD_DISTANCE[1] ? 1 : 2]++
      if (s.distance < SHADOW_DISTANCE) shadows = i + 1
    }
    if (n > 0) {
      this.rows.clearUpdateRanges()
      this.rows.addUpdateRange(0, n * stride)
      this.rows.needsUpdate = true
      this.state.clearUpdateRanges()
      this.state.addUpdateRange(0, n * 4)
      this.state.needsUpdate = true
    }
    // tiers are consecutive runs: the list is sorted by distance and the tiers are distance bands
    let base = 0
    for (let t = 0; t < this.tiers.length; t++) {
      const tier = this.tiers[t]
      const count = counts[t]
      for (let k = 0; k < tier.meshes.length; k++) {
        tier.meshes[k].visible = count > 0
        tier.meshes[k].userData.base = base
        tier.geometries[k].instanceCount = count
      }
      base += count
    }
    this.shadow.visible = shadows > 0
    this.shadow.userData.base = 0
    this.shadowGeometry.instanceCount = shadows
  }

  /** Show every tier and the proxy for a shader compile (with one instance), or hide them again. */
  warm(on: boolean): void {
    for (const tier of this.tiers) {
      for (let k = 0; k < tier.meshes.length; k++) {
        tier.meshes[k].visible = on
        tier.meshes[k].userData.base = 0
        tier.geometries[k].instanceCount = on ? 1 : 0
      }
    }
    this.shadow.visible = on
    this.shadowGeometry.instanceCount = on ? 1 : 0
  }
}

function instanced(source: BufferGeometry): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry()
  g.index = source.index
  for (const name of Object.keys(source.attributes)) g.setAttribute(name, source.getAttribute(name))
  g.instanceCount = 0
  return g
}
