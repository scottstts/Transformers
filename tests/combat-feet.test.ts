import { expect, it } from 'vitest'
import { FootPlanner } from '../src/content/transformer/combat/feet'

it('redirects an airborne step without teleporting its height, heading or toe pitch', () => {
  const feet = new FootPlanner()
  feet.plant('R', { x: 0, z: 0, yaw: 0 })
  feet.step('R', { x: 1, z: 2, yaw: 0.5 }, 0.4, 0.3)
  feet.update(0.16, () => undefined)
  const before = { ...feet.sample('R') }
  expect(before.up).toBeGreaterThan(0.2)
  feet.step('R', { x: 2, z: 2, yaw: 1 }, 0.2, 0.15)
  expect(feet.sample('R')).toEqual(before)
  feet.update(0.2, () => undefined)
  expect(feet.sample('R')).toEqual({ x: 2, z: 2, yaw: 1, up: 0, pitch: 0, skid: 0 })
})
