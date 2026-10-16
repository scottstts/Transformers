import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, Mesh, MeshBasicNodeMaterial, Vector3, type Node, type Object3D } from 'three/webgpu'
import { attribute, cameraPosition, clamp, cross, exp, float, mix, normalize, pow, select, uniform, vec2, vec3 } from 'three/tsl'
import { N } from '../../../../rendering/noise.ts'

/** Samples kept per streak (one a frame) and how long a streak lasts behind its anchor (s). */
const SAMPLES = 48
const LIFE = 0.55
/** HDR levels of a streak's core and of the cold sheath round it. */
const CORE = 7
const SHEATH = 1.6

/** Where the streaks leave the body, and each one's width (m). */
const ANCHORS: ReadonlyArray<readonly [string, number]> = [
  ['bone:head', 0.5], ['bone:chest', 1.1], ['bone:pelvis', 0.9],
  ['bone:hand.R', 0.38], ['bone:hand.L', 0.38], ['bone:foot.R', 0.42], ['bone:foot.L', 0.42],
]

/**
 * A speedster's streaks of light (the Quicksilver look): from the head, the
 * torso and every limb, ribbons trailing back along the very path the body
 * took, a white-hot core in a cold blue-white sheath, flickering along their
 * length, thinning and dying as they age. Their length is a time, not a
 * distance, so the faster it runs the further round the ring they reach:
 * short tails as it sets off, arcs spanning half the circle at full speed.
 *
 * One draw: each streak is a strip of SAMPLES pairs of vertices whose places
 * (the anchor a frame apart, its age, and the next sample toward the anchor
 * for the strip's direction) are written each frame; the vertex stage turns
 * each pair across the strip to face the camera.
 */
export class SpeedTrails {
  readonly mesh: Mesh
  private readonly anchors: Object3D[]
  private readonly points = new Float32Array(ANCHORS.length * SAMPLES * 3)
  private readonly births = new Float32Array(SAMPLES).fill(-1e9)
  private readonly a: BufferAttribute
  private readonly b: BufferAttribute
  private readonly time = uniform(0)
  private readonly level = uniform(0)
  private clock = 0
  private cursor = -1
  private strength = 0
  private liveUntil = -1
  /** the anchors' streaks are being laid (the run); otherwise they only fade */
  recording = false

