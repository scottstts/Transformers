import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PerspectiveCamera, Quaternion, Scene, Vector3 } from 'three/webgpu'
import { readSoldier, NO_CONTACT } from './support/assets'
import { crossings, triangles } from './support/commander-clash'
import { Forts } from '../src/worlds/desert/fort'
import { Horde, type EnemyTarget } from '../src/game/enemies/horde'
import { Commander, COMMANDER } from '../src/game/enemies/commander'
import { COMMANDER_RESPAWN, FULL_COMBO_CHANCE, comboLength } from '../src/game/enemies/commander-post'
import { COMMANDER_MOVES } from '../src/content/commander/combo'
import { COMMANDER_POSES } from '../src/content/commander/poses'
import { CommanderMovePlayer, type CommanderBlow } from '../src/content/commander/moves'
import { CommanderRig } from '../src/content/commander/rig'
import { createSoldierPose } from '../src/content/soldier/rig'
import { writePose } from '../src/content/soldier/poses'
import { AudioMix } from '../src/audio/mix'
import { Soldier, type SoldierImpact } from '../src/game/enemies/soldier'
import { wrap } from '../src/game/math'

const asset = readSoldier('commander')
const soldiers = readSoldier()
const DT = 1 / 60

// the fight and the debris draw on Math.random: seed it so every run is the same
beforeEach(() => {
  let seed = 4242
  vi.spyOn(Math, 'random').mockImplementation(() => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  })
  return () => vi.restoreAllMocks()
})

describe('commander combo roll', () => {
  it('plays moves 1-2, or the whole combo one time in three, and nothing else', () => {
    const counts = new Map<number, number>()
    for (let i = 0; i < 20000; i++) {
      const n = comboLength(Math.random())
      counts.set(n, (counts.get(n) ?? 0) + 1)
    }
    expect([...counts.keys()].sort()).toEqual([2, 4])
    expect(counts.get(4)! / 20000).toBeGreaterThan(FULL_COMBO_CHANCE - 0.015)
    expect(counts.get(4)! / 20000).toBeLessThan(FULL_COMBO_CHANCE + 0.015)
    expect(FULL_COMBO_CHANCE).toBeCloseTo(1 / 3, 6)
  })
})

