import { AdditiveBlending, BufferAttribute, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, Vector3, type Node } from 'three/webgpu'
import { clamp, cos, exp, float, instancedBufferAttribute, mix, positionGeometry, pow, select, sin, smoothstep, uniform, vec2, vec3 } from 'three/tsl'
import { N } from '../../../../rendering/noise.ts'

/** Rings at once (the oldest is overwritten), and the band's divisions round its circumference. */
const RINGS = 4
const SEGMENTS = 192

/**
 * A burst going out through the air along the ground: a band of white
 * energy round the robot, its foot on the sand, expanding fast and slowing
 * as it spreads (eased out over its life). Its leading edge burns white with
 * the Roadster's cold-white light; behind it the band is torn into streaks
 * round the circumference and thins, lower and fainter as it goes. One
 * instanced additive draw of open bands evaluated from birth data (centre,
 * birth, start radius, reach, life, height): an emit uploads only its slot.
 */
export class BurstRing {
  readonly mesh: Mesh
  private readonly time = uniform(0)
  private clock = 0
  private cursor = 0
  private liveUntil = -1
  private readonly a0: InstancedBufferAttribute
  private readonly a1: InstancedBufferAttribute

  constructor() {
    const geometry = new InstancedBufferGeometry()
    const verts = new Float32Array((SEGMENTS + 1) * 2 * 3)
    const index: number[] = []
    for (let i = 0; i <= SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2
      verts.set([a, 0, 0, a, 1, 0], i * 6)
      if (i < SEGMENTS) index.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3)
    }
    geometry.setAttribute('position', new BufferAttribute(verts, 3))
    geometry.setIndex(index)
    geometry.instanceCount = RINGS
    const make = (): InstancedBufferAttribute => {
      const a = new InstancedBufferAttribute(new Float32Array(RINGS * 4), 4)
      a.setUsage(DynamicDrawUsage)
      return a
    }
    this.a0 = make()
    this.a1 = make()
    for (let i = 0; i < RINGS; i++) this.a0.array[i * 4 + 3] = 1e9
    // a0: centre on the ground, birth; a1: start radius, reach, life, height
    const c = instancedBufferAttribute(this.a0, 'vec4') as any
    const r = instancedBufferAttribute(this.a1, 'vec4') as any
    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false })
    const age = this.time.sub(c.w) as Node<'float'>
    const life = r.z as Node<'float'>
    const u = clamp(age.div(life), 0, 1)
    const alive = age.greaterThanEqual(0).and(age.lessThan(life))
    const out = float(1).sub(pow(float(1).sub(u), 2.6))
    const radius = (r.x as Node<'float'>).add((r.y as Node<'float'>).sub(r.x as Node<'float'>).mul(out))
    const height = (r.w as Node<'float'>).mul(mix(float(1), float(0.4), u))
    const angle = positionGeometry.x as Node<'float'>, up = positionGeometry.y as Node<'float'>
    // the band leans out at its top, as a blast front does rolling over the ground
    const lean = up.mul(height).mul(0.35)
    m.positionNode = select(alive, vec3((c.x as Node<'float'>).add(cos(angle).mul(radius.add(lean))), (c.y as Node<'float'>).add(up.mul(height)), (c.z as Node<'float'>).add(sin(angle).mul(radius.add(lean)))), vec3(0, -1000, 0))
    // the hot line low on the band, its light falling off upward; the body torn round the circumference
    const line = exp(up.sub(0.18).div(0.08).pow(2).negate())
    const body = exp(up.sub(0.3).div(0.32).pow(2).negate())
    const streaks = N(vec2(angle.mul(9.5), age.mul(0.8).add(c.w as Node<'float'>))).r
    const torn = smoothstep(u.mul(0.85), u.mul(0.85).add(0.25), streaks)
    const fade = pow(float(1).sub(u), 1.5)
    const hot = mix(vec3(0.55, 0.72, 1.0), vec3(1.0, 1.0, 1.0), line)
    m.colorNode = select(alive, hot.mul(line.mul(5).add(body.mul(1.1).mul(torn))).mul(fade), vec3(0))
    this.mesh = new Mesh(geometry, m)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 3
    this.mesh.visible = false
  }

  /** A burst from `at` (world, on the ground), growing from `from` to `reach` m over `life` s, `height` m tall. */
  emit(at: Vector3, from: number, reach: number, life: number, height: number): void {
    const i = this.cursor
    this.cursor = (this.cursor + 1) % RINGS
    const a0 = this.a0.array as Float32Array, a1 = this.a1.array as Float32Array
    a0[i * 4] = at.x; a0[i * 4 + 1] = at.y; a0[i * 4 + 2] = at.z; a0[i * 4 + 3] = this.clock
    a1[i * 4] = from; a1[i * 4 + 1] = reach; a1[i * 4 + 2] = life; a1[i * 4 + 3] = height
    for (const a of [this.a0, this.a1]) {
      a.addUpdateRange(i * 4, 4)
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
