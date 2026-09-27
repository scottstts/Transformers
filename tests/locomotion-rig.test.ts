import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three/webgpu'
import { createF1, F1_PROFILE, RACER_GAIT } from '../src/content/ferrari-f1/index.ts'
import { AudioMix } from '../src/audio/mix.ts'
import { CYBERTRUCK_PROFILE } from '../src/content/cybertruck/index.ts'
import { SEMI_GAIT, SEMI_PROFILE } from '../src/content/semi/index.ts'
import { HEAVY_GAIT, RobotGait, type GaitStyle } from '../src/content/transformer/animation/gait.ts'
import { RobotRig } from '../src/content/transformer/model/rig.ts'
import { NO_CONTACT, readAsset } from './support/assets.ts'

const cases = [
  { name: 'ferrari-f1', style: RACER_GAIT, speeds: [F1_PROFILE.robot.walkSpeed, F1_PROFILE.robot.runSpeed], steps: [1.95, 5.2], cadence: [3.2 / 1.95, 15.6 / 5.2] },
  { name: 'cybertruck', style: HEAVY_GAIT, speeds: [CYBERTRUCK_PROFILE.robot.walkSpeed, CYBERTRUCK_PROFILE.robot.runSpeed], steps: [2.45, 4.6], cadence: [3.9 / 2.45, 15 / 4.6] },
  // the Semi steps at a slower cadence than the pickup: strides scale with the legs, speeds with their square root
  { name: 'semi', style: SEMI_GAIT, speeds: [SEMI_PROFILE.robot.walkSpeed, SEMI_PROFILE.robot.runSpeed], steps: [3.3, 5.6], cadence: [4.5 / 3.3, 17 / 5.6] },
]
const dt = 1 / 240
const sides = ['L', 'R'] as const
/** A planted, flat foot: no lift, pitched only by the sole's levelling tilt. */
const planted = (style: GaitStyle, leg: { up: number; pitch: number }): boolean =>
  leg.up === 0 && Math.abs(leg.pitch - (style.soleTilt ?? 0) * Math.PI / 180) < 1e-12

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
        const flat = planted(style, leg)
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
    // a sprinter's heel recovery folds the knee to about 130 degrees
    expect(maxKnee).toBeLessThan(135)
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

  // A body stepped faster than gravity swings its legs reads as sped-up film:
  // the gait keeps the cadence of a human scaled to the robot (dynamic similarity).
  it('walks and runs at the cadence of its size', () => {
    const [walk, run] = [F1_PROFILE.robot.walkSpeed, F1_PROFILE.robot.runSpeed]
    const legTime = Math.sqrt(data.dims.hipZ / 9.81)
    // walking stays below the walk-to-run transition (Froude 0.5)
    expect(walk * walk / (9.81 * data.dims.hipZ)).toBeLessThanOrEqual(0.51)
    // steps per leg-pendulum time: a brisk walk 0.6-0.85, a sprint 1.2-1.5
    expect(walk / RACER_GAIT.stride[0] * legTime).toBeGreaterThan(0.6)
    expect(walk / RACER_GAIT.stride[0] * legTime).toBeLessThan(0.85)
    expect(run / RACER_GAIT.stride[1] * legTime).toBeGreaterThan(1.2)
    expect(run / RACER_GAIT.stride[1] * legTime).toBeLessThan(1.5)
  })

  it('flies a ballistic arc and lands into a stance that reverses the fall', () => {
    const robot = createF1(readAsset('ferrari-f1'), NO_CONTACT, new AudioMix())
    const speed = F1_PROFILE.robot.runSpeed
    for (let i = 0; i < 2400; i++) robot.model.pose(1, robot.gait.update(dt, speed, 0, true, true))
    const stance = RACER_GAIT.stance![1]
    const flightTime = (0.5 - stance) * 2 * RACER_GAIT.stride[1] / speed
    let highestFlight = 0
    let lowestLean = Infinity
    const heights: number[] = []
    const phase = robot.gait.phase
    while (robot.gait.phase - phase < 2 * Math.PI) {
      const pose = robot.gait.update(dt, speed, 0, true, true)
      robot.model.pose(1, pose)
      highestFlight = Math.max(highestFlight, pose.air ?? 0)
      lowestLean = Math.min(lowestLean, pose.lean)
      heights.push(robot.model.rig.world[robot.model.rig.index.pelvis].elements[14] + robot.model.lift)
    }
    // gravity sets the rise over the flight time, instead of a hump pulled up and down at any cadence
    expect(highestFlight).toBeCloseTo(9.81 * flightTime * flightTime / 8, 3)
    expect(lowestLean).toBeGreaterThan(9)
    // Seen at 60 Hz, the body's vertical acceleration stays within a sprinter's ground
    // force (about 2.5-3 body weights, less the 1 g it carries); a step in velocity at touchdown or
    // toe-off, or a compression undone by the reach sizing, shows as a spike far above it.
    const k = 4, frame = k * dt
    let accel = 0
    for (let i = k; i < heights.length - k; i++) accel = Math.max(accel, Math.abs(heights[i + k] - 2 * heights[i] + heights[i - k]) / (frame * frame))
    expect(accel / 9.81).toBeLessThan(3)
  })

  it('rolls its levelled sole from heel to toe without rocking the body', () => {
    const robot = createF1(readAsset('ferrari-f1'), NO_CONTACT, new AudioMix())
    const speed = F1_PROFILE.robot.walkSpeed
    for (let i = 0; i < 2400; i++) robot.model.pose(1, robot.gait.update(dt, speed, 0, false, true))
    const lifts: number[] = []
    const phase = robot.gait.phase
    while (robot.gait.phase - phase < 2 * Math.PI) {
      robot.model.pose(1, robot.gait.update(dt, speed, 0, false, true))
      lifts.push(robot.model.lift)
    }
    // The raked sole stood on its heel and dropped the body 1.8 cm within a frame or two of every
    // toe-off. Levelled, only the sole's own belly and rounded toe remain, spread over the roll.
    expect(Math.max(...lifts) - Math.min(...lifts)).toBeLessThan(0.012)
    const step = Math.max(...lifts.slice(4).map((l, i) => Math.abs(l - lifts[i])))
    expect(step).toBeLessThan(0.006)
  })

  it('keeps the rendered running pelvis afloat when both soles leave the ground', () => {
    const robot = createF1(readAsset('ferrari-f1'), NO_CONTACT, new AudioMix())
    const speed = F1_PROFILE.robot.runSpeed
    for (let i = 0; i < 2400; i++) robot.gait.update(dt, speed, 0, true, true)
    const heights: number[] = []
    for (let i = 0; i < 240; i++) {
      const pose = robot.gait.update(dt, speed, 0, true, true)
      robot.model.pose(1, pose)
      const pelvis = robot.model.rig.world[robot.model.rig.index.pelvis].elements[14]
      heights.push(pelvis + robot.model.lift)
      expect(Math.min(robot.model.footClearance('L'), robot.model.footClearance('R'))).toBeGreaterThan(-0.001)
    }
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.14)
  })

  it('keeps running arm pumps half a cycle apart instead of driving both arms forward', () => {
    const gait = new RobotGait(RACER_GAIT)
    for (let i = 0; i < 2400; i++) gait.update(dt, F1_PROFILE.robot.runSpeed, 0, true, true)
    const sums: number[] = []
    for (let i = 0; i < 240; i++) {
      const pose = gait.update(dt, F1_PROFILE.robot.runSpeed, 0, true, true)
      sums.push(pose.arms.L + pose.arms.R)
    }
    expect(Math.max(...sums) - Math.min(...sums)).toBeLessThan(0.1)
  })

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
    { running: false, stanceKnee: [10, 25], swingKnee: 55, thigh: [30, -10] },
    // running: soft stance under the ballistic compression, heel recovery past 110, then a lower
    // knee drive as the foot continuously descends
    { running: true, stanceKnee: [25, 60], swingKnee: 110, thigh: [45, -15] },
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
      if (planted(RACER_GAIT, leg)) { stance[0] = Math.min(stance[0], bend); stance[1] = Math.max(stance[1], bend) }
      else swing = Math.max(swing, bend)
    }
    expect(stance[0]).toBeGreaterThan(stanceKnee[0])
    expect(stance[1]).toBeLessThan(stanceKnee[1])
    expect(swing).toBeGreaterThan(swingKnee)
    expect(flexed).toBeGreaterThan(thigh[0])
    if (running) expect(flexed).toBeLessThan(60)
    expect(extended).toBeLessThan(thigh[1])
  })
})

