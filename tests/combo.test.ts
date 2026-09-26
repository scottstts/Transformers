import { describe, expect, it } from 'vitest'
import { ComboController, type ComboEvent, type ComboMove } from '../src/game/combat/combo'
import { Curve } from '../src/content/transformer/combat/curves'

const MOVES: ComboMove[] = [
  { duration: 0.8, chain: [0.5, 1.0] },
  { duration: 0.9, chain: [0.6, 1.1] },
  { duration: 1.3, chain: [1.0, 1.5] },
  { duration: 2.0, chain: [2.0, 2.0] },
]
const RECOVER = 0.9
const DT = 1 / 60

/** Runs the combo with clicks at the given times; returns the moves started and when the combo recovered / ended. */
function play(clicks: number[], until: number): { moves: number[]; events: Array<[number, string]> } {
  const combo = new ComboController(MOVES, RECOVER)
  const moves: number[] = []
  const events: Array<[number, string]> = []
  const pending = [...clicks]
  for (let t = 0; t <= until; t += DT) {
    while (pending.length && pending[0] <= t) {
      pending.shift()
      combo.press()
    }
    combo.update(DT, (e: ComboEvent) => {
      if (e.type === 'start') moves.push(e.move)
      events.push([t, e.type])
    })
  }
  return { moves, events }
}

describe('click combo', () => {
  it('remembers the next attack through a short movement exit, then expires', () => {
    const combo = new ComboController(MOVES, RECOVER)
    const moves: number[] = []
    const emit = (e: ComboEvent): void => { if (e.type === 'start') moves.push(e.move) }
    combo.press()
    combo.update(0, emit)
    combo.release() // cannot skip an uncommitted strike
    expect(combo.active).toBe(true)
    combo.update(0.7, emit)
    combo.release()
    expect(combo.active).toBe(false)
    combo.update(0.4, emit)
    combo.press()
    combo.update(DT, emit)
    expect(moves).toEqual([0, 1])
    combo.update(0.75, emit)
    combo.release()
    combo.update(0.9, emit)
    combo.press()
    combo.update(DT, emit)
    expect(moves).toEqual([0, 1, 0])
  })

  it('hard cancellation clears movement continuation', () => {
    const combo = new ComboController(MOVES, RECOVER)
    const emit = (): void => undefined
    combo.press()
    combo.update(0, emit)
    combo.update(0.7, emit)
    combo.release()
    combo.cancel()
    combo.press()
    combo.update(0, emit)
    expect(combo.move).toBe(0)
  })

  it('takes buffered input when a frame crosses the entire chain window', () => {
    const combo = new ComboController([{ duration: 0.5, chain: [0.49, 0.5] }, MOVES[1]], RECOVER)
    const moves: number[] = []
    const emit = (e: ComboEvent): void => { if (e.type === 'start') moves.push(e.move) }
    combo.press()
    combo.update(0, emit)
    combo.update(0.48, emit)
    combo.press()
    combo.update(1 / 30, emit)
    expect(moves).toEqual([0, 1])
  })

  it('movement uses the authored grounded exit and never steals a pending attack', () => {
    const combo = new ComboController([{ ...MOVES[0], cancelAt: 0.4 }, MOVES[1]], RECOVER)
    const emit = (): void => undefined
    combo.press()
    combo.update(0, emit)
    combo.update(0.39, emit)
    expect(combo.cancellable).toBe(false)
    combo.update(0.02, emit)
    expect(combo.cancellable).toBe(true)
    combo.press()
    expect(combo.cancellable).toBe(false)
    combo.update(0.02, emit)
    expect(combo.cancellable).toBe(false)
    combo.update(0.1, emit)
    expect(combo.move).toBe(1)
  })
  it('plays one move per click: once is move 1 only, then back to the stance', () => {
    const { moves, events } = play([0], 3)
    expect(moves).toEqual([0])
    expect(events.map((e) => e[1])).toEqual(['start', 'recover', 'end'])
  })

  it('chains 1-2, 1-2-3 and 1-2-3-4 when each click lands in the window', () => {
    // each click lands in the previous move's window (move-relative 0.6, 0.7, 1.2)
    expect(play([0, 0.6], 4).moves).toEqual([0, 1])
    expect(play([0, 0.6, 1.3], 5).moves).toEqual([0, 1, 2])
    expect(play([0, 0.6, 1.3, 2.5], 6).moves).toEqual([0, 1, 2, 3])
  })

  it('buffers a click before the window opens: it chains as the window opens', () => {
    // a mash at 0.2 and 0.3 chains move 2 at 0.5 (move 1's window), not before
    const { moves, events } = play([0, 0.2, 0.3], 3)
    expect(moves).toEqual([0, 1])
    expect(events[1][0]).toBeGreaterThanOrEqual(0.5 - 1e-9)
    expect(events[1][0]).toBeLessThan(0.5 + 2 * DT)
    // a mash chains the whole combo at the authored cadence
    const mash = Array.from({ length: 40 }, (_, i) => i * 0.1)
    expect(play(mash, 5).moves.slice(0, 4)).toEqual([0, 1, 2, 3])
  })

  it('lets movement cut a move short only once its window has been open a moment with no click waiting', () => {
    const combo = new ComboController(MOVES, RECOVER)
    const emit = (): void => undefined
    combo.press()
    combo.update(DT, emit)
    for (let t = DT; t < 0.55; t += DT) combo.update(DT, emit)
    expect(combo.cancellable).toBe(false)
    for (let t = 0.55; t < 0.7; t += DT) combo.update(DT, emit)
    expect(combo.cancellable).toBe(true)
    // a buffered click holds the move
    const held = new ComboController(MOVES, RECOVER)
    held.press()
    held.update(DT, emit)
    held.update(DT, emit)
    held.press()
    held.update(DT, emit)
    for (let t = 0; t < 0.45; t += DT) {
      held.update(DT, emit)
      expect(held.cancellable).toBe(false)
    }
  })

  it('resets to move 1 when a click comes after the window closed', () => {
    // move 1's window closes at 1.0; a click at 1.45 lands in the recovery and restarts the combo
    const { moves, events } = play([0, 1.45], 4)
    expect(moves).toEqual([0, 0])
    expect(events.map((e) => e[1])).toEqual(['start', 'recover', 'start', 'recover', 'end'])
  })

  it('restarts at once from anywhere in the recovery', () => {
    // move 1 recovers at 1.0; a click at 1.05 restarts
    expect(play([0, 1.05], 3).moves).toEqual([0, 0])
  })

  it('ends after the fourth move when nothing is clicked', () => {
    const { moves, events } = play([0, 0.6, 1.3, 2.5], 7)
    expect(moves).toEqual([0, 1, 2, 3])
    expect(events.map((e) => e[1]).slice(-2)).toEqual(['recover', 'end'])
  })

  it('loops: a click in the finisher\'s window, or at once in its recovery, starts the next combo', () => {
    const run = (clicks: number[]): { moves: number[]; events: string[] } => {
      const moves: ComboMove[] = [...MOVES.slice(0, 3), { duration: 2.0, chain: [1.4, 2.0] }]
      const combo = new ComboController(moves, RECOVER)
      const started: number[] = []
      const events: string[] = []
      const pending = [...clicks]
      for (let t = 0; t <= 8; t += DT) {
        while (pending.length && pending[0] <= t) { pending.shift(); combo.press() }
        combo.update(DT, (e) => { events.push(e.type); if (e.type === 'start') started.push(e.move) })
      }
      return { moves: started, events }
    }
    // move 4 starts at 2.5: a click at 3.6 (1.1 in) waits for its window (1.4 in), 4.0 is inside it
    expect(run([0, 0.6, 1.3, 2.5, 3.6]).moves).toEqual([0, 1, 2, 3, 0])
    expect(run([0, 0.6, 1.3, 2.5, 4.0]).moves).toEqual([0, 1, 2, 3, 0])
    // 4.55 is just into the recovery after it: no waiting out the restart delay
    const late = run([0, 0.6, 1.3, 2.5, 4.55])
    expect(late.moves).toEqual([0, 1, 2, 3, 0])
    expect(late.events.slice(4, 6)).toEqual(['recover', 'start'])
  })
})

