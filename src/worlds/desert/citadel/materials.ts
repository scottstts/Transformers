import { MeshBasicNodeMaterial, MeshStandardNodeMaterial, type Material, type Node } from 'three/webgpu'
import { abs, color, cross, dFdx, dFdy, dot, float, floor, fract, fwidth, max, min, mix, normalView, normalWorld, normalize, positionView, positionWorld, sign, sin, smoothstep, time, uniform, vec2, vec3 } from 'three/tsl'
import { N } from '../../../rendering/noise'
import { DUNE_WIND } from '../terrain'
import type { CitadelSlot } from './asset'

/**
 * The citadel's surfaces (tasks/citadel.md section 7): world-space procedural
 * materials, one per slot (the meshes carry no UVs). Ceramic composite in
 * pale bone with its panel joints from the world-space position and normal,
 * darker sandblasted bands, anodised graphite and champagne alloy, smoked
 * glass, light lines, paving and metal deck.
 *
 * Weathering has physical causes and is shared: a dust film on upward faces
 * (thinner on the higher tiers, which the wind's sand load barely reaches),
 * sand at the feet of the lowest walls, faint dark run-off below ledges, a
 * matte sandblasted skin on the lowest 3 m of faces into the wind, and
 * scattered chips to the grey substrate. It stays a film: the citadel must
 * read pale and ceramic from 700 m.
 */

const SAND = color(0xc3a57c)
const SUBSTRATE = color(0x8e8a84)
/** emissive level of the light lines (linear HDR) and their slow pulse's depth (0..1) */
export const LIGHT_LEVEL = uniform(3.2)
export const LIGHT_PULSE = uniform(0.12)

/**
 * The surface's normal bumped by a relief (`height`, m, in world space), from
 * the relief's and the surface's screen-space derivatives (Mikkelsen's
 * surface gradient). Its inputs are band-limited (mipmapped noise; analytic
 * features faded by their footprint), so it never aliases.
 */
function relief(height: any): Node<'vec3'> {
  const p = positionView
  const n = normalView
  const dpx = dFdx(p), dpy = dFdy(p)
  const r1 = cross(dpy, n), r2 = cross(n, dpx)
  const det = dot(dpx, r1)
  const grad = sign(det).mul(r1.mul(dFdx(height)).add(r2.mul(dFdy(height))))
  return normalize(abs(det).mul(n).sub(grad))
}

/** The face's own plane: (along, up) on a wall, (x, z) on a top; and how upward it faces. */
function facePlane() {
  const p = positionWorld
  const n = normalWorld
  const up = smoothstep(0.55, 0.8, abs(n.y))
  const along = mix(p.x, p.z, abs(n.x).greaterThan(abs(n.z)).select(float(1), float(0)))
  return { uv: mix(vec2(along, p.y), p.xz, up), up }
}

/**
 * A panel grid (cell size, metres) on the face's plane: the joint's groove
 * (0..1, faded once under a pixel) and a per-panel tone (-1..1).
 */
function panels(size: [number, number]) {
  const { uv } = facePlane()
  const s = vec2(size[0], size[1])
  const cell = uv.div(s)
  const fw = max(fwidth(cell), vec2(1e-4))
  const d = abs(fract(cell).sub(0.5)).mul(-1).add(0.5).div(fw)
  const seen = float(1).sub(smoothstep(0.08, 0.3, max(fw.x, fw.y)))
  const joint = float(1).sub(smoothstep(0.6, 1.6, min(d.x, d.y))).mul(seen)
  const tone = N(floor(cell).mul(0.137).add(0.31)).r.sub(0.5).mul(2)
  return { joint, tone }
}

