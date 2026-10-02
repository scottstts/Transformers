import { Box3, BoxGeometry, CylinderGeometry, Mesh, StorageBufferAttribute, Vector3 } from 'three/webgpu'
import { Fn, float, instanceIndex, storage, vec4 } from 'three/tsl'
import { createHeadlessRenderer } from './headless'
import { SkyVisibility } from '../../src/worlds/desert/citadel/sky-visibility'
import type { CitadelFloor } from '../../src/worlds/desert/citadel/floor'

type Kind = 'wall' | 'tower' | 'open' | 'contact' | 'alley' | 'roof' | 'overhang'
export interface AoProbeSample { kind: Kind; name: string; visibility: number }

/** Actual AO shader on isolated bodies and real contacts, with no lighting or post processing. */
export async function probeCitadelAo(): Promise<AoProbeSample[]> {
  const { renderer } = await createHeadlessRenderer(1, 1)
  const meshes: Mesh[] = []
  const samples: Array<{ kind: Kind; name: string; position: Vector3; normal: Vector3 }> = []
  const levels = [0.05, 0.3, 1, 2.5, 5, 7, 10, 14, 20]
  const wall = new Mesh(new BoxGeometry(120, 32, 6))
  wall.position.set(0, 16, -160)
  meshes.push(wall)
  for (const side of [-1, 1]) for (const y of levels) samples.push({ kind: 'wall', name: `wall side=${side} y=${y}`, position: new Vector3(20, y, -160 + side * 3), normal: new Vector3(0, 0, side) })
  const rotated = new Mesh(new BoxGeometry(70, 32, 6))
  rotated.rotation.y = 0.31; rotated.position.set(-160, 16, 0); rotated.updateMatrixWorld()
  meshes.push(rotated)
  for (const y of levels) {
    const position = new Vector3(10, y - 16, 3).applyMatrix4(rotated.matrixWorld)
    const normal = new Vector3(0, 0, 1).transformDirection(rotated.matrixWorld)
    samples.push({ kind: 'wall', name: `diagonal wall y=${y}`, position, normal })
  }
  const tower = new Mesh(new CylinderGeometry(24, 24, 32, 64))
  tower.position.set(160, 16, 0)
  meshes.push(tower)
  const angles = [0, 0.31, 0.75, 1.2, Math.PI / 2, Math.PI, Math.PI * 1.5]
  for (const angle of angles) for (const y of levels) {
    const normal = new Vector3(Math.cos(angle), 0, Math.sin(angle))
    samples.push({ kind: 'tower', name: `tower angle=${angle} y=${y}`, position: normal.clone().multiplyScalar(24).add(new Vector3(160, y, 0)), normal })
  }
  for (const angle of angles) for (const y of levels) samples.push({ kind: 'open', name: `open angle=${angle} y=${y}`, position: new Vector3(0, y, 0), normal: new Vector3(Math.cos(angle), 0, Math.sin(angle)) })
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) for (const distance of [1, 2, 4, 8, 16, 20]) {
    const position = new Vector3(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(24 + distance).add(new Vector3(160, 0, 0))
    samples.push({ kind: 'contact', name: `contact angle=${angle} distance=${distance}`, position, normal: new Vector3(0, 1, 0) })
  }
  for (const side of [-1, 1]) {
    const wall = new Mesh(new BoxGeometry(6, 32, 70))
    wall.position.set(side * 7, 16, 160)
    meshes.push(wall)
    for (const y of [0.3, 2.5, 7]) samples.push({ kind: 'alley', name: `alley side=${side} y=${y}`, position: new Vector3(side * 4, y, 160), normal: new Vector3(-side, 0, 0) })
  }
  const canopy = new Mesh(new BoxGeometry(32, 1, 32))
  canopy.position.set(0, 8.5, -80)
  meshes.push(canopy)
  samples.push({ kind: 'roof', name: 'under canopy', position: new Vector3(0, 0, -80), normal: new Vector3(0, 1, 0) })
  const lintel = new Mesh(new BoxGeometry(32, 4, 8))
  lintel.position.set(0, 26, -260)
  meshes.push(lintel)
  for (const y of [0.3, 2.5, 5, 7]) samples.push({ kind: 'overhang', name: `outward face below lintel y=${y}`, position: new Vector3(16, y, -260), normal: new Vector3(-1, 0, 0) })
  const footprints = meshes.map((m) => new Box3().setFromObject(m)).filter((b) => b.min.y <= 0)
  const rasterHeight = (x: number, z: number): number => {
    for (const b of footprints) if (x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z) return NaN
    return 0
  }
  const floor = {
    node: () => ({ height: float(0) }),
    rasterHeight,
  } as unknown as CitadelFloor
  const sky = new SkyVisibility(meshes, floor, 0, 0, 565)
  sky.bake(renderer)
  const positions = storage(new StorageBufferAttribute(new Float32Array(samples.flatMap((s) => [...s.position.toArray(), 0])), 4), 'vec4', samples.length).toReadOnly()
  const normals = storage(new StorageBufferAttribute(new Float32Array(samples.flatMap((s) => [...s.normal.toArray(), 0])), 4), 'vec4', samples.length).toReadOnly()
  const values = new StorageBufferAttribute(samples.length, 4)
  const output = storage(values, 'vec4', samples.length)
  const compute = Fn(() => {
    const position = positions.element(instanceIndex).xyz, normal = normals.element(instanceIndex).xyz
    const ao = sky.node(position, normal)
    output.element(instanceIndex).assign(vec4(ao, 0, 0, 0))
  })().compute(samples.length)
  renderer.compute(compute)
  const result = new Float32Array(await renderer.getArrayBufferAsync(values))
  const measured = samples.map((s, i) => ({ kind: s.kind, name: s.name, visibility: result[i * 4] }))
  for (const kind of ['wall', 'tower', 'open', 'contact', 'alley', 'roof', 'overhang'] as const) {
    const group = measured.filter((s) => s.kind === kind)
    console.log(`AO ${kind}: ${group.length} samples, visibility ${Math.min(...group.map((s) => s.visibility)).toFixed(5)}..${Math.max(...group.map((s) => s.visibility)).toFixed(5)}`)
  }
  renderer.dispose()
  return measured
}
