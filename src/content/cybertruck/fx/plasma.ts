import { AdditiveBlending, CircleGeometry, CylinderGeometry, Mesh, MeshBasicNodeMaterial, Quaternion, Vector3 } from 'three/webgpu'
import {
  Fn, Loop, abs, atan, cameraPosition, clamp, cross, dot, exp, float, fract, length, max, min, mix,
  positionLocal, positionWorld, pow, screenCoordinate, select, smoothstep, sqrt, uniform, vec2, vec3,
} from 'three/tsl'
import { N } from '../../../rendering/noise.ts'

/**
 * Plasma exhaust: an emissive volume per jet and a sheet where the jets strike
 * the sand.
 *
 * A jet is ray-marched inside a tight depth-tested proxy frustum. The march
 * starts at the proxy's front face, so solid geometry in front of the plume
 * still occludes it without reading the depth buffer, and ends at the proxy's
 * analytic exit or the ground plane. Keep the proxy tight: anything inside it
 * would have the plume behind it drawn over it. The ground sheet is only a few
 * centimetres thick, so it is not a volume at all: its emission is integrated
 * over height analytically and drawn on a disc just above the sand, where the
 * depth test hides it behind wheels, feet and bodies exactly. Emission only (the plume is optically thin), blended additively in
 * HDR so bloom carries the glare.
 *
 * Jet structure, from the port: it fades in over its first half metre with a
 * turbulent onset (there is no nozzle to start from), then a short bright potential core, a train of
 * Mach diamonds that fades downstream (only at high throttle, when the flow is
 * under-expanded), and a turbulent mixing layer that widens and cools from
 * blue-white to violet. Turbulence is advected along the axis by sampling the
 * shared baked noise, one fetch per step (its four channels carry four scales).
 */

export const EXIT_RADIUS = 0.11
/** Visible length of the jet at a throttle (m). */
export const jetLength = (power: number): number => 0.9 + 2.4 * power
/** Mixing-layer radius a distance s downstream: EXIT + SPREAD s + CURVE s^2. */
const SPREAD = 0.1
const CURVE = 0.018
/** Proxy radius over the mixing-layer radius: holds the Gaussian tail and the turbulent wobble. */
const ENVELOPE = 1.9
/** Distance (m) over which the jet fades in below the plate. */
const EMERGE = 0.45
const JET_STEPS = 26
/** The impingement sheet is drawn on a disc just above the sand. */
const SHEET_HEIGHT = 0.015
const SEGMENTS = 24
const CIRCUMSCRIBE = 1 / Math.cos(Math.PI / SEGMENTS)
/** After ground decals (1), before dust (2): the glow shows over tyre tracks and dust veils it. */
const RENDER_ORDER = 1.5

const HOT = vec3(0.8, 0.9, 1.0)
const BLUE = vec3(0.1, 0.28, 1.0)
const VIOLET = vec3(0.32, 0.1, 0.9)
const EMBER = vec3(1.0, 0.42, 0.12)

const mixingRadius = (s: number): number => EXIT_RADIUS + SPREAD * s + CURVE * s * s

/** Per-pixel march offset (interleaved gradient noise) to trade banding for fine grain. */
const dither = fract(float(52.9829189).mul(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715)))))

/** Ray (ro, rd) against a finite cylinder (base, unit axis, length, radius): (t in, t out), out < in on a miss. */
function rayCylinder(ro, rd, base, axis, len, rad) {
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

/** Distance along the ray to the ground plane (y = 0), or far when the ray climbs. */
function groundHit(ro, rd) {
  return select(rd.y.lessThan(-1e-4), ro.y.negate().div(rd.y), float(1e6))
}

function volumeMaterial(): MeshBasicNodeMaterial {
  return new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false })
}

/** Unit cylinder standing on y = 0..1, radius 1; the proxies reshape it in the vertex stage. */
function proxyGeometry(): CylinderGeometry {
  const g = new CylinderGeometry(1, 1, 1, SEGMENTS, 1, false)
  g.translate(0, 0.5, 0)
  return g
}

const Y = new Vector3(0, 1, 0)

