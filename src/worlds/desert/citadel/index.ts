import { Group, Mesh, MeshStandardNodeMaterial, Sphere, Vector3, type Camera, type Material, type Scene, type WebGPURenderer } from 'three/webgpu'
import { normalWorld, positionWorld } from 'three/tsl'
import type { CircleCollider, SegmentCollider } from '../../../game/types'
import { ColliderGrid } from '../../../game/collide'
import type { StaticCaster } from '../../../rendering/sun-shadow'
import type { CitadelAsset, CitadelLod, CitadelSlot } from './asset'
import { citadelPlan, outsideSector, type CitadelPlan } from './plan'
import { CitadelFloor } from './floor'
import { CitadelDistricts } from './districts'
import { createCitadelMaterials } from './materials'
import { SkyVisibility } from './sky-visibility'
import { buildDrifts } from './drifts'
import { cameraChunks } from './camera-chunks'
import { HALO_SPEED, HALO_Z } from './halo'

export { outsideSector, type CitadelPlan, type Gate, type Post, type Sector, type SectorRole, type Spawn, type Surface } from './plan'
export { loadCitadelAsset, type CitadelAsset } from './asset'

/**
 * How near (m, to a bucket's bounds) each detail class is drawn: brackets,
 * fins, ribs and light slots (`artic`) within 450 m; bollards, pods, pipes and
 * lamps (`detail`) within 120 m. The massing always.
 */
const SHOWN: Record<CitadelLod, number> = { mass: Infinity, artic: 450, detail: 120 }
/**
 * The coarsest cached shadow level each class is drawn into (world.ts
 * STATIC_SHADOW_LEVELS, the finest is 0): small hardware not into the
 * coarse levels, whose texels cannot hold it and which reach past where it is
 * shown at all.
 */
const SHADOW_LEVELS: Record<CitadelLod, number> = { mass: Infinity, artic: Infinity, detail: 2 }
/** Floors are kept clear by the ground's height, not by camera rays; light inlays are too slight to stop it. */
const NOT_OBSTACLES: ReadonlySet<CitadelSlot> = new Set(['paving', 'deck', 'light'])

/**
 * The Halcyon Citadel (tasks/citadel.md): the desert's fortress, built in
 * Blender and loaded as one asset (`loadCitadelAsset`). Static geometry, one
 * draw per bucket (district, or the spire), slot and detail class; its walls
 * and buildings join the world's colliders, its floor is the world's ground
 * inside it, and its districts hold the garrisons (game/enemies).
 */
export class Citadel {
  readonly plan: CitadelPlan
  readonly group = new Group()
  readonly triangles: number
  /** the walkable floor: heights and surface classes (CPU and GPU) */
  readonly floor: CitadelFloor
  private readonly districts: CitadelDistricts
  /** colliders in world space, and binned for bodies that test them often (the soldiers) */
  readonly circles: CircleCollider[]
  readonly segments: SegmentCollider[]
  readonly grid: ColliderGrid
  /** what the normal camera keeps clear of (position-only chunks of the massing, never drawn) */
  readonly cameraMeshes: Mesh[]
  /**
   * Every mesh that casts a shadow: static scenery, drawn into the sun's
   * cached shadow levels (not the cascades), detail not into the coarsest.
   */
  readonly staticCasters: StaticCaster[] = []
  private readonly shown: Array<{ mesh: Mesh; centre: Vector3; reachSq: number }> = []
  /** world circles the tiled scatter keeps out of */
  readonly exclusions: Array<{ x: number; z: number; r: number }>
  /** the sky seen round the citadel (its ambient occlusion), baked at start (`bake`) */
  readonly skyVisibility: SkyVisibility
  private readonly materials: Record<CitadelSlot, Material>
  private readonly c: number
  private readonly s: number
  readonly halo = new Group()
  private clock = 0

