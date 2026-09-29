import { dot, float, fract, max, min, screenCoordinate, select, sqrt, vec2 } from 'three/tsl'

/**
 * Shared pieces of the ray-marched emissive volumes (the truck's plasma jets,
 * the Bat's afterburner): a march runs from a proxy's front face to its
 * analytic exit, so solid geometry in front of the volume still occludes it
 * without reading the depth buffer.
 */

/** Per-pixel march offset (interleaved gradient noise) to trade banding for fine grain. */
export const dither = fract(float(52.9829189).mul(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715)))))

/** Ray (ro, rd) against a finite cylinder (base, unit axis, length, radius): (t in, t out), out < in on a miss. */
export function rayCylinder(ro, rd, base, axis, len, rad) {
  const oc = ro.sub(base)
  const ca = dot(rd, axis)
  const oa = dot(oc, axis)
  const rp = rd.sub(axis.mul(ca))
  const op = oc.sub(axis.mul(oa))
  const a = max(dot(rp, rp), 1e-6)
  const b = dot(op, rp)
  const h = b.mul(b).sub(a.mul(dot(op, op).sub(rad.mul(rad))))
  const q = sqrt(max(h, 0))
  const caSafe = select(ca.greaterThanEqual(0), max(ca, 1e-6), min(ca, -1e-6))
  const s0 = oa.negate().div(caSafe)
  const s1 = len.sub(oa).div(caSafe)
  const tIn = max(b.negate().sub(q).div(a), min(s0, s1))
  const tOut = min(b.negate().add(q).div(a), max(s0, s1))
  return vec2(tIn, select(h.lessThan(0), float(-1), tOut))
}

/** Distance along the ray to the ground's plane (height `floor`), or far when the ray climbs. */
export function groundHit(ro, rd, floor) {
  return select(rd.y.lessThan(-1e-4), ro.y.sub(floor).negate().div(rd.y), float(1e6))
}
