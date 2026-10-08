import {
  AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedBufferGeometry,
  Mesh, MeshBasicNodeMaterial, PlaneGeometry, Vector3, type Node, type Object3D,
} from 'three/webgpu'
import {
  Fn, abs, atan, attribute, cameraPosition, clamp, cos, cross, dot, exp, float, fract, instancedBufferAttribute, length, max, mix,
  normalize, positionLocal, select, sin, smoothstep, uniform, uv, vec2, vec3,
} from 'three/tsl'
import { N } from '../../../../rendering/noise.ts'
import { FLAT_GROUND, type Ground } from '../../../../game/ground'
import type { TransformerModel } from '../../model/transformer'
import type { HeatHaze } from './haze'

/*
 * Every length is a share of the robot's height (H), so each robot's field
 * has the same proportions.
 */
/**
 * Where the flame envelope burns: each anchor is a point between two bones
 * (`t` of the way from the first to the second), with its sprite's width.
 * Together they wrap the whole body; each is drawn twice (a tight bright
 * layer and a wide slow one).
 */
const ANCHORS: readonly (readonly [string, string, number, number])[] = [
  ['head', 'head', 0, 0.22],
  ['chest', 'chest', 0, 0.5],
  ['pelvis', 'pelvis', 0, 0.42],
  ...(['R', 'L'] as const).flatMap((s) => [
    [`upperarm.${s}`, `forearm.${s}`, 0.5, 0.26],
    [`forearm.${s}`, `hand.${s}`, 0.5, 0.26],
    [`hand.${s}`, `hand.${s}`, 0, 0.18],
    [`thigh.${s}`, `shin.${s}`, 0.5, 0.3],
    [`shin.${s}`, `foot.${s}`, 0.5, 0.28],
    [`foot.${s}`, `foot.${s}`, 0, 0.2],
  ] as const),
]
/** The wide layer's size against the tight one's. */
const OUTER = 1.55
/** How far a flame sprite sits behind its anchor (share of its width): it burns round the outline, behind the armour. */
const BEHIND = 0.22
/**
 * The streams: currents of light spiralling up round the body. Start height,
 * climb, turns over it (sign: direction), radius, width, how fast the spiral
 * turns (turns/s).
 */
const STREAMS: readonly (readonly [number, number, number, number, number, number])[] = [
  [0.0, 0.78, 1.6, 0.36, 0.034, 0.22],
  [0.08, 0.72, -1.3, 0.4, 0.026, -0.17],
  [0.3, 0.62, 1.15, 0.33, 0.03, 0.28],
]
const STREAM_SEGMENTS = 128
/** The glow on the ground: its radius; it dies away as the body rises off it. */
const GROUND_RADIUS = 0.6
const GROUND_LIFT = 0.25
/** HDR levels of the hue (its largest channel at 1). */
const FLAME_GAIN = 1.7
const STREAM_GAIN = 2.4
const GROUND_GAIN = 1.1
const RAY_GAIN = 3.2
const STAR_GAIN = 6
/** Rays and stars: pool, births a second, lives (s), sizes. */
const MAX = 160
const RAY_RATE = 30
const STAR_RATE = 22
const RAY_LIFE: [number, number] = [0.5, 0.9]
const STAR_LIFE: [number, number] = [1.2, 2]
const RAY_WIDTH = 0.0022
const RAY_LENGTH: [number, number] = [0.03, 0.12]
const RAY_RISE = 0.32
const STAR_SIZE = 0.013
const STAR_RISE = 0.04
/** Hot air over the body: patches a second, their size (share of H), life (s) and strength. */
const HAZE_RATE = 4
const HAZE_SIZE: [number, number] = [0.3, 0.45]
const HAZE_LIFE: [number, number] = [0.7, 1.1]
const HAZE_STRENGTH = 0.3
/** Fade in and out (s); the surge as it lights; the field's heartbeat (s, the meter's). */
const FADE_IN = 0.45
const FADE_OUT = 0.3
const IGNITE = 0.8
const IGNITE_TIME = 0.6
const BEAT = 1.4

