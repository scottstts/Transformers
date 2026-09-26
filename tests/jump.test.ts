import { describe, expect, it } from 'vitest'
import { RobotGait } from '../src/content/transformer/animation/gait'
import { RobotJump } from '../src/game/jump'

const RUN_SPEED = 7.5

describe('jump choreography', () => {
  it.each([0, 0.45, 1])('has the same timeline and pose at equal elapsed times across frame rates (momentum %f)', (momentum) => {
    for (const time of [0.1, 0.2, 0.32, 0.7, 1.15, 1.23, 1.4, 1.7]) {
      const reference = new RobotJump()
      reference.start(momentum)
      const expected = reference.update(time)
      for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
        const jump = new RobotJump()
        jump.start(momentum)
        let elapsed = 0
        while (elapsed < time) {
          const step = Math.min(dt, time - elapsed)
          jump.update(step)
          elapsed += step
        }
        for (const channel of ['weight', 'crouch', 'push', 'tuck', 'air', 'flight', 'armSwing'] as const) {
          expect(jump.pose[channel]).toBeCloseTo(expected[channel], 10)
        }
        expect(jump.pose.airborne).toBe(expected.airborne)
        expect(jump.active).toBe(reference.active)
      }
    }
  })

  it.each([30, 60, 144])('fires one takeoff and landing per jump at %i fps and resets for replay', (fps) => {
    const jump = new RobotJump()
    for (let cycle = 0; cycle < 2; cycle++) {
      jump.start(cycle * 0.8)
      let takeoffs = 0
      let landings = 0
      for (let frame = 0; frame < fps * 2; frame++) {
        const p = jump.update(1 / fps)
        takeoffs += Number(p.tookOff)
        landings += Number(p.landed)
      }
      expect(takeoffs).toBe(1)
      expect(landings).toBe(1)
      expect(jump.active).toBe(false)
      expect(jump.pose.weight).toBe(0)
      expect(jump.pose.airborne).toBe(false)
      expect(jump.pose.landing).toBe(false)
    }
  })

  it('springs off a run sooner and shallower than a standing jump', () => {
    const takeoffAt = (momentum: number): { time: number; deepest: number } => {
      const jump = new RobotJump()
      jump.start(momentum)
      let time = 0
      let deepest = 0
      while (!jump.pose.tookOff) {
        deepest = Math.max(deepest, jump.update(1 / 240).crouch)
        time += 1 / 240
      }
      return { time, deepest }
    }
    const stand = takeoffAt(0)
    const run = takeoffAt(1)
    expect(run.time).toBeLessThan(stand.time * 0.5)
    expect(run.deepest).toBeLessThan(stand.deepest * 0.5)
  })

  it.each([0, 3.4, RUN_SPEED])('keeps shoulders, elbows and foot targets continuous when jumping at %f m/s', (speed) => {
    const gait = new RobotGait()
    const jump = new RobotJump()
    const dt = 1 / 240
    const running = speed > 4
    let previous = gait.update(dt, speed, 0, running, true)
    for (let frame = 0; frame < 480; frame++) previous = gait.update(dt, speed, 0, running, true)
    gait.events.length = 0
    jump.start(speed / RUN_SPEED)
    let peakBack = 0
    let peakForward = 0
    let lead: 'R' | 'L' | null = null
    for (let frame = 0; frame < 480; frame++) {
      const p = jump.update(dt)
      const pose = gait.update(dt, speed, 0, running, true, p)
      if (p.weight > 0) lead = gait.jumpLead
      for (const side of ['R', 'L'] as const) {
        // Bounds on angular/target speed catch one-frame resets at every phase boundary.
        expect(Math.abs(pose.arms[side] - previous.arms[side]) / dt).toBeLessThan(550)
        // Running starts with deeply bent elbows, so opening them spans a larger arc.
        expect(Math.abs(pose.elbow[side] - previous.elbow[side]) / dt).toBeLessThan(800)
        // Longer steps return through a larger arc during the same jump handover.
        expect(Math.abs(pose.legs[side].step - previous.legs[side].step) / dt).toBeLessThan(16)
        expect(Math.abs(pose.legs[side].up - previous.legs[side].up) / dt).toBeLessThan(8)
      }
      if (p.weight === 1) {
        const forwardArm = lead ? (lead === 'R' ? 'L' : 'R') : 'R'
        peakBack = Math.max(peakBack, pose.arms[lead ?? 'R'])
        peakForward = Math.min(peakForward, pose.arms[forwardArm])
      }
      if (p.landed) {
        if (lead) {
          // a leap lands on its lead foot, heel first, the other leg still swinging through
          const trail = lead === 'R' ? 'L' : 'R'
          expect(pose.legs[lead].step).toBeGreaterThan(pose.legs[trail].step)
          expect(pose.legs[lead].up).toBeLessThan(0.1)
          expect(pose.legs[trail].up).toBeGreaterThan(pose.legs[lead].up + 0.1)
          expect(pose.legs[lead].pitch).toBeLessThan(0)
        } else {
          // two-footed: both feet ready side by side, rather than the frozen stride
          expect(pose.legs.R.up).toBeCloseTo(0, 10)
          expect(pose.legs.L.up).toBeCloseTo(0, 10)
          expect(pose.legs.R.step).toBeCloseTo(0, 10)
          expect(pose.legs.L.step).toBeCloseTo(0, 10)
          expect(pose.arms.R).toBeLessThan(-10)
        }
      }
      // no stride footfalls while loading or in the air; they resume as the landing hands back
      if (p.weight > 0 && !(p.landing && p.weight < 0.5)) expect(gait.events).toHaveLength(0)
      gait.events.length = 0
      previous = pose
    }
    expect(lead === null).toBe(speed < RUN_SPEED)
    expect(peakBack).toBeGreaterThan(lead ? 10 : 20)
    expect(peakForward).toBeLessThan(lead ? -25 : -31)
  })
})

