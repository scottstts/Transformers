import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three/webgpu'
import { AudioMix } from '../src/audio/mix.ts'
import type { Character } from '../src/content/transformer/character.ts'
import { createF1 } from '../src/content/ferrari-f1/index.ts'
import { createCybertruck } from '../src/content/cybertruck/index.ts'
import { createSemi } from '../src/content/semi/index.ts'
import { RobotJump } from '../src/game/jump.ts'
import { NO_CONTACT, readAsset } from './support/assets.ts'

const dt = 1 / 240
const robots = [['ferrari-f1', createF1], ['cybertruck', createCybertruck], ['semi', createSemi]] as const
const JOINTS = ['thigh.L', 'thigh.R', 'shin.L', 'shin.R'] as const

/** A leap from a settled run, pressed at stride fraction `at`, driven as the session drives it. */
function leap(make: typeof createF1, name: string, at: number) {
  const robot: Character = make(readAsset(name), NO_CONTACT, new AudioMix())
  const { gait, model } = robot
  const rig = model.rig
  const speed = robot.profile.robot.runSpeed
  const jump = new RobotJump()
  for (let i = 0; i < 2400; i++) model.pose(1, gait.update(dt, speed, 0, true, true, jump.update(dt)))
  while (Math.abs(((gait.phase / (2 * Math.PI)) % 1) - at) > 0.004) model.pose(1, gait.update(dt, speed, 0, true, true, jump.update(dt)))
  const takeoff = gait.leapTakeoff(1)
  jump.start(1, takeoff)
  const frames: Array<{ state: string; pelvis: number; knee: Record<'L' | 'R', number>; up: Record<'L' | 'R', number>; step: Record<'L' | 'R', number>; rate: number }> = []
  const prev = JOINTS.map(() => new Quaternion())
  let lead: 'L' | 'R' | null = null
  let first = true
  let settled = 0
  while (settled < 0.3) {
    const j = jump.update(dt)
    const pose = gait.update(dt, speed, 0, true, true, j)
    model.pose(1, pose)
    if (!jump.active) settled += dt
    lead ??= gait.jumpLead
    let rate = 0
    JOINTS.forEach((b, i) => {
      const q = rig.local[rig.index[b]].q
      if (!first) rate = Math.max(rate, prev[i].angleTo(q) / dt)
      prev[i].copy(q)
    })
    first = false
    const knee = (s: 'L' | 'R') => 2 * Math.acos(Math.min(1, Math.abs(rig.local[rig.index[`shin.${s}`]].q.w))) * 180 / Math.PI
    frames.push({
      state: j.airborne ? 'air' : j.landing ? 'land' : jump.active ? 'load' : 'run',
      pelvis: new Vector3().setFromMatrixPosition(rig.world[rig.index.pelvis]).z + model.lift,
      knee: { L: knee('L'), R: knee('R') }, up: { L: pose.legs.L.up, R: pose.legs.R.up }, step: { L: pose.legs.L.step, R: pose.legs.R.step }, rate,
    })
  }
  return { frames, lead: lead!, takeoff: takeoff! }
}

describe.each(robots)('%s running leap', (name, make) => {
  it.each([0.1, 0.35, 0.6, 0.85])('springs off a toe-off, holds a gathered leap and runs on (pressed at stride %f)', (at) => {
    const { frames, lead, takeoff } = leap(make, name, at)
    const trail = lead === 'R' ? 'L' : 'R'
    const air = frames.filter((f) => f.state === 'air')
    const load = frames.filter((f) => f.state === 'load')
    const hold = air.slice(Math.floor(air.length / 3), Math.floor(2 * air.length / 3))
    const touch = frames.findIndex((f) => f.state === 'land')
    const runMax = Math.max(...frames.filter((f) => f.state === 'run').map((f) => f.pelvis))
    let landAccel = 0
    for (let i = touch - 24; i < touch + 24; i++) landAccel = Math.max(landAccel, Math.abs(frames[i + 4].pelvis - 2 * frames[i].pelvis + frames[i - 4].pelvis) / (16 * dt * dt) / 9.81)
    // it waits for the stride: the next toe-off with a loaded foot, within half a cycle
    const cadence = { 'ferrari-f1': 15.6 / 5.2, cybertruck: 15 / 4.6, semi: 17 / 5.6 }[name]
    expect(takeoff).toBeGreaterThanOrEqual(0.08)
    expect(takeoff).toBeLessThan(1 / cadence + 0.09)
    expect(load.some((f) => f.up[trail] === 0)).toBe(true)
    // The pelvis keeps the run's carriage while loading. Dropping the reach sizing under the jump's
    // weight popped it up to the stand (about 30 cm in 0.03 s) and locked both knees straight.
    expect(Math.max(...load.map((f) => f.pelvis))).toBeLessThan(runMax + 0.02)
    // no joint snaps (60-100 rad/s at the take-off and landing before)
    expect(Math.max(...frames.map((f) => f.rate))).toBeLessThan(45)
    // a gathered leap with bent knees, not a frozen straight-legged split
    expect(Math.min(...hold.map((f) => Math.min(f.knee.L, f.knee.R)))).toBeGreaterThan(45)
    // the lead foot lands as the stride's strike, the trailing leg still swinging through
    expect(frames[touch].up[lead]).toBeLessThan(0.05)
    expect(frames[touch].up[trail]).toBeGreaterThan(0.3)
    // The landing takes the fall at its speed: firm (stopping 5.2 m/s over the sink), but no jolt.
    // Stopping dead and then crouching, with the stride reset under it, measured 47-81 g.
    expect(landAccel).toBeLessThan(13)  })
})
