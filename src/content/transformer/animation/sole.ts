/**
 * A sole's rolling edges, measured from the ankle: the heel and toe edges'
 * centres behind / ahead of it (m), the ankle's height above the flat sole, and
 * the edges' rounding radius. A sharp edge (radius 0) pivots in place; a rounded
 * one rolls along the ground, so its lowest point travels round the rounding.
 */
export interface SoleEdges {
  heel: number
  toe: number
  ankle: number
  soleRadius?: number
}

/** Ankle displacement from the flat stand, along the ground and up (m). */
export interface AnkleOffset {
  step: number
  up: number
}

/**
 * The sole rolled `phi` (rad, >= 0) off the flat onto its toe edge, heel up.
 * The rounding's centre sits `r` above the ground and advances r·phi as it
 * rolls; the ankle rides the arc about that centre.
 */
export function toeRoll(sole: SoleEdges, phi: number, out: AnkleOffset): AnkleOffset {
  const r = sole.soleRadius ?? 0
  const c = Math.cos(phi), s = Math.sin(phi)
  out.step = sole.toe * (1 - c) + (sole.ankle - r) * s + r * phi
  out.up = sole.toe * s + (sole.ankle - r) * (c - 1)
  return out
}

/** The sole rolled `phi` (rad, >= 0) off the flat onto its heel edge, toe up. */
export function heelRoll(sole: SoleEdges, phi: number, out: AnkleOffset): AnkleOffset {
  const r = sole.soleRadius ?? 0
  const c = Math.cos(phi), s = Math.sin(phi)
  out.step = sole.heel * (c - 1) - (sole.ankle - r) * s - r * phi
  out.up = sole.heel * s + (sole.ankle - r) * (c - 1)
  return out
}

/** Depth of the sole's lowest edge point below the ankle at foot pitch `pitch` (rad, + toe down). */
export function edgeDepth(sole: SoleEdges, pitch: number): number {
  const r = sole.soleRadius ?? 0
  return Math.max(sole.toe * Math.sin(pitch), -sole.heel * Math.sin(pitch)) + (sole.ankle - r) * Math.cos(pitch) + r
}
