import { describe, expect, it } from 'vitest'
import { flashClearance } from '../src/game/combat/flash-travel'

describe('Flash Move continuous body sweep', () => {
  it('crosses open space for the full requested distance', () => {
    expect(flashClearance(0, 0, 0, 1, 8, 1.4, [], [])).toBe(8)
  })

  it.each([0, Math.PI / 2, Math.PI / 4])('stops the body before a thin wall, heading %s', (heading) => {
    const dx = Math.sin(heading), dz = Math.cos(heading)
    const wall = { ax: dx * 3 - dz * 5, az: dz * 3 + dx * 5, bx: dx * 3 + dz * 5, bz: dz * 3 - dx * 5, r: 0.02 }
    const reach = flashClearance(0, 0, dx, dz, 9, 1.2, [], [wall])
    expect(reach).toBeCloseTo(3 - 1.22 - 0.002, 6)
  })

  it('includes rounded wall ends, rocks and the robot radius, and chooses the nearest obstacle', () => {
    expect(flashClearance(0, 0, 0, 1, 10, 1, [{ x: 0, z: 6, r: 1 }], [])).toBeCloseTo(3.998)
    expect(flashClearance(0, 0, 0, 1, 10, 1, [{ x: 0, z: 6, r: 1 }], [{ ax: 0.5, az: 3, bx: 3, bz: 3, r: 0.2 }]))
      .toBeCloseTo(3 - Math.sqrt(1.2 ** 2 - 0.5 ** 2) - 0.002)
  })

  it('allows tangent and outward motion from contact but never moves into the obstacle', () => {
    const wall = [{ ax: -5, az: 0, bx: 5, bz: 0, r: 0 }]
    expect(flashClearance(0, 1, 1, 0, 8, 1, [], wall)).toBe(8)
    expect(flashClearance(0, 1, 0, 1, 8, 1, [], wall)).toBe(8)
    expect(flashClearance(0, 1, 0, -1, 8, 1, [], wall)).toBe(0)
    expect(flashClearance(0, 1, 0, -1, 8, 1, [{ x: 0, z: 0, r: 0.1 }], [])).toBe(0)
    expect(flashClearance(0, 1, 0, 1, 8, 1, [{ x: 0, z: 0, r: 0.1 }], [])).toBe(8)
  })
})
