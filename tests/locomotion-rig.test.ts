import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three/webgpu'
import { F1_PROFILE, RACER_GAIT } from '../src/content/ferrari-f1/index.ts'
import { CYBERTRUCK_PROFILE } from '../src/content/cybertruck/index.ts'
import { HEAVY_GAIT, RobotGait } from '../src/content/transformer/animation/gait.ts'
import { RobotRig } from '../src/content/transformer/model/rig.ts'
import { readAsset } from './support/assets.ts'

const cases = [
  { name: 'ferrari-f1', style: RACER_GAIT, speeds: [F1_PROFILE.robot.walkSpeed, F1_PROFILE.robot.runSpeed], steps: [1.575, 3.8], cadence: [3.2 / 1.05, 7.8 / 1.9] },
  { name: 'cybertruck', style: HEAVY_GAIT, speeds: [CYBERTRUCK_PROFILE.robot.walkSpeed, CYBERTRUCK_PROFILE.robot.runSpeed], steps: [2.025, 4.6], cadence: [3.4 / 1.35, 7.5 / 2.3] },
]
const dt = 1 / 240
const sides = ['L', 'R'] as const

describe.each(cases)('$name locomotion rig', ({ name, style, speeds, steps, cadence }) => {
  const { rig: data } = readAsset(name).manifest

  it.each([false, true])('takes the full requested steps without shortening unreachable targets (running %s)', (running) => {
    const gait = new RobotGait(style)
    const rig = new RobotRig(data.bones, data.stand, data.dims)
    const speed = speeds[Number(running)]
    for (let frame = 0; frame < 2400; frame++) gait.update(dt, speed, 0, running, true)
    const phase = gait.phase
    const previous = { L: new Vector3(), R: new Vector3() }
    const wasFlat = { L: false, R: false }
    let plantedChecks = 0
    let maxError = 0
    let maxKnee = 0
    let minKnee = Infinity
    for (let frame = 0; frame < 720; frame++) {
      const pose = gait.update(dt, speed, 0, running, true)
      rig.poseLive(pose)
      for (const side of sides) {
        const leg = pose.legs[side]
        const s = side === 'L' ? 1 : -1
        const target = new Vector3(s * (data.dims.stanceX ?? data.dims.hipX) * (pose.track ?? 1),
          -((data.dims.footF ?? data.dims.robotF) + leg.step), data.dims.ankleZ + leg.up)
        const ankle = new Vector3().setFromMatrixPosition(rig.world[rig.index[`foot.${side}`]])
        maxError = Math.max(maxError, ankle.distanceTo(target))
        const knee = 2 * Math.acos(Math.min(1, Math.abs(rig.local[rig.index[`shin.${side}`]].q.w))) * 180 / Math.PI
        maxKnee = Math.max(maxKnee, knee)
        minKnee = Math.min(minKnee, knee)
        const flat = leg.up === 0 && leg.pitch === 0
        if (flat && wasFlat[side]) {
          expect((ankle.y - previous[side].y) / dt).toBeCloseTo(speed, 3)
          expect(ankle.x).toBeCloseTo(previous[side].x, 6)
          expect(ankle.z).toBeCloseTo(previous[side].z, 6)
          plantedChecks++
        }
        previous[side].copy(ankle)
        wasFlat[side] = flat
      }
    }
    const travelledPerStep = speed * 720 * dt / ((gait.phase - phase) / Math.PI)
    expect(travelledPerStep).toBeCloseTo(steps[Number(running)], 5)
    // Preserve the original step rate while covering more ground with each step.
    expect((gait.phase - phase) / Math.PI / (720 * dt)).toBeCloseTo(cadence[Number(running)], 5)
    expect(maxError).toBeLessThan(1e-5)
    expect(minKnee).toBeGreaterThan(9.9)
    expect(maxKnee).toBeLessThan(125)
    expect(plantedChecks).toBeGreaterThan(40)
  })

  it('keeps joints continuous through starting, running, turning and stopping', () => {
    const gait = new RobotGait(style)
    const rig = new RobotRig(data.bones, data.stand, data.dims)
    const joints = ['thigh.L', 'thigh.R', 'shin.L', 'shin.R', 'upperarm.L', 'upperarm.R']
    const previous = joints.map(() => new Quaternion())
    let maxRate = 0
    let peak = ''
    for (let frame = 0; frame < 2400; frame++) {
      const time = frame * dt
      const speed = time < 2 ? speeds[0] * time / 2 : time < 4 ? speeds[0] : time < 6 ? speeds[0] + (speeds[1] - speeds[0]) * (time - 4) / 2 : Math.max(0, speeds[1] * (8 - time) / 2)
      rig.poseLive(gait.update(dt, speed, time > 8 && time < 9 ? 1 : 0, time >= 4 && time < 8, true))
      joints.forEach((joint, i) => {
        const q = rig.local[rig.index[joint]].q
        if (frame > 0) {
          const rate = previous[i].angleTo(q) / dt
          if (rate > maxRate) { maxRate = rate; peak = `${joint} at ${time.toFixed(3)} s` }
        }
        previous[i].copy(q)
      })
    }
    // The long run now plays at its original cadence, doubling angular speeds
    // relative to the slowed stride; a one-frame joint reset still exceeds this bound.
    expect(maxRate, peak).toBeLessThan(40)
  })

  it('carries the pelvis on a smooth, shallow bounce through a long running stride', () => {
    const gait = new RobotGait(style)
    const rig = new RobotRig(data.bones, data.stand, data.dims)
    const speed = speeds[1]
    for (let frame = 0; frame < 2400; frame++) gait.update(dt, speed, 0, true, true)
    const heights: number[] = []
    const phase = gait.phase
    while (gait.phase - phase < 2 * Math.PI) {
      const pose = gait.update(dt, speed, 0, true, true)
      rig.poseLive(pose)
      heights.push(new Vector3().setFromMatrixPosition(rig.world[rig.index.pelvis]).z + (pose.air ?? 0))
    }
    // Sized per frame, the reach dropped the pelvis 0.3-0.5 m whenever the legs splayed in flight.
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.1)
    const rate = Math.max(...heights.slice(1).map((h, i) => Math.abs(h - heights[i]) / dt))
    expect(rate).toBeLessThan(3.5)
  })

  it.each([false, true])('matches foot velocity through lift-off and touchdown (running %s)', (running) => {
    const gait = new RobotGait(style)
    const speed = speeds[Number(running)]
    for (let frame = 0; frame < 2400; frame++) gait.update(dt, speed, 0, running, true)
    const contact = style.stance ?? [0.6, 0.36]
    const stance = contact[0] + (contact[1] - contact[0]) * gait.run
    const epsilon = 1e-5
    for (const boundary of [stance, 1]) {
      const sample = (f: number) => {
        gait.phase = f * Math.PI * 2
        return gait.update(0, speed, 0, running, true).legs.R
      }
      const before = sample(boundary - epsilon)
      const at = sample(boundary)
      const after = sample(boundary + epsilon)
      for (const channel of ['step', 'up', 'pitch'] as const) {
        const incoming = (at[channel] - before[channel]) / epsilon
        const outgoing = (after[channel] - at[channel]) / epsilon
        expect(Math.abs(incoming - outgoing), channel).toBeLessThan(0.02)
      }
    }
  })
})

