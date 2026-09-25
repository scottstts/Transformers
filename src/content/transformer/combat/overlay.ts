import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three/webgpu'
import { eulerXYZ, type GaitLeg, type GaitPose, type RigOverlay, type RobotRig } from '../model/rig'
import { ARM, CH, CHANNELS, SIDES, WEAPON, createCombatPose, type CombatPose, type Side } from './pose'

const deg = MathUtils.degToRad
const FINGERS = ['index', 'middle', 'ring', 'pinky'] as const
const GAIT_REST_CURL = 0.45

/** How a character's hands, weapon and soles meet the fighting pose. */
export interface CombatBuild {
  /** the hand that holds the weapon */
  main: Side
  /** grip centre of the closed right hand in its hand frame (m); the left hand mirrors x */
  grip: [number, number, number]
  /** closed-fist finger joint angles, base to tip (deg) */
  fist: [number, number, number]
  /** Finger curl around the handle, leaving space for its solid cross section. */
  handle: [number, number, number]
  /** Thumb opposition at the base and flexion at the two distal joints (deg). */
  thumb: [number, number, number]
  /** the weapon's second grip in the weapon frame (m) */
  offGrip: [number, number, number]
  /** sole: heel and toe edges behind / ahead of the ankle, ankle height (m), as the gait style has them */
  sole: { heel: number; toe: number; ankle: number }
}

/**
 * Weapon axes in a hand's frame: the haft (weapon +z) leaves the fist past the
 * index finger (hand -y), the edge (weapon +x) faces the knuckles (hand -z).
 * The same for either hand: two hands on one haft hold it palm to palm.
 */
const GRIP_ROT = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(
  new Vector3(0, 0, -1), new Vector3(1, 0, 0), new Vector3(0, -1, 0)))
const GRIP_ROT_INV = GRIP_ROT.clone().invert()
/** The weapon's rest in the chest frame: upright, the edge facing forward. */
const WEAPON_REST = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(
  new Vector3(0, -1, 0), new Vector3(1, 0, 0), new Vector3(0, 0, 1)))
/** An arm's default elbow direction in the chest frame (outward, back, down), before the `elbow` roll. */
const POLE = new Vector3(0.4, 0.6, -1).normalize()
/** Legs past this share of their length pivot the heel up about the toe instead of floating the foot. */
const LEG_REACH = 0.995

/**
 * The fighting pose laid over the gait (a `RigOverlay`). Pelvis and torso are
 * Euler channels; each arm is a two-bone IK to a hand target given as a
 * direction, reach and elbow roll from its shoulder in the chest frame (so a
 * torso twist carries the punch), or, for the weapon hand, to the grip that
 * places the weapon where its channels put it. The second hand solves onto
 * the weapon's off grip where the weapon actually is. Feet are the planner's
 * model-frame targets, with the heel raised about the toe wherever a lunge
 * would otherwise pull a planted foot off the ground.
 *
 * Everything blends with the gait by `weight`: locals by slerp, the pelvis
 * frame by lerp / slerp, the leg targets before the IK.
 */
export class CombatOverlay implements RigOverlay {
  weight = 0
  /** channel values and feet, written by the combat system every frame */
  readonly pose: CombatPose = createCombatPose()
  /** the channels of the stand (where the recovery settles; measured from the rig) */
  readonly neutral = new Float32Array(CHANNELS)
  /** the weapon frame in the authoring frame, after the last pose */
  readonly weapon = new Matrix4()
  /** weapon to main hand (its grip) */
  readonly grip = new Matrix4()
  readonly build: CombatBuild
  private readonly armLength: Record<Side, [number, number]>
  /** each shoulder's rest position relative to the pelvis joint (model frame): the weapon channels' origin */
  private readonly shoulderRest: Record<Side, Vector3> = { R: new Vector3(), L: new Vector3() }
  private readonly idx: {
    pelvis: number
    chest: number
    torso: Array<[number, number, 'spine' | 'chest' | 'neck' | 'head']>
    arm: Record<Side, { upper: number; fore: number; hand: number; parent: number; fingers: number[]; thumbs: number[] }>
    hip: Record<Side, number>
  }
  private readonly gaitQ: Quaternion[]
  private readonly gripOffset: Record<Side, Vector3>
  private readonly offGrip: Vector3
  /** Continuous quaternion branch while a hand takes/releases the weapon. */
  private readonly wristDelta: Record<Side, Quaternion> = { R: new Quaternion(), L: new Quaternion() }
  private readonly wristWeight: Record<Side, number> = { R: 0, L: 0 }
  private readonly wristAxis: Record<Side, Vector3> = { R: new Vector3(1, 0, 0), L: new Vector3(1, 0, 0) }
  private readonly legs: Record<Side, GaitLeg> = { R: { step: 0, up: 0, pitch: 0, x: 0, yaw: 0 }, L: { step: 0, up: 0, pitch: 0, x: 0, yaw: 0 } }

