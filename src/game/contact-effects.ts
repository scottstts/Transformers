import type { Vector3 } from 'three/webgpu'

/** Surface response supplied by the active world. */
export interface ContactEffects {
  wheel(point: Vector3, direction: Vector3, speed: number, slip: number, dt: number): void
  /** a rolling tyre pressed into the surface at `point` this frame (`wheel` identifies its track) */
  tread(wheel: number, point: Vector3, width: number, slip: number): void
  /** a foot planted at `center` (ground), heading `forward` (unit), sole length and width in m, load 0..1+ */
  footprint(center: Vector3, forward: Vector3, length: number, width: number, strength: number): void
  burst(point: Vector3, strength: number, count: number): void
  /** a jet exhaust striking the surface at `point` (strength 0..1), continuous */
  blast(point: Vector3, strength: number, dt: number): void
  update(dt: number): void
}
