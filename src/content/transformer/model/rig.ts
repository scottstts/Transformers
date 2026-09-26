import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three/webgpu'
import type { RigBone, RigDims } from '../asset/format'

/**
 * The robot's skeleton in the authoring frame (x = robot left, -y = forward,
 * z = up), mirroring the Blender rigs (ctb/ and f1b/ rig.py, motion.py): joint frames
 * are composed parent -> child as T(offset + slide) * R. The live pose at T = 1
 * starts from the exported stand pose, adds the gait's channels and solves
 * the legs with the same two-bone IK the transformation was audited with.
 */

/**
 * A foot target: ankle forward of its station and up (m), foot pitch (rad, + toe down);
 * optionally the ankle's lateral place in the model frame (m, + left; default: the
 * stance station) and the foot's yaw (rad, + toe turned left).
 */
export interface GaitLeg { step: number; up: number; pitch: number; x?: number; yaw?: number }

/**
 * A second pose laid over the gait (fighting): it may move the pelvis frame and
 * any bone's local rotation, and returns the leg targets the IK then solves.
 * Called with the gait's locals in place and the gait's pelvis frame in `root`.
 */
export interface RigOverlay {
  /** 0..1 how far the overlay owns the pose; 0 leaves the gait untouched */
  readonly weight: number
  apply(rig: RobotRig, root: Matrix4, gait: GaitPose): Record<'R' | 'L', GaitLeg>
}

export interface GaitPose {
  legs: Record<'R' | 'L', GaitLeg>
  crouch: number
  sway: number
  arms: Record<'R' | 'L', number>
  elbow: Record<'R' | 'L', number>
  lean: number
  /** pelvis roll (deg, + drops the left hip) and yaw (deg, + brings the right hip forward) */
  roll: number
  yaw?: number
  /** spine and chest roll against the pelvis (deg): keeps the shoulders level */
  torsoRoll?: number
  twist: number
  breath: number
  headYaw: number
  headPitch: number
  headRoll?: number
  curl: number
  /** height of the lowest foot above the ground (m): run flight and jumps */
  air?: number
  /** Running flight owns body height; sole correction may lift but must not pull it down (0..1). */
  freeFlight?: number
  /** the feet's track and the shoulders' abduction as shares of the rig's (default 1) */
  track?: number
  abduct?: number
  /** upper arm rotated inward about its own axis (deg): the bent forearm comes across the body */
  armTwist?: Record<'R' | 'L', number>
  /** Locomotion knee pole override; the exported pole remains the standing default. */
  kneePoleUp?: number
  /** Minimum knee flexion (degrees); fit pelvis height to the feet before solving IK. */
  minKnee?: number
  /**
   * One leg's targets sampled over the whole stride cycle. The pelvis is
   * lowered for the cycle's longest reach, not the current frame's, so a
   * long stride sets a steady carriage instead of a plunge at every splay.
   */
  stridePath?: readonly GaitLeg[]
  /** The right leg's place in that cycle (0..1); the left leg is half a cycle on. */
  strideCycle?: number
  /**
   * 0..1: how far the pelvis follows the stride's reach step by step (a walk's
   * vault over the stance leg, which may rise above the stand) instead of
   * holding the cycle's lowest carriage.
   */
  vault?: number
}

export interface LocalPose { t: Vector3; q: Quaternion }

const deg = MathUtils.degToRad
const GAIT_REST_CROUCH = 0.1
const GAIT_REST_CURL = 0.45
const FINGERS = ['index', 'middle', 'ring', 'pinky'] as const

/** Blender Euler 'XYZ' (degrees) as a quaternion. */
export function eulerXYZ(x: number, y: number, z: number, out = new Quaternion()): Quaternion {
  return out.setFromEuler(_euler.set(deg(x), deg(y), deg(z), 'ZYX'))
}
const _euler = new Euler()

