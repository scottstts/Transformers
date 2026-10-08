import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three/webgpu'
import { eulerXYZ, type GaitLeg, type GaitPose, type RigOverlay, type RobotRig } from '../model/rig'
import { ARM, CH, CHANNELS, SIDES, WEAPON, createCombatPose, type CombatPose, type Side } from './pose'
import { toeRoll, type AnkleOffset, type SoleEdges } from '../animation/sole'

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
  /** sole: heel and toe edges behind / ahead of the ankle, ankle height and edge rounding (m), as the gait style has them */
  sole: SoleEdges
  /**
   * The weapon is held by pistol grips (a gun): its grips run across the
   * fist, its barrels (weapon +z) leave past the knuckles and its top
   * (weapon +x) faces the index finger. Default: a haft through the fist.
   */
  pistol?: boolean
  /**
   * The main hand's wrist follows its forearm: the weapon's roll about its
   * haft is chosen so the knuckles run on along the forearm (the wrist
   * straight, bent only as far as the haft's angle to the arm demands), and
   * `w.roll` turns the knuckles from there. For a long haft held in one hand,
   * whose butt must pass the forearm on the fist's far side at any angle.
   */
  wristFollows?: boolean
  /**
   * The main arm holds its weapon as a person holds a one-handed blade
   * (with `wristFollows`): the elbow and the forearm place the blade, the
   * wrist only finishes it. Every frame the elbow takes the roll that leaves
   * the hand least turned on its forearm (from the stand's hand: a forearm
   * turns about `twist` either way, palm down to palm up; past it the arm
   * reads wrung) without riding up into a chicken wing while the hand is
   * low (`wing`, deg off the shoulder-hand line) or tucking in across the
   * chest (a car's front end stands out there: an elbow more than `tuck` m
   * inside the shoulder runs into it), near the last frame's roll
   * so it never swaps sides, and moving from it no faster than the authored
   * arm and blade move (a better hold reached by a turn of the elbow is
   * reached over frames, never in one); the blade is then kept within `bend`
   * of square to the forearm (and `w.bend` further, which the grip takes by
   * pivoting diagonally in the fist: the hand stays at `bend`) and `twist`
   * of the stand's turn about it. The weapon channels' direction is the wish
   * the arm finishes, and the elbow channel goes unused while the weapon is held.
   */
  natural?: { twist: number; bend: number; wing: number; tuck: number }
}

/**
 * Weapon axes in a hand's frame (`thumb`: the knuckle row's direction toward
 * the thumb, HandLayout). A haft: it leaves the fist on the thumb's side
 * (weapon +z), the edge (weapon +x) faces the knuckles (hand -z); two hands on
 * one haft hold it palm to palm. A pistol grip: the barrels (weapon +z) leave
 * past the knuckles, the top (weapon +x) faces the thumb's side; the right
 * palm faces the gun's left side, the left palm its right side. For the
 * older rigs the thumb's side is hand -y (the index finger's); the Impala's
 * thumbs sit across the hand, so its two hands' grips mirror.
 */
