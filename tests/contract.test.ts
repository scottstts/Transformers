import { describe, expect, it, vi } from 'vitest'
import { Matrix4, PerspectiveCamera, Scene, Vector3 } from 'three/webgpu'
import { ROSTER } from '../src/content/roster.ts'
import { AudioMix } from '../src/audio/mix.ts'
import { SOLDIER, Soldier, type SoldierImpact } from '../src/game/enemies/soldier.ts'
import { COMMANDER, Commander } from '../src/game/enemies/commander.ts'
import { Horde } from '../src/game/enemies/horde.ts'
import { Citadel } from '../src/worlds/desert/citadel'
import { mirrorCitadel } from '../tools/mirror.ts'
import type { Character } from '../src/content/transformer/character.ts'
import type { MoveHits } from '../src/content/transformer/combat/hits.ts'
import { NO_CONTACT, readAsset, readSoldier, readWeapon } from './support/assets.ts'
import { DT, bodyCore, runFight } from './support/fight.ts'
import { crossings, surfaces } from './support/clash.ts'
import { RobotCombat } from '../src/game/combat/robot-combat'
import { CameraFx } from '../src/game/combat/camera-fx'
import { createMotionState } from '../src/game/types'
import { FLASH_HALF_WIDTH, FLASH_KNOCK, FLASH_LIFT, FLASH_TIME } from '../src/content/transformer/combat/flash'
import { flashClearance } from '../src/game/combat/flash-travel'
import { CH } from '../src/content/transformer/combat/pose'

const citadel = new Citadel(new Scene(), await mirrorCitadel())

/**
 * The combat interaction contract (src/game/combat/contract.ts), for every
 * robot in the roster: a robot added later is held to it without touching
 * this file.
 */
const soldiers = readSoldier()
const commanders = readSoldier('commander')

function fixture(character: Character) {
  const state = createMotionState()
  state.mode = 'robot'; state.progress = state.target = 1; state.yaw = 0.4
  const camera = new PerspectiveCamera()
  const combat = new RobotCombat(character.combat, character.model, character.robotOffset, state, new CameraFx())
  const tick = (dt: number): void => {
    combat.update(dt, state, camera)
    const pose = character.gait.update(dt, 0, 0, false, true, null)
    character.model.root.position.copy(state.pos)
    character.model.root.rotation.set(0, state.yaw, 0)
    character.model.pose(1, pose)
    character.combat.effects.afterPose()
  }
  tick(0)
  return { state, combat, camera, tick }
}

function enterMove(f: ReturnType<typeof fixture>, index: number): void {
  expect(f.combat.press()).toBe(true)
  f.tick(0)
  for (let i = 0; i < index; i++) {
    f.tick(f.combat.combat.moveset.moves[i].chain[0] + 0.001)
    expect(f.combat.press()).toBe(true)
    f.tick(0)
  }
}

/** Targets of the sustained emitters that must not outlive an interrupted move. */
function emitting(character: Character): boolean {
  const fx = character.combat.effects as unknown as {
    boostTarget?: number; ersTarget?: number; vortexOn?: boolean
    gun?: { firing: boolean; chargeTarget: number }
  }
  const body = character.effects as unknown as { burn?: number | null }
  return (fx.boostTarget ?? 0) > 0 || (fx.ersTarget ?? 0) > 0 || !!fx.vortexOn ||
    !!fx.gun?.firing || (fx.gun?.chargeTarget ?? 0) > 0 || (body.burn ?? 0) > 0
}

/** Every blow a robot's combo and special can throw, as it reaches one enemy. */
function blows(c: Character): SoldierImpact[] {
  const out: SoldierImpact[] = []
  const add = (h: MoveHits, special: boolean): void => {
    for (const s of h.strikes ?? []) out.push({ dirX: 0, dirZ: -1, knock: s.knock, lift: s.lift, damage: 1, kind: s.kind, special })
    for (const s of h.sweeps ?? []) out.push({ dirX: 0, dirZ: -1, knock: s.knock, lift: s.lift, damage: 1, kind: s.kind, special })
    for (const b of h.blasts ?? []) out.push({ dirX: 0, dirZ: -1, knock: b.knock, lift: b.lift, damage: 1, kind: b.kind, special })
  }
  c.combat.hits.moves.forEach((h) => add(h, false))
  add(c.combat.hits.special, true)
  return out
}

