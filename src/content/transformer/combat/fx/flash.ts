import {
  AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, Group, Matrix3, Mesh,
  MeshBasicNodeMaterial, StorageBufferAttribute, Vector3, type Object3D,
} from 'three/webgpu'
import {
  Fn, abs, attribute, dot, float, fwidth, mix, normalGeometry, normalLocal, normalView, normalize,
  positionGeometry, positionPrevious, positionView, positionWorld, sin, smoothstep, storage, uniform, vec3, vec4,
} from 'three/tsl'
import type { TransformerModel } from '../../model/transformer'

/** Perceptual roles: a brief body corona and narrow wakes that survive without bloom. */
const SHELL_OFFSET = 0.012
const SHELL_GAIN = 2.4
const WAKE_GAIN = 4
const WAKE_LIFE = 0.14
const RESIDUE = 0.10
const SAMPLES = 16
const ANCHORS = ['head', 'chest', 'pelvis', 'hand.R', 'hand.L', 'foot.R', 'foot.L'] as const

/**
 * Two pooled draws: the actual rig's merged surface, posed in the vertex
 * stage by its rigid-part matrices, and crossed ribbons from seven body
 * anchors. No cloned material per part, particles, lights, or allocations
 * during a burst. Every part shares one event envelope and direction.
 */
export class FlashFx {
  readonly object = new Group()
  readonly shell: Mesh
  readonly wake: Mesh
  private readonly parts: Mesh[] = []
  private readonly anchors: Object3D[]
  private readonly rows: StorageBufferAttribute
  private readonly previous: StorageBufferAttribute
  private readonly level = uniform(0)
  private readonly clock = uniform(0)
  private readonly direction = uniform(new Vector3(0, 0, 1))
  private readonly debug = uniform(0)
  private readonly position: BufferAttribute
  private readonly fade: BufferAttribute
  private readonly points = new Float32Array(ANCHORS.length * SAMPLES * 3)
  private readonly ages = new Float32Array(SAMPLES).fill(99)
  private readonly width: number
  private cursor = -1
  private active = false
  private landing = false
  private remaining = 0
  private primed = false