/** The shared weathering at this point: dust on tops, sand at the lowest feet, run-off, the windward matte, chips. */
function weather() {
  const p = positionWorld
  const n = normalWorld
  const up = smoothstep(0.35, 0.95, n.y)
  // the wind's sand load falls off with height: the lower tiers gather most
  const load = float(1).sub(smoothstep(2, 30, p.y).mul(0.7))
  const patchy = N(p.xz.mul(0.06).add(p.y.mul(0.05))).g.mul(0.7).add(0.45)
  const film = up.mul(0.32).mul(load).mul(patchy)
  const foot = smoothstep(0.9, 0.05, p.y).mul(N(p.xz.mul(0.35)).r.mul(0.5).add(0.5))
  const dust = min(float(0.85), film.add(foot.mul(0.75)))
  const vertical = float(1).sub(smoothstep(0.3, 0.6, abs(n.y)))
  const along = p.x.add(p.z.mul(0.7))
  const runoff = smoothstep(0.62, 0.86, N(vec2(along.mul(1.3), p.y.mul(0.045))).g).mul(vertical).mul(0.14)
  // faces into the wind, low down: sandblasted matte
  const into = smoothstep(0.05, 0.5, n.x.mul(-DUNE_WIND.x).add(n.z.mul(-DUNE_WIND.z)))
  const blasted = into.mul(smoothstep(3.2, 0.6, p.y)).mul(vertical)
  const chips = smoothstep(0.86, 0.9, N(vec2(along.mul(2.3), p.y.mul(2.3))).b).mul(smoothstep(0.6, 0.75, N(p.xz.mul(0.11).add(p.y.mul(0.07))).r)).mul(vertical)
  return { dust, runoff, blasted, chips }
}

/** A lit surface from its base colour, roughness and metalness, weathered (scaled by `exposure`: alloy and glass gather less). */
function surface(base: any, rough: any, metal: number, exposure: number, normal: any, chipped = false): MeshStandardNodeMaterial {
  const w = weather()
  const m = new MeshStandardNodeMaterial()
  let c = base.mul(float(1).sub(w.runoff)).mul(w.blasted.mul(0.05).add(1))
  if (chipped) c = mix(c, SUBSTRATE, w.chips.mul(0.8))
  const dust = w.dust.mul(exposure)
  m.colorNode = mix(c, SAND, dust)
  m.roughnessNode = mix(rough.add(w.blasted.mul(0.18)), float(0.92), dust)
  m.metalnessNode = float(metal).mul(float(1).sub(dust))
  if (normal) m.normalNode = normal
  return m
}

/** Satin ceramic composite: warm bone, its panel joints and faint per-panel tone. */
function ceramic(): Material {
  const { joint, tone } = panels([2.4, 1.2])
  const grain = N(positionWorld.xz.mul(1.7).add(positionWorld.y.mul(1.3))).b
  const base = color(0xd6d0c4).mul(tone.mul(0.025).add(1)).mul(float(1).sub(joint.mul(0.28)))
  return surface(base, float(0.42).add(grain.mul(0.04)), 0, 1, relief(joint.mul(-0.004).add(grain.mul(0.0004))), true)
}

/** Bands, plinth skirts and the glacis: darker, matte, sandblasted. */
function ceramicBand(): Material {
  const p = positionWorld
  const blast = N(vec2(p.x.add(p.z).mul(4.1), p.y.mul(4.1))).b
  const base = color(0xb9b6af).mul(blast.mul(0.06).add(0.97))
  return surface(base, float(0.55).add(blast.mul(0.08)), 0, 1, relief(blast.mul(0.0012)), true)
}

/** Anodised graphite spines, brackets, ribs and mullions: a fine horizontal brushing in the normal only. */
function alloyDark(): Material {
  const { uv } = facePlane()
  const brush = N(vec2(uv.x.mul(0.35), uv.y.mul(38))).r
  const seen = float(1).sub(smoothstep(0.02, 0.06, fwidth(uv.y)))
  return surface(color(0x1c1f23), float(0.32), 1, 0.45, relief(brush.mul(0.0003).mul(seen)))
}

/** Champagne trim, emblems, nosings and inlays. */
function alloyLight(): Material {
  const p = positionWorld
  const tarnish = N(p.xz.mul(0.4).add(p.y.mul(0.3))).g
  return surface(color(0xc8b08a).mul(tarnish.mul(0.08).add(0.95)), float(0.28).add(tarnish.mul(0.06)), 1, 0.35, null)
}