describe('gait', () => {
  it.each([[3.4, false], [RUN_SPEED, true]] as const)('keeps a planted foot still on the ground at %f m/s', (speed, running) => {
    const gait = new RobotGait()
    const dt = 1 / 240
    for (let frame = 0; frame < 960; frame++) gait.update(dt, speed, 0, running, true)
    let previous = gait.update(dt, speed, 0, running, true)
    let checked = 0
    for (let frame = 0; frame < 480; frame++) {
      const pose = gait.update(dt, speed, 0, running, true)
      for (const side of ['R', 'L'] as const) {
        const leg = pose.legs[side]
        const before = previous.legs[side]
        // flat on the ground (between the heel roll and the toe-off): the foot moves back exactly as the body moves on
        if (leg.up === 0 && before.up === 0 && leg.pitch === 0 && before.pitch === 0) {
          expect((leg.step - before.step) / dt).toBeCloseTo(-speed, 1)
          checked++
        }
      }
      previous = pose
    }
    expect(checked).toBeGreaterThan(40)
  })

  it('shifts the pelvis over the planted leg', () => {
    const gait = new RobotGait()
    const dt = 1 / 240
    for (let frame = 0; frame < 960; frame++) gait.update(dt, 3.4, 0, false, true)
    let checked = 0
    for (let frame = 0; frame < 480; frame++) {
      const pose = gait.update(dt, 3.4, 0, false, true)
      const planted = (side: 'R' | 'L'): boolean => pose.legs[side].up === 0 && pose.legs[side].pitch === 0
      // authoring frame: +x is the robot's left
      if (planted('R') && pose.legs.L.up > 0.1) { expect(pose.sway).toBeLessThan(0); checked++ }
      if (planted('L') && pose.legs.R.up > 0.1) { expect(pose.sway).toBeGreaterThan(0); checked++ }
    }
    expect(checked).toBeGreaterThan(40)
  })
})
