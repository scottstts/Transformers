import { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardNodeMaterial, Uint32BufferAttribute } from 'three/webgpu'
import { float, normalWorld, positionWorld } from 'three/tsl'
import type { SegmentCollider } from '../../../game/types'
import { groundSurface } from '../materials.ts'
import { DUNE_WIND, valueNoise, type Occlusion } from '../terrain.ts'

/**
 * Sand the wind has banked against the citadel's lowest walls: a drift along
 * the foot of every wall face on T0 that looks into the wind (the dunes'
 * wind, terrain.ts), highest against the wall and running out concave onto
 * the ground, with a low tail on the lee side. Its height wanders along the
 * wall and it tapers off at the ends; a face turned partly across the wind
 * gathers less. The terraces above stay clean: the wind's sand load is near
 * the ground.
 *
 * Built from the wall colliders (a capsule's side is its wall's face, the
 * drift starting just inside it), kept to faces whose ground beyond is T0 in
 * the open: the height map shows neither a raised tier nor a roof a metre
 * and three out. The drift's outer edge dips just under the ground so the
 * two meet along a line, never coplanar. Its sand is the ground's own
 * surface (`groundSurface`), so it reads as the same sand.
 */
const STEP = 0.6
const ACROSS = [0, 0.08, 0.2, 0.36, 0.56, 0.78, 1]
/** windward drift height at the wall (m) and its run-out per metre of height */
const HEIGHT = 0.55
const RUN = 4.2
/** the lee tail: share of the windward height, and its run-out */
const LEE = 0.35
const LEE_RUN = 3
/** faces must look this far into the wind (cos) to gather sand */
const FACING = 0.15
/** the drift starts this far inside the capsule's side (m) */
const STEM_INSET = 0.15
/** the ground beyond a face must be no higher than this (m): T0 paving, not a terrace */
const LOW = 0.6
/** the drift's edge sinks this far under the ground (m) */
const DIP = 0.03
/** drifts are grouped into square chunks this size (m), each its own draw, so those out of view are culled */
const CHUNK = 90

export function buildDrifts(segments: readonly SegmentCollider[], topAt: (x: number, z: number) => number, occlusion: Occlusion | null): Mesh[] {
  const chunks = new Map<string, { pos: number[]; idx: number[] }>()
  const wx = DUNE_WIND.x, wz = DUNE_WIND.z
  for (const s of segments) {
    const dx = s.bx - s.ax, dz = s.bz - s.az
    const length = Math.hypot(dx, dz)
    if (length < 1.5) continue
    const tx = dx / length, tz = dz / length
    for (const side of [1, -1]) {
      // this face's outward normal; the wind blows toward +wind, so a face into it has n . wind < 0
      const nx = -tz * side, nz = tx * side
      const into = -(nx * wx + nz * wz)
      const lee = into < -FACING
      if (into < FACING && !lee) continue
      const start = s.r - STEM_INSET
      // low open ground beyond the face: no terrace or roof a metre and three out, at its middle
      const mx = (s.ax + s.bx) / 2, mz = (s.az + s.bz) / 2
      if (topAt(mx + nx * (s.r + 1), mz + nz * (s.r + 1)) > LOW || topAt(mx + nx * (s.r + 3), mz + nz * (s.r + 3)) > LOW) continue
      const chunk = `${Math.floor(mx / CHUNK)},${Math.floor(mz / CHUNK)}`
      if (!chunks.has(chunk)) chunks.set(chunk, { pos: [], idx: [] })
      const { pos, idx } = chunks.get(chunk)!
      const strength = lee ? LEE * Math.min(1, -into) : Math.min(1, into)
      const run = lee ? LEE_RUN : RUN
      const columns = Math.max(2, Math.round(length / STEP))
      const base = pos.length / 3
      for (let c = 0; c <= columns; c++) {
        const along = (c / columns) * length
        const x = s.ax + tx * along, z = s.az + tz * along
        const wander = 0.45 + 0.9 * valueNoise(x * 0.23 + 7.1, z * 0.23 - 3.4)
        const ends = smooth(0, 1.6, along) * smooth(0, 1.6, length - along)
        const h = HEIGHT * strength * wander * ends
        const reach = Math.max(0.4, h * run)
        for (const u of ACROSS) {
          const d = start + (s.r - start) * Math.min(1, u * 6) + reach * u
          const y = h * (1 - u) * (1 - u) * (1 + u) - DIP * u
          pos.push(x + nx * d, y, z + nz * d)
        }
      }
      const row = ACROSS.length
      for (let c = 0; c < columns; c++) {
        for (let k = 0; k < row - 1; k++) {
          const a = base + c * row + k, b = a + 1, e = a + row, f = e + 1
          // wound to face up whichever side of the wall it lies on
          if (side > 0) idx.push(a, b, e, b, f, e)
          else idx.push(a, e, b, b, e, f)
        }
      }
    }
  }
  const m = new MeshStandardNodeMaterial()
  const sand = groundSurface(positionWorld.xz)
  m.colorNode = sand.color
  m.roughnessNode = sand.roughness
  m.metalnessNode = float(0)
  if (occlusion) m.aoNode = occlusion(positionWorld, normalWorld)
  const meshes: Mesh[] = []
  for (const { pos, idx } of chunks.values()) {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.setIndex(new Uint32BufferAttribute(idx, 1))
    g.computeVertexNormals()
    const mesh = new Mesh(g, m)
    mesh.receiveShadow = true
    mesh.name = 'drifts'
    meshes.push(mesh)
  }
  return meshes
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
