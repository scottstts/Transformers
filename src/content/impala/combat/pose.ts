import type { Key } from '../../transformer/combat/curves'
import type { Channel } from '../../transformer/combat/pose'

/**
 * Posing the Impala's cutlass, held in its left hand, and its body around
 * it. Distances in metres from the pelvis at rest, in the heading's frame
 * (x + left, which is outward for the left hand; forward; up); angles in
 * degrees. Hips 2.87 m up, arms 2.1 m long, the left shoulder 1.17 m out.
 *
 * The grip runs across the fist (the hand's knuckle row), so with the wrist
 * straight the blade stands square to the forearm, out of the thumb's side,
 * its edge facing along the forearm away from the elbow (the overlay turns
 * the wrist with the forearm, `wristFollows`). A pose names where the fist
 * is and where the blade should point; the overlay holds it as a person
 * holds a one-handed blade (NATURAL_HOLD): every frame the elbow takes the
 * roll that leaves the hand least turned on its forearm, and the blade gives
 * where the wish would wring the hand or bend the wrist past a wrist's
 * reach. The arm's natural blade: held low the blade points ahead and in
 * across the body; raised over the shoulder it lies back behind it; a fist
 * in front at the chest stands it up. Cuts are an axe's in one hand: the
 * blade back over the shoulder on the wind-up, over the top, then driven
 * down and through as the forearm swings down, the edge leading.
 *
 * A cut's fist is keyed densely along its arc (Timeline.cut): the channels
 * are monotone per axis, so a swing keyed at its ends alone would carry the
 * fist on near-straight lines between them, a dab rather than a cut.
 *
 * The weapon channels' angles are taken on the branch nearest the pose
 * before (`keyed` unwinds them in time order from the rest at the side), so
 * no key swings the blade the long way round.
 */

export type Pose = Partial<Record<Channel, number>>
export type Keys = Partial<Record<Channel, Key[]>>
export type V3 = readonly [number, number, number]
type Vec = [number, number, number]

/** The left shoulder's rest place from the pelvis (m: x + left, forward, up) and the arm's length: the weapon channels' origin and unit. */
export const SHOULDER: V3 = [1.17, 0.13, 1.84]
export const ARM = 2.1
/** The wrist's limit: the blade kept within this of square to the forearm (deg). */
const WRIST = 50

const rad = (deg: number): number => deg * Math.PI / 180
const deg = (r: number): number => r * 180 / Math.PI

function unit(v: V3): Vec {
  const n = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / n, v[1] / n, v[2] / n]
}

/** Where the left shoulder is with the torso turned `turn` (deg, + left) and leant `lean` (deg, forward) about the pelvis. */
export function shoulder(turn: number, lean = 0): Vec {
  const a = rad(turn), l = rad(lean)
  const ahead = SHOULDER[1] + SHOULDER[2] * Math.sin(l)
  return [SHOULDER[0] * Math.cos(a) + ahead * Math.sin(a), -SHOULDER[0] * Math.sin(a) + ahead * Math.cos(a), SHOULDER[2] * Math.cos(l)]
}

/** The fist on the left arm held toward `phi` (deg + left of the heading), `drop` below level (- raised), `reach` m from the turned shoulder. */
export function reachOut(turn: number, lean: number, phi: number, drop: number, reach: number): Vec {
  const s = shoulder(turn, lean)
  const p = rad(phi), d = rad(drop)
  return [s[0] + reach * Math.cos(d) * Math.sin(p), s[1] + reach * Math.cos(d) * Math.cos(p), s[2] - reach * Math.sin(d)]
}

/** The cutlass's channels for the fist at `at` and the blade toward `point` (the wrist turns it about the blade by itself; `roll` turns it further). */
function cutlass(at: V3, point: V3, roll = 0): Pose {
  const [px, pf, pu] = unit(point)
  const pitch = Math.acos(Math.max(-1, Math.min(1, pu)))
  // straight up or down the yaw means nothing; the wrist sets the turn about the blade
  const yaw = Math.hypot(px, pf) > 1e-3 ? Math.atan2(px, pf) : 0
  return {
    'w.x': (at[0] - SHOULDER[0]) / ARM, 'w.y': (at[1] - SHOULDER[1]) / ARM, 'w.z': (at[2] - SHOULDER[2]) / ARM,
    'w.yaw': deg(yaw), 'w.pitch': deg(pitch), 'w.roll': roll,
  }
}

