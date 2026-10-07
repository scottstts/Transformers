import { Euler, Matrix4, Quaternion, Vector3 } from 'three/webgpu'
import { probeRobot } from './robot.ts'
import type { Character } from '../../src/content/transformer/character.ts'
import type { GaitStyle } from '../../src/content/transformer/animation/gait.ts'

const dt = 1 / 240

/**
 * A settled cycle seen from behind: the side-to-side travel and the roll and yaw
 * of pelvis, chest and head in the ground frame, the feet's and knees' tracks
 * against the hips, and the hands. Angles are world rotations of the joint frames.
 */
export function lateral(name: string, running: boolean, table: boolean): void {
  const robot: Character = probeRobot(name)
  if (process.env.GAIT) Object.assign((robot.gait as unknown as { style: GaitStyle }).style, JSON.parse(process.env.GAIT))
  const speed = running ? robot.profile.robot.runSpeed : robot.profile.robot.walkSpeed
  const { gait, model } = robot
  const rig = model.rig
  for (let i = 0; i < 2400; i++) model.pose(1, gait.update(dt, speed, 0, running, true))
  const p0 = gait.phase
  const pos = (b: string) => new Vector3().setFromMatrixPosition(rig.world[rig.index[b]])
  const euler = new Euler(), q = new Quaternion(), m = new Matrix4()
  // roll about the travel axis (y), yaw about up (z), relative to the stand's own rotation
  const standInv: Record<string, Quaternion> = {}
  const angles = (b: string): [number, number] => {
    q.setFromRotationMatrix(m.extractRotation(rig.world[rig.index[b]]))
    q.multiply(standInv[b])
    euler.setFromQuaternion(q, 'ZXY')
    return [euler.y * 180 / Math.PI, euler.z * 180 / Math.PI]
  }
  // stand orientation of each frame, so only the gait's motion is measured
  {
    const rest = { legs: { R: { step: 0, up: 0, pitch: 0 }, L: { step: 0, up: 0, pitch: 0 } }, crouch: 0.1, sway: 0, arms: { R: 0, L: 0 }, elbow: { R: 0, L: 0 }, lean: 0, roll: 0, twist: 0, breath: 0, headYaw: 0, headPitch: 0, curl: 0.45 }
    rig.poseLive(rest)
    for (const b of ['pelvis', 'chest', 'head']) standInv[b] = new Quaternion().setFromRotationMatrix(m.extractRotation(rig.world[rig.index[b]])).invert()
  }
  const series: Record<string, number[]> = {}
  const push = (k: string, v: number) => (series[k] ??= []).push(v)
  let next = 0
  if (table) console.log('  ph  pelX  pelRoll pelYaw chRoll chYaw hdRoll | ankR ankL kneR kneL | hndR hndL | R up')
  while (gait.phase - p0 < 2 * Math.PI) {
    const pose = gait.update(dt, speed, 0, running, true)
    model.pose(1, pose)
    const pel = pos('pelvis')
    const [pr, py] = angles('pelvis'), [cr, cy] = angles('chest'), [hr] = angles('head')
    push('pelvis x (cm)', pel.x * 100); push('pelvis roll', pr); push('pelvis yaw', py)
    push('chest roll', cr); push('chest yaw', cy); push('head roll', hr)
    const ankR = pos('foot.R').x, ankL = pos('foot.L').x, kneR = pos('shin.R').x, kneL = pos('shin.L').x
    const hipR = pos('hip.R').x
    push('knee R off hip (cm)', (kneR - hipR) * 100); push('ankle R off hip (cm)', (ankR - hipR) * 100)
    push('hand R x (cm)', pos('hand.R').x * 100)
    const ph = (gait.phase - p0) / (2 * Math.PI)
    if (table && ph >= next / 24) {
      next++
      const f = (x: number) => x.toFixed(2).padStart(6), d = (x: number) => x.toFixed(1).padStart(6)
      console.log([f(ph), f(pel.x), d(pr), d(py), d(cr), d(cy), d(hr), '|', f(ankR), f(ankL), f(kneR), f(kneL), '|', f(pos('hand.R').x), f(pos('hand.L').x), '|', f(pose.legs.R.up)].join(' '))
    }
  }
  const cycle = series['pelvis x (cm)'].length * dt
  const out = Object.entries(series).map(([k, v]) => {
    const lo = Math.min(...v), hi = Math.max(...v)
    // peak rate of change, per second, sampled at 60 Hz
    let rate = 0
    for (let i = 4; i < v.length; i++) rate = Math.max(rate, Math.abs(v[i] - v[i - 4]) / (4 * dt))
    return `  ${k.padEnd(22)} ${lo.toFixed(1).padStart(7)} .. ${hi.toFixed(1).padStart(6)}  (range ${(hi - lo).toFixed(1).padStart(5)}, peak rate ${rate.toFixed(0).padStart(4)}/s)`
  })
  console.log(`${name} ${running ? 'run' : 'walk'}  ${speed} m/s  stride cycle ${cycle.toFixed(2)} s\n${out.join('\n')}`)
}