  constructor(rig: RobotRig, build: CombatBuild) {
    this.build = build
    const i = rig.index
    const bone = (name: string): number => {
      const k = i[name]
      if (k === undefined) throw new Error(`combat rig lacks ${name}`)
      return k
    }
    const arm = (s: Side) => ({
      upper: bone(`upperarm.${s}`),
      fore: bone(`forearm.${s}`),
      hand: bone(`hand.${s}`),
      parent: rig.parent[bone(`upperarm.${s}`)],
      fingers: FINGERS.flatMap((f) => [1, 2, 3].map((k) => bone(`${f}${k}.${s}`))),
      thumbs: [1, 2, 3].map((k) => bone(`thumb${k}.${s}`)),
    })
    this.idx = {
      pelvis: bone('pelvis'),
      chest: bone('chest'),
      torso: [[bone('spine'), CH.spineX, 'spine'], [bone('chest'), CH.chestX, 'chest'], [bone('neck'), CH.headX, 'neck'], [bone('head'), CH.headX, 'head']],
      arm: { R: arm('R'), L: arm('L') },
      hip: { R: bone('hip.R'), L: bone('hip.L') },
    }
    const len = (k: number): number => _v0.copy(rig.stand[k].t).add(rig.offset[k]).length()
    this.armLength = {
      R: [len(this.idx.arm.R.fore), len(this.idx.arm.R.hand)],
      L: [len(this.idx.arm.L.fore), len(this.idx.arm.L.hand)],
    }
    this.gaitQ = rig.local.map(() => new Quaternion())
    this.gripOffset = { R: new Vector3(...build.grip), L: new Vector3(-build.grip[0], build.grip[1], build.grip[2]) }
    this.offGrip = new Vector3(...build.offGrip)
    this.grip.compose(this.gripOffset[build.main], GRIP_ROT, _one)
    this.measureNeutral(rig)
  }

  /** The stand's channels: arms measured from the rig at rest, everything else zero. */
  private measureNeutral(rig: RobotRig): void {
    rig.poseLive(REST_GAIT)
    const n = this.neutral
    n.fill(0)
    const chest = _q0.setFromRotationMatrix(rig.world[this.idx.chest]).invert()
    for (const side of SIDES) {
      const a = this.idx.arm[side]
      const sgn = side === 'L' ? 1 : -1
      const [L1, L2] = this.armLength[side]
      const S = _v0.setFromMatrixPosition(rig.world[a.upper])
      this.shoulderRest[side].copy(S).sub(_v1.setFromMatrixPosition(rig.world[this.idx.pelvis]))
      const E = _v1.setFromMatrixPosition(rig.world[a.fore]).sub(S).applyQuaternion(chest)
      const W = _v2.setFromMatrixPosition(rig.world[a.hand]).sub(S).applyQuaternion(chest)
      const reach = W.length()
      const d = W.normalize()
      const o = ARM[side]
      n[o] = MathUtils.radToDeg(Math.atan2(sgn * d.x, -d.y))
      n[o + 1] = MathUtils.radToDeg(Math.asin(MathUtils.clamp(d.z, -1, 1)))
      n[o + 2] = reach / (L1 + L2)
      const p0 = basePole(d, sgn, _v3)
      const pa = E.addScaledVector(d, -E.dot(d)).normalize()
      n[o + 3] = sgn * MathUtils.radToDeg(Math.atan2(_v4.crossVectors(p0, pa).dot(d), p0.dot(pa)))
    }
  }