describe('commander moves', () => {
  const rig = new CommanderRig(asset.manifest)
  const tris = triangles(asset)
  const pose = createSoldierPose()
  const place = { x: 0, z: 0, y: 0, yaw: 0, tilt: new Quaternion() }
  const lanceAndArms = (): string[] => {
    const W = rig.world
    const weapon = W[rig.index.weapon]
    const out = crossings(rig, tris, new Vector3(0, 0, -4.23).applyMatrix4(weapon), new Vector3(0, 0, 2.68).applyMatrix4(weapon), ['hand.R', 'weapon', 'blade'])
    for (const s of ['L', 'R']) {
      const e = new Vector3().setFromMatrixPosition(W[rig.index[`forearm.${s}`]])
      const w = new Vector3().setFromMatrixPosition(W[rig.index[`hand.${s}`]])
      out.push(...crossings(rig, tris, e, w, [`upperarm.${s}`, `forearm.${s}`, `hand.${s}`, 'weapon', 'blade']))
    }
    return out
  }
  const at = (values: Float32Array): string[] => {
    writePose(values, pose)
    rig.pose(place, pose)
    return lanceAndArms()
  }

  it('keeps the lance and forearms off the body in every key pose and between them', () => {
    const names = Object.keys(COMMANDER_POSES) as Array<keyof typeof COMMANDER_POSES>
    for (const a of names) expect(at(COMMANDER_POSES[a]), a).toEqual([])
    const v = new Float32Array(COMMANDER_POSES.ready.length)
    for (const [a, b] of [['guard', 'ready'], ['ready', 'roll'], ['ready', 'hitHigh'], ['ready', 'hitLow'], ['roll', 'hitHigh'], ['hitLow', 'ready']] as const) {
      for (let u = 0; u <= 1; u += 0.1) {
        for (let i = 0; i < v.length; i++) v[i] = COMMANDER_POSES[a][i] + (COMMANDER_POSES[b][i] - COMMANDER_POSES[a][i]) * u
        expect(at(v), `${a}-${b} at ${u.toFixed(1)}`).toEqual([])
      }
    }
  })

  it.each(['ready', 'roll', 'guard'] as const)('keeps them off the body through every frame of the whole combo, chained from %s', (from) => {
    const player = new CommanderMovePlayer()
    player.reset(COMMANDER_POSES[from])
    COMMANDER_MOVES.forEach((move, k) => {
      player.start(move, COMMANDER_POSES.ready)
      const end = k < COMMANDER_MOVES.length - 1 ? move.chain : move.duration
      for (let t = 0; t < end; t += 1 / 60) {
        player.update(1 / 60)
        expect(at(player.values), `${move.name} at ${player.time.toFixed(2)}`).toEqual([])
      }
    })
  })

  it('has four well-formed moves: keys in time, blows in them, the whirl the only knock-back', () => {
    expect(COMMANDER_MOVES.length).toBe(4)
    COMMANDER_MOVES.forEach((move, k) => {
      expect(move.strike).toBeGreaterThan(0)
      expect(move.strike).toBeLessThan(move.chain + 1e-9)
      expect(move.chain).toBeLessThanOrEqual(move.duration + 1e-9)
      for (const keys of Object.values(move.keys)) {
        keys!.forEach(([t], i) => {
          expect(t).toBeGreaterThan(0)
          expect(t).toBeLessThanOrEqual(move.duration)
          if (i > 0) expect(t).toBeGreaterThan(keys![i - 1][0])
        })
      }
      expect(move.blow.knockback === true).toBe(k === 3)
    })
  })
})

