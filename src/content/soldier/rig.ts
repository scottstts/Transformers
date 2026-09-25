import { Matrix4, Quaternion, Vector3 } from 'three/webgpu'
import type { SoldierDims, SoldierManifest } from './asset'

/**
 * A soldier's live skeleton. Parts are rigid on their bones (asset.ts), so a
 * pose is only bone matrices: the pelvis frame from the body channels, the
 * torso, head and arms by forward kinematics on top of the rest pose, and the
 * legs by two-bone IK onto the wheels, which stay upright on the sand. For
 * falls and flight the legs hand over to forward kinematics (`legsFree`).
 *
 * Authoring frame (x = the soldier's left, -y forward, z up) relative to the
 * soldier's ground point; one fixed rotation and the placement carry it into
 * three.js space. The output is the horde renderer's rows (an affine 3x4 per
 * bone) and the bone matrices themselves (`world`, three.js space) for effects.
 */

export interface SoldierArm {
  /** shoulder: swing forward (deg, + raises the arm ahead), out to the side (deg), twist about the arm (deg, + turns the elbow out) */
  pitch: number
  out: number
  twist: number
  /** elbow flexion (deg) */
  elbow: number
  /** wrist: flexion (deg, + bends the hand forward), deviation (deg), roll about the forearm (deg) */
  wrist: number
  wristYaw: number
  wristRoll: number
}

export interface SoldierFoot {
  /** wheel place ahead of the hip (m), outward of the stance (m), lift off the sand (m), yaw (deg, + toes left) */
  fwd: number
  lat: number
  lift: number
  yaw: number
}

export interface SoldierLegFk {
  /** thigh swing forward (deg), knee flexion (deg) while the legs are free */
  pitch: number
  knee: number
}

export interface SoldierPose {
  /** pelvis drop (m), pitch (deg, + leans forward), roll (deg, + drops the left hip) */
  crouch: number
  lean: number
  roll: number
  /** spine and chest: bend (deg, + forward), side bend (deg, + toward the left), twist (deg, + turns the chest left) */
  bend: number
  side: number
  twist: number
  headPitch: number
  headYaw: number
  arms: { R: SoldierArm; L: SoldierArm }
  feet: { R: SoldierFoot; L: SoldierFoot }
  legs: { R: SoldierLegFk; L: SoldierLegFk }
  /** 0 the legs stand on their wheels (IK), 1 they hang free (FK) */
  legsFree: number
  /** wheel roll (rad) */
  spin: number
}

export function createSoldierPose(): SoldierPose {
  const arm = (): SoldierArm => ({ pitch: 0, out: 0, twist: 0, elbow: 0, wrist: 0, wristYaw: 0, wristRoll: 0 })
  const foot = (): SoldierFoot => ({ fwd: 0, lat: 0, lift: 0, yaw: 0 })
  return {
    crouch: 0, lean: 0, roll: 0, bend: 0, side: 0, twist: 0, headPitch: 0, headYaw: 0,
    arms: { R: arm(), L: arm() }, feet: { R: foot(), L: foot() },
    legs: { R: { pitch: 0, knee: 0 }, L: { pitch: 0, knee: 0 } }, legsFree: 0, spin: 0,
  }
}

/** Where the body is: ground point (three.js space), heading, and a tumble about the pelvis. */
export interface SoldierPlacement {
  x: number
  z: number
  /** height of the ground point above the sand (m): flight, or negative to lie the pelvis down */
  y: number
  yaw: number
  /** the whole body tipped about the pelvis (soldier frame: authoring axes) */
  tilt: Quaternion
}

const TO_THREE = new Matrix4().makeRotationX(-Math.PI / 2)
const DEG = Math.PI / 180
const SIDES = [['L', 1], ['R', -1]] as const
const X = new Vector3(1, 0, 0)
const Y = new Vector3(0, 1, 0)
const Z = new Vector3(0, 0, 1)

export class SoldierRig {
  readonly bones: number
  readonly dims: SoldierDims
  readonly index: Record<string, number> = {}
  /** bone matrices in three.js space after the last pose */
  readonly world: Matrix4[]
  /** the renderer's rows: 12 floats per bone (x, y, z rows of the affine world matrix) */
  readonly rows: Float32Array
  private readonly parent: Int32Array
  private readonly restT: Vector3[]
  private readonly restQ: Quaternion[]
  private readonly auth: Matrix4[]
  private readonly poseQ: Quaternion[]
  private readonly ik: Record<'L' | 'R', { thigh: number; shin: number; foot: number; wheel: number; hipT: Vector3 }>
  private readonly order: number[]
  /** the bones the pose drives, by name */
  private readonly named: {
    pelvis: number; spine: number; chest: number; neck: number; head: number
    arms: Record<'L' | 'R', { upper: number; fore: number; hand: number }>
  }

