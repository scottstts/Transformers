import { BufferAttribute, BufferGeometry } from 'three/webgpu'
import type { CitadelPart } from './asset'

/**
 * The export merges the halo into the spire's slot meshes. Recover only its
 * annular shell, preserving the exported vertices/normals and leaving its
 * four support arms fixed. These bounds come from ctd/kit/spire.py's halo,
 * and the asset test checks its complete 2048-triangle shell.
 */
export const HALO_Z = -45
export const HALO_SPEED = 0.025

export function splitHalo(part: CitadelPart): CitadelPart[] {
  if (part.bucket !== 'spire' || (part.slot !== 'alloyLight' && part.slot !== 'light')) return [part]
  const geometry = part.geometry
  const position = geometry.getAttribute('position')
  const index = geometry.getIndex()!
  const ring: number[] = [], fixed: number[] = []
  const onRing = (i: number): boolean => {
    const y = position.getY(i)
    const r = Math.hypot(position.getX(i), position.getZ(i) - HALO_Z)
    return y >= 110.799 && y <= 113.201 && r >= 22.199 && r <= 23.801
  }
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2)
    const target = onRing(a) && onRing(b) && onRing(c) ? ring : fixed
    target.push(a, b, c)
  }
  if (!ring.length) return [part]
  const take = (indices: number[]): BufferGeometry => {
    const g = new BufferGeometry()
    for (const name of Object.keys(geometry.attributes)) g.setAttribute(name, geometry.getAttribute(name))
    g.setIndex(new BufferAttribute(new Uint32Array(indices), 1))
    return g
  }
  const result: CitadelPart[] = []
  if (fixed.length) result.push({ ...part, geometry: take(fixed) })
  result.push({ ...part, geometry: take(ring), motion: 'halo' })
  return result
}