// The pickup's and the Semi's old walk (5.1 / 5.9 m/s) stepped at twice the rate of their size
// (Froude 0.85) and swung the hips under a counter-held chest: a catwalk wiggle.
describe.each([
  { name: 'cybertruck', style: HEAVY_GAIT, walk: CYBERTRUCK_PROFILE.robot.walkSpeed },
  { name: 'semi', style: SEMI_GAIT, walk: SEMI_PROFILE.robot.walkSpeed },
])('$name walk', ({ name, style, walk }) => {
  const { dims } = readAsset(name).manifest.rig

  it('walks at the cadence of its size', () => {
    const legTime = Math.sqrt(dims.hipZ / 9.81)
    expect(walk * walk / (9.81 * dims.hipZ)).toBeLessThanOrEqual(0.51)
    const cadence = walk / style.stride[0] * legTime
    expect(cadence).toBeGreaterThan(0.75)
    expect(cadence).toBeLessThan(0.95)
  })

  it('carries pelvis and chest as one heavy block, shifting its weight rather than swinging its hips', () => {
    const gait = new RobotGait(style)
    for (let frame = 0; frame < 2400; frame++) gait.update(dt, walk, 0, false, true)
    let list = 0, yaw = 0, waist = 0
    for (let frame = 0; frame < 720; frame++) {
      const pose = gait.update(dt, walk, 0, false, true)
      list = Math.max(list, Math.abs(pose.roll))
      yaw = Math.max(yaw, Math.abs(pose.yaw ?? 0))
      // the chest's yaw against the pelvis's (spine and chest share the twist 1 : 0.6)
      waist = Math.max(waist, Math.abs(pose.twist * 1.6))
    }
    expect(list).toBeLessThan(1.6)
    expect(yaw).toBeLessThan(3.1)
    expect(waist).toBeLessThan(4.6)
  })
})
