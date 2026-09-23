import type { Scene } from 'three/webgpu'
import { DesertSurface } from './surface.ts'
import { DesertWorld, createDesertEnvironmentScene } from './world.ts'

export function createDesertWorld(scene: Scene) {
  return {
    world: new DesertWorld(scene),
    contactEffects: new DesertSurface(scene),
    environmentScene: createDesertEnvironmentScene,
  }
}
