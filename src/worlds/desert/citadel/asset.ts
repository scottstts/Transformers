import type { BufferGeometry, Mesh } from 'three/webgpu'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { fetchAssetBytes, fetchAssetJson, type AssetProgress } from '../../../assets'
import type { CitadelPlanData } from './plan'

/** The citadel's material slots and detail classes (blender/citadel_build, tasks/citadel.md sections 7 and 10). */
export const CITADEL_SLOTS = ['ceramic', 'ceramicBand', 'alloyDark', 'alloyLight', 'glass', 'glassGreen', 'light', 'paving', 'deck'] as const
export type CitadelSlot = typeof CITADEL_SLOTS[number]
export const CITADEL_LODS = ['mass', 'artic', 'detail'] as const
export type CitadelLod = typeof CITADEL_LODS[number]

/** One exported mesh: a bucket's (district's, or the spire's) geometry of one slot and class, in the fort frame. */
export interface CitadelPart {
  bucket: string
  slot: CitadelSlot
  lod: CitadelLod
  geometry: BufferGeometry
}

export interface CitadelAsset {
  plan: CitadelPlanData
  parts: CitadelPart[]
}

/**
 * The citadel's plan and geometry (`citadel.plan.json`, `citadel.glb`,
 * blender/citadel_build/export_game.py), downloaded together. `progress`
 * follows the geometry, the bulk of it.
 */
export async function loadCitadelAsset(progress?: AssetProgress): Promise<CitadelAsset> {
  const [plan, glb] = await Promise.all([
    fetchAssetJson<CitadelPlanData>('citadel.plan.json', 'Citadel plan'),
    fetchAssetBytes('citadel.glb', 'Citadel geometry', progress),
  ])
  return decodeCitadel(plan, glb)
}

/**
 * The GLB's meshes by their extras (`ctd_bucket`, `ctd_slot`, `ctd_lod`:
 * three strips the dots from node names). Every vertex is a float position
 * and a normal, in the fort frame; the `sand` slot is the Blender preview's
 * ground, which the game's terrain draws, so it is left out.
 */
export async function decodeCitadel(plan: CitadelPlanData, glb: ArrayBuffer): Promise<CitadelAsset> {
  await MeshoptDecoder.ready
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(glb, '')
  const parts: CitadelPart[] = []
  gltf.scene.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    const { ctd_bucket: bucket, ctd_slot: slot, ctd_lod: lod } = mesh.userData as Record<string, string>
    if (slot === 'sand') return
    if (!CITADEL_SLOTS.includes(slot as CitadelSlot) || !CITADEL_LODS.includes(lod as CitadelLod) || !bucket) {
      throw new Error(`Citadel geometry: a mesh without a known bucket, slot and class (${bucket}.${slot}.${lod})`)
    }
    const geometry = mesh.geometry
    if (!geometry.getAttribute('normal') || !geometry.getIndex()) throw new Error(`Citadel geometry: ${bucket}.${slot}.${lod} lacks normals or an index`)
    parts.push({ bucket, slot: slot as CitadelSlot, lod: lod as CitadelLod, geometry })
  })
  if (!parts.length) throw new Error('Citadel geometry: no meshes')
  return { plan, parts }
}