  apply(rig: RobotRig, root: Matrix4, g: GaitPose): Record<Side, GaitLeg> {
    const w = this.weight
    const v = this.pose.v
    const d = rig.dims
    const local = rig.local
    for (let k = 0; k < local.length; k++) this.gaitQ[k].copy(local[k].q)

    // pelvis frame
    root.decompose(_t0, _q0, _s)
    _m0.makeTranslation(v[CH.hipX], -d.robotF, d.hipZ - d.crouch - v[CH.hipDrop])
      .multiply(_m1.makeRotationX(deg(v[CH.hipPitch])))
      .multiply(_m1.makeRotationY(deg(v[CH.hipRoll])))
      .multiply(_m1.makeRotationZ(deg(v[CH.hipYaw])))
      .decompose(_t1, _q1, _s)
    root.compose(_t0.lerp(_t1, w), _q0.slerp(_q1, w), _one)

    // torso: spine and chest their own channels, the head's split over neck and head
    for (const [k, c, name] of this.idx.torso) {
      const share = name === 'neck' ? 0.35 : name === 'head' ? 0.65 : 1
      eulerXYZ(v[c] * share, v[c + 1] * share, v[c + 2] * share, _q2)
      local[k].q.copy(rig.stand[k].q).multiply(_q2)
      local[k].q.copy(this.gaitQ[k].slerp(local[k].q, w))
    }
    rig.forward(root)

    // the weapon hand first: the other hand may hold the weapon where it ends up
    const main = this.build.main
    this.solveArm(rig, main, w, v[WEAPON + 6])
    rig.forward(root)
    this.weapon.multiplyMatrices(rig.world[this.idx.arm[main].hand], this.grip)
    const off: Side = main === 'R' ? 'L' : 'R'
    this.solveArm(rig, off, w, v[WEAPON + 7])
    rig.forward(root)

    this.fingers(rig, g, w)
    return this.feet(rig, g, w)
  }

