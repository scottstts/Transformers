import type { Key } from '../../transformer/combat/curves'
import type { Channel } from '../../transformer/combat/pose'
import type { Footstep, MoveCue } from '../../transformer/combat/moves'
import type { SpecialMove } from '../../transformer/combat/special'

/**
 * Juggernaut: the Semi's special. Its eyes and the light bar across its chest
 * blaze and its air brakes vent; then it walks into the crowd, slow and
 * steady, sure of every step, the colour draining from the world round it.
 * Five metres in it rears up on one leg and stamps
 * the ground so hard that everything within 26 m round it is thrown into the
 * air. The gun forms and the world slows: it turns a full circle on the spot
 * holding them up there with the machine gun, every round seeking a body in
 * the air, and rocks them with two cannon bursts. Then it charges the coils
 * full and fires once into the middle of them: everything breaks apart in the
 * air and rains down around it while it skids back from the recoil, raises
 * the smoking gun beside its head and watches it fall.
 *
 * Special time (s): the face 0-0.55, the walk 0.55-2.35,
 * the stamp at 2.8, the gun 3.0, the barrage 3.3-5.3 (slow motion, a full
 * turn, bursts at 3.95 and 4.7), the finale's charge from 5.35, the shot at
 * 6.0, the pose, the handback at 8.0.
 */
const LOAD = 0.55
const STOP = 2.35
const STOMP = 2.8
const GUN = 3.0
const BARRAGE: readonly [number, number] = [3.3, 5.3]
/** The airbursts in the barrage: when. */
const BURSTS: readonly number[] = [3.95, 4.7]
const FINALE = 6.0
/** Where the walk ends (m ahead of where the special began), and where the recoil leaves the robot. */
const RUN = 5.0
const RECOIL = RUN - 1.2
/** The stamp throws everything within this far of the robot into the air (m). */
const QUAKE = 26

/** The special's timing and geometry, for what it does to the soldiers (hits.ts). */
export const JUGGERNAUT = { stomp: STOMP, quake: QUAKE, barrage: BARRAGE, bursts: BURSTS, finale: FINALE, stop: RUN } as const

/** Weapon poses: [x, y, z, yaw, pitch] (pose.ts; roll 180 throughout: the gun's top up). */
type Aim = [number, number, number, number, number]
/** Fired up into the air from the chest: the barrels 28-40 degrees up. */
const up = (yaw: number, elevation: number, raise = 0): Aim => [-0.02 + Math.sin(yaw * Math.PI / 180) * 0.12, 0.42, -0.45 + raise, yaw, 90 - elevation]
const AIMS: Array<[number, Aim]> = [
  [3.25, up(0, 32)],
  [BARRAGE[0], up(-4, 36)],
  [3.8, up(5, 40)],
  [BURSTS[0], up(2, 36)],
  [4.35, up(-5, 42)],
  [BURSTS[1], up(-2, 36)],
  [5.1, up(4, 38)],
  [5.4, up(0, 30, 0.08)],
  [FINALE, up(0, 28, 0.1)],
  // the recoil throws the barrels up and the grip back
  [FINALE + 0.1, [-0.02, 0.32, -0.34, 0, 36]],
  [6.5, up(0, 30, 0.06)],
  // the smoking gun raised upright beside the head, ahead of the shoulder's armour
  [7.1, [0.16, 0.42, -0.1, 10, 8]],
  [8.2, [0.16, 0.42, -0.12, 10, 10]],
]

/** The walk's strides: [lift-off, landing, lateral, forward]: unhurried, the feet set down deliberately. */
const STRIDES: ReadonlyArray<readonly [number, number, number, number]> = [
  [LOAD, 1.0, -0.95, 1.6],
  [1.0, 1.45, 0.95, 2.85],
  [1.45, 1.9, -0.95, 4.1],
  [1.9, STOP, 1.05, RUN + 0.05],
]
/** Root travel through the walk, steady: [t, forward]. */
const TRAVEL: Array<[number, number]> = [[LOAD, 0], [1.0, 1.1], [1.45, 2.35], [1.9, 3.6], [STOP, 4.85], [2.5, RUN]]

/** The barrage's turn: a full circle to the left, eased in and out (deg at special time t). */
const TURN = (t: number): number => {
  const u = Math.min(1, Math.max(0, (t - BARRAGE[0]) / (BARRAGE[1] - BARRAGE[0])))
  return 360 * u * u * (3 - 2 * u)
}
/** When the turn reaches `deg`. */
const TURN_AT = (deg: number): number => {
  let lo = BARRAGE[0], hi = BARRAGE[1]
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2
    if (TURN(mid) < deg) lo = mid
    else hi = mid
  }
  return hi
}
/** A foot's place in the stance at heading `deg` (+ left) round the standing point: [lateral, forward]. */
const stance = (side: 'L' | 'R', deg: number): [number, number] => {
  const a = deg * Math.PI / 180
  const l = side === 'L' ? 1.1 : -1.1, f = 0.05
  return [l * Math.cos(a) + f * Math.sin(a), RUN - l * Math.sin(a) + f * Math.cos(a)]
}

