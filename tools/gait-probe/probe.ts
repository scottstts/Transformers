import { Vector3 } from 'three/webgpu'
import { AudioMix } from '../../src/audio/mix.ts'
import type { GaitStyle } from '../../src/content/transformer/animation/gait.ts'
import type { Character } from '../../src/content/transformer/character.ts'
import { createF1 } from '../../src/content/ferrari-f1/index.ts'
import { createCybertruck } from '../../src/content/cybertruck/index.ts'
import { createSemi } from '../../src/content/semi/index.ts'
import { NO_CONTACT, readAsset } from '../../tests/support/assets.ts'

const dt = 1 / 240
const G = 9.81
const create: Record<string, typeof createF1 | typeof createCybertruck | typeof createSemi> = {
  'ferrari-f1': createF1, cybertruck: createCybertruck, semi: createSemi,
}

/**
 * One settled gait cycle of a robot, sampled through the rendered model: a
 * per-phase table (optional) and a summary set against gravity and leg length
 * (Froude number, dimensionless cadence, the rendered pelvis's vertical
 * acceleration in g), so timing that reads as sped up shows as numbers.
 */
export function probe(name: string, running: boolean, table: boolean): void {
  const robot: Character = create[name](readAsset(name), NO_CONTACT, new AudioMix())
  // GAIT='{"stance":[0.58,0.2]}' overrides style values for a trial without editing the robot
  if (process.env.GAIT) Object.assign((robot.gait as unknown as { style: GaitStyle }).style, JSON.parse(process.env.GAIT))
  const speed = running ? robot.profile.robot.runSpeed : robot.profile.robot.walkSpeed
  const { gait, model } = robot
  const rig = model.rig
  const L = model.dims.hipZ
  const tilt = ((robot.gait as unknown as { style: GaitStyle }).style.soleTilt ?? 0) * Math.PI / 180
  for (let i = 0; i < 2400; i++) model.pose(1, gait.update(dt, speed, 0, running, true))
  const p0 = gait.phase
  const pos = (b: string, out = new Vector3()) => out.setFromMatrixPosition(rig.world[rig.index[b]])
  const f = (x: number, w = 6) => x.toFixed(2).padStart(w)
  const d = (x: number) => x.toFixed(0).padStart(4)
  const heights: number[] = [], lifts: number[] = [], phases: number[] = []
  const stanceKnee = [Infinity, -Infinity], thigh = [Infinity, -Infinity]
  let swingKnee = 0, frames = 0, next = 0
  if (table) console.log('  ph  pelZ  pelX | R: ankY    up  pit knee thigh | armR armL | yaw')
  const hip = new Vector3(), knee = new Vector3()
  while (gait.phase - p0 < 2 * Math.PI) {
    const pose = gait.update(dt, speed, 0, running, true)
    model.pose(1, pose)
    frames++
    const pel = pos('pelvis')
    heights.push(pel.z + model.lift)
    lifts.push(model.lift)
    phases.push((gait.phase - p0) / (2 * Math.PI))
    pos('hip.R', hip); pos('shin.R', knee)
    const bend = 2 * Math.acos(Math.min(1, Math.abs(rig.local[rig.index['shin.R']].q.w))) * 180 / Math.PI
    const th = Math.atan2(hip.y - knee.y, hip.z - knee.z) * 180 / Math.PI
    thigh[0] = Math.min(thigh[0], th); thigh[1] = Math.max(thigh[1], th)
    const leg = pose.legs.R
    if (leg.up === 0 && Math.abs(leg.pitch - tilt) < 1e-9) { stanceKnee[0] = Math.min(stanceKnee[0], bend); stanceKnee[1] = Math.max(stanceKnee[1], bend) }
    else swingKnee = Math.max(swingKnee, bend)
    const ph = (gait.phase - p0) / (2 * Math.PI)
    if (table && ph >= next / 24) {
      next++
      const ank = pos('foot.R')
      console.log([f(ph, 4), f(pel.z + model.lift), f(pel.x), '|', f(-ank.y + pel.y), f(leg.up), d(leg.pitch * 57.3), d(bend), d(th), '|', d(pose.arms.R), d(pose.arms.L), '|', d(pose.yaw ?? 0)].join(' '))
    }
  }
  const peak = (h: number[]): [number, number] => {
    let a = 0, at = 0
    // sampled at 60 Hz, as a player sees it
    const k = 4, T = k * dt
    for (let i = k; i < h.length - k; i++) {
      const v = Math.abs(h[i + k] - 2 * h[i] + h[i - k]) / (T * T)
      if (v > a) { a = v; at = phases[i] }
    }
    return [a, at]
  }
  const [accel] = peak(heights)
  if (table) {
    const [la, lat] = peak(lifts)
    const [pa, pat] = peak(heights.map((h, i) => h - lifts[i]))
    if (process.env.LIFT) for (let i = 0; i < lifts.length; i += Number(process.env.LIFT)) console.log(phases[i].toFixed(3), (lifts[i] * 100).toFixed(2), ((heights[i] - lifts[i]) * 100).toFixed(2))
    console.log(`  peak accel: lift ${(la / G).toFixed(1)} g at ${lat.toFixed(3)}, rig pelvis ${(pa / G).toFixed(1)} g at ${pat.toFixed(3)}`)
  }
  const cadence = 2 / (frames * dt)
  const step = speed / cadence
  console.log(`${name} ${running ? 'run ' : 'walk'}  ${speed} m/s  Froude ${(speed * speed / (G * L)).toFixed(2)}  `
    + `cadence ${cadence.toFixed(2)} steps/s (dimensionless ${(cadence * Math.sqrt(L / G)).toFixed(2)})  step ${step.toFixed(2)} m (${(step / L).toFixed(2)} L)\n`
    + `  pelvis travel ${((Math.max(...heights) - Math.min(...heights)) * 100).toFixed(1)} cm, peak vertical accel ${(accel / G).toFixed(2)} g  `
    + `stance knee ${stanceKnee[0].toFixed(0)}-${stanceKnee[1].toFixed(0)}  swing knee ${swingKnee.toFixed(0)}  thigh ${thigh[0].toFixed(0)}..${thigh[1].toFixed(0)}`)
}
