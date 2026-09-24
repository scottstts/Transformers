import { BufferAttribute, BufferGeometry, Vector3 } from 'three/webgpu'
import type { TransformerManifest, MeshRecord } from './format'

export interface DecodedMesh {
  material: string
  geometry: BufferGeometry
}

export interface TransformerAsset {
  manifest: TransformerManifest
  /** per node, the decoded meshes (node frame) */
  meshes: DecodedMesh[][]
  /** frames x nodes x (tx, ty, tz, qx, qy, qz, qw), local to the parent node */
  tracks: Float32Array
  scales?: Float32Array
  /** ground lift per frame */
  lift: Float32Array
}

/**
 * Fetches and decodes an exported model (`public/models/<name>.{json,bin}`);
 * any failure rejects with a message naming `label`.
 */
export async function loadTransformerAsset(name: string, label: string, base = import.meta.env.BASE_URL): Promise<TransformerAsset> {
  const root = `${base}models/${name}`
  const [manifestResponse, binaryResponse] = await Promise.all([fetch(`${root}.json`), fetch(`${root}.bin`)])
  if (!manifestResponse.ok) throw new Error(`${label} manifest: HTTP ${manifestResponse.status}`)
  if (!binaryResponse.ok) throw new Error(`${label} geometry: HTTP ${binaryResponse.status}`)
  const manifest = await manifestResponse.json() as TransformerManifest
  const buffer = await binaryResponse.arrayBuffer()
  return decodeTransformerAsset(manifest, buffer, label)
}

export function decodeTransformerAsset(manifest: TransformerManifest, buffer: ArrayBuffer, label = 'Transformer'): TransformerAsset {
  if (manifest.version !== 1) throw new Error(`Unsupported ${label} asset version ${manifest.version}`)
  const meshes = manifest.nodes.map((node) => node.meshes.map((record) => ({
    material: record.material,
    geometry: decodeGeometry(buffer, record),
  })))
  const nodeCount = manifest.nodes.length
  const tracks = new Float32Array(buffer, manifest.tracks, manifest.frames * nodeCount * 7)
  const lift = new Float32Array(buffer, manifest.lift, manifest.frames)
  const scales = manifest.scales === undefined ? undefined
    : new Float32Array(buffer, manifest.scales, manifest.frames * nodeCount * 3)
  return { manifest, meshes, tracks, scales, lift }
}

function decodeGeometry(buffer: ArrayBuffer, record: MeshRecord): BufferGeometry {
  const n = record.count
  const quantized = new Int16Array(buffer, record.position, n * 3)
  const octahedral = new Int16Array(buffer, record.normal, n * 2)
  const position = new Float32Array(n * 3)
  const normal = new Float32Array(n * 3)
  for (let axis = 0; axis < 3; axis++) {
    const lo = record.min[axis]
    const span = (record.max[axis] - lo) / 65535
    for (let i = 0; i < n; i++) position[i * 3 + axis] = lo + (quantized[i * 3 + axis] + 32768) * span
  }
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
  const index = record.index32
    ? new Uint32Array(buffer, record.index, record.triangles * 3)
    : new Uint16Array(buffer, record.index, record.triangles * 3)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setAttribute('normal', new BufferAttribute(normal, 3))
  geometry.setIndex(new BufferAttribute(index.slice(), 1))
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

/** 26-direction extreme vertices of a node's geometry (cheap ground contact). */
export function supportPoints(geometries: BufferGeometry[]): Vector3[] {
  const dirs: Vector3[] = []
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    if (x || y || z) dirs.push(new Vector3(x, y, z).normalize())
  }
  const best = dirs.map(() => ({ d: -Infinity, p: new Vector3() }))
  const v = new Vector3()
  for (const geometry of geometries) {
    const position = geometry.getAttribute('position')
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i)
      for (let k = 0; k < dirs.length; k++) {
        const d = v.dot(dirs[k])
        if (d > best[k].d) { best[k].d = d; best[k].p.copy(v) }
      }
    }
  }
  return best.filter((b) => Number.isFinite(b.d)).map((b) => b.p)
}
