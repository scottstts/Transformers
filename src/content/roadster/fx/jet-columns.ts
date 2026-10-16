import { BufferAttribute, CustomBlending, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, OneFactor, OneMinusSrcAlphaFactor, Vector3, type Node } from 'three/webgpu'
import { abs, cameraPosition, clamp, cos, cross, dot, float, instancedBufferAttribute, max, mix, normalize, positionGeometry, pow, select, sin, smoothstep, uniform, varying, vec2, vec3 } from 'three/tsl'
import { N } from '../../../rendering/noise.ts'

/** Columns drawn at once: the four lift jets and the pack's eight outlets. */
export const COLUMN_SLOTS = 12
/** Divisions round and along each column. */
const RADIAL = 20
const AXIAL = 28

/** One column this frame (world). */
export interface ColumnState {
  /** the outlet's centre and the jet's axis (unit) */
  exit: Vector3
  axis: Vector3
  /** visible length (m): to the ground where it strikes it */
  length: number
  /** radius at the outlet and at the column's far end (m) */
  r0: number
  r1: number
  /** 0..1 throttle: how dense and how fast the condensate runs */
  power: number
  /** density scale of this kind of outlet (a fan's downwash is thinner than a nozzle's jet) */
  density: number
}

/**
 * The visible core of a compressed-air jet: the condensate column that
 * forms a hand's width below the outlet (the air expanding out of the
 * nozzle cools below its dew point), widens as it mixes and streams away
 * along the jet in turbulent streaks, thinning toward its end, white where
 * the sky lights it and grey in its own shade, and never glowing.
 *
 * Each column is an open cone round its axis whose vertices are placed on
 * the GPU from four vec4s per instance (outlet, axis, a side direction,
 * radii, throttle), so all twelve outlets are one draw and a frame uploads
 * only those 192 floats. Its opacity is the path length through a round
 * column seen from the camera (the cone's normal against the view), so its
 * silhouette is soft without a volume march.
 */
export class JetColumns {
  readonly mesh: Mesh
  private readonly time = uniform(0)
  private readonly a: InstancedBufferAttribute[]
  private readonly A: Float32Array[]
  private live = 0