function gripRotation(thumb: Vector3, pistol: boolean): Quaternion {
  const knuckles = new Vector3(0, 0, -1)
  const x = pistol ? thumb.clone() : knuckles
  const z = pistol ? knuckles : thumb.clone()
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, new Vector3().crossVectors(z, x), z))
}
/** Half a turn about X: the reversed grip. */
const HALF_X = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI)
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
  /** weapon to main hand (its grip, slid along the haft by `w.slide`) */
  readonly grip = new Matrix4()
  /** the grip at the weapon's origin */
  private readonly gripBase = new Matrix4()
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
  /** weapon axes in each hand's frame (gripRotation), and back */
  private readonly gripRot: Record<Side, Quaternion>
  private readonly gripRotInv: Record<Side, Quaternion>
  /** Continuous quaternion branch while a hand takes/releases the weapon. */
  private readonly wristDelta: Record<Side, Quaternion> = { R: new Quaternion(), L: new Quaternion() }
  private readonly wristWeight: Record<Side, number> = { R: 0, L: 0 }
  private readonly wristAxis: Record<Side, Vector3> = { R: new Vector3(1, 0, 0), L: new Vector3(1, 0, 0) }
  private readonly legs: Record<Side, GaitLeg> = { R: { step: 0, up: 0, pitch: 0, x: 0, yaw: 0 }, L: { step: 0, up: 0, pitch: 0, x: 0, yaw: 0 } }
  /**
   * The blade's direction with the hand unturned on its forearm (the stand's
   * hand, the wrist straight), in the flexed forearm's frame (X the elbow's
   * hinge, the bone along -Z): the knuckle row toward the thumb, with the
   * forearm's own turn. The natural hold's turn is measured from it.
   */
  private readonly unturned: Record<Side, Vector3>
  /** the natural hold's elbow roll (deg), and whether it carries over from the last frame */
  private readonly naturalRoll: Record<Side, number> = { R: 0, L: 0 }
  private readonly naturalLive: Record<Side, boolean> = { R: false, L: false }
  /** the blade's direction as the natural hold last held it (world) */
  private readonly lastBlade: Record<Side, Vector3> = { R: new Vector3(0, 0, 1), L: new Vector3(0, 0, 1) }
  /** this frame's wish, the blade held at the end of the last frame, and how far the wish and the arm have turned since (rad) */
  private readonly frameWish: Record<Side, Vector3> = { R: new Vector3(0, 0, 1), L: new Vector3(0, 0, 1) }
  private readonly frameBlade: Record<Side, Vector3> = { R: new Vector3(0, 0, 1), L: new Vector3(0, 0, 1) }
  private readonly bladeStep: Record<Side, number> = { R: Math.PI, L: Math.PI }
  /** the shoulder-to-fist line at the last frame (world) */
  private readonly frameReach: Record<Side, Vector3> = { R: new Vector3(0, 0, -1), L: new Vector3(0, 0, -1) }
  /** the natural hold's roll at the end of the last frame (deg): this frame's may move only so far from it */
  private readonly frameRoll: Record<Side, number> = { R: 0, L: 0 }
  /** the grip's pivot in the fist (w.bend): the turn (world) from the blade the hand holds to the blade held */
  private readonly pivot = new Quaternion()
  /** the side of the forearm the hand last held the blade on (world, square to the forearm) */
  private readonly pivotSide: Record<Side, Vector3> = { R: new Vector3(1, 0, 0), L: new Vector3(1, 0, 0) }
  /** the main hand's weapon rotation as the last solve placed it (world) */
  private readonly weaponQ = new Quaternion()
  /** the main hand's reversed grip (w.reverse): the weapon turned half round its edge's axis in the fist */
  private reversed = false
  private readonly gripRevInv: Quaternion
  private readonly gripBaseRev = new Matrix4()
  private readonly unturnedRev: Record<Side, Vector3>
  /** where the pelvis stands at rest (model frame): the free weapon's origin (w.free) */
  readonly restPelvis = new Vector3()

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
    const hand = rig.hand
    this.gripRot = { R: gripRotation(hand.thumb.R, build.pistol ?? false), L: gripRotation(hand.thumb.L, build.pistol ?? false) }
    this.gripRotInv = { R: this.gripRot.R.clone().invert(), L: this.gripRot.L.clone().invert() }
    this.gripBase.compose(this.gripOffset[build.main], this.gripRot[build.main], _one)
    const half = new Quaternion().setFromAxisAngle(_x, Math.PI)
    this.gripRevInv = half.clone().multiply(this.gripRotInv[build.main])
    this.gripBaseRev.compose(this.gripOffset[build.main], this.gripRot[build.main].clone().multiply(half), _one)
    const unturned = (side: Side): Vector3 => hand.thumb[side].clone().applyQuaternion(rig.stand[this.idx.arm[side].hand].q).applyQuaternion(hand.turn[side])
    this.unturned = { R: unturned('R'), L: unturned('L') }
    this.unturnedRev = { R: this.unturned.R.clone().negate(), L: this.unturned.L.clone().negate() }
    this.grip.copy(this.gripBase)
    this.measureNeutral(rig)
  }

  /** The stand's channels: arms measured from the rig at rest, everything else zero. */
  private measureNeutral(rig: RobotRig): void {
    rig.poseLive(REST_GAIT)
    this.restPelvis.setFromMatrixPosition(rig.world[this.idx.pelvis])
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
      const p0 = basePole(d, sgn, 0, _v3)
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
    const reverse = v[CH['w.reverse']] > 0.5
    if (reverse !== this.reversed) {
      // the hand's wish turns with the grip (a regrip in the air): the hold's memory of the blade turns with it
      this.reversed = reverse
      this.lastBlade[main].negate()
      this.frameBlade[main].negate()
      this.frameWish[main].negate()
    }
    this.solveArm(rig, main, w, v[WEAPON + 6])
    rig.forward(root)
    // the grip's pivot in the fist, in the weapon's frame (the weapon turned back by it, then on by it in the world)
    _qg.copy(this.weaponQ).invert().multiply(this.pivot).multiply(this.weaponQ)
    this.grip.multiplyMatrices(this.reversed ? this.gripBaseRev : this.gripBase, _m1.makeRotationFromQuaternion(_qg)).multiply(_m2.makeTranslation(0, 0, -v[CH['w.slide']]))
    const hand = rig.world[this.idx.arm[main].hand]
    const free = MathUtils.clamp(v[CH['w.free']], 0, 1)
    if (free > 0) {
      // flying free: placed by its own channels, handed over from (and back to) the hand's hold over the channel's ramp
      this.weapon.multiplyMatrices(hand, this.grip).decompose(_t0, _q0, _s)
      _t1.set(v[CH['w.fx']], -v[CH['w.fy']], v[CH['w.fz']]).add(this.restPelvis)
      _q1.set(v[CH['w.qx']], v[CH['w.qy']], v[CH['w.qz']], v[CH['w.qw']]).normalize()
      this.grip.copy(hand).invert().multiply(_m1.compose(_t0.lerp(_t1, free), _q0.slerp(_q1, free), _one))
    }
    this.weapon.multiplyMatrices(hand, this.grip)
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
        const follows = this.build.wristFollows
        const weaponQ = _qw.setFromAxisAngle(_z, sgn * deg(v[WEAPON + 3]))
          .multiply(_q3.setFromAxisAngle(_x, deg(v[WEAPON + 4])))
          .multiply(_q2.setFromAxisAngle(_z, sgn * deg(follows ? 0 : v[WEAPON + 5])))
          .multiply(WEAPON_REST)
        // reversed, the weapon turns half round its edge's axis in the fist: the channels name the blade of the hammer grip (so the
        // hand never sees the regrip), the weapon's blade is its opposite
        if (this.reversed) weaponQ.multiply(HALF_X)
        this.pivot.identity()
        handQ.copy(weaponQ).multiply(this.mainGripInv(side))
        _grip.copy(at)
        at.sub(_v0.copy(this.gripOffset[side]).applyQuaternion(handQ))
        if (this.build.natural) softReach(S, at, L1 + L2)
        let roll = v[o + 3]
        // the natural hold turns the hand, which moves the wrist the arm reaches for: a second pass settles it
        for (let pass = 0; pass < (follows && this.build.natural ? 2 : 1); pass++) {
          if (follows && this.build.natural) {
            roll = this.naturalHold(S, at, chestQ, side, weaponQ, v[o + 8], v[o + 3], pass, v[CH['w.bend']])
            this.handFrom(weaponQ, side, handQ)
            softReach(S, at.copy(_grip).sub(_v0.copy(this.gripOffset[side]).applyQuaternion(handQ)), L1 + L2)
            // the final solve below rolls the elbow as far over as the hold has taken the weapon
            this.naturalRoll[side] = roll
          }
          if (follows) {
            // the forearm the arm will take to this wrist, and the roll that runs the knuckles (weapon +x) on along it
            // (the pole as the solve below builds it, the elbow channel's roll included)
            const toWrist = _vd.copy(at).sub(S).normalize().applyQuaternion(_q0.copy(chestQ).invert())
            const pole = basePole(toWrist, sgn, v[o + 8], _vp).applyAxisAngle(toWrist, sgn * deg(roll)).applyQuaternion(chestQ)
            const forearm = forearmTo(S, at, L1, L2, pole, _v3)
            // the knuckles run on along the forearm round the blade the hand holds (the grip's pivot taken out: the blade itself, pivoted
            // nearly onto the forearm's line, leaves the knuckles' turn round it undefined, and the hand flipped about it)
            _qi.copy(this.pivot).invert()
            const haft = _v4.set(0, 0, 1).applyQuaternion(weaponQ).applyQuaternion(_qi)
            forearm.addScaledVector(haft, -forearm.dot(haft))
            if (forearm.lengthSq() > 1e-8) {
              const knuckles = _v1.set(1, 0, 0).applyQuaternion(weaponQ).applyQuaternion(_qi)
              const turn = Math.atan2(_v0.crossVectors(knuckles, forearm).dot(haft), knuckles.dot(forearm)) + sgn * deg(v[WEAPON + 5])
              weaponQ.multiply(_q2.setFromAxisAngle(_z, turn))
              this.handFrom(weaponQ, side, handQ)
              at.copy(_grip).sub(_v0.copy(this.gripOffset[side]).applyQuaternion(handQ))
              if (this.build.natural) softReach(S, at, L1 + L2)
            }
          }
        }
        // A two-handed weapon must fit both arms. Project its wrist target
        // into their shared reach before solving either arm; otherwise the
        // off hand silently clamps short and appears detached from the haft.
        const two = v[CH['w.two']]
        if (two > 0) {
          const off: Side = side === 'R' ? 'L' : 'R'
          const lengths = this.armLength[off]
          const radius = (lengths[0] + lengths[1]) * 0.98
          // the off grip from the main hand's grip, which `w.slide` has moved along the haft
          _offDelta.copy(this.offGrip).setZ(this.offGrip.z - v[CH['w.slide']]).applyQuaternion(weaponQ)
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
        this.weaponQ.copy(weaponQ)
      } else {
        this.weapon.decompose(_vw, _qw, _s)
        handQ.copy(_qw).multiply(this.gripRotInv[side])
        const at = _vw.add(_v0.copy(this.offGrip).applyQuaternion(_qw)).sub(_v1.copy(this.gripOffset[side]).applyQuaternion(handQ))
        target.lerp(at, hold)
      }
    }

    // Build the elbow plane from the actual blended wrist direction. A pole
    // from the unused fist target can become parallel to a weapon arm and
    // flip the elbow when its projection crosses zero during release.
    dir.copy(target).sub(S).normalize().applyQuaternion(_q0.copy(chestQ).invert())
    const natural = this.build.natural !== undefined && side === this.build.main && hold > 0
    if (!natural) this.naturalLive[side] = false
    const elbowRoll = natural ? v[o + 3] + (this.naturalRoll[side] - v[o + 3]) * hold : v[o + 3]
    const pole = basePole(dir, sgn, v[o + 8], _vp).applyAxisAngle(dir, sgn * deg(elbowRoll)).applyQuaternion(chestQ)

    // two-bone IK (+Y of the upper arm faces the elbow)
    const parentQ = _qp.setFromRotationMatrix(rig.world[a.parent])
    const flex = solveArm(S, target, L1, L2, pole, parentQ, _q1)
    const local = rig.local
    // the elbow's flexion, on top of the forearm's own turn about its axis (which moves neither elbow nor wrist)
    const turn = rig.hand.turn[side]
    local[a.upper].q.copy(this.gaitQ[a.upper]).slerp(_q1, w)
    local[a.fore].q.copy(this.gaitQ[a.fore]).slerp(_q2.setFromAxisAngle(_x, -flex).multiply(turn), w)

    // the hand: the stand's with the wrist channels, or turned to the weapon
    eulerXYZ(v[o + 4], sgn * v[o + 5], sgn * v[o + 6], _q3)
    const fist = _q2.copy(rig.stand[a.hand].q).multiply(_q3)
    if (hold > 0) {
      // the forearm's world rotation as it will be: parent * upper * fore (the hand's own offset turns nothing)
      const fore = _q3.copy(parentQ).multiply(_q1).multiply(_q4.setFromAxisAngle(_x, -flex)).multiply(turn).invert()
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

  /** The main hand's rotation holding the weapon at `weaponQ`: turned back by the grip's pivot in the fist. */
  private handFrom(weaponQ: Quaternion, side: Side, out: Quaternion): Quaternion {
    return out.copy(weaponQ).premultiply(_qi.copy(this.pivot).invert()).multiply(this.mainGripInv(side))
  }

  /** The main hand's grip, weapon to hand (reversed with w.reverse). */
  private mainGripInv(side: Side): Quaternion {
    return this.reversed ? this.gripRevInv : this.gripRotInv[side]
  }

  /** The blade's direction with the hand unturned on its forearm, as the grip holds it (reversed: out of the little finger's side). */
  private handBlade(side: Side): Vector3 {
    return this.reversed ? this.unturnedRev[side] : this.unturned[side]
  }

  /**
   * The natural hold (CombatBuild.natural) of the weapon at `weaponQ` with
   * its wrist at `at`: the elbow roll (deg, ROLLS) the arm takes there, and
   * `weaponQ` turned so its blade is the one the arm can hold. The roll is
   * scored for the hand's turn on its forearm, the elbow's wing while the
   * hand is low, how far the blade has to give from the wish and how far the
   * roll moves from the last frame's; allocation-free.
   */
  private naturalHold(S: Vector3, at: Vector3, chestQ: Quaternion, side: Side, weaponQ: Quaternion, out: number, authored: number, pass: number, extra: number): number {
    const toWrist = _nd.copy(at).sub(S).normalize().applyQuaternion(_nq.copy(chestQ).invert())
    const wish = _nw.set(0, 0, 1).applyQuaternion(weaponQ)
    const live = this.naturalLive[side]
    if (pass === 0) {
      // how far the wish has turned since the last frame, and where the blade and the forearm were then
      this.bladeStep[side] = live ? this.frameWish[side].angleTo(wish) : Math.PI
      this.frameWish[side].copy(wish)
      this.frameBlade[side].copy(this.lastBlade[side])
      // and how far the shoulder-to-fist line has turned: the authored arm's own motion (not the solved forearm's, which a change of hold throws)
      _bl.copy(at).sub(S).normalize()
      this.bladeStep[side] += live ? this.frameReach[side].angleTo(_bl) : 0
      this.frameReach[side].copy(_bl)
      this.frameRoll[side] = live ? this.naturalRoll[side] : authored
    }
    const last = live ? this.naturalRoll[side] : authored
    const bend = this.build.natural!.bend + Math.max(0, extra)
    // the grid finds the basin; a golden-section search inside it finds the roll itself, so it moves smoothly
    // with the pose (snapping from grid roll to grid roll jerked the elbow, plain in slow motion)
    let best = last, bestCost = Infinity
    for (let k = 0; k < ROLLS; k++) {
      const roll = ROLL_FROM + k * ROLL_STEP
      const cost = this.holdCost(S, at, chestQ, side, toWrist, wish, out, roll, last, live, bend)
      if (cost < bestCost) { bestCost = cost; best = roll }
    }
    let lo = best - ROLL_STEP, hi = best + ROLL_STEP
    for (let k = 0; k < ROLL_REFINE; k++) {
      const m1 = hi - (hi - lo) * GOLDEN, m2 = lo + (hi - lo) * GOLDEN
      if (this.holdCost(S, at, chestQ, side, toWrist, wish, out, m1, last, live, bend) <= this.holdCost(S, at, chestQ, side, toWrist, wish, out, m2, last, live, bend)) hi = m2
      else lo = m1
    }
    best = (lo + hi) / 2
    // a better hold a turn of the elbow away is reached over frames: the roll moves no faster than the authored arm and blade
    // drive it (a wish turning through where the hand would wring flipped the elbow to its other side in a frame)
    if (live) {
      const reach = ROLL_RATE * MathUtils.radToDeg(this.bladeStep[side]) + ROLL_SLACK
      best = rollApart(this.frameRoll[side] + MathUtils.clamp(rollApart(best, this.frameRoll[side]), -reach, reach), 0)
    }
    // the blade the arm holds at that roll: within the wrist's bend, turned round the forearm no further than the limit
    const limits = this.build.natural!
    const sgn = side === 'L' ? 1 : -1
    const [L1, L2] = this.armLength[side]
    basePole(toWrist, sgn, out, _np).applyAxisAngle(toWrist, sgn * deg(best)).applyQuaternion(chestQ)
    armTo(S, at, L1, L2, _np, _nf, _nh, _ne)
    bladeWithin(wish, _nf, bend, this.lastBlade[side], _nb)
    const turn = handTurn(_nb, _nf, _nh, this.handBlade(side))
    if (Math.abs(turn) > limits.twist) {
      // turned back to the limit on the side nearer where the blade last was: a wish half a turn off the hand's
      // own side flips the turn's sign from frame to frame, and the nearer limit by sign threw the blade across.
      // It keeps that side only while the other holds the blade no more than TURN_SWITCH nearer the wish: kept
      // regardless, an arm brought into a new pose from the far side (a guard raised mid-swing) stayed on it, its
      // blade far off the pose's and creeping for a second
      const a = _nc.copy(_nb).applyAxisAngle(_nf, deg(limits.twist - turn))
      const b = _nb.applyAxisAngle(_nf, deg(-limits.twist - turn))
      const last = this.lastBlade[side]
      let pick = turn > 0
      if (this.naturalLive[side] && Math.abs(Math.abs(turn) - 180) < 60) {
        const keepA = a.dot(last) > b.dot(last)
        const nearer = a.angleTo(wish) - b.angleTo(wish)
        pick = keepA ? nearer < TURN_SWITCH : nearer < -TURN_SWITCH
      }
      if (pick) b.copy(a)
    }
    // where the holdable blade changes regime (the wrist's clamp, the hand's turn at its limit, one hold to another) it can
    // jump in a frame; held, it turns no faster than the wish and the forearm carrying it drive it (half again, and a
    // little over), so it catches up rather than pops, and still keeps up with a fast arm
    const step = 1.5 * this.bladeStep[side] + BLADE_SLACK
    const jump = this.frameBlade[side].angleTo(_nb)
    if (live && jump > step) {
      _bl.crossVectors(this.frameBlade[side], _nb)
      if (_bl.lengthSq() > 1e-12) _nb.copy(this.frameBlade[side]).applyAxisAngle(_bl.normalize(), step)
    }
    this.lastBlade[side].copy(_nb)
    weaponQ.premultiply(_nq.setFromUnitVectors(wish, _nb))
    // past the wrist's bend the grip pivots in the fist: the hand holds the blade turned back to the wrist's limit
    // (the side of the forearm the hand holds it on: a blade pivoted near the forearm's line leaves it undefined, so there it keeps to the
    // side it was last held on, handing over as the blade leans off the line, as the wrist's clamp does)
    const along = _nb.dot(_nf)
    const limit = Math.sin(MathUtils.degToRad(limits.bend))
    _nc.copy(_nb).addScaledVector(_nf, -along)
    const off = _nc.length()
    const keep = Math.max(0, 1 - off / WISH_SIDE)
    if (keep > 0 && live) {
      const was = _bl.copy(this.pivotSide[side]).addScaledVector(_nf, -this.pivotSide[side].dot(_nf))
      if (was.lengthSq() > 1e-8) _nc.addScaledVector(was.normalize(), WISH_SIDE * keep)
    }
    if (_nc.lengthSq() > 1e-8) this.pivotSide[side].copy(_nc.normalize())
    if (Math.abs(along) > limit && _nc.lengthSq() > 1e-8) {
      _nc.multiplyScalar(Math.cos(MathUtils.degToRad(limits.bend))).addScaledVector(_nf, Math.sign(along) * limit)
      this.pivot.setFromUnitVectors(_nc, _nb)
    } else this.pivot.identity()
    this.naturalLive[side] = true
    return best
  }

  /** The natural hold's score for an elbow roll (deg): the hand's turn, the elbow's wing and tuck, the blade's give and the roll's move from the last frame's. */
  private holdCost(S: Vector3, at: Vector3, chestQ: Quaternion, side: Side, toWrist: Vector3, wish: Vector3, out: number, roll: number, last: number, live: boolean, bend: number): number {
    const limits = this.build.natural!
    const sgn = side === 'L' ? 1 : -1
    const [L1, L2] = this.armLength[side]
    basePole(toWrist, sgn, out, _np).applyAxisAngle(toWrist, sgn * deg(roll)).applyQuaternion(chestQ)
    armTo(S, at, L1, L2, _np, _nf, _nh, _ne)
    bladeWithin(wish, _nf, bend, this.lastBlade[side], _nb)
    const turn = Math.abs(handTurn(_nb, _nf, _nh, this.handBlade(side)))
    const wing = at.z < S.z - 0.3 ? elbowWing(S, at, _ne) : 0
    const give = MathUtils.radToDeg(Math.acos(MathUtils.clamp(_nb.dot(wish), -1, 1)))
    // how far the elbow sits inside the shoulder, across the chest (chest frame: +x the robot's left)
    const inside = -sgn * _ni.subVectors(_ne, S).applyQuaternion(_nqi.copy(chestQ).invert()).x - limits.tuck
    return Math.max(0, turn - limits.twist * 0.53) ** 2 + 2 * Math.max(0, turn - limits.twist) ** 2
      + 0.6 * Math.max(0, wing - limits.wing) ** 2 + 0.5 * give * give + (live ? ROLL_STAY : 0.04) * rollApart(roll, last) ** 2
      + (inside > 0 ? 9000 * inside * inside : 0)
  }

  /** Fingers close from the gait's curl toward the channel's grip. */
  private fingers(rig: RobotRig, g: GaitPose, w: number): void {
    const fist = this.build.fist
    const open = rig.hand.stand
    for (const side of SIDES) {
      const grip = this.pose.v[ARM[side] + 7]
      const hold = this.pose.v[side === this.build.main ? CH['w.wield'] : CH['w.two']]
      const f = this.idx.arm[side].fingers
      for (let k = 0; k < f.length; k++) {
        const j = k % 3
        const stand = open[f[k]]
        const gait = stand * g.curl / GAIT_REST_CURL
        const closed = fist[j] + (this.build.handle[j] - fist[j]) * hold
        const combat = stand + (closed - stand) * grip
        rig.fingerFlex(side, gait + (combat - gait) * w, rig.local[f[k]].q)
      }
      const thumbs = this.idx.arm[side].thumbs
      for (let j = 0; j < thumbs.length; j++) {
        const k = thumbs[j]
        if (j === 0) rig.thumbOppose(side, this.build.thumb[j], _q0)
        else rig.thumbFlex(side, this.build.thumb[j], _q0)
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
export function toePivot(step: number, up: number, pitch: number, phi: number, sole: SoleEdges, out: GaitLeg): GaitLeg {
  toeRoll(sole, phi, _roll)
  out.step = step + _roll.step
  out.up = up + _roll.up
  out.pitch = pitch + phi
  return out
}

/**
 * Default elbow direction for a hand direction `d` (chest frame), perpendicular to it,
 * handed toward the arm's outward side by `out` (0..1). A hand raised overhead points
 * nearly straight away from POLE, whose projection then shrinks and spins; outward
 * is defined there.
 */
function basePole(d: Vector3, sgn: number, out: number, result: Vector3): Vector3 {
  result.set(POLE.x * sgn, POLE.y, POLE.z)
  result.addScaledVector(d, -result.dot(d))
  if (result.lengthSq() < 1e-6) result.set(sgn, 0, 0).addScaledVector(d, -d.x * sgn)
  result.normalize()
  if (out > 0) {
    _outward.set(sgn, 0, 0).addScaledVector(d, -d.x * sgn)
    if (_outward.lengthSq() > 1e-6) result.lerp(_outward.normalize(), Math.min(1, out))
    if (result.lengthSq() < 1e-6) result.copy(_outward)
  }
  return result.normalize()
}

/** The unit forearm direction of a two-bone arm from shoulder `S` to wrist `W`, its elbow toward `pole` (as solveArm places it). */
function forearmTo(S: Vector3, W: Vector3, L1: number, L2: number, pole: Vector3, out: Vector3): Vector3 {
  const toW = _a.subVectors(W, S)
  const D = MathUtils.clamp(toW.length(), Math.abs(L1 - L2) + 1e-4, (L1 + L2) * 0.9995)
  const dir = toW.normalize()
  const a = Math.acos(MathUtils.clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1))
  const p = _b.copy(pole).addScaledVector(dir, -pole.dot(dir))
  if (p.lengthSq() < 1e-8) p.set(0, 0, -1).addScaledVector(dir, -dir.z)
  p.normalize()
  // the elbow, then the wrist from it
  const elbow = _c.copy(S).addScaledVector(dir, L1 * Math.cos(a)).addScaledVector(p, L1 * Math.sin(a))
  return out.copy(S).addScaledVector(dir, D).sub(elbow).normalize()
}

/** The natural hold's elbow rolls (deg): the whole circle from ROLL_FROM in ROLL_STEP steps. */
const ROLL_FROM = -180
const ROLL_STEP = 10
const ROLLS = 36
/**
 * What moving the roll from the last frame's costs (per degree squared): an
 * arm with several holds of near equal score swapped between them frame to
 * frame (the elbow thrown round the arm); it moves on only for a clearly
 * better hold.
 */
const ROLL_STAY = 0.6
/** How far the natural hold's roll may move in a frame (deg): per degree the wish and the arm turn in it, and over that. */
const ROLL_RATE = 2
const ROLL_SLACK = 3

/** The roll `a` minus `b` round the circle (deg, -180..180). */
const rollApart = (a: number, b: number): number => ((a - b) % 360 + 540) % 360 - 180
/** Golden-section steps refining the best grid roll (to about a tenth of a degree), and the section's ratio. */
const ROLL_REFINE = 12
const GOLDEN = 0.618034

/** A two-bone arm from shoulder `S` to wrist `W`, its elbow toward `pole`, as solveArm places it: the forearm's direction, the elbow's hinge axis (the upper arm's +X) and the elbow. */
function armTo(S: Vector3, W: Vector3, L1: number, L2: number, pole: Vector3, forearm: Vector3, hinge: Vector3, elbow: Vector3): void {
  const toW = _a.subVectors(W, S)
  const D = MathUtils.clamp(toW.length(), Math.abs(L1 - L2) + 1e-4, (L1 + L2) * 0.9995)
  const dir = toW.normalize()
  const a = Math.acos(MathUtils.clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1))
  const p = _b.copy(pole).addScaledVector(dir, -pole.dot(dir))
  if (p.lengthSq() < 1e-8) p.set(0, 0, -1).addScaledVector(dir, -dir.z)
  p.normalize()
  const upper = _c.copy(dir).multiplyScalar(Math.cos(a)).addScaledVector(p, Math.sin(a))
  elbow.copy(S).addScaledVector(upper, L1)
  forearm.copy(S).addScaledVector(dir, D).sub(elbow).normalize()
  // the upper arm's frame: +Y toward the elbow's side, the bone along -Z; the hinge is its X
  const y = _d.copy(p).multiplyScalar(Math.cos(a)).addScaledVector(dir, -Math.sin(a))
  hinge.crossVectors(y, upper.negate()).normalize()
}

/**
 * `wish` bent back to within `bend` (deg) of square to the forearm `f`,
 * keeping where it points round it. A wish nearly along the forearm says
 * almost nothing about that: its little sideways part swings wildly as the
 * arm moves and flipped the blade from side to side, so there the blade
 * keeps to where it last pointed round the forearm (`last`), handing over
 * as the wish leans off the line (WISH_SIDE).
 */
function bladeWithin(wish: Vector3, f: Vector3, bend: number, last: Vector3, out: Vector3): Vector3 {
  out.copy(wish)
  const along = out.dot(f)
  const limit = Math.sin(MathUtils.degToRad(bend))
  if (Math.abs(along) <= limit) return out
  out.addScaledVector(f, -along)
  const side = out.length()
  const hold = Math.max(0, 1 - side / WISH_SIDE)
  if (hold > 0) {
    const was = _bl.copy(last).addScaledVector(f, -last.dot(f))
    if (was.lengthSq() > 1e-8) out.addScaledVector(was.normalize(), WISH_SIDE * hold)
  }
  if (out.lengthSq() < 1e-8) out.crossVectors(f, _z)
  out.normalize().multiplyScalar(Math.cos(MathUtils.degToRad(bend))).addScaledVector(f, Math.sign(along) * limit)
  return out
}

/** Below this sideways share (sine of the wish's angle off the forearm's line) the clamp keeps to the blade's last side. */
const WISH_SIDE = 0.35
/** How much nearer the wish (rad) the hand's other turned-back side must hold the blade before the hold leaves the side it is on. */
const TURN_SWITCH = MathUtils.degToRad(40)
/** What the held blade may turn in a frame over what its wish turns (rad): enough to settle, too little to pop. */
const BLADE_SLACK = MathUtils.degToRad(2)

/** How far (deg, signed about the forearm) the hand turns on its forearm `f` (hinge `X`) to point the blade along `b`, from the unturned hand's (`unturned`, flexed forearm frame). */
function handTurn(b: Vector3, f: Vector3, X: Vector3, unturned: Vector3): number {
  // the flexed forearm's axes: X the hinge, the bone along -Z (so Z = -f), Y = Z x X
  const Y = _e.crossVectors(X, f)
  const rest = _f.copy(X).multiplyScalar(unturned.x).addScaledVector(Y, unturned.y).addScaledVector(f, -unturned.z)
  const r = _g.copy(b).addScaledVector(f, -b.dot(f))
  if (r.lengthSq() < 1e-10) return 0
  r.normalize()
  return MathUtils.radToDeg(Math.atan2(_h.crossVectors(rest, r).dot(f), rest.dot(r)))
}

/** How far (deg) the elbow `E` rides up off the line from the shoulder `S` to the wrist `W` (up is +Z). */
function elbowWing(S: Vector3, W: Vector3, E: Vector3): number {
  const line = _e.subVectors(W, S).normalize()
  const off = _f.subVectors(E, S)
  off.addScaledVector(line, -off.dot(line))
  const n = off.length()
  return n < 1e-4 ? 0 : MathUtils.radToDeg(Math.asin(MathUtils.clamp(off.z / n, -1, 1)))
}

/**
 * A wrist target drawn in as it nears the arm's full reach `L` (from
 * SOFT_REACH of it): the arm straightens toward it without reaching it. A
 * two-bone arm's elbow turns ever faster as the wrist nears full reach, so a
 * wrist moving a centimetre about it flicked the elbow between straight and
 * bent from frame to frame; drawn in, the elbow bends smoothly with distance.
 */
function softReach(S: Vector3, at: Vector3, L: number): void {
  const d = _reach.subVectors(at, S).length()
  const from = L * SOFT_REACH
  if (d <= from) return
  const span = L * 0.998 - from
  at.copy(S).addScaledVector(_reach, (from + span * (1 - Math.exp(-(d - from) / span))) / d)
}
const SOFT_REACH = 0.94

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
const _roll: AnkleOffset = { step: 0, up: 0 }
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
const _outward = new Vector3()
const _offCenter = new Vector3()
const _shared = new Vector3()
const _reach = new Vector3()
const _grip = new Vector3()
const _a = new Vector3()
const _b = new Vector3()
const _c = new Vector3()
const _d = new Vector3()
const _e = new Vector3()
const _f = new Vector3()
const _g = new Vector3()
const _h = new Vector3()
const _nd = new Vector3()
const _nw = new Vector3()
const _np = new Vector3()
const _nf = new Vector3()
const _nh = new Vector3()
const _ne = new Vector3()
const _nb = new Vector3()
const _nq = new Quaternion()
const _ni = new Vector3()
const _nqi = new Quaternion()
const _bl = new Vector3()
const _nc = new Vector3()
const _q0 = new Quaternion()
const _q1 = new Quaternion()
const _q2 = new Quaternion()
const _q3 = new Quaternion()
const _q4 = new Quaternion()
const _q5 = new Quaternion()
const _q6 = new Quaternion()
const _q7 = new Quaternion()
const _qc = new Quaternion()
const _qg = new Quaternion()
const _qi = new Quaternion()
const _qh = new Quaternion()
const _qp = new Quaternion()
const _qw = new Quaternion()
const _m0 = new Matrix4()
const _m1 = new Matrix4()
const _m2 = new Matrix4()
