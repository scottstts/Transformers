import { describe, expect, it } from 'vitest'
import { createMotionState } from '../src/game/types'
import { advanceTransformation, isTransforming, requestTransformation, resolveCircleCollisions, updateCar } from '../src/game/movement'
import { RobotJump } from '../src/game/jump'
import { CYBERTRUCK_PROFILE } from '../src/content/cybertruck'

const CAR = CYBERTRUCK_PROFILE.drive

describe('transformation motion', () => {
  it('waits for the vehicle to stop before unfolding', () => {
    const state = createMotionState()
    state.target = 1
    state.speed = 8
    advanceTransformation(state, 1 / 60, 8)
    expect(state.progress).toBe(0)
    expect(isTransforming(state)).toBe(true)
    state.speed = 0.2
    advanceTransformation(state, 1 / 60, 8)
    expect(state.progress).toBeGreaterThan(0)
  })

  it('ignores repeated requests during braking and playback in both directions, without queuing them', () => {
    const state = createMotionState()
    for (const form of ['robot', 'car'] as const) {
      const target = form === 'robot' ? 1 : 0
      const reverse = form === 'robot' ? 'car' : 'robot'
      state.speed = 8
      requestTransformation(state, form)
      requestTransformation(state, reverse)
      advanceTransformation(state, 1 / 60, 8)
      expect(state.mode).toBe(form)
      expect(state.target).toBe(target)
      expect(state.progress).toBe(1 - target)

      state.speed = 0
      for (let frame = 0; frame < 481; frame++) {
        if (isTransforming(state)) requestTransformation(state, reverse)
        advanceTransformation(state, 1 / 60, 8)
        expect(state.mode).toBe(form)
        expect(state.target).toBe(target)
      }
      expect(state.progress).toBe(target)
      expect(isTransforming(state)).toBe(false)
      for (let frame = 0; frame < 60; frame++) advanceTransformation(state, 1 / 60, 8)
      expect(state.progress).toBe(target)
    }
  })
})

describe('world collisions', () => {
  it('separates the vehicle from a large rock', () => {
    const state = createMotionState()
    state.pos.set(1, 0, 0)
    state.speed = 10
    resolveCircleCollisions(state, [{ x: 0, z: 0, r: 1 }], 0.3, CYBERTRUCK_PROFILE)
    expect(state.pos.x).toBeCloseTo(3.4)
    expect(state.speed).toBe(5)
  })
})

describe('car controls', () => {
  it('does not apply throttle from steering alone', () => {
    const state = createMotionState()
    const controls = { driveThrottle: 0, driveSteering: 1, running: false }
    for (let i = 0; i < 60; i++) updateCar(state, controls, 1 / 60, false, CAR)
    expect(state.speed).toBe(0)
    expect(state.pos.length()).toBe(0)
    expect(state.steer).toBeLessThan(0)
  })

  it('turns right for D and left for A in the chase view', () => {
    const right = createMotionState()
    const left = createMotionState()
    right.yaw = 0
    left.yaw = 0
    right.speed = 8
    left.speed = 8
    const rightControls = { driveThrottle: 0, driveSteering: 1, running: false }
    const leftControls = { driveThrottle: 0, driveSteering: -1, running: false }
    for (let i = 0; i < 30; i++) {
      updateCar(right, rightControls, 1 / 60, false, CAR)
      updateCar(left, leftControls, 1 / 60, false, CAR)
    }
    expect(right.yaw).toBeLessThan(0)
    expect(right.pos.x).toBeLessThan(0)
    expect(left.yaw).toBeGreaterThan(0)
    expect(left.pos.x).toBeGreaterThan(0)
  })

  it('brakes before changing from forward to reverse', () => {
    const state = createMotionState()
    const controls = { driveThrottle: 1, driveSteering: 0, running: false }
    for (let i = 0; i < 120; i++) updateCar(state, controls, 1 / 60, false, CAR)
    expect(state.speed).toBeGreaterThan(0)
    controls.driveThrottle = -1
    updateCar(state, controls, 1 / 60, false, CAR)
    expect(state.speed).toBeGreaterThan(0)
    for (let i = 0; i < 120; i++) updateCar(state, controls, 1 / 60, false, CAR)
    expect(state.speed).toBeLessThan(0)
  })
})

describe('robot jump', () => {
  it('crouches, flies a ballistic arc of about a metre and lands once', () => {
    const jump = new RobotJump()
    jump.start()
    let apex = 0
    let tookOff = 0
    let landed = 0
    let airTime = 0
    for (let i = 0; i < 120; i++) {
      const p = jump.update(1 / 60)
      apex = Math.max(apex, p.air)
      if (p.tookOff) tookOff++
      if (p.landed) landed++
      if (p.airborne) airTime += 1 / 60
      expect(p.air).toBeGreaterThanOrEqual(0)
    }
    expect(tookOff).toBe(1)
    expect(landed).toBe(1)
    expect(apex).toBeGreaterThan(0.9)
    expect(apex).toBeLessThan(1.4)
    expect(airTime).toBeGreaterThan(0.7)
    expect(jump.active).toBe(false)
  })

  it('ignores a new jump until the last one has settled', () => {
    const jump = new RobotJump()
    jump.start()
    jump.update(0.3)
    jump.start()
    expect(jump.active).toBe(true)
    for (let i = 0; i < 120; i++) jump.update(1 / 60)
    expect(jump.active).toBe(false)
  })
})
