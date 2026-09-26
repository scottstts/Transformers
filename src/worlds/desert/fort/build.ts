import { Group, Matrix4, Mesh, type Material } from 'three/webgpu'
import { MeshWriter } from './mesh'
import type { FortPlan, Module, Xz } from './plan'
import { T_WALL } from './plan'
import { blastWall, concertina, cornerPillar, gate, tWall, tWallLoops, wallLamp } from './walls'
import { watchtower } from './tower'
import { hangar } from './hangar'
import { bunker, container, crates, drums, fuelTank, gabion, jerseyBarrier, latrine, mast, sandbags, tires, waterTank } from './props'
import { boom, booth, canopy, chu, generator, hq, sail } from './buildings'
import { bund, cables, helipad, pole, radioMast, waterTower } from './utility'

/** Module frame to fort frame: at (x, z) on the sand, its front (+z) turned to `yaw`. */
function at(p: Xz, yaw: number, y = 0): Matrix4 {
  return new Matrix4().makeRotationY(yaw).setPosition(p[0], y, p[1])
}

/** The quadrant a fort-frame point falls in (0..3): the geometry's spatial buckets. */
function quadrant(x: number, z: number): number {
  return Math.min(3, Math.floor((Math.atan2(x, z) + Math.PI) / (Math.PI / 2)))
}

/** A built fort: its meshes in the fort frame, which of them are detail, and its triangle count. */
export interface BuiltFort {
  group: Group
  /** meshes of small things (loops, wire, clutter), hidden from afar */
  detail: Mesh[]
  triangles: number
}

/**
 * Compile a fort plan into meshes, one per material slot per bucket, in the
 * fort frame (the group carries the site's placement). Buckets are the four
 * quadrants, each split into its main geometry and its detail (small parts
 * and clutter, drawn only from near): the view and each shadow cascade
 * draw only the quadrants near them. Deterministic: per-slab tone and the
 * slabs' few millimetres of settling come from the slab's index.
 */
export function buildFort(plan: FortPlan, materials: Record<string, Material>): BuiltFort {
  const w = new MeshWriter()
  const bucket = (p: Xz, detail: boolean): void => { w.bucket(`q${quadrant(p[0], p[1])}${detail ? 'd' : ''}`) }
  // perimeter slabs, each settled a little out of line as placed slabs are; a lamp on every tenth
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
      const S = at(p, yaw + (h - 0.5) * 0.012)
      bucket(p, false)
      w.shade(hash(i * 3.7 + run.b[0]))
      tWall(w, S)
      bucket(p, true)
      tWallLoops(w, S)
      if (i % 10 === 5) wallLamp(w, S)
    }
    w.shade(0.5)
    const mid: Xz = [(run.a[0] + run.b[0]) / 2, (run.a[1] + run.b[1]) / 2]
    bucket(mid, true)
    concertina(w, run)
  }
  w.shade(0.5)
  for (let k = 0; k < plan.corners.length; k++) {
    const a = plan.corners[k], b = plan.corners[(k + 1) % plan.corners.length]
    bucket(a, false)
    cornerPillar(w, at(a, Math.atan2(b[0] - a[0], b[1] - a[1])))
  }
  for (const g of plan.gates) {
    bucket(g.at, false)
    gate(w, at(g.at, Math.atan2(g.out[0], g.out[1])), g.leaf)
  }
  for (const h of plan.hangars) {
    bucket(h.at, false)
    hangar(w, at(h.at, h.yaw), h)
  }
  for (const m of plan.modules) {
    bucket(m.at, m.detail)
    module(w, m)
    w.shade(0.5)
  }
  bucket([0, 0], true)
  cables(w, plan.cables)

  const group = new Group()
  const detail: Mesh[] = []
  for (const { slot, bucket: name, geometry } of w.build()) {
    const material = materials[slot]
    if (!material) throw new Error(`Fort slot ${slot} has no material`)
    const mesh = new Mesh(geometry, material)
    mesh.name = `${slot}:${name}`
    mesh.castShadow = !material.userData.emissive
    mesh.receiveShadow = !material.userData.emissive
    mesh.matrixAutoUpdate = false
    group.add(mesh)
    if (name.endsWith('d')) detail.push(mesh)
  }
  const s = plan.site
  group.position.set(s.x, 0, s.z)
  group.rotation.y = s.yaw
  group.updateMatrixWorld(true)
  return { group, detail, triangles: w.triangleCount }
}

/** One planned module into the writer. */
function module(w: MeshWriter, m: Module): void {
  const M = at(m.at, m.yaw)
  switch (m.kind) {
    case 'tower': watchtower(w, M); break
    case 'mast': mast(w, M); break
    case 'bunker': bunker(w, M, m); break
    case 'hq': hq(w, M); break
    case 'chu': chu(w, M, m); break
    case 'latrine': latrine(w, M, m); break
    case 'booth': booth(w, M); break
    case 'boom': boom(w, M, m); break
    case 'canopy': canopy(w, M, m); break
    case 'sail': sail(w, M, m); break
    case 'container': container(w, M, m); break
    case 'tank': fuelTank(w, M); break
    case 'bund': bund(w, M, m); break
    case 'generator': generator(w, M, m); break
    case 'waterTower': waterTower(w, M, m); break
    case 'radioMast': radioMast(w, M, m); break
    case 'pole': pole(w, M, m); break
    case 'helipad': helipad(w, M, m); break
    case 'hesco': gabion(w, M, m); break
    case 'jersey': jerseyBarrier(w, M); break
    case 'blastWall': blastWall(w, M, m, false); w.bucket(w.currentBucket + 'd'); blastWall(w, M, m, true); break
    case 'sandbags': sandbags(w, M, m); break
    case 'drums': drums(w, M, m); break
    case 'crates': crates(w, M, m); break
    case 'tires': tires(w, M, m); break
    case 'waterTank': waterTank(w, M); break
  }
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}
