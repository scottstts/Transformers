import { Group, MathUtils, Matrix4, Mesh, Quaternion, Vector3, type Material, type Node, type UniformNode } from 'three/webgpu'
import { Fn, attribute, mix, normalGeometry, normalLocal, normalize, positionGeometry, positionPrevious, uniform } from 'three/tsl'
import type { TransformerAsset } from '../asset/loader'
import { supportPoints } from '../asset/loader'
import type { NodeKind, RigDims } from '../asset/format'
import { RobotRig, type GaitPose, type RigOverlay } from './rig'

const FEET = ['L', 'R'] as const

/**
 * A transformer character at runtime (the Cybertruck, the Ferrari F1, ...).
 *
 * Every rigid body of the mechanism (skeleton bone, car assembly, wheel,
 * lifter stage) is a node whose local transform relative to its parent was
 * baked from the audited Blender build for every frame of T (0 = truck,
 * 1 = robot). Playback samples those tracks; near T = 1 the skeleton blends
 * into the live gait (stand pose + gait channels + leg IK), so walking and
 * transforming back share one continuous pose. In car mode the body rides the
 * suspension matrix while the wheels stay unsprung, spin and steer.
 *
 * Node matrices are composed here (flattened, parents first) in the authoring
 * frame (x = robot left, -y = forward, z = up); one fixed rotation puts the
 * model into three.js's y-up, +z-forward space.
 *
 * Optional parts of the container (the semi uses them):
 *  - a world-hosted node (parent -1, not a bone) can be `carried` by a bone
 *    once it has docked on it: while the skeleton is live it keeps its baked
 *    place relative to that bone, so it follows the gait;
 *  - a `trailer` node swings with its subtree about its hitch by
 *    `articulation` in car form;
 *  - meshes with a second shape (`morphPosition` / `morphNormal`) blend into
 *    it by the asset's per-frame morph weight, in the vertex stage.
 */

type Side = 'R' | 'L'

/** A planted foot's outline on the ground. */
export interface Sole {
  center: Vector3
  forward: Vector3
  length: number
  width: number
}

export interface Contacts {
  /** `trailer`: the wheel rides the trailer, not the car's own axles */
  wheels: Array<{ p: Vector3; front: boolean; trailer: boolean }>
  feet: Record<Side, Vector3>
}

/** Default start of the skeleton's blend into the live gait (T). */
const GAIT_BLEND_FROM = 0.9
const CAR_FADE = 0.06
const TO_THREE = new Matrix4().makeRotationX(-Math.PI / 2)
const FROM_THREE = TO_THREE.clone().invert()

const smooth = (u: number): number => u * u * u * (u * (u * 6 - 15) + 10)

export interface TransformerOptions {
  /** name used in error messages */
  label: string
  /** nodes whose support points form the soles (a `.L` / `.R` suffix gives the side) */
  footNodes: string[]
  /**
   * Also sample the soles along their rolling plane, for rounded heels and
   * toes the 26 box directions miss (see `rollSupport`). Off: box directions only.
   */
  rollSupport?: boolean
  /** T at which the skeleton starts blending into the live gait */
  gaitBlendFrom?: number
  /** world-hosted nodes and the bone node that carries each once the skeleton is live (`asm:van0` -> `bone:chest`) */
  carried?: Record<string, string>
  /** the node that swings about its hitch (authoring frame, m) by `articulation` in car form */
  trailer?: { node: string; hitch: [number, number, number] }
  /** the front tyres' radius where it differs from the rear's (`dims.wheelRadius`, m): they touch down on it and spin faster to roll at the same speed */
  frontWheelRadius?: number
}

export class TransformerModel {
  readonly label: string
  /** game-world placement (position / yaw), owned by the session */
  readonly root = new Group()
  /** car-mode body suspension in game space (pitch / roll about the body), owned by the session */
  readonly suspension = new Matrix4()
  steer = 0
  spin = 0
  T = 0
  lift = 0
  /** a pose laid over the live gait at T = 1 (a fighting move), owned by the combat system */
  overlay: RigOverlay | null = null
  /** trailer yaw against the car (rad, + to the left), owned by the session; only in car form */
  articulation = 0
  readonly dims: RigDims
  readonly duration: number

