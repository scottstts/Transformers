import { DoubleSide, Mesh, MeshBasicMaterial, MeshStandardNodeMaterial, Vector3, type Camera, type Group, type Material, type Scene, type WebGPURenderer } from 'three/webgpu'
import { normalWorld, positionWorld } from 'three/tsl'
import type { CircleCollider, SegmentCollider } from '../../../game/types'
import { ColliderGrid } from '../../../game/collide'
import { buildFort } from './build'
import { pavedPatches } from './paving'
import { PavedGround } from '../paved-ground'
import { createFortMaterials } from './materials'
import { SkyVisibility } from './sky-visibility'
import { buildDrifts } from './drifts'
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
/**
 * The coarsest cached shadow level detail is drawn into (the finest is 0):
 * the 190 m level still holds a drum or a crate, and reaches past where
 * detail is shown at all, so its shadows never drop out before it does.
 */
const DETAIL_SHADOW_LEVELS = 2
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
  /**
   * Every fort mesh that casts a shadow: static scenery, drawn into the sun's
   * cached shadow levels (not the cascades). Detail (wire, clutter, poles)
   * not into the coarsest: its texels cannot hold it, and detail is hidden that far off anyway.
   */
  readonly staticCasters: Array<{ object: Mesh; coarsest: number }> = []
  /** detail meshes shown or hidden by the last `update` (their shadows change) */
  readonly toggled: Mesh[] = []
  private readonly detail: Array<{ mesh: Mesh; centre: Vector3; reachSq: number }> = []
  readonly circles: CircleCollider[] = []
  readonly segments: SegmentCollider[] = []
  /** world circles the tiled scatter keeps out of */
  readonly exclusions: Array<{ x: number; z: number; r: number }> = []
  /** where the fortresses' floors are paved (the world's surface answers blasts by it) */
  readonly paving = new PavedGround()
  private readonly materials: Record<string, Material>
  /** the sky seen round the fortress (its ambient occlusion), baked at start (`bake`) */
  readonly skyVisibility: SkyVisibility

  constructor(scene: Scene, sites: readonly FortSite[] = FORT_SITES) {
    this.materials = createFortMaterials()
    for (const site of sites) {
      const plan = planFort(site)
      const { group, triangles, detail } = buildFort(plan, this.materials)
      scene.add(group)
      for (const child of group.children) {
        if (child instanceof Mesh && child.castShadow) {
          child.castShadow = false
          this.staticCasters.push({ object: child, coarsest: child.name.endsWith('d') ? DETAIL_SHADOW_LEVELS : Infinity })
        }
      }
      for (const child of group.children) {
        if (!(child instanceof Mesh) || child.name.endsWith('d')) continue
        const obstacle = new Mesh(child.geometry, CAMERA_RAY_MATERIAL)
        obstacle.matrixAutoUpdate = false
        obstacle.matrixWorld.copy(child.matrixWorld)
        this.cameraMeshes.push(obstacle)
      }
      for (const mesh of detail) {
        const sphere = mesh.geometry.boundingSphere!
        this.detail.push({ mesh, centre: sphere.center.clone().applyMatrix4(group.matrixWorld), reachSq: (DETAIL_FAR + sphere.radius) ** 2 })
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
    // the one fortress's ambient occlusion (its solid meshes; detail is too slight to matter), on every fort material
    const fort = this.list[0]
    this.skyVisibility = new SkyVisibility(fort.group.children.filter((c): c is Mesh => c instanceof Mesh && !c.name.endsWith('d')), fort.plan.site.x, fort.plan.site.z, fort.plan.barrier + 20)
    for (const material of Object.values(this.materials)) {
      if (material instanceof MeshStandardNodeMaterial) material.aoNode = this.skyVisibility.node(positionWorld, normalWorld)
    }
    // sand the wind has banked against its walls
    const sky = this.skyVisibility
    const drifts = buildDrifts(fort.segments, (x, z) => sky.topAt(x, z), (p, n) => sky.node(p, n))
    if (drifts.length) scene.add(...drifts)
  }

  /** GPU work done once at start, after the renderer is up: the ambient occlusion bake. */
  bake(renderer: WebGPURenderer): void {
    this.skyVisibility.bake(renderer)
  }

  /** Show each district's detail only while the camera is near it; the meshes that appeared or vanished are left in `toggled`. */
  update(camera: Camera): void {
    const p = camera.position
    this.toggled.length = 0
    for (const d of this.detail) {
      const visible = p.distanceToSquared(d.centre) < d.reachSq
      if (visible !== d.mesh.visible) this.toggled.push(d.mesh)
      d.mesh.visible = visible
    }
  }

  /** Draw distance-hidden detail once under the entry cover, then restore its previous visibility. */
  showAllDetail(): () => void {
    const visibility = this.detail.map((d) => d.mesh.visible)
    for (const d of this.detail) d.mesh.visible = true
    return () => {
      this.detail.forEach((d, i) => { d.mesh.visible = visibility[i] })
    }
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
