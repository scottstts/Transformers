import { DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, PlaneGeometry } from 'three/webgpu'
import { abs, cameraPosition, clamp, cross, float, fract, fwidth, instancedBufferAttribute, length, max, mix, normalize, positionLocal, smoothstep, uv, vec3 } from 'three/tsl'

/** A bar's size in the world (m) up to REF m from the camera; beyond, it keeps the size on screen it had there. */
const WIDTH = 1.3
const HEIGHT = 0.17
const REF = 24
/** The plate's lean (share of its width over its height, as the energy meter's cells lean). */
const SKEW = 0.07
/** The channel the fill runs in, inside the plate (uv). */
const CH = { u0: 0.045, u1: 0.955, v0: 0.27, v1: 0.73 }

/**
 * Health bars over the soldiers' heads: one instanced draw of camera-facing
 * quads, each a small dark glass plate leaning like the energy meter's
 * cells, with a channel inside it. The channel's fill is the health left;
 * behind it a pale chip trails the last blows (it holds a moment, then
 * drains to the fill), so every hit reads as a bite out of the bar; faint
 * ticks mark its quarters; a blow flashes the fill. Everything is shaped in
 * the fragment stage from the quad's uv and filtered by its screen
 * footprint, so bars stay crisp at any distance. Only the used prefix of
 * the two per-bar attributes is uploaded.
 */
export class HealthBars {
  readonly mesh: Mesh
  private readonly geometry: InstancedBufferGeometry
  /** anchor (x, y, z) and opacity; health, chip, flash */
  private readonly a0: InstancedBufferAttribute
  private readonly a1: InstancedBufferAttribute
  private readonly capacity: number
  private count = 0

  constructor(capacity: number) {
    this.capacity = capacity
    const quad = new PlaneGeometry(1, 1)
    const geometry = new InstancedBufferGeometry()
    geometry.index = quad.index
    geometry.setAttribute('position', quad.getAttribute('position'))
    geometry.setAttribute('uv', quad.getAttribute('uv'))
    geometry.instanceCount = 0
    this.geometry = geometry
    const make = (): InstancedBufferAttribute => {
      const a = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4)
      a.setUsage(DynamicDrawUsage)
      return a
    }
    this.a0 = make()
    this.a1 = make()
    const p0 = instancedBufferAttribute(this.a0, 'vec4') as any
    const s0 = instancedBufferAttribute(this.a1, 'vec4') as any

    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: DoubleSide })
    // billboard: the camera's right and up at the anchor, scaled to hold its screen size beyond REF
    const centre = p0.xyz
    const toCam = cameraPosition.sub(centre)
    const dist = max(length(toCam), 0.01)
    const fwd = toCam.div(dist)
    const right = normalize(cross(vec3(0, 1, 0), fwd))
    const up = cross(fwd, right)
    const k = max(float(1), dist.div(REF))
    m.positionNode = centre.add(right.mul(positionLocal.x.mul(WIDTH).mul(k))).add(up.mul(positionLocal.y.mul(HEIGHT).mul(k)))

    const health = s0.x, chip = s0.y, flash = s0.z
    const t = uv()
    const u = t.x.sub(t.y.sub(0.5).mul(SKEW))
    const v = t.y
    const fu = max(fwidth(u), 1e-5), fv = max(fwidth(v), 1e-5)
    const inside = (lo: number, hi: number, x: any, f: any): any => smoothstep(0, f, x.sub(lo)).mul(smoothstep(0, f, float(hi).sub(x)))
    const plate = inside(SKEW / 2, 1 - SKEW / 2, u, fu)
    const channel = inside(CH.u0, CH.u1, u, fu).mul(inside(CH.v0, CH.v1, v, fv))
    // along the channel 0..1, its filtered edge
    const x = clamp(u.sub(CH.u0).div(CH.u1 - CH.u0), 0, 1)
    const e = fu.div(CH.u1 - CH.u0)
    const filled = smoothstep(x.sub(e), x.add(e), health)
    const trailing = max(smoothstep(x.sub(e), x.add(e), chip).sub(filled), 0)
    const tick = float(1).sub(smoothstep(e.mul(0.6), e.mul(1.6), abs(fract(x.mul(4).add(0.5)).sub(0.5)).div(4)))
    const gloss = v.sub(CH.v0).div(CH.v1 - CH.v0)
    const fill = mix(vec3(0.5, 0.05, 0.03), vec3(0.92, 0.26, 0.1), gloss).add(flash.mul(0.55))
    const inner = mix(vec3(0.05, 0.018, 0.016), fill, filled).add(vec3(0.9, 0.72, 0.52).mul(trailing)).mul(float(1).sub(tick.mul(0.35)))
    m.colorNode = mix(vec3(0.012, 0.012, 0.015), inner, channel)
    m.opacityNode = plate.mul(mix(float(0.55), float(0.96), channel)).mul(p0.w)

    this.mesh = new Mesh(geometry, m)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 5
    this.mesh.castShadow = false
    this.mesh.receiveShadow = false
    this.mesh.visible = false
  }

  /** Start this frame's bars. */
  begin(): void {
    this.count = 0
  }

  /** A bar anchored at (x, y, z), `fade` 0..1; health and chip 0..1, flash 0..1. */
  add(x: number, y: number, z: number, fade: number, health: number, chip: number, flash: number): void {
    if (this.count >= this.capacity) return
    const i = this.count++ * 4
    const a0 = this.a0.array as Float32Array
    const a1 = this.a1.array as Float32Array
    a0[i] = x; a0[i + 1] = y; a0[i + 2] = z; a0[i + 3] = fade
    a1[i] = health; a1[i + 1] = chip; a1[i + 2] = flash
  }

  /** Upload what was added and draw it. */
  end(): void {
    const n = this.count
    this.geometry.instanceCount = n
    this.mesh.visible = n > 0
    if (!n) return
    for (const a of [this.a0, this.a1]) {
      a.clearUpdateRanges()
      a.addUpdateRange(0, n * 4)
      a.needsUpdate = true
    }
  }

  /** Show one bar for a shader compile, or hide them again. */
  warm(on: boolean): void {
    this.begin()
    if (on) this.add(0, -1000, 0, 1, 0.6, 0.8, 0)
    this.end()
  }
}
