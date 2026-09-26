import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Quaternion, Scene, Vector3, PerspectiveCamera } from 'three/webgpu'
import { readSoldier, NO_CONTACT } from './support/assets'
import { SoldierRig, createSoldierPose } from '../src/content/soldier/rig'
import { POSES, writePose } from '../src/content/soldier/poses'
import { Forts, FORT_SITES } from '../src/worlds/desert/fort'
import { planFort, insideWalls, outsideSector, sectorAt, GATE_WIDTH } from '../src/worlds/desert/fort/plan'
import { pushOut } from '../src/game/collide'
import { goldberg } from '../src/content/transformer/combat/fx/shield'
import { CarBarrier } from '../src/game/enemies/barrier'
import { Horde, type EnemyTarget } from '../src/game/enemies/horde'
import { SOLDIER, type Soldier } from '../src/game/enemies/soldier'
import { FortNav } from '../src/game/enemies/navigation'
import { Debris, DEBRIS_FADE, DEBRIS_LIE } from '../src/game/enemies/debris'
import { createMotionState } from '../src/game/types'
import { updateCar } from '../src/game/car-dynamics'
import { AudioMix } from '../src/audio/mix'
import { CYBERTRUCK_PROFILE } from '../src/content/cybertruck'
import type { HitEvent } from '../src/content/transformer/combat/hits'

const asset = readSoldier()
const DT = 1 / 60

// the horde and the debris draw on Math.random: seed it so every run is the same
beforeEach(() => {
  let seed = 12345
  vi.spyOn(Math, 'random').mockImplementation(() => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  })
  return () => vi.restoreAllMocks()
})

describe('soldier asset', () => {
  it('is a 3 m soldier on 20 bones, with lighter detail tiers and a piece per part', () => {
    const m = asset.manifest
    expect(m.bones.length).toBe(20)
    expect(m.lods.length).toBe(3)
    expect(m.lods[0].triangles).toBeGreaterThan(m.lods[1].triangles)
    expect(m.lods[1].triangles).toBeGreaterThan(m.lods[2].triangles)
    expect(m.shadow.triangles).toBeLessThan(m.lods[0].triangles / 8)
    expect(m.pieces.length).toBeGreaterThanOrEqual(19)
    // the rest pose's highest vertex: the helmet's crown
    const rig = new SoldierRig(m)
    rig.pose({ x: 0, z: 0, y: 0, yaw: 0, tilt: new Quaternion() }, createSoldierPose())
    let top = 0
    const v = new Vector3()
    for (const { geometry } of asset.lods[0]) {
      const p = geometry.getAttribute('position')
      const b = geometry.getAttribute('boneIndex')
      for (let i = 0; i < p.count; i += 7) top = Math.max(top, v.fromBufferAttribute(p, i).applyMatrix4(rig.world[b.getX(i)]).y)
    }
    expect(top).toBeGreaterThan(2.9)
    expect(top).toBeLessThan(3.12)
  })
})

describe('soldier rig', () => {
  it('keeps both wheel axles on the sand in every standing key pose', () => {
    const rig = new SoldierRig(asset.manifest)
    const pose = createSoldierPose()
    for (const name of ['guard', 'ready', 'roll', 'windup', 'strike', 'hitHigh', 'hitLow'] as const) {
      writePose(POSES[name], pose)
      rig.pose({ x: 3, z: -2, y: 0, yaw: 0.7, tilt: new Quaternion() }, pose)
      for (const side of ['L', 'R']) {
        const axle = new Vector3().setFromMatrixPosition(rig.world[rig.index[`wheel.${side}`]])
        expect(axle.y, `${name} ${side}`).toBeCloseTo(asset.manifest.dims.wheelRadius, 2)
      }
      for (const r of rig.rows) expect(Number.isFinite(r)).toBe(true)
    }
  })
})

