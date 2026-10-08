import { describe, expect, it } from 'vitest'
import { MovePlayer } from '../src/content/transformer/combat/player'
import { CH, CHANNELS } from '../src/content/transformer/combat/pose'
import type { CombatMove } from '../src/content/transformer/combat/moves'

describe('move player', () => {
  it('picks the weapon\'s yaw up on the turn nearest the move\'s own, so a chained move never spins the blade round', () => {
    const player = new MovePlayer()
    const neutral = new Float32Array(CHANNELS)
    // the last move ended a whole turn up (340: the same direction as -20)
    player.values[CH['w.yaw']] = 340
    const move: CombatMove = { name: 'next', duration: 0.5, chain: [0.5, 0.5], keys: { 'w.yaw': [[0.2, -14], [0.4, -20]] } }
    player.start(move, neutral)
    let lo = Infinity, hi = -Infinity
    for (let t = 0; t < 0.5; t += 1 / 120) {
      player.update(1 / 120, () => undefined)
      lo = Math.min(lo, player.values[CH['w.yaw']])
      hi = Math.max(hi, player.values[CH['w.yaw']])
    }
    // a few degrees of travel, not 354
    expect(hi - lo).toBeLessThan(10)
    // the recovery settles onto the neutral's turn the same way
    player.values[CH['w.yaw']] = 355
    player.settle(neutral, 0.3)
    player.update(0.15, () => undefined)
    expect(Math.abs(player.values[CH['w.yaw']])).toBeLessThan(5)
  })
})