export class RobotRig {
  readonly names: string[]
  readonly parent: Array<number>
  readonly offset: Vector3[]
  readonly index: Record<string, number> = {}
  /** the exported stand pose (local) */
  readonly stand: LocalPose[]
  readonly dims: RigDims
  /** local pose per bone, written by the pose functions */
  readonly local: LocalPose[]
  /** joint-frame world matrices (authoring frame, before the ground lift) */
  readonly world: Matrix4[]

  constructor(bones: RigBone[], stand: Record<string, number[]>, dims: RigDims) {
    this.dims = dims
    this.names = bones.map((b) => b.name)
    bones.forEach((b, i) => { this.index[b.name] = i })
    this.parent = bones.map((b) => (b.parent ? this.index[b.parent] : -1))
    this.offset = bones.map((b) => new Vector3(...b.offset))
    this.stand = bones.map((b) => {
      const s = stand[b.name]
      return s ? { t: new Vector3(s[4], s[5], s[6]), q: new Quaternion(s[0], s[1], s[2], s[3]) } : { t: new Vector3(), q: new Quaternion() }
    })
    this.local = bones.map(() => ({ t: new Vector3(), q: new Quaternion() }))
    this.world = bones.map(() => new Matrix4())
  }

  /** pelvis joint frame of the last live pose */
  readonly root = new Matrix4()

  /** Stand pose + gait channels (+ an overlay such as a fighting move); legs solved to the foot targets. */
  poseLive(g: GaitPose, overlay: RigOverlay | null = null): void {
    const d = this.dims
    const S = this.stand
    for (let i = 0; i < this.names.length; i++) {
      this.local[i].t.copy(S[i].t)
      this.local[i].q.copy(S[i].q)
    }
    const set = (name: string, q: Quaternion): void => { this.local[this.index[name]].q.copy(q) }
    // torso channels act on top of the stand (a racer's stand leans its spine, levels its head)
    const onStand = (name: string, q: Quaternion): void => { const i = this.index[name]; this.local[i].q.copy(S[i].q).multiply(q) }
    const tmp = _q0

    // pelvis: the stance crouch plus the gait's bob, sway, lean, roll and yaw
    const crouch = d.crouch + (g.crouch - GAIT_REST_CROUCH)
    const root = this.root.makeTranslation(g.sway, -d.robotF, d.hipZ - crouch)
      .multiply(_m0.makeRotationX(deg(g.lean * 0.5)))
      .multiply(_m0.makeRotationY(deg(g.roll)))
      .multiply(_m0.makeRotationZ(deg(g.yaw ?? 0)))

    const torsoRoll = g.torsoRoll ?? 0
    onStand('spine', eulerXYZ(g.lean * 0.4 + g.breath, torsoRoll * 0.6, g.twist, tmp))
    onStand('chest', eulerXYZ(g.lean * 0.3 - g.breath, torsoRoll * 0.4, g.twist * 0.6, tmp))
    onStand('neck', eulerXYZ(-g.lean * 0.4, 0, g.headYaw * 0.4, tmp))
    onStand('head', eulerXYZ(g.headPitch, g.headRoll ?? 0, g.headYaw * 0.6, tmp))
    const curl = g.curl / GAIT_REST_CURL
    const abduct = d.armAbduct * (g.abduct ?? 1)
    for (const [side, s] of [['L', 1], ['R', -1]] as const) {
      set(`upperarm.${side}`, eulerXYZ(g.arms[side], -s * abduct, 0, tmp))
      // twist about the arm's own axis first (it hangs along -Z): the elbow's hinge turns inward
      const twist = g.armTwist?.[side] ?? 0
      if (twist) this.local[this.index[`upperarm.${side}`]].q.multiply(_q1.setFromAxisAngle(Z_AXIS, -s * deg(twist)))
      set(`forearm.${side}`, eulerXYZ(-d.elbowBend + g.elbow[side], 0, 0, tmp))
      for (const f of FINGERS) {
        for (let k = 0; k < 3; k++) set(`${f}${k + 1}.${side}`, eulerXYZ(0, s * d.fingerCurl[k] * curl, 0, tmp))
      }
    }
    const weight = overlay?.weight ?? 0
    this.solve(root, overlay && weight > 0 ? overlay.apply(this, root, g) : g.legs,
      g.track ?? 1, g.kneePoleUp ?? d.kneePoleUp ?? 0, g.minKnee ?? 0, 1 - weight, g)
  }

