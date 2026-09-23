import { describe, expect, it } from 'vitest'
import { createMotionState } from '../src/game/types'
import { advanceTransformation, isTransforming, resolveCircleCollisions, updateCar } from '../src/game/movement'

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

  it('can reverse midway and ends exactly at either form', () => {
    const state = createMotionState()
    state.target = 1
    for (let i = 0; i < 240; i++) advanceTransformation(state, 1 / 60, 8)
    expect(state.progress).toBeCloseTo(0.5)
    state.target = 0
    for (let i = 0; i < 500; i++) advanceTransformation(state, 1 / 60, 8)
    expect(state.progress).toBe(0)
    expect(isTransforming(state)).toBe(false)
  })
})

describe('world collisions', () => {
  it('separates the vehicle from a large rock', () => {
    const state = createMotionState()
    state.pos.set(1, 0, 0)
    state.speed = 10
    resolveCircleCollisions(state, [{ x: 0, z: 0, r: 1 }], 0.3)
    expect(state.pos.x).toBeCloseTo(3.4)
    expect(state.speed).toBe(5)
  })
})

describe('car controls', () => {
  it('does not apply throttle from steering alone', () => {
    const state = createMotionState()
    const controls = { driveThrottle: 0, driveSteering: 1, running: false }
    for (let i = 0; i < 60; i++) updateCar(state, controls, 1 / 60, false)
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
      updateCar(right, rightControls, 1 / 60, false)
      updateCar(left, leftControls, 1 / 60, false)
    }
    expect(right.yaw).toBeLessThan(0)
    expect(right.pos.x).toBeLessThan(0)
    expect(left.yaw).toBeGreaterThan(0)
    expect(left.pos.x).toBeGreaterThan(0)
  })

  it('brakes before changing from forward to reverse', () => {
    const state = createMotionState()
    const controls = { driveThrottle: 1, driveSteering: 0, running: false }
    for (let i = 0; i < 120; i++) updateCar(state, controls, 1 / 60, false)
    expect(state.speed).toBeGreaterThan(0)
    controls.driveThrottle = -1
    updateCar(state, controls, 1 / 60, false)
    expect(state.speed).toBeGreaterThan(0)
    for (let i = 0; i < 120; i++) updateCar(state, controls, 1 / 60, false)
    expect(state.speed).toBeLessThan(0)
  })
})
