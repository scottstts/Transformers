import type { Key } from '../../transformer/combat/curves'
import type { Channel } from '../../transformer/combat/pose'

/**
 * Posing the Impala's cutlass, held in its left hand, and its body around
 * it. Distances in metres from the pelvis at rest, in the heading's frame
 * (x + left, which is outward for the left hand; forward; up); angles in
 * degrees. Hips 2.87 m up, arms 2.1 m long, the left shoulder 1.17 m out.
 *
 * The grip runs across the fist (the hand's knuckle row), so with the wrist
 * straight the blade stands square to the forearm and its edge faces along
 * it, away from the elbow (the overlay turns the wrist with the forearm,
 * `wristFollows`). A pose names where the fist is and where the blade
 * points; `held` works out the forearm the arm will take there (the overlay's
 * own two-bone solve, its elbow side and roll) and keeps the blade within
 * WRIST of square to it, so no pose bends the wrist past what a wrist does.
 * A cut leads with its edge when the forearm points the way the fist moves,
 * the blade trailing square behind it: the hand leads, as in a real cut.
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
/** The arm's bones (upper, fore) and how far the grip sits beyond the wrist, along the hand (m). */
const UPPER = 1.08
const FORE = 1.02
const HAND = 0.3
/** The wrist's limit: the blade kept within this of square to the forearm (deg). */
const WRIST = 42
/** The arm's default elbow side in the chest frame (overlay.ts POLE: outward, back, down; authoring axes). */
const POLE: V3 = [0.4, 0.6, -1]

const rad = (deg: number): number => deg * Math.PI / 180
const deg = (r: number): number => r * 180 / Math.PI
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const sub = (a: V3, b: V3): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: V3, b: V3, k = 1): Vec => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]
const scale = (a: V3, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k]
const cross = (a: V3, b: V3): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

function unit(v: V3): Vec {
  const n = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / n, v[1] / n, v[2] / n]
}

/** `v` rotated `a` (rad) about the unit axis `k` (Rodrigues). */
function rotate(v: V3, k: V3, a: number): Vec {
  const c = Math.cos(a), s = Math.sin(a)
  const kv = cross(k, v), kd = dot(k, v) * (1 - c)
  return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd]
}

/** Pose coordinates (x left, forward, up) to the authoring frame (x left, -y forward, z up), and back (its own inverse). */
const authoring = (v: V3): Vec => [v[0], -v[1], v[2]]

/** The chest's turn (deg, + left) and forward lean (deg) as a rotation of authoring vectors: Rz(turn) Rx(lean). */
function chest(v: V3, turn: number, lean: number, inverse = false): Vec {
  const t = rad(turn), l = rad(lean)
  if (inverse) return rotate(rotate(v, [0, 0, 1], -t), [1, 0, 0], -l)
  return rotate(rotate(v, [1, 0, 0], l), [0, 0, 1], t)
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

/**
 * The forearm's direction (pose coordinates, unit) with the grip at `at`, as
 * the overlay solves the arm: the elbow toward the stand's side (outward,
 * back, down) handed outward by `out` and rolled `elbow` degrees about the
 * shoulder-wrist line, in the chest's frame; the wrist a hand short of the grip.
 */
export function forearm(at: V3, turn: number, lean: number, out: number, elbow: number): Vec {
  const S = authoring(shoulder(turn, lean))
  const grip = authoring(at)
  let f: Vec = unit(sub(grip, S))
  for (let k = 0; k < 3; k++) {
    const W = add(grip, f, -HAND)
    const toW = sub(W, S)
    const D = Math.min(Math.max(Math.hypot(toW[0], toW[1], toW[2]), Math.abs(UPPER - FORE) + 1e-4), (UPPER + FORE) * 0.9995)
    const dir = unit(toW)
    // the elbow's side (overlay.ts basePole, the left arm: outward is +x), then its roll about the arm's line
    const d = chest(dir, turn, lean, true)
    let p = sub(unit(POLE), scale(d, dot(unit(POLE), d)))
    if (Math.hypot(...p) < 1e-3) p = [1, 0, 0]
    p = unit(p)
    if (out > 0) {
      const o = unit(sub([1, 0, 0], scale(d, d[0])))
      p = unit(add(scale(p, 1 - Math.min(1, out)), o, Math.min(1, out)))
    }
    p = chest(rotate(p, d, rad(elbow)), turn, lean)
    // the two-bone solve: the elbow, and the forearm from it to the wrist
    const a = Math.acos(Math.max(-1, Math.min(1, (UPPER * UPPER + D * D - FORE * FORE) / (2 * UPPER * D))))
    const across = unit(sub(p, scale(dir, dot(p, dir))))
    const E = add(add(S, dir, UPPER * Math.cos(a)), across, UPPER * Math.sin(a))
    f = unit(sub(add(S, dir, D), E))
  }
  return authoring(f)
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
  /** the elbow's side handed outward (0..1, for a raised arm) and its roll (deg) */
  out?: number
  elbow?: number
  /** how far the head turns back against the torso's turn */
  head?: number
  /** the edge turned off the forearm's line (deg) */
  roll?: number
}

/**
 * A held cutlass with the torso and arm that carry it: the blade toward
 * `point`, bent back to within WRIST of square to the forearm the arm takes.
 */
export function held(h: Hold): Pose {
  const turn = h.turn ?? 0, lean = h.lean ?? 0, out = h.out ?? 0, elbow = h.elbow ?? 20
  const f = forearm(h.at, turn, lean, out, elbow)
  let b = unit(h.point)
  const along = dot(b, f)
  const limit = Math.sin(rad(WRIST))
  if (Math.abs(along) > limit) {
    // keep where it points round the forearm, and how far along it no further than the wrist allows
    let around = sub(b, scale(f, along))
    if (Math.hypot(...around) < 1e-4) around = unit(cross(f, [0, 0, 1]))
    b = add(scale(unit(around), Math.cos(rad(WRIST))), f, Math.sign(along) * limit)
  }
  return { ...cutlass(h.at, b, h.roll ?? 0), ...turned(turn, h.head ?? 0.7), 'L.out': out, 'L.elbow': elbow }
}

/** The torso turned `turn` degrees (+ left) through hips, spine and chest, the head held back toward the front by `head`. */
export function turned(turn: number, head = 0.7): Pose {
  return { hipYaw: turn * 0.32, spineZ: turn * 0.26, chestZ: turn * 0.42, headZ: -turn * head }
}

/** The free right hand: direction (az + outward, el + up), reach, elbow roll and how closed the hand is. */
export function free(az: number, el: number, reach = 0.8, elbow = 20, grip = 0.55): Pose {
  return { 'R.az': az, 'R.el': el, 'R.reach': reach, 'R.elbow': elbow, 'R.grip': grip }
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