  /** FK from the local poses; the pelvis joint frame is `root`. */
  forward(root: Matrix4): void {
    const m = _m1
    for (let i = 0; i < this.names.length; i++) {
      const L = this.local[i]
      const p = this.parent[i]
      if (p < 0) {
        this.world[i].copy(root).multiply(m.makeRotationFromQuaternion(L.q))
      } else {
        m.compose(_v0.copy(L.t).add(this.offset[i]), L.q, ONE)
        this.world[i].multiplyMatrices(this.world[p], m)
      }
    }
  }

  private solve(root: Matrix4, legs: Record<'R' | 'L', GaitLeg>, track: number, poleUp: number, minKnee: number, reachWeight: number,
    g: GaitPose): void {
    const d = this.dims
    this.forward(root)
    const stanceX = (d.stanceX ?? d.hipX) * track
    const footF = d.footF ?? d.robotF
    if (minKnee > 0 && reachWeight > 0) {
      // Keep the requested foot stations, not a clamped, skating ankle. A long
      // step lowers the pelvis just enough to leave a soft knee at extension.
      const reachSq = d.thigh * d.thigh + d.shin * d.shin + 2 * d.thigh * d.shin * Math.cos(deg(minKnee))
      const need = (hip: Vector3, leg: GaitLeg, s: number): number => {
        const dx = (leg.x ?? s * stanceX) - hip.x
        const dy = -(footF + leg.step) - hip.y
        return hip.z - (d.ankleZ + leg.up + Math.sqrt(Math.max(0, reachSq - dx * dx - dy * dy)))
      }
      const hipL = _hipL.setFromMatrixPosition(this.world[this.index['hip.L']])
      const hipR = _hipR.setFromMatrixPosition(this.world[this.index['hip.R']])
      let drop = softMaximum(need(hipL, legs.L, 1), need(hipR, legs.R, -1))
      const vault = g.vault ?? 0
      const path = g.stridePath
      let carriage = -Infinity
      if (path) {
        // the reach over the cycle, both legs at each sample (the left half a cycle on)
        const n = path.length
        let mean = 0, c = 0, s = 0
        for (let j = 0; j < n; j++) {
          const v = softMaximum(need(hipR, path[j], -1), need(hipL, path[(j + n / 2) % n], 1))
          _reach[j] = v
          carriage = Math.max(carriage, v)
          const a = 4 * Math.PI * j / n
          mean += v / n
          c += 2 * v * Math.cos(a) / n
          s += 2 * v * Math.sin(a) / n
        }
        if (vault > 0) {
          // a walk vaults: fit one rise and fall per step, raised until every sample is reached
          let clear = -Infinity
          for (let j = 0; j < n; j++) {
            const a = 4 * Math.PI * j / n
            clear = Math.max(clear, _reach[j] - (mean + c * Math.cos(a) + s * Math.sin(a)))
          }
          const a = 4 * Math.PI * (g.strideCycle ?? 0)
          carriage = MathUtils.lerp(carriage, mean + c * Math.cos(a) + s * Math.sin(a) + clear, vault)
        }
      }
      // the current frame's reach still holds wherever the carriage falls short (jumps, overlays)
      drop = softMaximum(carriage, drop)
      // only a vault lifts the pelvis above the stand
      drop = MathUtils.lerp(softMaximum(0, drop), drop, vault)
      if (drop !== 0) {
        root.elements[14] -= drop * reachWeight
        this.forward(root)
      }
    }
    // knee pole: pelvis front, blended with pelvis up for rigs whose legs also fold forward
    const pelvis = _m0.extractRotation(this.world[this.index.pelvis])
    const pole = _v1.set(0, -1, poleUp).applyMatrix4(pelvis).normalize()
    for (const [side, s] of SIDES) {
      const leg = legs[side]
      _v2.set(leg.x ?? s * stanceX, -(footF + leg.step), d.ankleZ + leg.up)
      const knee = solveLeg(this.world[this.index[`hip.${side}`]], _v2, d.thigh, d.shin, pole, this.local[this.index[`thigh.${side}`]].q)
      this.local[this.index[`shin.${side}`]].q.setFromAxisAngle(X_AXIS, knee)
    }
    this.forward(root)
    for (const [side] of SIDES) {
      // foot held level to the ground, turned by its yaw and pitched by the gait
      const leg = legs[side]
      const shin = _q1.setFromRotationMatrix(this.world[this.index[`shin.${side}`]]).invert()
      if (leg.yaw) shin.multiply(_q2.setFromAxisAngle(Z_AXIS, leg.yaw))
      this.local[this.index[`foot.${side}`]].q.copy(shin.multiply(_q2.setFromAxisAngle(X_AXIS, leg.pitch)))
    }
    this.forward(root)
  }
}

