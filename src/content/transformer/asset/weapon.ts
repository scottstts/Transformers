import type { MeshRecord } from './format'
import { decodeGeometry, type DecodedMesh } from './loader'
import { fetchModel } from '../../../assets'

/**
 * A combat weapon exported from blender/weapons_build (`<name>.{json,bin}` on the asset CDN):
 * one rigid body in the weapon frame (+z along the haft or blade toward the
 * head, +x the cutting edge's direction, the main hand's grip at the origin;
 * a gun: +z along the barrels, +x its top, the pistol grip at the origin),
 * stored with the characters' mesh encoding.
 */
export interface WeaponManifest {
  version: number
  name: string
  meshes: MeshRecord[]
  triangles: number
  /** grip centres of the main and the second hand (weapon frame, m) */
  grips: { main: [number, number, number]; off: [number, number, number] }
  /** the cutting edge, its two ends (weapon frame, m) */
  edge: [[number, number, number], [number, number, number]]
  /** lowest and highest z of the geometry (m) */
  extent: [number, number]
  /** farthest point from the haft axis (m) */
  radius: number
  /** a gun's muzzles by name (weapon frame, m): where its rounds leave the bores along +z */
  muzzles?: Record<string, [number, number, number]>
}

export interface WeaponAsset {
  manifest: WeaponManifest
  meshes: DecodedMesh[]
}

export async function loadWeaponAsset(name: string, label: string): Promise<WeaponAsset> {
  const { manifest, buffer } = await fetchModel<WeaponManifest>(name, `${label} weapon`)
  return decodeWeaponAsset(manifest, buffer, label)
}

export function decodeWeaponAsset(manifest: WeaponManifest, buffer: ArrayBuffer, label = 'Weapon'): WeaponAsset {
  if (manifest.version !== 1) throw new Error(`Unsupported ${label} weapon version ${manifest.version}`)
  return { manifest, meshes: manifest.meshes.map((record) => ({ material: record.material, geometry: decodeGeometry(buffer, record) })) }
}
