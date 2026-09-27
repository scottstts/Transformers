import { Box3, BufferGeometry, Float32BufferAttribute, Frustum, InstancedBufferAttribute, InstancedMesh, Matrix4, Uint16BufferAttribute, Vector3, type Material, type Node, type PerspectiveCamera, type Scene } from 'three/webgpu'
import { attribute, clamp, distance, fract, max, positionGeometry, uniform, varying, vec3 } from 'three/tsl'
import type { DesertTerrain, Occlusion } from './terrain.ts'

/**
 * The terrain's mesh: a continuous-LOD quadtree (CDLOD) of instanced grid
 * patches round the camera. A node of level L is `NODE << L` m square with
 * `CELLS` cells (spacing 2^L m) and is drawn while the camera is within
 * `RANGE << L` m of it; toward the end of its range each vertex slides onto
 * the next coarser grid (odd vertices onto their even neighbours), so where
 * a node meets a coarser one their edges coincide: no cracks, no popping.
 *
 * The patches are two instanced draws (whole nodes, and quarter nodes drawn
 * at their parent's density where only some children are in range). Every
 * vertex's height comes from the landform in the vertex shader, and the
 * selection is a few hundred box tests a frame on the CPU, frustum-culled.
 */
const CELLS = 32
/** level-0 node size and range (m) */
const NODE = 32
const RANGE = 80
const LEVELS = 7
/** a vertex starts sliding onto the coarser grid at this share of its level's range */
const MORPH_START = 0.72
/** height bounds for culling (m): the landform stays well inside them */
const LOW = -16
const HIGH = 20
const MAX_NODES = 640

function grid(cells: number): BufferGeometry {
  const g = new BufferGeometry()
  const pos: number[] = []
  for (let j = 0; j <= cells; j++) for (let i = 0; i <= cells; i++) pos.push(i, 0, j)
  const idx: number[] = []
  const row = cells + 1
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1
      idx.push(a, c, b, b, c, d)
    }
  }
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setIndex(new Uint16BufferAttribute(idx, 1))
  return g
}

export class TerrainMesh {
  readonly full: InstancedMesh
  readonly quarter: InstancedMesh
  private readonly fullNodes: InstancedBufferAttribute
  private readonly quarterNodes: InstancedBufferAttribute
  /** the point the LOD is measured from (the view camera), for the vertex morph */
  private readonly centre = uniform(new Vector3())
  private readonly frustum = new Frustum()
  private readonly projection = new Matrix4()
  private readonly box = new Box3()
  private nFull = 0
  private nQuarter = 0
  private cx = 0
  private cz = 0

  constructor(scene: Scene, terrain: DesertTerrain, material: (position: TerrainVertex) => Material) {
    const fullGeometry = grid(CELLS)
    const quarterGeometry = grid(CELLS / 2)
    this.fullNodes = new InstancedBufferAttribute(new Float32Array(MAX_NODES * 4), 4)
    this.quarterNodes = new InstancedBufferAttribute(new Float32Array(MAX_NODES * 4), 4)
    fullGeometry.setAttribute('node', this.fullNodes)
    quarterGeometry.setAttribute('node', this.quarterNodes)

    // node: (x0, z0, spacing, range) in m
    const node = attribute('node', 'vec4')
    const g = positionGeometry.xz
    const spacing = node.z
    const range = node.w
    const unmorphed = node.xy.add(g.mul(spacing))
    const morph = clamp(distance(unmorphed, this.centre.xz).sub(range.mul(MORPH_START)).div(range.mul(1 - MORPH_START)), 0, 1)
    const xz: Node<'vec2'> = node.xy.add(g.sub(fract(g.mul(0.5)).mul(2).mul(morph)).mul(spacing)).toVar()
    const height: Node<'float'> = terrain.heightNode(xz).toVar()
    // slope sampled at the mesh's own spacing: far patches shade as smoothly as they are shaped
    const slope = varying(terrain.slopeNode(xz, height, max(spacing.mul(0.5), 0.5)))
    const mat = material({ position: vec3(xz.x, height, xz.y), slope, xz, occlusion: terrain.occlusion })

    const make = (geometry: BufferGeometry): InstancedMesh => {
      const mesh = new InstancedMesh(geometry, mat, MAX_NODES)
      mesh.count = 0
      mesh.frustumCulled = false
      mesh.receiveShadow = true
      mesh.castShadow = false
      scene.add(mesh)
      return mesh
    }
    this.full = make(fullGeometry)
    this.quarter = make(quarterGeometry)
  }