  /**
   * One arm: a fist target from its channels, blended toward the weapon target
   * by `hold` (the main hand's grip where the weapon channels put the weapon,
   * or the off hand's grip on the weapon as it is), solved by two-bone IK and
   * blended with the gait's arm by the overlay weight.
   *
   * The weapon is placed in the body frame (the heading, at the pelvis; the
   * torso's twist and lean do not turn it), from the main shoulder's rest
   * place: an authored swing is the arc the weapon sweeps, and the arms and
   * torso follow it.
   */
  private solveArm(rig: RobotRig, side: Side, w: number, hold: number): void {
    const v = this.pose.v
    const a = this.idx.arm[side]
    const o = ARM[side]
    const sgn = side === 'L' ? 1 : -1
    const [L1, L2] = this.armLength[side]
    const chestQ = _qc.setFromRotationMatrix(rig.world[this.idx.chest])
    const S = _vs.setFromMatrixPosition(rig.world[a.upper])

    // fist: direction, reach, elbow roll
    const az = deg(v[o])
    const el = deg(v[o + 1])
    const dir = _vd.set(sgn * Math.sin(az) * Math.cos(el), -Math.cos(az) * Math.cos(el), Math.sin(el))
    dir.applyQuaternion(chestQ)
    const target = _vt.copy(S).addScaledVector(dir, v[o + 2] * (L1 + L2))

    // weapon: where the grip must be, and the hand's rotation there
    const handQ = _qh
    if (hold > 0) {
      if (side === this.build.main) {
        const x = v[WEAPON], y = v[WEAPON + 1], z = v[WEAPON + 2]
        const at = _vw.set(sgn * x, -y, z).multiplyScalar(L1 + L2).add(this.shoulderRest[side])
          .add(_v1.setFromMatrixPosition(rig.world[this.idx.pelvis]))
        const weaponQ = _qw.setFromAxisAngle(_z, sgn * deg(v[WEAPON + 3]))
          .multiply(_q3.setFromAxisAngle(_x, deg(v[WEAPON + 4])))
          .multiply(_q2.setFromAxisAngle(_z, sgn * deg(v[WEAPON + 5])))
          .multiply(WEAPON_REST)
        handQ.copy(weaponQ).multiply(GRIP_ROT_INV)
        at.sub(_v0.copy(this.gripOffset[side]).applyQuaternion(handQ))
        // A two-handed weapon must fit both arms. Project its wrist target
        // into their shared reach before solving either arm; otherwise the
        // off hand silently clamps short and appears detached from the haft.
        const two = v[CH['w.two']]
        if (two > 0) {
          const off: Side = side === 'R' ? 'L' : 'R'
          const lengths = this.armLength[off]
          const radius = (lengths[0] + lengths[1]) * 0.98
          _offDelta.copy(this.offGrip).applyQuaternion(weaponQ)
            .add(_v0.copy(this.gripOffset[side]).sub(this.gripOffset[off]).applyQuaternion(handQ))
          _offCenter.setFromMatrixPosition(rig.world[this.idx.arm[off].upper]).sub(_offDelta)
          _shared.copy(at)
          for (let k = 0; k < 6; k++) {
            projectReach(_shared, _offCenter, radius)
            projectReach(_shared, S, (L1 + L2) * 0.98)
          }
          at.lerp(_shared, two)
        }
        target.lerp(at, hold)
      } else {
        this.weapon.decompose(_vw, _qw, _s)
        handQ.copy(_qw).multiply(GRIP_ROT_INV)
        const at = _vw.add(_v0.copy(this.offGrip).applyQuaternion(_qw)).sub(_v1.copy(this.gripOffset[side]).applyQuaternion(handQ))
        target.lerp(at, hold)
      }
    }

    // Build the elbow plane from the actual blended wrist direction. A pole
    // from the unused fist target can become parallel to a weapon arm and
    // flip the elbow when its projection crosses zero during release.
    dir.copy(target).sub(S).normalize().applyQuaternion(_q0.copy(chestQ).invert())
    const pole = basePole(dir, sgn, _vp).applyAxisAngle(dir, sgn * deg(v[o + 3])).applyQuaternion(chestQ)

    // two-bone IK (+Y of the upper arm faces the elbow)
    const parentQ = _qp.setFromRotationMatrix(rig.world[a.parent])
    const flex = solveArm(S, target, L1, L2, pole, parentQ, _q1)
    const local = rig.local
    local[a.upper].q.copy(this.gaitQ[a.upper]).slerp(_q1, w)
    local[a.fore].q.copy(this.gaitQ[a.fore]).slerp(_q2.setFromAxisAngle(_x, -flex), w)

    // the hand: the stand's with the wrist channels, or turned to the weapon
    eulerXYZ(v[o + 4], sgn * v[o + 5], sgn * v[o + 6], _q3)
    const fist = _q2.copy(rig.stand[a.hand].q).multiply(_q3)
    if (hold > 0) {
      // the forearm's world rotation as it will be: parent * upper * fore (the hand's own offset turns nothing)
      const fore = _q3.copy(parentQ).multiply(_q1).multiply(_q4.setFromAxisAngle(_x, -flex)).invert()
      // A shortest-path slerp can switch sides at 180 degrees as the weapon
      // rotates. At partial grip that turns into a visible one-frame wrist
      // flip. Unwrap the relative quaternion before applying the grip weight.
      const delta = _q6.copy(fist).invert().multiply(fore.multiply(handQ)).normalize()
      const previous = this.wristDelta[side]
      const continuous = this.wristWeight[side] > 0 && this.wristWeight[side] < 1
      if (continuous ? delta.dot(previous) < 0 : delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w)
      previous.copy(delta)
      this.wristWeight[side] = hold
      const sine = Math.hypot(delta.x, delta.y, delta.z)
      const angle = Math.atan2(sine, delta.w)
      const axis = this.wristAxis[side]
      if (sine > 1e-6) axis.set(delta.x, delta.y, delta.z).multiplyScalar(1 / sine)
      fist.multiply(_q7.setFromAxisAngle(axis, 2 * angle * hold))
    } else this.wristWeight[side] = 0
    local[a.hand].q.copy(this.gaitQ[a.hand]).slerp(fist, w)
  }

