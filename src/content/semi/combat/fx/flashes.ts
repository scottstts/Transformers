import { AdditiveBlending, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, PlaneGeometry, Sprite, SpriteNodeMaterial, Vector3 } from 'three/webgpu'
import { Fn, atan, cameraPosition, clamp, cos, cross, exp, float, instancedBufferAttribute, max, mix, normalize, positionLocal, pow, select, smoothstep, uniform, uv, vec2, vec3 } from 'three/tsl'
import { N } from '../../../../rendering/noise.ts'

/** Pool sizes: flashes overwrite the oldest. */
const PLUMES = 48
const STARS = 48

/** A muzzle flash: where, which way, how big and what burns in it. */
export interface MuzzleFlash {
  at: Vector3
  /** the bore's direction (unit) */
  dir: Vector3
  /** plume length and the star's diameter (m) */
  length: number
  size: number
  /** seconds it lives (a round's flash is gone in a few hundredths) */
  life: number
  /** 0 propellant (white-yellow core, orange edge), 1 the coils' discharge (white-violet) */
  palette: number
}

/**
 * Muzzle flashes: the burning gas thrown out of a bore as a round leaves it.
 * Each flash is two parts, both drawn additively in HDR so bloom carries them:
 *
 *   plume  a ragged tongue of flame along the bore, billboarded about its
 *          axis (seen from the side it is long; along the bore, short)
 *   star   the bright core at the muzzle with its prongs of flame (the gas
 *          venting through the brake), facing the camera
 *
 * Both are stored once at birth and evaluated on the GPU; a flash lives a
 * few hundredths of a second and cools from white through yellow to a dull
 * orange as it goes (or from white through violet for the coils'
 * discharge). Hidden while none lives.
 */
export class MuzzleFlashes {
  readonly plumes: Mesh
  readonly stars: Sprite
  private readonly time = uniform(0)
  private clock = 0
  private liveUntil = -1
  private plumeCursor = 0
  private starCursor = 0
  private readonly p: InstancedBufferAttribute[]
  private readonly s: InstancedBufferAttribute[]