function keys(): Partial<Record<Channel, Key[]>> {
  const k: Partial<Record<Channel, Key[]>> = {}
  const put = (channel: Channel, t: number, v: number): void => { (k[channel] ??= []).push([t, v]) }

  // the body: head down, an upright walk, chest out, rearing up on one leg, the stamp, leaning back firing up, the recoil
  const body = (t: number, drop: number, pitch: number, spine: number, chest: number): void => {
    put('hipDrop', t, drop)
    put('hipPitch', t, pitch)
    put('spineX', t, spine)
    put('chestX', t, chest)
  }
  body(0.35, 0.1, 3, 2, 2)
  body(1.0, 0.14, 2, 0, -2)
  body(1.9, 0.14, 2, 0, -2)
  body(STOP, 0.2, 2, 0, -2)
  body(2.62, -0.02, -6, -8, -8)
  body(STOMP, 0.95, 20, 12, 12)
  body(3.1, 0.42, 6, 2, 0)
  body(BARRAGE[0], 0.36, 2, -6, -8)
  body(5.35, 0.4, 3, -6, -8)
  body(FINALE, 0.52, 6, -8, -10)
  body(FINALE + 0.12, 0.72, -6, -14, -14)
  body(6.6, 0.46, 2, -4, -6)
  body(7.4, 0.14, 0, 0, 0)
  body(8.6, 0, 0, 0, 0)
  // the hips roll a little with each stride, the head level and still
  k.hipYaw = [[1.0, 4], [1.45, -4], [1.9, 4], [STOP, 0], [7.4, 0]]
  k.headX = [[0.3, 10], [LOAD, 12], [1.0, 3], [STOP, 3], [2.62, -4], [STOMP, 16], [3.1, -10], [BARRAGE[0], -24], [5.35, -20], [FINALE + 0.12, -14], [6.6, -24], [7.4, -20], [8.4, 0]]

  // root motion: the charge, the barrage's full turn on the spot, the recoil's skid
  k.advance = [...TRAVEL, [FINALE, RUN], [FINALE + 0.3, RECOIL + 0.2], [6.5, RECOIL]]
  k.turn = [[BARRAGE[0], 0], [BARRAGE[1], 360]]

  // arms: hanging heavy, fists closed, barely swinging opposite the legs
  const ahead = { el: -76, reach: 0.9 }, behind = { el: -102, reach: 0.9 }
  for (const [, t1, lateral] of STRIDES) {
    const right = lateral < 0
    const r = right ? behind : ahead, l = right ? ahead : behind
    put('R.el', t1, r.el)
    put('R.reach', t1, r.reach)
    put('L.el', t1, l.el)
    put('L.reach', t1, l.reach)
  }
  // the stamp: both fists raised high as it rears up, then driven down with it
  k['R.el'] = [[LOAD, -90], ...(k['R.el'] ?? []), [2.62, 48], [STOMP, -60], [3.0, -20]]
  k['L.el'] = [[LOAD, -90], ...(k['L.el'] ?? []), [2.62, 50], [STOMP, -58], [3.1, 6], [5.35, 0], [FINALE + 0.12, -24], [7.4, -58]]
  k['R.reach'] = [[LOAD, 0.9], ...(k['R.reach'] ?? []), [2.62, 0.82], [STOMP, 0.84], [3.0, 0.7]]
  k['L.reach'] = [[LOAD, 0.9], ...(k['L.reach'] ?? []), [2.62, 0.82], [STOMP, 0.84], [3.1, 0.78], [7.4, 0.9]]
  k['R.az'] = [[LOAD, 8], [STOP, 8], [2.62, 24], [STOMP, 14], [3.0, 10]]
  k['L.az'] = [[LOAD, 8], [STOP, 8], [2.62, 24], [STOMP, 14], [3.1, 42], [5.35, 38], [FINALE + 0.12, 50], [7.4, 8]]
  k['R.elbow'] = [[LOAD, 16], [STOP, 16], [STOMP, 10], [3.1, 8]]
  k['L.elbow'] = [[LOAD, 16], [STOP, 16], [STOMP, 10], [3.1, 18], [7.4, 20]]
  k['R.grip'] = [[0.2, 1]]
  k['L.grip'] = [[0.2, 1]]

  // the gun
  for (const [t, [x, y, z, yaw, pitch]] of AIMS) {
    put('w.x', t, x)
    put('w.y', t, y)
    put('w.z', t, z)
    put('w.yaw', t, yaw)
    put('w.pitch', t, pitch)
    put('w.roll', t, 180)
  }
  k['w.wield'] = [[GUN - 0.05, 0], [3.22, 1], [8.3, 1], [8.6, 0]]
  k['w.two'] = [[0.2, 0]]
  k.headZ = [[STOP, 0], [7.4, 4], [8.4, 0]]

  // strictly increasing times per channel
  for (const list of Object.values(k)) {
    list!.sort((a, b) => a[0] - b[0])
    for (let i = list!.length - 1; i > 0; i--) if (list![i][0] - list![i - 1][0] < 1e-3) list!.splice(i - 1, 1)
  }
  return k
}

