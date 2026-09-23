import type { Scene, Vector3 } from 'three/webgpu'
import type { ContactEffects } from '../../game/contact-effects'
import { Dust } from './dust.ts'
import { TyreTracks } from './tyre-tracks.ts'
import { Footprints } from './footprints.ts'

/** How the desert answers contact: kicked-up dust, tyre tracks and footprints in the sand. */
export class DesertSurface implements ContactEffects {
  readonly dust: Dust
  readonly tracks: TyreTracks
  readonly footprints: Footprints

  constructor(scene: Scene) {
    this.dust = new Dust(scene)
    this.tracks = new TyreTracks(scene)
    this.footprints = new Footprints(scene)
  }

  wheel(point: Vector3, direction: Vector3, speed: number, slip: number, dt: number): void {
    this.dust.wheel(point, direction, speed, slip, dt)
  }

  tread(wheel: number, point: Vector3, width: number, slip: number): void {
    this.tracks.mark(wheel, point, width, slip)
  }

  footprint(center: Vector3, forward: Vector3, length: number, width: number, strength: number): void {
    this.footprints.stamp(center, forward, length, width, strength)
  }

  burst(point: Vector3, strength: number, count: number): void {
    this.dust.burst(point, strength, count)
  }

  blast(point: Vector3, strength: number, dt: number): void {
    this.dust.blast(point, strength, dt)
  }

  update(dt: number): void {
    this.tracks.update(dt)
    this.footprints.update(dt)
    this.dust.update(dt)
  }
}
