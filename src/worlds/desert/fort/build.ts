import { Group, Matrix4, Mesh, type Material } from 'three/webgpu'
import { MeshWriter } from './mesh'
import type { FortPlan, Xz } from './plan'
import { T_WALL } from './plan'
import { cornerPillar, gate, tWall } from './walls'
import { watchtower } from './tower'
import { hangar } from './hangar'
import { bunker, container, fuelTank, gabion, jerseyBarrier, mast } from './props'

/** Module frame to fort frame: at (x, z) on the sand, its front (+z) turned to `yaw`. */
function at(p: Xz, yaw: number, y = 0): Matrix4 {
  return new Matrix4().makeRotationY(yaw).setPosition(p[0], y, p[1])
}

/**
 * Compile a fort plan into one mesh per material slot, in the fort frame
 * (the group carries the site's placement). Deterministic: the per-slab tone
 * and the slabs' few millimetres of settling come from the slab's index.
 */
export function buildFort(plan: FortPlan, materials: Record<string, Material>): { group: Group; triangles: number } {
  const w = new MeshWriter()
  // perimeter slabs, each settled a little out of line as placed slabs are
  for (const run of plan.walls) {
    const dx = run.b[0] - run.a[0], dz = run.b[1] - run.a[1]
    const len = Math.hypot(dx, dz)
    const ux = dx / len, uz = dz / len
    // slab frame: x along the wall, z outward = (uz, -ux)
    const yaw = Math.atan2(uz, -ux)
    for (let i = 0; i < run.slabs; i++) {
      const t = (i + 0.5) * T_WALL.width
      const h = hash(run.a[0] * 13.1 + run.a[1] * 7.7 + i)
      const p: Xz = [run.a[0] + ux * t + (h - 0.5) * 0.03 * uz, run.a[1] + uz * t - (h - 0.5) * 0.03 * ux]
      w.shade(hash(i * 3.7 + run.b[0]))
      tWall(w, at(p, yaw + (h - 0.5) * 0.012))
    }
  }
  w.shade(0.5)
  for (let k = 0; k < plan.corners.length; k++) {
    const a = plan.corners[k], b = plan.corners[(k + 1) % plan.corners.length]
    cornerPillar(w, at(a, Math.atan2(b[0] - a[0], b[1] - a[1])))
  }
  for (const g of plan.gates) {
    // gate frame: x along the wall, z outward
    const yaw = Math.atan2(g.out[0], g.out[1])
    gate(w, at(g.at, yaw), g.leaf)
  }
  for (const t of plan.towers) watchtower(w, at(t.at, t.yaw + Math.PI))
  for (const h of plan.hangars) hangar(w, at(h.at, h.yaw), h)
  bunker(w, at(plan.bunker.at, plan.bunker.yaw), plan.bunker)
  for (const c of plan.containers) container(w, at(c.at, c.yaw), c, c.y ?? 0)
  for (const t of plan.tanks) fuelTank(w, at(t.at, t.yaw))
  for (const g of plan.hescos) gabion(w, at(g.at, g.yaw), g)
  for (const b of plan.barriers) jerseyBarrier(w, at(b.at, b.yaw))
  for (const m of plan.masts) mast(w, at(m.at, m.yaw))

  const group = new Group()
  for (const [slot, geometry] of w.build()) {
    const material = materials[slot]
    if (!material) throw new Error(`Fort slot ${slot} has no material`)
    const mesh = new Mesh(geometry, material)
    mesh.castShadow = !material.userData.emissive
    mesh.receiveShadow = !material.userData.emissive
    mesh.matrixAutoUpdate = false
    group.add(mesh)
  }
  const s = plan.site
  group.position.set(s.x, 0, s.z)
  group.rotation.y = s.yaw
  group.updateMatrixWorld(true)
  return { group, triangles: w.triangleCount }
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}
