import type { Scene } from 'three/webgpu'
import { DesertSurface } from './surface.ts'
import { DesertWorld, createDesertEnvironmentScene } from './world.ts'

export function createDesertWorld(scene: Scene) {
  const world = new DesertWorld(scene)
  return {
    world,
    contactEffects: new DesertSurface(scene, world.forts.paving),
    environmentScene: createDesertEnvironmentScene,
  }
}
