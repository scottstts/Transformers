import { Matrix3, Matrix4, Quaternion, Vector3 } from 'three/webgpu'
import type { SoldierPiece } from '../../content/soldier/asset'
import type { SoldierRig } from '../../content/soldier/rig'

/** Gravity, restitution and friction against the sand, and the sand's ploughing drag on a part lying in it (1/s). */
const G = 9.8
const RESTITUTION = 0.18
const FRICTION = 0.85
const PLOUGH = 2.2
/** A part meeting the sand faster than this (m/s) is heard; the same part is heard again only after LAND_QUIET s. */
const LAND_SPEED = 0.9
const LAND_QUIET = 0.08
/** Landings kept per update (the rest are the same moment, unheard). */
const LANDINGS = 8
/** Seconds the pieces lie before they burn away, and the burning away. */
export const DEBRIS_LIE = 4.0
export const DEBRIS_FADE = 1.0

interface Body {
  bone: number
  /** the piece's box centre in its bone frame, half extents, mass */
  c: Vector3
  h: Vector3
  mass: number
  /** body-frame inverse inertia (diagonal) */
  invI: Vector3
  p: Vector3
  q: Quaternion
  v: Vector3
  w: Vector3
  asleep: boolean
  /** age at its last heard landing */
  landed: number
}

/** A part hitting the sand this update: which piece, and how fast it came down (m/s). */
export interface Landing {
  piece: number
  speed: number
}

/**
 * A destroyed soldier breaking apart: every part becomes a rigid box body
 * (its own bone's part: the box and mass the export measured) starting where
 * it was, with the soldier's own motion, the blow's push, a scatter out from
 * the torso (the joints giving way) and a tumble. Pieces fall under gravity
 * and meet the sand at the deepest corner of their box: an impulse with a
 * little restitution and Coulomb friction (bounded by the weight a resting
 * part bears), through the full inertia, so they bounce, skid, tip over onto a
 * face and settle; lying in the sand they plough it, which soon stops them. They do not collide with
 * each other. The bone matrices are written back into the soldier's rig, so
 * the horde renderer draws the pieces as the same instance.
 */
export class Debris {
  private readonly bodies: Body[] = []
  private readonly rig: SoldierRig
  age = 0
  /** the parts that hit the sand during the last `update` (first `landingCount` entries) */
  readonly landings: Landing[] = Array.from({ length: LANDINGS }, () => ({ piece: 0, speed: 0 }))
  landingCount = 0

  constructor(rig: SoldierRig, pieces: readonly SoldierPiece[]) {
    this.rig = rig
    for (const pc of pieces) {
      const h = new Vector3(...pc.half).max(new Vector3(0.03, 0.03, 0.03))
      const m = Math.max(4, pc.mass)
      const ix = (m / 3) * (h.y * h.y + h.z * h.z), iy = (m / 3) * (h.x * h.x + h.z * h.z), iz = (m / 3) * (h.x * h.x + h.y * h.y)
      this.bodies.push({
        bone: pc.bone, c: new Vector3(...pc.center), h, mass: m, invI: new Vector3(1 / ix, 1 / iy, 1 / iz),
        p: new Vector3(), q: new Quaternion(), v: new Vector3(), w: new Vector3(), asleep: false, landed: -1,
      })
    }
  }

  /**
   * Break the rig's current pose apart. `push` is the blow's velocity (m/s,
   * world), `base` the soldier's own, `burst` how violently the joints give
   * (1 a cut, 2+ a blast).
   */
  start(push: Vector3, base: Vector3, burst: number): void {
    this.age = 0
    const W = this.rig.world
    const torso = _c.setFromMatrixPosition(W[this.rig.index.chest])
    for (const b of this.bodies) {
      const m = W[b.bone]
      b.p.copy(b.c).applyMatrix4(m)
      m.decompose(_t, b.q, _s)
      const out = _d.subVectors(b.p, torso)
      out.y = Math.max(0, out.y) * 0.5
      const n = out.lengthSq() > 1e-6 ? out.normalize() : out.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize()
      const scatter = (0.6 + Math.random() * 1.0) * burst
      b.v.copy(base).addScaledVector(push, 0.45 + Math.random() * 0.45).addScaledVector(n, scatter)
      b.v.y += (0.6 + Math.random() * 1.6) * Math.min(2, burst) * 0.6
      const spin = (3 + Math.random() * 5) * Math.min(2.5, burst) * (0.25 / Math.max(0.12, b.h.length()))
      b.w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(spin)
      b.asleep = false
      b.landed = -1
    }
    this.landingCount = 0
    this.write()
  }

  update(dt: number): void {
    this.age += dt
    this.landingCount = 0
    const steps = dt > 1 / 90 ? 2 : 1
    const h = dt / steps
    for (let k = 0; k < steps; k++) for (let i = 0; i < this.bodies.length; i++) if (!this.bodies[i].asleep) this.step(this.bodies[i], h, i)
    this.write()
  }