  constructor(manifest: SoldierManifest) {
    this.dims = manifest.dims
    this.bones = manifest.bones.length
    manifest.bones.forEach((b, i) => { this.index[b.name] = i })
    this.parent = Int32Array.from(manifest.bones.map((b) => b.parent))
    this.restT = manifest.bones.map((b) => new Vector3(...b.t))
    this.restQ = manifest.bones.map((b) => new Quaternion(...b.q))
    this.auth = manifest.bones.map(() => new Matrix4())
    this.world = manifest.bones.map(() => new Matrix4())
    this.poseQ = manifest.bones.map(() => new Quaternion())
    this.rows = new Float32Array(this.bones * 12)
    const bone = (name: string): number => {
      const i = this.index[name]
      if (i === undefined) throw new Error(`Soldier asset lacks bone ${name}`)
      return i
    }
    const leg = (s: 'L' | 'R') => ({ thigh: bone(`thigh.${s}`), shin: bone(`shin.${s}`), foot: bone(`foot.${s}`), wheel: bone(`wheel.${s}`), hipT: this.restT[bone(`thigh.${s}`)] })
    this.ik = { L: leg('L'), R: leg('R') }
    const arm = (s: 'L' | 'R') => ({ upper: bone(`upperarm.${s}`), fore: bone(`forearm.${s}`), hand: bone(`hand.${s}`) })
    this.named = { pelvis: bone('pelvis'), spine: bone('spine'), chest: bone('chest'), neck: bone('neck'), head: bone('head'), arms: { L: arm('L'), R: arm('R') } }
    // parents before children (the export lists them so; kept explicit)
    this.order = manifest.bones.map((_, i) => i).sort((a, b) => depth(this.parent, a) - depth(this.parent, b))
  }

  /** Pose the skeleton and fill `world` and `rows`. */
  pose(place: SoldierPlacement, p: SoldierPose): void {
    const d = this.dims
    // placement in three.js space, then the authoring frame, then the tumble about the pelvis
    _place.makeRotationY(place.yaw).setPosition(place.x, place.y, place.z).multiply(TO_THREE)
    const hipZ = d.hipZ - p.crouch
    _body.makeTranslation(0, 0, hipZ).multiply(_m.makeRotationFromQuaternion(place.tilt)).multiply(_m1.makeTranslation(0, 0, -hipZ))

    const Q = this.poseQ
    for (const q of Q) q.identity()
    const B = this.named
    eulerXYZ(p.bend * 0.5 * DEG, p.side * 0.5 * DEG, p.twist * 0.5 * DEG, Q[B.spine])
    eulerXYZ(p.bend * 0.5 * DEG, p.side * 0.5 * DEG, p.twist * 0.5 * DEG, Q[B.chest])
    eulerXYZ(p.headPitch * 0.4 * DEG, 0, p.headYaw * 0.4 * DEG, Q[B.neck])
    eulerXYZ(p.headPitch * 0.6 * DEG, 0, p.headYaw * 0.6 * DEG, Q[B.head])
    for (const [side, s] of SIDES) {
      const a = p.arms[side]
      const arm = B.arms[side]
      eulerXYZ(-a.pitch * DEG, -s * a.out * DEG, s * a.twist * DEG, Q[arm.upper])
      eulerXYZ(-a.elbow * DEG, 0, 0, Q[arm.fore])
      eulerXYZ(-a.wrist * DEG, -s * a.wristYaw * DEG, s * a.wristRoll * DEG, Q[arm.hand])
    }

    const W = this.auth
    const pelvis = this.named.pelvis
    for (const i of this.order) {
      const par = this.parent[i]
      if (i === pelvis) {
        W[i].makeTranslation(0, 0, hipZ).multiply(_m.makeRotationX(p.lean * DEG)).multiply(_m1.makeRotationY(p.roll * DEG))
        W[i].premultiply(_body)
        continue
      }
      if (this.isLeg(i)) continue
      _q.copy(this.restQ[i]).multiply(this.poseQ[i])
      _m.compose(this.restT[i], _q, ONE)
      W[i].multiplyMatrices(W[par], _m)
    }
    this.legs(p)
    for (let i = 0; i < this.bones; i++) {
      const w = this.world[i].multiplyMatrices(_place, W[i])
      const e = w.elements
      const r = this.rows
      const o = i * 12
      r[o] = e[0]; r[o + 1] = e[4]; r[o + 2] = e[8]; r[o + 3] = e[12]
      r[o + 4] = e[1]; r[o + 5] = e[5]; r[o + 6] = e[9]; r[o + 7] = e[13]
      r[o + 8] = e[2]; r[o + 9] = e[6]; r[o + 10] = e[10]; r[o + 11] = e[14]
    }
  }

