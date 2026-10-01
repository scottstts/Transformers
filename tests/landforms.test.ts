import { describe, expect, it } from 'vitest'
import { duneHeight } from '../src/worlds/desert/landforms'
import { DUNE_WIND } from '../src/worlds/desert/terrain'

describe('horizon dunes', () => {
  it('keep their slopes near the angle of repose', () => {
    let steepest = 0
    for (let a = 0; a < Math.PI * 2; a += 0.01) {
      for (let r = 2000; r < 3600; r += 8) {
        const x = Math.cos(a) * r, z = Math.sin(a) * r
        const h = duneHeight(x, z, r)
        expect(Number.isFinite(h)).toBe(true)
        steepest = Math.max(steepest, Math.hypot(duneHeight(x + 1, z, r) - h, duneHeight(x, z + 1, r) - h))
      }
    }
    expect(Math.atan(steepest) * 180 / Math.PI).toBeLessThan(43)
  })

  it('face their slip faces downwind, like the near dunes', () => {
    let rise = 0, fall = 0
    for (let s = -1800; s < 1800; s += 2) {
      const x = DUNE_WIND.x * s + 300, z = DUNE_WIND.z * s - 2600
      const r = Math.hypot(x, z)
      const d = duneHeight(x + DUNE_WIND.x * 2, z + DUNE_WIND.z * 2, r) - duneHeight(x, z, r)
      rise = Math.max(rise, d)
      fall = Math.min(fall, d)
    }
    expect(-fall).toBeGreaterThan(rise * 1.5)
  })
})