  /** Choose the patches for this view. */
  update(camera: PerspectiveCamera): void {
    camera.updateMatrixWorld()
    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.projection, camera.coordinateSystem)
    this.cx = camera.position.x
    this.cz = camera.position.z
    this.centre.value.copy(camera.position)
    this.nFull = 0
    this.nQuarter = 0
    const top = LEVELS - 1
    const size = NODE << top
    const reach = RANGE << top
    const x0 = Math.floor((this.cx - reach) / size) * size
    const z0 = Math.floor((this.cz - reach) / size) * size
    for (let x = x0; x < this.cx + reach; x += size) {
      for (let z = z0; z < this.cz + reach; z += size) this.select(x, z, top)
    }
    this.nFull = Math.min(this.nFull, MAX_NODES)
    this.nQuarter = Math.min(this.nQuarter, MAX_NODES)
    this.full.count = this.nFull
    this.quarter.count = this.nQuarter
    this.fullNodes.addUpdateRange(0, this.nFull * 4)
    this.fullNodes.needsUpdate = true
    this.quarterNodes.addUpdateRange(0, this.nQuarter * 4)
    this.quarterNodes.needsUpdate = true
  }

  /**
   * For a shader warm-up: both patch draws have at least one instance (a view
   * with no quarter patches would leave that draw to be first built mid-game).
   * Returns the restore.
   */
  reveal(): () => void {
    const counts = [this.full.count, this.quarter.count]
    this.full.count = Math.max(1, counts[0])
    this.quarter.count = Math.max(1, counts[1])
    return () => {
      this.full.count = counts[0]
      this.quarter.count = counts[1]
    }
  }

  /** Select node (x, z, level); false when it lies beyond its level's range (its parent draws the area). */
  private select(x: number, z: number, level: number): boolean {
    const size = NODE << level
    const range = RANGE << level
    if (!this.within(x, z, size, range)) return false
    this.box.min.set(x, LOW, z)
    this.box.max.set(x + size, HIGH, z + size)
    if (!this.frustum.intersectsBox(this.box)) return true
    if (level === 0 || !this.within(x, z, size, RANGE << (level - 1))) {
      this.add(this.fullNodes, this.nFull++, x, z, size / CELLS, range)
      return true
    }
    const half = size / 2
    for (let k = 0; k < 4; k++) {
      const qx = x + (k & 1) * half, qz = z + (k >> 1) * half
      if (!this.select(qx, qz, level - 1)) this.add(this.quarterNodes, this.nQuarter++, qx, qz, size / CELLS, range)
    }
    return true
  }

  private add(nodes: InstancedBufferAttribute, i: number, x: number, z: number, spacing: number, range: number): void {
    if (i >= MAX_NODES) return
    const a = nodes.array as Float32Array
    a[i * 4] = x
    a[i * 4 + 1] = z
    a[i * 4 + 2] = spacing
    a[i * 4 + 3] = range
  }

  /** The node's square comes within `radius` of the camera (xz). */
  private within(x: number, z: number, size: number, radius: number): boolean {
    const dx = Math.max(x - this.cx, 0, this.cx - (x + size))
    const dz = Math.max(z - this.cz, 0, this.cz - (z + size))
    return dx * dx + dz * dz < radius * radius
  }
}

/** What the terrain's material is built from: the displaced vertex, its landform slope (a varying) and its world xz. */
export interface TerrainVertex {
  position: Node<'vec3'>
  slope: Node<'vec2'>
  xz: Node<'vec2'>
  occlusion: Occlusion | null
}
