import type { Scene, Vector3 } from 'three/webgpu'
import type { ContactEffects, TyreContact } from '../../game/contact-effects'
import { Dust } from './dust.ts'
import { Grit } from './grit.ts'
import { TyreTracks } from './tyre-tracks.ts'
import { Footprints } from './footprints.ts'

/** Tread slide (m/s) at which a track reads as fully scraped. */
const FULL_SCRAPE = 5
/** Length of a tyre's footprint in the sand (m): a sideways tyre sweeps this, not its tread width. */
const PATCH = 0.36

/** How the desert answers contact: kicked-up dust and grit, tyre tracks and footprints in the sand. */
export class DesertSurface implements ContactEffects {
  readonly dust: Dust
  readonly grit: Grit
  readonly tracks: TyreTracks
  readonly footprints: Footprints

  constructor(scene: Scene) {
    this.dust = new Dust(scene)
    this.grit = new Grit(scene)
    this.tracks = new TyreTracks(scene)
    this.footprints = new Footprints(scene)
  }

  tyre(wheel: number, c: TyreContact, dt: number): void {
    const slide = Math.hypot(c.slide.x, c.slide.z)
    const speed = Math.hypot(c.velocity.x, c.velocity.z)
    // the ribbon runs along the travel: a tyre at an angle to it sweeps its tread and its footprint's length
    let width = c.width
    if (speed > 0.5) {
      const along = Math.abs(c.heading.x * c.velocity.x + c.heading.z * c.velocity.z) / speed
      width = c.width * along + PATCH * Math.sqrt(Math.max(0, 1 - along * along))
    }
    this.tracks.mark(wheel, c.point, width, Math.min(1, slide / FULL_SCRAPE), c.slide)
    this.dust.wheel(c.point, c.velocity, c.slide, dt)
    this.grit.spray(c.point, c.velocity, c.slide, dt)
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
    this.grit.update(dt)
  }
}
