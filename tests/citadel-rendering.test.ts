import { describe, expect, it } from 'vitest'
import { BoxGeometry, DirectionalLight, Mesh, PerspectiveCamera, Scene, Vector3 } from 'three/webgpu'
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js'
import { rasterEdge, rasterizeOccupancy } from '../src/worlds/desert/citadel/occupancy'
import { SunShadowNode } from '../src/rendering/sun-shadow'
import { Casings } from '../src/content/semi/combat/fx/casings'
import { HordeRenderer, type HordeInstance } from '../src/content/soldier/horde-renderer'
import { readSoldier } from './support/assets'

describe('citadel AO coverage', () => {
  it('rasterizes a diagonal wall as a connected thin edge rather than a filled rectangle', () => {
    const cells = 64, heights = new Float32Array(cells * cells)
    rasterEdge(heights, cells, 4.5, 4.5, 59.5, 59.5, 30)
    let count = 0
    for (let z = 0; z < cells; z++) for (let x = 0; x < cells; x++) {
      if (!heights[z * cells + x]) continue
      count++
      expect(Math.abs(x - z)).toBeLessThanOrEqual(1)
    }
    for (let x = 4; x <= 59; x++) expect(heights[x * cells + x]).toBe(30)
    expect(count).toBeLessThan(170)
    expect(heights[10 * cells + 50]).toBe(0)
  })

  it('is bounded and direction independent across cell corners and map edges', () => {
    for (const edge of [[-5, -5, 35, 35], [6, 2, 6, 28], [2, 16, 28, 16], [1.2, 28.6, 27.8, 2.4], [4, 4, 4, 4]]) {
      const a = new Float32Array(32 * 32), b = new Float32Array(32 * 32)
      rasterEdge(a, 32, edge[0], edge[1], edge[2], edge[3], 8)
      rasterEdge(b, 32, edge[2], edge[3], edge[0], edge[1], 8)
      expect(a, String(edge)).toEqual(b)
    }
  })

  it('resolves each column to the solid reaching its top', () => {
    const box = (w: number, h: number, d: number, x: number, y: number, z: number): Mesh => {
      const mesh = new Mesh(new BoxGeometry(w, h, d))
      mesh.position.set(x, y, z)
      return mesh
    }
    // 1 m cells over 64 m: a wall on the floor, a lintel with floor trim and an unpaired bevel strip under it
    const wall = box(30, 24, 4, 0, 12, -20)
    const lintel = box(20, 4, 8, 0, 22, 10)
    const trim = box(20, 0.05, 0.4, 0, 0.025, 10)
    const bevel = box(20, 0.4, 1, 0, 23.6, 12)
    bevel.geometry.setIndex(bevel.geometry.getIndex()!.array.slice(12, 18) as unknown as number[])
    for (const m of [wall, lintel, trim, bevel]) m.updateMatrixWorld()
    const { top, bottom } = rasterizeOccupancy([wall, lintel, trim, bevel], 64, -32, -32, 64, new Float32Array(64 * 64))
    const at = (x: number, z: number) => (z + 32) * 64 + x + 32
    for (const x of [-10, 0, 10]) {
      expect(top[at(x, -20)]).toBeCloseTo(24)
      expect(bottom[at(x, -20)]).toBe(0)
      for (const z of [8, 10, 12]) {
        expect(top[at(x, z)], `lintel ${x},${z}`).toBeCloseTo(24)
        expect(bottom[at(x, z)], `lintel ${x},${z}`).toBeCloseTo(20)
      }
    }
  })
})

