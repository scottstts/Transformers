import type { Vector3 } from 'three/webgpu'

/** Surface response supplied by the active world. */
export interface ContactEffects {
  wheel(point: Vector3, direction: Vector3, speed: number, slip: number, dt: number): void
  burst(point: Vector3, strength: number, count: number): void
  update(dt: number): void
}
