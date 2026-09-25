import { DynamicDrawUsage, InstancedBufferAttribute, Sprite, SpriteNodeMaterial, Vector3 } from 'three/webgpu'
import { clamp, float, instancedBufferAttribute, max, positionView, screenSize, screenUV, select, smoothstep, uniform, uv, vec2, vec3, viewportSharedTexture } from 'three/tsl'
import { N } from '../../../../rendering/noise.ts'

/** Pool size: new shimmer overwrites the oldest. */
const MAX = 256
/** Screen-space shimmer scale (cells across the screen's height) and how fast it rises (screen heights / s). */
const CELLS = 7
const RISE = 0.22
/** Refraction at full strength: screen heights of offset per metre of patch over metres of distance. */
const BEND = 0.0045

/** A patch of hot air. */
export interface HazePatch {
  at: Vector3
  /** random offset around `at` (m) */
  jitter?: number
  /** diameter (m) at its start and end */
  size: [number, number]
  /** how fast it drifts up (m/s): hot air rises */
  rise: number
  life: [number, number]
  /** 0..1+ how hot: how hard it bends the light */
  strength: number
}

/**
 * Heat shimmer: air over something hot bends the light through it in small,
 * rising, ever-changing ripples. Each patch of hot air is a soft billboard
 * that reads the frame drawn so far behind it (`viewportSharedTexture`) at
 * an offset from rising screen-space noise, so everything behind it wavers
 * and nothing in front of it does (it is depth tested and drawn last). The
 * offset scales with the patch's size over its distance, so the ripple is
 * the same in the world however far the camera stands. Stored once at birth
 * and animated on the GPU; hidden while nothing is hot, and while hidden it
 * costs nothing (the frame copy happens only when a patch is drawn).
 */
export class HeatHaze {
  readonly mesh: Sprite
  private readonly time = uniform(0)
  private clock = 0
  private cursor = 0
  private liveUntil = -1
  private readonly a0: InstancedBufferAttribute
  private readonly a1: InstancedBufferAttribute
  private readonly a2: InstancedBufferAttribute

  constructor() {
    const make = (): InstancedBufferAttribute => {
      const a = new InstancedBufferAttribute(new Float32Array(MAX * 4), 4)
      a.setUsage(DynamicDrawUsage)
      return a
    }
    this.a0 = make() // position, birth
    this.a1 = make() // size at start, size at end, rise, life
    this.a2 = make() // strength, seed
    for (let i = 0; i < MAX; i++) this.a0.array[i * 4 + 3] = 1e9
    const p0 = instancedBufferAttribute(this.a0, 'vec4') as any
    const s = instancedBufferAttribute(this.a1, 'vec4') as any
    const k = instancedBufferAttribute(this.a2, 'vec4') as any

    const m = new SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: false })
    const age = this.time.sub(p0.w)
    const life = s.w
    const u = clamp(age.div(life), 0, 1)
    const alive = age.greaterThanEqual(0).and(age.lessThan(life))
    const size = s.x.add(s.y.sub(s.x).mul(u))
    m.positionNode = select(alive, p0.xyz.add(vec3(0, s.z.mul(age), 0)), vec3(0, -1000, 0))
    m.scaleNode = size

    // a soft patch, fading in and out over its life
    const q = uv().sub(0.5).mul(2)
    const mask = float(1).sub(smoothstep(0.35, 1, q.length())).mul(smoothstep(0, 0.15, u)).mul(smoothstep(1, 0.55, u)).mul(k.x)
    // rising ripples, anchored to the screen so they stay fine-grained at any distance
    const aspect = screenSize.x.div(screenSize.y)
    const cell = screenUV.mul(vec2(aspect, 1)).mul(CELLS)
    const flow = this.time.mul(RISE * CELLS)
    const ripple = N(cell.add(vec2(k.y.mul(7.1), flow))).rg.sub(0.5)
      .add(N(cell.mul(2.3).add(vec2(flow.mul(-0.4), flow.mul(1.9)))).ba.sub(0.5).mul(0.6))
    const bend = size.div(max(positionView.z.negate(), 1)).mul(BEND)
    const offset = ripple.mul(bend).mul(mask).div(vec2(aspect, 1))
    m.colorNode = viewportSharedTexture(screenUV.add(offset)).rgb
    m.opacityNode = clamp(mask.mul(3), 0, 1)

    this.mesh = new Sprite(m)
    this.mesh.count = MAX
    this.mesh.frustumCulled = false
    // after every other effect: the shimmer bends what has been drawn behind it
    this.mesh.renderOrder = 4
    this.mesh.visible = false
  }

  emit(p: HazePatch, count = 1): void {
    const A0 = this.a0.array as Float32Array, A1 = this.a1.array as Float32Array, A2 = this.a2.array as Float32Array
    const start = this.cursor
    for (let n = 0; n < count; n++) {
      const i = this.cursor
      this.cursor = (this.cursor + 1) % MAX
      const j = p.jitter ?? 0
      const life = p.life[0] + (p.life[1] - p.life[0]) * Math.random()
      A0.set([p.at.x + (Math.random() - 0.5) * j, p.at.y + (Math.random() - 0.5) * j * 0.5, p.at.z + (Math.random() - 0.5) * j, this.clock], i * 4)
      A1.set([p.size[0], p.size[1], p.rise * (0.7 + 0.6 * Math.random()), life], i * 4)
      A2.set([p.strength, Math.random(), 0, 0], i * 4)
      this.liveUntil = Math.max(this.liveUntil, this.clock + life)
    }
    const n = Math.min(count, MAX)
    for (const a of [this.a0, this.a1, this.a2]) {
      if (start + n <= MAX) a.addUpdateRange(start * 4, n * 4)
      else {
        a.addUpdateRange(start * 4, (MAX - start) * 4)
        a.addUpdateRange(0, (start + n - MAX) * 4)
      }
      a.needsUpdate = true
    }
    this.mesh.visible = true
  }

  update(dt: number): void {
    this.clock += dt
    this.time.value = this.clock
    this.mesh.visible = this.clock < this.liveUntil
  }

  warm(on: boolean): void {
    this.mesh.visible = on || this.clock < this.liveUntil
  }
}
