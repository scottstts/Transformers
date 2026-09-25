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
  update(dt: number): void
}
