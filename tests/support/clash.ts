import { Box3, Matrix4, Vector3, type BufferGeometry, type Mesh, type Object3D } from 'three/webgpu'

/** A body node's surface: its triangles in its own frame (9 floats each) and their bounds. */
export interface Surface {
  name: string
  object: Object3D
  tris: Float32Array
  box: Box3
}

/** Every node of a posed model that carries geometry (the weapon hanging off a hand is not the body's). */
export function surfaces(nodes: readonly Object3D[]): Surface[] {
  return nodes.filter((n) => n.children.some((c) => (c as Mesh).isMesh)).map((n) => {
    const tris: number[] = []
    const box = new Box3()
    for (const child of n.children) {
      const g = (child as Mesh).geometry as BufferGeometry | undefined
      if (!g || child.name.startsWith('weapon:')) continue
      const p = g.getAttribute('position')
      const index = g.getIndex()!
      for (let k = 0; k < index.count; k++) {
        const i = index.getX(k)
        tris.push(p.getX(i), p.getY(i), p.getZ(i))
      }
      g.computeBoundingBox()
      box.union(g.boundingBox!)
    }
    return { name: n.name, object: n, tris: new Float32Array(tris), box }
  })
}

/** Shares along the world segment a-b where it passes through the surface (pushed onto `out`). */
export function crossings(s: Surface, a: Vector3, b: Vector3, out: number[]): void {
  _inv.copy(s.object.matrixWorld).invert()
  _a.copy(a).applyMatrix4(_inv)
  _b.copy(b).applyMatrix4(_inv)
  _box.makeEmpty().expandByPoint(_a).expandByPoint(_b)
  if (!_box.intersectsBox(s.box)) return
  for (let k = 0; k < s.tris.length; k += 9) {
    const u = segmentTriangle(_a, _b, s.tris, k)
    if (u >= 0) out.push(u)
  }
}

/** Segment p-q against the triangle at t[k..k+8]: the share along the segment where it crosses, or -1. */
export function segmentTriangle(p: Vector3, q: Vector3, t: Float32Array, k: number): number {
  const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z
  const ax = t[k], ay = t[k + 1], az = t[k + 2]
  const e1x = t[k + 3] - ax, e1y = t[k + 4] - ay, e1z = t[k + 5] - az
  const e2x = t[k + 6] - ax, e2y = t[k + 7] - ay, e2z = t[k + 8] - az
  const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x
  const det = e1x * hx + e1y * hy + e1z * hz
  if (Math.abs(det) < 1e-12) return -1
  const f = 1 / det
  const sx = p.x - ax, sy = p.y - ay, sz = p.z - az
  const u = f * (sx * hx + sy * hy + sz * hz)
  if (u < 0 || u > 1) return -1
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x
  const v = f * (dx * qx + dy * qy + dz * qz)
  if (v < 0 || u + v > 1) return -1
  const s = f * (e2x * qx + e2y * qy + e2z * qz)
  return s >= 0 && s <= 1 ? s : -1
}

const _inv = new Matrix4()
const _a = new Vector3()
const _b = new Vector3()
const _box = new Box3()
