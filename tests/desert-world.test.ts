import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Scene, Vector3 } from 'three/webgpu'
import { DesertWorld } from '../src/worlds/desert/world.ts'
import { TyreTracks } from '../src/worlds/desert/tyre-tracks.ts'
import { Footprints } from '../src/worlds/desert/footprints.ts'
import { DesertTerrain } from '../src/worlds/desert/terrain.ts'
import { DesertSurface } from '../src/worlds/desert/surface.ts'
import { Dust } from '../src/worlds/desert/dust.ts'
import { mirrorCitadel } from '../tools/mirror.ts'

const citadel = await mirrorCitadel()

/** A point on the citadel's ceramic paving (the forecourt's yard) and one on the open sand far off. */
function grounds(world: DesertWorld): { paved: Vector3; sand: Vector3 } {
  const yard = world.citadel.plan.sectors.find((s) => s.role === 'forecourt')!.yard.at
  const w = world.citadel.toWorld(yard[0], yard[1])
  const paved = new Vector3(w.x, world.citadel.floorAt(w.x, w.z), w.z)
  expect(world.citadel.floor.surface(paved.x, paved.z)).toBe('ceramic')
  const sand = new Vector3(paved.x + 900, 0, paved.z + 900)
  expect(world.citadel.floor.surface(sand.x, sand.z)).toBeNull()
  return { paved, sand }
}

describe('desert collision field', () => {
  it('recenters existing collider objects with their rock instances', () => {
    const scene = new Scene()
    const world = new DesertWorld(scene, citadel)
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
    const tracks = new TyreTracks(new Scene(), new DesertTerrain([]))
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
    const prints = new Footprints(new Scene(), new DesertTerrain([]))
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

describe("contact on the citadel's floor", () => {
  const scene = new Scene()
  const world = new DesertWorld(scene, citadel)
  const make = () => {
    const surface = new DesertSurface(scene, world.citadel.floor, world.terrain, world.ground)
    return { surface, ...grounds(world) }
  }
  const live = (surface: DesertSurface): number => surface.dust.age.filter((a) => a < 1e8).length

  it('leaves footprints in the sand but none on the ceramic', () => {
    const { surface, paved, sand } = make()
    const forward = new Vector3(0, 0, 1)
    surface.footprint(paved, forward, 1, 0.5, 1)
    expect(surface.footprints.stamped).toBe(0)
    surface.footprint(sand, forward, 1, 0.5, 1)
    expect(surface.footprints.stamped).toBe(1)
  })

  it('raises only a scuff of dust off the ceramic, and a crowd fight\'s bursts are budgeted', () => {
    const { surface, paved, sand } = make()
    surface.burst(sand, 1, 28)
    const onSand = live(surface)
    const { surface: s2 } = make()
    s2.burst(paved, 1, 28)
    expect(live(s2)).toBeLessThan(onSand * 0.4)
    // a burst of blows in one frame: no more than the budget's worth of puffs
    const { surface: s3 } = make()
    for (let i = 0; i < 40; i++) s3.burst(sand, 1, 28)
    expect(live(s3)).toBeLessThanOrEqual(120)
    // it refills over time: a walk's footfalls always raise their dust
    for (let i = 0; i < 20; i++) {
      s3.update(0.4)
      const before = live(s3)
      s3.burst(sand, 1, 30)
      expect(live(s3) - before).toBeGreaterThanOrEqual(25)
    }
  })
})

describe('fight dust', () => {
  const coverage = (d: InstanceType<typeof Dust>): number => d.fill
  it('holds a crowd fight\'s dust under its ceiling but never thins a car\'s tyres', () => {
    const dust = new Dust(new Scene(), new DesertTerrain([]))
    const p = new Vector3()
    // a fight: shells' surges every few seconds, blows and footfalls between
    let peak = 0
    for (let i = 0; i < 60 * 16; i++) {
      const t = i / 60
      if (i % 240 === 0) { dust.surge(p, 2.1, 0.3); dust.surge(p, 2.6, 0.6) }
      if (i % 2 === 0) dust.burst(p, 0.8, 8)
      if (i % 20 === 0) dust.burst(p, 1, 30)
      dust.update(1 / 60)
      if (t > 6) peak = Math.max(peak, coverage(dust))
    }
    expect(peak).toBeLessThan(1400)
    // the air full of it: a drifting tyre still throws its whole roost
    const before = dust.age.filter((a) => a < 1e8).length
    for (let i = 0; i < 30; i++) dust.wheel(p, new Vector3(10, 0, 0), new Vector3(0, 0, 8), 1 / 60)
    const tyres = dust.age.filter((a) => a < 1e8).length - before
    const clear = new Dust(new Scene(), new DesertTerrain([]))
    for (let i = 0; i < 30; i++) clear.wheel(p, new Vector3(10, 0, 0), new Vector3(0, 0, 8), 1 / 60)
    expect(tyres).toBeGreaterThan(clear.age.filter((a) => a < 1e8).length * 0.6)
  })

  it('throws a smaller, shorter cloud from a shell than from a special\'s blast', () => {
    const peakOf = (strength: number): [number, number] => {
      const dust = new Dust(new Scene(), new DesertTerrain([]))
      dust.surge(new Vector3(), 3, strength)
      let peak = 0, last = 0
      for (let i = 0; i < 60 * 12; i++) {
        dust.update(1 / 60)
        peak = Math.max(peak, dust.fill)
        if (dust.fill > 20) last = i / 60
      }
      return [peak, last]
    }
    const [shell, shellLasts] = peakOf(0.4)
    const [special, specialLasts] = peakOf(1)
    expect(shell).toBeLessThan(special * 0.15)
    expect(shellLasts).toBeLessThan(specialLasts * 0.7)
  })
})

describe('a fight\'s dust on the ground', () => {
  it('raises a quarter of a walk\'s burst on the sand, and 30 % of that on the ceramic; a special\'s surge keeps its strength', () => {
    const scene = new Scene()
    const world = new DesertWorld(scene, citadel)
    const { paved, sand } = grounds(world)
    const raised = (fight: 'none' | 'combo' | 'special', at: Vector3, what: (s: DesertSurface) => void): number => {
      const surface = new DesertSurface(new Scene(), world.citadel.floor, world.terrain, world.ground)
      surface.fight = fight
      what(surface)
      return surface.dust.age.filter((a) => a < 1e8).length
    }
    const walk = raised('none', sand, (s) => s.burst(sand, 1, 40))
    const onSand = raised('combo', sand, (s) => s.burst(sand, 1, 40))
    const onConcrete = raised('combo', paved, (s) => s.burst(paved, 1, 40))
    expect(onSand).toBe(Math.round(walk * 0.25))
    expect(onConcrete).toBe(Math.round(walk * 0.25 * 0.3))
    const surge = raised('none', sand, (s) => s.surge(sand, 6, 0.6))
    expect(raised('combo', sand, (s) => s.surge(sand, 6, 0.6))).toBeLessThan(surge * 0.6)
    expect(raised('special', sand, (s) => s.surge(sand, 6, 0.6))).toBe(surge)
  })
})