function steps(): Footstep[] {
  const out: Footstep[] = []
  for (const [t0, t1, lateral, forward] of STRIDES) out.push({ side: lateral < 0 ? 'R' : 'L', t0, t1, to: [lateral, forward], yaw: lateral < 0 ? -3 : 3, lift: 0.3 })
  // the stamp: the right knee comes up to the hip and the foot is driven down beside the left
  out.push({ side: 'R', t0: 2.4, t1: STOMP, to: [-1.1, RUN + 0.05], yaw: -4, via: [-0.95, RUN - 0.3, 1.8], viaYaw: -4, point: 0 })
  // the barrage's full turn: short pivot steps, the feet kept under the hips as it comes round (the left leads a left turn)
  for (let k = 1; k <= 9; k++) {
    const side = k % 2 ? 'L' : 'R'
    const deg = Math.min(360, 40 * k + 20)
    out.push({ side, t0: TURN_AT(40 * k - 38), t1: Math.max(TURN_AT(40 * k - 8), TURN_AT(40 * k - 38) + 0.16), to: stance(side, deg), yaw: deg, lift: 0.18 })
  }
  out.push({ side: 'L', t0: BARRAGE[1] - 0.05, t1: BARRAGE[1] + 0.2, to: stance('L', 360), yaw: 360, lift: 0.14 })
  out.push(
    // the recoil drives both feet back through the sand
    { side: 'L', t0: FINALE, t1: FINALE + 0.35, to: [1.15, RUN - 0.3], yaw: 4, lift: 0 },
    { side: 'R', t0: FINALE + 0.02, t1: FINALE + 0.37, to: [-1.25, RUN - 1.6], yaw: -10, lift: 0 },
    // squared up for the pose
    { side: 'R', t0: 6.9, t1: 7.2, to: [-1.04, RECOIL + 0.05], yaw: 0, lift: 0.26 },
    { side: 'L', t0: 7.2, t1: 7.5, to: [1.04, RECOIL + 0.05], yaw: 0, lift: 0.22 },
  )
  return out.sort((a, b) => a.t0 - b.t0)
}

function cues(): MoveCue[] {
  const list: MoveCue[] = [
    { t: 0.02, cue: 'servo', value: 0.4 },
    { t: 0.05, cue: 'eyes', value: 1 },
    { t: 0.1, cue: 'lights', value: 1 },
    { t: 0.3, cue: 'air', value: 1 },
    { t: LOAD, cue: 'zone', value: 0.6 },
    { t: LOAD + 0.02, cue: 'pull', value: 2 },
    { t: 2.4, cue: 'servo', value: 0.5 },
    { t: STOMP, cue: 'zone', value: 0 },
    { t: STOMP, cue: 'stomp', value: 1 },
    { t: GUN, cue: 'weapon-in', value: 0.3 },
    { t: BARRAGE[0] - 0.1, cue: 'hush', value: 0.45 },
    { t: BARRAGE[0], cue: 'seek', value: 1 },
    { t: BARRAGE[0], cue: 'fire', value: 1 },
    { t: BARRAGE[0] + 0.05, cue: 'servo', value: 1.8 },
    { t: BARRAGE[1], cue: 'fire', value: 0 },
    { t: BARRAGE[1], cue: 'seek', value: 0 },
    { t: BARRAGE[1] + 0.05, cue: 'hush', value: 0 },
    { t: 5.35, cue: 'charge', value: 1 },
    { t: 5.38, cue: 'lights', value: 1.5 },
    { t: 5.4, cue: 'servo', value: 0.4 },
    { t: FINALE - 0.05, cue: 'fuse', value: 14 },
    { t: FINALE, cue: 'cannon', value: 2.2 },
    { t: FINALE, cue: 'charge', value: 0 },
    { t: FINALE, cue: 'finale', value: 1 },
    { t: 6.4, cue: 'smoke', value: 4 },
    { t: 6.9, cue: 'servo', value: 0.4 },
    { t: 7.4, cue: 'lights', value: 0 },
    { t: 7.6, cue: 'pull', value: 0 },
    { t: 7.9, cue: 'eyes', value: 0 },
    { t: 8.1, cue: 'weapon-out', value: 0.5 },
  ]
  for (const t of BURSTS) {
    list.push({ t: t - 0.25, cue: 'charge', value: 0.8 }, { t: t - 0.05, cue: 'fuse', value: 16 }, { t, cue: 'cannon', value: 1.1 }, { t: t + 0.01, cue: 'charge', value: 0 })
  }
  return list.sort((a, b) => a.t - b.t)
}