  constructor(model: TransformerModel, color: [number, number, number]) {
    // Only body meshes, captured before a weapon is attached to the hands.
    model.root.traverse((child) => { if ((child as Mesh).isMesh) this.parts.push(child as Mesh) })
    this.anchors = ANCHORS.map((name) => model.node(`bone:${name}`))
    this.width = model.robotHeight * 0.012
    this.rows = new StorageBufferAttribute(new Float32Array(this.parts.length * 24), 4)
    this.previous = new StorageBufferAttribute(new Float32Array(this.parts.length * 24), 4)
    const rows = storage(this.rows, 'vec4', this.rows.count).toReadOnly()
    const previous = storage(this.previous, 'vec4', this.previous.count).toReadOnly()
    const row = attribute('flashPart', 'float').toUint().mul(6)
    const material = additive()
    material.positionNode = Fn(() => {
      const p = vec4(positionGeometry, 1)
      const n = normalGeometry
      const normal = normalize(vec3(rows.element(row.add(3)).xyz.dot(n), rows.element(row.add(4)).xyz.dot(n), rows.element(row.add(5)).xyz.dot(n)))
      normalLocal.assign(normal)
      positionPrevious.assign(vec3(previous.element(row).dot(p), previous.element(row.add(1)).dot(p), previous.element(row.add(2)).dot(p)))
      return vec3(rows.element(row).dot(p), rows.element(row.add(1)).dot(p), rows.element(row.add(2)).dot(p)).add(normal.mul(SHELL_OFFSET))
    })()
    const rim = float(1).sub(abs(dot(normalize(normalView), normalize(positionView.negate())))).pow(4)
    const phase = dot(positionWorld, this.direction).mul(8).sub(this.clock.mul(90))
    const bands = mix(float(0.5), sin(phase).mul(0.5).add(0.5), float(1).sub(smoothstep(0.4, 1.2, fwidth(phase))))
    const energy = rim.mul(float(0.5).add(bands.mul(0.5)))
    material.colorNode = this.debug.equal(1).select(vec3(energy), vec3(...color).mul(SHELL_GAIN).mul(energy).add(vec3(0.24, 0.3, 0.36).mul(energy.pow(4))))
    material.opacityNode = this.level
    material.maskNode = this.level.greaterThan(0.001)
    this.shell = new Mesh(mergeBody(this.parts), material)
    this.shell.name = 'flash-body-corona'

    const geometry = new BufferGeometry()
    const vertices = ANCHORS.length * 2 * SAMPLES * 2
    this.position = new BufferAttribute(new Float32Array(vertices * 3), 3).setUsage(DynamicDrawUsage)
    this.fade = new BufferAttribute(new Float32Array(vertices * 2), 2).setUsage(DynamicDrawUsage)
    geometry.setAttribute('position', this.position)
    geometry.setAttribute('flashFade', this.fade)
    const indices: number[] = []
    for (let ribbon = 0; ribbon < ANCHORS.length * 2; ribbon++) {
      for (let i = 0; i < SAMPLES - 1; i++) {
        const a = (ribbon * SAMPLES + i) * 2
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    }
    geometry.setIndex(indices)
    const wakeMaterial = additive()
    wakeMaterial.side = DoubleSide
    const f = attribute('flashFade', 'vec2')
    const edge = float(1).sub(abs(f.y))
    const core = edge.pow(5)
    const glow = edge.pow(1.5).mul(0.25).add(core)
    wakeMaterial.colorNode = this.debug.equal(2).select(vec3(f.x), vec3(...color).mul(WAKE_GAIN).add(vec3(0.8, 1, 1.2).mul(core))).mul(glow).mul(f.x)
    this.wake = new Mesh(geometry, wakeMaterial)
    this.wake.name = 'flash-direction-wakes'
    for (const mesh of [this.shell, this.wake]) {
      mesh.frustumCulled = false
      mesh.renderOrder = 4
      mesh.visible = false
      this.object.add(mesh)
    }
    this.writeRows()
  }

  start(heading: number): void {
    this.reset()
    this.direction.value.set(Math.sin(heading), 0, Math.cos(heading))
    this.active = true
    this.level.value = 1
    this.shell.visible = true
  }

  stop(): void {
    if (!this.active) return
    this.active = false
    this.landing = true
    this.remaining = RESIDUE
  }

  update(dt: number): void {
    if (!this.active && this.remaining === 0 && !this.wake.visible) return
    this.clock.value += dt
    for (let i = 0; i < SAMPLES; i++) this.ages[i] += dt
    if (!this.active) this.remaining = Math.max(0, this.remaining - dt)
    this.level.value = this.active ? 1 : this.remaining / RESIDUE
    this.shell.visible = this.level.value > 0.001
  }

  /** After model.pose: all surface rows and trail anchors use this frame's rig. */
  afterPose(): void {
    if (!this.active && !this.landing && !this.shell.visible && !this.wake.visible) return
    if (this.shell.visible) this.writeRows()
    if (this.active || this.landing) {
      this.cursor = (this.cursor + 1) % SAMPLES
      this.ages[this.cursor] = 0
      for (let a = 0; a < this.anchors.length; a++) {
        _point.setFromMatrixPosition(this.anchors[a].matrixWorld).toArray(this.points, (a * SAMPLES + this.cursor) * 3)
      }
      this.landing = false
    }
    if (this.cursor >= 0) this.writeWake()
  }

  reset(): void {
    this.active = false
    this.landing = false
    this.remaining = 0
    this.level.value = 0
    this.clock.value = 0
    this.ages.fill(99)
    this.cursor = -1
    this.primed = false
    this.shell.visible = this.wake.visible = false
  }

  /** Deterministic diagnostics: 0 final, 1 shell envelope, 2 wake envelope. */
  setDebug(mode: 0 | 1 | 2): void { this.debug.value = mode }

  /** Both non-empty draws are submitted under boot and first-switch covers. */
  warm(on: boolean): void {
    this.shell.visible = on || this.level.value > 0.001
    this.level.value = on ? 1 : this.active ? 1 : this.remaining / RESIDUE
    if (on) {
      this.writeRows()
      this.cursor = SAMPLES - 1
      for (let i = 0; i < SAMPLES; i++) {
        this.ages[i] = WAKE_LIFE * (SAMPLES - 1 - i) / SAMPLES
        for (let a = 0; a < this.anchors.length; a++) {
          _point.setFromMatrixPosition(this.anchors[a].matrixWorld).addScaledVector(this.direction.value, -0.08 * (SAMPLES - 1 - i))
            .toArray(this.points, (a * SAMPLES + i) * 3)
        }
      }
      this.writeWake()
    } else if (!this.active && this.remaining === 0) this.reset()
  }

  private writeRows(): void {
    const data = this.rows.array as Float32Array
    const prior = this.previous.array as Float32Array
    prior.set(data)
    for (let i = 0; i < this.parts.length; i++) {
      const m = this.parts[i].matrixWorld
      const e = m.elements
      const offset = i * 24
      for (let row = 0; row < 3; row++) {
        const o = offset + row * 4
        data[o] = e[row]; data[o + 1] = e[row + 4]; data[o + 2] = e[row + 8]; data[o + 3] = e[row + 12]
      }
      const n = _normal.getNormalMatrix(m).elements
      for (let row = 0; row < 3; row++) {
        const o = offset + 12 + row * 4
        data[o] = n[row]; data[o + 1] = n[row + 3]; data[o + 2] = n[row + 6]; data[o + 3] = 0
      }
    }
    if (!this.primed) { prior.set(data); this.primed = true }
    this.rows.needsUpdate = this.previous.needsUpdate = true
  }

  private writeWake(): void {
    const p = this.position.array as Float32Array
    const f = this.fade.array as Float32Array
    const d = this.direction.value
    let any = false
    for (let a = 0; a < this.anchors.length; a++) for (let plane = 0; plane < 2; plane++) {
      for (let k = 0; k < SAMPLES; k++) {
        const sample = (this.cursor - k + SAMPLES) % SAMPLES
        const age = this.ages[sample]
        const strength = Math.max(0, 1 - age / WAKE_LIFE)
        const index = ((a * 2 + plane) * SAMPLES + k) * 2
        const source = (a * SAMPLES + sample) * 3
        if (strength > 0.002) any = true
        const width = this.width * (0.3 + 0.7 * strength)
        for (let side = 0; side < 2; side++) {
          const v = index + side, offset = v * 3
          const sign = side * 2 - 1
          if (strength === 0 && k > 0) p.copyWithin(offset, (index - 2 + side) * 3, (index - 2 + side) * 3 + 3)
          else {
            p[offset] = this.points[source] + (plane === 0 ? d.z * width * sign : 0)
            p[offset + 1] = this.points[source + 1] + (plane === 1 ? width * sign : 0)
            p[offset + 2] = this.points[source + 2] - (plane === 0 ? d.x * width * sign : 0)
          }
          f[v * 2] = strength * strength
          f[v * 2 + 1] = sign
        }
      }
    }
    this.wake.visible = any
    if (any) this.position.needsUpdate = this.fade.needsUpdate = true
  }
}

function additive(): MeshBasicNodeMaterial {
  return new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false })
}

