import { Matrix4, Quaternion, Vector3, type Object3D, type PerspectiveCamera } from 'three/webgpu'
import { Curve } from '../../content/transformer/combat/curves'
import type { Key } from '../../content/transformer/combat/curves'
import type { Shot, ShotFrame, ShotKey, SpecialMove } from '../../content/transformer/combat/special'

/** Largest number of keys in one shot's track. */
const SHOT_KEYS = 16
const DEFAULT_FOV = 42
/** Lowest the camera may go (m): a lens below the sand would see under the ground plane. */
const FLOOR = 0.3

/** What the director can frame: the robot's pelvis and head, and the weapon's head end while one is out. */
export interface DirectorSubject {
  body: Object3D
  head: Object3D
  /** writes the weapon's head end (world) and returns true, or false while no weapon is out */
  weapon(out: Vector3): boolean
}

/** A keyed point: three monotone curves over one shot's keys (times relative to its first key). */
class Track {
  private readonly curves = [new Curve(SHOT_KEYS + 1), new Curve(SHOT_KEYS + 1), new Curve(SHOT_KEYS + 1)]
  private readonly scratch: Array<Array<[number, number]>> = [[], [], []]
  private t0 = 0

  set(keys: readonly ShotKey[]): void {
    if (keys.length > SHOT_KEYS) throw new Error(`a shot track holds ${SHOT_KEYS} keys, got ${keys.length}`)
    this.t0 = keys[0][0]
    for (let c = 0; c < 3; c++) {
      const rest = this.scratch[c]
      rest.length = 0
      for (let i = 1; i < keys.length; i++) rest.push([keys[i][0] - this.t0, keys[i][c + 1]])
      this.curves[c].set(keys[0][c + 1], rest)
    }
  }

  at(t: number, out: Vector3): Vector3 {
    const u = t - this.t0
    return out.set(this.curves[0].at(u), this.curves[1].at(u), this.curves[2].at(u))
  }
}

/** A keyed number (lens, roll) in the same way, with a value when the shot has no keys. */
class Scalar {
  private readonly curve = new Curve(SHOT_KEYS + 1)
  private readonly rest: Array<[number, number]> = []
  private t0 = 0

  set(keys: readonly Key[] | undefined, fallback: number): void {
    this.rest.length = 0
    if (!keys?.length) {
      this.t0 = 0
      this.curve.set(fallback, undefined)
      return
    }
    this.t0 = keys[0][0]
    for (let i = 1; i < keys.length; i++) this.rest.push([keys[i][0] - this.t0, keys[i][1]])
    this.curve.set(keys[0][1], this.rest)
  }

  at(t: number): number {
    return this.curve.at(t - this.t0)
  }
}

/**
 * The special's camera operator. It plays the special's shot list against
 * the special's clock, in the special's ground frame (where it began, facing
 * its heading), so the same cut frames the move wherever it is played:
 *
 *  - each shot's eye and look points run through their keys, each measured in
 *    its own frame (the ground, the robot's pelvis, its head, the weapon), so a
 *    locked-off ground camera can pan after a robot flying overhead;
 *  - a moving frame may be followed with lag, like an operator panning after it;
 *  - a shot starts with a hard cut, or eases over from wherever the camera was
 *    (the first shot can grow out of the game's own camera);
 *  - from the special's handback time the shot eases into the follow camera's
 *    pose, which the session keeps up to date underneath, so control returns
 *    without a jump.
 *
 * Every ease between two camera poses orbits the robot: yaw about it, distance
 * and height are interpolated and the camera looks where both poses look,
 * so a move from its face round to its back swings round it instead of
 * passing through it.
 *
 * It writes the camera directly; the fight's camera reactions (shake, kick,
 * lens) are applied after it.
 */
export class Director {
  private special: SpecialMove | null = null
  private shot = -1
  private shotStart = 0
  private readonly origin = new Vector3()
  private heading = 0
  private readonly eye = new Track()
  private readonly look = new Track()
  private readonly fov = new Scalar()
  private readonly roll = new Scalar()
  private readonly eyeBase = new Vector3()
  private readonly lookBase = new Vector3()
  private primed = false
  private readonly fromPosition = new Vector3()
  private readonly fromQuaternion = new Quaternion()
  private fromFov = DEFAULT_FOV
  private blend = 0
  private readonly position = new Vector3()
  private readonly quaternion = new Quaternion()
  private readonly matrix = new Matrix4()

  get active(): boolean {
    return this.special !== null
  }

  /** Film `special` from its first shot; its ground frame starts at `origin` facing `heading`. */
  start(special: SpecialMove, origin: Vector3, heading: number): void {
    this.special = special
    this.origin.copy(origin)
    this.heading = heading
    this.shot = -1
  }

  stop(): void {
    this.special = null
    this.shot = -1
  }

  /** Whether the special's time has reached its handback (the follow camera takes over by its end). */
  handingBack(time: number): boolean {
    return this.special !== null && time >= this.special.handback
  }