export const SEMI_SPECIAL: SpecialMove = {
  name: 'juggernaut',
  handback: 8.0,
  handbackView: { yaw: Math.PI, pitch: 0.2 },
  // the barrage hangs in slow motion; the finale's burst freezes, then plays out slowly
  tempo: [[STOMP - 0.01, 1], [STOMP + 0.03, 0.3], [STOMP + 0.2, 0.3], [3.1, 1], [BARRAGE[0] - 0.1, 1], [BARRAGE[0] + 0.05, 0.5], [BARRAGE[1] - 0.2, 0.5], [BARRAGE[1] + 0.05, 1], [FINALE - 0.01, 1], [FINALE + 0.05, 0.15], [6.2, 0.15], [6.6, 0.5], [7.2, 1]],
  move: { name: 'juggernaut', duration: 8.8, chain: [8.8, 8.8], keys: keys(), steps: steps(), cues: cues() },
  shots: [
    // the face as the eyes flare, looking down at what is in front of it
    { at: 0, eyeFrame: 'head', eye: [[0, 0.35, 2.7, -0.15], [LOAD, 0.25, 2.2, -0.2]], lookFrame: 'head', look: [[0, 0, 0.2, 0.05], [LOAD, 0, 0.2, 0]], fov: [[0, 32], [LOAD, 28]] },
    // low and long ahead of it: it walks at the lens, unhurried, the colour draining
    { at: LOAD, eye: [[LOAD, -2.5, 14, 1.0], [1.5, -2.3, 13.5, 1.1]], lookFrame: 'body', look: [[LOAD, 0, 0, 1.8], [1.5, 0, 0, 1.8]], fov: [[LOAD, 34], [1.5, 30]] },
    // alongside it, low, tracking with its steps
    { at: 1.5, eyeFrame: 'body', eye: [[1.5, -8, 1.5, -2.5], [STOP, -8.5, 0.5, -2.4]], lookFrame: 'body', look: [[1.5, 0, 1, 1.5], [STOP, 0, 1, 1.5]], fov: [[1.5, 42], [STOP, 44]] },
    // wide and low off its side: it rears up and stamps, the ground heaves and the crowd goes up
    { at: STOP, eye: [[STOP, -11, RUN + 3, 1.0], [3.3, -12, RUN + 4, 1.6]], lookFrame: 'body', look: [[STOP, 0, 0, 0.5], [3.3, 0, 0, 3]], fov: [[STOP, 56], [3.3, 60]] },
    // slow motion, low and close: it turns on the spot firing up into the bodies overhead
    { at: 3.3, eyeFrame: 'body', eye: [[3.3, -7, -5, 0.5], [4.4, -8, 2, 1.0]], look: [[3.3, 0, RUN + 2, 9], [4.4, 0, RUN, 10]], fov: [[3.3, 60], [4.4, 58]] },
    // from up among them, down at it
    { at: 4.4, eye: [[4.4, 10, RUN + 12, 15], [5.35, 12, RUN + 6, 16]], lookFrame: 'body', look: [[4.4, 0, 0, 2], [5.35, 0, 0, 2]], fov: [[4.4, 50], [5.35, 48]] },
    // pushing in on the gun as the coils charge full
    { at: 5.35, eyeFrame: 'body', eye: [[5.35, -3.6, 4, 3.8], [FINALE - 0.02, -2.4, 4.2, 3.4]], lookFrame: 'weapon', look: [[5.35, 0, 0, 0], [FINALE - 0.02, 0, 0, 0]], fov: [[5.35, 40], [FINALE - 0.02, 32]] },
    // wide and low off its side: the burst fills the sky
    { at: FINALE, eye: [[FINALE, -22, RUN - 7, 2], [6.9, -21, RUN - 6, 2.5]], look: [[FINALE, 0, RUN + 5, 10], [6.9, 0, RUN + 4, 8]], fov: [[FINALE, 52], [6.9, 50]] },
    // the hero: low off its front-left as the pieces rain down round the smoking gun
    { at: 6.9, eye: [[6.9, 6.5, RECOIL + 8, 1.0], [8.0, 5.5, RECOIL + 7, 1.4]], lookFrame: 'head', look: [[6.9, 0, 0, -0.5], [8.0, 0, 0, -0.3]], fov: [[6.9, 38], [8.0, 36]] },
  ],
}