describe('keyed channel curves', () => {
  it('carries compatible entry velocity without exceeding the authored envelope', () => {
    const c = new Curve(8)
    c.set(0, [[0.4, 1], [0.8, 2]])
    const start = c.at(0.2), speed = c.velocity(0.2)
    c.set(start, [[0.4, 2]], 0, speed)
    expect(c.velocity(0)).toBeCloseTo(speed)
    expect((c.at(1e-5) - start) / 1e-5).toBeCloseTo(speed, 3)
    for (const velocity of [-100, 0, 3, 100]) {
      c.set(0, [[0.1, 1], [0.5, 1.5]], 0, velocity)
      for (let t = 0; t < 0.5; t += 0.001) {
        expect(c.at(t)).toBeGreaterThanOrEqual(0)
        expect(c.at(t)).toBeLessThanOrEqual(t < 0.1 ? 1 : 1.5)
        expect(c.velocity(t)).toBeGreaterThanOrEqual(-1e-8)
      }
    }
  })
  it('pass through every key and never overshoot between them', () => {
    const c = new Curve(8)
    const keys: Array<[number, number]> = [[0.2, 10], [0.3, -12], [0.42, -9], [0.72, 6]]
    c.set(22, keys)
    expect(c.at(0)).toBeCloseTo(22)
    for (const [t, v] of keys) expect(c.at(t)).toBeCloseTo(v, 6)
    const points = [[0, 22] as [number, number], ...keys]
    for (let i = 0; i < points.length - 1; i++) {
      const [t0, v0] = points[i]
      const [t1, v1] = points[i + 1]
      for (let k = 1; k < 20; k++) {
        const v = c.at(t0 + (t1 - t0) * k / 20)
        expect(v).toBeGreaterThanOrEqual(Math.min(v0, v1) - 1e-9)
        expect(v).toBeLessThanOrEqual(Math.max(v0, v1) + 1e-9)
      }
    }
    expect(c.at(5)).toBeCloseTo(6)
  })

  it('moves smoothly: no jump in value between neighbouring samples', () => {
    const c = new Curve(8)
    c.set(0, [[0.1, 1], [0.12, 1.1], [0.5, -2]])
    let last = c.at(0)
    for (let t = 0.001; t < 0.6; t += 0.001) {
      const v = c.at(t)
      expect(Math.abs(v - last)).toBeLessThan(0.05)
      last = v
    }
  })
})

describe('combo held by a special', () => {
  it('goes straight into the recovery when the special ends, then back to idle', () => {
    const combo = new ComboController(MOVES, RECOVER)
    const events: string[] = []
    const emit = (e: ComboEvent): void => { events.push(e.type) }
    combo.update(DT, emit)
    combo.recover(emit)
    expect(combo.phase).toBe('recover')
    for (let t = 0; t <= RECOVER + DT; t += DT) combo.update(DT, emit)
    expect(events).toEqual(['recover', 'end'])
    expect(combo.active).toBe(false)
  })
})