/**
 * The full meter's aura: an amorphous field of energy burning round the robot
 * in its special colour.
 *
 *   flames   a ragged envelope of rising energy round the whole body: soft
 *            sprites on the limbs, torso and head, each a blob of domain-
 *            warped noise flowing upward and eroding into tongues toward its
 *            top. They sit just behind their bones, so the armour in front
 *            hides them and the light spills out round the outline and
 *            through the gaps; a tight bright layer and a wide slow one.
 *   streams  three broken currents spiralling up round the body, tapering at
 *            both ends, filamented and torn by flowing noise, each fading in
 *            and out on its own cycle
 *   ground   a turbulent glow on the sand under the feet, flame streaks
 *            running out from it and a ripple sent out on each heartbeat
 *   sparks   thin rays shooting up and twinkling four-point stars
 *   haze     the air over it wavers (the fighter's heat haze)
 *
 * Four additive draws, depth-tested, all noise from the baked noise texture
 * (no per-fragment procedural noise). The flames' anchors upload 30 vec4s a
 * frame; rays and stars are stored once at birth and flown on the GPU.
 */
export class AuraFx {
  readonly object = new Group()
  /** the ground the field stands on */
  ground: Ground = FLAT_GROUND
  /** the hot air the field leaves over the body, if the fighter has one */
  haze: HeatHaze | null = null
  private readonly flames: Mesh
  private readonly streams: Mesh
  private readonly floor: Mesh
  private readonly sparks: Mesh
  private readonly time = uniform(0)
  private readonly gain = uniform(0)
  private readonly groundGain = uniform(0)
  /** the pelvis over the feet: x and z, and y where the feet would stand */
  private readonly center = uniform(new Vector3())
  private readonly groundAt = uniform(new Vector3())
  private readonly groundU = uniform(new Vector3(1, 0, 0))
  private readonly groundV = uniform(new Vector3(0, 0, -1))
  private readonly pelvis: Object3D
  private readonly chest: Object3D
  private readonly anchors: (readonly [Object3D, Object3D, number, number])[]
  private readonly anchorAt: InstancedBufferAttribute
  private readonly hip: number
  private readonly height: number
  private clock = 0
  private level = 0
  private ignite = 0
  private owed = 0
  private hazeOwed = 0
  private cursor = 0
  private liveUntil = -1
  private readonly a0: InstancedBufferAttribute
  private readonly a1: InstancedBufferAttribute