/** A held cutlass: the fist, where the blade points, and the arm and torso that carry it. */
export interface Hold {
  at: V3
  point: V3
  /** the torso's turn (deg, + left; hips, spine and chest together) and the chest's forward lean (deg, as the pose's pitch channels add up) */
  turn?: number
  lean?: number
  /** the elbow's side handed outward (0..1, for a raised arm) and its roll (deg; the natural hold's start, which then finds its own) */
  out?: number
  elbow?: number
  /** how far the head turns back against the torso's turn */
  head?: number
  /** the edge turned off the forearm's line (deg) */
  roll?: number
  /** how much further than the wrist the blade may bend toward the forearm's line (deg; the grip pivots in the fist: `w.bend`) */
  bend?: number
  /** held reversed, the blade out of the little finger's side (`w.reverse`); `point` stays where the blade points */
  reverse?: boolean
}

/**
 * How the overlay holds the cutlass (CombatBuild.natural, deg): the hand
 * turns on its forearm at most about as far as a forearm turns either way
 * from the relaxed hand (palm down, palm up); the blade stays within WRIST
 * of square to the forearm; an elbow riding up off the shoulder-hand line
 * past `wing` while the hand is low is a chicken wing; the car's front end
 * stands out of the chest, so the elbow keeps outside the shoulder (`tuck`, m).
 */
export const NATURAL_HOLD = { twist: 85, bend: WRIST, wing: 22, tuck: -0.12 } as const

/** A held cutlass with the torso that carries it: the fist, and the blade's wish (the overlay's natural hold finishes it). */
export function held(h: Hold): Pose {
  const turn = h.turn ?? 0
  return {
    ...cutlass(h.at, wished(h), h.roll ?? 0), ...turned(turn, h.head ?? 0.7),
    'L.out': h.out ?? 0, 'L.elbow': h.elbow ?? 20, 'w.bend': h.bend ?? 0, 'w.reverse': h.reverse ? 1 : 0,
  }
}

/** The blade the weapon channels name for a hold: the ordinary grip's (reversed, the opposite of where the blade points). */
function wished(h: { point: V3; reverse?: boolean }): Vec {
  const p = unit(h.point)
  return h.reverse ? [-p[0], -p[1], -p[2]] : p
}

/** The torso turned `turn` degrees (+ left) through hips, spine and chest, the head held back toward the front by `head`; `hips` sets the hips' own share. */
export function turned(turn: number, head = 0.7, hips = turn * 0.32): Pose {
  const rest = turn - hips
  return { hipYaw: hips, spineZ: rest * 0.38, chestZ: rest * 0.62, headZ: -turn * head }
}

/** The free right hand: direction (az + outward, el + up), reach, elbow roll and how closed the hand is. */
export function free(az: number, el: number, reach = 0.8, elbow = 20, grip = 0.55): Pose {
  return { 'R.az': az, 'R.el': el, 'R.reach': reach, 'R.elbow': elbow, 'R.grip': grip }
}

/**
 * The whole body at a moment, as a fighter is posed: the torso's turn (deg,
 * + left; `hips` its share in the hips, the rest through the spine and
 * chest), the pelvis dropped (m), shifted (m, + left), pitched forward and
 * rolled (deg), the upper body bent forward (deg, over spine and chest) and
 * tilted sideways (deg, + its top to the left), the head nodded (deg, +
 * down) and held toward the front (`head`, share of the turn); the cutlass
 * (Hold, its torso taken from here) and the free hand ([az, el, reach,
 * elbow, grip], free()).
 */
export interface Frame {
  turn: number
  hips?: number
  drop?: number
  shift?: number
  pitch?: number
  roll?: number
  bend?: number
  tilt?: number
  nod?: number
  head?: number
  hold?: { at: V3; point: V3; out?: number; elbow?: number; roll?: number; bend?: number; reverse?: boolean }
  free?: readonly [number, number, number?, number?, number?]
}

