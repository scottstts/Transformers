import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Scene, Vector3 } from 'three/webgpu'
import { DesertWorld } from '../src/worlds/desert/world.ts'
import { TyreTracks } from '../src/worlds/desert/tyre-tracks.ts'
import { Footprints } from '../src/worlds/desert/footprints.ts'

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

describe('tyre tracks', () => {
  it('lays one continuous ribbon per wheel and restarts after the wheel lifts', () => {
    const tracks = new TyreTracks(new Scene())
    const geometry = tracks.mesh.geometry
    const position = geometry.getAttribute('position')
    const track = geometry.getAttribute('track')
    const p = new Vector3()
    const still = new Vector3()
    const roll = (frames: number, from: number) => {
      for (let i = 0; i < frames; i++) {
        tracks.mark(0, p.set(0, 0, from + i * 0.2), 0.32, 0, still)
        tracks.update(1 / 60)
      }
    }
    roll(20, 0) // 3.8 m at 0.2 m per frame: a quad every 0.4 m (the first frame only anchors)
    const quads = (): number => {
      let n = 0
      for (let q = 0; q < 64; q++) if (position.getZ(q * 4 + 2) !== 0 || position.getZ(q * 4) !== 0) n++
      return n
    }
    const first = quads()
    expect(first).toBe(9)
    // each quad starts where the previous one ended, and v runs on continuously
    for (let q = 1; q < first; q++) {
      expect(position.getZ(q * 4)).toBeCloseTo(position.getZ((q - 1) * 4 + 2), 6)
      expect(track.getY(q * 4)).toBeCloseTo(track.getY((q - 1) * 4 + 2), 6)
    }
    // the ribbon is the tyre width over the pressed fraction, centred on the wheel
    expect(Math.abs(position.getX(0) - position.getX(1))).toBeGreaterThan(0.32)
    // a frame without contact ends the ribbon; the next starts fresh at v = 0
    tracks.update(1 / 60)
    roll(10, 20)
    const q = first
    expect(position.getZ(q * 4)).toBeGreaterThanOrEqual(20)
    expect(track.getY(q * 4)).toBe(0)
  })
})

describe('footprints', () => {
  it('stamps an oriented sole decal with a rim around it', () => {
    const prints = new Footprints(new Scene())
    const position = prints.mesh.geometry.getAttribute('position')
    prints.stamp(new Vector3(5, 0, 2), new Vector3(1, 0, 0), 1, 0.5, 1)
    const xs = [0, 1, 2, 3].map((k) => position.getX(k))
    const zs = [0, 1, 2, 3].map((k) => position.getZ(k))
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(1)
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0.5)
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(5, 6)
    expect((Math.max(...zs) + Math.min(...zs)) / 2).toBeCloseTo(2, 6)
  })
})