  constructor(model: TransformerModel, color: [number, number, number]) {
    this.pelvis = model.node('bone:pelvis')
    this.chest = model.node('bone:chest')
    this.hip = model.dims.hipZ
    const H = this.height = model.robotHeight
    this.anchors = ANCHORS.map(([a, b, t, size]) => [model.node(`bone:${a}`), model.node(`bone:${b}`), t, size * H] as const)
    const peak = Math.max(color[0], color[1], color[2], 1e-3)
    const hue = vec3(color[0] / peak, color[1] / peak, color[2] / peak)
    // the glow's body is the hue deepened (additive light over bright sand washes out); only its hottest cores whiten
    const deep = hue.mul(hue)
    const white = mix(hue, vec3(1), 0.6)
    const t = this.time
    const up = vec3(0, 1, 0)

    // ── flames ──
    const sprites = ANCHORS.length * 2
    const flameGeometry = quads(sprites)
    this.anchorAt = new InstancedBufferAttribute(new Float32Array(sprites * 4), 4)
    this.anchorAt.setUsage(DynamicDrawUsage)
    const seeds = new Float32Array(sprites * 4)
    for (let i = 0; i < sprites; i++) seeds.set([Math.random(), Math.random(), i % 2, 0], i * 4)
    const seedAttribute = new InstancedBufferAttribute(seeds, 4)
    flameGeometry.setAttribute('auraAnchor', this.anchorAt)
    flameGeometry.setAttribute('auraSeed', seedAttribute)
    const anchor = instancedBufferAttribute(this.anchorAt, 'vec4') as any
    const seed = instancedBufferAttribute(seedAttribute, 'vec4') as any
    const outer = float(seed.z)
    const flameMaterial = additive()
    flameMaterial.positionNode = Fn(() => {
      const c = vec3(anchor.xyz)
      const size = float(anchor.w).mul(mix(float(1), float(OUTER), outer))
      const view = normalize(c.sub(cameraPosition))
      const side = normalize(cross(view, up).add(vec3(1e-5, 0, 0)))
      const upright = cross(side, view)
      // behind the anchor, and raised: the flames lick up from it
      const middle = c.add(view.mul(size.mul(BEHIND))).add(up.mul(size.mul(0.2)))
      return middle.add(side.mul(positionLocal.x.mul(size))).add(upright.mul(positionLocal.y.mul(size).mul(1.5)))
    })()
    flameMaterial.colorNode = Fn(() => {
      const p = uv().mul(2).sub(1)
      const s = vec2(seed.x, seed.y)
      // the wide layer flows slower, in broader shapes
      const scale = mix(float(1), float(0.7), outer)
      const rate = mix(float(1), float(0.65), outer)
      const warpA = N(p.mul(vec2(0.18, 0.14)).mul(scale).add(s).add(vec2(0, t.mul(-0.21).mul(rate)))).r
      const warpB = N(p.mul(vec2(0.3, 0.22)).mul(scale).add(s.yx).add(vec2(0, t.mul(-0.33).mul(rate)))).a
      const detail = N(p.mul(vec2(0.32, 0.26)).mul(scale).add(s).add(vec2(warpA.sub(0.5).mul(0.35), warpB.sub(0.5).mul(0.3).sub(t.mul(0.42).mul(rate))))).g
      // a soft blob low in the sprite, eroded into tongues toward its top; it dies out before every edge
      // of the quad, so it never ends in a clipped line (below a hand or forearm the sprite's foot shows)
      const d = length(vec2(p.x, p.y.mul(0.8).add(0.25)))
      const blob = smoothstep(1, 0.2, d)
      const window = smoothstep(1, 0.6, abs(p.x)).mul(smoothstep(-1, -0.45, p.y)).mul(smoothstep(1, 0.7, p.y))
      const height = p.y.mul(0.5).add(0.5)
      const density = blob.mul(window).mul(detail.mul(1.25).add(0.15)).sub(height.mul(0.35))
      const flame = smoothstep(0.18, 0.55, density)
      const core = smoothstep(0.5, 0.82, density)
      const level = mix(float(1), float(0.45), outer)
      return deep.mul(flame.mul(0.6)).add(hue.mul(core.mul(0.8))).add(white.mul(core.mul(core).mul(0.25)))
        .mul(level).mul(FLAME_GAIN).mul(this.gain)
    })()
    this.flames = new Mesh(flameGeometry, flameMaterial)
    this.flames.name = 'aura-flames'

    // ── streams ──
    const stream = attribute('auraStream', 'vec4') as any
    const flow = attribute('auraFlow', 'vec4') as any
    const along = attribute('auraAlong', 'vec2') as any
    const sAlong = float(along.x)
    const across = float(along.y)
    const streamSeed = float(flow.z)
    const turns = float(stream.z)
    const spiral = (s: Node<'float'>): Node<'vec3'> => {
      const theta = streamSeed.mul(Math.PI * 2).add(s.mul(turns).mul(Math.PI * 2)).add(t.mul(float(flow.y)).mul(Math.PI * 2))
      const radius = float(float(stream.w).mul(float(1).sub(s.mul(0.22))).mul(sin(s.mul(9).add(t.mul(1.7)).add(streamSeed.mul(5))).mul(0.08).add(1)))
      const y = float(float(stream.x).add(float(stream.y).mul(s)).add(sin(s.mul(7).sub(t.mul(2)).add(streamSeed.mul(11))).mul(0.02 * H)))
      return vec3(vec3(cos(theta).mul(radius), y, sin(theta).mul(radius)).add(this.center))
    }
    const streamMaterial = additive()
    streamMaterial.side = DoubleSide
    streamMaterial.positionNode = Fn(() => {
      const p = spiral(sAlong)
      const tangent = normalize(spiral(float(sAlong.add(0.004))).sub(p))
      const view = normalize(p.sub(cameraPosition))
      const side = normalize(cross(tangent, view).add(vec3(1e-5, 0, 0)))
      const width = float(flow.x).mul(sin(sAlong.mul(Math.PI)).pow(0.6)).mul(sin(sAlong.mul(11).sub(t.mul(3)).add(streamSeed.mul(7))).mul(0.3).add(0.7))
      return p.add(side.mul(across.mul(width)))
    })()
    streamMaterial.colorNode = Fn(() => {
      const v = across
      const broken = smoothstep(0.38, 0.62, N(vec2(sAlong.mul(1.2).sub(t.mul(0.35)).add(streamSeed), streamSeed.mul(0.37))).r)
      const filaments = N(vec2(sAlong.mul(4).sub(t.mul(0.9)).add(streamSeed), v.mul(0.08).add(streamSeed))).g
      const profile = exp(v.mul(v).mul(-4)).mul(0.6).add(exp(v.mul(v).mul(-30)).mul(filaments))
      const ends = smoothstep(0, 0.12, sAlong).mul(smoothstep(1, 0.8, sAlong))
      // each stream comes and goes on its own slow cycle
      const cycle = sin(fract(t.mul(0.18).add(streamSeed)).mul(Math.PI)).pow(0.7)
      const strength = broken.mul(ends).mul(cycle)
      return mix(deep, hue, profile).mul(profile).mul(STREAM_GAIN).add(white.mul(exp(v.mul(v).mul(-60))).mul(0.4))
        .mul(strength).mul(this.gain)
    })()
    this.streams = new Mesh(streamStrips(H), streamMaterial)
    this.streams.name = 'aura-streams'

    // ── ground ──
    const floorMaterial = additive()
    floorMaterial.polygonOffset = true
    floorMaterial.polygonOffsetFactor = -2
    floorMaterial.polygonOffsetUnits = -2
    floorMaterial.positionNode = this.groundAt.add(this.groundU.mul(positionLocal.x.mul(GROUND_RADIUS * H))).add(this.groundV.mul(positionLocal.y.mul(GROUND_RADIUS * H)))
    floorMaterial.colorNode = Fn(() => {
      const q = uv().mul(2).sub(1)
      const r = length(q)
      const around = atan(q.y, q.x).div(Math.PI * 2)
      const warp = N(q.mul(0.25).add(vec2(t.mul(0.03), t.mul(-0.02)))).r
      const pool = exp(r.mul(r).mul(-4.5)).mul(warp.mul(0.6).add(0.4))
      // streaks of flame running out across the sand (three repeats round: the texture tiles, so the seam is whole)
      const streaks = smoothstep(0.5, 0.8, N(vec2(around.mul(3).add(warp.mul(0.2)), r.mul(0.35).sub(t.mul(0.12)))).g)
        .mul(smoothstep(0.15, 0.45, r)).mul(smoothstep(0.95, 0.6, r)).mul(0.6)
      // a ripple sent out on each heartbeat, torn by the same noise
      const beat = fract(t.div(BEAT))
      const front = beat.mul(0.75).add(0.2)
      const ripple = exp(r.sub(front).div(0.035).pow(2).negate()).mul(float(1).sub(beat).pow(2)).mul(warp.mul(0.8).add(0.2))
      const fade = float(1).sub(smoothstep(0.85, 1, r))
      return mix(deep, hue, ripple.add(pool.mul(0.5))).mul(pool.add(streaks).add(ripple)).mul(fade).mul(GROUND_GAIN).mul(this.groundGain)
    })()
    this.floor = new Mesh(new PlaneGeometry(2, 2), floorMaterial)
    this.floor.name = 'aura-ground'

    // ── rays and stars ──
    const sparkGeometry = quads(MAX)
    const make = (): InstancedBufferAttribute => {
      const b = new InstancedBufferAttribute(new Float32Array(MAX * 4), 4)
      b.setUsage(DynamicDrawUsage)
      return b
    }
    // a0: birth position, birth time; a1: life, kind (0 ray, 1 star), seed, unused
    this.a0 = make()
    this.a1 = make()
    for (let i = 0; i < MAX; i++) this.a0.array[i * 4 + 3] = 1e9
    const p0 = instancedBufferAttribute(this.a0, 'vec4') as any
    const k = instancedBufferAttribute(this.a1, 'vec4') as any
    const age = t.sub(float(p0.w))
    const life = float(k.x)
    const alive = age.greaterThanEqual(0).and(age.lessThan(life))
    const u = clamp(age.div(life), 0, 1)
    const star = float(k.y).greaterThan(0.5)
    const sparkSeed = float(k.z)
    const sparkMaterial = additive()
    const lifted = vec3(p0.xyz).add(vec3(0, select(star, float(STAR_RISE * H), float(RAY_RISE * H)).mul(max(age, 0)), 0))
    const view = normalize(lifted.sub(cameraPosition))
    const side = normalize(cross(view, up).add(vec3(1e-5, 0, 0)))
    const upright = normalize(cross(side, view))
    const twinkle = sin(t.mul(sparkSeed.mul(6).add(5)).add(sparkSeed.mul(60))).mul(0.5).add(0.5).pow(3)
    const starSize = float(STAR_SIZE * H).mul(twinkle.mul(0.6).add(0.4)).mul(smoothstep(0, 0.2, u)).mul(float(1).sub(smoothstep(0.7, 1, u)))
    const rayLength = mix(float(RAY_LENGTH[0] * H), float(RAY_LENGTH[1] * H), smoothstep(0, 0.4, u))
    const q = positionLocal
    sparkMaterial.positionNode = select(
      alive.and(this.gain.greaterThan(0.001)),
      select(star,
        lifted.add(side.mul(q.x.mul(starSize))).add(upright.mul(q.y.mul(starSize))),
        lifted.add(side.mul(q.x.mul(RAY_WIDTH * H))).add(up.mul(q.y.mul(rayLength)))),
      vec3(0, -1000, 0),
    )
    // what lies to the field's sides of the body shows in full; what lies before it less (the robot stays clear)
    const offset = vec3(p0.x, 0, p0.z).sub(vec3(this.center.x, 0, this.center.z))
    const flank = float(1).sub(abs(dot(normalize(offset.add(vec3(1e-4, 0, 0))), normalize(vec3(view.x, 0, view.z).add(vec3(1e-4, 0, 0))))))
    sparkMaterial.colorNode = Fn(() => {
      const p = uv().mul(2).sub(1)
      const ray = exp(p.x.mul(p.x).mul(-8)).mul(smoothstep(-1, -0.2, p.y)).mul(smoothstep(1, 0.4, p.y))
        .mul(smoothstep(0, 0.15, u)).mul(float(1).sub(u).pow(1.5))
      const r2 = dot(p, p)
      const glint = exp(r2.mul(-40)).add(exp(abs(p.x).mul(-14).sub(p.y.mul(p.y).mul(300)))).add(exp(abs(p.y).mul(-14).sub(p.x.mul(p.x).mul(300))))
      const color = select(star, white.mul(glint).mul(STAR_GAIN), mix(hue, white, ray.mul(0.4)).mul(ray).mul(RAY_GAIN))
      return color.mul(flank.mul(0.6).add(0.4)).mul(this.gain)
    })()
    this.sparks = new Mesh(sparkGeometry, sparkMaterial)
    this.sparks.name = 'aura-sparks'

    for (const mesh of [this.flames, this.streams, this.floor, this.sparks]) {
      mesh.frustumCulled = false
      mesh.renderOrder = 3
      mesh.visible = false
      this.object.add(mesh)
    }
  }