  constructor() {
    const make = (n: number): InstancedBufferAttribute => {
      const a = new InstancedBufferAttribute(new Float32Array(n * 4), 4)
      a.setUsage(DynamicDrawUsage)
      return a
    }
    this.p = [make(PLUMES), make(PLUMES), make(PLUMES)]
    this.s = [make(STARS), make(STARS)]
    for (let i = 0; i < PLUMES; i++) this.p[0].array[i * 4 + 3] = 1e9
    for (let i = 0; i < STARS; i++) this.s[0].array[i * 4 + 3] = 1e9

    // plume: position + birth, axis + life, length, width, palette, seed
    const quad = new PlaneGeometry(1, 1)
    const geometry = new InstancedBufferGeometry()
    geometry.index = quad.index
    geometry.setAttribute('position', quad.getAttribute('position'))
    geometry.setAttribute('uv', quad.getAttribute('uv'))
    geometry.instanceCount = PLUMES
    const [p0, p1, p2] = this.p.map((a) => instancedBufferAttribute(a, 'vec4') as any)
    const pm = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false })
    const age = this.time.sub(p0.w)
    const u = clamp(age.div(p1.w), 0, 1)
    const alive = age.greaterThanEqual(0).and(age.lessThan(p1.w))
    const axis = normalize(p1.xyz) as any
    const grow = float(0.55).add(smoothstep(0, 0.35, u).mul(0.45))
    const centre = p0.xyz.add(axis.mul(p2.x.mul(grow).mul(0.5)))
    // Plane local x/y span side/axis: their cross must point toward the camera.
    const side = normalize(cross(centre.sub(cameraPosition), axis).add(vec3(1e-5, 0, 0)))
    const q = positionLocal
    pm.positionNode = select(alive, centre.add(axis.mul(q.y.mul(p2.x).mul(grow))).add(side.mul(q.x.mul(p2.y).mul(grow))), vec3(0, -1000, 0))
    pm.colorNode = Fn(() => {
      const along = uv().y
      const across = uv().x.sub(0.5).mul(2)
      // ragged: the flame's edge wanders with noise along it, fresh each flash
      const n = N(vec2(along.mul(2.3).add(p2.w.mul(17.1)), across.mul(0.7).add(p2.w.mul(5.3)))).r
      const width = mix(float(0.55), float(0.12), pow(along, 0.8)).mul(n.mul(0.9).add(0.55))
      const body = smoothstep(width, width.mul(0.25), across.abs()).mul(smoothstep(0, 0.06, along)).mul(smoothstep(1, 0.55, along.add(n.sub(0.5).mul(0.35))))
      const heat = float(1).sub(u).pow(1.4).mul(float(1).sub(along.mul(0.6)))
      return tint(heat, p2.z).mul(body)
    })()
    this.plumes = new Mesh(geometry, pm)
    this.plumes.frustumCulled = false
    this.plumes.renderOrder = 3
    this.plumes.visible = false

    // star: position + birth, size, life, palette, seed
    const [s0, s1] = this.s.map((a) => instancedBufferAttribute(a, 'vec4') as any)
    const sm = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false })
    const sAge = this.time.sub(s0.w)
    const su = clamp(sAge.div(s1.y), 0, 1)
    const sAlive = sAge.greaterThanEqual(0).and(sAge.lessThan(s1.y))
    sm.positionNode = select(sAlive, s0.xyz, vec3(0, -1000, 0))
    sm.scaleNode = s1.x.mul(float(0.7).add(smoothstep(0, 0.3, su).mul(0.3)))
    sm.rotationNode = s1.w.mul(6.283)
    sm.colorNode = Fn(() => {
      const d = uv().sub(0.5).mul(2)
      const r = d.length()
      const a = atan(d.y, d.x)
      // prongs: five to seven tongues of flame, uneven in length
      const prongs = pow(cos(a.mul(float(5).add(s1.w.mul(2.99).floor())).add(s1.w.mul(11))).mul(0.5).add(0.5), 6)
      const reach = N(vec2(a.mul(0.9).add(s1.w.mul(31)), s1.w.mul(7))).g.mul(0.6).add(0.4)
      const core = exp(r.mul(r).mul(-26))
      const tongue = prongs.mul(exp(r.div(max(reach, 0.05)).mul(-3.2))).mul(smoothstep(1, 0.7, r))
      const heat = float(1).sub(su).pow(1.6)
      return tint(heat.mul(0.6).add(0.4), s1.z).mul(core.mul(2.2).add(tongue).mul(heat))
    })()
    this.stars = new Sprite(sm)
    this.stars.count = STARS
    this.stars.frustumCulled = false
    this.stars.renderOrder = 3
    this.stars.visible = false
  }

  emit(f: MuzzleFlash): void {
    const [P0, P1, P2] = this.p.map((a) => a.array as Float32Array)
    const i = this.plumeCursor
    this.plumeCursor = (i + 1) % PLUMES
    P0.set([f.at.x, f.at.y, f.at.z, this.clock], i * 4)
    P1.set([f.dir.x, f.dir.y, f.dir.z, f.life], i * 4)
    P2.set([f.length * (0.8 + 0.4 * Math.random()), f.size * 0.5, f.palette, Math.random()], i * 4)
    for (const a of this.p) {
      a.addUpdateRange(i * 4, 4)
      a.needsUpdate = true
    }
    const [S0, S1] = this.s.map((a) => a.array as Float32Array)
    const k = this.starCursor
    this.starCursor = (k + 1) % STARS
    S0.set([f.at.x + f.dir.x * f.size * 0.15, f.at.y + f.dir.y * f.size * 0.15, f.at.z + f.dir.z * f.size * 0.15, this.clock], k * 4)
    S1.set([f.size * (0.85 + 0.3 * Math.random()), f.life * 0.8, f.palette, Math.random()], k * 4)
    for (const a of this.s) {
      a.addUpdateRange(k * 4, 4)
      a.needsUpdate = true
    }
    this.liveUntil = Math.max(this.liveUntil, this.clock + f.life)
    this.plumes.visible = this.stars.visible = true
  }

  update(dt: number): void {
    this.clock += dt
    this.time.value = this.clock
    this.plumes.visible = this.stars.visible = this.clock < this.liveUntil
  }

  warm(on: boolean): void {
    this.plumes.visible = this.stars.visible = on || this.clock < this.liveUntil
  }
}

/** Flash colour (linear HDR) at a temperature share `heat` (1 hottest): propellant, or the coils' discharge. */
function tint(heat: any, palette: any): any {
  const h = clamp(heat, 0, 1)
  const fire = mix(vec3(1.4, 0.32, 0.05), vec3(5.5, 4.2, 2.4), h.mul(h)).mul(mix(float(0.6), float(3.2), h))
  const arc = mix(vec3(0.9, 0.35, 2.6), vec3(4.4, 4.2, 6.2), h.mul(h)).mul(mix(float(0.6), float(3), h))
  return mix(fire, arc, palette)
}
