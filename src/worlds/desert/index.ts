import type { Scene } from 'three/webgpu'
import { DesertSurface } from './surface.ts'
import { DesertWorld, createDesertEnvironmentScene } from './world.ts'
import type { CitadelAsset } from './citadel/index.ts'

export function createDesertWorld(scene: Scene, citadel: CitadelAsset) {
  const world = new DesertWorld(scene, citadel)
  return {
    world,
    contactEffects: new DesertSurface(scene, world.citadel.floor, world.terrain, world.ground),
    environmentScene: createDesertEnvironmentScene,
  }
}