  /**
   * After the frame's pose: `on` while the meter is full and the robot stands
   * outside a cutscene; `cut` drops it at once (a special has spent it).
   */
  update(on: boolean, dt: number, cut: boolean): void {
    if (cut) this.level = 0
    else if (dt > 0) {
      const was = this.level
      this.level = on ? Math.min(1, this.level + dt / FADE_IN) : Math.max(0, this.level - dt / FADE_OUT)
      if (on && was === 0) this.ignite = IGNITE_TIME
    }
    if (dt > 0) {
      this.clock += dt
      this.time.value = this.clock
      this.ignite = Math.max(0, this.ignite - dt)
    }
    const breath = 0.88 + 0.12 * Math.sin((this.clock * Math.PI * 2) / BEAT)
    this.gain.value = this.level * breath * (1 + IGNITE * (this.ignite / IGNITE_TIME))
    const shown = this.gain.value > 0.001
    if (shown) this.place()
    if (this.level > 0 && dt > 0) {
      this.owed += dt * this.level * (RAY_RATE + STAR_RATE)
      const births = Math.min(Math.floor(this.owed), 32)
      this.owed -= Math.floor(this.owed)
      if (births > 0) this.emit(births, dt)
      this.breathe(dt)
    } else if (this.level === 0) this.owed = this.hazeOwed = 0
    this.flames.visible = this.streams.visible = this.floor.visible = shown
    this.sparks.visible = shown && this.clock < this.liveUntil
  }

