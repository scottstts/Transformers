import { DoubleSide, InstancedBufferAttribute, InstancedMesh, Mesh, MeshBasicNodeMaterial, PlaneGeometry, Vector3, type Node, type PerspectiveCamera, type Scene } from 'three/webgpu'
import { abs, cameraPosition, color, cross, distance, exp, float, instancedBufferAttribute, max, mod, normalize, positionLocal, sin, smoothstep, time, uniform, uv, vec2, vec3 } from 'three/tsl'
import { N } from '../../rendering/noise.ts'
import { SAND_RADIANCE } from './atmosphere.ts'
import { DUNE_WIND, type DesertTerrain, type TerrainPad } from './terrain.ts'

/**
 * The wind made visible, two ways, both cheap:
 *
 * - Streamers: thin sheets of sand skating low over the ground downwind
 *   (saltation), a few dozen round the camera. They ride the landform, drift
 *   with the wind and wrap round a tile about the camera (faded out before
 *   its edge), and come and go with slow gusts. One instanced draw; all their
 *   motion is in the vertex stage.
 * - Dust devils: a couple of twisting columns of lifted sand out in the
 *   open, 120-400 m off, wandering downwind for half a minute before they
 *   die down and another rises elsewhere (never on the fortress's pad).
 *
 * Their sand is lit as the sunlit ground is (the atmosphere's sand
 * radiance), and the air hazes them with distance like everything else.
 */
const STREAMERS = 44
const TILE = 72
const STREAMER_SPEED: [number, number] = [3.5, 6]
const DEVILS = 2
const DEVIL_RANGE: [number, number] = [120, 400]
const DEVIL_LIFE: [number, number] = [26, 46]
const DEVIL_FADE = 6
/** a devil fades out within this range of the camera (m), and one that drifts closer dies down */
const DEVIL_NEAR: [number, number] = [45, 95]

const WIND = new Vector3(DUNE_WIND.x, 0, DUNE_WIND.z)

interface Devil {
  mesh: Mesh
  base: { value: Vector3 }
  size: { value: Vector3 }
  alpha: { value: number }
  age: number
  life: number
  drift: Vector3
}

export class DesertWind {
  private readonly terrain: DesertTerrain
  private readonly pads: readonly TerrainPad[]
  private readonly devils: Devil[] = []
  readonly streamers: InstancedMesh

  constructor(scene: Scene, terrain: DesertTerrain) {
    this.terrain = terrain
    this.pads = terrain.pads
    this.streamers = this.buildStreamers()
    scene.add(this.streamers)
    for (let i = 0; i < DEVILS; i++) {
      const devil = this.buildDevil()
      // raised on the first update (they need the camera); always drawn, their opacity does the fading,
      // so nothing is first built mid-game
      devil.age = Infinity
      this.devils.push(devil)
      scene.add(devil.mesh)
    }
  }

