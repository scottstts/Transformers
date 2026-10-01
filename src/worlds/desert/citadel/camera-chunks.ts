import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Vector3, type Matrix4 } from 'three/webgpu'

/** Chunk size (m): a camera ray of a few metres meets one to four of them. */
const CHUNK = 40
/** Ray queries need both sides of a wall, without changing its visible material. */
const CAMERA_RAY_MATERIAL = new MeshBasicMaterial({ side: DoubleSide })

/**
 * What the follow camera keeps clear of: the citadel's solid massing, split
 * into position-only meshes by square chunks of the ground (a triangle goes
 * to the chunk holding its centroid). The raycaster tests a mesh's bounding
 * sphere before its triangles, so a short camera ray touches only the few
 * chunks it passes near: a district bucket's meshes span hundreds of metres,
 * and testing their every triangle each frame cost milliseconds. Never drawn.
 */
export function cameraChunks(geometries: readonly BufferGeometry[], matrix: Matrix4): Mesh[] {
  const a = new Vector3(), b = new Vector3(), c = new Vector3()
  const out: Mesh[] = []
  const meshes: Array<{ positions: number[]; index: number[] }> = []
  const byChunk = new Map<string, { positions: number[]; index: number[] }>()
  for (const geometry of geometries) {
    const pos = geometry.getAttribute('position')
    const idx = geometry.getIndex()!
    // world positions of this geometry, computed once
    const world = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      a.fromBufferAttribute(pos, i).applyMatrix4(matrix)
      world[i * 3] = a.x; world[i * 3 + 1] = a.y; world[i * 3 + 2] = a.z
    }
    // per chunk, this geometry's vertices are renumbered as they are first used
    const remaps = new Map<string, Map<number, number>>()
    for (let t = 0; t < idx.count; t += 3) {
      const ia = idx.getX(t), ib = idx.getX(t + 1), ic = idx.getX(t + 2)
      a.fromArray(world, ia * 3); b.fromArray(world, ib * 3); c.fromArray(world, ic * 3)
      const key = `${Math.floor((a.x + b.x + c.x) / 3 / CHUNK)},${Math.floor((a.z + b.z + c.z) / 3 / CHUNK)}`
      let chunk = byChunk.get(key)
      if (!chunk) {
        chunk = { positions: [], index: [] }
        byChunk.set(key, chunk)
        meshes.push(chunk)
      }
      let remap = remaps.get(key)
      if (!remap) remaps.set(key, remap = new Map())
      for (const v of [ia, ib, ic]) {
        let n = remap.get(v)
        if (n === undefined) {
          n = chunk.positions.length / 3
          remap.set(v, n)
          chunk.positions.push(world[v * 3], world[v * 3 + 1], world[v * 3 + 2])
        }
        chunk.index.push(n)
      }
    }
  }
  for (const { positions, index } of meshes) {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
    const count = positions.length / 3
    g.setIndex(new BufferAttribute(count > 0xffff ? new Uint32Array(index) : new Uint16Array(index), 1))
    g.computeBoundingSphere()
    g.computeBoundingBox()
    const mesh = new Mesh(g, CAMERA_RAY_MATERIAL)
    mesh.matrixAutoUpdate = false
    mesh.updateMatrixWorld(true)
    out.push(mesh)
  }
  return out
}