  constructor() {
    const geometry = new InstancedBufferGeometry()
    const verts = new Float32Array((RADIAL + 1) * (AXIAL + 1) * 3)
    const index: number[] = []
    for (let j = 0; j <= AXIAL; j++) {
      // rings closer near the outlet, where the column forms
      const s = (j / AXIAL) ** 1.35
      for (let i = 0; i <= RADIAL; i++) verts.set([(i / RADIAL) * Math.PI * 2, s, 0], (j * (RADIAL + 1) + i) * 3)
    }
    for (let j = 0; j < AXIAL; j++) {
      for (let i = 0; i < RADIAL; i++) {
        const a = j * (RADIAL + 1) + i, b = a + RADIAL + 1
        index.push(a, a + 1, b, a + 1, b + 1, b)
      }
    }
    geometry.setAttribute('position', new BufferAttribute(verts, 3))
    geometry.setIndex(index)
    geometry.instanceCount = COLUMN_SLOTS
    this.a = [0, 1, 2, 3].map(() => {
      const a = new InstancedBufferAttribute(new Float32Array(COLUMN_SLOTS * 4), 4)
      a.setUsage(DynamicDrawUsage)
      return a
    })
    this.A = this.a.map((a) => a.array as Float32Array)
    // a0: outlet, length; a1: axis, power; a2: side, r0; a3: r1, seed, density
    const [a0, a1, a2, a3] = this.a.map((a) => instancedBufferAttribute(a, 'vec4') as any)

    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false })
    m.blending = CustomBlending
    m.blendSrc = OneFactor
    m.blendDst = OneMinusSrcAlphaFactor
    m.blendSrcAlpha = OneFactor
    m.blendDstAlpha = OneMinusSrcAlphaFactor

    const angle = positionGeometry.x as Node<'float'>, s = positionGeometry.y as Node<'float'>
    const axis = a1.xyz, side = a2.xyz
    const bin = cross(axis, side)
    const spread = pow(s, 0.7)
    const radius = a2.w.add(a3.x.sub(a2.w).mul(spread))
    const radial = side.mul(cos(angle)).add(bin.mul(sin(angle)))
    const placed = a0.xyz.add(axis.mul(s.mul(a0.w))).add(radial.mul(radius))
    const on = a1.w.greaterThan(0.002)
    m.positionNode = select(on, placed, vec3(0, -1000, 0))
    // the cone's normal leans back against its widening
    const slope = a3.x.sub(a2.w).div(max(a0.w, 0.1))
    const normal = varying(normalize(radial.sub(axis.mul(slope))), 'vJetNormal') as unknown as Node<'vec3'>
    const world = varying(placed, 'vJetWorld') as unknown as Node<'vec3'>
    const along = varying(s, 'vJetAlong') as unknown as Node<'float'>

    const view = normalize(cameraPosition.sub(world))
    const facing = abs(dot(normal, view))
    // path length through a round column: thickest down its middle, nothing at its silhouette
    const through = pow(facing, 0.75)
    const power = a1.w as Node<'float'>
    // streaks running down the jet, faster at full throttle
    const flow = this.time.mul(mix(float(3), float(9), power))
    const metres = along.mul(a0.w as Node<'float'>)
    const around = angle.mul(0.477).add((a3.y as Node<'float'>).mul(7.3))
    const n1 = N(vec2(around, metres.mul(0.42).sub(flow.mul(0.42)))).r
    const n2 = N(vec2(around.mul(2.3).add(0.5), metres.mul(1.1).sub(flow.mul(1.1)))).g
    const churn = n1.mul(0.65).add(n2.mul(0.35))
    // clear for a hand's width under the outlet, then dense, thinning as it mixes toward the end
    const forms = smoothstep(0.012, 0.09, along)
    const thins = pow(float(1).sub(along), 1.3)
    const torn = smoothstep(0.2, 0.62, churn.add(through.mul(0.35)).sub(along.mul(0.2)))
    const density = a3.z.mul(power.mul(0.7).add(0.3)).mul(forms).mul(thins).mul(torn).mul(churn.mul(0.9).add(0.45))
    const alpha = clamp(density.mul(through).mul(1.15), 0, 0.92)
    // lit like the cloud it becomes: the sky-facing side white, the underside and its depths a cool grey
    const sky = clamp(normal.y.mul(0.5).add(0.5).add(churn.sub(0.5).mul(0.4)), 0, 1)
    const lit = mix(vec3(0.52, 0.57, 0.64), vec3(1.04, 1.03, 1.02), sky).mul(mix(float(0.92), float(1.04), through))
    m.colorNode = lit.mul(alpha)
    m.opacityNode = alpha

    this.mesh = new Mesh(geometry, m)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 2.55
    this.mesh.visible = false
    for (let k = 0; k < COLUMN_SLOTS; k++) this.A[3][k * 4 + 1] = Math.random()
  }

  /** Lay slot `k` this frame (power 0 hides it). */
  set(k: number, c: ColumnState): void {
    const [A0, A1, A2, A3] = this.A
    const o = k * 4
    A0[o] = c.exit.x; A0[o + 1] = c.exit.y; A0[o + 2] = c.exit.z; A0[o + 3] = Math.max(0.05, c.length)
    A1[o] = c.axis.x; A1[o + 1] = c.axis.y; A1[o + 2] = c.axis.z; A1[o + 3] = c.power
    // a side direction square to the axis (any: the column is round)
    _s.set(0, 1, 0)
    if (Math.abs(c.axis.y) > 0.9) _s.set(1, 0, 0)
    _s.crossVectors(c.axis, _s).normalize()
    A2[o] = _s.x; A2[o + 1] = _s.y; A2[o + 2] = _s.z; A2[o + 3] = c.r0
    A3[o] = c.r1; A3[o + 2] = c.density
    if (c.power > 0.002) this.live++
  }

  /** Slot `k` off this frame. */
  clear(k: number): void {
    this.A[1][k * 4 + 3] = 0
  }

  /** After the frame's slots are laid: upload them and show the draw only while a column burns. */
  commit(dt: number): void {
    this.time.value += dt
    const shown = this.live > 0
    // nothing to upload while every column is off and was already off
    if (shown || this.mesh.visible) {
      for (const a of this.a) {
        a.addUpdateRange(0, COLUMN_SLOTS * 4)
        a.needsUpdate = true
      }
    }
    this.mesh.visible = shown
    this.live = 0
  }

  warm(on: boolean): void {
    if (on) this.mesh.visible = true
  }
}

const _s = new Vector3()