describe('static shadow depth and cache', () => {
  const scene = new Scene(), sun = new DirectionalLight()
  sun.position.set(-55, 42, -72)
  const caster = new Mesh(new BoxGeometry(1100, 150, 1100))
  caster.position.y = 75
  scene.add(sun, sun.target, caster)
  const shadow = new SunShadowNode(sun, new CSMShadowNode(sun), [{ object: caster, coarsest: 3 }], {
    levels: [{ halfWidth: 24, mapSize: 2048 }, { halfWidth: 110, mapSize: 4096 }, { halfWidth: 190, mapSize: 4096 }, { halfWidth: 900, mapSize: 2048 }], margin: 160, casterHeight: 150,
  })
  const camera = new PerspectiveCamera()
  shadow.follow(camera)

  it('covers ground receivers and every caster height across committed maps while moving around the citadel', () => {
    const lightPoint = new Vector3()
    for (const at of [[0, 5, 80], [-500, 32, 700], [650, 14, -300], [-700, 140, -700], [0, 6, 0]]) {
      camera.position.set(at[0], at[1], at[2]); camera.updateMatrixWorld()
      // Coarse refreshes have a one-per-frame budget; inspect after it settles.
      for (let frame = 0; frame < 5; frame++) shadow.updateBefore()
      for (const level of shadow.inspect()) {
        const cos = level.worldToLight.elements[5], sin = level.worldToLight.elements[6]
        for (const y of [0, 8, 16, 24, 75, 150]) for (const side of [-1, 1]) {
          const ly = level.centre.y + side * level.halfY
          lightPoint.set(level.centre.x, ly, (y - ly * cos) / sin)
          const depth = level.centre.z - lightPoint.z
          expect(depth).toBeGreaterThan(level.near)
          expect(depth).toBeLessThan(level.far)
        }
        const worldBias = -level.bias * (level.far - level.near)
        expect(worldBias).toBeLessThan(0.1)
        expect(level.normalBias).toBeLessThanOrEqual(Math.max(0.03, level.texel * 0.5))
      }
    }
  })

  it('keeps stationary maps cached and bounds coarse refreshes without tying them to view LOD', () => {
    shadow.updateBefore()
    expect(shadow.redrawn).toBe(0)
    const before = shadow.inspect().map((s) => s.centre.toArray())
    caster.visible = false
    shadow.updateBefore()
    expect(shadow.redrawn).toBe(0)
    expect(shadow.inspect().map((s) => s.centre.toArray())).toEqual(before)
    camera.position.x += 120; camera.updateMatrixWorld()
    shadow.updateBefore()
    expect(shadow.redrawn).toBeLessThanOrEqual(2)
    caster.visible = true
  })
})

it('lands spent casings on a raised floor, preserving the original flat trajectory', () => {
  const casing = new Casings({ height: () => 24 })
  casing.eject(new Vector3(0, 29, 0), new Vector3(3, 4, 1))
  const attrs = casing as unknown as { a2: { array: Float32Array } }
  expect(attrs.a2.array[1]).toBe(24)
  const flat = new Casings()
  flat.eject(new Vector3(0, 5, 0), new Vector3(3, 4, 1))
  expect((flat as unknown as typeof attrs).a2.array[1]).toBe(0)
})

it('keeps previous enemy poses attached to identity across sorting, LOD changes and new bodies', () => {
  const renderer = new HordeRenderer(readSoldier())
  const make = (x: number): HordeInstance => {
    const rows = new Float32Array(renderer.bones * 12)
    rows[3] = x
    return { rows, heat: 0, dissolve: 0, lights: 1, blade: 0, distance: 10 }
  }
  const a = make(10), b = make(20), newborn = make(30)
  const buffers = renderer as unknown as { previousRows: { array: Float32Array }; previousSlots: { array: Int32Array } }
  renderer.draw([a, b])
  expect(Array.from(buffers.previousSlots.array.slice(0, 2))).toEqual([-1, -1])
  a.rows[3] = 12; b.rows[3] = 22
  a.distance = 80
  renderer.draw([b, a])
  expect(Array.from(buffers.previousSlots.array.slice(0, 2))).toEqual([1, 0])
  expect(buffers.previousRows.array[3]).toBe(10)
  expect(buffers.previousRows.array[renderer.bones * 12 + 3]).toBe(20)
  renderer.draw([a, newborn])
  expect(Array.from(buffers.previousSlots.array.slice(0, 2))).toEqual([1, -1])
})