/** Strip material slots; one rigid-part index drives all body geometry. */
function mergeBody(parts: readonly Mesh[]): BufferGeometry {
  let vertices = 0, indices = 0
  for (const part of parts) {
    vertices += part.geometry.getAttribute('position').count
    indices += part.geometry.index?.count ?? part.geometry.getAttribute('position').count
  }
  const position = new Float32Array(vertices * 3), normal = new Float32Array(vertices * 3), ids = new Float32Array(vertices)
  const index = new Uint32Array(indices)
  let vertex = 0, triangle = 0
  for (let part = 0; part < parts.length; part++) {
    const g = parts[part].geometry
    const p = g.getAttribute('morphPosition') ?? g.getAttribute('position')
    const n = g.getAttribute('morphNormal') ?? g.getAttribute('normal')
    for (let i = 0; i < p.count; i++) {
      const o = (vertex + i) * 3
      position[o] = p.getX(i); position[o + 1] = p.getY(i); position[o + 2] = p.getZ(i)
      normal[o] = n.getX(i); normal[o + 1] = n.getY(i); normal[o + 2] = n.getZ(i)
      ids[vertex + i] = part
    }
    const source = g.index
    for (let i = 0; i < (source?.count ?? p.count); i++) index[triangle++] = vertex + (source ? source.getX(i) : i)
    vertex += p.count
  }
  return new BufferGeometry().setAttribute('position', new BufferAttribute(position, 3))
    .setAttribute('normal', new BufferAttribute(normal, 3)).setAttribute('flashPart', new BufferAttribute(ids, 1))
    .setIndex(new BufferAttribute(index, 1))
}

const _normal = new Matrix3()
const _point = new Vector3()
