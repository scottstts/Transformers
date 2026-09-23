import { MathUtils } from 'three/webgpu'

export const clamp = MathUtils.clamp
export const lerp = MathUtils.lerp
export const damp = (a: number, b: number, k: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-k * dt))
export const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a))
export function easedRange(value: number, start: number, end: number): number {
  const u = clamp((value - start) / (end - start), 0, 1)
  return u * u * (3 - 2 * u)
}