/** One free jet leaving a port. */
export class PlasmaJet {
  readonly mesh: Mesh
  private readonly origin = uniform(new Vector3())
  private readonly axis = uniform(new Vector3(0, -1, 0))
  private readonly side = uniform(new Vector3(1, 0, 0))
  private readonly length = uniform(1)
  private readonly power = uniform(0)
  private readonly coreLength = uniform(0.5)
  private readonly cell = uniform(0.2)
  private readonly shock = uniform(0)
  private readonly time = uniform(0)
  private readonly top = uniform(0.2)
  private readonly bottom = uniform(1)
  private readonly quaternion = new Quaternion()

  constructor(seed: number) {
    const m = volumeMaterial()
    // frustum proxy: radius grows linearly from the port to the tail (bounds the convex R(s))
    const radius = mix(this.top, this.bottom, positionLocal.y)
    m.positionNode = vec3(positionLocal.x.mul(radius), positionLocal.y, positionLocal.z.mul(radius))
    m.colorNode = Fn(() => {
      const ro = cameraPosition
      const rd = positionWorld.sub(ro).normalize()
      const tIn = positionWorld.sub(ro).length()
      const span = rayCylinder(ro, rd, this.origin, this.axis, this.length, this.bottom)
      const tOut = min(span.y, groundHit(ro, rd))
      const dt = max(tOut.sub(tIn), 0).div(JET_STEPS)
      const up2 = cross(this.axis, this.side)
      const len = this.length
      const acc = vec3(0).toVar()
      Loop(JET_STEPS, ({ i }) => {
        const p = ro.add(rd.mul(tIn.add(dt.mul(float(i).add(dither)))))
        const d = p.sub(this.origin)
        const s = dot(d, this.axis)
        const rv = d.sub(this.axis.mul(s))
        const r = length(rv)
        const sn = s.div(len)
        const nz = N(vec2(dot(rv, this.side).mul(0.9).add(dot(rv, up2).mul(0.55)).add(float(seed)), s.mul(0.45).sub(this.time.mul(2.6)))).level(float(0))

        // turbulent mixing layer: widens, wobbles and breaks up toward a ragged tail
        const R = s.mul(CURVE).add(SPREAD).mul(s).add(EXIT_RADIUS)
        const x = r.div(R.mul(nz.r.sub(0.5).mul(sn).mul(0.7).add(1)))
        const turb = nz.g.mul(0.65).add(nz.b.mul(0.35))
        const tail = smoothstep(1.0, 0.4, sn.add(nz.a.sub(0.5).mul(0.35)))
        const body = exp(x.mul(x).mul(-1.7)).mul(exp(sn.mul(-1.3))).mul(tail).mul(pow(turb, 3).mul(3.2).add(0.12))

        // potential core, narrowing until the mixing layer closes it
        const rc = max(s.div(this.coreLength).mul(-0.55).add(1).mul(EXIT_RADIUS), 0.012)
        const core = exp(r.div(rc).pow(2).mul(-2.2)).mul(smoothstep(this.coreLength, this.coreLength.mul(0.3), s))

        // Mach diamonds: bright compressed cells on the axis, decaying downstream
        const k = s.div(this.cell).sub(0.3)
        const disk = abs(fract(k).sub(0.5)).mul(2)
        const diamond = pow(clamp(float(1).sub(disk.mul(0.85).add(r.div(EXIT_RADIUS * 0.9))), 0, 1), 1.6)
          .mul(exp(k.mul(-0.4))).mul(smoothstep(-0.2, 0.3, k)).mul(this.shock)

        const tone = mix(BLUE, VIOLET, clamp(sn.mul(1.3), 0, 1))
        // no nozzle: the jet materializes over the first EMERGE metres with a turbulent,
        // ragged onset instead of starting at a disc on the plate; the hot core comes in last
        const emerge = smoothstep(0, EMERGE, s.add(nz.a.sub(0.5).mul(0.2)).add(nz.b.sub(0.5).mul(0.08)))
        const e = HOT.mul(core.mul(30).add(diamond.mul(60))).mul(emerge.mul(emerge)).add(tone.mul(body.mul(15)).mul(emerge))
        // the jet hands over to the ground sheet as it reaches the sand
        const fade = smoothstep(0, 0.16, p.y)
        acc.addAssign(select(s.greaterThan(0).and(s.lessThan(len)), e.mul(fade), vec3(0)))
      })
      return acc.mul(dt).mul(this.power)
    })()
    this.mesh = new Mesh(proxyGeometry(), m)
    this.mesh.matrixAutoUpdate = false
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = RENDER_ORDER
  }

