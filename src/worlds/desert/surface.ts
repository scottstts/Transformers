import type { Scene, Vector3 } from 'three/webgpu'
import type { ContactEffects, FightDust, TyreContact } from '../../game/contact-effects'
import { Dust } from './dust.ts'
import { Grit } from './grit.ts'
import { TyreTracks } from './tyre-tracks.ts'
import { Footprints } from './footprints.ts'
import { ScorchMarks } from './scorch.ts'
import { Debris } from './debris.ts'
import type { PavedGround } from './paved-ground.ts'
import type { DesertTerrain } from './terrain.ts'

/** Tread slide (m/s) at which a track reads as fully scraped. */
const FULL_SCRAPE = 5
/** Length of a tyre's footprint in the sand (m): a sideways tyre sweeps this, not its tread width. */
const PATCH = 0.36
/**
 * Kicked-up dust on the fortress's paving: concrete holds only a film of
 * sand, so a footfall or a blow there raises a scuff (this share of the
 * puffs, at this share of the strength), not a cloud.
 */
const PAVED_COUNT = 0.25
const PAVED_STRENGTH = 0.55
/**
 * A fight's dust (`fight`), a supporting effect: on the sand this share of
 * the puffs at this share of the strength, on the paving FIGHT_PAVED of that
 * again. A special's surges are its own effect and keep their strength.
 */
const FIGHT_COUNT = 0.25
const FIGHT_STRENGTH = 0.55
const FIGHT_PAVED = 0.3
/**
 * Bursts may raise this many puffs a second (and this many at once): a
 * crowd fight's footfalls, blows and break-ups each throw a little dust, and
 * unbudgeted they filled the air like a sandstorm (and the dust's fill cost
 * with it). A walk or a single blow never reaches it.
 */
const BURST_RATE = 220
const BURST_CAP = 120

/**
 * How the desert answers contact: kicked-up dust and grit, tyre tracks and
 * footprints in the sand (none on the paving, where the dust is only a
 * scuff); and a blast: fused-glass craters and furrows, a
 * base surge of sand and crust thrown out. On the fortress's paving a blast
 * spalls, cracks and chars the concrete and throws concrete (scorch.ts).
 */
export class DesertSurface implements ContactEffects {
  readonly dust: Dust
  readonly grit: Grit
  readonly tracks: TyreTracks
  readonly footprints: Footprints
  readonly scorch: ScorchMarks
  readonly debris: Debris

  private readonly paving: PavedGround | null
  private readonly terrain: DesertTerrain
  /** puffs bursts may still raise now (BURST_RATE) */
  private budget = BURST_CAP
  /** whose dust is raised now */
  fight: FightDust = 'none'

  /** `paving`: where the floor is paved (a blast marks concrete as concrete, and throws concrete); `terrain`: the landform every mark lies on */
  constructor(scene: Scene, paving: PavedGround | null, terrain: DesertTerrain) {
    this.paving = paving
    this.terrain = terrain
    this.dust = new Dust(scene, terrain)
    this.grit = new Grit(scene, terrain)
    this.tracks = new TyreTracks(scene, terrain)
    this.footprints = new Footprints(scene, terrain)
    this.scorch = new ScorchMarks(scene, paving, terrain)
    this.debris = new Debris(scene, terrain)
  }

  height(x: number, z: number): number {
    return this.terrain.height(x, z)
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
    // a foot on concrete leaves no print
    if (this.paved(center)) return
    this.footprints.stamp(center, forward, length, width, strength)
  }

  loose(x: number, z: number): number {
    return FIGHT_COUNT * ((this.paving?.top(x, z) ?? -1) >= 0 ? FIGHT_PAVED : 1)
  }

  burst(point: Vector3, strength: number, count: number): void {
    const paved = this.paved(point)
    if (this.fight !== 'none') {
      count *= FIGHT_COUNT * (paved ? FIGHT_PAVED : 1)
      strength *= FIGHT_STRENGTH
    } else if (paved) {
      count *= PAVED_COUNT
      strength *= PAVED_STRENGTH
    }
    const n = Math.min(Math.round(count), Math.floor(this.budget))
    if (n <= 0) return
    this.budget -= n
    this.dust.burst(point, strength, n)
  }

  /** On the fortress's paving (not the sand). */
  private paved(p: Vector3): boolean {
    return (this.paving?.top(p.x, p.z) ?? -1) >= 0
  }

  blast(point: Vector3, strength: number, dt: number): void {
    const paved = this.paved(point)
    const k = this.fight === 'combo' ? FIGHT_STRENGTH * 0.6 * (paved ? FIGHT_PAVED : 1) : paved ? PAVED_STRENGTH * 0.6 : 1
    this.dust.blast(point, strength * k, dt)
  }

  crater(center: Vector3, radius: number, heat: number): void {
    this.scorch.addCrater(center, radius, heat)
  }

  furrow(from: Vector3, to: Vector3, width: number, heat: number): number {
    return this.scorch.addFurrow(from, to, width, heat)
  }

  reignite(handle: number, delay: number, at: number, speed: number): void {
    this.scorch.reignite(handle, delay, at, speed)
  }

  surge(center: Vector3, radius: number, strength: number): void {
    // off concrete a blast throws a thin film of sand, not a wall of it
    const paved = this.paved(center)
    const k = this.fight === 'combo' ? FIGHT_STRENGTH * (paved ? FIGHT_PAVED : 1) : paved ? PAVED_STRENGTH : 1
    this.dust.surge(center, radius, strength * k)
  }

  eject(center: Vector3, speed: number, count: number, dir: Vector3, spread: number, size: number): void {
    // off a slab the chunks are broken concrete, off the sand its crust
    this.debris.burst(center, speed, count, dir, spread, size, this.paved(center))
    this.grit.burst(center, speed * 0.8, count * 4, dir, spread)
  }

  warm(on: boolean): void {
    this.debris.warm(on)
  }

  update(dt: number): void {
    this.budget = Math.min(BURST_CAP, this.budget + BURST_RATE * dt)
    this.tracks.update(dt)
    this.footprints.update(dt)
    this.scorch.update(dt)
    this.debris.update(dt)
    this.dust.update(dt)
    this.grit.update(dt)
  }
}
