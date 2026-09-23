import { describe, expect, it } from 'vitest'
import { createMotionState } from '../src/game/types'
import { advanceTransformation, isTransforming, resolveCircleCollisions } from '../src/game/movement'

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