  /** Place the jet: port position, unit exhaust axis, a unit vector across it, throttle 0..1. */
  set(origin: Vector3, axis: Vector3, side: Vector3, power: number, time: number): void {
    const len = jetLength(power)
    this.origin.value.copy(origin)
    this.axis.value.copy(axis)
    this.side.value.copy(side)
    this.length.value = len
    this.power.value = power
    this.coreLength.value = 0.15 + 0.5 * power
    this.cell.value = 0.12 + 0.1 * power
    this.shock.value = smooth(0.25, 0.7, power)
    this.time.value = time
    this.top.value = mixingRadius(0) * ENVELOPE * CIRCUMSCRIBE
    this.bottom.value = mixingRadius(len) * ENVELOPE * CIRCUMSCRIBE
    this.quaternion.setFromUnitVectors(Y, axis)
    this.mesh.matrix.compose(origin, this.quaternion, _scale.set(1, len, 1))
    this.mesh.matrixWorldNeedsUpdate = true
  }
}

/** The sheet of plasma spreading over the sand where the jets strike it. */
export class ImpingementSheet {
  readonly mesh: Mesh
  private readonly a = uniform(new Vector3())
  private readonly b = uniform(new Vector3())
  private readonly center = uniform(new Vector3())
  private readonly strength = uniform(0)
  private readonly reach = uniform(0.4)
  private readonly radius = uniform(1)
  private readonly time = uniform(0)

  constructor() {
    const m = volumeMaterial()
    m.positionNode = vec3(positionLocal.x.mul(this.radius), positionLocal.y, positionLocal.z.mul(this.radius))
    // column emission of the few-centimetre layer above each ground point, analytically integrated over height
    const column = (p, at, seed) => {
      const dxz = p.xz.sub(at.xz)
      const rho = length(dxz)
      const nz = N(vec2(atan(dxz.y, dxz.x).mul(6 / (2 * Math.PI)).add(float(seed)), rho.mul(0.8).sub(this.time.mul(2.4)))).level(float(0))
      const reach = this.reach
      // wall jet: exp(-h / thickness) integrates to its thickness, which grows as it runs out
      const flow = rho.mul(0.05).add(0.03).mul(exp(rho.div(reach).negate())).mul(nz.g.mul(nz.g).mul(1.8).add(0.2))
      // stagnation bubble exp(-(rho^2 + h^2) / 0.03) over h >= 0
      const stagnation = exp(rho.mul(rho).div(-0.03)).mul(Math.sqrt(0.03 * Math.PI) / 2)
      // incandescent sand skin, 25 mm
      const glow = exp(rho.div(reach.mul(0.5)).negate()).mul(0.025)
      const tone = mix(HOT, BLUE, clamp(rho.div(reach), 0, 1))
      return HOT.mul(stagnation.mul(10)).add(tone.mul(flow.mul(12))).add(EMBER.mul(glow.mul(6)))
    }
    m.colorNode = Fn(() => {
      const p = positionWorld
      // an optically thin layer seen obliquely: the path through it grows as 1 / |cos|
      const slant = float(1).div(max(abs(positionWorld.sub(cameraPosition).normalize().y), 0.12))
      return column(p, this.a, 0.0).add(column(p, this.b, 0.37)).mul(slant).mul(this.strength)
    })()
    const disc = new CircleGeometry(1, SEGMENTS * 2)
    disc.rotateX(-Math.PI / 2)
    this.mesh = new Mesh(disc, m)
    this.mesh.matrixAutoUpdate = false
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = RENDER_ORDER
  }

  /** Two strike points on the ground and the sheet's strength 0..1. */
  set(a: Vector3, b: Vector3, strength: number, time: number): void {
    this.a.value.copy(a)
    this.b.value.copy(b)
    this.center.value.addVectors(a, b).multiplyScalar(0.5)
    this.strength.value = strength
    this.reach.value = 0.22 + 0.3 * strength
    this.radius.value = (this.reach.value * 4.5 + a.distanceTo(b) * 0.5) * CIRCUMSCRIBE
    this.time.value = time
    this.mesh.matrix.makeTranslation(this.center.value.x, SHEET_HEIGHT, this.center.value.z)
    this.mesh.matrixWorldNeedsUpdate = true
  }
}

const _scale = new Vector3()

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
