import { BufferAttribute, BufferGeometry } from 'three/webgpu'

/**
 * The enemy soldier asset (blender/soldier_build/sol/export.py): every material
 * slot is one merged geometry of all rigid parts, each vertex tagged with the
 * bone it rides and positioned in that bone's frame (authoring frame: x = the
 * soldier's left, -y forward, z up, metres).
 */
export interface SoldierMeshRecord {
  material: string
  count: number
  triangles: number
  min: [number, number, number]
  max: [number, number, number]
  position: number
  /** absent on the shadow proxy */
  normal?: number
  index: number
  index32: boolean
  bone: number
}

export interface SoldierBone {
  name: string
  parent: number
  /** rest translation and rotation (x, y, z, w) relative to the parent bone */
  t: [number, number, number]
  q: [number, number, number, number]
}

/** A rigid part for the break-apart debris: its box in the bone frame and its mass (kg). */
export interface SoldierPiece {
  bone: number
  center: [number, number, number]
  half: [number, number, number]
  mass: number
}

export interface SoldierDims {
  height: number
  wheelRadius: number
  /** tyre centre either side of a foot's centre (m) */
  wheelX: number
  /** ankle pivot above the axle (m) */
  ankleUp: number
  thigh: number
  shin: number
  upper: number
  fore: number
  hipZ: number
  stanceX: number
  bladeLength: number
  bladeRadius: number
}

export interface SoldierManifest {
  version: number
  name: string
  bones: SoldierBone[]
  lods: Array<{ meshes: SoldierMeshRecord[]; triangles: number }>
  shadow: SoldierMeshRecord
  pieces: SoldierPiece[]
  dims: SoldierDims
}

export interface SoldierSlotGeometry {
  material: string
  geometry: BufferGeometry
}

export interface SoldierAsset {
  manifest: SoldierManifest
  /** per LOD tier, one geometry per material slot */
  lods: SoldierSlotGeometry[][]
  /** positions and bones only: what the sun's shadow pass draws */
  shadow: BufferGeometry
}

export async function loadSoldierAsset(base = import.meta.env.BASE_URL): Promise<SoldierAsset> {
  const root = `${base}models/soldier`
  const [manifestResponse, binaryResponse] = await Promise.all([fetch(`${root}.json`), fetch(`${root}.bin`)])
  if (!manifestResponse.ok) throw new Error(`Soldier manifest: HTTP ${manifestResponse.status}`)
  if (!binaryResponse.ok) throw new Error(`Soldier geometry: HTTP ${binaryResponse.status}`)
  return decodeSoldierAsset(await manifestResponse.json() as SoldierManifest, await binaryResponse.arrayBuffer())
}

export function decodeSoldierAsset(manifest: SoldierManifest, buffer: ArrayBuffer): SoldierAsset {
  if (manifest.version !== 1) throw new Error(`Unsupported soldier asset version ${manifest.version}`)
  if (manifest.bones.length > 32) throw new Error('Soldier asset has too many bones')
  return {
    manifest,
    lods: manifest.lods.map((lod) => lod.meshes.map((record) => ({ material: record.material, geometry: decodeSoldierGeometry(buffer, record) }))),
    shadow: decodeSoldierGeometry(buffer, manifest.shadow),
  }
}

/** Positions (dequantized), octahedral normals, bone indices (float, one per vertex) and the index. */
export function decodeSoldierGeometry(buffer: ArrayBuffer, record: SoldierMeshRecord): BufferGeometry {
  const n = record.count
  const quantized = new Int16Array(buffer, record.position, n * 3)
  const position = new Float32Array(n * 3)
  for (let axis = 0; axis < 3; axis++) {
    const lo = record.min[axis]
    const span = (record.max[axis] - lo) / 65535
    for (let i = 0; i < n; i++) position[i * 3 + axis] = lo + (quantized[i * 3 + axis] + 32768) * span
  }
  const bones = new Uint8Array(buffer, record.bone, n)
  const bone = new Float32Array(n)
  for (let i = 0; i < n; i++) bone[i] = bones[i]
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setAttribute('boneIndex', new BufferAttribute(bone, 1))
  if (record.normal !== undefined) {
    const octahedral = new Int16Array(buffer, record.normal, n * 2)
    const normal = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      let x = octahedral[i * 2] / 32767
      let y = octahedral[i * 2 + 1] / 32767
      const z = 1 - Math.abs(x) - Math.abs(y)
      if (z < 0) {
        const ox = x
        x = (1 - Math.abs(y)) * Math.sign(ox || 1)
        y = (1 - Math.abs(ox)) * Math.sign(y || 1)
      }
      const length = Math.hypot(x, y, z) || 1
      normal[i * 3] = x / length
      normal[i * 3 + 1] = y / length
      normal[i * 3 + 2] = z / length
    }
    geometry.setAttribute('normal', new BufferAttribute(normal, 3))
  }
  const index = record.index32
    ? new Uint32Array(buffer, record.index, record.triangles * 3)
    : new Uint16Array(buffer, record.index, record.triangles * 3)
  geometry.setIndex(new BufferAttribute(index.slice(), 1))
  return geometry
}