/** A frame's pose. */
export function frame(f: Frame): Pose {
  const pitch = f.pitch ?? 0, bend = f.bend ?? 0, tilt = f.tilt ?? 0
  const pose: Pose = {
    ...turned(f.turn, f.head ?? 0.7, f.hips),
    hipDrop: f.drop ?? 0, hipX: f.shift ?? 0, hipPitch: pitch, hipRoll: f.roll ?? 0,
    spineX: bend * 0.4, chestX: bend * 0.6, spineY: tilt * 0.45, chestY: tilt * 0.55, headX: f.nod ?? 0,
  }
  if (f.hold) Object.assign(pose, held({ ...f.hold, turn: f.turn, head: f.head }), turned(f.turn, f.head ?? 0.7, f.hips))
  if (f.free) Object.assign(pose, free(f.free[0], f.free[1], f.free[2] ?? 0.8, f.free[3] ?? 20, f.free[4] ?? 1))
  return pose
}

const lerp = (a: number, b: number, u: number): number => a + (b - a) * u
/** Catmull-Rom through p0..p3 at u (0..1 between p1 and p2). */
const spline = (p0: number, p1: number, p2: number, p3: number, u: number): number =>
  0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * p1 - p0 - 3 * p2 + p3) * u * u * u)

/** How a cut's time runs: slow out of the coil, fastest just before the middle, braking into the follow-through. */
export const strikeEase = (s: number): number => 0.5 - 0.5 * Math.cos(Math.PI * s ** 0.8)
/** A steady ease in and out. */
export const smoothEase = (s: number): number => s * s * (3 - 2 * s)

/** Options of a cut: how far the hips and legs lead the arm (share of the cut) and the blade lags it; the key spacing (s). */
export interface CutOptions {
  lead?: number
  lag?: number
  ease?: (s: number) => number
  step?: number
}

/** A frame between path frames: the fist and the blade on a spline through them, the body's numbers by group, each at its own time along the path. */
function between(path: readonly Frame[], arm: number, body: number, hips: number): Frame {
  const n = path.length - 1
  const at = (u: number): [number, number, Frame, Frame, Frame, Frame] => {
    const x = Math.min(n - 1e-9, Math.max(0, u * n))
    const i = Math.floor(x)
    return [i, x - i, path[Math.max(0, i - 1)], path[i], path[i + 1], path[Math.min(n, i + 2)]]
  }
  const num = (u: number, get: (f: Frame) => number | undefined, fallback = 0): number => {
    const [, k, a, b, c, d] = at(u)
    const v = (f: Frame): number => get(f) ?? fallback
    return spline(v(a), v(b), v(c), v(d), k)
  }
  const vec = (u: number, get: (f: Frame) => V3): Vec => {
    const [, k, a, b, c, d] = at(u)
    return [0, 1, 2].map((j) => spline(get(a)[j], get(b)[j], get(c)[j], get(d)[j], k)) as Vec
  }
  const [, k, , b0, c0] = at(arm)
  const f: Frame = {
    turn: num(body, (f) => f.turn),
    hips: num(hips, (f) => f.hips ?? f.turn * 0.32),
    drop: num(hips, (f) => f.drop),
    shift: num(hips, (f) => f.shift),
    pitch: num(hips, (f) => f.pitch),
    roll: num(hips, (f) => f.roll),
    bend: num(body, (f) => f.bend),
    tilt: num(body, (f) => f.tilt),
    nod: num(body, (f) => f.nod),
    head: num(body, (f) => f.head, 0.7),
  }
  if (path.every((p) => p.hold)) {
    const reverse = path[0].hold!.reverse ?? false
    if (path.some((p) => (p.hold!.reverse ?? false) !== reverse)) throw new Error('a cut keeps one grip: the grip changes in the air')
    // splined as the channels name the blade (the ordinary grip's), then handed back as where it points
    const point = unit(vec(arm, (p) => wished(p.hold!)))
    f.hold = {
      at: vec(arm, (p) => p.hold!.at),
      point: reverse ? [-point[0], -point[1], -point[2]] : point,
      out: lerp(b0.hold!.out ?? 0, c0.hold!.out ?? 0, k),
      bend: lerp(b0.hold!.bend ?? 0, c0.hold!.bend ?? 0, k),
      reverse,
    }
  }
  if (path.every((p) => p.free)) {
    f.free = [0, 1, 2, 3, 4].map((j) => num(body, (p) => p.free![j], [0, 0, 0.8, 20, 1][j])) as unknown as Frame['free']
  }
  return f
}

