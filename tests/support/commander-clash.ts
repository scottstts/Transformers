import { Matrix4, Vector3 } from 'three/webgpu'
import type { SoldierAsset } from '../../src/content/soldier/asset'
import type { SoldierRig } from '../../src/content/soldier/rig'

/** A triangle of a part, in its bone's frame. */
export interface Tri { bone: number; a: Vector3; b: Vector3; c: Vector3 }

/** LOD2's triangles, in their bones' frames. */
export function triangles(asset: SoldierAsset): Tri[] {
  const out: Tri[] = []
  for (const { geometry } of asset.lods[2]) {
    const p = geometry.getAttribute('position'), b = geometry.getAttribute('boneIndex'), idx = geometry.getIndex()!
    for (let i = 0; i < idx.count; i += 3) {
      const [i0, i1, i2] = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)]
      out.push({ bone: b.getX(i0), a: new Vector3().fromBufferAttribute(p, i0), b: new Vector3().fromBufferAttribute(p, i1), c: new Vector3().fromBufferAttribute(p, i2) })
    }
  }
  return out
}

/** The parts (bone names) whose triangles the segment p-q crosses, skipping `skip`. */
export function crossings(rig: SoldierRig, tris: Tri[], p: Vector3, q: Vector3, skip: string[]): string[] {
  const names = Object.keys(rig.index)
  const skipped = new Set(skip.map((n) => rig.index[n]))
  const hits: string[] = []
  const dir = q.clone().sub(p)
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), e1 = new Vector3(), e2 = new Vector3(), h = new Vector3(), s = new Vector3(), k = new Vector3()
  for (const t of tris) {
    if (skipped.has(t.bone)) continue
    const m: Matrix4 = rig.world[t.bone]
    a.copy(t.a).applyMatrix4(m); b.copy(t.b).applyMatrix4(m); c.copy(t.c).applyMatrix4(m)
    e1.subVectors(b, a); e2.subVectors(c, a)
    h.crossVectors(dir, e2)
    const det = e1.dot(h)
    if (Math.abs(det) < 1e-9) continue
    const f = 1 / det
    s.subVectors(p, a)
    const u = f * s.dot(h)
    if (u < 0 || u > 1) continue
    k.crossVectors(s, e1)
    const w = f * dir.dot(k)
    if (w < 0 || u + w > 1) continue
    const r = f * e2.dot(k)
    if (r >= 0 && r <= 1) hits.push(names.find((n) => rig.index[n] === t.bone)!)
  }
  return hits
}