describe('fortress plan', () => {
  const plan = planFort(FORT_SITES[0])
  const contact = { nx: 0, nz: 0, depth: 0 }

  it('rings the districts with a perimeter, keeps the barrier outside it and the citadel within', () => {
    expect(FORT_SITES.length).toBe(1)
    expect(plan.barrier).toBeGreaterThan(plan.outer + 10)
    expect(plan.sectors.map((s) => s.role).sort()).toEqual(['airfield', 'barracks', 'citadel', 'comms', 'fuel', 'gate', 'motorPool'])
    for (const c of plan.citadel) expect(insideWalls(plan, c[0], c[1])).toBe(true)
    expect(sectorAt(plan, plan.centre[0], plan.centre[1])).toBe(plan.sectors.length - 1)
  })

  it('opens every gate wide enough for the truck robot, joining the districts either side of it', () => {
    const outside = outsideSector(plan)
    expect(plan.gates.filter((g) => g.kind === 'outer').length).toBe(4)
    expect(plan.gates.filter((g) => g.kind === 'citadel').length).toBe(2)
    expect(plan.gates.filter((g) => g.kind === 'inner').length).toBe(6)
    for (const g of plan.gates) {
      expect(g.width).toBeGreaterThanOrEqual(GATE_WIDTH - 1)
      expect(g.sectors[0]).not.toBe(g.sectors[1])
      expect(sectorAt(plan, g.inside[0], g.inside[1])).toBe(g.sectors[0])
      expect(sectorAt(plan, g.outside[0], g.outside[1])).toBe(g.sectors[1])
      if (g.kind === 'outer') expect(g.sectors[1]).toBe(outside)
    }
    // every district reaches every other (and the outside) through the gates
    for (let a = 0; a <= outside; a++) for (let b = 0; b <= outside; b++) if (a !== b) expect(plan.nav[a][b], `${a} -> ${b}`).toBeGreaterThanOrEqual(0)
  })

  it('lays every building out in one district and gives each district its yard, posts and spawn doors', () => {
    for (const m of plan.modules) {
      // (the barriers outside, the pillars and gate thresholds on the wall lines)
      if (m.kind === 'jersey' || m.kind === 'pillar' || m.kind === 'gatehouse' || m.kind === 'apron') continue
      expect(insideWalls(plan, m.at[0], m.at[1]), m.kind).toBe(true)
    }
    const kinds = new Set(plan.modules.map((m) => m.kind))
    for (const k of ['keep', 'gatehouse', 'garage', 'radar', 'chu', 'canopy', 'container', 'bund', 'tank', 'helipad', 'radioMast', 'waterTower', 'tower', 'booth', 'apron', 'stair'] as const) expect(kinds.has(k), `has ${k}`).toBe(true)
    expect(plan.hangars.length).toBe(2)
    for (const s of plan.sectors) {
      expect(plan.posts.filter((p) => p.sector === s.index).length, s.role).toBeGreaterThanOrEqual(s.garrison)
      expect(plan.spawns.filter((p) => p.sector === s.index).length, s.role).toBeGreaterThanOrEqual(1)
      expect(sectorAt(plan, s.yard.at[0], s.yard.at[1])).toBe(s.index)
      // nothing stands in the yard
      for (const c of plan.circles) expect(Math.hypot(c.x - s.yard.at[0], c.z - s.yard.at[1]) - c.r, s.role).toBeGreaterThan(s.yard.r - 1)
    }
  })

  it('leaves every beat point standing free, in its own district', () => {
    for (const p of plan.posts) {
      for (const at of p.beat) {
        expect(pushOut({ x: at[0], z: at[1] }, SOLDIER.radius, plan.segments, plan.circles, contact), `beat ${at.map((v) => v.toFixed(1))}`).toBeNull()
        expect(sectorAt(plan, at[0], at[1])).toBe(p.sector)
      }
    }
    for (const d of plan.spawns) expect(pushOut({ x: d.exit[0], z: d.exit[1] }, SOLDIER.radius, plan.segments, plan.circles, contact)).toBeNull()
  })
})

