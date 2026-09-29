import { Quaternion, Vector3 } from 'three/webgpu'
import { AudioMix } from '../../src/audio/mix.ts'
import type { Character } from '../../src/content/transformer/character.ts'
import type { GaitStyle } from '../../src/content/transformer/animation/gait.ts'
import { createF1 } from '../../src/content/ferrari-f1/index.ts'
import { createCybertruck } from '../../src/content/cybertruck/index.ts'
import { createSemi } from '../../src/content/semi/index.ts'
import { createBat } from '../../src/content/bat/index.ts'
import { RobotJump } from '../../src/game/jump.ts'
import { NO_CONTACT, readAsset } from '../../tests/support/assets.ts'

const dt = 1 / 240
const create: Record<string, typeof createF1> = { 'ferrari-f1': createF1, cybertruck: createCybertruck, semi: createSemi, bat: createBat }
const JOINTS = ['thigh.L', 'thigh.R', 'shin.L', 'shin.R', 'upperarm.L', 'upperarm.R', 'spine', 'pelvis'] as const

/**
 * A jump from a settled run (or walk), as the session drives it: the take-off
 * momentum carries, Shift stays held. Rendered through the model: a table at
 * 30 Hz (jump phase, pelvis height, each leg's foot target and knee, arms, lean)
 * and the fastest joint rotations, which show snaps as spikes.
 */
export function jumpProbe(name: string, running: boolean, at: number, table: boolean): void {
  const robot: Character = create[name](readAsset(name), NO_CONTACT, new AudioMix())
  if (process.env.GAIT) Object.assign((robot.gait as unknown as { style: GaitStyle }).style, JSON.parse(process.env.GAIT))
  const { gait, model } = robot
  const rig = model.rig
  const speed = running ? robot.profile.robot.runSpeed : robot.profile.robot.walkSpeed
  const jump = new RobotJump()
  for (let i = 0; i < 2400; i++) model.pose(1, gait.update(dt, speed, 0, running, true, jump.update(dt)))
  // wait for the requested stride phase (right leg's cycle fraction) before jumping
  while (Math.abs(((gait.phase / (2 * Math.PI)) % 1) - at) > 0.004) model.pose(1, gait.update(dt, speed, 0, running, true, jump.update(dt)))
  const momentum = speed / robot.profile.robot.runSpeed
  jump.start(momentum, gait.leapTakeoff(momentum))
  const prev = JOINTS.map(() => new Quaternion())
  const peaks = JOINTS.map(() => ({ rate: 0, t: 0 }))
  const pos = (b: string) => new Vector3().setFromMatrixPosition(rig.world[rig.index[b]])
  const knee = (s: string) => 2 * Math.acos(Math.min(1, Math.abs(rig.local[rig.index[`shin.${s}`]].q.w))) * 180 / Math.PI
  const heights: number[] = []
  let t = 0, done = 0
  let lead = '-'
  if (table) console.log('    t  state    wt  pelZ  air |  R step    up  pit knee |  L step    up  pit knee | armR armL lean')
  let row = 0
  while (done < 0.6) {
    const j = jump.update(dt)
    const pose = gait.update(dt, speed, 0, running, true, j)
    model.pose(1, pose)
    t += dt
    if (!jump.active) done += dt
    if (gait.jumpLead) lead = gait.jumpLead
    heights.push(pos('pelvis').z + model.lift)
    JOINTS.forEach((b, i) => {
      const q = rig.local[rig.index[b]].q
      const rate = t > dt ? prev[i].angleTo(q) / dt : 0
      if (rate > peaks[i].rate) peaks[i] = { rate, t }
      prev[i].copy(q)
    })
    if (table && t >= row / 30) {
      row++
      const st = j.airborne ? 'air ' : j.landing ? 'land' : jump.active ? 'load' : 'run '
      const f = (x: number, w = 6) => x.toFixed(2).padStart(w), d = (x: number) => x.toFixed(0).padStart(4)
      const L = pose.legs.L, R = pose.legs.R
      console.log([f(t, 5), st, f(j.weight, 5), f(pos('pelvis').z + model.lift), f(pose.air ?? 0, 5), '|', f(R.step), f(R.up), d(R.pitch * 57.3), d(knee('R')), '|', f(L.step), f(L.up), d(L.pitch * 57.3), d(knee('L')), '|', d(pose.arms.R), d(pose.arms.L), d(pose.lean)].join(' '))
    }
  }
  let accel = 0, at60 = 0
  for (let i = 4; i < heights.length - 4; i++) {
    const a = Math.abs(heights[i + 4] - 2 * heights[i] + heights[i - 4]) / (16 * dt * dt)
    if (a > accel) { accel = a; at60 = i * dt }
  }
  console.log(`${name} jump from a ${running ? 'run' : 'walk'} at stride ${at}: lead ${lead}; peak pelvis accel ${(accel / 9.81).toFixed(1)} g at ${at60.toFixed(2)} s; fastest joints: `
    + JOINTS.map((b, i) => `${b} ${peaks[i].rate.toFixed(0)} rad/s @${peaks[i].t.toFixed(2)}`).join(', '))
}
