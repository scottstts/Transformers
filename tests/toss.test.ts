import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three/webgpu'
import { Soldier, type SoldierImpact } from '../src/game/enemies/soldier'
import { COMMANDER, Commander } from '../src/game/enemies/commander'
import { TOSS_SPEED_LIMIT, TossReaction } from '../src/game/enemies/toss'
import { FLASH_KNOCK, FLASH_LIFT } from '../src/content/transformer/combat/flash'
import { readSoldier } from './support/assets'
import { POSES, SC, SOLDIER_CHANNEL_COUNT } from '../src/content/soldier/poses'

const soldier = readSoldier().manifest
const commander = readSoldier('commander').manifest
const blow = (heading: number): SoldierImpact => ({
  dirX: Math.sin(heading), dirZ: Math.cos(heading), knock: FLASH_KNOCK, lift: FLASH_LIFT,
  damage: 0, kind: 'blunt', special: false, reaction: 'toss',
})

describe.each(['soldier', 'commander'] as const)('crowd impact: %s', (kind) => {
  const make = () => kind === 'soldier' ? new Soldier(soldier) : new Commander(commander)
  const share = kind === 'soldier' ? 1 : COMMANDER.push

  it.each([1 / 30, 1 / 120])('flies several metres forward with loose limbs and catches quickly for any facing, dt=%s', (dt) => {
    for (const heading of [0, Math.PI / 2, -1.3]) {
      const unit = make()
      unit.reset(0, 0, heading + 1.1, 1)
      unit.health = 1
      unit.impact(blow(heading))
      let peak = 0, previous = 0, caught = false, loose = 0, upright = 1, lastAirUp = 1, lastAirLoose = 0, exitSpeed = 0
      const q = new Quaternion(), up = new Vector3()
      for (let t = 0; t < 1.3; t += dt) {
        unit.update(dt)
        unit.refresh()
        const forward = unit.x * Math.sin(heading) + unit.z * Math.cos(heading)
        const side = unit.x * Math.cos(heading) - unit.z * Math.sin(heading)
        expect(forward).toBeGreaterThanOrEqual(previous - 1e-6)
        expect(Math.abs(side)).toBeLessThan(Math.max(0.03, forward * 0.06))
        expect(unit.y).toBeGreaterThanOrEqual(0)
        expect(['air', 'down', 'rise']).not.toContain(unit.mode)
        expect([...unit.rows].every(Number.isFinite)).toBe(true)
        q.setFromRotationMatrix(unit.rig.world[unit.rig.index.pelvis])
        up.set(0, 0, 1).applyQuaternion(q)
        expect(up.y).toBeGreaterThan(-0.5)
        upright = Math.min(upright, up.y)
        if (unit.tossing && unit.airborne) { lastAirUp = up.y; lastAirLoose = unit.pose.legsFree }
        if (exitSpeed === 0 && unit.free) exitSpeed = Math.hypot(unit.vx, unit.vz)
        loose = Math.max(loose, unit.pose.legsFree)
        peak = Math.max(peak, unit.y)
        previous = forward
        caught ||= unit.tossing && !unit.airborne
      }
      expect(peak).toBeGreaterThan(kind === 'soldier' ? 0.8 : 0.1)
      expect(peak).toBeLessThan(1.2)
      expect(previous).toBeGreaterThan(kind === 'soldier' ? 8 : 1.5)
      expect(upright).toBeLessThan(kind === 'soldier' ? 0.6 : 0.9)
      expect(loose).toBeGreaterThan(0.7)
      expect(lastAirLoose).toBeGreaterThan(0.95)
      expect(lastAirUp).toBeLessThan(kind === 'soldier' ? 0.6 : 0.95)
      expect(exitSpeed).toBeGreaterThan(0)
      expect(caught).toBe(true)
      expect(unit.free).toBe(true)
      expect(unit.y).toBe(0)
      expect(unit.health).toBe(1)
      expect(unit.alive).toBe(true)
    }
  })

  it('fresh collisions add bounded momentum without stacking lift or snapping flight to the floor', () => {
    const unit = make()
    unit.reset(0, 0, 0, 1)
    for (let n = 0; n < 6; n++) {
      const flying = unit.tossing && unit.airborne
      const y = unit.y, vy = unit.vy
      const vx = unit.vx, vz = unit.vz
      const heading = n % 2 ? Math.PI / 2 : 0
      unit.impact(blow(heading))
      const nextX = vx + Math.sin(heading) * FLASH_KNOCK * share
      const nextZ = vz + Math.cos(heading) * FLASH_KNOCK * share
      const clamp = Math.min(1, TOSS_SPEED_LIMIT * share / Math.hypot(nextX, nextZ))
      expect(unit.vx).toBeCloseTo(nextX * clamp)
      expect(unit.vz).toBeCloseTo(nextZ * clamp)
      expect(unit.vy).toBeCloseTo(flying ? vy : FLASH_LIFT * share)
      if (flying) expect(unit.y).toBe(y)
      unit.update(0.05)
    }
    for (let t = 0; t < 1.2; t += 1 / 120) unit.update(1 / 120)
    expect(unit.free).toBe(true)
  })

  it('incoming momentum and a mid-flight collision change travel instead of fixing its endpoint', () => {
    const slow = make(), fast = make()
    slow.reset(0, 0, 0, 1); fast.reset(0, 0, 0, 1)
    slow.vz = -4 * share; fast.vz = 6 * share
    slow.impact(blow(0)); fast.impact(blow(0))
    slow.update(0.2); fast.update(0.2)
    expect(fast.z - slow.z).toBeGreaterThan(1.5 * share)
    const stoppedAt = fast.z
    fast.vx = fast.vz = 0
    fast.update(0.1)
    expect(fast.z).toBe(stoppedAt)
    expect(fast.y).toBeGreaterThanOrEqual(0)
  })

  it('ordinary attacks can still damage and fully launch it during the short reaction', () => {
    const unit = make()
    unit.reset(0, 0, 0, 1)
    unit.impact(blow(0))
    unit.update(0.1)
    const health = unit.health
    unit.impact({ ...blow(0), reaction: undefined, damage: 12, lift: 20 })
    expect(unit.health).toBe(health - 12)
    expect(unit.mode).toBe('air')
    expect(unit.tossing).toBe(false)
    unit.update(0.1)
    expect(unit.y).toBeGreaterThan(0.5)
  })

  it.each(['air', 'down', 'rise', 'held'] as const)('does not replace an existing %s reaction or release its hold', (mode) => {
    const unit = make()
    unit.reset(0, 0, 0, 1)
    unit.mode = mode === 'held' ? 'hit' : mode
    unit.doomed = mode === 'held'
    if (mode === 'held') unit.health = 0
    if (mode === 'air') { unit.y = 2; unit.vy = 3 }
    unit.impact(blow(0))
    expect(unit.mode).toBe(mode === 'held' ? 'hit' : mode)
    expect(unit.doomed).toBe(mode === 'held')
    expect(unit.alive).toBe(true)
    if (mode === 'air') { expect(unit.y).toBe(2); expect(unit.vy).toBe(3) }
  })
})

