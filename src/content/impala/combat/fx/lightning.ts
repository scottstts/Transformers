import { AdditiveBlending, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, PlaneGeometry, Vector3 } from 'three/webgpu'
import { cameraPosition, clamp, cross, exp, float, floor, fract, instancedBufferAttribute, mix, normalize, positionLocal, select, sin, uniform, uv, vec3 } from 'three/tsl'

/** Segments in the pool: new bolts overwrite the oldest. */
const MAX = 2400
/** Points a bolt is subdivided into at most (2^DEPTH + 1). */
const DEPTH = 5
const POINTS = (1 << DEPTH) + 1
/** The return stroke's flash: the first moments of a segment's life burn this much brighter. */
const FLASH = 2.4
const FLASH_TIME = 0.018
/** Flicker steps per second: the channel's current surging. */
const FLICKER = 38

/** How a bolt is drawn: its width (m), life (s), brightness and how far it wanders and forks. */
export interface BoltStyle {
  width: number
  life: number
  brightness: number
  /** sideways wander per unit length at the coarsest subdivision */
  roughness: number
  /** chance a subdivision point throws a fork, and the forks' length share */
  forks: number
  forkLength: number
}

/** The ground a crawling bolt keeps to. */
export interface BoltGround {
  height(x: number, z: number): number
}

/**
 * Lightning: the Impala's crimson discharge. A bolt is a jagged channel
 * between two points, built by midpoint displacement (each subdivision
 * offsets its midpoint sideways by a share of its length, halving each
 * level), with forks thrown off along it. Each segment is a camera-facing
 * quad in one instanced additive draw: a white-hot core in a crimson sheath,
 * a return-stroke flash in its first milliseconds, the current surging in a
 * stepped flicker, gone within its short life. A strike that holds (a
 * channel feeding a falling body) is re-struck with a fresh shape every few
 * hundredths of a second by its caller, so it spikes and wanders as real
 * discharges do. A crawling bolt keeps to the ground, hugging the relief a
 * few centimetres over it.
 *
 * Generation is allocation-free (fixed scratch); a strike uploads only its
 * own segments' slots.
 */
export class Lightning {
  readonly mesh: Mesh
  ground: BoltGround | null = null
  private readonly time = uniform(0)
  private clock = 0
  private cursor = 0
  private liveUntil = -1
  private readonly a0: InstancedBufferAttribute
  private readonly a1: InstancedBufferAttribute
  private readonly a2: InstancedBufferAttribute
  private readonly attributes: InstancedBufferAttribute[]
  private readonly px = new Float32Array(POINTS)
  private readonly py = new Float32Array(POINTS)
  private readonly pz = new Float32Array(POINTS)
  /** fork starts and directions per recursion depth (the recursion reuses the point scratch) */
  private readonly forkStarts = [new Float32Array(POINTS * 6), new Float32Array(POINTS * 6)]
  /** segments written by the strike in progress */
  private written = 0
  /** the last bolt's channel, for whoever wants to follow it (a mark on the ground, a light) */
  readonly lastEnd = new Vector3()
  readonly lastMid = new Vector3()