  reset(): void {
    this.level = this.ignite = this.owed = this.hazeOwed = 0
    this.gain.value = this.groundGain.value = 0
    this.liveUntil = -1
    for (const mesh of [this.flames, this.streams, this.floor, this.sparks]) mesh.visible = false
  }

  /** Drawn for the boot and first-switch covers (each draw builds whether or not anything is lit). */
  warm(on: boolean): void {
    if (on) {
      this.gain.value = this.groundGain.value = 1
      this.place()
    } else this.gain.value = this.groundGain.value = this.level
    const shown = on || this.level > 0.001
    this.flames.visible = this.streams.visible = this.floor.visible = shown
    this.sparks.visible = on || (shown && this.clock < this.liveUntil)
  }

  /** The field on the body this frame: its flames' anchors, its centre over the feet, the ground's plane under it. */
  private place(): void {
    const H = this.height
    const at = this.anchorAt.array as Float32Array
    for (let i = 0; i < this.anchors.length; i++) {
      const [a, b, t, size] = this.anchors[i]
      _p.setFromMatrixPosition(a.matrixWorld)
      if (t > 0) _p.lerp(_q.setFromMatrixPosition(b.matrixWorld), t)
      // both layers of an anchor
      for (let layer = 0; layer < 2; layer++) {
        const o = (i * 2 + layer) * 4
        at[o] = _p.x; at[o + 1] = _p.y; at[o + 2] = _p.z; at[o + 3] = size
      }
    }
    this.anchorAt.needsUpdate = true
    _p.setFromMatrixPosition(this.pelvis.matrixWorld)
    const ground = this.ground.height(_p.x, _p.z)
    this.center.value.set(_p.x, Math.max(ground, _p.y - this.hip), _p.z)
    // the ground's slope from four samples
    const r = GROUND_RADIUS * H * 0.7
    const gx = (this.ground.height(_p.x + r, _p.z) - this.ground.height(_p.x - r, _p.z)) / (2 * r)
    const gz = (this.ground.height(_p.x, _p.z + r) - this.ground.height(_p.x, _p.z - r)) / (2 * r)
    _n.set(-gx, 1, -gz).normalize()
    this.groundU.value.set(1, gx, 0).normalize()
    this.groundV.value.crossVectors(_n, this.groundU.value)
    this.groundAt.value.set(_p.x, ground + 0.03, _p.z)
    const lift = this.center.value.y - ground
    this.groundGain.value = this.gain.value * Math.max(0, 1 - lift / (GROUND_LIFT * H))
  }

