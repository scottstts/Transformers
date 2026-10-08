/** How the shock ring's front eases out over its life (ShockRing's shader and the blows that ride with it). */
export const SHOCK_EASE = 2.6

/** The front's radius (m) of a ring growing from `from` to `reach` m, `u` (0..1) of the way through its life. */
export function shockFront(from: number, reach: number, u: number): number {
  return from + (reach - from) * (1 - Math.pow(1 - Math.min(1, Math.max(0, u)), SHOCK_EASE))
}

/** The share of its life (0..1) at which the front of a ring growing from `from` to `reach` m reaches `r` m. */
export function shockReaches(from: number, reach: number, r: number): number {
  const k = Math.min(1, Math.max(0, (r - from) / (reach - from)))
  return 1 - Math.pow(1 - k, 1 / SHOCK_EASE)
}
