import { AdditiveBlending, CircleGeometry, CylinderGeometry, Group, Mesh, MeshBasicNodeMaterial, PointLight, Quaternion, Vector3, type Object3D } from 'three/webgpu'
import {
  Fn, Loop, abs, atan, cameraPosition, clamp, cross, dot, exp, float, fract, length, max, min, mix,
  positionLocal, positionWorld, pow, select, smoothstep, uniform, vec2, vec3,
} from 'three/tsl'
import { N } from '../../../rendering/noise.ts'
import { dither, groundHit, rayCylinder } from '../../../rendering/volume'

/**
 * The Tumbler's afterburner: the jet in the nozzle pod between the rear tyres
 * in car form, on the robot's back (nozzle down) in robot form.
 *
 * The plume is ray-marched inside a tight depth-tested proxy frustum from the
 * nozzle's lip (the march starts at the proxy's front face, so solid geometry
 * in front still occludes it) to its analytic exit or the ground. It is the
 * flame of a reheated turbojet, emission only and optically thin, blended
 * additively in HDR so bloom carries the glare:
 *
 *   a short translucent blue cone at the lip (the flame holders' premixed
 *   burning), a train of bright Mach diamonds (the under-expanded exhaust at
 *   high throttle, yellow-white, fading downstream), and the turbulent flame
 *   around and after them, orange cooling to dull red toward a ragged tail.
 *   Turbulence is advected down the axis by the shared baked noise, one
 *   fetch per step (its four channels carry four scales).
 *
 * Where the jet reaches the ground its flame spreads over the sand as a thin
 * sheet (integrated over height analytically on a disc just above the sand).
 * The petals glow with the burn (BAT_LIGHTS.nozzle) and a light rides a third
 * of the way down the plume.
 */

/** The nozzle's lip centre and exhaust axis in the pod node's frame (btb/body.py: s 4.52, z 0.83). */
const LIP = new Vector3(0, 2.27, 0.83)
const AXIS = new Vector3(0, 1, 0)
/** Inside radius of the petals at the lip (m). */
export const EXIT_RADIUS = 0.18
/** Visible length of the flame at a throttle (m). */
export const flameLength = (power: number): number => 0.8 + 4.8 * power
/** Mixing-layer radius a distance s downstream: EXIT + SPREAD s + CURVE s^2. */
const SPREAD = 0.075
const CURVE = 0.012
/** Proxy radius over the mixing-layer radius: holds the Gaussian tail and the turbulent wobble. */
const ENVELOPE = 1.8
const STEPS = 26
const SEGMENTS = 24
const CIRCUMSCRIBE = 1 / Math.cos(Math.PI / SEGMENTS)
/** The flame sheet is drawn on a disc just above the sand, after the ground decals, before dust. */
const SHEET_HEIGHT = 0.015
const RENDER_ORDER = 1.5
/** Spool rates (1/s): a turbine winds up faster than it runs down. */
const SPOOL_UP = 5
const SPOOL_DOWN = 2.6
const LIGHT_INTENSITY = 26

const WHITE = vec3(1.0, 0.86, 0.62)
const DIAMOND = vec3(1.0, 0.7, 0.34)
const FLAME = vec3(1.0, 0.36, 0.07)
const EMBER = vec3(0.7, 0.1, 0.02)
const BLUE = vec3(0.22, 0.34, 1.0)

const mixingRadius = (s: number): number => EXIT_RADIUS + SPREAD * s + CURVE * s * s

function volumeMaterial(): MeshBasicNodeMaterial {
  return new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false })
}

const Y = new Vector3(0, 1, 0)

/** The flame leaving the nozzle. */
class Plume {
  readonly mesh: Mesh
  private readonly origin = uniform(new Vector3())
  private readonly axis = uniform(new Vector3(0, -1, 0))
  private readonly side = uniform(new Vector3(1, 0, 0))
  private readonly length = uniform(1)
  private readonly power = uniform(0)
  private readonly cell = uniform(0.3)
  private readonly shock = uniform(0)
  private readonly time = uniform(0)
  private readonly top = uniform(0.2)
  private readonly bottom = uniform(1)
  private readonly floor = uniform(0)
  private readonly quaternion = new Quaternion()