  constructor() {
    const quad = new PlaneGeometry(1, 1)
    quad.translate(0, 0.5, 0)
    const geometry = new InstancedBufferGeometry()
    geometry.index = quad.index
    geometry.setAttribute('position', quad.getAttribute('position'))
    geometry.setAttribute('uv', quad.getAttribute('uv'))
    geometry.instanceCount = MAX
    const make = (): InstancedBufferAttribute => {
      const a = new InstancedBufferAttribute(new Float32Array(MAX * 4), 4)
      a.setUsage(DynamicDrawUsage)
      return a
    }
    this.a0 = make()
    this.a1 = make()
    this.a2 = make()
    this.attributes = [this.a0, this.a1, this.a2]
    for (let i = 0; i < MAX; i++) this.a0.array[i * 4 + 3] = 1e9
    // a0: start xyz, birth; a1: end xyz, life; a2: width, brightness, seed, -
    const p0 = instancedBufferAttribute(this.a0, 'vec4') as any
    const p1 = instancedBufferAttribute(this.a1, 'vec4') as any
    const s = instancedBufferAttribute(this.a2, 'vec4') as any
    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false })
    const age = this.time.sub(p0.w)
    const life = p1.w
    const alive = age.greaterThanEqual(0).and(age.lessThan(life))
    const axis = vec3(p1.xyz.sub(p0.xyz))
    const width = s.x
    // overlap the neighbours by half a width at each end, so the channel reads unbroken at its kinks
    const dir = normalize(axis.add(vec3(0, 1e-5, 0)))
    const from = p0.xyz.sub(dir.mul(width.mul(0.5)))
    const span = axis.add(dir.mul(width))
    const mid = vec3(from.add(span.mul(0.5)))
    const side = normalize(cross(dir, mid.sub(cameraPosition)).add(vec3(1e-5, 0, 0)))
    const q = positionLocal
    m.positionNode = select(alive, from.add(span.mul(q.y)).add(side.mul(q.x.mul(width))), vec3(0, -1000, 0))
    const across = uv().x.sub(0.5).mul(2)
    const u = age.div(life)
    // the return stroke, then the current surging in steps, then dying out
    const flash = mix(float(1), float(FLASH), clamp(float(1).sub(age.div(FLASH_TIME)), 0, 1))
    const step = floor(this.time.mul(FLICKER)).add(s.z.mul(97.3))
    const surge = fract(sin(step.mul(12.9898)).mul(43758.5453)).mul(0.75).add(0.45)
    const fade = clamp(float(1).sub(u), 0, 1).pow(1.5)
    const core = exp(across.div(0.16).pow(2).negate())
    const sheath = exp(across.div(0.55).pow(2).negate())
    const color = vec3(1.0, 0.72, 0.78).mul(core.mul(9)).add(vec3(1.0, 0.04, 0.09).mul(sheath.mul(2.2)))
    m.colorNode = select(alive, color.mul(s.y).mul(flash).mul(surge).mul(fade), vec3(0))
    this.mesh = new Mesh(geometry, m)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 3
    this.mesh.visible = false
  }

  /** A bolt from `from` to `to` (world) in `style`, with forks. */
  strike(from: Vector3, to: Vector3, style: BoltStyle, crawl = false): void {
    const first = this.cursor
    this.written = 0
    this.channel(from.x, from.y, from.z, to.x, to.y, to.z, style, crawl, 0)
    // the slots it wrote are one run of the ring (two where it wrapped): one upload range each
    const count = Math.min(MAX, this.written)
    if (count === 0) return
    const head = Math.min(count, MAX - first)
    for (const a of this.attributes) {
      a.addUpdateRange(first * 4, head * 4)
      if (count > head) a.addUpdateRange(0, (count - head) * 4)
      a.needsUpdate = true
    }
  }

  update(dt: number): void {
    this.clock += dt
    this.time.value = this.clock
    this.mesh.visible = this.clock < this.liveUntil
  }

  reset(): void {
    this.liveUntil = -1
    this.mesh.visible = false
  }

  warm(on: boolean): void {
    this.mesh.visible = on || this.clock < this.liveUntil
  }

  /** One channel and its forks (to `depth` 2), subdivided from the scratch points. */
  private channel(ax: number, ay: number, az: number, bx: number, by: number, bz: number, style: BoltStyle, crawl: boolean, depth: number): void {
    const n = POINTS - 1
    const px = this.px, py = this.py, pz = this.pz
    px[0] = ax; py[0] = ay; pz[0] = az
    px[n] = bx; py[n] = by; pz[n] = bz
    const length = Math.hypot(bx - ax, by - ay, bz - az)
    if (length < 1e-3) return
    // an orthonormal pair across the channel
    const dx = (bx - ax) / length, dy = (by - ay) / length, dz = (bz - az) / length
    let ux = -dz, uy = 0, uz = dx
    if (ux * ux + uz * uz < 1e-6) { ux = 1; uy = 0; uz = 0 }
    const ul = Math.hypot(ux, uy, uz)
    ux /= ul; uy /= ul; uz /= ul
    const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux
    for (let step = n; step > 1; step >>= 1) {
      const wander = style.roughness * length * (step / n)
      for (let i = 0; i < n; i += step) {
        const j = i + step, k = i + step / 2
        const a = (Math.random() * 2 - 1) * wander, b = (Math.random() * 2 - 1) * wander * (crawl ? 0.25 : 1)
        px[k] = (px[i] + px[j]) / 2 + ux * a + vx * b
        py[k] = (py[i] + py[j]) / 2 + uy * a + vy * b
        pz[k] = (pz[i] + pz[j]) / 2 + uz * a + vz * b
      }
    }
    if (crawl && this.ground) {
      for (let i = 1; i < n; i++) py[i] = this.ground.height(px[i], pz[i]) + 0.04 + Math.random() * 0.22
    }
    const width = style.width * (depth === 0 ? 1 : 0.55 / depth)
    const brightness = style.brightness * (depth === 0 ? 1 : 0.6 / depth)
    for (let i = 0; i < n; i++) this.segment(px[i], py[i], pz[i], px[i + 1], py[i + 1], pz[i + 1], width * (1 - 0.35 * i / n), style.life, brightness)
    if (depth === 0) {
      this.lastEnd.set(bx, by, bz)
      this.lastMid.set(px[n >> 1], py[n >> 1], pz[n >> 1])
    }
    if (depth >= 2 || style.forks <= 0) return
    // forks off the channel, angled away from it; their subdivision overwrites the point scratch, so take the starts first
    const forks = this.forkStarts[depth]
    let count = 0
    for (let i = 2; i < n - 2; i += 2) {
      if (Math.random() >= style.forks) continue
      const o = count++ * 6
      forks[o] = px[i]; forks[o + 1] = py[i]; forks[o + 2] = pz[i]
      forks[o + 3] = px[i + 2] - px[i]; forks[o + 4] = py[i + 2] - py[i]; forks[o + 5] = pz[i + 2] - pz[i]
    }
    for (let f = 0; f < count; f++) {
      const o = f * 6
      const sx = forks[o], sy = forks[o + 1], sz = forks[o + 2]
      let fx = forks[o + 3], fy = forks[o + 4], fz = forks[o + 5]
      const fl = Math.hypot(fx, fy, fz) || 1
      fx /= fl; fy /= fl; fz /= fl
      const reach = length * style.forkLength * (0.5 + Math.random() * 0.5)
      const turn = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.6)
      const ex = sx + (fx + ux * turn) * reach, ey = sy + (fy + uy * turn - (crawl ? 0 : 0.2)) * reach, ez = sz + (fz + uz * turn) * reach
      this.channel(sx, sy, sz, ex, crawl && this.ground ? this.ground.height(ex, ez) + 0.05 : ey, ez, style, crawl, depth + 1)
    }
  }

  private segment(ax: number, ay: number, az: number, bx: number, by: number, bz: number, width: number, life: number, brightness: number): void {
    const i = this.cursor
    this.cursor = (this.cursor + 1) % MAX
    const a0 = this.a0.array as Float32Array, a1 = this.a1.array as Float32Array, a2 = this.a2.array as Float32Array
    a0[i * 4] = ax; a0[i * 4 + 1] = ay; a0[i * 4 + 2] = az; a0[i * 4 + 3] = this.clock
    a1[i * 4] = bx; a1[i * 4 + 1] = by; a1[i * 4 + 2] = bz; a1[i * 4 + 3] = life * (0.75 + 0.5 * Math.random())
    a2[i * 4] = width; a2[i * 4 + 1] = brightness; a2[i * 4 + 2] = Math.random(); a2[i * 4 + 3] = 0
    this.written++
    this.liveUntil = Math.max(this.liveUntil, this.clock + life * 1.25)
    this.mesh.visible = true
  }
}
