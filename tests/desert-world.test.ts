import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Scene, Vector3 } from 'three/webgpu'
import { DesertWorld } from '../src/worlds/desert/world.ts'

describe('desert collision field', () => {
  it('recenters existing collider objects with their rock instances', () => {
    const scene = new Scene()
    const world = new DesertWorld(scene)
    const camera = new PerspectiveCamera()
    const focus = new Vector3()
    world.update(camera, focus)
    expect(world.colliders.length).toBeGreaterThan(0)
    const first = world.colliders[0]
    const initialX = first.x
    focus.set(1000, 0, 1000)
    world.update(camera, focus)
    expect(world.colliders[0]).toBe(first)
    expect(first.x).not.toBe(initialX)
    expect(Number.isFinite(first.x)).toBe(true)
    expect(Number.isFinite(first.z)).toBe(true)
  })
})
