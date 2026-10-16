import { AdditiveBlending, Group, IcosahedronGeometry, Mesh, MeshBasicNodeMaterial, PlaneGeometry, Sprite, SpriteNodeMaterial, Vector3 } from 'three/webgpu'
import { asin, atan, cameraPosition, clamp, cross, dot, exp, float, mix, normalWorld, normalize, positionLocal, positionWorld, pow, smoothstep, uniform, uv, vec2, vec3 } from 'three/tsl'
import { N } from '../../../../rendering/noise.ts'

/** HDR levels: the orb's white heart, its plasma, the halo round it and the beam it leaves. */
const HEART = 14
const PLASMA = 5
const HALO = 2.2
const BEAM = 9

/**
 * Whiteout's blast: a sphere of white energy conjured between the raised
 * hands, swelling and churning, its plasma running over it in streams that
 * pour toward its heart, its limb burning cold blue-white; a soft halo of
 * its light in the air round it. Thrown, it leaves a beam of white light
 * from the hands down to wherever it is, thinning behind it.
 *
 * Three draws (the sphere, its halo billboard and the beam's camera-facing
 * strip), all placed by uniforms; hidden while it is gone.
 */
export class EnergyOrb {
  readonly object = new Group()
  private readonly orb: Mesh
  private readonly halo: Sprite
  private readonly beam: Mesh
  private readonly centre = uniform(new Vector3())
  private readonly radius = uniform(1)
  private readonly level = uniform(0)
  private readonly time = uniform(0)
  private readonly from = uniform(new Vector3())
  private readonly to = uniform(new Vector3())
  private readonly beamWidth = uniform(1)
  private readonly beamLevel = uniform(0)

  constructor() {
    // ---- the sphere
    const om = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false })
    om.positionNode = positionLocal.mul(this.radius).add(this.centre)
    const n = normalWorld
    const view = normalize(cameraPosition.sub(positionWorld))
    const facing = clamp(dot(n, view), 0, 1)
    // streams over the surface in its own coordinates, pouring in as they run
    const lon = atan(n.z, n.x).div(Math.PI * 2)
    const lat = asin(clamp(n.y, -1, 1)).div(Math.PI)
    const t = this.time
    const s1 = N(vec2(lon.mul(3).add(t.mul(0.21)), lat.mul(2.2).sub(t.mul(0.33)))).r
    const s2 = N(vec2(lon.mul(7).sub(t.mul(0.4)), lat.mul(5.3).add(t.mul(0.27)))).g
    const plasma = pow(s1.mul(0.6).add(s2.mul(0.4)), float(2.2))
    const heart = pow(facing, float(3))
    const limb = pow(float(1).sub(facing), float(2.5))
    const colour = vec3(1, 1, 1).mul(heart.mul(HEART))
      .add(mix(vec3(0.6, 0.78, 1), vec3(1, 1, 1), plasma).mul(plasma.mul(PLASMA)))
      .add(vec3(0.5, 0.7, 1).mul(limb.mul(3)))
    om.colorNode = colour.mul(this.level)
    this.orb = new Mesh(new IcosahedronGeometry(1, 5), om)
    this.orb.frustumCulled = false
    this.orb.renderOrder = 3.3

    // ---- the halo
    const hm = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false })
    hm.positionNode = this.centre
    hm.scaleNode = this.radius.mul(5)
    const q = uv().sub(0.5).mul(2)
    const r = q.length()
    const glow = exp(r.div(0.32).pow(2).negate()).mul(0.8).add(exp(r.div(0.12).pow(2).negate()))
    const flicker = N(vec2(t.mul(2.3), 0.71)).r.mul(0.3).add(0.85)
    hm.colorNode = vec3(0.82, 0.9, 1).mul(glow.mul(HALO).mul(flicker)).mul(float(1).sub(smoothstep(0.9, 1, r))).mul(this.level)
    this.halo = new Sprite(hm)
    this.halo.frustumCulled = false
    this.halo.renderOrder = 3.2

    // ---- the beam: a strip from `from` to `to`, turned to face the camera
    const quad = new PlaneGeometry(1, 1)
    quad.translate(0, 0.5, 0)
    const bm = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false })
    const axis = this.to.sub(this.from)
    const dir = normalize(axis.add(vec3(0, 1e-5, 0)))
    const mid = this.from.add(axis.mul(0.5))
    const side = normalize(cross(mid.sub(cameraPosition), dir).add(vec3(1e-5, 0, 0)))
    const p = positionLocal
    bm.positionNode = this.from.add(axis.mul(p.y)).add(side.mul(p.x.mul(this.beamWidth)))
    const across = uv().x.sub(0.5).mul(2)
    const along = uv().y
    const core = exp(across.div(0.18).pow(2).negate())
    const sheath = exp(across.div(0.55).pow(2).negate())
    const flow = N(vec2(across.mul(0.5), along.mul(4).sub(t.mul(6)))).r
    // thinning toward where it left the hands, brightest at the orb
    const taper = smoothstep(0, 0.6, along)
    bm.colorNode = vec3(1, 1, 1).mul(core.mul(BEAM)).add(vec3(0.55, 0.75, 1).mul(sheath.mul(flow).mul(2.5))).mul(taper).mul(this.beamLevel)
    this.beam = new Mesh(quad, bm)
    this.beam.frustumCulled = false
    this.beam.renderOrder = 3.2

    this.object.add(this.orb, this.halo, this.beam)
    this.hide()
  }

  /** Per frame: the orb at `centre` (world), `radius` m, `level` 0..1+ (0 gone), the world's step. */
  set(centre: Vector3, radius: number, level: number, dt: number): void {
    this.centre.value.copy(centre)
    this.radius.value = Math.max(0.01, radius)
    this.level.value = level
    this.time.value += dt
    const on = level > 0.003
    this.orb.visible = on
    this.halo.visible = on
  }

  /** Per frame while thrown: the beam from `from` to `to` (world), `width` m, `level` (0 hides it). */
  setBeam(from: Vector3, to: Vector3, width: number, level: number): void {
    this.from.value.copy(from)
    this.to.value.copy(to)
    this.beamWidth.value = width
    this.beamLevel.value = level
    this.beam.visible = level > 0.003
  }

  hide(): void {
    this.orb.visible = this.halo.visible = this.beam.visible = false
    this.level.value = this.beamLevel.value = 0
  }

  warm(on: boolean): void {
    if (!on) return
    this.orb.visible = this.halo.visible = this.beam.visible = true
  }
}

