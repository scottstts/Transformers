import {
  AdditiveBlending, BufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, StorageBufferAttribute,
  Vector3, type BufferGeometry, type Node,
} from 'three/webgpu'
import {
  Fn, abs, attribute, cameraPosition, clamp, dot, float, instanceIndex, mix, normalGeometry, normalLocal, normalWorld, normalize,
  positionGeometry, positionWorld, pow, select, smoothstep, storage, uniform, varying, vec3, vec4,
} from 'three/tsl'
import type { TransformerModel } from '../../../transformer/model/transformer'

/** Afterimages alive at once (the oldest is overwritten). */
export const GHOSTS = 16
/** Each afterimage's life (s) and how far its smear reaches back along its motion (s of travel). */
const LIFE = 0.42
const SMEAR = 0.075
/** The body is drawn again at this coarser grain (m): the cells of a vertex-clustering decimation. */
const CELL = 0.07
/** HDR level of an afterimage's edge at full strength. */
const GAIN = 2.6

/**
 * A speedster's afterimages (the Quicksilver look): copies of the body left
 * behind where it was a moment ago, glowing at their edges in the Roadster's
 * cold white and dying away in under half a second, each smeared back along
 * the way it was going. They are captured at a steady rate, so how far apart
 * they stand is how fast it runs: overlapping into one smear as it sets off,
 * strung out round the ring as distinct copies at full speed.
 *
 * The body is drawn again from a coarse copy of every rigid part (a
 * vertex-clustering decimation in each part's own frame, built at load: the
 * full body is 0.9 M triangles, the copy a few tens of thousands). One
 * instanced additive draw: each instance reads its pose (every part's world
 * matrix at its capture) and its birth, strength and velocity from storage,
 * so a capture uploads only its own slot. Some vertices are pulled back
 * along the motion by a per-vertex share of the smear, which tears the copy
 * into streaks behind it.
 */
export class Afterimages {
  readonly mesh: Mesh
  private readonly parts: Array<{ matrixWorld: { elements: ArrayLike<number> } }> = []
  private readonly rows: StorageBufferAttribute
  private readonly ghosts: StorageBufferAttribute
  private readonly time = uniform(0)
  private clock = 0
  private cursor = 0
  private liveUntil = -1

  constructor(model: TransformerModel, color: readonly [number, number, number]) {
    const meshes: Mesh[] = []
    // the body as it is seen: the cabin folded away inside the tub would only glow through the copies
    model.root.traverse((child) => { if ((child as Mesh).isMesh && child.parent?.name !== 'asm:cabin') meshes.push(child as Mesh) })
    const P = meshes.length
    this.parts = meshes
    const geometry = decimate(meshes)
    this.rows = new StorageBufferAttribute(new Float32Array(GHOSTS * P * 12), 4)
    this.ghosts = new StorageBufferAttribute(new Float32Array(GHOSTS * 8), 4)
    const G = this.ghosts.array as Float32Array
    for (let g = 0; g < GHOSTS; g++) G[g * 8] = 1e9
    const rows = storage(this.rows, 'vec4', this.rows.count).toReadOnly()
    const ghosts = storage(this.ghosts, 'vec4', this.ghosts.count).toReadOnly()

    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false })
    const part = attribute('ghostPart', 'float').toUint()
    const seed = attribute('ghostSeed', 'float') as Node<'float'>
    const head = ghosts.element(instanceIndex.mul(2))
    const motion = ghosts.element(instanceIndex.mul(2).add(1)).xyz
    const age = this.time.sub(head.x)
    const u = clamp(age.div(LIFE), 0, 1)
    const alive = age.greaterThanEqual(0).and(age.lessThan(LIFE)).and(head.y.greaterThan(0.001))
    const row = instanceIndex.mul(P).add(part).mul(3)
    m.positionNode = Fn(() => {
      const p = vec4(positionGeometry, 1)
      const r0 = rows.element(row), r1 = rows.element(row.add(1)), r2 = rows.element(row.add(2))
      const world = vec3(r0.dot(p), r1.dot(p), r2.dot(p))
      const n = normalGeometry
      // the mesh stands at the origin: its local normal is the posed part's world normal
      normalLocal.assign(normalize(vec3(r0.xyz.dot(n), r1.xyz.dot(n), r2.xyz.dot(n))))
      // torn into streaks: a share of the vertices pulled back along the way it was going
      const pull = pow(seed, float(3)).mul(SMEAR).mul(u.mul(0.6).add(0.4))
      return select(alive, world.sub(motion.mul(pull)), vec3(0, -1000, 0))
    })()
    const along = varying(seed, 'vGhostSeed') as unknown as Node<'float'>
    const view = normalize(cameraPosition.sub(positionWorld))
    const rim = float(1).sub(abs(dot(normalize(normalWorld), view)))
    const body = float(0.16).add(pow(rim, float(2)).mul(1.3))
    // born inside the live body: it comes up over a few hundredths of a second, then dies away
    const fade = smoothstep(0, 0.12, u).mul(pow(float(1).sub(u), float(1.8))).mul(head.y)
    const streak = float(1).sub(pow(along, float(3)).mul(0.6))
    const tint = mix(vec3(...color), vec3(1, 1, 1), pow(rim, float(3)))
    m.colorNode = tint.mul(body).mul(streak).mul(fade).mul(GAIN)
    this.mesh = new Mesh(geometry, m)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 3.1
    this.mesh.visible = false
  }

  /** Leave an afterimage of the body as it is posed now (after model.pose): `strength` 0..1, its velocity (world, m/s). */
  capture(strength: number, velocity: Vector3): void {
    const g = this.cursor
    this.cursor = (this.cursor + 1) % GHOSTS
    const P = this.parts.length
    const data = this.rows.array as Float32Array
    for (let i = 0; i < P; i++) {
      const e = this.parts[i].matrixWorld.elements
      const o = (g * P + i) * 12
      for (let r = 0; r < 3; r++) {
        data[o + r * 4] = e[r]; data[o + r * 4 + 1] = e[r + 4]; data[o + r * 4 + 2] = e[r + 8]; data[o + r * 4 + 3] = e[r + 12]
      }
    }
    const G = this.ghosts.array as Float32Array
    G[g * 8] = this.clock
    G[g * 8 + 1] = strength
    G[g * 8 + 4] = velocity.x; G[g * 8 + 5] = velocity.y; G[g * 8 + 6] = velocity.z
    this.rows.addUpdateRange(g * P * 12, P * 12)
    this.rows.needsUpdate = true
    this.ghosts.addUpdateRange(g * 8, 8)
    this.ghosts.needsUpdate = true
    this.liveUntil = this.clock + LIFE
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
    const G = this.ghosts.array as Float32Array
    for (let g = 0; g < GHOSTS; g++) G[g * 8] = 1e9
    this.ghosts.needsUpdate = true
  }

  warm(on: boolean): void {
    this.mesh.visible = on || this.clock < this.liveUntil
  }
}