describe('fortress access', () => {
  const plan = planFort(FORT_SITES[0])
  const contact = { nx: 0, nz: 0, depth: 0 }
  // walk a body of `radius` from (x, z) to district `to`'s yard the way FortNav leads it
  const walk = (nav: FortNav, radius: number, x: number, z: number, to: number): boolean => {
    const p = { x, z }
    const next = { x: 0, z: 0 }
    const yard = plan.sectors[to].yard.at
    for (let step = 0; step < 8000; step++) {
      const here = sectorAt(plan, p.x, p.z)
      if (!nav.next(p.x, p.z, here, to, next)) nav.approach(p.x, p.z, yard[0], yard[1], here, next)
      const d = Math.hypot(next.x - p.x, next.z - p.z)
      if (here === to && Math.hypot(yard[0] - p.x, yard[1] - p.z) < 1) return true
      p.x += ((next.x - p.x) / Math.max(d, 1e-6)) * Math.min(0.2, d)
      p.z += ((next.z - p.z) / Math.max(d, 1e-6)) * Math.min(0.2, d)
      pushOut(p, radius, plan.segments, plan.circles, contact)
    }
    return false
  }

  it('lets the truck robot walk in from outside the main gate to every district, through the gates it is routed by', () => {
    const nav = new FortNav(plan, CYBERTRUCK_PROFILE.robotRadius)
    const main = plan.gates[0]
    for (const s of plan.sectors) expect(walk(nav, CYBERTRUCK_PROFILE.robotRadius, main.at[0] + main.out[0] * 30, main.at[1] + main.out[1] * 30, s.index), `${s.role} yard`).toBe(true)
  })

  it('leads a soldier from every district to every other round whatever stands in the way', () => {
    const nav = new FortNav(plan, SOLDIER.radius)
    for (const a of plan.sectors) {
      for (const b of plan.sectors) {
        if (a === b) continue
        expect(walk(nav, SOLDIER.radius, a.yard.at[0], a.yard.at[1], b.index), `${a.role} -> ${b.role}`).toBe(true)
      }
    }
  })
})

describe('car barrier', () => {
  const forts = new Forts(new Scene())
  const fort = forts.list[0]
  const s = fort.plan.site

  const driveAt = (carForm: boolean, frames: number): { state: ReturnType<typeof createMotionState>; closest: number } => {
    const state = createMotionState()
    const start = fort.plan.barrier + 80
    state.pos.set(s.x + start, 0, s.z)
    state.yaw = -Math.PI / 2
    const barrier = new CarBarrier()
    const input = { driveThrottle: 1, driveSteering: 0, running: false }
    let closest = Infinity
    for (let i = 0; i < frames; i++) {
      updateCar(state, input, DT, false, CYBERTRUCK_PROFILE.drive)
      barrier.apply(state, forts, CYBERTRUCK_PROFILE.drive.maxSpeed, carForm)
      closest = Math.min(closest, Math.hypot(state.pos.x - s.x, state.pos.z - s.z))
    }
    return { state, closest }
  }

  it('slows a car driving straight at a fort to a stop at the perimeter', () => {
    const { state, closest } = driveAt(true, 60 * 20)
    expect(closest).toBeGreaterThanOrEqual(fort.plan.barrier - 1e-6)
    expect(closest).toBeLessThan(fort.plan.barrier + 3)
    expect(Math.abs(state.speed)).toBeLessThan(1)
  })

  it('lets anything but the car through', () => {
    const { closest } = driveAt(false, 60 * 20)
    expect(closest).toBeLessThan(fort.plan.barrier - 10)
  })
})

