import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Quaternion, Scene, Vector3, PerspectiveCamera } from 'three/webgpu'
import { readSoldier, NO_CONTACT } from './support/assets'
import { SoldierRig, createSoldierPose } from '../src/content/soldier/rig'
import { POSES, writePose } from '../src/content/soldier/poses'
import { Forts, FORT_SITES } from '../src/worlds/desert/fort'
import { planFort, insideWalls, GATE_WIDTH, YARD } from '../src/worlds/desert/fort/plan'
import { pushOut } from '../src/game/collide'
import { goldberg } from '../src/content/transformer/combat/fx/shield'
import { CarBarrier } from '../src/game/enemies/barrier'
import { Horde, GARRISON, REINFORCE_BELOW, type EnemyTarget } from '../src/game/enemies/horde'
import { SOLDIER } from '../src/game/enemies/soldier'
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
    for (const name of ['guard', 'ready', 'roll', 'windup', 'strike'] as const) {
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

describe('fort plans', () => {
  it('leave gates wide enough for the truck robot, put the barrier outside the walls and keep the yard open', () => {
    for (const site of FORT_SITES) {
      const plan = planFort(site)
      expect(plan.gates.length).toBe(3)
      for (const g of plan.gates) {
        const [a, b] = g.pillars
        expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeGreaterThanOrEqual(GATE_WIDTH)
        expect(insideWalls(plan, g.inside[0], g.inside[1])).toBe(true)
        expect(insideWalls(plan, g.outside[0], g.outside[1])).toBe(false)
      }
      expect(plan.barrier).toBeGreaterThan(plan.outer + 10)
      expect(insideWalls(plan, 0, 0)).toBe(true)
      // nothing blocks the yard
      for (const s of plan.segments) {
        const t = Math.max(0, Math.min(1, ((0 - s.ax) * (s.bx - s.ax) + (0 - s.az) * (s.bz - s.az)) / ((s.bx - s.ax) ** 2 + (s.bz - s.az) ** 2 || 1)))
        expect(Math.hypot(s.ax + (s.bx - s.ax) * t, s.az + (s.bz - s.az) * t)).toBeGreaterThan(YARD - 1)
      }
      for (const c of plan.circles) expect(Math.hypot(c.x, c.z) - c.r).toBeGreaterThan(YARD - 1)
      expect(plan.posts.length).toBeGreaterThanOrEqual(GARRISON)
    }
  })

  it('lay every building out inside the walls, give each quadrant its role and leave every post standing free', () => {
    const contact = { nx: 0, nz: 0, depth: 0 }
    for (const site of FORT_SITES) {
      const plan = planFort(site)
      for (const m of plan.modules) {
        if (m.kind === 'jersey') continue
        expect(insideWalls(plan, m.at[0], m.at[1]), `${site.id} ${m.kind}`).toBe(true)
      }
      const kinds = new Set(plan.modules.map((m) => m.kind))
      for (const k of ['hq', 'chu', 'canopy', 'container', 'bund', 'tank', 'helipad', 'radioMast', 'waterTower', 'tower', 'booth'] as const) expect(kinds.has(k), `${site.id} has ${k}`).toBe(true)
      expect(plan.hangars.length).toBe(2)
      for (const p of plan.posts) {
        for (const at of p.beat) {
          const q = { x: at[0], z: at[1] }
          expect(pushOut(q, SOLDIER.radius, plan.segments, plan.circles, contact), `${site.id} beat ${at.map((v) => v.toFixed(1))}`).toBeNull()
        }
      }
    }
  })
})

describe('fort access', () => {
  it('lets the truck robot walk in through every gate to the middle of the yard', () => {
    const radius = CYBERTRUCK_PROFILE.robotRadius
    const contact = { nx: 0, nz: 0, depth: 0 }
    for (const site of FORT_SITES) {
      const plan = planFort(site)
      for (const g of plan.gates) {
        const route: Array<[number, number]> = [g.outside, g.inside, [0, 0]]
        const p = { x: g.at[0] + g.out[0] * 30, z: g.at[1] + g.out[1] * 30 }
        let leg = 0
        for (let step = 0; step < 2000 && leg < route.length; step++) {
          const [tx, tz] = route[leg]
          const d = Math.hypot(tx - p.x, tz - p.z)
          if (d < 0.6) { leg++; continue }
          p.x += ((tx - p.x) / d) * 0.1
          p.z += ((tz - p.z) / d) * 0.1
          pushOut(p, radius, plan.segments, plan.circles, contact)
        }
        expect(Math.hypot(p.x, p.z), `${site.id} gate at ${g.at.map((v) => v.toFixed(0))}`).toBeLessThan(1)
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
    return { horde, fort, target, at, run }
  }

  it('stands guard until the robot is inside the walls, then closes in on it', () => {
    const { horde, fort, target, at, run } = make()
    at(0, fort.plan.barrier - 4)
    run(2)
    expect(horde.status(target.x, target.z)?.alert).toBe(false)
    at(0, 4)
    run(6)
    expect(horde.status(target.x, target.z)?.alert).toBe(true)
    expect(horde.nearby(target.x, target.z, 1.5 + SOLDIER.radius + 3).length).toBeGreaterThanOrEqual(4)
  })

  it('keeps the garrison patrolling and pacing while the robot stays out', () => {
    const { horde, fort, target, at, run } = make()
    at(0, fort.plan.barrier + 30)
    run(1)
    const soldiers = horde.nearby(fort.plan.site.x, fort.plan.site.z, fort.plan.outer)
    const start = soldiers.map((k) => [k.x, k.z])
    let moved = 0
    for (let t = 0; t < 12; t += 1) {
      run(1)
      soldiers.forEach((k, i) => { if (Math.hypot(k.x - start[i][0], k.z - start[i][1]) > 2.5) moved++ })
    }
    expect(horde.status(target.x, target.z)?.alert ?? false).toBe(false)
    // most of the garrison is on the move over those seconds, not standing at its posts
    expect(moved / (soldiers.length * 12)).toBeGreaterThan(0.5)
  })

  it('knocks a soldier back on its wheels, and a heavier blow breaks it apart; the parts are gone five seconds later', () => {
    const { horde, target, at, run } = make()
    at(0, 4)
    run(6)
    const near = horde.nearby(target.x, target.z, 6)
    const s = near[0]
    const heading = Math.atan2(s.x - target.x, s.z - target.z)
    const hit: HitEvent = { shape: 'sector', kind: 'blunt', x: target.x, z: target.z, heading, reach: 6, arc: 0.2, damage: 20, knock: 8, lift: 0.5, motion: 0, sweep: -1, radial: false, special: false }
    const before = Math.hypot(s.x - target.x, s.z - target.z)
    expect(horde.hit(hit)).toBeGreaterThanOrEqual(1)
    target.present = false
    for (let t = 0; t < 0.6; t += DT) horde.update(DT, target, new PerspectiveCamera())
    const after = Math.hypot(s.x - target.x, s.z - target.z)
    expect(after - before).toBeGreaterThan(1.5)
    // it brakes: no rolling off across the yard
    expect(after - before).toBeLessThan(8)
    target.present = true
    const destroyed = horde.destroyed
    horde.hit({ ...hit, heading: Math.atan2(s.x - target.x, s.z - target.z), reach: 20, damage: 200, kind: 'cut' })
    expect(horde.destroyed).toBeGreaterThan(destroyed)
    expect(s.alive).toBe(false)
    run(DEBRIS_LIE + DEBRIS_FADE + 0.2)
    expect(horde.nearby(target.x, target.z, 60).includes(s)).toBe(false)
  })

  it('sends out a wave of reinforcements when the garrison drops below the threshold', () => {
    const { horde, target, at, run } = make()
    at(0, 4)
    run(4)
    const blast: HitEvent = { shape: 'circle', kind: 'blast', x: target.x, z: target.z, heading: 0, reach: 60, arc: Math.PI * 2, damage: 1000, knock: 10, lift: 6, motion: 0, sweep: -1, radial: true, special: true }
    horde.hit(blast)
    expect(horde.status(target.x, target.z)!.alive).toBeLessThan(REINFORCE_BELOW)
    run(GARRISON * 1.1 + 6)
    expect(horde.status(target.x, target.z)!.alive).toBe(GARRISON)
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