  private readonly frame = new Group()
  private readonly nodes: Group[] = []
  private readonly byName: Record<string, number> = {}
  private readonly parent: Int32Array
  private readonly kind: NodeKind[]
  private readonly world: Matrix4[]
  /** the live skeleton (the gait and any overlay pose it at T = 1) */
  readonly rig: RobotRig
  private readonly boneOf: Int32Array
  private readonly wheels: Array<{ node: number; front: boolean }> = []
  private readonly frontWheel: Uint8Array
  private readonly contactPoints: Contacts
  private readonly footSupport: Array<{ node: number; side: Side; points: Vector3[] }> = []
  private readonly footNode: Record<Side, number>
  private readonly tracks: Float32Array
  private readonly scaleTracks?: Float32Array
  private readonly liftTrack: Float32Array
  private readonly frames: number
  private readonly gaitBlendFrom: number
  /** carried nodes: node -> its carrying bone node; the carrying bones' baked chains */
  private readonly carrier: Int32Array
  private readonly bakedChain: Uint8Array
  private readonly bakedWorld: Matrix4[]
  private readonly trailerNode: number
  private readonly hitch = new Vector3()
  private readonly morphTrack?: Float32Array
  private readonly morphWeight = uniform(0)
  /** the front tyres' radius, and their spin per radian of the rear's */
  private readonly frontRadius: number
  private readonly frontSpin: number

  constructor(asset: TransformerAsset, materials: Record<string, Material>, options: TransformerOptions) {
    const { manifest } = asset
    this.label = options.label
    this.gaitBlendFrom = options.gaitBlendFrom ?? GAIT_BLEND_FROM
    this.dims = manifest.rig.dims
    this.frontRadius = options.frontWheelRadius ?? manifest.rig.dims.wheelRadius
    this.frontSpin = manifest.rig.dims.wheelRadius / this.frontRadius
    this.duration = manifest.rig.dims.duration
    this.tracks = asset.tracks
    this.scaleTracks = asset.scales
    this.liftTrack = asset.lift
    this.frames = manifest.frames
    this.frame.matrixAutoUpdate = false
    this.frame.matrix.copy(TO_THREE)
    this.root.add(this.frame)

    const count = manifest.nodes.length
    this.parent = new Int32Array(count)
    this.kind = manifest.nodes.map((n) => n.kind)
    this.world = manifest.nodes.map(() => new Matrix4())
    this.morphTrack = asset.morph
    const morphed = new Map<Material, Material>()
    const shaped = (base: Material): Material => {
      let m = morphed.get(base)
      if (!m) morphed.set(base, m = morphMaterial(base, this.morphWeight))
      return m
    }
    const byName = this.byName
    manifest.nodes.forEach((record, i) => {
      byName[record.name] = i
      this.parent[i] = record.parent
      const node = new Group()
      node.name = record.name
      node.matrixAutoUpdate = false
      for (const { material, geometry } of asset.meshes[i]) {
        const base = materials[material] ?? materials.plastic
        const m = geometry.hasAttribute('morphPosition') ? shaped(base) : base
        const mesh = new Mesh(geometry, m)
        mesh.matrixAutoUpdate = false
        const radius = geometry.boundingSphere?.radius ?? 0
        mesh.castShadow = !m.userData.emissive && radius > 0.12
        mesh.receiveShadow = true
        node.add(mesh)
      }
      this.frame.add(node)
      this.nodes.push(node)
      if (record.kind === 'wheel') this.wheels.push({ node: i, front: record.name.startsWith('wheel:wheelF') })
    })
    for (const name of options.footNodes) {
      const i = byName[name]
      if (i === undefined) throw new Error(`${this.label} asset lacks ${name}`)
      this.footSupport.push({ node: i, side: /\.L($|\.)/.test(name) ? 'L' : 'R', points: options.rollSupport ? [] : supportPoints(asset.meshes[i].map((m) => m.geometry)) })
    }
    this.footNode = { L: this.index('bone:foot.L'), R: this.index('bone:foot.R') }
    this.frontWheel = new Uint8Array(count)
    for (const w of this.wheels) this.frontWheel[w.node] = w.front ? 1 : 0

    this.carrier = new Int32Array(count).fill(-1)
    this.bakedChain = new Uint8Array(count)
    this.bakedWorld = manifest.nodes.map(() => new Matrix4())
    for (const [name, bone] of Object.entries(options.carried ?? {})) {
      const i = this.index(name)
      const b = this.index(bone)
      if (this.parent[i] >= 0 || this.kind[i] === 'bone' || this.kind[b] !== 'bone') throw new Error(`${this.label}: ${name} cannot be carried by ${bone}`)
      this.carrier[i] = b
      for (let p = b; p >= 0; p = this.parent[p]) this.bakedChain[p] = 1
    }
    this.trailerNode = options.trailer ? this.index(options.trailer.node) : -1
    if (options.trailer) this.hitch.set(...options.trailer.hitch)
    const underTrailer = (i: number): boolean => {
      for (let p = i; p >= 0; p = this.parent[p]) if (p === this.trailerNode) return true
      return false
    }
    this.contactPoints = { wheels: this.wheels.map((w) => ({ p: new Vector3(), front: w.front, trailer: underTrailer(w.node) })), feet: { L: new Vector3(), R: new Vector3() } }

    this.rig = new RobotRig(manifest.rig.bones, manifest.rig.stand, manifest.rig.dims)
    this.boneOf = new Int32Array(count).fill(-1)
    manifest.nodes.forEach((record, i) => {
      if (record.kind === 'bone') this.boneOf[i] = this.rig.index[record.name.slice(5)]
    })
    if (options.rollSupport) this.rollSupport(asset)
    this.pose(0, null)
  }

