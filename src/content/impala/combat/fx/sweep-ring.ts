import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicNodeMaterial, Vector3 } from 'three/webgpu'
import { clamp, cos, exp, float, max, mix, positionLocal, pow, select, sin, smoothstep, uniform, vec3 } from 'three/tsl'

/** Divisions round the circle. */
const SEGMENTS = 256

/**
 * A full-circle cut's light: the swing that goes all the way round leaves a
 * thick crescent of the Impala's crimson light at the blade's height, swept
 * out round the robot in the swing's direction in a split second, then
 * rolling outward with the blow and burning out. The same light as the
 * blade arcs (blade-arcs.ts): a white-hot line along the point's path over
 * a broad crimson body that is eaten from the inside toward that line as it
 * ages, so the circle thins behind the sweep's head.
 *
 * A flat annulus of SEGMENTS divisions, drawn by uniforms (one sweep at a
 * time: the finale's), evaluated from the sweep's start, so nothing uploads.
 * Each point of the circle is born as the sweep passes it; until then it
 * collapses out of sight.
 */
export class SweepRing {
  readonly mesh: Mesh
  private readonly time = uniform(0)
  private readonly centre = uniform(new Vector3())
  /** inner and outer radius at birth (m), how far it rolls out over its life (m) */
  private readonly radii = uniform(new Vector3(1, 6, 4))
  /** the start bearing (rad, the game's yaw convention: (sin, cos) on x, z), the sweep's sense (-1 clockwise seen from above), birth (s) */
  private readonly start = uniform(new Vector3())
  /** how long the sweep takes round the circle (s), each point's life (s), strength */
  private readonly timing = uniform(new Vector3(0.12, 0.45, 1))
  private clock = 0
  private liveUntil = -1

  constructor() {
    // (angle share 0..1 round the circle, 0 inner .. 1 outer) per vertex
    const verts = new Float32Array((SEGMENTS + 1) * 2 * 3)
    const index: number[] = []
    for (let i = 0; i <= SEGMENTS; i++) {
      const u = i / SEGMENTS
      verts.set([u, 0, 0, u, 1, 0], i * 6)
      if (i < SEGMENTS) index.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3)
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(verts, 3))
    geometry.setIndex(index)

    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false })
    const along = positionLocal.x, across = positionLocal.y
    const sweep = this.timing.x, life = this.timing.y, strength = this.timing.z
    // each point born as the sweep passes it
    const age = this.time.sub(this.start.z.add(sweep.mul(along)))
    const u = clamp(age.div(life), 0, 1)
    const alive = age.greaterThanEqual(0).and(age.lessThan(life))
    const bearing = this.start.x.add(this.start.y.mul(along).mul(Math.PI * 2))
    const out = float(1).sub(pow(float(1).sub(u), 2.2))
    const radius = mix(this.radii.x, this.radii.y, across).add(this.radii.z.mul(out))
    m.positionNode = select(alive, this.centre.add(vec3(sin(bearing).mul(radius), 0, cos(bearing).mul(radius))), vec3(0, -1000, 0))
    // the body eaten from the inside toward the point's line as it ages; the line itself white-hot
    const inner = pow(u, 0.75).mul(0.8)
    const body = smoothstep(inner, inner.add(0.25), across).mul(smoothstep(1, 0.94, across))
    const line = exp(across.sub(0.93).div(0.04).pow(2).negate())
    const toward = pow(across, 1.5)
    // the sweep's head burns brightest
    const head = exp(age.div(sweep.mul(0.6).add(0.02)).negate()).mul(1.5).add(1)
    const fade = pow(max(float(1).sub(u), 0), 1.4)
    const hot = mix(vec3(1.0, 0.06, 0.05), vec3(1.0, 0.5, 0.42), toward)
    const glow = hot.mul(body.mul(toward.mul(2.2).add(0.35))).add(vec3(1.0, 0.72, 0.66).mul(line.mul(7)))
    m.colorNode = select(alive, glow.mul(fade).mul(head).mul(strength), vec3(0))
    this.mesh = new Mesh(geometry, m)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 3
    this.mesh.visible = false
  }

  /**
   * A full circle swept round `at` (world, at the blade's height) from the
   * bearing `from` (rad, yaw convention) in `sense` (-1 clockwise seen from
   * above), the band from `inner` to `outer` m, rolling out `roll` m, the
   * sweep taking `sweep` s and each point lasting `life` s.
   */
  emit(at: Vector3, from: number, sense: number, inner: number, outer: number, roll: number, sweep: number, life: number, strength = 1): void {
    this.centre.value.copy(at)
    this.radii.value.set(inner, outer, roll)
    this.start.value.set(from, sense, this.clock)
    this.timing.value.set(sweep, life, strength)
    this.liveUntil = this.clock + sweep + life
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
