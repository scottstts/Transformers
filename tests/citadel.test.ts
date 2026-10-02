import { describe, expect, it, vi } from 'vitest'
import { PerspectiveCamera, Scene, Vector3 } from 'three/webgpu'
import { mirrorCitadel } from '../tools/mirror'
import { Citadel } from '../src/worlds/desert/citadel'
import { SURFACE_CODE } from '../src/worlds/desert/citadel/floor'
import { DesertWorld } from '../src/worlds/desert/world'
import { DesertSurface } from '../src/worlds/desert/surface'
import { Soldier } from '../src/game/enemies/soldier'
import { Horde } from '../src/game/enemies/horde'
import { AudioMix } from '../src/audio/mix'
import { ROSTER } from '../src/content/roster'
import { NO_CONTACT, readAsset, readSoldier, readWeapon } from './support/assets'

const asset = await mirrorCitadel()
const citadel = new Citadel(new Scene(), asset)

describe('published citadel', () => {
  it('preserves the exported triangle counts within every rendering budget', () => {
    expect(citadel.triangles).toBe(1_570_697)
    expect(asset.parts.length).toBeLessThanOrEqual(260)
    const limits = { mass: 1_000_000, artic: 1_300_000, detail: 1_000_000 }
    for (const [lod, limit] of Object.entries(limits)) {
      expect(asset.parts.filter((p) => p.lod === lod).reduce((n, p) => n + p.geometry.getIndex()!.count / 3, 0)).toBeLessThanOrEqual(limit)
    }
    const buckets = new Map<string, number>()
    for (const part of asset.parts) buckets.set(part.bucket, (buckets.get(part.bucket) ?? 0) + part.geometry.getIndex()!.count / 3)
    for (const [bucket, count] of buckets) expect(count, bucket).toBeLessThanOrEqual(bucket === 'spire' ? 120_000 : 350_000)
  })

  it('recovers the halo shell and turns it while keeping the spire and support arms fixed', () => {
    const ring = asset.parts.filter((p) => p.motion === 'halo')
    expect(ring.reduce((n, p) => n + p.geometry.getIndex()!.count / 3, 0)).toBe(2048)
    const before = citadel.group.matrixWorld.clone()
    citadel.update(new PerspectiveCamera(), 10)
    expect(citadel.halo.rotation.y).toBeCloseTo(0.25, 6)
    expect(citadel.group.matrixWorld.equals(before)).toBe(true)
    expect(citadel.halo.children.length).toBe(2)
    expect(citadel.staticCasters.some((c) => c.object.parent === citadel.halo)).toBe(true)
  })

  it('agrees on CPU and GPU floor heights and surfaces at raster cell centres across the whole site', () => {
    const { floor } = citadel
    const { map, cells } = floor
    const mismatches: string[] = []
    const p = { x: 0, z: 0 }
    for (let k = 0; k < cells.length; k += 23) {
      citadel.toWorld(map.x0 + ((k % map.nx) + 0.5) * map.cell, map.z0 + (Math.floor(k / map.nx) + 0.5) * map.cell, p)
      const h = floor.height(p.x, p.z)
      const surface = floor.surface(p.x, p.z)
      const code = Math.floor(cells[k] / 1000 + 1e-4)
      const expected = surface === null ? 0 : SURFACE_CODE[surface]
      if (code !== expected || Math.abs((Number.isNaN(h) ? 0 : h) - (cells[k] - code * 1000)) > 0.0003) {
        mismatches.push(`${p.x},${p.z}: CPU ${h}/${surface}, GPU ${cells[k]}`)
        if (mismatches.length >= 8) break
      }
    }
    expect(mismatches).toEqual([])
  })

  it('keeps every spawn bay and exit on its authored floor, and every garrison post on a walkable floor', () => {
    const p = { x: 0, z: 0 }
    const gaps: string[] = []
    for (const spawn of citadel.plan.spawns) for (const local of [spawn.at, spawn.exit]) {
      citadel.toWorld(...local, p)
      const height = citadel.floor.height(p.x, p.z)
      // Paving and the bays' floor skins sit up to 3 cm above their tier.
      if (!Number.isFinite(height) || Math.abs(height - spawn.y) > 0.08) gaps.push(`D${spawn.sector} spawn at ${local}: ${height}, expected ${spawn.y}`)
    }
    for (const post of citadel.plan.posts) for (const at of post.beat) {
      citadel.toWorld(...at, p)
      if (!Number.isFinite(citadel.floor.height(p.x, p.z))) gaps.push(`D${post.sector} beat at ${at}: no floor`)
    }
    expect(gaps).toEqual([])
  })
})

