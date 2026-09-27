import { describe, expect, it } from 'vitest'
import { SAND_RADIANCE, SUN_COLOR, atmosphereProbe } from '../src/worlds/desert/atmosphere'

const luminance = (c: number[]): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

describe('desert air', () => {
  it('gives the sun its intensity at the ground, a warm white', () => {
    expect(luminance(SUN_COLOR.toArray())).toBeCloseTo(1, 3)
    expect(SUN_COLOR.r).toBeGreaterThan(SUN_COLOR.b)
  })

  it('hazes surfaces more with distance, brightest toward the sun', () => {
    let last = 1
    for (const d of [50, 300, 1000, 3000, 10000]) {
      const side = atmosphereProbe(1.5, 0.02, d)
      expect(side.transmittance).toBeLessThan(last)
      last = side.transmittance
      expect(luminance(atmosphereProbe(0.1, 0.02, d).inscatter)).toBeGreaterThan(luminance(side.inscatter))
    }
    // the fortress from the start keeps most of its own light
    expect(atmosphereProbe(1.5, 0.02, 330).transmittance).toBeGreaterThan(0.9)
  })

  it('makes the sky bluer overhead than at the horizon, and the horizon brighter', () => {
    const zenith = atmosphereProbe(1.5, 1.5, 1).sky
    const horizon = atmosphereProbe(1.5, 0.03, 1).sky
    expect(zenith[2] / zenith[0]).toBeGreaterThan(horizon[2] / horizon[0])
    expect(luminance(horizon)).toBeGreaterThan(luminance(zenith))
    // below the horizon: the sunlit sand
    expect(atmosphereProbe(1.5, -0.3, 1).sky[0]).toBeCloseTo(SAND_RADIANCE.r, 1)
  })
})
