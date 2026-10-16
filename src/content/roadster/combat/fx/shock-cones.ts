import { BufferAttribute, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, Vector3, type Node } from 'three/webgpu'
import { cameraViewMatrix, clamp, cos, cross, exp, float, instancedBufferAttribute, max, mix, normalize, positionGeometry, positionView, pow, screenSize, screenUV, select, sin, smoothstep, uniform, varying, vec2, vec3, vec4, viewportSharedTexture } from 'three/tsl'
import { N } from '../../../../rendering/noise.ts'

/** Cones alive at once (the oldest is overwritten) and the band's divisions round and across. */
const CONES = 8
const ROUND = 48
const ACROSS = 6
/** Refraction at full strength: screen heights of offset per metre of band over metres of distance. */
const BEND = 0.035

/**
 * A palm cannon's shock: the cone of shocked air the blast drives out ahead
 * of the palm, racing away and slowing as it spreads. It is air, so it is
 * mostly seen by what it does to the light behind it (the frame drawn so far,
 * read through the band's own normal: the background bulges and ripples
 * across its front), with a faint white skin of condensation where the
 * pressure drop is sharpest, gone in a quarter second.
 *
 * Each cone is a band just behind the front of a cone opening from the palm
 * along the blast (seen from the side it reads as a shell, from behind as a
 * ring going out), placed on the GPU from its birth data: one instanced draw,
 * an emit uploads only its own slot. Drawn last with the other refractions
 * (render order 4) and depth tested: only what lies behind it bends.
 */
export class ShockCones {
  readonly mesh: Mesh
  private readonly time = uniform(0)
  private clock = 0
  private cursor = 0
  private liveUntil = -1
  private readonly a: InstancedBufferAttribute[]
  private readonly A: Float32Array[]

  constructor() {
    const geometry = new InstancedBufferGeometry()
    const verts = new Float32Array((ROUND + 1) * (ACROSS + 1) * 3)
    const index: number[] = []
    for (let j = 0; j <= ACROSS; j++) {
      for (let i = 0; i <= ROUND; i++) verts.set([(i / ROUND) * Math.PI * 2, j / ACROSS, 0], (j * (ROUND + 1) + i) * 3)
    }
    for (let j = 0; j < ACROSS; j++) {
      for (let i = 0; i < ROUND; i++) {
        const a = j * (ROUND + 1) + i, b = a + ROUND + 1
        index.push(a, a + 1, b, a + 1, b + 1, b)
      }
    }
    geometry.setAttribute('position', new BufferAttribute(verts, 3))
    geometry.setIndex(index)
    geometry.instanceCount = CONES
    this.a = [0, 1, 2].map(() => {
      const a = new InstancedBufferAttribute(new Float32Array(CONES * 4), 4)
      a.setUsage(DynamicDrawUsage)
      return a
    })
    this.A = this.a.map((a) => a.array as Float32Array)
    for (let i = 0; i < CONES; i++) this.A[0][i * 4 + 3] = 1e9
    // a0: origin, birth; a1: axis, life; a2: reach (m), half angle (rad), start radius (m), strength
    const [a0, a1, a2] = this.a.map((a) => instancedBufferAttribute(a, 'vec4') as any)

    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, fog: false })
    const age = this.time.sub(a0.w)
    const life = a1.w as Node<'float'>
    const alive = age.greaterThanEqual(0).and(age.lessThan(life))
    const t = clamp(age.div(life), 0, 1)
    // fast off the palm, slowing as it spreads
    const out = float(1).sub(pow(float(1).sub(t), 2.4))
    const front = (a2.x as Node<'float'>).mul(out).add(0.25)
    const back = front.mul(0.7)
    const angle = positionGeometry.x as Node<'float'>, v = positionGeometry.y as Node<'float'>
    const axis = a1.xyz as Node<'vec3'>
    const helper = select(axis.y.abs().greaterThan(0.9), vec3(1, 0, 0), vec3(0, 1, 0))
    const side = normalize(cross(axis, helper))
    const bin = cross(axis, side)
    const radial = side.mul(cos(angle)).add(bin.mul(sin(angle)))
    const along = mix(back, front, v)
    const radius = (a2.z as Node<'float'>).add(along.mul((a2.y as Node<'float'>).tan()))
    const placed = (a0.xyz as Node<'vec3'>).add(axis.mul(along)).add(radial.mul(radius))
    m.positionNode = select(alive, placed, vec3(0, -1000, 0))
    // the cone's outward normal, in view space, for the direction the light is bent
    const normal = varying(normalize(radial.sub(axis.mul((a2.y as Node<'float'>).tan()))), 'vShockNormal') as unknown as Node<'vec3'>
    const across = varying(v, 'vShockAcross') as unknown as Node<'float'>
    const seed = varying(angle, 'vShockAngle') as unknown as Node<'float'>
    const fade = pow(float(1).sub(t), 1.6).mul(a2.w as Node<'float'>)
    // sharpest at the front, falling off behind it
    const profile = exp(across.sub(0.82).div(0.16).pow(2).negate())
    const slope = across.sub(0.82).div(0.16).mul(profile)
    const ripple = N(vec2(seed.mul(1.6), age.mul(3).add(across))).r.sub(0.5)
    const n = cameraViewMatrix.mul(vec4(normal, 0)).xy
    const aspect = screenSize.x.div(screenSize.y)
    const bend = float(BEND).div(max(positionView.z.negate(), 1)).mul(fade)
    const offset = n.mul(slope.add(ripple.mul(0.6))).mul(bend).div(vec2(aspect, 1))
    const behind = viewportSharedTexture(screenUV.add(offset)).rgb
    // the condensation skin: a faint white veil, torn by the noise
    const veil = profile.mul(smoothstep(0.35, 0.75, ripple.add(0.5))).mul(fade).mul(0.22)
    m.colorNode = mix(behind, vec3(1.0, 1.02, 1.05), veil)
    m.opacityNode = clamp(profile.mul(3).mul(fade.min(1)), 0, 1)
    this.mesh = new Mesh(geometry, m)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 4
    this.mesh.visible = false
  }

  /** A cone from `at` along `axis` (unit), reaching `reach` m in `life` s, opening at `halfAngle` (rad) from `radius` m; `strength` 0..1+. */
  emit(at: Vector3, axis: Vector3, reach: number, halfAngle: number, radius: number, life: number, strength: number): void {
    const i = this.cursor
    this.cursor = (this.cursor + 1) % CONES
    const [A0, A1, A2] = this.A
    const o = i * 4
    A0[o] = at.x; A0[o + 1] = at.y; A0[o + 2] = at.z; A0[o + 3] = this.clock
    A1[o] = axis.x; A1[o + 1] = axis.y; A1[o + 2] = axis.z; A1[o + 3] = life
    A2[o] = reach; A2[o + 1] = halfAngle; A2[o + 2] = radius; A2[o + 3] = strength
    for (const a of this.a) {
      a.addUpdateRange(o, 4)
      a.needsUpdate = true
    }
    this.liveUntil = Math.max(this.liveUntil, this.clock + life)
    this.mesh.visible = true
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
}
