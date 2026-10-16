import { Sprite, SpriteNodeMaterial, Vector3 } from 'three/webgpu'
import { atan, clamp, cos, exp, float, max, mix, positionView, screenSize, screenUV, sin, smoothstep, uniform, uv, vec2, vec3, viewportSharedTexture } from 'three/tsl'
import { N } from '../../../../rendering/noise.ts'

/** The field's diameter at full strength (m) and how far it twists the light at its heart (rad). */
const SIZE = 9
const TWIST = 2.4
/** How hard it pinches the scene in toward its centre (share of its radius at the heart). */
const PINCH = 0.32
/** Screen focal factor: uv offset per unit of the billboard's own extent, per metre of size over metres of distance. */
const FOCAL = 0.55

/**
 * The singularity's distortion field round the clenched fist: space itself
 * warped. The scene behind it (the frame drawn so far) is read through a
 * swirl that winds tighter toward the centre and a pinch that draws it in,
 * so the world round the fist turns about it and shrinks into it; ripples
 * run inward through it; a faint cold rim marks where the warp begins and a
 * white glare sits on the fist itself. One billboard; strength 0 hides it.
 * Drawn with the other refractions (render order 4), depth tested.
 */
export class DistortionField {
  readonly mesh: Sprite
  private readonly level = uniform(0)
  private readonly time = uniform(0)
  private readonly at = uniform(new Vector3())
  private readonly size = uniform(SIZE)

  constructor() {
    const m = new SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: false })
    m.positionNode = this.at
    m.scaleNode = this.size.mul(this.level.mul(0.4).add(0.6))
    const q = uv().sub(0.5).mul(2)
    const r = q.length()
    const heart = float(1).sub(smoothstep(0, 1, r)).pow(2)
    // the swirl winds tighter toward the centre and turns on over time; the pinch draws the scene in
    const turn = heart.mul(TWIST).mul(this.level).add(this.time.mul(0.9).mul(heart).mul(this.level))
    const a = atan(q.y, q.x).add(turn)
    const ripple = sin(r.mul(16).add(this.time.mul(9))).mul(0.035).mul(heart).mul(this.level)
    const pinch = float(1).sub(heart.mul(PINCH).mul(this.level)).add(ripple)
    const warped = vec2(cos(a), sin(a)).mul(r.mul(pinch))
    const churn = N(q.mul(0.8).add(vec2(this.time.mul(0.13), this.time.mul(-0.07)))).rg.sub(0.5).mul(0.08).mul(heart)
    const aspect = screenSize.x.div(screenSize.y)
    const scale = this.size.mul(FOCAL).div(max(positionView.z.negate(), 1))
    const offset = warped.add(churn).sub(q).mul(scale).mul(vec2(1, -1)).div(vec2(aspect, 1))
    const behind = viewportSharedTexture(screenUV.add(offset)).rgb
    // the rim where the warp starts, faint and cold; the glare at the fist
    const rim = exp(r.sub(0.62).div(0.05).pow(2).negate()).mul(0.12)
    const glare = exp(r.div(0.08).pow(2).negate()).mul(1.4)
    const light = vec3(0.75, 0.86, 1).mul(rim.add(glare)).mul(this.level)
    // the warped scene drained a little toward cold grey in the heart, as seen through dense, shocked air
    const drained = mix(behind, vec3(behind.dot(vec3(0.3, 0.55, 0.15))).mul(vec3(0.92, 0.97, 1.08)), heart.mul(0.45).mul(this.level))
    m.colorNode = drained.add(light)
    m.opacityNode = clamp(float(1).sub(smoothstep(0.72, 1, r)), 0, 1).mul(clamp(this.level.mul(4), 0, 1))
    this.mesh = new Sprite(m)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 4
    this.mesh.visible = false
  }

  /** Per frame: the fist (world) and the field's strength (0 gone). */
  set(at: Vector3, level: number, dt: number): void {
    this.at.value.copy(at)
    this.level.value = level
    this.time.value += dt
    this.mesh.visible = level > 0.002
  }

  warm(on: boolean): void {
    if (on) this.mesh.visible = true
  }
}