describe('commander', () => {
  const unit = (): Commander => {
    const c = new Commander(asset.manifest)
    c.reset(0, 0, 0, 1)
    c.goal.ready = true
    c.aim = 0
    return c
  }
  const play = (c: Commander, length: number): CommanderBlow[] => {
    const blows: CommanderBlow[] = []
    expect(c.fight(length)).toBe(true)
    for (let t = 0; t < 8 && c.mode === 'attack'; t += 1 / 120) {
      c.update(1 / 120)
      c.refresh()
      for (const r of c.rows) expect(Number.isFinite(r)).toBe(true)
      if (c.blow) { blows.push(c.blow); c.blow = null }
    }
    return blows
  }
  const blow = (extra: Partial<SoldierImpact>): SoldierImpact => ({ dirX: 0, dirZ: -1, knock: 5, lift: 0.5, damage: 40, kind: 'blunt', special: false, ...extra })

  it('plays a rolled pair as two blows and the whole combo as four, the whirl knocking back, and ends facing where it began', () => {
    const c = unit()
    expect(play(c, 2).map((b) => b.knockback === true)).toEqual([false, false])
    expect(c.mode).toBe('move')
    const d = unit()
    expect(play(d, 4).map((b) => b.knockback === true)).toEqual([false, false, false, true])
    expect(d.mode).toBe('move')
    // the whirl's full turn ends square on again
    expect(Math.abs(wrap(d.yaw))).toBeLessThan(0.15)
  })

  it('steps in only as far as there is room before the robot', () => {
    const open = unit()
    open.gap = 50
    play(open, 4)
    const close = unit()
    close.gap = 1.2
    play(close, 4)
    expect(Math.hypot(open.x, open.z)).toBeGreaterThan(3)
    expect(Math.hypot(close.x, close.z)).toBeLessThan(1)
  })

  it('cannot be interrupted mid-combo except by a special, and dies there all the same', () => {
    for (const length of [2, 4]) {
      const c = unit()
      c.fight(length)
      c.update(0.05)
      // a finisher's knock, a launching lift, a run of blows: it fights on, its health going
      for (let i = 0; i < 6; i++) c.impact(blow({ knock: 18, lift: 9, damage: 60 }))
      expect(c.mode).toBe('attack')
      expect(c.health).toBe(COMMANDER.health - 360)
      // a special's blow takes it out of it
      c.impact(blow({ knock: 4, lift: 0.5, damage: 10, special: true }))
      expect(c.mode).toBe('hit')
      expect(c.comboMove).toBe(-1)
    }
    const d = unit()
    d.fight(4)
    d.update(0.05)
    d.impact(blow({ damage: COMMANDER.health + 1 }))
    expect(d.alive).toBe(false)
  })

  it('takes a blow out of a combo as a soldier does, at its weight: 40 % of the push, thrown only by a big lift or a special', () => {
    const c = unit()
    const s = new Soldier(soldiers.manifest)
    s.reset(0, 0, 0, 2)
    // a finisher that throws a soldier rocks the commander back on its wheels
    c.impact(blow({ knock: 15, lift: 2, damage: 1 }))
    s.impact(blow({ knock: 15, lift: 2, damage: 1 }))
    expect(s.mode).toBe('air')
    expect(c.mode).toBe('hit')
    expect(c.vz).toBeCloseTo(s.vz * 0.4, 6)
    // a big blast's lift throws it, lower than a soldier
    const d = unit()
    d.impact(blow({ knock: 6, lift: 22, damage: 1 }))
    expect(d.mode).toBe('air')
    expect(d.vy).toBeCloseTo(22 * 0.4 + 1.2, 6)
    // a special's lift reaches it whole, as it does the soldier
    const e = unit()
    const f = new Soldier(soldiers.manifest)
    f.reset(0, 0, 0, 3)
    e.impact(blow({ knock: 20, lift: 14, damage: 1, special: true }))
    f.impact(blow({ knock: 20, lift: 14, damage: 1, special: true }))
    expect(e.mode).toBe('air')
    expect(e.vy).toBeCloseTo(f.vy, 6)
    expect(e.vz).toBeCloseTo(f.vz * 0.4, 6)
  })
})