  /** Fingers close from the gait's curl toward the channel's grip. */
  private fingers(rig: RobotRig, g: GaitPose, w: number): void {
    const d = rig.dims
    const fist = this.build.fist
    for (const side of SIDES) {
      const s = side === 'L' ? 1 : -1
      const grip = this.pose.v[ARM[side] + 7]
      const hold = this.pose.v[side === this.build.main ? CH['w.wield'] : CH['w.two']]
      const f = this.idx.arm[side].fingers
      for (let k = 0; k < f.length; k++) {
        const j = k % 3
        const gait = d.fingerCurl[j] * g.curl / GAIT_REST_CURL
        const closed = fist[j] + (this.build.handle[j] - fist[j]) * hold
        const combat = d.fingerCurl[j] + (closed - d.fingerCurl[j]) * grip
        eulerXYZ(0, s * (gait + (combat - gait) * w), 0, rig.local[f[k]].q)
      }
      const thumbs = this.idx.arm[side].thumbs
      for (let j = 0; j < thumbs.length; j++) {
        const k = thumbs[j]
        eulerXYZ(j === 0 ? this.build.thumb[j] : 0, j === 0 ? 0 : s * this.build.thumb[j], 0, _q0)
        _q1.copy(rig.stand[k].q).multiply(_q0)
        rig.local[k].q.copy(this.gaitQ[k]).slerp(_q1, grip * w)
      }
    }
  }

  /** Leg targets: the gait's and the planner's blended; an overreaching planted foot rises onto its toe. */
  private feet(rig: RobotRig, g: GaitPose, w: number): Record<Side, GaitLeg> {
    const d = rig.dims
    const stanceX = d.stanceX ?? d.hipX
    const footF = d.footF ?? d.robotF
    const reach = (d.thigh + d.shin) * LEG_REACH
    const sole = this.build.sole
    for (const side of SIDES) {
      const s = side === 'L' ? 1 : -1
      const a = g.legs[side]
      const c = this.pose.legs[side]
      const out = this.legs[side]
      out.x = (a.x ?? s * stanceX) + (c.x - (a.x ?? s * stanceX)) * w
      out.step = a.step + (c.step - a.step) * w
      out.up = a.up + (c.up - a.up) * w
      out.pitch = a.pitch + (c.pitch - a.pitch) * w
      out.yaw = (a.yaw ?? 0) + (c.yaw - (a.yaw ?? 0)) * w
      const hip = _v0.setFromMatrixPosition(rig.world[this.idx.hip[side]])
      const far = (leg: GaitLeg): number => _v1.set(leg.x ?? 0, -(footF + leg.step), d.ankleZ + leg.up).distanceTo(hip)
      if (far(out) <= reach) continue
      // pivot about the toe edge until the ankle is within reach
      const step = out.step, up = out.up, pitch = out.pitch
      let lo = 0, hi = 1.1
      for (let k = 0; k < 14; k++) {
        const phi = (lo + hi) / 2
        toePivot(step, up, pitch, phi, sole, out)
        if (far(out) > reach) lo = phi
        else hi = phi
      }
      toePivot(step, up, pitch, hi, sole, out)
    }
    return this.legs
  }
}

/** Raise the heel by `phi` (rad) about the toe edge: the ankle rides the arc about it. */
export function toePivot(step: number, up: number, pitch: number, phi: number, sole: CombatBuild['sole'], out: GaitLeg): GaitLeg {
  out.step = step + sole.toe * (1 - Math.cos(phi)) + sole.ankle * Math.sin(phi)
  out.up = up + sole.toe * Math.sin(phi) + sole.ankle * (Math.cos(phi) - 1)
  out.pitch = pitch + phi
  return out
}