describe('crowd throw trajectory', () => {
  it('integrates flight and landing consistently at 30/120 Hz and across a whole-flight frame', () => {
    const run = (steps: readonly number[]) => {
      const toss = new TossReaction()
      toss.start(FLASH_LIFT, 9.8, 1, 1, 0)
      let distance = 0, velocity = FLASH_KNOCK
      for (const dt of steps) {
        toss.update(dt)
        distance += velocity * toss.advance
        velocity *= toss.decay
      }
      return { distance, velocity, y: toss.y, vy: toss.vy, done: toss.done }
    }
    const fine = run(Array(168).fill(1 / 120))
    const coarse = run(Array(42).fill(1 / 30))
    const single = run([1.4])
    for (const sample of [coarse, single]) {
      expect(sample.distance).toBeCloseTo(fine.distance, 8)
      expect(sample.velocity).toBeCloseTo(fine.velocity, 8)
      expect(sample.y).toBe(0)
      expect(sample.vy).toBe(0)
      expect(sample.done).toBe(true)
    }
  })

  it('stays tipped with free limbs through descent and restores balance only after contact', () => {
    const toss = new TossReaction(), pose = new Float32Array(SOLDIER_CHANNEL_COUNT)
    toss.start(FLASH_LIFT, 9.8, 1, 1, 0, 13)
    toss.update(toss.flight * 0.95)
    toss.pose(pose, POSES.ready, POSES.flung, 3)
    expect(toss.vy).toBeLessThan(0)
    expect(toss.tipX).toBeGreaterThan(1)
    expect(pose[SC.legsFree]).toBeGreaterThan(0.99)
    const tip = toss.tipX
    toss.update(toss.flight * 0.05 + 0.02)
    expect(toss.airborne).toBe(false)
    expect(toss.tipX).toBeGreaterThan(tip * 0.9)
    toss.update(0.4)
    expect(toss.tipX).toBe(0)
    expect(toss.done).toBe(true)
  })

  it('gives neighbours different body orientations and limb phases for the same push', () => {
    const samples = new Set<string>()
    const pose = new Float32Array(SOLDIER_CHANNEL_COUNT)
    for (let serial = 1; serial <= 12; serial++) {
      const toss = new TossReaction()
      toss.start(FLASH_LIFT, 9.8, 1, 1, 0, serial)
      toss.update(0.35)
      toss.pose(pose, POSES.ready, POSES.flung, 3)
      samples.add([toss.tipX, toss.tipZ, pose[SC['L.pitch']], pose[SC['R.thigh']]].map((n) => n.toFixed(2)).join(','))
      expect([...pose].every(Number.isFinite)).toBe(true)
    }
    expect(samples.size).toBe(12)
  })
})