  /**
   * Adds each sole node's extremes along directions in its foot's rolling
   * plane (pitch -60..60 deg, measured in the stand), so a rounded heel or toe
   * bears where it really does. The 26 box directions alone meet a rounding
   * only at 45 deg, and a heel strike rolls over it at 5-30 deg.
   */
  private rollSupport(asset: TransformerAsset): void {
    this.pose(1, null)
    const inv = new Matrix4()
    const dirs: Vector3[] = []
    for (const s of this.footSupport) {
      inv.copy(this.world[s.node]).invert()
      const foot = this.world[this.footNode[s.side]]
      dirs.length = 0
      for (let deg = -60; deg <= 60; deg += 5) {
        const a = deg * Math.PI / 180
        // foot frame: +y is backward, z up; the sole's lowest point at pitch a lies along (0, sin a, -cos a)
        dirs.push(new Vector3(0, Math.sin(a), -Math.cos(a)).transformDirection(foot).transformDirection(inv))
      }
      s.points = supportPoints(asset.meshes[s.node].map((m) => m.geometry), dirs)
    }
  }

  /** A mechanism node (bone, assembly, wheel or lifter stage) by its asset name. */
  node(name: string): Group {
    return this.nodes[this.index(name)]
  }

  private index(name: string): number {
    const i = this.byName[name]
    if (i === undefined) throw new Error(`${this.label} asset lacks ${name}`)
    return i
  }