  /** Hot air rising off the chest and shoulders. */
  private breathe(dt: number): void {
    if (!this.haze) return
    this.hazeOwed += dt * this.level * HAZE_RATE
    if (this.hazeOwed < 1) return
    this.hazeOwed -= 1
    const H = this.height
    _p.setFromMatrixPosition(this.chest.matrixWorld)
    this.haze.emit({ at: _p, jitter: 0.25 * H, size: [HAZE_SIZE[0] * H, HAZE_SIZE[1] * H], rise: 0.12 * H, life: HAZE_LIFE, strength: HAZE_STRENGTH })
  }

  private emit(count: number, dt: number): void {
    const H = this.height
    const a0 = this.a0.array as Float32Array
    const a1 = this.a1.array as Float32Array
    const c = this.center.value
    const start = this.cursor
    const starShare = STAR_RATE / (RAY_RATE + STAR_RATE)
    for (let b = 0; b < count; b++) {
      const i = this.cursor
      this.cursor = (this.cursor + 1) % MAX
      const star = Math.random() < starShare
      const theta = Math.random() * Math.PI * 2
      // rays leave the body's outline, stars hang anywhere in the field
      const radius = H * (star ? 0.08 + Math.random() * 0.38 : 0.12 + Math.random() * 0.24)
      const height = H * (star ? 0.05 + Math.random() * 0.95 : 0.15 + Math.random() * 0.75)
      const range = star ? STAR_LIFE : RAY_LIFE
      const life = range[0] + (range[1] - range[0]) * Math.random()
      const born = this.clock - Math.random() * dt
      a0[i * 4] = c.x + Math.cos(theta) * radius
      a0[i * 4 + 1] = c.y + height
      a0[i * 4 + 2] = c.z + Math.sin(theta) * radius
      a0[i * 4 + 3] = born
      a1[i * 4] = life
      a1[i * 4 + 1] = star ? 1 : 0
      a1[i * 4 + 2] = Math.random()
      this.liveUntil = Math.max(this.liveUntil, born + life)
    }
    for (const a of [this.a0, this.a1]) {
      if (start + count <= MAX) a.addUpdateRange(start * 4, count * 4)
      else {
        a.addUpdateRange(start * 4, (MAX - start) * 4)
        a.addUpdateRange(0, (start + count - MAX) * 4)
      }
      a.needsUpdate = true
    }
  }
}