/**
 * Every part's geometry clustered onto a CELL grid in its own frame (vertices
 * in a cell merged at their mean, their normals averaged, triangles that
 * collapse dropped), merged into one instanced geometry that names each
 * vertex's part (`ghostPart`) and gives it a random share of the smear
 * (`ghostSeed`).
 */
function decimate(meshes: readonly Mesh[]): InstancedBufferGeometry {
  const pos: number[] = [], nor: number[] = [], ids: number[] = [], seeds: number[] = [], index: number[] = []
  const cells = new Map<number, number>()
  let rnd = 0x9e3779b9
  const random = (): number => {
    rnd ^= rnd << 13; rnd ^= rnd >>> 17; rnd ^= rnd << 5
    return (rnd >>> 0) / 4294967296
  }
  for (let part = 0; part < meshes.length; part++) {
    const g: BufferGeometry = meshes[part].geometry
    const p = g.getAttribute('morphPosition') ?? g.getAttribute('position')
    const n = g.getAttribute('morphNormal') ?? g.getAttribute('normal')
    cells.clear()
    const base = ids.length
    const remap = new Int32Array(p.count)
    const sums: number[] = []
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
      const key = (Math.floor(x / CELL) + 512) + (Math.floor(y / CELL) + 512) * 1024 + (Math.floor(z / CELL) + 512) * 1048576
      let v = cells.get(key)
      if (v === undefined) {
        v = cells.size
        cells.set(key, v)
        sums.push(0, 0, 0, 0, 0, 0, 0)
      }
      const s = v * 7
      sums[s] += x; sums[s + 1] += y; sums[s + 2] += z
      sums[s + 3] += n.getX(i); sums[s + 4] += n.getY(i); sums[s + 5] += n.getZ(i)
      sums[s + 6]++
      remap[i] = v
    }
    const source = g.index
    const count = source ? source.count : p.count
    let kept = 0
    const tris: number[] = []
    for (let t = 0; t + 2 < count; t += 3) {
      const a = remap[source ? source.getX(t) : t], b = remap[source ? source.getX(t + 1) : t + 1], c = remap[source ? source.getX(t + 2) : t + 2]
      if (a === b || b === c || a === c) continue
      tris.push(base + a, base + b, base + c)
      kept++
    }
    if (!kept) continue
    for (let v = 0; v < cells.size; v++) {
      const s = v * 7, k = sums[s + 6]
      pos.push(sums[s] / k, sums[s + 1] / k, sums[s + 2] / k)
      const l = Math.hypot(sums[s + 3], sums[s + 4], sums[s + 5]) || 1
      nor.push(sums[s + 3] / l, sums[s + 4] / l, sums[s + 5] / l)
      ids.push(part)
      seeds.push(random())
    }
    for (const t of tris) index.push(t)
  }
  const geometry = new InstancedBufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3))
  geometry.setAttribute('ghostPart', new BufferAttribute(new Float32Array(ids), 1))
  geometry.setAttribute('ghostSeed', new BufferAttribute(new Float32Array(seeds), 1))
  geometry.setIndex(new BufferAttribute(new Uint32Array(index), 1))
  geometry.instanceCount = GHOSTS
  return geometry
}

/** Where the decimated copy's size can be read (tests, benches). */
export function ghostTriangles(mesh: Mesh): number {
  return (mesh.geometry.index?.count ?? 0) / 3
}