  /** Pose the whole model at transformation time T; `gait` drives the robot at T = 1. */
  pose(T: number, gait: GaitPose | null): void {
    this.T = T
    const fpos = MathUtils.clamp(T, 0, 1) * (this.frames - 1)
    const f0 = Math.min(Math.floor(fpos), this.frames - 2)
    const a = fpos - f0
    const gw = gait ? smooth(MathUtils.clamp((T - this.gaitBlendFrom) / (1 - this.gaitBlendFrom), 0, 1)) : 0
    if (gw > 0 && gait) this.rig.poseLive(gait, this.overlay)
    const carW = 1 - smooth(MathUtils.clamp(T / CAR_FADE, 0, 1))
    if (this.morphTrack) this.morphWeight.value = this.morphTrack[f0] + (this.morphTrack[f0 + 1] - this.morphTrack[f0]) * a
    const swing = this.articulation * carW
    if (swing !== 0) _hitch.makeTranslation(this.hitch).multiply(_m1.makeRotationZ(swing)).multiply(_m2.makeTranslation(-this.hitch.x, -this.hitch.y, -this.hitch.z))

    const count = this.nodes.length
    const stride = count * 7
    const tr = this.tracks
    for (let i = 0; i < count; i++) {
      const o0 = f0 * stride + i * 7
      const o1 = o0 + stride
      _t.set(tr[o0] + (tr[o1] - tr[o0]) * a, tr[o0 + 1] + (tr[o1 + 1] - tr[o0 + 1]) * a, tr[o0 + 2] + (tr[o1 + 2] - tr[o0 + 2]) * a)
      _q.set(tr[o0 + 3], tr[o0 + 4], tr[o0 + 5], tr[o0 + 6])
      _q1.set(tr[o1 + 3], tr[o1 + 4], tr[o1 + 5], tr[o1 + 6])
      _q.slerp(_q1, a)
      if (this.bakedChain[i]) {
        // the baked pose of a carrying bone's chain, before the live skeleton takes it
        const baked = _m.compose(_t, _q, ONE)
        const p = this.parent[i]
        if (p < 0) this.bakedWorld[i].copy(baked)
        else this.bakedWorld[i].multiplyMatrices(this.bakedWorld[p], baked)
      }
      const bone = this.boneOf[i]
      if (gw > 0 && bone >= 0) {
        if (this.parent[i] < 0) {
          this.rig.world[bone].decompose(_t1, _q1, _s)
        } else {
          const L = this.rig.local[bone]
          _t1.copy(L.t).add(this.rig.offset[bone])
          _q1.copy(L.q)
        }
        _t.lerp(_t1, gw)
        _q.slerp(_q1, gw)
      }
      _s.copy(ONE)
      if (this.scaleTracks) {
        const scales = this.scaleTracks
        const s0 = (f0 * count + i) * 3
        const s1 = s0 + count * 3
        _s.set(
          scales[s0] + (scales[s1] - scales[s0]) * a,
          scales[s0 + 1] + (scales[s1 + 1] - scales[s0 + 1]) * a,
          scales[s0 + 2] + (scales[s1 + 2] - scales[s0 + 2]) * a,
        )
      }
      const local = _m.compose(_t, _q, _s)
      if (this.kind[i] === 'wheel') {
        if (this.frontWheel[i] && carW > 0) local.multiply(_m1.makeRotationZ(this.steer * carW))
        local.multiply(_m1.makeRotationX(this.frontWheel[i] ? this.spin * this.frontSpin : this.spin))
      }
      const p = this.parent[i]
      if (p >= 0) this.world[i].multiplyMatrices(this.world[p], local)
      else {
        const carrier = this.carrier[i]
        if (gw > 0 && carrier >= 0) {
          // keeps its baked place on the carrying bone, which the gait now moves
          this.world[i].copy(this.world[carrier]).multiply(_m1.copy(this.bakedWorld[carrier]).invert()).multiply(local)
        } else this.world[i].copy(local)
        if (swing !== 0 && i === this.trailerNode) this.world[i].premultiply(_hitch)
      }
    }

    // ground: baked contact through the transformation, live foot contact at the stand
    const baked = this.liftTrack[f0] + (this.liftTrack[f0 + 1] - this.liftTrack[f0]) * a
    if (gw > 0 && gait) {
      const contactLift = this.liveLift()
      // Ground projection must not drag a running body after its recovering
      // feet. Keep the exported sole datum, retain upward penetration correction,
      // and blend at run/jump handoff.
      const flight = (gait.freeFlight ?? 0) * (1 - (this.overlay?.weight ?? 0))
      const soleDatum = this.liftTrack[this.frames - 1]
      const groundLift = contactLift + (Math.max(soleDatum, contactLift) - contactLift) * flight
      this.lift = baked + (groundLift + (gait.air ?? 0) - baked) * gw
    } else this.lift = baked

    // body on the suspension in car mode; wheels unsprung
    _s1.copy(FROM_THREE).multiply(this.suspension).multiply(TO_THREE)
    _s1.decompose(_t1, _q1, _s)
    _t1.multiplyScalar(carW)
    _q1.slerp(_IDENTITY_Q, 1 - carW)
    const sprung = _m2.compose(_t1, _q1, ONE)
    const lift = _m3.makeTranslation(0, 0, this.lift)
    const liftSprung = _m4.multiplyMatrices(lift, sprung)
    for (let i = 0; i < count; i++) {
      this.nodes[i].matrix.multiplyMatrices(this.kind[i] === 'wheel' ? lift : liftSprung, this.world[i])
    }
    this.root.updateMatrixWorld(true)
  }