/** A fight's poses in time order. */
export class Timeline {
  readonly poses: Array<[number, Pose]> = []

  /** A pose at `t`. */
  key(t: number, f: Frame): this {
    this.poses.push([t, frame(f)])
    return this
  }

  /** Extra channels at `t`, added to whatever else is keyed then. */
  add(t: number, pose: Pose): this {
    this.poses.push([t, pose])
    return this
  }

  /**
   * A cut from `t0` (where `path[0]` is already keyed) to `t1`, through
   * the path's frames at even shares of it: keyed every `step` seconds on
   * splines through them, so the fist sweeps an arc and does not dab from key
   * to key. The legs and hips lead (`lead`), the chest follows, the arm and
   * the blade come last (`lag`): the body's chain whips the blade.
   */
  cut(t0: number, t1: number, path: readonly Frame[], o: CutOptions = {}): this {
    const ease = o.ease ?? strikeEase
    const lead = o.lead ?? 0.25, lag = o.lag ?? 0.1
    const n = Math.max(2, Math.ceil((t1 - t0) / (o.step ?? 0.024)))
    for (let k = 1; k <= n; k++) {
      const s = k / n
      const hips = ease(Math.min(1, s * (1 + lead)))
      const body = ease(s)
      const arm = ease(Math.max(0, (s - lag) / (1 - lag)))
      this.key(t0 + (t1 - t0) * s, between(path, arm, body, hips))
    }
    return this
  }

  /** Keys of everything posed (keyed()), on top of `into`, the weapon's yaw unwound from `from`. */
  keys(into: Keys = {}, from: Pose = {}): Keys {
    return keyed(this.poses, into, from)
  }

}

/**
 * A leap's flight: the lowest foot's height (`air`) on a parabola from
 * `t0` to `t1` peaking at `apex` (m), keyed finely enough that the
 * channel's curve follows it (constant gravity: a body in the air that rises
 * and falls at any other rate reads as moved, not thrown).
 */
export function flight(t0: number, t1: number, apex: number, keys = 8): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let k = 0; k <= keys; k++) {
    const u = k / keys
    out.push([t0 + (t1 - t0) * u, 4 * apex * u * (1 - u)])
  }
  return out
}

/**
 * Keys from poses at times; later poses add to the channels they name. The
 * weapon's yaw is unwound in time order from `from` (the rest's), each onto
 * the turn nearest the key before it.
 */
export function keyed(list: ReadonlyArray<readonly [number, Pose]>, into: Keys = {}, from: Pose = {}): Keys {
  const sorted = [...list].sort((a, b) => a[0] - b[0])
  let last = from['w.yaw'] ?? 0
  for (const [t, pose] of sorted) {
    for (const [c, raw] of Object.entries(pose) as Array<[Channel, number]>) {
      let v = raw
      if (c === 'w.yaw') {
        v = raw + 360 * Math.round((last - raw) / 360)
        last = v
      }
      (into[c] ??= []).push([t, v])
    }
  }
  for (const keys of Object.values(into)) {
    keys!.sort((a, b) => a[0] - b[0])
    for (let i = keys!.length - 1; i > 0; i--) if (keys![i][0] - keys![i - 1][0] < 1e-3) keys!.splice(i - 1, 1)
  }
  return into
}

/** The weapon's placement off the hand (heading frame, from the pelvis at rest: x + left, forward, up): its grip point, where its blade points and where its edge faces. */
export interface Placement {
  grip: V3
  blade: V3
  edge: V3
}

const GRAVITY = 9.81
/** The cutlass's centre of mass up its blade from the grip (m): the guard and the hilt's weight hold it low on the 4 m blade. */
const BALANCE = 1.2

/**
 * A throw of the weapon from the hand at `t0` (placed `from`) to the hand
 * that catches it at `t1` (placed `to`): `w.free` hands it from the hand to
 * the flight over `ramp` and back over `ramp`, and the flight's channels
 * carry it as a thrown body does, its centre of mass on a parabola under
 * gravity and the whole turning at one rate about one axis (the least turn
 * from the release to the catch, or with `long` the other way round it: the
 * way that carries the blade clear of the arm, and `turns` whole turns more:
 * a spinning throw), keyed every frame (the quaternion's components are
 * splined: keyed this densely they stay on the turn).
 */
