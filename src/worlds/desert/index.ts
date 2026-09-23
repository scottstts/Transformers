import type { Scene } from 'three/webgpu'
import { Dust } from './dust.ts'
import { DesertWorld, createDesertEnvironmentScene } from './world.ts'

export function createDesertWorld(scene: Scene) {
  return {
    world: new DesertWorld(scene),
    contactEffects: new Dust(scene),
    environmentScene: createDesertEnvironmentScene,
  }
}