describe('citadel contact', () => {
  const world = new DesertWorld(new Scene(), asset)
  const point = (x: number, z: number): Vector3 => {
    const p = world.citadel.toWorld(x, z)
    return new Vector3(p.x, world.ground.height(p.x, p.z), p.z)
  }
  const make = () => new DesertSurface(new Scene(), world.citadel.floor, world.terrain, world.ground)

  it('uses the crown bridge height and deck response, and the ceramic dust keeps its birth tint', () => {
    const surface = make()
    const deck = point(0, 110), ceramic = point(0, 374)
    expect(surface.surface(deck.x, deck.z)).toBe('deck')
    expect(deck.y).toBeCloseTo(20, 6)
    surface.burst(ceramic, 1, 20)
    expect(surface.dust.aTone.array.slice(0, surface.dust.cursor).every((n) => n === 1)).toBe(true)
    surface.burst(new Vector3(900, 0, 0), 1, 20)
    expect(surface.dust.aTone.array.slice(5, surface.dust.cursor).every((n) => n === 0)).toBe(true)
    const chunks = vi.spyOn(surface.debris, 'burst')
    surface.eject(deck, 15, 8, new Vector3(0, 1, 0), 0.8, 0.2)
    expect(chunks).not.toHaveBeenCalled()
    expect(surface.deck.sparks.mesh.visible).toBe(true)
    surface.footprint(deck, new Vector3(0, 0, 1), 1, 0.5, 1)
    expect(surface.footprints.stamped).toBe(0)
  })

  it('warms the deck impact pool before a hit and restores its idle visibility', () => {
    const surface = make()
    expect(surface.deck.sparks.mesh.visible).toBe(false)
    surface.warm(true)
    expect(surface.deck.sparks.mesh.visible).toBe(true)
    surface.warm(false)
    expect(surface.deck.sparks.mesh.visible).toBe(false)
  })

  it.each(ROSTER.map((entry) => ({ name: entry.id, entry })))('routes $name walking, landing and fighting footfalls through the contacted material', ({ entry }) => {
    const character = entry.create({ ...readAsset(entry.id), weapon: readWeapon(entry.weapon) }, { ...NO_CONTACT, surface: () => 'deck' }, new AudioMix())
    const sound = vi.spyOn(character.effects.audio, 'footstep')
    character.effects.addFootstep('L', 1)
    character.effects.takeoff()
    character.effects.land(null)
    character.combat.effects.step('R', 1, false)
    expect(sound.mock.calls.length).toBeGreaterThanOrEqual(5)
    expect(sound.mock.calls.every((call) => call[1] === 'deck')).toBe(true)
  })
})

describe('floor timing in combat', () => {
  it('updates an enemy rig on the same frame as its floor changes, without changing its local jump or velocities', () => {
    const s = new Soldier(readSoldier().manifest)
    s.reset(0, 0, 0, 1, 0)
    s.y = 2
    s.vy = 8
    s.update(0)
    s.refresh()
    const before = new Vector3().setFromMatrixPosition(s.rig.world[s.rig.index.pelvis])
    s.floor = 8
    s.refresh()
    const after = new Vector3().setFromMatrixPosition(s.rig.world[s.rig.index.pelvis])
    expect(after.y - before.y).toBeCloseTo(8, 6)
    expect(s.y).toBe(2)
    expect(s.vy).toBe(8)
  })

  it('lets the first blow after moving to the crown reach its commander before an enemy simulation step', () => {
    const horde = new Horde(readSoldier(), citadel, NO_CONTACT, new AudioMix(), readSoldier('commander'))
    const commander = horde.commanderPosts[0].unit
    horde.targetAt(commander.x, commander.z)
    const health = commander.health
    expect(horde.hit({ shape: 'circle', kind: 'blunt', x: commander.x, z: commander.z, reach: 3, arc: Math.PI * 2, heading: 0, damage: 10, knock: 0, lift: 0, motion: 0, sweep: -1, radial: false, special: false, final: false, bite: true })).toBeGreaterThan(0)
    expect(commander.health).toBe(health - 10)
  })
})