describe('F1 carriage', () => {
  const { rig: data } = readAsset('ferrari-f1').manifest

  it.each([false, true])('bends the knees forward and pumps the arms in narrow opposing arcs (running %s)', (running) => {
    const gait = new RobotGait(RACER_GAIT)
    const rig = new RobotRig(data.bones, data.stand, data.dims)
    const speed = running ? F1_PROFILE.robot.runSpeed : F1_PROFILE.robot.walkSpeed
    for (let frame = 0; frame < 2400; frame++) gait.update(dt, speed, 0, running, true)
    let armOpposition = 0
    for (let frame = 0; frame < 720; frame++) {
      const pose = gait.update(dt, speed, 0, running, true)
      rig.poseLive(pose)
      for (const side of sides) {
        const position = (bone: string) => new Vector3().setFromMatrixPosition(rig.world[rig.index[`${bone}.${side}`]])
        const hip = position('hip')
        const knee = position('shin')
        const axis = position('foot').sub(hip).normalize()
        const bend = knee.sub(hip)
        bend.addScaledVector(axis, -bend.dot(axis))
        expect(bend.y).toBeLessThan(0)
        expect(Math.abs(bend.x)).toBeLessThan(0.1)
        expect(Math.abs(position('hand').x - position('upperarm').x)).toBeLessThan(0.25)
        const elbow = rig.local[rig.index[`forearm.${side}`]].q.angleTo(new Quaternion()) * 180 / Math.PI
        expect(elbow).toBeLessThan(95)
        if (running) expect(elbow).toBeGreaterThan(55)
        armOpposition += pose.legs[side].step * pose.arms[side]
      }
    }
    // Positive shoulder pitch sends the arm back while the same-side foot reaches forward.
    expect(armOpposition / 1440).toBeGreaterThan(2)
  })

  it.each([
    // walking: near-straight stance, the swing knee folds to about 60 degrees, the hip extends behind
    { running: false, stanceKnee: [15, 35], swingKnee: 55, thigh: [30, -10] },
    // running: soft landing, about 45 degrees at mid-stance, heel recovery past 110 and a high knee drive
    { running: true, stanceKnee: [20, 55], swingKnee: 110, thigh: [60, -15] },
  ])('moves its legs through human ranges (running $running)', ({ running, stanceKnee, swingKnee, thigh }) => {
    const gait = new RobotGait(RACER_GAIT)
    const rig = new RobotRig(data.bones, data.stand, data.dims)
    const speed = running ? F1_PROFILE.robot.runSpeed : F1_PROFILE.robot.walkSpeed
    for (let frame = 0; frame < 2400; frame++) gait.update(dt, speed, 0, running, true)
    const stance = [Infinity, -Infinity]
    let swing = 0, flexed = -Infinity, extended = Infinity
    for (let frame = 0; frame < 720; frame++) {
      const pose = gait.update(dt, speed, 0, running, true)
      rig.poseLive(pose)
      const hip = new Vector3().setFromMatrixPosition(rig.world[rig.index['hip.R']])
      const knee = new Vector3().setFromMatrixPosition(rig.world[rig.index['shin.R']])
      // thigh angle from vertical, forward positive (forward is -y)
      const angle = Math.atan2(hip.y - knee.y, hip.z - knee.z) * 180 / Math.PI
      flexed = Math.max(flexed, angle)
      extended = Math.min(extended, angle)
      const bend = 2 * Math.acos(Math.min(1, Math.abs(rig.local[rig.index['shin.R']].q.w))) * 180 / Math.PI
      const leg = pose.legs.R
      if (leg.up === 0 && leg.pitch === 0) { stance[0] = Math.min(stance[0], bend); stance[1] = Math.max(stance[1], bend) }
      else swing = Math.max(swing, bend)
    }
    expect(stance[0]).toBeGreaterThan(stanceKnee[0])
    expect(stance[1]).toBeLessThan(stanceKnee[1])
    expect(swing).toBeGreaterThan(swingKnee)
    expect(flexed).toBeGreaterThan(thigh[0])
    expect(extended).toBeLessThan(thigh[1])
  })
})