  private buildStreamers(): InstancedMesh {
    const g = new PlaneGeometry(1, 1, 8, 1)
    g.rotateX(-Math.PI / 2)
    // instance: tile position (x, z), length, width; phase, speed, lift
    const a = new Float32Array(STREAMERS * 4), b = new Float32Array(STREAMERS * 4)
    for (let i = 0; i < STREAMERS; i++) {
      a.set([Math.random() * TILE, Math.random() * TILE, 4 + Math.random() * 6, 0.35 + Math.random() * 0.8], i * 4)
      b.set([Math.random() * 100, STREAMER_SPEED[0] + Math.random() * (STREAMER_SPEED[1] - STREAMER_SPEED[0]), 0.04 + Math.random() * 0.12, 0], i * 4)
    }
    const shape = instancedBufferAttribute(new InstancedBufferAttribute(a, 4), 'vec4') as unknown as Node<'vec4'>
    const motion = instancedBufferAttribute(new InstancedBufferAttribute(b, 4), 'vec4') as unknown as Node<'vec4'>
    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide })
    const wind = vec2(WIND.x, WIND.z)
    const across = vec2(-WIND.z, WIND.x)
    // the sheet's anchor drifts downwind and wraps round the tile about the camera
    const drifted = shape.xy.add(wind.mul(time.mul(motion.y)))
    const anchor: Node<'vec2'> = mod(drifted.sub(cameraPosition.xz).add(TILE / 2), TILE).sub(TILE / 2).add(cameraPosition.xz)
    const along = positionLocal.x.mul(shape.z)
    const side = positionLocal.z.mul(shape.w)
    const xz: Node<'vec2'> = anchor.add(wind.mul(along)).add(across.mul(side))
    const lift = motion.z.mul(float(1).sub(abs(positionLocal.x).mul(1.6)))
    m.positionNode = vec3(xz.x, this.terrain.heightNode(xz).add(lift).add(0.03), xz.y)
    // grains skating faster than the sheet, in streaks across it; slow gusts over the whole field
    const u = uv()
    const streaks = N(vec2(u.x.mul(shape.z).mul(0.35).sub(time.mul(1.4)).add(motion.x), u.y.mul(3.2).add(motion.x.mul(0.37)))).r
    const gust = smoothstep(0.42, 0.72, N(vec2(time.mul(0.013).add(motion.x.mul(0.002)), 0.37)).g)
    const edges = sin(u.x.mul(Math.PI)).mul(float(1).sub(abs(u.y.sub(0.5)).mul(2)).pow(0.8))
    const near = float(1).sub(smoothstep(TILE * 0.3, TILE * 0.46, distance(anchor, cameraPosition.xz)))
    m.colorNode = color(SAND_RADIANCE).mul(1.08)
    m.opacityNode = smoothstep(0.35, 0.8, streaks).mul(edges).mul(gust).mul(near).mul(0.32)
    const mesh = new InstancedMesh(g, m, STREAMERS)
    mesh.frustumCulled = false
    mesh.renderOrder = 2
    return mesh
  }

  private buildDevil(): Devil {
    const g = new PlaneGeometry(1, 1, 1, 16)
    g.translate(0, 0.5, 0)
    const base = uniform(new Vector3())
    // width at the top, height (m), spin (turns per second)
    const size = uniform(new Vector3(8, 40, 0.6))
    const alpha = uniform(0)
    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide })
    // a cylindrical billboard: it turns about its own axis to face the camera
    const toCamera = cameraPosition.sub(base).mul(vec3(1, 0, 1))
    const right = normalize(cross(vec3(0, 1, 0), toCamera.add(vec3(1e-4, 0, 0))))
    m.positionNode = base.add(right.mul(positionLocal.x.mul(size.x))).add(vec3(0, positionLocal.y.mul(size.y), 0))
    const v = uv().y
    // the column sways as it rises, so it never reads as a straight band
    const sway = N(vec2(v.mul(0.9).sub(time.mul(0.05)), size.z.mul(3.7))).r.sub(0.5).mul(v).mul(0.35)
    const u = uv().x.sub(0.5).sub(sway)
    // a thin funnel flaring as it rises, a skirt of dust at its foot, its sand in ragged twisting bands
    const radius = float(0.06).add(v.pow(1.6).mul(0.26)).add(exp(v.mul(-40)).mul(0.14))
    const body = exp(u.div(radius).pow(2).mul(-2.5))
    const twist = N(vec2(u.div(radius).mul(0.3).add(time.mul(size.z)).add(v.mul(1.7)), v.mul(3.1).sub(time.mul(0.4)))).r
    const ragged = N(vec2(u.mul(2.3).add(time.mul(0.07)), v.mul(5.3))).g
    const column = body.mul(smoothstep(0.3, 0.8, twist).mul(0.8).add(0.2)).mul(smoothstep(0.2, 0.6, ragged).mul(0.6).add(0.4))
    // nothing at the quad's sides, the ground or the top
    const edges = float(1).sub(smoothstep(0.32, 0.48, abs(uv().x.sub(0.5))))
    const fade = smoothstep(0, 0.03, v).mul(float(1).sub(smoothstep(0.4, 1, v)))
    const near = smoothstep(DEVIL_NEAR[0], DEVIL_NEAR[1], distance(base.xz, cameraPosition.xz))
    // the sunlit sand, thickest and darkest in the skirt
    m.colorNode = color(SAND_RADIANCE).mul(max(float(0.8), float(1.1).sub(exp(v.mul(-30)).mul(0.3))))
    m.opacityNode = column.mul(edges).mul(fade).mul(near).mul(alpha).mul(float(0.42).sub(v.mul(0.26)))
    const mesh = new Mesh(g, m)
    mesh.frustumCulled = false
    mesh.renderOrder = 2
    return { mesh, base, size, alpha, age: 0, life: DEVIL_LIFE[0], drift: new Vector3() }
  }

  /** Move the dust devils (their sheets and streamers move on the GPU). */
  update(camera: PerspectiveCamera, dt: number): void {
    for (let i = 0; i < this.devils.length; i++) {
      const d = this.devils[i]
      if (d.age === Infinity) {
        this.spawn(d, camera)
        // the first is already up; the next rises later
        d.age = i === 0 ? DEVIL_FADE : -DEVIL_LIFE[0] * 0.6 * i
      }
      d.age += dt
      if (d.age >= d.life) this.spawn(d, camera)
      const b = d.base.value
      b.addScaledVector(d.drift, dt)
      b.y = this.terrain.height(b.x, b.z) - 0.3
      // one that has wandered up to the camera dies down
      if (Math.hypot(b.x - camera.position.x, b.z - camera.position.z) < DEVIL_NEAR[0] && d.age < d.life - DEVIL_FADE) d.age = d.life - DEVIL_FADE
      d.alpha.value = d.age < 0 ? 0 : Math.min(1, d.age / DEVIL_FADE, (d.life - d.age) / DEVIL_FADE)
    }
  }

  /** Raise a devil somewhere out in the open, off the pads. */
  private spawn(d: Devil, camera: PerspectiveCamera): void {
    for (let tries = 0; tries < 12; tries++) {
      // on the camera's downwind side: drifting downwind, it moves away, never through the camera
      const a = Math.atan2(WIND.z, WIND.x) + (Math.random() - 0.5) * Math.PI * 1.1
      const r = DEVIL_RANGE[0] + Math.random() * (DEVIL_RANGE[1] - DEVIL_RANGE[0])
      const x = camera.position.x + Math.cos(a) * r, z = camera.position.z + Math.sin(a) * r
      if (this.pads.some((p) => Math.hypot(x - p.x, z - p.z) < p.r1 + 40)) continue
      d.base.value.set(x, this.terrain.height(x, z), z)
      d.age = 0
      d.life = DEVIL_LIFE[0] + Math.random() * (DEVIL_LIFE[1] - DEVIL_LIFE[0])
      d.size.value.set(5 + Math.random() * 5, 26 + Math.random() * 30, (0.4 + Math.random() * 0.5) * (Math.random() < 0.5 ? -1 : 1))
      // downwind at a walking pace, meandering off the wind a little
      const turn = (Math.random() - 0.5) * 0.8
      d.drift.set(WIND.x * Math.cos(turn) - WIND.z * Math.sin(turn), 0, WIND.x * Math.sin(turn) + WIND.z * Math.cos(turn)).multiplyScalar(2.5 + Math.random() * 2.5)
      return
    }
    // nowhere open this time: try again shortly
    d.age = d.life - 1
  }
}