  private step(b: Body, dt: number, index: number): void {
    b.v.y -= G * dt
    b.p.addScaledVector(b.v, dt)
    // integrate the orientation
    _qw.set(b.w.x, b.w.y, b.w.z, 0).multiply(b.q)
    b.q.x += 0.5 * dt * _qw.x
    b.q.y += 0.5 * dt * _qw.y
    b.q.z += 0.5 * dt * _qw.z
    b.q.w += 0.5 * dt * _qw.w
    b.q.normalize()
    // deepest corner of the box
    _R.makeRotationFromQuaternion(b.q)
    let low = Infinity
    for (let i = 0; i < 8; i++) {
      _r.set(i & 1 ? b.h.x : -b.h.x, i & 2 ? b.h.y : -b.h.y, i & 4 ? b.h.z : -b.h.z).applyMatrix4(_R)
      if (_r.y < low) { low = _r.y; _contact.copy(_r) }
    }
    const depth = -(b.p.y + low)
    if (depth <= 0) return
    b.p.y += depth
    // world inverse inertia: R diag(invI) R^T
    _m3.setFromMatrix4(_R)
    const e = _m3.elements
    _Iw.set(
      e[0] * b.invI.x * e[0] + e[3] * b.invI.y * e[3] + e[6] * b.invI.z * e[6], e[0] * b.invI.x * e[1] + e[3] * b.invI.y * e[4] + e[6] * b.invI.z * e[7], e[0] * b.invI.x * e[2] + e[3] * b.invI.y * e[5] + e[6] * b.invI.z * e[8],
      e[1] * b.invI.x * e[0] + e[4] * b.invI.y * e[3] + e[7] * b.invI.z * e[6], e[1] * b.invI.x * e[1] + e[4] * b.invI.y * e[4] + e[7] * b.invI.z * e[7], e[1] * b.invI.x * e[2] + e[4] * b.invI.y * e[5] + e[7] * b.invI.z * e[8],
      e[2] * b.invI.x * e[0] + e[5] * b.invI.y * e[3] + e[8] * b.invI.z * e[6], e[2] * b.invI.x * e[1] + e[5] * b.invI.y * e[4] + e[8] * b.invI.z * e[7], e[2] * b.invI.x * e[2] + e[5] * b.invI.y * e[5] + e[8] * b.invI.z * e[8],
    )
    const r = _contact
    // velocity of the contact point; a normal impulse stops it sinking (with a little bounce)
    const vp = _vp.crossVectors(b.w, r).add(b.v)
    let jn = 0
    // heard: a real blow into the sand, not a part settling or rocking on it
    if (-vp.y > LAND_SPEED && this.age - b.landed > LAND_QUIET) {
      b.landed = this.age
      if (this.landingCount < LANDINGS) {
        const l = this.landings[this.landingCount++]
        l.piece = index
        l.speed = -vp.y
      }
    }
    if (vp.y < 0) {
      const rn = _a.crossVectors(r, UP)
      const k = 1 / b.mass + _b.copy(rn).applyMatrix3(_Iw).cross(r).dot(UP)
      jn = (-(1 + RESTITUTION) * vp.y) / k
      b.v.y += jn / b.mass
      b.w.add(_a.crossVectors(r, _b.set(0, jn, 0)).applyMatrix3(_Iw))
    }
    // Coulomb friction against the sliding, bounded by the impact or, resting, by the weight it bears
    const vt = _vp.crossVectors(b.w, r).add(b.v)
    vt.y = 0
    const slide = vt.length()
    if (slide > 1e-4) {
      const t = vt.multiplyScalar(-1 / slide)
      const kt = 1 / b.mass + _b.crossVectors(r, t).applyMatrix3(_Iw).cross(r).dot(t)
      const jt = Math.min(FRICTION * Math.max(jn, b.mass * G * dt), slide / kt)
      b.v.addScaledVector(t, jt / b.mass)
      b.w.add(_a.crossVectors(r, _b.copy(t).multiplyScalar(jt)).applyMatrix3(_Iw))
    }
    // a part in the sand ploughs it: its sliding and its spin die away; resting pieces go to sleep
    const plough = Math.exp(-dt * PLOUGH)
    b.v.x *= plough
    b.v.z *= plough
    b.w.multiplyScalar(Math.exp(-dt * 2.5))
    if (b.v.lengthSq() < 0.04 && b.w.lengthSq() < 0.09 && depth < 0.02) {
      b.v.set(0, 0, 0)
      b.w.set(0, 0, 0)
      b.asleep = true
    }
  }

  /** Bone matrices from the bodies: the part's box centre carried back to its bone origin. */
  private write(): void {
    for (const b of this.bodies) {
      _m.compose(b.p, b.q, ONE).multiply(_back.makeTranslation(-b.c.x, -b.c.y, -b.c.z))
      this.rig.setWorld(b.bone, _m)
    }
  }

  /** The centres of the pieces (for effects): the i-th, world. */
  piece(i: number, out: Vector3): Vector3 {
    return out.copy(this.bodies[i % this.bodies.length].p)
  }

  /** The i-th piece's longest dimension (m) and mass (kg). */
  size(i: number): number {
    const h = this.bodies[i].h
    return 2 * Math.max(h.x, h.y, h.z)
  }

  mass(i: number): number {
    return this.bodies[i].mass
  }

  get count(): number {
    return this.bodies.length
  }
}

const UP = new Vector3(0, 1, 0)
const ONE = new Vector3(1, 1, 1)
const _m = new Matrix4()
const _back = new Matrix4()
const _R = new Matrix4()
const _m3 = new Matrix3()
const _Iw = new Matrix3()
const _t = new Vector3()
const _s = new Vector3()
const _c = new Vector3()
const _d = new Vector3()
const _r = new Vector3()
const _contact = new Vector3()
const _vp = new Vector3()
const _a = new Vector3()
const _b = new Vector3()
const _qw = new Quaternion()
