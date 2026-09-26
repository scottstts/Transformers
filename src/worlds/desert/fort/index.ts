import { DoubleSide, Mesh, MeshBasicMaterial, Vector3, type Camera, type Group, type Material, type Scene } from 'three/webgpu'
import type { CircleCollider, SegmentCollider } from '../../../game/types'
import { ColliderGrid } from '../../../game/collide'
import { buildFort } from './build'
import { pavedPatches } from './paving'
import { PavedGround } from '../paved-ground'
import { createFortMaterials } from './materials'
import { FORT_SITES, insideWalls, planFort, sectorAt, type FortPlan, type FortSite } from './plan'

export { FORT_SITES, outsideSector, type FortPlan, type FortSite, type Sector, type SectorRole } from './plan'

/** A fort in the world: its plan, its geometry and its colliders in world space. */
export interface Fort {
  readonly plan: FortPlan
  readonly group: Group
  readonly triangles: number
  /** fort frame -> world (x, z) */
  toWorld(x: number, z: number, out?: { x: number; z: number }): { x: number; z: number }
  /** world -> fort frame */
  toLocal(x: number, z: number, out?: { x: number; z: number }): { x: number; z: number }
  /** a world point inside the perimeter */
  inside(x: number, z: number): boolean
  /** the district a world point is in (`plan.sectors.length` outside the perimeter) */
  sector(x: number, z: number): number
  /** this fort's colliders in world space, and binned for bodies that test them often (the soldiers) */
  readonly circles: CircleCollider[]
  readonly segments: SegmentCollider[]
  readonly grid: ColliderGrid
}

/** Detail geometry (slab loops, razor wire, clutter) is drawn within this distance of its bounds (m). */
const DETAIL_FAR = 120
/** Ray queries need both sides of a wall, without changing its visible material. */
const CAMERA_RAY_MATERIAL = new MeshBasicMaterial({ side: DoubleSide })

/**
 * The desert's fortress (plan.ts): built once at start, static geometry (one
 * draw per material slot and district each, build.ts), its walls, buildings
 * and props added to the world's colliders, and the ground around it cleared
 * of the tiled boulders (`exclusions`). Each district's small detail is
 * shown only near it (`update`).
 */
export class Forts {
  readonly list: Fort[] = []
  /** Solid fort meshes used to keep the normal camera clear of walls and buildings. */
  readonly cameraMeshes: Mesh[] = []
  private readonly detail: Array<{ mesh: Mesh; centre: Vector3; radius: number }> = []
  readonly circles: CircleCollider[] = []
  readonly segments: SegmentCollider[] = []
  /** world circles the tiled scatter keeps out of */
  readonly exclusions: Array<{ x: number; z: number; r: number }> = []
  /** where the fortresses' floors are paved (the world's surface answers blasts by it) */
  readonly paving = new PavedGround()
  private readonly materials: Record<string, Material>

  constructor(scene: Scene, sites: readonly FortSite[] = FORT_SITES) {
    this.materials = createFortMaterials()
    for (const site of sites) {
      const plan = planFort(site)
      const { group, triangles, detail } = buildFort(plan, this.materials)
      scene.add(group)
      for (const child of group.children) {
        if (!(child instanceof Mesh) || child.name.endsWith('d')) continue
        const obstacle = new Mesh(child.geometry, CAMERA_RAY_MATERIAL)
        obstacle.matrixAutoUpdate = false
        obstacle.matrixWorld.copy(child.matrixWorld)
        this.cameraMeshes.push(obstacle)
      }
      for (const mesh of detail) {
        const sphere = mesh.geometry.boundingSphere!
        this.detail.push({ mesh, centre: sphere.center.clone().applyMatrix4(group.matrixWorld), radius: sphere.radius })
      }
      const c = Math.cos(site.yaw), s = Math.sin(site.yaw)
      const toWorld = (x: number, z: number, out = { x: 0, z: 0 }): { x: number; z: number } => {
        out.x = site.x + x * c + z * s
        out.z = site.z - x * s + z * c
        return out
      }
      const circles: CircleCollider[] = plan.circles.map((k) => {
        const p = toWorld(k.x, k.z)
        return { x: p.x, z: p.z, r: k.r }
      })
      const segments: SegmentCollider[] = plan.segments.map((k) => {
        const a = toWorld(k.ax, k.az), b = toWorld(k.bx, k.bz)
        return { ax: a.x, az: a.z, bx: b.x, bz: b.z, r: k.r }
      })
      const fort: Fort = {
        plan, group, triangles, circles, segments, grid: new ColliderGrid(segments, circles),
        toWorld,
        toLocal: (x, z, out = { x: 0, z: 0 }) => {
          const dx = x - site.x, dz = z - site.z
          out.x = dx * c - dz * s
          out.z = dx * s + dz * c
          return out
        },
        inside: (x, z) => {
          const dx = x - site.x, dz = z - site.z
          return insideWalls(plan, dx * c - dz * s, dx * s + dz * c)
        },
        sector: (x, z) => {
          const dx = x - site.x, dz = z - site.z
          return sectorAt(plan, dx * c - dz * s, dx * s + dz * c)
        },
      }
      this.list.push(fort)
      for (const p of pavedPatches(plan)) {
        const w = toWorld(p.at[0], p.at[1])
        this.paving.add({ x: w.x, z: w.z, yaw: p.yaw + site.yaw, hx: p.hx, hz: p.hz, top: p.top, round: p.round })
      }
      this.circles.push(...fort.circles)
      this.segments.push(...fort.segments)
      this.exclusions.push({ x: site.x, z: site.z, r: plan.barrier + 6 })
    }
  }

  /** Show each district's detail only while the camera is near it. */
  update(camera: Camera): void {
    const p = camera.position
    for (const d of this.detail) d.mesh.visible = p.distanceTo(d.centre) - d.radius < DETAIL_FAR
  }

  /** The fort whose car ring (plan.barrier) the world point is inside, if any: no car form there. */
  within(x: number, z: number): Fort | null {
    for (const f of this.list) {
      const s = f.plan.site
      if (Math.hypot(x - s.x, z - s.z) < f.plan.barrier) return f
    }
    return null
  }

  /** The fort whose barrier ring (with 40 m to spare) contains the world point, if any. */
  near(x: number, z: number): Fort | null {
    for (const f of this.list) {
      const s = f.plan.site
      if (Math.hypot(x - s.x, z - s.z) < f.plan.barrier + 40) return f
    }
    return null
  }
}
