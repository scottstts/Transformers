import { BufferAttribute, BufferGeometry, Group, InstancedBufferGeometry, Mesh, StorageBufferAttribute, type Material } from 'three/webgpu'
import type { SoldierAsset } from './asset'
import { createShadowMaterial, createSoldierMaterials, hordeNodes } from './materials'
import { SHADOW_ONLY_LAYER } from '../../rendering/layers'

/** Soldiers drawn at most at once (the fortress's garrisons and their debris). */
export const HORDE_CAPACITY = 160

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
/**
 * Most soldiers drawn at LOD0 and at LOD1: a crowd pressing round the robot
 * would otherwise put ~85k triangles each on screen; beyond the nearest few
 * the next tier is indistinguishable in the melee.
 */
export const LOD_CAP = [18, 48] as const
/**
 * Shadows: the nearest soldiers (within NEAR_SHADOW m, at most NEAR_SHADOW_CAP)
 * cast from the detailed proxy, every other one within SHADOW_FAR (the sun's
 * farthest cascade) from a proxy of one box per part (~240 triangles). A
 * cut-off distance made shadows pop in as soldiers came near.
 */
const NEAR_SHADOW = 32
const NEAR_SHADOW_CAP = 20
export const SHADOW_FAR = 150

/**
 * The whole horde in a fixed number of draws: one mesh per material slot per
 * detail tier (a run of instances each), plus two shadow proxies. The meshes
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
  /** the detailed shadow proxy (near) and the box proxy (the rest) */
  private readonly shadows: Array<{ mesh: Mesh; geometry: InstancedBufferGeometry }> = []
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
    const shadowMaterial = createShadowMaterial(nodes)
    for (const source of [asset.shadow, pieceBoxes(asset)]) {
      const geometry = instanced(source)
      const mesh = new Mesh(geometry, shadowMaterial)
      mesh.layers.set(SHADOW_ONLY_LAYER)
      mesh.castShadow = true
      mesh.receiveShadow = false
      mesh.frustumCulled = false
      mesh.matrixAutoUpdate = false
      mesh.visible = false
      this.object.add(mesh)
      this.shadows.push({ mesh, geometry })
    }
  }

  /**
   * Draw `list` this frame: its first `visible` entries are on screen (culled,
   * sorted near to far); the rest are off screen but may throw a shadow into
   * view, and only cast.
   */
  draw(list: readonly HordeInstance[], visible = list.length): void {
    const n = Math.min(list.length, HORDE_CAPACITY)
    const shown = Math.min(visible, n)
    const rows = this.rows.array as Float32Array
    const state = this.state.array as Float32Array
    const stride = this.bones * 12
    const counts = this.counts
    counts[0] = counts[1] = counts[2] = 0
    let near = 0
    let far = 0
    for (let i = 0; i < n; i++) {
      const s = list[i]
      rows.set(s.rows, i * stride)
      state[i * 4] = s.heat
      state[i * 4 + 1] = s.dissolve
      state[i * 4 + 2] = s.lights
      state[i * 4 + 3] = s.blade
      if (i < shown) {
        // the list is sorted, so the caps keep each tier one consecutive run
        counts[s.distance < LOD_DISTANCE[0] && counts[0] < LOD_CAP[0] ? 0 : s.distance < LOD_DISTANCE[1] && counts[1] < LOD_CAP[1] ? 1 : 2]++
        if (s.distance < NEAR_SHADOW && near === i && near < NEAR_SHADOW_CAP) near = i + 1
      }
      if (s.distance < SHADOW_FAR) far = i + 1
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
    // near soldiers from the detailed proxy, the rest (farther, or off screen) from the boxes
    const [detailed, boxes] = this.shadows
    detailed.mesh.visible = near > 0
    detailed.mesh.userData.base = 0
    detailed.geometry.instanceCount = near
    boxes.mesh.visible = far > near
    boxes.mesh.userData.base = near
    boxes.geometry.instanceCount = Math.max(0, far - near)
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
    for (const { mesh, geometry } of this.shadows) {
      mesh.visible = on
      mesh.userData.base = 0
      geometry.instanceCount = on ? 1 : 0
    }
  }
}

/**
 * The cheap shadow proxy: every part's box (the debris boxes, in their bones'
 * frames), 12 triangles each; the blade casts none, as its glow doesn't.
 */
function pieceBoxes(asset: SoldierAsset): BufferGeometry {
  const pos: number[] = []
  const bone: number[] = []
  const idx: number[] = []
  const blade = asset.manifest.bones.findIndex((b) => b.name === 'blade')
  for (const p of asset.manifest.pieces) {
    if (p.bone === blade) continue
    const base = pos.length / 3
    for (let k = 0; k < 8; k++) {
      pos.push(p.center[0] + (k & 1 ? p.half[0] : -p.half[0]), p.center[1] + (k & 2 ? p.half[1] : -p.half[1]), p.center[2] + (k & 4 ? p.half[2] : -p.half[2]))
      bone.push(p.bone)
    }
    // faces (a depth pass: winding matters only for culling, kept outward)
    for (const [a, b, c, d] of [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]]) idx.push(base + a, base + b, base + c, base + a, base + c, base + d)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('boneIndex', new BufferAttribute(new Float32Array(bone), 1))
  g.setIndex(idx)
  return g
}

function instanced(source: BufferGeometry): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry()
  g.index = source.index
  for (const name of Object.keys(source.attributes)) g.setAttribute(name, source.getAttribute(name))
  g.instanceCount = 0
  return g
}
