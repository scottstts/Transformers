import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Matrix4, Quaternion, Vector3 } from 'three/webgpu'
import { decodeSoldierAsset, type SoldierManifest, type SoldierSlotGeometry } from '../src/content/soldier/asset'

type CommanderManifest = Omit<SoldierManifest, 'dims'> & {
  dims: SoldierManifest['dims'] & { reach: number; bodyRadius: number }
}
const manifest = JSON.parse(readFileSync('public/models/commander.json', 'utf8')) as CommanderManifest
const binary = readFileSync('public/models/commander.bin')
const buffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength)
const asset = decodeSoldierAsset(manifest, buffer)
const index = new Map(manifest.bones.map((bone, i) => [bone.name, i]))
const shadowSkip = new Set(['glow', 'blade', 'visor'])
const world = manifest.bones.map(() => new Matrix4())
for (const [i, bone] of manifest.bones.entries()) {
  const local = new Matrix4().compose(new Vector3(...bone.t), new Quaternion(...bone.q), new Vector3(1, 1, 1))
  world[i].copy(bone.parent < 0 ? local : world[bone.parent].clone().multiply(local))
}

function visitVertices(meshes: SoldierSlotGeometry[], visit: (local: Vector3, bone: number, material: string) => void) {
  const local = new Vector3()
  for (const { material, geometry } of meshes) {
    const positions = geometry.getAttribute('position')
    const bones = geometry.getAttribute('boneIndex')
    for (let i = 0; i < positions.count; i++) visit(local.fromBufferAttribute(positions, i), bones.getX(i), material)
  }
}

function triangleBones(geometry: typeof asset.shadow) {
  const indices = geometry.getIndex()!
  const bones = geometry.getAttribute('boneIndex')
  const counts = new Array<number>(manifest.bones.length).fill(0)
  let crossesBones = false
  for (let i = 0; i < indices.count; i += 3) {
    const bone = bones.getX(indices.getX(i))
    crossesBones ||= bones.getX(indices.getX(i + 1)) !== bone || bones.getX(indices.getX(i + 2)) !== bone
    counts[bone]++
  }
  return { counts, crossesBones }
}