describe('horde', () => {
  const make = () => {
    const forts = new Forts(new Scene())
    const horde = new Horde(asset, forts, NO_CONTACT, new AudioMix())
    const camera = new PerspectiveCamera(42, 16 / 9, 0.1, 2000)
    const fort = forts.list[0]
    const plan = fort.plan
    const sector = (role: string) => plan.sectors.find((s) => s.role === role)!
    const target: EnemyTarget = { x: 0, z: 0, radius: 1.5, vx: 0, vz: 0, height: 5.6, heading: 0, guard: 0, present: true }
    const at = (x: number, z: number): void => {
      const p = fort.toWorld(x, z)
      target.x = p.x
      target.z = p.z
      camera.position.set(p.x, 8, p.z + 14)
      camera.lookAt(p.x, 2, p.z)
      camera.updateMatrixWorld()
    }
    const run = (seconds: number): void => { for (let t = 0; t < seconds; t += DT) horde.update(DT, target, camera) }
    const blow = (s: Soldier, damage: number, extra: Partial<HitEvent> = {}): HitEvent => ({
      shape: 'sector', kind: 'blunt', x: target.x, z: target.z, heading: Math.atan2(s.x - target.x, s.z - target.z), reach: Math.hypot(s.x - target.x, s.z - target.z) + 1,
      arc: 0.05, damage, knock: 4, lift: 0.3, motion: 0, sweep: -1, radial: false, special: false, final: false, ...extra,
    })
    return { horde, fort, plan, sector, target, at, run, blow }
  }

  it('stands guard until the robot is inside a district, then that district closes in on it', () => {
    const { horde, fort, plan, sector, target, at, run } = make()
    const main = plan.gates[0]
    at(main.at[0] + main.out[0] * 20, main.at[1] + main.out[1] * 20)
    run(2)
    expect(horde.status(target.x, target.z)).toBeNull()
    const yard = sector('gate').yard.at
    at(yard[0], yard[1])
    run(6)
    expect(horde.status(target.x, target.z)?.alert).toBe(true)
    expect(horde.nearby(target.x, target.z, 1.5 + SOLDIER.radius + 3).length).toBeGreaterThanOrEqual(4)
    // a district two gates away stays at peace
    const far = sector('fuel').yard.at
    const w = fort.toWorld(far[0], far[1])
    expect(horde.status(w.x, w.z)?.alert).toBe(false)
  })

  it('stands down once the robot leaves the fortress, and the soldiers walk back to their beats instead of pressing at the gate', () => {
    const { horde, fort, plan, sector, at, run } = make()
    const main = plan.gates[0]
    const yard = sector('gate').yard.at
    at(yard[0], yard[1])
    run(5)
    const inside = fort.toWorld(yard[0], yard[1])
    expect(horde.status(inside.x, inside.z)?.alert).toBe(true)
    at(main.at[0] + main.out[0] * 30, main.at[1] + main.out[1] * 30)
    run(1.4)
    expect(horde.status(inside.x, inside.z)?.alert).toBe(false)
    run(10)
    // nobody is left pressing at the gate toward the robot
    const gate = fort.toWorld(main.at[0], main.at[1])
    const atGate = horde.nearby(gate.x, gate.z, 12).filter((s) => s.goal.ready)
    expect(atGate.length).toBe(0)
    const standing = horde.nearby(inside.x, inside.z, 200).filter((s) => fort.sector(s.x, s.z) === sector('gate').index)
    expect(standing.every((s) => !s.goal.ready)).toBe(true)
  })

  it('takes health off a soldier blow by blow: it flinches and recovers, and breaks apart only when its health is gone', () => {
    const { horde, sector, fort, target, at, run, blow } = make()
    const yard = sector('gate').yard.at
    at(yard[0], yard[1])
    run(6)
    const s = horde.nearby(target.x, target.z, 6)[0]
    expect(horde.hit(blow(s, SOLDIER.health * 0.3))).toBeGreaterThanOrEqual(1)
    expect(s.alive).toBe(true)
    expect(s.mode).toBe('hit')
    expect(s.vitality).toBeCloseTo(0.7, 3)
    run(SOLDIER.flinch[1] + 0.05)
    expect(s.mode === 'move' || s.mode === 'attack').toBe(true)
    // the bar's chip trails the blow, then drains to the health
    expect(s.chip).toBeGreaterThan(s.vitality)
    run(2)
    expect(s.chip).toBeCloseTo(s.vitality, 3)
    const before = horde.destroyed
    horde.hit(blow(s, SOLDIER.health * 0.3))
    horde.hit(blow(s, SOLDIER.health * 0.3))
    expect(s.alive).toBe(true)
    horde.hit(blow(s, SOLDIER.health * 0.3))
    expect(s.alive).toBe(false)
    expect(horde.destroyed).toBeGreaterThan(before)
    target.present = false
    run(DEBRIS_LIE + DEBRIS_FADE + 0.2)
    const w = fort.toWorld(yard[0], yard[1])
    expect(horde.nearby(w.x, w.z, 200).includes(s)).toBe(false)
  })

  it("holds a special's emptied soldiers in their flinch until its last blow, which breaks them all", () => {
    const { horde, sector, target, at, run, blow } = make()
    const yard = sector('gate').yard.at
    at(yard[0], yard[1])
    run(6)
    const [a, b] = horde.nearby(target.x, target.z, 8)
    expect(b).toBeDefined()
    horde.special = true
    horde.hit(blow(a, SOLDIER.health * 2, { special: true, knock: 2, lift: 0 }))
    horde.hit(blow(b, SOLDIER.health * 2, { special: true, knock: 2, lift: 0 }))
    expect(a.alive && b.alive).toBe(true)
    expect(a.doomed && b.doomed).toBe(true)
    run(3)
    // still held, never getting up to fight again
    expect(a.alive && b.alive).toBe(true)
    expect(a.mode).toBe('hit')
    expect(a.free).toBe(false)
    // the last blow catches only one of them; both break
    const before = horde.destroyed
    horde.hit(blow(a, 10, { special: true, final: true }))
    expect(a.alive || b.alive).toBe(false)
    expect(horde.destroyed).toBeGreaterThanOrEqual(before + 2)
    horde.special = false
  })

  it('sends out a wave of reinforcements when a district is cut down', () => {
    const { horde, sector, target, at, run } = make()
    const g = sector('gate')
    at(g.yard.at[0], g.yard.at[1])
    run(4)
    const blast: HitEvent = { shape: 'circle', kind: 'blast', x: target.x, z: target.z, heading: 0, reach: 80, arc: Math.PI * 2, damage: 5000, knock: 10, lift: 6, motion: 0, sweep: -1, radial: true, special: false, final: false }
    horde.hit(blast)
    expect(horde.status(target.x, target.z)!.alive).toBeLessThan(g.garrison * 0.55)
    run(g.garrison * 0.7 + 8)
    expect(horde.status(target.x, target.z)!.alive).toBeGreaterThanOrEqual(g.garrison)
  })
})

