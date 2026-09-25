import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, Mesh, MeshBasicNodeMaterial, Vector3 } from 'three/webgpu'
import { attribute, float, pow, smoothstep, uniform, vec3 } from 'three/tsl'

/** A trail's look: its tint (linear HDR at full strength), how long a sample lives and the edge speed it needs. */
export interface TrailStyle {
  color: [number, number, number]
  /** seconds a sample stays visible */
  life: number
  /** edge speed (m/s) at which the trail reaches full strength; slower motion leaves a fainter one */
  speed: number
  /** 0 an even smear across the edge, 1 bright at the tip end only (a sword's point) */
  tip: number
}

/** Samples kept (including the sub-samples laid between frames on fast arcs). */
const SAMPLES = 40
/** Sub-samples between two frames when the edge moves this far (m) or more; at most MAX_SUB. */
const SUB_STEP = 0.18
const MAX_SUB = 4

interface Sample { base: Vector3; tip: Vector3; age: number; strength: number }

/**
 * The smear a fast edge leaves in the eye (and on film): a ribbon between the
 * cutting edge's two ends over the last fraction of a second, fading with age
 * and drawn additively like the highlight it is. Only motion faster than a
 * swing's leaves one. Fast arcs are sub-sampled between frames (Hermite
 * through the recent positions), so the ribbon stays an arc at any frame rate.
 * The whole ribbon (under a hundred vertices) is rewritten each frame.
 */
export class SwingTrail {
  readonly mesh: Mesh
  /** 0..1 how strongly the trail shows (a weapon fading away takes its trail with it) */
  strength = 1
  private readonly style: TrailStyle
  private readonly samples: Sample[] = []
  private readonly position: BufferAttribute
  private readonly fade: BufferAttribute
  private readonly level = uniform(1)
  private readonly lastBase = new Vector3()
  private readonly lastTip = new Vector3()
  private readonly prevBase = new Vector3()
  private readonly prevTip = new Vector3()
  private primed = 0

  constructor(style: TrailStyle) {
    this.style = style
    for (let i = 0; i < SAMPLES; i++) this.samples.push({ base: new Vector3(), tip: new Vector3(), age: 1e9, strength: 0 })
    const geometry = new BufferGeometry()
    this.position = new BufferAttribute(new Float32Array(SAMPLES * 2 * 3), 3)
    this.position.setUsage(DynamicDrawUsage)
    this.fade = new BufferAttribute(new Float32Array(SAMPLES * 2 * 2), 2)
    this.fade.setUsage(DynamicDrawUsage)
    geometry.setAttribute('position', this.position)
    geometry.setAttribute('fade', this.fade)
    const index: number[] = []
    for (let i = 0; i < SAMPLES - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3
      index.push(a, c, b, b, c, d)
    }
    geometry.setIndex(index)
    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false })
    const f = attribute('fade', 'vec2')
    // x: strength of the sample (age and speed), y: 0 at the edge's base .. 1 at its tip
    const across = f.y
    const profile = smoothstep(0, 0.12, across).mul(smoothstep(1, 0.9, across)).mul(float(1 - style.tip).add(pow(across, 3).mul(style.tip)))
    m.colorNode = vec3(...style.color).mul(f.x.mul(f.x)).mul(profile).mul(this.level)
    this.mesh = new Mesh(geometry, m)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 3
    this.mesh.visible = false
  }

  /** Forget the path (the weapon appeared or the trail restarts). */
  reset(): void {
    for (const s of this.samples) s.age = 1e9
    this.primed = 0
    this.mesh.visible = false
  }

  /** Per frame: the edge's ends now (world space). */
  update(dt: number, base: Vector3, tip: Vector3): void {
    for (const s of this.samples) s.age += dt
    if (this.primed >= 2 && dt > 0) {
      const moved = Math.max(base.distanceTo(this.lastBase), tip.distanceTo(this.lastTip))
      const speed = tip.distanceTo(this.lastTip) / dt
      const strength = Math.min(1, Math.max(0, (speed - this.style.speed * 0.35) / (this.style.speed * 0.65))) * this.strength
      const sub = Math.min(MAX_SUB, Math.floor(moved / SUB_STEP))
      for (let k = 1; k <= sub; k++) {
        const u = k / (sub + 1)
        this.push(hermite(this.prevBase, this.lastBase, base, u, _b), hermite(this.prevTip, this.lastTip, tip, u, _t), dt * (1 - u), strength)
      }
      this.push(base, tip, 0, strength)
    }
    this.prevBase.copy(this.lastBase)
    this.prevTip.copy(this.lastTip)
    this.lastBase.copy(base)
    this.lastTip.copy(tip)
    this.primed++
    this.write()
  }

  private push(base: Vector3, tip: Vector3, age: number, strength: number): void {
    const s = this.samples.pop() as Sample
    s.base.copy(base)
    s.tip.copy(tip)
    s.age = age
    s.strength = strength
    this.samples.unshift(s)
  }

  private write(): void {
    const p = this.position.array as Float32Array
    const f = this.fade.array as Float32Array
    const life = this.style.life
    let any = false
    for (let i = 0; i < SAMPLES; i++) {
      const s = this.samples[i]
      const a = Math.max(0, 1 - s.age / life) * s.strength
      if (a > 0.003) any = true
      if (a <= 0.003 && i > 0) {
        // a dead sample collapses onto the one before it: no stretched quad back to a stale place
        p.copyWithin(i * 6, (i - 1) * 6, i * 6)
      } else {
        s.base.toArray(p, i * 6)
        s.tip.toArray(p, i * 6 + 3)
      }
      f[i * 4] = a
      f[i * 4 + 1] = 0
      f[i * 4 + 2] = a
      f[i * 4 + 3] = 1
    }
    this.mesh.visible = any
    if (any) {
      this.position.needsUpdate = true
      this.fade.needsUpdate = true
    }
  }
}

/** Point between b (u = 0) and c (u = 1) on a Hermite through a, b, c (tangent at c from b). */
function hermite(a: Vector3, b: Vector3, c: Vector3, u: number, out: Vector3): Vector3 {
  const u2 = u * u, u3 = u2 * u
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2
  return out.set(
    h00 * b.x + h10 * (c.x - a.x) * 0.5 + h01 * c.x + h11 * (c.x - b.x),
    h00 * b.y + h10 * (c.y - a.y) * 0.5 + h01 * c.y + h11 * (c.y - b.y),
    h00 * b.z + h10 * (c.z - a.z) * 0.5 + h01 * c.z + h11 * (c.z - b.z),
  )
}

const _b = new Vector3()
const _t = new Vector3()