  /**
   * Place `camera` for special time `time`. The follow camera has already
   * placed it this frame: that is the pose the handback eases into. `dt` is
   * real time, for the operator's lag.
   */
  apply(camera: PerspectiveCamera, time: number, dt: number, subject: DirectorSubject): void {
    const special = this.special
    if (!special) return
    const shots = special.shots
    let index = this.shot
    while (index + 1 < shots.length && shots[index + 1].at <= time) index++
    if (index < 0) return
    const shot = shots[index]
    if (index !== this.shot) this.cut(shot, index, camera)

    // the shot's own pose
    const eye = this.framePoint(shot.eyeFrame ?? 'ground', this.eye.at(time, _eye), subject, this.eyeBase, shot.lag ?? 0, dt)
    const target = this.framePoint(shot.lookFrame ?? 'ground', this.look.at(time, _look), subject, this.lookBase, shot.lag ?? 0, dt)
    this.primed = true
    eye.y = Math.max(eye.y, FLOOR)
    this.matrix.lookAt(eye, target, _up)
    this.quaternion.setFromRotationMatrix(this.matrix)
    const roll = this.roll.at(time)
    if (roll !== 0) this.quaternion.multiply(_q.setFromAxisAngle(_z, -roll * Math.PI / 180))
    this.position.copy(eye)
    let fov = this.fov.at(time)

    // easing over from the last shot
    const pivot = _pivot.setFromMatrixPosition(subject.body.matrixWorld)
    if (this.blend > 0) {
      const u = ease(Math.min(1, (time - this.shotStart) / this.blend))
      orbit(this.fromPosition, this.fromQuaternion, this.position, this.quaternion, u, pivot, this.position, this.quaternion)
      fov = this.fromFov + (fov - this.fromFov) * u
    }

    // and back into the follow camera
    const hand = special.move.duration - special.handback
    const w = time <= special.handback ? 0 : ease(Math.min(1, (time - special.handback) / Math.max(1e-3, hand)))
    if (w > 0) {
      orbit(this.position, this.quaternion, camera.position, camera.quaternion, w, pivot, this.position, this.quaternion)
      fov += (camera.fov - fov) * w
    }
    camera.position.copy(this.position)
    camera.quaternion.copy(this.quaternion)
    if (camera.fov !== fov) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    camera.updateMatrixWorld()
  }

  private cut(shot: Shot, index: number, camera: PerspectiveCamera): void {
    this.shot = index
    this.shotStart = shot.at
    this.eye.set(shot.eye)
    this.look.set(shot.look)
    this.fov.set(shot.fov, DEFAULT_FOV)
    this.roll.set(shot.roll, 0)
    this.primed = false
    this.blend = shot.blend ?? 0
    if (this.blend > 0) {
      this.fromPosition.copy(camera.position)
      this.fromQuaternion.copy(camera.quaternion)
      this.fromFov = camera.fov
    }
  }

  /** A shot key (lateral, forward, up) in its frame, as a world point; a lagging frame's origin trails its subject. */
  private framePoint(frame: ShotFrame, key: Vector3, subject: DirectorSubject, base: Vector3, lag: number, dt: number): Vector3 {
    if (frame === 'ground') _base.copy(this.origin)
    else if (frame === 'head') _base.setFromMatrixPosition(subject.head.matrixWorld)
    else if (frame === 'weapon' && subject.weapon(_base)) { /* the weapon's head end */ }
    else _base.setFromMatrixPosition(subject.body.matrixWorld)
    if (frame !== 'ground' && lag > 0 && this.primed) base.lerp(_base, 1 - Math.exp(-lag * dt))
    else base.copy(_base)
    const h = this.heading
    const s = Math.sin(h), c = Math.cos(h)
    // lateral is + left of the heading: left = (cos h, 0, -sin h), forward = (sin h, 0, cos h)
    return key.set(base.x + c * key.x + s * key.y, base.y + key.z, base.z - s * key.x + c * key.y)
  }
}

/**
 * A camera pose between (pa, qa) and (pb, qb) at u, swung round `pivot`: yaw
 * about it on the shorter side, horizontal distance and height interpolated;
 * it looks at the blend of the points each pose looks at (as far ahead as
 * each stands from the pivot). Writes `out` / `outQ` (they may alias the inputs).
 */
function orbit(pa: Vector3, qa: Quaternion, pb: Vector3, qb: Quaternion, u: number, pivot: Vector3, out: Vector3, outQ: Quaternion): void {
  const ax = pa.x - pivot.x, az = pa.z - pivot.z, bx = pb.x - pivot.x, bz = pb.z - pivot.z
  const ya = Math.atan2(ax, az)
  let dy = Math.atan2(bx, bz) - ya
  dy = Math.atan2(Math.sin(dy), Math.cos(dy))
  const yaw = ya + dy * u
  const r = Math.hypot(ax, az) + (Math.hypot(bx, bz) - Math.hypot(ax, az)) * u
  const y = pa.y + (pb.y - pa.y) * u
  // where each looks: along its view, as far as it stands from the pivot
  _ta.set(0, 0, -1).applyQuaternion(qa).multiplyScalar(pa.distanceTo(pivot)).add(pa)
  _tb.set(0, 0, -1).applyQuaternion(qb).multiplyScalar(pb.distanceTo(pivot)).add(pb)
  _ta.lerp(_tb, u)
  out.set(pivot.x + Math.sin(yaw) * r, y, pivot.z + Math.cos(yaw) * r)
  _m.lookAt(out, _ta, _up)
  outQ.setFromRotationMatrix(_m)
}

const ease = (u: number): number => u * u * (3 - 2 * u)
const _pivot = new Vector3()
const _ta = new Vector3()
const _tb = new Vector3()
const _m = new Matrix4()
const _eye = new Vector3()
const _look = new Vector3()
const _base = new Vector3()
const _up = new Vector3(0, 1, 0)
const _z = new Vector3(0, 0, 1)
const _q = new Quaternion()