/** Dark cobalt-smoke glass, opaque, reflecting only; the domes' variant glows a low green from below. */
function glass(dome: boolean): Material {
  const m = surface(color(0x0e1418), float(0.05), 0, 0.15, null)
  if (dome) {
    const low = float(1).sub(smoothstep(0.05, 0.85, normalWorld.y))
    m.emissiveNode = vec3(0.09, 0.32, 0.16).mul(low.mul(0.22).add(0.05))
  }
  return m
}

/** Light lines and slots: an emissive strength and a slow pulse. */
function light(): Material {
  const m = new MeshBasicNodeMaterial()
  const pulse = sin(time.mul(1.1).add(positionWorld.y.mul(0.08))).mul(LIGHT_PULSE).add(1)
  m.colorNode = color(0xbfe9ff).mul(LIGHT_LEVEL).mul(pulse)
  m.userData.emissive = true
  return m
}

/** Ceramic floor slabs: each bay its own tone, sand drifted into it in wind-shaped bands. */
function paving(): Material {
  const p = positionWorld
  const bay = N(floor(p.xz.div(6)).mul(0.173).add(0.7)).r.sub(0.5)
  const grain = N(p.xz.mul(3.3)).b
  const drift = smoothstep(0.55, 0.82, N(vec2(p.x.mul(0.05).add(p.z.mul(0.12)), p.z.mul(0.05).sub(p.x.mul(0.03)))).r).mul(float(1).sub(smoothstep(2, 20, p.y).mul(0.7)))
  const base = color(0xc2bbae).mul(bay.mul(0.05).add(1)).mul(grain.mul(0.05).add(0.975))
  const m = surface(base, float(0.62).add(grain.mul(0.06)), 0, 0.6, relief(grain.mul(0.0008).mul(float(1).sub(drift.mul(0.7)))))
  m.colorNode = mix(m.colorNode as any, SAND, drift.mul(0.45))
  return m
}

/** Metal deck: plates with darkened joints and an anti-slip lozenge pattern (normal only), scuffed along the walking lines. */
function deck(): Material {
  const p = positionWorld
  // plate joints every 1.5 by 3 m
  const plate = p.xz.div(vec2(1.5, 3))
  const pw = max(fwidth(plate), vec2(1e-4))
  const pd = abs(fract(plate).sub(0.5)).mul(-1).add(0.5).div(pw)
  const joint = float(1).sub(smoothstep(0.6, 1.6, min(pd.x, pd.y))).mul(float(1).sub(smoothstep(0.08, 0.3, max(pw.x, pw.y))))
  // lozenges: raised diamonds 3 cm long, alternating at 45 degrees, faded before they alias
  const q = vec2(p.x.add(p.z), p.x.sub(p.z)).mul(1 / 0.028)
  const cellId = floor(q)
  const odd = fract(cellId.x.add(cellId.y).mul(0.5)).mul(2)
  const f = fract(q).sub(0.5)
  const axis = mix(f, vec2(f.y, f.x), odd)
  const lozenge = smoothstep(0.32, 0.18, abs(axis.x).mul(2.6).add(abs(axis.y).mul(0.8)))
  const seen = float(1).sub(smoothstep(0.15, 0.45, max(fwidth(q.x), fwidth(q.y))))
  const scuff = smoothstep(0.55, 0.85, N(vec2(p.x.mul(0.6), p.z.mul(0.08))).g)
  const base = color(0x4a4e53).mul(float(1).sub(joint.mul(0.45))).mul(scuff.mul(0.12).add(1))
  return surface(base, float(0.45).sub(scuff.mul(0.12)), 0.9, 0.5, relief(lozenge.mul(0.0012).mul(seen).sub(joint.mul(0.003))))
}

/** One material per slot, built at load (their node graphs never change in play). */
export function createCitadelMaterials(): Record<CitadelSlot, Material> {
  return {
    ceramic: ceramic(),
    ceramicBand: ceramicBand(),
    alloyDark: alloyDark(),
    alloyLight: alloyLight(),
    glass: glass(false),
    glassGreen: glass(true),
    light: light(),
    paving: paving(),
    deck: deck(),
  }
}