const ONE = new Vector3(1, 1, 1)
const X_AXIS = new Vector3(1, 0, 0)
const Z_AXIS = new Vector3(0, 0, 1)
const SIDES = [['L', 1], ['R', -1]] as const
const _m0 = new Matrix4()
const _m1 = new Matrix4()
const _m2 = new Matrix4()
const _q0 = new Quaternion()
const _q1 = new Quaternion()
const _q2 = new Quaternion()
const _v0 = new Vector3()
const _v1 = new Vector3()
const _v2 = new Vector3()
const _a = new Vector3()
const _b = new Vector3()
const _c = new Vector3()
const _d = new Vector3()
const _e = new Vector3()
const _hipL = new Vector3()
const _hipR = new Vector3()
/** per-sample reach of the stride cycle */
const _reach = new Float64Array(64)

/** Ease the change of supporting leg and the onset of compression over 6 cm. */
function softMaximum(a: number, b: number): number {
  const overlap = Math.max(0, 0.06 - Math.abs(a - b))
  return Math.max(a, b) + overlap * overlap / 0.24
}

/**
 * Two-bone leg IK (port of f1b/motion.solve_leg): the thigh frame's -Z runs
 * along the bone and -Y faces the pole. The hinge axis comes from the leg plane
 * (hip -> target, pole), never from the pole against the thigh, which flips the
 * twist when the thigh lines up with the pole (identical to ctb/motion.solve_leg
 * everywhere else). Returns the thigh's local rotation in
 * the hip frame and the knee flexion (radians).
 */
export function solveLeg(hip: Matrix4, target: Vector3, L1: number, L2: number, pole: Vector3, out: Quaternion): number {
  const hi = _m2.copy(hip).invert()
  const t = _a.copy(target).applyMatrix4(hi)
  const p = _b.copy(pole).applyMatrix4(_m0.extractRotation(hi)).normalize()
  let D = Math.min(t.length(), L1 + L2 - 1e-5)
  D = Math.max(D, Math.abs(L1 - L2) + 1e-4)
  const dir = t.normalize()
  const a = Math.acos(MathUtils.clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1))
  const knee = Math.PI - Math.acos(MathUtils.clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1))
  const side = _c.copy(dir).cross(p)
  if (side.lengthSq() < 1e-12) side.set(1, 0, 0)
  side.normalize()
  const thighDir = dir.applyQuaternion(_q0.setFromAxisAngle(side, a)).normalize()
  const z = _d.copy(thighDir).negate()
  const x = side.negate()
  const y = _e.copy(z).cross(x)
  out.setFromRotationMatrix(_m0.makeBasis(x, y, z))
  return knee
}