describe('commander in the fortress', () => {
  const make = () => {
    const forts = new Forts(new Scene())
    const horde = new Horde(soldiers, forts, NO_CONTACT, new AudioMix(), asset)
    const fort = forts.list[0]
    const post = horde.commanderPosts[0]
    const camera = new PerspectiveCamera(42, 16 / 9, 0.1, 2000)
    const target: EnemyTarget = { x: 0, z: 0, radius: 1.5, vx: 0, vz: 0, height: 5.6, heading: 0, guard: 0, present: true }
    const at = (role: string): void => {
      const s = fort.plan.sectors.find((k) => k.role === role)!
      const p = fort.toWorld(s.yard.at[0], s.yard.at[1])
      target.x = p.x
      target.z = p.z
      camera.position.set(p.x, 8, p.z + 14)
      camera.lookAt(p.x, 2, p.z)
      camera.updateMatrixWorld()
    }
    const run = (seconds: number, each?: () => void): void => {
      for (let t = 0; t < seconds; t += DT) {
        horde.update(DT, target, camera)
        each?.()
      }
    }
    return { horde, fort, post, target, at, run }
  }

  it('fights at the soldiers\' distances scaled to its size, and its lance\'s reach beyond that', () => {
    const { post } = make()
    const scale = asset.manifest.dims.height / soldiers.manifest.dims.height * 1.4
    expect(scale).toBeGreaterThan(3)
    expect(post.stand).toBeCloseTo(1.55 * scale, 6)
    expect(post.attackGap).toBeCloseTo((1.55 + 0.7) * scale, 6)
    expect(post.reachGap).toBeCloseTo(2.1 * scale, 6)
  })

  it('is thrown into the air by a special\'s blast, as the soldiers are, and seizes in a vortex\'s draw', () => {
    const { horde, post, at, run } = make()
    at('citadel')
    run(0.5)
    const c = post.unit
    horde.special = true
    // a special's quake (the Semi's stomp): a blast under it with a soldier's launch
    horde.hit({ shape: 'circle', kind: 'blast', x: c.x + 2, z: c.z, heading: 0, reach: 20, arc: Math.PI * 2, damage: 60, knock: 2, lift: 15, motion: 0, sweep: -1, radial: true, special: true, final: false, bite: true })
    expect(c.mode).toBe('air')
    run(4)
    horde.special = false
    run(4)
    expect(c.free || c.mode === 'attack').toBe(true)
    // a special's vortex (the Bat's) draws it in, staggering and thrown between its hit poses, even mid-combo
    const cx = c.x + 12, cz = c.z
    const start = Math.hypot(c.x - cx, c.z - cz)
    let seized = 0
    for (let t = 0; t < 1.5; t += DT) {
      horde.pull({ x: cx, z: cz, radius: 30, speed: 8, dt: DT, special: true })
      run(DT)
      if (c.mode === 'stagger' || c.mode === 'hit') seized++
    }
    expect(seized).toBeGreaterThan(80)
    expect(Math.hypot(c.x - cx, c.z - cz)).toBeLessThan(start * 0.75)
    // a combo's vortex (the Bat's finisher) does not reach it mid-combo
    run(3)
    expect(c.fight(4) || c.mode === 'attack').toBe(true)
    for (let t = 0; t < 0.5; t += DT) {
      horde.pull({ x: cx, z: cz, radius: 30, speed: 8, dt: DT, special: false })
      run(DT)
      expect(c.mode).toBe('attack')
    }
  })

  it('is thrown by a special\'s quake as high as the soldiers round it', () => {
    const { horde, post, at, run } = make()
    at('citadel')
    run(0.5)
    const c = post.unit
    const [s] = horde.nearby(c.x, c.z, 40).filter((k) => k !== c)
    expect(s).toBeDefined()
    horde.special = true
    // the Semi's stomp under both (its lift 15), at the same distance from each
    for (const u of [c, s]) horde.hit({ shape: 'circle', kind: 'blast', x: u.x + 3, z: u.z, heading: 0, reach: 3.5, arc: Math.PI * 2, damage: 60, knock: 2, lift: 15, motion: 0, sweep: -1, radial: true, special: true, final: false, bite: true })
    let top = 0, soldierTop = 0
    for (let t = 0; t < 4; t += DT) {
      run(DT)
      top = Math.max(top, c.y)
      soldierTop = Math.max(soldierTop, s.y)
    }
    horde.special = false
    expect(soldierTop).toBeGreaterThan(3)
    expect(top).toBeGreaterThan(soldierTop * 0.85)
    expect(top).toBeLessThan(soldierTop * 1.15)
  })

  it('takes its lance\'s trail with it when it is destroyed', () => {
    const { horde, post, at, run } = make()
    at('gate')
    run(30)
    const c = post.unit
    horde.hit({ shape: 'circle', kind: 'blast', x: c.x, z: c.z, heading: 0, reach: 6, arc: Math.PI * 2, damage: 1e5, knock: 10, lift: 4, motion: 0, sweep: -1, radial: true, special: false, final: false, bite: true })
    run(0.1)
    expect(post.trail.mesh.visible).toBe(false)
  })

  it('comes for the robot from the citadel, holds its stand-off, and lands its blows: the pair and, about one time in three, the whole combo', () => {
    const { horde, post, target, at, run } = make()
    at('gate')
    let struck = 0, knocks = 0
    horde.onStruck = () => { struck++ }
    horde.onKnockback = () => { knocks++ }
    const c = post.unit
    const started: number[] = []
    let deepest = -1
    let wasAttacking = false
    const gaps: number[] = []
    run(240, () => {
      const attacking = c.mode === 'attack'
      if (attacking && !wasAttacking) deepest = 0
      if (attacking) deepest = Math.max(deepest, c.comboMove)
      if (!attacking && wasAttacking) started.push(deepest + 1)
      if (!attacking && c.alive && c.mode === 'move') gaps.push(Math.hypot(c.x - target.x, c.z - target.z) - target.radius - COMMANDER.radius)
      wasAttacking = attacking
    })
    expect(started.length).toBeGreaterThan(40)
    // untouched, every combo plays out: the pair or all four, never cut short
    expect(started.every((n) => n === 2 || n === 4)).toBe(true)
    const full = started.filter((n) => n === 4).length / started.length
    expect(full).toBeGreaterThan(0.2)
    expect(full).toBeLessThan(0.47)
    expect(struck).toBeGreaterThanOrEqual(started.length * 2)
    // every whirl lands its knock-back (the last may land in a combo still playing as the run ends)
    const whirls = started.filter((n) => n === 4).length
    expect(knocks).toBeGreaterThanOrEqual(whirls)
    expect(knocks).toBeLessThanOrEqual(whirls + 1)
    // it never stands in the robot's face, and between combos it holds about its stand-off
    expect(Math.min(...gaps)).toBeGreaterThan(1)
    const settled = gaps.slice(-600).sort((a, b) => a - b)[300]
    expect(settled).toBeGreaterThan(post.stand * 0.7)
    expect(settled).toBeLessThan(post.attackGap + 0.5)
  })

  it('breaks apart when its health is gone and the next rolls out of the citadel after the respawn time', () => {
    const { horde, fort, post, target, at, run } = make()
    at('citadel')
    run(3)
    const c = post.unit
    const before = horde.destroyed
    horde.hit({ shape: 'circle', kind: 'blast', x: c.x, z: c.z, heading: 0, reach: 6, arc: Math.PI * 2, damage: 1e5, knock: 10, lift: 4, motion: 0, sweep: -1, radial: true, special: false, final: false, bite: true })
    expect(c.alive).toBe(false)
    expect(horde.destroyed).toBeGreaterThan(before)
    target.present = false
    run(COMMANDER_RESPAWN - 1)
    expect(c.alive).toBe(false)
    run(2)
    expect(c.alive).toBe(true)
    expect(c.health).toBe(COMMANDER.health)
    expect(fort.sector(c.x, c.z)).toBe(fort.plan.sectors.find((s) => s.role === 'citadel')!.index)
  })

  it('pushes a robot standing in its body out of the way', () => {
    const { horde, post, target, at, run } = make()
    at('citadel')
    run(0.5)
    const c = post.unit
    target.x = c.x + 1
    target.z = c.z
    horde.shove.x = horde.shove.z = 0
    run(DT)
    expect(horde.shove.x).toBeGreaterThan(0.1)
  })

  it('is caught by the robots\' blows, rays and aim assist like a soldier, at its own size', () => {
    const { horde, post, at, run } = make()
    at('citadel')
    run(0.5)
    const c = post.unit
    const health = c.health
    const n = horde.hit({ shape: 'sector', kind: 'blunt', x: c.x, z: c.z - 4, heading: 0, reach: 3, arc: 1, damage: 60, knock: 9, lift: 0.8, motion: 0, sweep: -1, radial: false, special: false, final: false, bite: true })
    expect(n).toBeGreaterThanOrEqual(1)
    expect(c.health).toBe(health - 60)
    expect(horde.ray(new Vector3(c.x, 3.8, c.z - 20), new Vector3(0, 0, 1), 40)).toBeLessThan(20)
    expect(horde.assist(c.x, c.z - 6, 0.5, 8, 0.9)).toBeCloseTo(0, 1)
  })
})