describe.each(ROSTER.map((entry) => ({ name: entry.id, entry })))('the combat contract: $name', ({ entry }) => {
  const make = (): Character => entry.create({ ...readAsset(entry.id), weapon: readWeapon(entry.weapon) }, NO_CONTACT, new AudioMix())
  const character = make()

  it('rapid clicks cannot queue later moves; a fresh in-window click can chain', () => {
    const f = fixture(make())
    const blows: number[] = []
    f.combat.onStrike = (move) => blows.push(move)
    enterMove(f, 0)
    for (let i = 0; i < 3; i++) { f.tick(0.01); expect(f.combat.press()).toBe(false) }
    for (let t = 0; t < 4; t += DT) f.tick(DT)
    expect(blows).toEqual([0])
    expect(f.combat.active).toBe(false)
    enterMove(f, 1)
    for (let t = 0; t < 4; t += DT) f.tick(DT)
    expect(blows.at(-1)).toBe(1)
  })

  it.each([0, 1, 2, 3])('guard immediately cancels move %s before its pending hit and protects that frame', (index) => {
    const f = fixture(make())
    enterMove(f, index)
    let hits = 0
    f.combat.onHit = (hit) => { if (hit.shape !== 'capsule') hits++ }
    f.combat.setGuard(true)
    f.tick(0)
    expect(f.combat.guarded).toBe(true)
    expect(f.combat.combat.effects.guardReach()).toBeGreaterThan(0)
    const position = f.state.pos.clone()
    f.tick(0.35)
    expect(hits).toBe(0)
    expect(f.state.pos.distanceTo(position)).toBeLessThan(1e-5)
    f.combat.knockback(new Vector3(8, 4, 0))
    expect(f.combat.staggered).toBe(false)
  })

  it('guard wins over a valid attack already accepted for this frame, without reviving it later', () => {
    const f = fixture(make())
    enterMove(f, 0)
    f.tick(f.combat.combat.moveset.moves[0].chain[0] + 0.001)
    expect(f.combat.press()).toBe(true)
    f.combat.setGuard(true)
    f.tick(DT)
    expect(f.combat.guarded).toBe(true)
    let hits = 0
    f.combat.onHit = (hit) => { if (hit.shape !== 'capsule') hits++ }
    f.combat.setGuard(false)
    for (let t = 0; t < 3; t += DT) f.tick(DT)
    expect(hits).toBe(0)
    expect(f.combat.active).toBe(false)
  })

  it.each(['guard', 'flash'])('%s stops every active attack emitter whose off-cue is canceled', (action) => {
    const sustained = ['boost', 'ers', 'fire', 'charge', 'vortex', 'burn']
    for (let index = 0; index < character.combat.moveset.moves.length; index++) {
      const cues = character.combat.moveset.moves[index].cues ?? []
      for (const cue of cues) {
        if (!sustained.includes(cue.cue) || (cue.value ?? 1) <= 0) continue
        const c = make(), f = fixture(c)
        enterMove(f, index)
        f.tick(cue.t + DT)
        expect(emitting(c)).toBe(true)
        // E has no authority over an airborne combo; guard still interrupts it.
        if (action === 'flash' && f.combat.air * f.combat.poseWeight >= 0.05) {
          expect(f.combat.startFlash(f.state, f.camera)).toBe(false)
          continue
        }
        if (action === 'guard') { f.combat.setGuard(true); f.tick(0) }
        else expect(f.combat.startFlash(f.state, f.camera)).toBe(true)
        expect(emitting(c)).toBe(false)
        for (let t = 0; t < 0.8; t += DT) {
          f.tick(DT)
          expect(emitting(c)).toBe(false)
        }
      }
    }
  })

  it.each([1 / 30, 1 / 120])('Flash Move travels 2.5 standing heights, with finite limbs and grounded hand-back, dt=%s', (dt) => {
    const c = make(), f = fixture(c)
    const from = f.state.pos.clone(), yaw = f.state.yaw
    const inv = new Matrix4(), p = new Vector3()
    const cores = ['bone:pelvis', 'bone:spine', 'bone:chest', 'bone:head'].map((node) => ({ node, core: bodyCore(c, node, 0.4) }))
    let hits = 0
    f.combat.onHit = (hit) => { if (hit.shape !== 'capsule') hits++ }
    f.combat.onStrike = () => hits++
    expect(f.combat.startFlash(f.state, f.camera)).toBe(true)
    for (let t = 0; t < FLASH_TIME + 0.5; t += dt) {
      f.tick(dt)
      if (t >= 0.06 && t < 0.12) expect(c.combat.overlay.pose.v[CH.hipPitch]).toBeGreaterThan(8)
      for (const name of ['hand.R', 'hand.L', 'foot.R', 'foot.L']) {
        p.setFromMatrixPosition(c.model.node(`bone:${name}`).matrixWorld)
        expect(p.toArray().every(Number.isFinite)).toBe(true)
        for (const { node, core } of cores) {
          const local = p.clone().applyMatrix4(inv.copy(c.model.node(node).matrixWorld).invert())
          expect(core.containsPoint(local), `${name} enters ${node} at ${t}`).toBe(false)
        }
      }
    }
    const travel = f.state.pos.clone().sub(from)
    expect(travel.x).toBeCloseTo(Math.sin(yaw) * c.model.robotHeight * 2.5, 4)
    expect(travel.z).toBeCloseTo(Math.cos(yaw) * c.model.robotHeight * 2.5, 4)
    expect(hits).toBe(0)
    expect(f.combat.flashing || f.combat.active).toBe(false)
    expect(Math.min(c.model.footClearance('R'), c.model.footClearance('L'))).toBeLessThan(0.03)
  })

  it('E uses the captured movement direction without aim assist and can repeat immediately after completion', () => {
    const c = make(), f = fixture(c)
    f.combat.setSteer({ x: -0.6, z: 0.8 })
    f.combat.aimAssist = () => { throw new Error('Flash Move must not aim at an enemy') }
    const center = new Vector3(Math.sin(f.state.yaw) * c.robotOffset, 0, Math.cos(f.state.yaw) * c.robotOffset)
    expect(f.combat.startFlash(f.state, f.camera)).toBe(true)
    f.tick(FLASH_TIME / 2)
    expect(f.combat.startFlash(f.state, f.camera)).toBe(false)
    expect(f.combat.press()).toBe(false)
    f.combat.setSteer({ x: 1, z: 0 }) // changing direction does not steer an already running burst
    f.tick(FLASH_TIME / 2)
    expect(f.combat.flashing).toBe(false)
    const end = f.state.pos.clone().add(new Vector3(Math.sin(f.state.yaw) * c.robotOffset, 0, Math.cos(f.state.yaw) * c.robotOffset)).sub(center)
    expect(end.x).toBeCloseTo(-0.6 * c.model.robotHeight * 2.5, 4)
    expect(end.z).toBeCloseTo(0.8 * c.model.robotHeight * 2.5, 4)
    expect(f.combat.startFlash(f.state, f.camera)).toBe(true)
  })

  it('the tucked arms keep forearm panels clear of the upper arms throughout the burst and recovery', () => {
    const c = make(), f = fixture(c)
    const panels = surfaces(c.model.root.children[0].children).filter((s) => /roof\.[RL]|gauntlet\.[RL]/.test(s.name))
    const a = new Vector3(), b = new Vector3(), out: number[] = []
    expect(f.combat.startFlash(f.state, f.camera)).toBe(true)
    for (let t = 0; t < FLASH_TIME + 0.5; t += DT) {
      f.tick(DT)
      for (const side of ['R', 'L']) {
        a.setFromMatrixPosition(c.model.node(`bone:upperarm.${side}`).matrixWorld)
        b.setFromMatrixPosition(c.model.node(`bone:forearm.${side}`).matrixWorld)
        a.lerp(b, 0.5)
        for (const panel of panels) {
          out.length = 0
          crossings(panel, a, b, out)
          expect(out.length, `${side} upper arm crosses ${panel.name} at ${t}`).toBe(0)
        }
      }
    }
  })

  it.each([0, 1, 2, 3])('Flash Move cancels combo move %s and discards its continuation and pending hits', (index) => {
    const f = fixture(make())
    enterMove(f, index)
    let hits = 0
    f.combat.onHit = (hit) => { if (hit.shape !== 'capsule') hits++ }
    expect(f.combat.startFlash(f.state, f.camera)).toBe(true)
    expect(f.combat.combat.effects.weapon?.presence ?? 0).toBe(0)
    f.tick(FLASH_TIME)
    f.tick(0.5)
    expect(hits).toBe(0)
    let strike = -1
    f.combat.onStrike = (move) => { strike = move }
    expect(f.combat.press()).toBe(true)
    f.tick(0)
    f.tick(f.combat.combat.moveset.moves[0].strike! + 0.01)
    expect(strike).toBe(0)
  })

  it('guard blocks E, interrupts a burst at once, and preserves the special and initial knock-back locks', () => {
    const f = fixture(make())
    f.combat.setGuard(true)
    expect(f.combat.startFlash(f.state, f.camera)).toBe(false)
    f.tick(DT)
    expect(f.combat.startFlash(f.state, f.camera)).toBe(false)
    f.combat.setGuard(false)
    f.tick(DT)
    expect(f.combat.startFlash(f.state, f.camera)).toBe(true)
    f.tick(0.05)
    f.combat.setGuard(true)
    f.tick(0)
    expect(f.combat.guarded).toBe(true)
    expect(f.combat.flashing).toBe(false)
    const position = f.state.pos.clone()
    f.tick(0.2)
    expect(f.state.pos.distanceTo(position)).toBeLessThan(1e-5)
    f.combat.setGuard(false)
    f.combat.startSpecial(f.state, f.camera)
    expect(f.combat.startFlash(f.state, f.camera)).toBe(false)
    f.combat.cancel()
    f.combat.knockback(new Vector3(8, 4, 0))
    expect(f.combat.startFlash(f.state, f.camera)).toBe(false)
    f.combat.setGuard(true)
    f.tick(0.1)
    expect(f.combat.guarded).toBe(false)
  })

  it('a commander still knocks it back during Flash Move, and airborne E presses are discarded', () => {
    const f = fixture(make())
    f.state.airborne = true
    expect(f.combat.startFlash(f.state, f.camera)).toBe(false)
    f.state.airborne = false
    expect(f.combat.startFlash(f.state, f.camera)).toBe(true)
    f.tick(0.05)
    f.combat.knockback(new Vector3(8, 4, 0))
    expect(f.combat.staggered).toBe(true)
    expect(f.combat.flashing).toBe(false)
  })

  it('the swept body stops before scenery even when one frame crosses the entire flash', () => {
    const c = make(), f = fixture(c)
    f.combat.setSteer({ x: 0, z: 1 })
    const centerZ = Math.cos(f.state.yaw) * c.robotOffset
    const wallZ = centerZ + c.profile.robotRadius + 1
    f.combat.flashSweep = (x, z, dx, dz, distance) => flashClearance(x, z, dx, dz, distance, c.profile.robotRadius, [], [{ ax: -20, az: wallZ, bx: 20, bz: wallZ, r: 0.01 }])
    expect(f.combat.startFlash(f.state, f.camera)).toBe(true)
    f.tick(FLASH_TIME)
    const endZ = f.state.pos.z + Math.cos(f.state.yaw) * c.robotOffset
    expect(endZ + c.profile.robotRadius).toBeLessThan(wallZ)
    expect(endZ - centerZ).toBeCloseTo(0.988, 4)
  })

  it.each([1 / 30, 1 / 120, FLASH_TIME])('Flash Move tosses each swept enemy forward once without damage and catches quickly, dt=%s', (dt) => {
    const c = make(), f = fixture(c)
    const horde = new Horde(soldiers, citadel, NO_CONTACT, new AudioMix(), commanders)
    const commander = horde.commanderPosts.find((p) => p.home.role === 'citadel')!.unit
    const { x, z, floor } = commander
    const [soldier, missed, elevated, wide] = horde.nearby(x, z, 60).filter((s) => s !== commander)
    const distance = c.model.robotHeight * 2.5
    soldier.reset(x, z + distance * 0.3, 0, 1001, floor)
    commander.reset(x, z + distance * 0.65, 0, 1002, floor)
    const width = c.model.robotHeight * FLASH_HALF_WIDTH
    missed.reset(x + width + SOLDIER.radius + 0.2, z + distance * 0.5, 0, 1003, floor)
    elevated.reset(x, z + distance * 0.5, 0, 1004, floor + 4)
    wide.reset(x + c.profile.robotRadius + SOLDIER.radius + 0.2, z + distance * 0.5, 0, 1005, floor)
    soldier.health = commander.health = wide.health = 1
    const soldierImpact = vi.spyOn(soldier, 'impact'), commanderImpact = vi.spyOn(commander, 'impact'), wideImpact = vi.spyOn(wide, 'impact')
    f.state.yaw = 0
    f.state.pos.set(x, floor, z - c.robotOffset)
    f.tick(0)
    horde.targetAt(x, z)
    let energy = 0
    f.combat.onStrike = () => energy++
    f.combat.onHit = (hit) => {
      expect(hit.shape).toBe('capsule')
      expect(hit.reaction).toBe('toss')
      expect(hit.damage).toBe(0)
      expect(hit.lift).toBe(FLASH_LIFT)
      expect(hit.reach).toBe(width)
      horde.hit(hit)
    }
    expect(f.combat.startFlash(f.state, f.camera)).toBe(true)
    for (let t = 0; t < FLASH_TIME; t += dt) f.tick(dt)
    for (const [unit, share, impact] of [[soldier, 1, soldierImpact], [commander, COMMANDER.push, commanderImpact], [wide, 1, wideImpact]] as const) {
      expect(unit.alive).toBe(true)
      expect(unit.health).toBe(1)
      expect(unit.mode).toBe('toss')
      expect(impact).toHaveBeenCalledTimes(1)
      expect(unit.vy).toBeGreaterThan(FLASH_LIFT * share * 0.7)
      expect(unit.vy).toBeLessThan(FLASH_LIFT * share * 1.4)
      expect(unit.vz).toBeGreaterThan(FLASH_KNOCK * share * 0.65)
      expect(unit.vz).toBeLessThan(FLASH_KNOCK * share * 1.3)
      expect(Math.abs(unit.vx)).toBeLessThan(unit.vz * 0.25)
    }
    expect(Math.hypot(missed.vx, missed.vz)).toBe(0)
    expect(Math.hypot(elevated.vx, elevated.vz)).toBe(0)
    expect(energy).toBe(0)
    for (const unit of [soldier, commander, wide]) {
      const modes = new Set<string>([unit.mode])
      let peak = 0
      const startZ = unit.z
      for (let t = 0; t < 2; t += DT) {
        unit.update(DT)
        modes.add(unit.mode)
        peak = Math.max(peak, unit.y)
      }
      expect([...modes]).toEqual(expect.arrayContaining(['toss', 'move']))
      expect(modes.has('air') || modes.has('down') || modes.has('rise')).toBe(false)
      expect(peak).toBeGreaterThan(unit === commander ? 0.05 : 0.45)
      expect(peak).toBeLessThan(2)
      expect(unit.z - startZ).toBeGreaterThan(unit === commander ? 1 : 6)
      expect(unit.free).toBe(true)
      expect(unit.alive).toBe(true)
      expect(unit.health).toBe(1)
    }
  })

  it('Flash Move interrupts a soldier attack while preserving the commander\'s combo protection', () => {
    const c = make(), f = fixture(c)
    const horde = new Horde(soldiers, citadel, NO_CONTACT, new AudioMix(), commanders)
    const commander = horde.commanderPosts.find((p) => p.home.role === 'citadel')!.unit
    const { x, z, floor } = commander
    const [soldier] = horde.nearby(x, z, 60).filter((s) => s !== commander)
    soldier.reset(x, z + c.model.robotHeight * 2.5 * 0.3, 0, 1001, floor)
    soldier.mode = 'attack'
    commander.reset(x, z + c.model.robotHeight * 2.5 * 0.65, 0, 1002, floor)
    commander.goal.ready = true
    commander.fight(4)
    commander.update(0.05)
    expect(commander.inCombo).toBe(true)
    f.state.yaw = 0
    f.state.pos.set(x, floor, z - c.robotOffset)
    f.tick(0)
    horde.targetAt(x, z)
    f.combat.onHit = (hit) => horde.hit(hit)
    expect(f.combat.startFlash(f.state, f.camera)).toBe(true)
    f.tick(FLASH_TIME)
    expect(soldier.mode).toBe('toss')
    expect(commander.mode).toBe('attack')
    expect(commander.inCombo).toBe(true)
  })

  it('separate combat controllers cannot reuse an enemy sweep identity', () => {
    const first = fixture(make()), second = fixture(make())
    let a = -1, b = -1
    first.combat.onHit = (hit) => { a = hit.sweep }
    second.combat.onHit = (hit) => { b = hit.sweep }
    expect(first.combat.startFlash(first.state, first.camera)).toBe(true)
    expect(second.combat.startFlash(second.state, second.camera)).toBe(true)
    first.tick(DT); second.tick(DT)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(b).toBeGreaterThanOrEqual(0)
    expect(a).not.toBe(b)
  })

  it('a Flash Move contact cannot turn the next combo hit into a toss', () => {
    const f = fixture(make())
    let flashes = 0, attacks = 0
    f.combat.onHit = (hit) => {
      if (hit.shape === 'capsule') { expect(hit.reaction).toBe('toss'); flashes++ }
      else { expect(hit.reaction).toBeUndefined(); expect(hit.damage).toBeGreaterThan(0); attacks++ }
    }
    expect(f.combat.startFlash(f.state, f.camera)).toBe(true)
    f.tick(FLASH_TIME)
    expect(f.combat.press()).toBe(true)
    for (let t = 0; t < 2; t += DT) f.tick(DT)
    expect(flashes).toBe(1)
    expect(attacks).toBeGreaterThan(0)
  })

  it('its every blow reaches the commander, out of a combo, as it reaches a soldier, at the commander\'s weight', () => {
    for (const hit of blows(character)) {
      const s = new Soldier(soldiers.manifest)
      s.reset(0, 0, 0, 1)
      const c = new Commander(commanders.manifest)
      c.reset(0, 0, 0, 2)
      s.impact(hit)
      c.impact(hit)
      const what = `${hit.special ? 'special' : 'combo'} ${hit.kind} knock ${hit.knock} lift ${hit.lift}`
      // it reacts (a flinch at least, never shrugged off) and is pushed by its share
      expect(['hit', 'air'], what).toContain(c.mode)
      expect(c.vz, what).toBeCloseTo(s.vz * COMMANDER.push, 6)
      // a special throws it whenever it throws a soldier, as high
      if (hit.special && s.mode === 'air' && hit.lift > SOLDIER.launchLift) {
        expect(c.mode, what).toBe('air')
        expect(c.vy, what).toBeCloseTo(s.vy, 6)
      }
    }
  })

  it('its special holds what it empties, soldiers and commander alike, until its last blow', () => {
    const horde = new Horde(soldiers, citadel, NO_CONTACT, new AudioMix(), commanders)
    const c = horde.commanderPosts.find((p) => p.home.role === 'citadel')!.unit
    const [s] = horde.nearby(c.x, c.z, 60).filter((k) => k !== c)
    // the robot stands by them on the crown (blows reach only its own level), out of their fight
    horde.update(0, { x: c.x, z: c.z, radius: 1.5, vx: 0, vz: 0, height: 5.6, heading: 0, guard: 0, present: false }, new PerspectiveCamera())
    horde.special = true
    for (const hit of blows(character).filter((b) => b.special)) {
      for (const u of [c, s]) {
        // the blow lands on it with all its health in it
        horde.hit({ shape: 'circle', kind: hit.kind, x: u.x + 1, z: u.z, heading: 0, reach: 2.5, arc: Math.PI * 2, damage: 1e5, knock: hit.knock, lift: hit.lift, motion: 0, sweep: -1, radial: true, special: true, final: false, bite: true })
        expect(u.alive).toBe(true)
        expect(u.doomed).toBe(true)
      }
    }
    // the last blow breaks them both, wherever they are
    const before = horde.destroyed
    horde.hit({ shape: 'circle', kind: 'blast', x: c.x + 500, z: c.z, heading: 0, reach: 1, arc: Math.PI * 2, damage: 1, knock: 1, lift: 1, motion: 0, sweep: -1, radial: true, special: true, final: true, bite: true })
    expect(c.alive || s.alive).toBe(false)
    expect(horde.destroyed).toBeGreaterThanOrEqual(before + 2)
  })

  it('only its special\'s blows interrupt the commander mid-combo', () => {
    for (const hit of blows(character)) {
      const c = new Commander(commanders.manifest)
      c.reset(0, 0, 0, 2)
      c.goal.ready = true
      c.fight(4)
      c.update(0.05)
      c.impact(hit)
      expect(c.mode === 'attack', `${hit.special ? 'special' : 'combo'} ${hit.kind} knock ${hit.knock} lift ${hit.lift}`).toBe(!hit.special)
    }
  })

  it('its combo is broken by the commander\'s knock-back, but not its special or its guard', () => {
    const knockedAt = (t0: number, clicks: number[], specials: number[], guard: boolean): boolean => {
      let staggered = false
      runFight(make(), clicks, t0 + 0.2, () => undefined, DT, specials, (t, fight, s) => {
        fight.setGuard(guard)
        if (Math.abs(t - t0) < DT / 2) {
          fight.knockback(new Vector3(s.pos.x + 6, 4, s.pos.z))
          staggered = fight.staggered
        }
      })
      return staggered
    }
    // in its combo's second move, and standing
    const chainAt = character.combat.moveset.moves[0].chain[0] + 2 * DT
    expect(knockedAt(chainAt + 0.1, [0, chainAt], [], false)).toBe(true)
    expect(knockedAt(0.4, [], [], false)).toBe(true)
    // in its special, and behind its guard
    expect(knockedAt(0.5, [], [0], false)).toBe(false)
    expect(knockedAt(0.8, [], [], true)).toBe(false)
  })
})