  /** Copy explicit three.js-space bone matrices (debris) into `world` and `rows`. */
  setWorld(i: number, m: Matrix4): void {
    this.world[i].copy(m)
    const e = m.elements
    const r = this.rows
    const o = i * 12
    r[o] = e[0]; r[o + 1] = e[4]; r[o + 2] = e[8]; r[o + 3] = e[12]
    r[o + 4] = e[1]; r[o + 5] = e[5]; r[o + 6] = e[9]; r[o + 7] = e[13]
    r[o + 8] = e[2]; r[o + 9] = e[6]; r[o + 10] = e[10]; r[o + 11] = e[14]
  }

  private isLeg(i: number): boolean {
    const L = this.ik.L, R = this.ik.R
    return i === L.thigh || i === L.shin || i === L.foot || i === L.wheel || i === R.thigh || i === R.shin || i === R.foot || i === R.wheel
  }

  /** Legs: IK onto upright wheels on the sand, blended toward free-hanging FK. */
  private legs(p: SoldierPose): void {
    const d = this.dims
    const W = this.auth
    const pelvisW = W[this.index.pelvis]
    const L1 = d.thigh, L2 = d.shin
    const free = Math.min(1, Math.max(0, p.legsFree))
    for (const [side, s] of SIDES) {
      const leg = this.ik[side]
      const foot = p.feet[side]
      const fk = p.legs[side]
      const hip = _hip.copy(leg.hipT).applyMatrix4(pelvisW)
      // IK: the ankle stands above an axle on the sand
      _target.set(s * (d.stanceX + foot.lat), -foot.fwd, d.wheelRadius + d.ankleUp + foot.lift)
      const v = _v.subVectors(_target, hip)
      const dist = Math.min(Math.max(v.length(), Math.abs(L1 - L2) + 1e-4), L1 + L2 - 1e-4)
      const dir = v.normalize()
      const pole = _pole.set(0, -1, 0).transformDirection(pelvisW)
      const sideAxis = _side.crossVectors(pole, dir)
      if (sideAxis.lengthSq() < 1e-8) sideAxis.set(1, 0, 0)
      sideAxis.normalize()
      const a = Math.acos(clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist)))
      const knee = Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - dist * dist) / (2 * L1 * L2)))
      const thighDir = _t.copy(dir).applyAxisAngle(sideAxis, -a)
      _z.copy(thighDir).negate()
      _y.crossVectors(_z, sideAxis)
      _qIk.setFromRotationMatrix(_m.makeBasis(sideAxis, _y, _z))
      // FK: rest splay, swing and knee from the channels, under the tilted pelvis
      _qFk.setFromRotationMatrix(pelvisW).multiply(this.restQ[leg.thigh]).multiply(_q.setFromAxisAngle(X, -fk.pitch * DEG))
      const thighQ = _qIk.slerp(_qFk, free)
      const kneeAngle = knee + (fk.knee * DEG - knee) * free
      W[leg.thigh].compose(hip, thighQ, ONE)
      W[leg.shin].multiplyMatrices(W[leg.thigh], _m.makeTranslation(0, 0, -L1)).multiply(_m1.makeRotationX(kneeAngle))
      // foot: upright and turned by its yaw on the sand; following the shin when free
      _ankle.set(0, 0, -L2).applyMatrix4(W[leg.shin])
      _qIk.setFromAxisAngle(Z, foot.yaw * DEG)
      _qFk.setFromRotationMatrix(W[leg.shin]).multiply(this.restQ[leg.foot])
      W[leg.foot].compose(_ankle, _qIk.slerp(_qFk, free), ONE)
      W[leg.wheel].multiplyMatrices(W[leg.foot], _m.makeTranslation(0, 0, -d.ankleUp)).multiply(_m1.makeRotationX(p.spin))
    }
  }
}

function depth(parent: Int32Array, i: number): number {
  let n = 0
  for (let k = parent[i]; k >= 0; k = parent[k]) n++
  return n
}

const clamp = (x: number): number => Math.min(1, Math.max(-1, x))

/** Blender Euler 'XYZ' (radians) as a quaternion. */
function eulerXYZ(x: number, y: number, z: number, out: Quaternion): Quaternion {
  _qa.setFromAxisAngle(Z, z)
  _qb.setFromAxisAngle(Y, y)
  _qc.setFromAxisAngle(X, x)
  return out.copy(_qa).multiply(_qb).multiply(_qc)
}

const ONE = new Vector3(1, 1, 1)
const _place = new Matrix4()
const _body = new Matrix4()
const _m = new Matrix4()
const _m1 = new Matrix4()
const _q = new Quaternion()
const _qa = new Quaternion()
const _qb = new Quaternion()
const _qc = new Quaternion()
const _qIk = new Quaternion()
const _qFk = new Quaternion()
const _hip = new Vector3()
const _target = new Vector3()
const _v = new Vector3()
const _pole = new Vector3()
const _side = new Vector3()
const _t = new Vector3()
const _y = new Vector3()
const _z = new Vector3()
const _ankle = new Vector3()