export function toss(t0: number, t1: number, from: Placement, to: Placement, long = false, turns = 0, ramp = 0.04): Keys {
  const q0 = weaponFrame(from), q1 = weaponFrame(to)
  const com = (p: Placement, q: [number, number, number, number]): Vec => {
    const b = rotate(q, [0, 0, BALANCE])
    return [p.grip[0] + b[0], -p.grip[1] + b[1], p.grip[2] + b[2]]
  }
  // in the model's authoring frame (x left, -y forward, z up), as the overlay places it
  const c0 = com(from, q0), c1 = com(to, q1)
  const T = t1 - t0
  const v0: Vec = [(c1[0] - c0[0]) / T, (c1[1] - c0[1]) / T, (c1[2] - c0[2]) / T + 0.5 * GRAVITY * T]
  // the turn from the release to the catch
  const d = mul(q1, conj(q0))
  if (d[3] < 0) d.forEach((_, i) => { d[i] = -d[i] })
  const least = 2 * Math.acos(Math.min(1, d[3]))
  const s = Math.sin(least / 2)
  const way = long ? -1 : 1
  const axis: Vec = s > 1e-6 ? [way * d[0] / s, way * d[1] / s, way * d[2] / s] : [1, 0, 0]
  const angle = (long ? 2 * Math.PI - least : least) + turns * 2 * Math.PI
  const keys: Keys = {
    'w.free': [[t0, 0], [t0 + ramp, 1], [t1 - ramp, 1], [t1, 0]],
    'w.fx': [], 'w.fy': [], 'w.fz': [], 'w.qx': [], 'w.qy': [], 'w.qz': [], 'w.qw': [],
  }
  let last: [number, number, number, number] = q0
  const n = Math.max(2, Math.ceil(T * 60))
  for (let k = 0; k <= n; k++) {
    const u = k / n, t = u * T
    const h = Math.sin(angle * u / 2)
    let q = mul([axis[0] * h, axis[1] * h, axis[2] * h, Math.cos(angle * u / 2)], q0)
    // one sign throughout, so the splined components never cross through zero
    if (q[0] * last[0] + q[1] * last[1] + q[2] * last[2] + q[3] * last[3] < 0) q = [-q[0], -q[1], -q[2], -q[3]]
    last = q
    const c: Vec = [c0[0] + v0[0] * t, c0[1] + v0[1] * t, c0[2] + v0[2] * t - 0.5 * GRAVITY * t * t]
    const b = rotate(q, [0, 0, BALANCE])
    const at = t0 + t
    keys['w.fx']!.push([at, c[0] - b[0]])
    keys['w.fy']!.push([at, -(c[1] - b[1])])
    keys['w.fz']!.push([at, c[2] - b[2]])
    keys['w.qx']!.push([at, q[0]]); keys['w.qy']!.push([at, q[1]]); keys['w.qz']!.push([at, q[2]]); keys['w.qw']!.push([at, q[3]])
  }
  return keys
}

/** The weapon's rotation in the model's authoring frame for a placement (its frame: x the edge, z the blade). */
function weaponFrame(p: Placement): [number, number, number, number] {
  const z = unit([p.blade[0], -p.blade[1], p.blade[2]])
  const e = [p.edge[0], -p.edge[1], p.edge[2]]
  const k = e[0] * z[0] + e[1] * z[1] + e[2] * z[2]
  const x = unit([e[0] - z[0] * k, e[1] - z[1] * k, e[2] - z[2] * k])
  const y: Vec = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]]
  // rotation matrix columns x, y, z to a quaternion
  const m00 = x[0], m01 = y[0], m02 = z[0], m10 = x[1], m11 = y[1], m12 = z[1], m20 = x[2], m21 = y[2], m22 = z[2]
  const tr = m00 + m11 + m22
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1)
    return [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s]
  }
  if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22)
    return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]
  }
  if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22)
    return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]
  }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11)
  return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s]
}

type Quat = [number, number, number, number]
const mul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
]
const conj = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]]
function rotate(q: Quat, v: Vec): Vec {
  const r = mul(mul(q, [v[0], v[1], v[2], 0]), conj(q))
  return [r[0], r[1], r[2]]
}
