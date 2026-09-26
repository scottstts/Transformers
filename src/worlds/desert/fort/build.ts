import { Group, Matrix4, Mesh, type Material } from 'three/webgpu'
import { MeshWriter } from './mesh'
import { T_WALL, sectorAt, type FortPlan, type Module, type Xz } from './plan'
import { blastWall, concertina, cornerPillar, gate, tWall, tWallLoops, wallLamp } from './walls'
import { watchtower } from './tower'
import { hangar } from './hangar'
import { bunker, container, crates, drums, fuelTank, gabion, jerseyBarrier, latrine, mast, sandbags, tires, waterTank } from './props'
import { boom, booth, canopy, chu, generator, hq, sail } from './buildings'
import { bund, cables, flagpole, helipad, pole, radioMast, waterTower } from './utility'
import { rampart, rampStair } from './rampart'
import { gatehouse } from './gatehouse'
import { keep } from './keep'
import { garage } from './garage'
import { radar } from './radar'
import { apron } from './paving'

/** Module frame to fort frame: at (x, z) on the sand, its front (+z) turned to `yaw`. */
function at(p: Xz, yaw: number, y = 0): Matrix4 {
  return new Matrix4().makeRotationY(yaw).setPosition(p[0], y, p[1])
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
 * fort frame (the group carries the site's placement). Buckets are the
 * districts (and the ground outside the perimeter), each split into its
 * main geometry and its detail (small parts and clutter, drawn only from
 * near): the view and each shadow cascade draw only the districts near
 * them. Deterministic: per-slab tone and the slabs' few millimetres of
 * settling come from the slab's index.
 */
export function buildFort(plan: FortPlan, materials: Record<string, Material>): BuiltFort {
  const w = new MeshWriter()
  const bucket = (p: Xz, detail: boolean): void => { w.bucket(`s${sectorAt(plan, p[0], p[1])}${detail ? 'd' : ''}`) }
  // the T-wall lines, each slab settled a little out of line as placed slabs are; a lamp on every tenth
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
      // the slab's own district: nudged off the line toward the side it faces into
      bucket([p[0] - uz * 2, p[1] + ux * 2], false)
      w.shade(hash(i * 3.7 + run.b[0]))
      tWall(w, S)
      bucket([p[0] - uz * 2, p[1] + ux * 2], true)
      tWallLoops(w, S)
      if (i % 10 === 5) wallLamp(w, S)
    }
    w.shade(0.5)
    if (run.wire) {
      const mid: Xz = [(run.a[0] + run.b[0]) / 2 - uz * 2, (run.a[1] + run.b[1]) / 2 + ux * 2]
      bucket(mid, true)
      concertina(w, run)
    }
  }
  w.shade(0.5)
  for (const g of plan.gates) {
    if (g.kind === 'citadel') continue
    bucket([g.at[0] - g.out[0] * 2, g.at[1] - g.out[1] * 2], false)
    gate(w, at(g.at, Math.atan2(g.out[0], g.out[1])), g.leaf)
  }
  w.bucket(`s${plan.sectors.length - 1}`)
  plan.ramparts.forEach((run, i) => rampart(w, run, plan.site.seed * 3.1 + i * 17.3))
  for (const h of plan.hangars) {
    bucket(h.at, false)
    hangar(w, at(h.at, h.yaw), h)
  }
  for (const m of plan.modules) {
    bucket(m.at, m.detail)
    module(w, m)
    w.shade(0.5)
  }
  const C = plan.sectors[0].bounds.at
  bucket(C, true)
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
    case 'pillar': cornerPillar(w, M); break
    case 'garage': garage(w, M, m); break
    case 'keep': keep(w, M); break
    case 'radar': radar(w, M); break
    case 'gatehouse': gatehouse(w, M, m); break
    case 'apron': apron(w, M, m); break
    case 'flagpole': flagpole(w, M, m); break
    case 'stair': rampStair(w, M, m); break
  }
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}