/** Default elbow direction for a hand direction `d` (chest frame), perpendicular to it. */
function basePole(d: Vector3, sgn: number, out: Vector3): Vector3 {
  out.set(POLE.x * sgn, POLE.y, POLE.z)
  out.addScaledVector(d, -out.dot(d))
  if (out.lengthSq() < 1e-6) out.set(sgn, 0, 0).addScaledVector(d, -d.x * sgn)
  return out.normalize()
}

/** Keep a wrist inside an arm's reach, preserving a little elbow flexion. */
function projectReach(target: Vector3, shoulder: Vector3, radius: number): void {
  _reach.subVectors(target, shoulder)
  const distance = _reach.length()
  if (distance > radius) target.copy(shoulder).addScaledVector(_reach, radius / distance)
}

/**
 * Two-bone arm IK: the upper arm's local rotation (in its parent, world
 * rotation `parentQ`) that puts the wrist on `target` with the elbow toward
 * `pole`; returns the elbow flexion (rad). The upper arm runs along its -Z,
 * its +Y faces the elbow, and the forearm bends toward -Y (a negative X turn).
 */
export function solveArm(S: Vector3, target: Vector3, L1: number, L2: number, pole: Vector3, parentQ: Quaternion, out: Quaternion): number {
  const toT = _a.subVectors(target, S)
  const D = MathUtils.clamp(toT.length(), Math.abs(L1 - L2) + 1e-4, (L1 + L2) * 0.9995)
  const dir = toT.normalize()
  const a = Math.acos(MathUtils.clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1))
  const p = _b.copy(pole).addScaledVector(dir, -pole.dot(dir))
  if (p.lengthSq() < 1e-8) p.set(0, 0, -1).addScaledVector(dir, -dir.z)
  p.normalize()
  const upper = _c.copy(dir).multiplyScalar(Math.cos(a)).addScaledVector(p, Math.sin(a))
  const z = upper.negate()
  const y = _d.copy(p).multiplyScalar(Math.cos(a)).addScaledVector(dir, -Math.sin(a)).normalize()
  const x = _e.crossVectors(y, z)
  out.setFromRotationMatrix(_m2.makeBasis(x, y, z))
  out.premultiply(_q5.copy(parentQ).invert())
  return Math.PI - Math.acos(MathUtils.clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1))
}

/** The gait at rest: the stand the neutral channels are measured from. */
const REST_GAIT: GaitPose = {
  legs: { R: { step: 0, up: 0, pitch: 0 }, L: { step: 0, up: 0, pitch: 0 } },
  crouch: 0.1, sway: 0, arms: { R: 0, L: 0 }, elbow: { R: 0, L: 0 },
  lean: 0, roll: 0, twist: 0, breath: 0, headYaw: 0, headPitch: 0, curl: GAIT_REST_CURL,
}

const _one = new Vector3(1, 1, 1)
const _x = new Vector3(1, 0, 0)
const _z = new Vector3(0, 0, 1)
const _s = new Vector3()
const _t0 = new Vector3()
const _t1 = new Vector3()
const _v0 = new Vector3()
const _v1 = new Vector3()
const _v2 = new Vector3()
const _v3 = new Vector3()
const _v4 = new Vector3()
const _vs = new Vector3()
const _vd = new Vector3()
const _vp = new Vector3()
const _vt = new Vector3()
const _vw = new Vector3()
const _offDelta = new Vector3()
const _offCenter = new Vector3()
const _shared = new Vector3()
const _reach = new Vector3()
const _a = new Vector3()
const _b = new Vector3()
const _c = new Vector3()
const _d = new Vector3()
const _e = new Vector3()
const _q0 = new Quaternion()
const _q1 = new Quaternion()
const _q2 = new Quaternion()
const _q3 = new Quaternion()
const _q4 = new Quaternion()
const _q5 = new Quaternion()
const _q6 = new Quaternion()
const _q7 = new Quaternion()
const _qc = new Quaternion()
const _qh = new Quaternion()
const _qp = new Quaternion()
const _qw = new Quaternion()
const _m0 = new Matrix4()
const _m1 = new Matrix4()
const _m2 = new Matrix4()