describe('debris', () => {
  it('scatters the parts, which come to rest on the sand', () => {
    const rig = new SoldierRig(asset.manifest)
    rig.pose({ x: 0, z: 0, y: 0, yaw: 0, tilt: new Quaternion() }, createSoldierPose())
    const debris = new Debris(rig, asset.manifest.pieces)
    debris.start(new Vector3(8, 2, 0), new Vector3(), 2)
    for (let t = 0; t < DEBRIS_LIE; t += DT) debris.update(DT)
    const p = new Vector3()
    let spread = 0
    for (let i = 0; i < debris.count; i++) {
      debris.piece(i, p)
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
      expect(p.y).toBeGreaterThan(-0.02)
      expect(p.y).toBeLessThan(0.6)
      spread = Math.max(spread, Math.hypot(p.x, p.z))
    }
    expect(spread).toBeGreaterThan(2)
    expect(spread).toBeLessThan(25)
  })

  it('reports each part hitting the sand, and nothing once the parts lie still', () => {
    const rig = new SoldierRig(asset.manifest)
    rig.pose({ x: 0, z: 0, y: 0, yaw: 0, tilt: new Quaternion() }, createSoldierPose())
    const debris = new Debris(rig, asset.manifest.pieces)
    debris.start(new Vector3(8, 2, 0), new Vector3(), 2)
    const heard = new Set<number>()
    let total = 0, late = 0
    for (let t = 0; t < DEBRIS_LIE; t += DT) {
      debris.update(DT)
      for (let k = 0; k < debris.landingCount; k++) {
        const l = debris.landings[k]
        expect(l.speed).toBeGreaterThan(0.9)
        heard.add(l.piece)
        total++
        if (t > 3) late++
      }
    }
    // most parts are heard landing; a few bounces and tumbles each, not a rattle every frame
    expect(heard.size).toBeGreaterThan(debris.count * 0.6)
    expect(total).toBeLessThan(debris.count * 6)
    expect(late).toBe(0)
  })
})

describe('guard shield tiling', () => {
  it('is hexagonal tiles of even size facing out, each carrying its centre', () => {
    const g = goldberg(8)
    const pos = g.getAttribute('position')
    const cell = g.getAttribute('cell')
    const idx = g.getIndex()!
    const a = new Vector3(), b = new Vector3(), c = new Vector3(), centre = new Vector3()
    const areas: number[] = []
    for (let i = 0; i < idx.count; i += 3) {
      a.fromBufferAttribute(pos, idx.getX(i))
      b.fromBufferAttribute(pos, idx.getX(i + 1))
      c.fromBufferAttribute(pos, idx.getX(i + 2))
      centre.set(cell.getX(idx.getX(i)), cell.getY(idx.getX(i)), cell.getZ(idx.getX(i)))
      const n = b.clone().sub(a).cross(c.clone().sub(a))
      expect(n.dot(centre)).toBeGreaterThan(0)
      areas.push(n.length())
    }
    // the fan triangles of every tile are within a factor of ~2 in size (no pinched cells)
    expect(Math.max(...areas) / Math.min(...areas)).toBeLessThan(2.2)
    expect(idx.count / 3).toBeGreaterThan(2000)
  })
})
