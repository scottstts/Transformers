import { describe, expect, it } from 'vitest'
import { RobotGait } from '../src/content/transformer/animation/gait'
import { RobotJump } from '../src/game/jump'

describe('jump choreography', () => {
  it('has the same timeline and pose at equal elapsed times across frame rates', () => {
    for (const time of [0.2, 0.32, 0.7, 1.15, 1.23, 1.4, 1.7]) {
      const reference = new RobotJump()
      reference.start()
      const expected = reference.update(time)
      for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
        const jump = new RobotJump()
        jump.start()
        let elapsed = 0
        while (elapsed < time) {
          const step = Math.min(dt, time - elapsed)
          jump.update(step)
          elapsed += step
        }
        for (const channel of ['weight', 'crouch', 'tuck', 'air', 'armSwing'] as const) {
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
      jump.start()
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
      expect(jump.pose).toEqual({ weight: 0, crouch: 0, tuck: 0, air: 0, armSwing: 0, airborne: false, tookOff: false, landed: false })
    }
  })

  it.each([0, 3.4, 7.5])('keeps shoulders, elbows and foot targets continuous when jumping at %f m/s', (speed) => {
    const gait = new RobotGait()
    const jump = new RobotJump()
    const dt = 1 / 240
    let previous = gait.update(dt, speed, 0, speed > 4, true)
    for (let frame = 0; frame < 480; frame++) previous = gait.update(dt, speed, 0, speed > 4, true)
    gait.events.length = 0
    jump.start()
    let peakBackswing = 0
    let peakForwardSwing = 0
    for (let frame = 0; frame < 480; frame++) {
      const p = jump.update(dt)
      const pose = gait.update(dt, speed, 0, speed > 4, true, p)
      for (const side of ['R', 'L'] as const) {
        // Bounds on angular/target speed catch one-frame resets at every phase boundary.
        expect(Math.abs(pose.arms[side] - previous.arms[side]) / dt).toBeLessThan(550)
        // Running starts with deeply bent elbows, so opening them spans a larger arc.
        expect(Math.abs(pose.elbow[side] - previous.elbow[side]) / dt).toBeLessThan(800)
        expect(Math.abs(pose.legs[side].step - previous.legs[side].step) / dt).toBeLessThan(12)
        expect(Math.abs(pose.legs[side].up - previous.legs[side].up) / dt).toBeLessThan(8)
      }
      if (p.weight === 1) {
        peakBackswing = Math.max(peakBackswing, pose.arms.R)
        peakForwardSwing = Math.min(peakForwardSwing, pose.arms.R)
      }
      if (p.landed) {
        // Land with both feet ready, rather than restoring the frozen running stride.
        expect(pose.legs.R.up).toBe(0)
        expect(pose.legs.L.up).toBe(0)
        expect(pose.legs.R.step).toBeCloseTo(0, 10)
        expect(pose.legs.L.step).toBeCloseTo(0, 10)
        expect(pose.arms.R).toBeLessThan(-10)
      }
      if (p.weight > 0) expect(gait.events).toHaveLength(0)
      gait.events.length = 0
      previous = pose
    }
    expect(peakBackswing).toBeGreaterThan(20)
    expect(peakForwardSwing).toBeLessThan(-31)
  })
})
