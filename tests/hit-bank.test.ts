import { describe, expect, it } from 'vitest'
import { BLOW_KINDS, HIT_VARIANTS, blowTake } from '../src/content/soldier/hit-bank'

const RATE = 48000

/** Energy of a take's band [lo, hi] Hz over a window (s), by a direct DFT on a coarse bin grid. */
function band(x: Float32Array, t0: number, t1: number, lo: number, hi: number): number {
  const a = Math.round(t0 * RATE), b = Math.min(x.length, Math.round(t1 * RATE))
  let e = 0
  for (let f = lo; f <= hi; f *= 1.12) {
    let re = 0, im = 0
    for (let i = a; i < b; i++) { const w = (2 * Math.PI * f * i) / RATE; re += x[i] * Math.cos(w); im += x[i] * Math.sin(w) }
    e += re * re + im * im
  }
  return e
}

describe('hit bank', () => {
  it('renders every take finite and normalised, each different', () => {
    for (const kind of BLOW_KINDS) {
      const takes = Array.from({ length: HIT_VARIANTS }, (_, v) => blowTake(kind, v, RATE))
      for (const x of takes) {
        let peak = 0
        for (const s of x) { expect(Number.isFinite(s)).toBe(true); peak = Math.max(peak, Math.abs(s)) }
        expect(peak).toBeCloseTo(0.9, 3)
      }
      expect(takes[0][2000]).not.toBe(takes[1][2000])
    }
  })

  it('gives the punch and the heavy hit a low body, and the slash a ringing high tail', () => {
    const punch = blowTake('punch', 0, RATE), heavy = blowTake('heavy', 0, RATE), slash = blowTake('slash', 0, RATE)
    expect(band(punch, 0, 0.15, 40, 160)).toBeGreaterThan(band(punch, 0, 0.15, 3000, 8000))
    // the heavy hit's thump sits lower and lasts longer than the punch's
    expect(band(heavy, 0.15, 0.35, 30, 90) / band(heavy, 0, 0.15, 30, 90)).toBeGreaterThan(band(punch, 0.15, 0.35, 30, 90) / band(punch, 0, 0.15, 30, 90))
    // the blade's ring carries on after the chop is gone
    expect(band(slash, 0.25, 0.5, 3800, 13000)).toBeGreaterThan(band(slash, 0.25, 0.5, 60, 400))
  })

  it('gives the cutlass its thump, then the tearing through the whole spectrum, ringing on past a second', () => {
    for (let v = 0; v < HIT_VARIANTS; v++) {
      const cutlass = blowTake('cutlass', v, RATE)
      // the blade lands: a deep thump, the highs not yet in
      expect(band(cutlass, 0, 0.06, 120, 300)).toBeGreaterThan(100 * band(cutlass, 0, 0.06, 2000, 8000))
      // then it tears through: the highs come up over the low body
      expect(band(cutlass, 0.15, 0.45, 2000, 8000)).toBeGreaterThan(5 * band(cutlass, 0, 0.06, 2000, 8000))
      // and it rings on past a second, well down
      const tail = band(cutlass, 0.9, 1.2, 40, 8000)
      expect(tail).toBeGreaterThan(0)
      expect(tail).toBeLessThan(band(cutlass, 0.15, 0.45, 40, 8000) / 20)
    }
  })
})
