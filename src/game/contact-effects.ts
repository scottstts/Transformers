import type { Vector3 } from 'three/webgpu'

/** Whose dust is being raised (ContactEffects.fight). */
export type FightDust = 'none' | 'combo' | 'special'
/** The material under a contact, shared by world effects and footstep audio. */
export type ContactSurface = 'sand' | 'ceramic' | 'deck'

/** One tyre on the ground this frame, in world space. */
export interface TyreContact {
  /** contact point on the ground */
  point: Vector3
  /** unit direction the tyre rolls */
  heading: Vector3
  /** ground velocity of the contact point (m/s) */
  velocity: Vector3
  /** the tread's sliding velocity over the ground (m/s): sideways slide, wheelspin (backwards) or a locked wheel (forwards) */
  slide: Vector3
  /** tread width (m) */
  width: number
}

/** Surface response supplied by the active world. */
export interface ContactEffects {
  /** the ground's height (m) at a world point: effects that meet the ground meet it there */
  height(x: number, z: number): number
  surface(x: number, z: number): ContactSurface
  /** a tyre rolling or sliding over the surface this frame (`wheel` identifies its track) */
  tyre(wheel: number, contact: TyreContact, dt: number): void
  /** a foot planted at `center` (ground), heading `forward` (unit), sole length and width in m, load 0..1+ */
  footprint(center: Vector3, forward: Vector3, length: number, width: number, strength: number): void
  burst(point: Vector3, strength: number, count: number): void
  /**
   * Whose dust is raised now: the world's (a walk, a car), a fight's (the
   * session sets it while the fight owns the robot, the horde while it answers
   * blows), or a special's. A fight's dust is a supporting effect, far
   * lighter than a walk's or a car's; a special's blast surges are its own
   * effect and keep their strength.
   */
  fight: FightDust
  /** the share of a full cloud of sand a fight raises at a point (lower on paving): a fighter's own sand clouds scale by it */
  loose(x: number, z: number): number
  /** a jet exhaust striking the surface at `point` (strength 0..1), continuous */
  blast(point: Vector3, strength: number, dt: number): void
  /** a blast of heat at `center`: a crater `radius` m across its bowl, `heat` 0..1+ (1: fused white-hot) */
  crater(center: Vector3, radius: number, heat: number): void
  /** an edge dragged through the ground from `from` to `to`, `width` m (heat 0: a plain cut; 1: white-hot, fused); returns a handle for `reignite` */
  furrow(from: Vector3, to: Vector3, width: number, heat: number): number
  /** a furrow catches again after `delay` s: a heat front from `at` m along it at `speed` m/s (negative: in from its ends) */
  reignite(handle: number, delay: number, at: number, speed: number): void
  /** a blast's base surge: the ground's loose material rolling out from `center`, thrown up the middle */
  surge(center: Vector3, radius: number, strength: number): void
  /** the ground itself thrown from `center` at up to `speed` m/s: `count` chunks (largest `size` m) and grit, in a cone about `dir` */
  eject(center: Vector3, speed: number, count: number, dir: Vector3, spread: number, size: number): void
  /** show the hidden parts for a shader compile, or hide them again */
  warm(on: boolean): void
  update(dt: number): void
}