  constructor(scene: Scene, asset: CitadelAsset) {
    const plan = this.plan = citadelPlan(asset.plan)
    const site = plan.site
    this.c = Math.cos(site.yaw)
    this.s = Math.sin(site.yaw)
    this.floor = new CitadelFloor(plan)
    this.districts = new CitadelDistricts(plan)
    this.materials = createCitadelMaterials()

    this.group.name = 'citadel'
    this.group.position.set(site.x, 0, site.z)
    this.group.rotation.y = site.yaw
    this.group.updateMatrixWorld(true)
    this.group.matrixAutoUpdate = false
    let triangles = 0
    const buckets = new Map<string, Sphere>()
    const meshes: Array<{ mesh: Mesh; part: CitadelAsset['parts'][number] }> = []
    this.halo.name = 'halo'
    this.halo.position.z = HALO_Z
    this.halo.matrixAutoUpdate = false
    this.halo.updateMatrix()
    this.group.add(this.halo)
    for (const part of asset.parts) {
      const geometry = part.geometry
      geometry.computeBoundingSphere()
      const mesh = new Mesh(geometry, this.materials[part.slot])
      mesh.name = `${part.bucket}:${part.slot}:${part.lod}`
      mesh.matrixAutoUpdate = false
      mesh.receiveShadow = part.slot !== 'light'
      if (part.motion === 'halo') {
        mesh.position.z = -HALO_Z
        mesh.updateMatrix()
        this.halo.add(mesh)
      } else this.group.add(mesh)
      meshes.push({ mesh, part })
      mesh.updateMatrixWorld(true)
      triangles += geometry.getIndex()!.count / 3
      if (part.slot !== 'light') this.staticCasters.push({ object: mesh, coarsest: SHADOW_LEVELS[part.lod] })
      const sphere = geometry.boundingSphere!.clone().applyMatrix4(this.group.matrixWorld)
      const bucket = buckets.get(part.bucket)
      if (bucket) bucket.union(sphere)
      else buckets.set(part.bucket, sphere)
    }
    this.triangles = triangles
    for (const { mesh, part } of meshes) {
      const lod = part.lod
      if (lod === 'mass') continue
      const bucket = buckets.get(part.bucket)!
      this.shown.push({ mesh, centre: bucket.center, reachSq: (SHOWN[lod] + bucket.radius) ** 2 })
    }
    scene.add(this.group)

    this.circles = plan.circles.map((k) => {
      const p = this.toWorld(k.x, k.z)
      return { x: p.x, z: p.z, r: k.r }
    })
    this.segments = plan.segments.map((k) => {
      const a = this.toWorld(k.ax, k.az), b = this.toWorld(k.bx, k.bz)
      return { ax: a.x, az: a.z, bx: b.x, bz: b.z, r: k.r }
    })
    this.grid = new ColliderGrid(this.segments, this.circles)
    this.exclusions = [{ x: site.x, z: site.z, r: plan.barrier + 6 }]

    const solid = asset.parts.filter((p) => p.lod === 'mass' && !NOT_OBSTACLES.has(p.slot)).map((p) => p.geometry)
    this.cameraMeshes = cameraChunks(solid, this.group.matrixWorld)

    // the ambient occlusion of its massing and articulation (detail is too slight to matter), on every lit material
    const { x0, z0, x1, z1 } = plan.bounds
    const half = Math.max(-x0, x1, -z0, z1) + 20
    const occluders = meshes.filter(({ part }) => part.lod !== 'detail').map(({ mesh }) => mesh)
    this.skyVisibility = new SkyVisibility(occluders, this.floor, site.x, site.z, half)
    for (const material of Object.values(this.materials)) {
      if (material instanceof MeshStandardNodeMaterial) material.aoNode = this.skyVisibility.node(positionWorld, normalWorld)
    }
    // sand the wind has banked against the lowest walls
    const sky = this.skyVisibility
    const drifts = buildDrifts(this.segments, (x, z) => sky.topAt(x, z), (p, n) => sky.node(p, n))
    if (drifts.length) scene.add(...drifts)
  }

  /** fort frame -> world (x, z) */
  toWorld(x: number, z: number, out = { x: 0, z: 0 }): { x: number; z: number } {
    const site = this.plan.site
    out.x = site.x + x * this.c + z * this.s
    out.z = site.z - x * this.s + z * this.c
    return out
  }

  /** world -> fort frame */
  toLocal(x: number, z: number, out = { x: 0, z: 0 }): { x: number; z: number } {
    const dx = x - this.plan.site.x, dz = z - this.plan.site.z
    out.x = dx * this.c - dz * this.s
    out.z = dx * this.s + dz * this.c
    return out
  }

  /** The district a world point is in (`plan.sectors.length` outside the citadel). */
  sector(x: number, z: number): number {
    const p = this.toLocal(x, z, _l)
    return this.districts.at(p.x, p.z)
  }

  /** A world point inside the citadel: in a district (or an outer gate's passage). */
  inside(x: number, z: number): boolean {
    return this.sector(x, z) < outsideSector(this.plan)
  }

  /** The floor's height under a world point (m): its level, or 0 off the floor (the pad round it is level at 0). */
  floorAt(x: number, z: number): number {
    const h = this.floor.height(x, z)
    return Number.isNaN(h) ? 0 : h
  }

  /** GPU work done once at start, after the renderer is up: the ambient occlusion bake. */
  bake(renderer: WebGPURenderer): void {
    this.skyVisibility.bake(renderer)
  }

  /** View LOD changes colour draws; shadow LOD is owned by the light's footprint. */
  update(camera: Camera, dt = 0): void {
    this.clock += dt
    this.halo.rotation.y = this.clock * HALO_SPEED
    this.halo.updateMatrix()
    this.halo.updateMatrixWorld(true)
    const p = camera.position
    for (const d of this.shown) {
      const visible = p.distanceToSquared(d.centre) < d.reachSq
      d.mesh.visible = visible
    }
  }

  /** Draw distance-hidden meshes once under the entry cover, then restore their previous visibility. */
  showAllDetail(): () => void {
    const visibility = this.shown.map((d) => d.mesh.visible)
    for (const d of this.shown) d.mesh.visible = true
    return () => {
      this.shown.forEach((d, i) => { d.mesh.visible = visibility[i] })
    }
  }

  /** Whether a world point is inside the car ring (plan.barrier): no car form there. */
  within(x: number, z: number): boolean {
    return Math.hypot(x - this.plan.site.x, z - this.plan.site.z) < this.plan.barrier
  }

  /** Whether a world point is inside the car ring with 40 m to spare. */
  near(x: number, z: number): boolean {
    return Math.hypot(x - this.plan.site.x, z - this.plan.site.z) < this.plan.barrier + 40
  }
}

const _l = { x: 0, z: 0 }