  constructor() {
    const m = volumeMaterial()
    const radius = mix(this.top, this.bottom, positionLocal.y)
    m.positionNode = vec3(positionLocal.x.mul(radius), positionLocal.y, positionLocal.z.mul(radius))
    m.colorNode = Fn(() => {
      const ro = cameraPosition
      const rd = positionWorld.sub(ro).normalize()
      const tIn = positionWorld.sub(ro).length()
      const span = rayCylinder(ro, rd, this.origin, this.axis, this.length, this.bottom)
      const tOut = min(span.y, groundHit(ro, rd, this.floor))
      const dt = max(tOut.sub(tIn), 0).div(STEPS)
      const up2 = cross(this.axis, this.side)
      const len = this.length
      const acc = vec3(0).toVar()
      Loop(STEPS, ({ i }) => {
        const p = ro.add(rd.mul(tIn.add(dt.mul(float(i).add(dither)))))
        const d = p.sub(this.origin)
        const s = dot(d, this.axis)
        const rv = d.sub(this.axis.mul(s))
        const r = length(rv)
        const sn = s.div(len)
        const nz = N(vec2(dot(rv, this.side).mul(1.1).add(dot(rv, up2).mul(0.6)), s.mul(0.55).sub(this.time.mul(3.4)))).level(float(0))

        // the flame: widens, wobbles and breaks up toward a ragged tail
        const R = s.mul(CURVE).add(SPREAD).mul(s).add(EXIT_RADIUS)
        const x = r.div(R.mul(nz.r.sub(0.5).mul(sn).mul(0.8).add(1)))
        const turb = nz.g.mul(0.6).add(nz.b.mul(0.4))
        const tail = smoothstep(1.0, 0.35, sn.add(nz.a.sub(0.5).mul(0.4)))
        const body = exp(x.mul(x).mul(-1.9)).mul(exp(sn.mul(-1.1))).mul(tail).mul(pow(turb, 2.5).mul(3).add(0.18))
        const tone = mix(FLAME, EMBER, clamp(sn.mul(1.4).add(nz.a.sub(0.5).mul(0.3)), 0, 1))

        // the blue cone at the lip: flame holders burning premixed
        const cone = exp(r.div(EXIT_RADIUS * 0.8).pow(2).mul(-1.5)).mul(smoothstep(0.55, 0.05, s)).mul(smoothstep(-0.02, 0.06, s))

        // Mach diamonds: bright compressed cells on the axis, decaying downstream
        const k = s.div(this.cell).sub(0.45)
        const disk = abs(fract(k).sub(0.5)).mul(2)
        const diamond = pow(clamp(float(1).sub(disk.mul(0.9).add(r.div(EXIT_RADIUS * 0.85))), 0, 1), 1.4)
          .mul(exp(k.mul(-0.33))).mul(smoothstep(-0.2, 0.4, k)).mul(this.shock)

        const e = tone.mul(body.mul(16)).add(DIAMOND.mul(diamond.mul(70))).add(BLUE.mul(cone.mul(9)))
          .add(WHITE.mul(diamond.mul(diamond).mul(40)))
        // the flame hands over to the ground sheet as it reaches the sand
        const fade = smoothstep(0, 0.14, p.y.sub(this.floor))
        acc.addAssign(select(s.greaterThan(0).and(s.lessThan(len)), e.mul(fade), vec3(0)))
      })
      return acc.mul(dt).mul(this.power)
    })()
    const g = new CylinderGeometry(1, 1, 1, SEGMENTS, 1, false)
    g.translate(0, 0.5, 0)
    this.mesh = new Mesh(g, m)
    this.mesh.matrixAutoUpdate = false
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = RENDER_ORDER
  }

  set(origin: Vector3, axis: Vector3, side: Vector3, power: number, time: number, floor: number): void {
    const len = flameLength(power)
    this.floor.value = floor
    this.origin.value.copy(origin)
    this.axis.value.copy(axis)
    this.side.value.copy(side)
    this.length.value = len
    this.power.value = power
    this.cell.value = 0.24 + 0.2 * power
    this.shock.value = smooth(0.35, 0.8, power)
    this.time.value = time
    this.top.value = mixingRadius(0) * ENVELOPE * CIRCUMSCRIBE
    this.bottom.value = mixingRadius(len) * ENVELOPE * CIRCUMSCRIBE
    this.quaternion.setFromUnitVectors(Y, axis)
    this.mesh.matrix.compose(origin, this.quaternion, _scale.set(1, len, 1))
    this.mesh.matrixWorldNeedsUpdate = true
  }
}

/** The flame spreading over the sand where the jet strikes it. */
class FlameSheet {
  readonly mesh: Mesh
  private readonly center = uniform(new Vector3())
  private readonly strength = uniform(0)
  private readonly reach = uniform(0.5)
  private readonly radius = uniform(1)
  private readonly time = uniform(0)