  constructor(model: { node(name: string): Object3D }, color: readonly [number, number, number]) {
    this.anchors = ANCHORS.map(([name]) => model.node(name))
    const vertices = ANCHORS.length * SAMPLES * 2
    // a: the sample's place and its age; b: the next sample toward the anchor (the strip's direction)
    this.a = new BufferAttribute(new Float32Array(vertices * 4), 4).setUsage(DynamicDrawUsage)
    this.b = new BufferAttribute(new Float32Array(vertices * 3), 3).setUsage(DynamicDrawUsage)
    // fixed: which side of the strip a vertex is (-1 / 1) and its streak's width
    const side = new Float32Array(vertices * 2)
    for (let s = 0; s < ANCHORS.length; s++) {
      for (let k = 0; k < SAMPLES; k++) {
        for (let e = 0; e < 2; e++) {
          const v = (s * SAMPLES + k) * 2 + e
          side[v * 2] = e === 0 ? -1 : 1
          side[v * 2 + 1] = ANCHORS[s][1]
        }
      }
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices * 3), 3))
    geometry.setAttribute('trailA', this.a)
    geometry.setAttribute('trailB', this.b)
    geometry.setAttribute('trailSide', new BufferAttribute(side, 2))
    const index: number[] = []
    for (let s = 0; s < ANCHORS.length; s++) {
      for (let k = 0; k < SAMPLES - 1; k++) {
        const v = (s * SAMPLES + k) * 2
        index.push(v, v + 2, v + 1, v + 1, v + 2, v + 3)
      }
    }
    geometry.setIndex(index)

    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false })
    const A = attribute('trailA', 'vec4') as Node<'vec4'>
    const B = attribute('trailB', 'vec3') as Node<'vec3'>
    const S = attribute('trailSide', 'vec2') as Node<'vec2'>
    const age = A.w
    const u = clamp(age.div(LIFE), 0, 1)
    const along = normalize(B.sub(A.xyz).add(vec3(0, 1e-5, 0)))
    const across = normalize(cross(A.xyz.sub(cameraPosition), along).add(vec3(1e-5, 0, 0)))
    const width = S.y.mul(pow(float(1).sub(u), float(0.7)))
    m.positionNode = select(age.lessThan(LIFE), A.xyz.add(across.mul(S.x.mul(width))), vec3(0, -1000, 0))
    // across the strip (-1 .. 1, interpolated): a narrow white-hot core in a broad cold glow
    const core = exp(S.x.div(0.3).pow(2).negate())
    const sheath = exp(S.x.div(0.8).pow(2).negate())
    const flicker = N(vec2(age.mul(9).add(A.x.add(A.z).mul(0.15)), this.time.mul(5))).r.mul(0.7).add(0.55)
    const fade = pow(float(1).sub(u), float(1.6)).mul(this.level)
    m.colorNode = mix(vec3(...color).mul(SHEATH).mul(sheath), vec3(1, 1, 1).mul(CORE), core).mul(flicker).mul(fade)
    this.mesh = new Mesh(geometry, m)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 3.15
    this.mesh.visible = false
  }

  /** Per frame, after the model is posed: lay this frame's samples (while recording) at `strength` 0..1, and age the rest. */
  update(dt: number, strength: number): void {
    this.clock += dt
    this.time.value = this.clock
    this.strength += (strength - this.strength) * Math.min(1, dt * 8)
    this.level.value = this.strength
    if (this.recording && dt > 0) {
      this.cursor = (this.cursor + 1) % SAMPLES
      this.births[this.cursor] = this.clock
      for (let s = 0; s < this.anchors.length; s++) {
        _p.setFromMatrixPosition(this.anchors[s].matrixWorld).toArray(this.points, (s * SAMPLES + this.cursor) * 3)
      }
      this.liveUntil = this.clock + LIFE
    }
    const live = this.clock < this.liveUntil && this.cursor >= 0
    this.mesh.visible = live
    if (live) this.write()
  }

  reset(): void {
    this.recording = false
    this.cursor = -1
    this.births.fill(-1e9)
    this.liveUntil = -1
    this.strength = 0
    this.mesh.visible = false
  }

  warm(on: boolean): void {
    this.mesh.visible = on || this.clock < this.liveUntil
  }

  /** Lay every strip's vertex pairs from the newest sample back. */
  private write(): void {
    const a = this.a.array as Float32Array, b = this.b.array as Float32Array
    const previous = (this.cursor - 1 + SAMPLES) % SAMPLES
    for (let s = 0; s < this.anchors.length; s++) {
      for (let k = 0; k < SAMPLES; k++) {
        const sample = (this.cursor - k + SAMPLES) % SAMPLES
        const src = (s * SAMPLES + sample) * 3
        const age = this.clock - this.births[sample]
        // the strip's direction at each sample: toward the newer one; at the newest, on away from the one before it
        const toward = (s * SAMPLES + (k === 0 ? previous : (sample + 1) % SAMPLES)) * 3
        const sign = k === 0 ? -1 : 1
        for (let e = 0; e < 2; e++) {
          const v = (s * SAMPLES + k) * 2 + e
          a[v * 4] = this.points[src]; a[v * 4 + 1] = this.points[src + 1]; a[v * 4 + 2] = this.points[src + 2]; a[v * 4 + 3] = age
          for (let c = 0; c < 3; c++) b[v * 3 + c] = this.points[src + c] + (this.points[toward + c] - this.points[src + c]) * sign
        }
      }
    }
    this.a.needsUpdate = this.b.needsUpdate = true
  }
}

const _p = new Vector3()
