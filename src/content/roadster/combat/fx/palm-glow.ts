import { AdditiveBlending, Sprite, SpriteNodeMaterial, Vector3 } from 'three/webgpu'
import { abs, atan, clamp, cos, exp, float, mix, pow, smoothstep, uniform, uv, vec2, vec3 } from 'three/tsl'
import { N } from '../../../../rendering/noise.ts'

/** Diameter of a glow at full charge (m) and its HDR peak. */
const SIZE = 1.5
const PEAK = 9

/**
 * The light of a palm cannon charging and firing: a white-hot point in the
 * palm in a soft cold-white halo, four thin rays turning slowly through it
 * (the lens's star on a point that bright), the whole flickering with the
 * charge. One additive billboard per palm, placed every frame; dark (and
 * hidden) at rest. Its level is the fight's: the charge (cue `charge.<side>`)
 * swells it, a blast flares it and lets it die.
 */
export class PalmGlow {
  readonly mesh: Sprite
  private readonly level = uniform(0)
  private readonly time = uniform(0)
  private readonly at = uniform(new Vector3())
  private readonly size = uniform(SIZE)

  constructor() {
    const m = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false })
    m.positionNode = this.at
    m.scaleNode = this.size.mul(clamp(this.level.mul(0.6).add(0.4), 0, 1.6))
    const q = uv().sub(0.5).mul(2)
    const r = q.length()
    const angle = atan(q.y, q.x).add(this.time.mul(0.6))
    const flicker = N(vec2(this.time.mul(3.1), 0.37)).r.mul(0.5).add(0.75)
    const core = exp(r.div(0.09).pow(2).negate())
    const halo = exp(r.div(0.42).pow(2).negate()).mul(0.35)
    // four rays: thin, fading out along their length
    const rays = pow(abs(cos(angle.mul(2))), float(60)).mul(exp(r.div(0.55).negate())).mul(0.9)
    const edge = float(1).sub(smoothstep(0.85, 1, r))
    const light = core.mul(3).add(halo).add(rays).mul(edge)
    const tint = mix(vec3(0.62, 0.78, 1), vec3(1, 1, 1), clamp(core.add(0.2), 0, 1))
    m.colorNode = tint.mul(light).mul(this.level.mul(flicker).mul(PEAK))
    this.mesh = new Sprite(m)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 3.2
    this.mesh.visible = false
  }

  /** Per frame: where the palm is (world) and its level (0 dark). */
  set(at: Vector3, level: number, dt: number): void {
    this.at.value.copy(at)
    this.level.value = Math.max(0, level)
    this.time.value += dt
    this.mesh.visible = level > 0.003
  }

  warm(on: boolean): void {
    if (on) this.mesh.visible = true
  }

  /** The glow's world position this frame. */
  get position(): Vector3 {
    return this.at.value
  }

  /** Scale the glow's size (1 the palm's). */
  scale(s: number): void {
    this.size.value = SIZE * s
  }
}