describe('Flash Move body contact', () => {
  it('sweeps a broad front with varied crowd momentum and overlapping flight/landing phases', () => {
    const horde = new Horde(soldiers, citadel, NO_CONTACT, new AudioMix(), commanders)
    const commander = horde.commanderPosts.find((p) => p.home.role === 'citadel')!.unit
    const { x, z, floor } = commander
    const units = horde.nearby(x, z, 60).slice(0, 14)
    expect(units).toHaveLength(14)
    commander.reset(x + 30, z, 0, 1999, floor)
    const crowd = units.slice(0, 12), [ahead, behind] = units.slice(12)
    for (let i = 0; i < crowd.length; i++) {
      crowd[i].reset(x - 3 + i * 6 / 11, z + 4, 0, 2000 + i, floor)
      crowd[i].health = 1
    }
    ahead.reset(x, z + 8 + SOLDIER.radius + 0.1, 0, 2012, floor)
    behind.reset(x, z - SOLDIER.radius - 0.1, 0, 2013, floor)
    horde.targetAt(x, z)
    horde.hit({ shape: 'capsule', kind: 'blunt', reaction: 'toss', fromX: x, fromZ: z, x, z: z + 8, heading: 0,
      reach: 4, arc: Math.PI * 2, damage: 0, knock: FLASH_KNOCK, lift: FLASH_LIFT, motion: 0,
      sweep: 120001, radial: false, special: false, final: false, bite: false })
    expect(ahead.tossing || behind.tossing).toBe(false)
    expect(new Set(crowd.map((s) => s.vz.toFixed(2))).size).toBeGreaterThan(8)
    expect(new Set(crowd.map((s) => s.vy.toFixed(2))).size).toBeGreaterThan(8)
    for (const unit of crowd) {
      expect(unit.tossing).toBe(true)
      expect(unit.vz).toBeGreaterThan(Math.abs(unit.vx) * 4)
      for (let t = 0; t < 0.95; t += DT) unit.update(DT)
      expect(unit.z).toBeGreaterThan(z + 10)
      expect(unit.health).toBe(1)
    }
    expect(crowd.some((s) => s.airborne)).toBe(true)
    expect(crowd.some((s) => !s.airborne)).toBe(true)
    for (const unit of crowd) {
      for (let t = 0; t < 1.1; t += DT) unit.update(DT)
      expect(unit.free).toBe(true)
      expect(unit.health).toBe(1)
      expect(unit.y).toBe(0)
    }
  })

  it.each(['soldier', 'commander'])('does not add speed-based ramming damage to the %s\'s swept toss', (kind) => {
    const horde = new Horde(soldiers, citadel, NO_CONTACT, new AudioMix(), commanders)
    const commander = horde.commanderPosts.find((p) => p.home.role === 'citadel')!.unit
    const { x, z, floor } = commander
    const [soldier] = horde.nearby(x, z, 60).filter((s) => s !== commander)
    const unit = kind === 'soldier' ? soldier : commander
    unit.reset(x, z, 0, 1001, floor)
    if (kind === 'soldier') commander.reset(x + 20, z, 0, 1002, floor)
    else soldier.reset(x + 20, z, 0, 1002, floor)
    unit.health = 1
    horde.targetAt(x - 1, z)
    horde.hit({ shape: 'capsule', kind: 'blunt', reaction: 'toss', fromX: x - 2, fromZ: z, x, z, heading: Math.PI / 2,
      reach: 1.5, arc: Math.PI * 2, damage: 0, knock: FLASH_KNOCK, lift: FLASH_LIFT, motion: 0,
      sweep: -1, radial: false, special: false, final: false, bite: false })
    const push = Math.hypot(unit.vx, unit.vz)
    const camera = new PerspectiveCamera()
    camera.position.set(x - 1, floor + 8, z + 8)
    horde.update(0, { x: x - 1, z, radius: 1.5, vx: 60, vz: 0, height: 5.6, heading: Math.PI / 2,
      guard: 0, present: true, flash: true }, camera)
    expect(unit.alive).toBe(true)
    expect(unit.health).toBe(1)
    expect(unit.mode).toBe('toss')
    expect(unit.vy).toBeGreaterThan(0)
    expect(Math.hypot(unit.vx, unit.vz)).toBeLessThanOrEqual(push + 1e-6)
  })

  it('momentum shared with another soldier during a toss causes no damage or combat launch', () => {
    const horde = new Horde(soldiers, citadel, NO_CONTACT, new AudioMix(), commanders)
    const commander = horde.commanderPosts.find((p) => p.home.role === 'citadel')!.unit
    const { x, z, floor } = commander
    const [a, b] = horde.nearby(x, z, 60).filter((s) => s !== commander)
    commander.reset(x + 20, z, 0, 1001, floor)
    a.reset(x, z, 0, 1002, floor)
    b.reset(x, z + SOLDIER.radius, 0, 1003, floor)
    a.health = b.health = 1
    a.impact({ dirX: 0, dirZ: 1, knock: FLASH_KNOCK, lift: FLASH_LIFT, damage: 0, kind: 'blunt', special: false, reaction: 'toss' })
    const camera = new PerspectiveCamera()
    camera.position.set(x, floor + 8, z + 8)
    horde.update(0, { x, z: z - 10, radius: 1.5, vx: 0, vz: 0, height: 5.6, heading: 0, guard: 0, present: false }, camera)
    expect(a.health).toBe(1)
    expect(b.health).toBe(1)
    expect(a.mode).toBe('toss')
    expect(b.mode).not.toBe('air')
    expect(b.tossing).toBe(true)
    expect(b.vz).toBeGreaterThan(0)
  })

  it.each(['commander', 'soldier', 'soldier into protected commander'])('propagates a harmless body throw from %s', (source) => {
    const horde = new Horde(soldiers, citadel, NO_CONTACT, new AudioMix(), commanders)
    const commander = horde.commanderPosts.find((p) => p.home.role === 'citadel')!.unit
    const { x, z, floor } = commander
    const [soldier] = horde.nearby(x, z, 60).filter((s) => s !== commander)
    commander.reset(x, z, 0, 1001, floor)
    soldier.reset(x + COMMANDER.radius + SOLDIER.radius - 0.2, z, 0, 1002, floor)
    commander.health = soldier.health = 1
    const protectedCombo = source === 'soldier into protected commander'
    if (protectedCombo) { commander.goal.ready = true; expect(commander.fight(4)).toBe(true) }
    const incoming = source === 'commander' ? commander : soldier
    incoming.impact({ dirX: source === 'commander' ? 1 : -1, dirZ: 0, knock: FLASH_KNOCK, lift: FLASH_LIFT,
      damage: 0, kind: 'blunt', special: false, reaction: 'toss' })
    const camera = new PerspectiveCamera()
    camera.position.set(x, floor + 8, z + 8)
    horde.update(0, { x, z: z - 10, radius: 1.5, vx: 0, vz: 0, height: 5.6, heading: 0, guard: 0, present: false }, camera)
    expect(commander.health).toBe(1)
    expect(soldier.health).toBe(1)
    expect(soldier.tossing).toBe(true)
    if (protectedCombo) { expect(commander.inCombo).toBe(true); expect(commander.y).toBe(0) }
    else expect(commander.tossing).toBe(true)
  })

  it.each(['soldier', 'commander'])('a tossed %s stops against scenery without wall damage', (kind) => {
    const horde = new Horde(soldiers, citadel, NO_CONTACT, new AudioMix(), commanders)
    const commander = horde.commanderPosts.find((p) => p.home.role === 'citadel')!.unit
    const { x, z, floor } = commander
    const [soldier] = horde.nearby(x, z, 60).filter((s) => s !== commander)
    const unit = kind === 'soldier' ? soldier : commander
    const other = kind === 'soldier' ? commander : soldier
    other.reset(x + 20, z, 0, 1001, floor)
    unit.reset(x, z, 0, 1002, floor)
    unit.health = 1
    unit.impact({ dirX: -1, dirZ: 0, knock: FLASH_KNOCK, lift: FLASH_LIFT, damage: 0, kind: 'blunt', special: false, reaction: 'toss' })
    // Even externally added momentum cannot turn this harmless response into damage.
    unit.vx = -12
    const wall = vi.spyOn(citadel.grid, 'pushOut').mockImplementation((p, _radius, out) => {
      if (Math.hypot(p.x - x, p.z - z) > 0.05) return null
      p.x += 0.1
      out.nx = 1; out.nz = 0; out.depth = 0.1
      return out
    })
    const camera = new PerspectiveCamera()
    camera.position.set(x, floor + 8, z + 8)
    try {
      horde.update(0, { x, z: z - 10, radius: 1.5, vx: 0, vz: 0, height: 5.6, heading: 0, guard: 0, present: false }, camera)
    } finally { wall.mockRestore() }
    expect(unit.health).toBe(1)
    expect(unit.alive).toBe(true)
    expect(unit.mode).toBe('toss')
    expect(unit.vx).toBeGreaterThanOrEqual(0)
  })
})