  /** Ground offset that puts the lowest foot / toe-cap support point on z = 0. */
  private liveLift(): number {
    let low = Infinity
    for (const { node, points } of this.footSupport) {
      const W = this.world[node]
      for (const p of points) {
        const z = _v.copy(p).applyMatrix4(W).z
        if (z < low) low = z
      }
    }
    return -low
  }

  /** Height of a foot's lowest support point above the ground (game space, after the last pose). */
  footClearance(side: Side): number {
    let low = Infinity
    for (const s of this.footSupport) {
      if (s.side !== side) continue
      const W = this.nodes[s.node].matrixWorld
      for (const p of s.points) low = Math.min(low, _v.copy(p).applyMatrix4(W).y)
    }
    return low
  }

  /**
   * Outline of a foot (sole and toe cap) on the ground, in game space: the
   * support points within 6 cm of its lowest, boxed along the foot's heading.
   */
  sole(side: Side, out: Sole): Sole {
    const foot = this.nodes[this.footNode[side]].matrixWorld
    out.forward.set(0, -1, 0).transformDirection(foot).setY(0).normalize()
    const f = out.forward
    const low = this.footClearance(side)
    let a0 = Infinity, a1 = -Infinity, c0 = Infinity, c1 = -Infinity
    for (const s of this.footSupport) {
      if (s.side !== side) continue
      const W = this.nodes[s.node].matrixWorld
      for (const p of s.points) {
        _v.copy(p).applyMatrix4(W)
        if (_v.y > low + 0.06) continue
        const a = _v.x * f.x + _v.z * f.z
        const c = -_v.x * f.z + _v.z * f.x
        a0 = Math.min(a0, a); a1 = Math.max(a1, a)
        c0 = Math.min(c0, c); c1 = Math.max(c1, c)
      }
    }
    const a = (a0 + a1) / 2
    const c = (c0 + c1) / 2
    out.center.set(f.x * a - f.z * c, 0, f.z * a + f.x * c)
    out.length = Math.max(0.3, a1 - a0)
    out.width = Math.max(0.2, c1 - c0)
    return out
  }

  /** The trailer's heading on the ground (game space, unit), or the car's without one (after the last pose). */
  trailerForward(out: Vector3): Vector3 {
    const frame = this.trailerNode >= 0 ? this.nodes[this.trailerNode].matrixWorld : this.frame.matrixWorld
    return out.set(0, -1, 0).transformDirection(frame).setY(0).normalize()
  }

  /** World-space contact points for dust and footstep effects. */
  contacts(): Contacts {
    const out = this.contactPoints
    for (let k = 0; k < this.wheels.length; k++) {
      out.wheels[k].p.setFromMatrixPosition(this.nodes[this.wheels[k].node].matrixWorld)
      out.wheels[k].p.y -= this.wheels[k].front ? this.frontRadius : this.dims.wheelRadius
    }
    for (const side of FEET) {
      out.feet[side].set(0, 0, -this.dims.ankleZ).applyMatrix4(this.nodes[this.footNode[side]].matrixWorld)
    }
    return out
  }
}

/**
 * A copy of `base` that blends each vertex into the mesh's second shape by
 * `weight`: position and normal, in the vertex stage (shadows included, as
 * they draw with the material's position node).
 */
function morphMaterial(base: Material, weight: UniformNode<'float', number>): Material {
  const m = base.clone() as Material & { positionNode: Node | null }
  const shape = attribute('morphPosition', 'vec3')
  const bend = attribute('morphNormal', 'vec3')
  let last = weight.value
  const previous = uniform(last).onFrameUpdate(() => { const value = last; last = weight.value; return value })
  m.positionNode = Fn(() => {
    positionPrevious.assign(mix(positionGeometry, shape, previous))
    normalLocal.assign(normalize(mix(normalGeometry, bend, weight)))
    return mix(positionGeometry, shape, weight)
  })()
  return m
}

const ONE = new Vector3(1, 1, 1)
const _IDENTITY_Q = new Quaternion()
const _hitch = new Matrix4()
const _t = new Vector3()
const _t1 = new Vector3()
const _s = new Vector3()
const _v = new Vector3()
const _q = new Quaternion()
const _q1 = new Quaternion()
const _m = new Matrix4()
const _m1 = new Matrix4()
const _m2 = new Matrix4()
const _m3 = new Matrix4()
const _m4 = new Matrix4()
const _s1 = new Matrix4()