describe('commander exported asset', () => {
  it('has the required bones, a valid hierarchy and a weapon carried by the right hand', () => {
    expect(manifest.version).toBe(1)
    expect(manifest.name).toBe('commander')
    expect(manifest.bones.length).toBeLessThanOrEqual(32)
    expect(index.size).toBe(manifest.bones.length)
    const parents: Record<string, string | null> = {
      pelvis: null, spine: 'pelvis', chest: 'spine', neck: 'chest', head: 'neck', weapon: 'hand.R',
    }
    for (const side of ['L', 'R']) {
      Object.assign(parents, {
        [`thigh.${side}`]: 'pelvis', [`shin.${side}`]: `thigh.${side}`,
        [`foot.${side}`]: `shin.${side}`, [`wheel.${side}`]: `foot.${side}`,
        [`upperarm.${side}`]: 'chest', [`forearm.${side}`]: `upperarm.${side}`,
        [`hand.${side}`]: `forearm.${side}`,
      })
    }
    for (const [name, parent] of Object.entries(parents)) {
      expect(index.has(name), name).toBe(true)
      const bone = manifest.bones[index.get(name)!]
      expect(bone.parent, name).toBe(parent === null ? -1 : index.get(parent))
    }
    expect(index.has('blade')).toBe(true)
    expect(['weapon', 'hand.R']).toContain(manifest.bones[manifest.bones[index.get('blade')!].parent].name)
    expect(manifest.bones.filter((bone) => bone.parent < 0)).toHaveLength(1)
    manifest.bones.forEach((bone, i) => {
      expect(bone.parent).toBeGreaterThanOrEqual(-1)
      expect(bone.parent).toBeLessThan(i)
      expect([...bone.t, ...bone.q].every(Number.isFinite)).toBe(true)
      expect(Math.hypot(...bone.q)).toBeCloseTo(1, 5)
    })
  })

  it('decodes all geometry with valid bounds, normals, indices and rigid bone tags', () => {
    const records = [...manifest.lods.flatMap((lod) => lod.meshes), manifest.shadow]
    const geometries = [...asset.lods.flatMap((lod) => lod.map((mesh) => mesh.geometry)), asset.shadow]
    records.forEach((record, r) => {
      const geometry = geometries[r]
      const positions = geometry.getAttribute('position')
      const bones = geometry.getAttribute('boneIndex')
      const normals = geometry.getAttribute('normal')
      const indices = geometry.getIndex()!
      expect(record.material).toMatch(/^[a-z][a-z0-9_]*$/)
      expect(record.count).toBeGreaterThan(0)
      expect(record.index32).toBe(record.count >= 65536)
      expect(positions.count).toBe(record.count)
      expect(bones.count).toBe(record.count)
      expect(indices.count).toBe(record.triangles * 3)
      expect(record.min.every((v, axis) => Number.isFinite(v) && v <= record.max[axis])).toBe(true)
      expect([record.position, record.bone, record.index, ...(record.normal === undefined ? [] : [record.normal])]
        .every((offset) => Number.isInteger(offset) && offset >= 0 && offset % 4 === 0 && offset < binary.length)).toBe(true)
      let valid = true
      for (let i = 0; i < positions.count; i++) {
        const bone = bones.getX(i)
        valid &&= Number.isInteger(bone) && bone >= 0 && bone < manifest.bones.length
        for (let axis = 0; axis < 3; axis++) {
          const value = positions.getComponent(i, axis)
          valid &&= Number.isFinite(value) && value >= record.min[axis] - 1e-5 && value <= record.max[axis] + 1e-5
        }
        if (normals) {
          const length = Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i))
          valid &&= Number.isFinite(length) && Math.abs(length - 1) < 1e-5
        }
      }
      for (let i = 0; i < indices.count; i++) valid &&= indices.getX(i) < record.count
      expect(valid, record.material).toBe(true)
      expect(triangleBones(geometry).crossesBones).toBe(false)
      expect(normals !== undefined).toBe(record.normal !== undefined)
    })
  })

  it('fits all triangle budgets and omits glow, blade and visor triangles from the shadow', () => {
    expect(manifest.lods).toHaveLength(3)
    manifest.lods.forEach((lod, i) => {
      expect(lod.triangles).toBe(lod.meshes.reduce((n, mesh) => n + mesh.triangles, 0))
      expect(lod.triangles).toBeLessThanOrEqual([140000, 34000, 10000][i])
      expect(new Set(lod.meshes.map((mesh) => mesh.material)).size).toBe(lod.meshes.length)
    })
    const surfaceClasses = manifest.lods[0].meshes.filter((mesh) => !shadowSkip.has(mesh.material))
    expect(surfaceClasses.length).toBeLessThanOrEqual(12)
    expect(manifest.shadow.triangles).toBeLessThanOrEqual(9000)
    expect(manifest.shadow.normal).toBeUndefined()
    const expected = new Array<number>(manifest.bones.length).fill(0)
    for (const mesh of asset.lods[2].filter((mesh) => !shadowSkip.has(mesh.material))) {
      triangleBones(mesh.geometry).counts.forEach((count, bone) => { expected[bone] += count })
    }
    expect(triangleBones(asset.shadow).counts).toEqual(expected)
  })

  it('provides a positive-mass debris box containing every non-blade bone part', () => {
    const needed = new Set<number>()
    const pieces = new Map(manifest.pieces.map((piece) => [piece.bone, piece]))
    let contained = true
    visitVertices(asset.lods[0], (local, bone, material) => {
      if (material === 'blade') return
      needed.add(bone)
      const piece = pieces.get(bone)
      if (!piece) { contained = false; return }
      for (let axis = 0; axis < 3; axis++) {
        contained &&= Math.abs(local.getComponent(axis) - piece.center[axis]) <= piece.half[axis] + 1e-4
      }
    })
    expect(contained).toBe(true)
    expect([...pieces.keys()].sort()).toEqual([...needed].sort())
    expect(pieces.size).toBe(manifest.pieces.length)
    for (const piece of manifest.pieces) {
      expect(piece.half.every((value) => value > 0)).toBe(true)
      expect([...piece.center, ...piece.half, piece.mass].every(Number.isFinite)).toBe(true)
      expect(piece.mass).toBeGreaterThan(0)
      expect(piece.mass).toBeCloseTo(piece.half.reduce((volume, h) => volume * h, 8 * 1100), 1)
    }
  })

  it('reports measured size and the explicitly approved antenna-inclusive height', () => {
    const d = manifest.dims
    for (const field of ['height', 'wheelRadius', 'wheelX', 'ankleUp', 'thigh', 'shin', 'upper', 'fore',
      'hipZ', 'stanceX', 'bladeLength', 'bladeRadius', 'reach', 'bodyRadius'] as const) {
      expect(Number.isFinite(d[field]) && d[field] > 0, field).toBe(true)
    }
    let top = -Infinity, left = Infinity, right = -Infinity, radius = 0
    const pelvis = new Vector3().setFromMatrixPosition(world[index.get('pelvis')!])
    const point = new Vector3()
    visitVertices(asset.lods[0], (local, bone) => {
      const name = manifest.bones[bone].name
      point.copy(local).applyMatrix4(world[bone])
      if (name === 'head') top = Math.max(top, point.z)
      if (name !== 'weapon' && name !== 'blade') {
        left = Math.min(left, point.x)
        right = Math.max(right, point.x)
      }
      if (/^(foot|wheel)\./.test(name)) radius = Math.max(radius, Math.hypot(point.x - pelvis.x, point.y - pelvis.y))
    })
    expect(d.height).toBeCloseTo(top, 3)
    // User accepted 6.915 m including the antenna tips; do not shrink the model.
    expect(Math.abs(d.height - 6.914880275726318)).toBeLessThan(.01)
    expect(d.reach).toBeGreaterThanOrEqual(5)
    expect(d.reach).toBeLessThanOrEqual(8)
    expect(right - left).toBeLessThanOrEqual(4.4)
    expect(d.bodyRadius).toBeCloseTo(radius, 3)
    expect(radius).toBeLessThanOrEqual(1.9)
  })

  it('puts both wheel axles and tyres on the ground with the wheels as the lowest geometry', () => {
    const minima = new Map<number, number>()
    const point = new Vector3()
    let lowest = Infinity
    visitVertices(asset.lods[0], (local, bone) => {
      point.copy(local).applyMatrix4(world[bone])
      lowest = Math.min(lowest, point.z)
      minima.set(bone, Math.min(minima.get(bone) ?? Infinity, point.z))
    })
    for (const side of ['L', 'R']) {
      const bone = index.get(`wheel.${side}`)!
      const origin = new Vector3().setFromMatrixPosition(world[bone])
      const axle = new Vector3(1, 0, 0).transformDirection(world[bone])
      expect(origin.z).toBeCloseTo(manifest.dims.wheelRadius, 3)
      expect(Math.abs(axle.x)).toBeCloseTo(1, 5)
      expect(Math.abs(minima.get(bone)!)).toBeLessThan(.01)
      expect(minima.get(bone)! - lowest).toBeLessThan(.001)
    }
  })

  it('keeps energy on the blade bone along local +Z with matching exported dimensions', () => {
    let bottom = Infinity, tip = -Infinity, radius = 0, validBone = true
    visitVertices(asset.lods[0], (local, bone, material) => {
      if (material !== 'blade') return
      validBone &&= manifest.bones[bone].name === 'blade'
      bottom = Math.min(bottom, local.z)
      tip = Math.max(tip, local.z)
      radius = Math.max(radius, Math.hypot(local.x, local.y))
    })
    expect(validBone).toBe(true)
    expect(bottom).toBeCloseTo(0, 4)
    expect(tip).toBeCloseTo(manifest.dims.bladeLength, 4)
    expect(radius).toBeCloseTo(manifest.dims.bladeRadius, 4)
  })
})
