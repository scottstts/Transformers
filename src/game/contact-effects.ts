import type { Vector3 } from 'three/webgpu'

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
  /** a tyre rolling or sliding over the surface this frame (`wheel` identifies its track) */
  tyre(wheel: number, contact: TyreContact, dt: number): void
  /** a foot planted at `center` (ground), heading `forward` (unit), sole length and width in m, load 0..1+ */
  footprint(center: Vector3, forward: Vector3, length: number, width: number, strength: number): void
  burst(point: Vector3, strength: number, count: number): void
  /** a jet exhaust striking the surface at `point` (strength 0..1), continuous */
  blast(point: Vector3, strength: number, dt: number): void
  /** a blast of heat at `center`: a crater `radius` m across its bowl, `heat` 0..1+ (1: fused white-hot) */
  crater(center: Vector3, radius: number, heat: number): void
  /** a white-hot edge dragged through the ground from `from` to `to`, `width` m; returns a handle for `reignite` */
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
