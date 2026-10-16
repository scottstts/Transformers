import { describe, expect, it } from 'vitest'
import { readAsset } from './support/assets.ts'

const asset = readAsset('roadster')
const manifest = asset.manifest
const count = manifest.nodes.length
const names = manifest.nodes.map((node) => node.name)
const scale = (f: number, i: number): number => {
  const o = (f * count + i) * 3
  return Math.max(Math.abs(asset.scales![o] - 1), Math.abs(asset.scales![o + 1] - 1), Math.abs(asset.scales![o + 2] - 1))
}

describe('roadster asset', () => {
  it('is well formed: parents first, indices in range, unit quaternions, events inside the playback', () => {
    manifest.nodes.forEach((node, i) => expect(node.parent).toBeLessThan(i))
    for (const nodeMeshes of asset.meshes) {
      for (const { geometry } of nodeMeshes) {
        const n = geometry.getAttribute('position').count
        const index = geometry.getIndex()!.array
        let max = 0
        for (let k = 0; k < index.length; k++) max = Math.max(max, index[k])
        expect(max).toBeLessThan(n)
      }
    }
    for (let k = 0; k < asset.tracks.length; k += 7) {
      const q = Math.hypot(asset.tracks[k + 3], asset.tracks[k + 4], asset.tracks[k + 5], asset.tracks[k + 6])
      expect(Math.abs(q - 1)).toBeLessThan(1e-3)
    }
    expect(asset.lift.every(Number.isFinite)).toBe(true)
    expect(asset.scales!.every(Number.isFinite)).toBe(true)
    for (const e of manifest.events) {
      expect(e.t1).toBeGreaterThan(e.t0)
      expect(e.t0).toBeGreaterThanOrEqual(0)
      expect(e.t1).toBeLessThanOrEqual(1)
    }
  })

  it('never scales the head or the neck, and stands at unit scale (the cabin stays folded in the tub)', () => {
    manifest.nodes.forEach((node, i) => {
      for (let f = 0; f < manifest.frames; f++) {
        if (/(head|neck)/.test(node.name)) expect(scale(f, i), `${node.name} frame ${f}`).toBeLessThan(1e-4)
      }
      if (node.name !== 'asm:cabin') expect(scale(manifest.frames - 1, i), `${node.name} in the stand`).toBeLessThan(1e-3)
    })
  })

  it('carries every brace as braces.ts reads it: two pins and at least two stages', () => {
    const braces = new Set(names.filter((n) => n.startsWith('asm:link.')).map((n) => n.slice(9).replace(/\.(pin\.[AB]|stage\.\d+)$/, '')))
    expect([...braces].sort()).toEqual(['door.L', 'door.R', 'wheelF.L', 'wheelF.R', 'wheelR.L', 'wheelR.R'])
    for (const b of braces) {
      expect(names).toContain(`asm:link.${b}.pin.A`)
      expect(names).toContain(`asm:link.${b}.pin.B`)
      expect(names).toContain(`asm:link.${b}.stage.1`)
    }
  })

  it('has four hub-centred wheels on their carriers', () => {
    for (const w of ['wheelF.L', 'wheelF.R', 'wheelR.L', 'wheelR.R']) {
      const i = names.indexOf(`wheel:${w}`)
      expect(i, w).toBeGreaterThan(-1)
      expect(manifest.nodes[i].kind).toBe('wheel')
      expect(names[manifest.nodes[i].parent]).toBe(`asm:${w}`)
      const box = asset.meshes[i].map(({ geometry }) => geometry.boundingBox!)
      const lo = Math.min(...box.map((b) => b.min.y)), hi = Math.max(...box.map((b) => b.max.y))
      expect(Math.abs(lo + hi)).toBeLessThan(0.01)
    }
    expect(manifest.rig.dims.wheelRadius).toBeCloseTo(0.392, 2)
  })

  it('stands on the ground at both ends and carries the flight altitude in its lift', () => {
    expect(Math.abs(asset.lift[0])).toBeLessThan(0.005)
    expect(Math.abs(asset.lift[manifest.frames - 1])).toBeLessThan(0.005)
    expect(Math.max(...asset.lift)).toBeGreaterThan(15)
  })
})