function additive(): MeshBasicNodeMaterial {
  return new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false })
}

/** `count` instances of a unit quad (-0.5..0.5, uv 0..1). */
function quads(count: number): InstancedBufferGeometry {
  const quad = new PlaneGeometry(1, 1)
  const geometry = new InstancedBufferGeometry()
  geometry.index = quad.index
  geometry.setAttribute('position', quad.getAttribute('position'))
  geometry.setAttribute('uv', quad.getAttribute('uv'))
  geometry.instanceCount = count
  return geometry
}

/** The streams as strips, each vertex carrying its stream's numbers (lengths scaled by H) and its place along and across. */
function streamStrips(H: number): BufferGeometry {
  const n = STREAMS.length * (STREAM_SEGMENTS + 1) * 2
  const stream = new Float32Array(n * 4)
  const flow = new Float32Array(n * 4)
  const along = new Float32Array(n * 2)
  const index: number[] = []
  let v = 0
  STREAMS.forEach(([start, climb, turns, radius, width, speed], k) => {
    const seed = (k * 0.618) % 1
    for (let s = 0; s <= STREAM_SEGMENTS; s++) {
      for (let side = 0; side < 2; side++) {
        stream.set([start * H, climb * H, turns, radius * H], v * 4)
        flow.set([width * H, speed, seed, 0], v * 4)
        along.set([s / STREAM_SEGMENTS, side * 2 - 1], v * 2)
        v++
      }
      if (s < STREAM_SEGMENTS) {
        const o = v - 2
        index.push(o, o + 1, o + 2, o + 1, o + 3, o + 2)
      }
    }
  })
  return new BufferGeometry()
    .setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3))
    .setAttribute('auraStream', new BufferAttribute(stream, 4))
    .setAttribute('auraFlow', new BufferAttribute(flow, 4))
    .setAttribute('auraAlong', new BufferAttribute(along, 2))
    .setIndex(index)
}

const _p = new Vector3()
const _q = new Vector3()
const _n = new Vector3()
