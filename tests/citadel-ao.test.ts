import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { probeCitadelAo, type AoProbeSample } from '../tools/preview/citadel-ao-probe'

// Optional native-GPU integration tests: CITADEL_AO_GPU=1 npm test -- tests/citadel-ao.test.ts
describe.skipIf(process.env.CITADEL_AO_GPU !== '1')('citadel AO shader', () => {
  let samples: AoProbeSample[]
  beforeAll(async () => {
    vi.stubGlobal('self', globalThis)
    vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => setTimeout(() => cb(performance.now()), 16))
    vi.stubGlobal('cancelAnimationFrame', (id: ReturnType<typeof setTimeout>) => clearTimeout(id))
    samples = await probeCitadelAo()
  }, 30000)
  afterAll(() => vi.unstubAllGlobals())

  it('leaves open air unoccluded at every face direction and slice height', () => {
    for (const s of samples.filter((s) => s.kind === 'open')) expect(s.visibility, s.name).toBeCloseTo(1, 4)
  })

  it('does not shade the lower halves of isolated outward walls and towers', () => {
    for (const s of samples.filter((s) => s.kind === 'wall' || s.kind === 'tower')) expect(s.visibility, s.name).toBeGreaterThan(0.98)
  })

  it('keeps local ground contact symmetric and fades it outside the world radius', () => {
    for (const s of samples.filter((s) => s.kind === 'contact')) {
      // A tall body beside this open ground blocks at most half its upper
      // hemisphere; roof classification must not darken it further.
      expect(s.visibility, s.name).toBeGreaterThan(0.72)
      if (s.name.endsWith('distance=1')) expect(s.visibility, s.name).toBeLessThan(0.95)
      if (s.name.endsWith('distance=20')) expect(s.visibility, s.name).toBeCloseTo(1, 4)
      const sameDistance = samples.find((p) => p.name === s.name.replace(/angle=[^ ]+/, 'angle=0'))!
      // The 0.74 m raster and 16 azimuths quantize translated silhouettes.
      expect(Math.abs(s.visibility - sameDistance.visibility), s.name).toBeLessThan(0.03)
    }
  })

  it('still occludes faces looking into an alley, with matching opposite walls', () => {
    for (const s of samples.filter((s) => s.kind === 'alley')) {
      expect(s.visibility, s.name).toBeLessThan(0.9)
      const opposite = samples.find((p) => p.name === s.name.replace(/side=-?1/, 'side=1'))!
      expect(Math.abs(s.visibility - opposite.visibility), s.name).toBeLessThan(0.02)
    }
  })

  it('retains occlusion where a roof actually covers the ground', () => {
    for (const s of samples.filter((s) => s.kind === 'roof')) expect(s.visibility, s.name).toBeLessThan(0.85)
  })

  it('does not turn an overhead lintel into a solid wall beside a lower face', () => {
    for (const s of samples.filter((s) => s.kind === 'overhang')) expect(s.visibility, s.name).toBeGreaterThan(0.95)
  })
})
