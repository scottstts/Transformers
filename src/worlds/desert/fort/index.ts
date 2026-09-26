import { Vector3, type Camera, type Group, type Material, type Mesh, type Scene } from 'three/webgpu'
import type { CircleCollider, SegmentCollider } from '../../../game/types'
import { buildFort } from './build'
import { createFortMaterials } from './materials'
import { FORT_SITES, insideWalls, planFort, type FortPlan, type FortSite } from './plan'

export { FORT_SITES, type FortPlan, type FortSite } from './plan'

/** A fort in the world: its plan, its geometry and its colliders in world space. */
export interface Fort {
  readonly plan: FortPlan
  readonly group: Group
  readonly triangles: number
  /** fort frame -> world (x, z) */
  toWorld(x: number, z: number, out?: { x: number; z: number }): { x: number; z: number }
  /** world -> fort frame */
  toLocal(x: number, z: number, out?: { x: number; z: number }): { x: number; z: number }
  /** a world point inside the wall ring */
  inside(x: number, z: number): boolean
  /** this fort's colliders in world space */
  readonly circles: CircleCollider[]
  readonly segments: SegmentCollider[]
}

/** Detail geometry (slab loops, razor wire, clutter) is drawn within this distance of its bounds (m). */
const DETAIL_FAR = 120

/**
 * The desert's forts (plan.ts): built once at start, static geometry (one
 * draw per material slot and quadrant each, build.ts), their walls,
 * buildings and props added to the world's colliders, and the ground around
 * them cleared of the tiled boulders (`exclusions`). Each quadrant's small
 * detail is shown only near it (`update`).
 */
export class Forts {
  readonly list: Fort[] = []
  private readonly detail: Array<{ mesh: Mesh; centre: Vector3; radius: number }> = []
  readonly circles: CircleCollider[] = []
  readonly segments: SegmentCollider[] = []
  /** world circles the tiled scatter keeps out of */
  readonly exclusions: Array<{ x: number; z: number; r: number }> = []
  private readonly materials: Record<string, Material>

  constructor(scene: Scene, sites: readonly FortSite[] = FORT_SITES) {
    this.materials = createFortMaterials()
    for (const site of sites) {
      const plan = planFort(site)
      const { group, triangles, detail } = buildFort(plan, this.materials)
      scene.add(group)
      for (const mesh of detail) {
        const sphere = mesh.geometry.boundingSphere!
        this.detail.push({ mesh, centre: sphere.center.clone().applyMatrix4(group.matrixWorld), radius: sphere.radius })
      }
      const c = Math.cos(site.yaw), s = Math.sin(site.yaw)
      const fort: Fort = {
        plan, group, triangles, circles: [], segments: [],
        toWorld: (x, z, out = { x: 0, z: 0 }) => {
          out.x = site.x + x * c + z * s
          out.z = site.z - x * s + z * c
          return out
        },
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
      }
      this.list.push(fort)
      const p = { x: 0, z: 0 }
      for (const k of plan.circles) {
        fort.toWorld(k.x, k.z, p)
        fort.circles.push({ x: p.x, z: p.z, r: k.r })
      }
      for (const k of plan.segments) {
        const a = fort.toWorld(k.ax, k.az)
        const b = fort.toWorld(k.bx, k.bz)
        fort.segments.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, r: k.r })
      }
      this.circles.push(...fort.circles)
      this.segments.push(...fort.segments)
      this.exclusions.push({ x: site.x, z: site.z, r: plan.barrier + 6 })
    }
  }

  /** Show each quadrant's detail only while the camera is near it. */
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
