import { describe, expect, it } from 'vitest'
import { ENERGY_PER_MOVE, Energy } from '../src/game/combat/energy'

/** Land `combos` full combos' blows (moves 1-4 each), then `extra` more from the start of a combo. */
function charge(energy: Energy, combos: number, extra = 0): void {
  for (let c = 0; c < combos; c++) for (let m = 0; m < ENERGY_PER_MOVE.length; m++) energy.strike(m)
  for (let m = 0; m < extra; m++) energy.strike(m)
}

describe('special energy', () => {
  it('fills in about three full combos, not two', () => {
    const e = new Energy()
    charge(e, 2)
    expect(e.full).toBe(false)
    expect(e.level).toBeGreaterThan(0.6)
    // the third combo's first three blows, then its finisher
    charge(e, 0, 3)
    expect(e.full).toBe(false)
    e.strike(3)
    expect(e.full).toBe(true)
    expect(e.level).toBe(1)
  })

  it('charges more for heavier blows and never past full', () => {
    for (let m = 1; m < ENERGY_PER_MOVE.length; m++) expect(ENERGY_PER_MOVE[m]).toBeGreaterThan(ENERGY_PER_MOVE[m - 1])
    const e = new Energy()
    charge(e, 5)
    expect(e.level).toBe(1)
  })

  it('is spent whole on the special, and only when full', () => {
    const e = new Energy()
    const seen: Array<[number, boolean]> = []
    e.onChange = (level, gained) => seen.push([level, gained])
    charge(e, 1)
    expect(e.spend()).toBe(false)
    charge(e, 2)
    expect(e.spend()).toBe(true)
    expect(e.level).toBe(0)
    expect(e.spend()).toBe(false)
    expect(seen.at(-1)).toEqual([0, false])
    expect(seen.slice(0, -1).every(([, gained]) => gained)).toBe(true)
  })
})