  constructor() {
    const m = volumeMaterial()
    m.positionNode = vec3(positionLocal.x.mul(this.radius), positionLocal.y, positionLocal.z.mul(this.radius))
    m.colorNode = Fn(() => {
      const p = positionWorld
      const dxz = p.xz.sub(this.center.xz)
      const rho = length(dxz)
      const nz = N(vec2(atan(dxz.y, dxz.x).mul(7 / (2 * Math.PI)), rho.mul(0.7).sub(this.time.mul(2.8)))).level(float(0))
      const reach = this.reach
      // wall jet: a layer thickening as it runs out, integrated over height, ragged by the noise
      const flow = rho.mul(0.06).add(0.04).mul(exp(rho.div(reach).negate())).mul(nz.g.mul(nz.g).mul(2).add(0.2))
      const stagnation = exp(rho.mul(rho).div(-0.05)).mul(Math.sqrt(0.05 * Math.PI) / 2)
      const glow = exp(rho.div(reach.mul(0.45)).negate()).mul(0.03)
      const tone = mix(WHITE, FLAME, clamp(rho.div(reach).mul(1.3), 0, 1))
      const slant = float(1).div(max(abs(positionWorld.sub(cameraPosition).normalize().y), 0.12))
      return WHITE.mul(stagnation.mul(8)).add(tone.mul(flow.mul(14))).add(EMBER.mul(glow.mul(8))).mul(slant).mul(this.strength)
    })()
    const disc = new CircleGeometry(1, SEGMENTS * 2)
    disc.rotateX(-Math.PI / 2)
    this.mesh = new Mesh(disc, m)
    this.mesh.matrixAutoUpdate = false
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = RENDER_ORDER
  }

  set(at: Vector3, strength: number, time: number, floor: number): void {
    this.center.value.copy(at)
    this.strength.value = strength
    this.reach.value = 0.35 + 0.55 * strength
    this.radius.value = this.reach.value * 4.5 * CIRCUMSCRIBE
    this.time.value = time
    this.mesh.matrix.makeTranslation(at.x, floor + SHEET_HEIGHT, at.z)
    this.mesh.matrixWorldNeedsUpdate = true
  }
}

/**
 * The jet as the character drives it: a throttle the owner sets every frame
 * (the car's boost, a fighting move, the special), spooled like a turbine,
 * the flame placed on the pod's nozzle as posed, and what it does to the
 * ground under it. Its meshes start visible (so a compile sees them) and hide
 * while it is cold.
 */
export class Afterburner {
  /** world-space effects: add to the scene */
  readonly object = new Group()
  /** throttle asked for, 0..1+ (past 1: the special's overdrive) */
  target = 0
  /** spooled throttle */
  power = 0
  /** the ground's height under the nozzle: where the flame ends */
  floor = 0
  /** how hard the flame strikes the ground, 0..1 */
  impingement = 0
  /** the nozzle's lip and exhaust axis (world), as of the last update */
  readonly lip = new Vector3()
  readonly axis = new Vector3(0, -1, 0)
  /** where the flame strikes the ground (world) */
  readonly impact = new Vector3()
  private readonly pod: Object3D
  private readonly plume = new Plume()
  private readonly sheet = new FlameSheet()
  private readonly light = new PointLight(0xffa458, 0, 22, 2)
  private readonly side = new Vector3()
  private time = 0

  constructor(pod: Object3D) {
    this.pod = pod
    this.object.add(this.plume.mesh, this.sheet.mesh, this.light)
  }

  /** Per frame, after the model is posed; returns the nozzle's glow (0..1). */
  update(dt: number): number {
    this.time += dt
    const k = 1 - Math.exp(-dt * (this.target > this.power ? SPOOL_UP : SPOOL_DOWN))
    this.power += (this.target - this.power) * k
    if (this.target === 0 && this.power < 0.004) this.power = 0
    // combustion roughness: a few percent of fast, uncorrelated flutter
    const t = this.time
    const power = this.power * (1 + 0.04 * Math.sin(t * 83.0) + 0.03 * Math.sin(t * 131.7 + 1.1))
    const W = this.pod.matrixWorld
    this.lip.copy(LIP).applyMatrix4(W)
    this.axis.copy(AXIS).transformDirection(W)
    this.side.set(1, 0, 0).transformDirection(W)
    const on = power > 0.003
    this.plume.mesh.visible = on
    this.sheet.mesh.visible = on
    if (!on) {
      this.impingement = 0
      this.light.intensity = 0
      return 0
    }
    const shown = Math.min(1.25, power)
    this.plume.set(this.lip, this.axis, this.side, shown, t, this.floor)
    // the flame strikes the ground where its axis meets it within its length
    const reach = (this.lip.y - this.floor) / Math.max(-this.axis.y, 1e-3)
    const length = flameLength(shown)
    this.impingement = this.axis.y < -0.2 ? shown * smooth(length * 1.1, length * 0.25, reach) : 0
    this.impact.copy(this.lip).addScaledVector(this.axis, Math.max(0, reach))
    this.impact.y = this.floor
    this.sheet.set(this.impact, this.impingement, t, this.floor)
    this.sheet.mesh.visible = this.impingement > 0.01
    // the flame lights what is round it: from a third of the way down the plume
    this.light.position.copy(this.lip).addScaledVector(this.axis, Math.min(1.6, length * 0.33))
    this.light.intensity = LIGHT_INTENSITY * shown * (1 + 0.1 * Math.sin(t * 61.3))
    return Math.min(1, power)
  }
}

const _scale = new Vector3()

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
