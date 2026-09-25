import type { Key } from '../../transformer/combat/curves'
import type { Channel } from '../../transformer/combat/pose'
import type { MoveCue } from '../../transformer/combat/moves'
import type { SpecialMove } from '../../transformer/combat/special'

/**
 * Red Line: the racer's special. It turns side-on into an iaido stance, hand
 * on the hilt at its left hip, and forges the sword there while the power
 * unit screams against its rev limiter and the world drains of colour. Then
 * it is gone: four cuts at 65 m/s straight through a ring 13 m across, each
 * leaving a white-hot arc hanging in the air where the blade passed, with a
 * skidding hairpin round the rim between them, its blade trailing and its
 * tip carving a line of molten glass round the ring. The third cut passes the
 * camera in bullet time. It skids to a stop outside the ring with its back to
 * it and holds; then flicks the blade clean, and everything it cut goes up
 * behind it: the arcs flare, the centre explodes and fire runs round the ring.
 *
 * The path is built from the ring's geometry below: points on it are measured
 * in the special's ground frame, [lateral (+ left), forward]; cut k runs from
 * one rim point straight through the centre to the opposite one, and each
 * hairpin swings right, outside the rim, round to the next cut's start. The
 * heading turns 225 degrees right in every hairpin. Sword poses follow the
 * draw-cut family (combat.md): drawn from the left hip, rising cuts from a
 * low trailing guard on the right, the blade in front of the body.
 */

/** Ring centre (m ahead) and radius; hairpins swing out to OUT. */
const CENTER = 8.5
const RADIUS = 6.5
const OUT = 8.4
/** Seconds a cut takes through the ring, and a hairpin round its rim. */
const CUT = 0.2
const HAIRPIN = 0.36

type Point = [number, number]
const rad = (deg: number): number => deg * Math.PI / 180
/** A point on the ring (or a circle about its centre) at `deg` from straight ahead, + to the left. */
const ring = (deg: number, r = RADIUS): Point => [r * Math.sin(rad(deg)), CENTER + r * Math.cos(rad(deg))]
/** `p` moved `d` m along the heading `deg`, then `side` m to its right. */
const move = (p: Point, deg: number, d: number, side = 0): Point =>
  [p[0] + d * Math.sin(rad(deg)) - side * Math.cos(rad(deg)), p[1] + d * Math.cos(rad(deg)) + side * Math.sin(rad(deg))]

/** Weapon poses: [x, y, z, yaw, pitch, roll] (pose.ts). */
type Grip = [number, number, number, number, number, number]
const DRAWN: Grip = [-0.85, 0.3, -0.5, -150, 100, 90]
/** Low and trailing on the right, the tip in the sand behind. */
const TRAIL: Grip = [0.55, -0.15, -0.55, 150, 150, 90]
const ZANSHIN: Grip = [0.62, 0.22, -0.15, 120, 100, 90]
const FLICKED: Grip = [0.42, 0.36, -0.55, 40, 150, 0]
/** A rising cut from the trailing guard up through the front to high on the left. */
const RISE: Array<[number, Grip]> = [
  [0.05, [0.6, 0.3, -0.3, 115, 118, 90]],
  [0.1, [0.35, 0.7, -0.05, 40, 92, 90]],
  [0.15, [-0.05, 0.68, 0.2, -25, 72, 90]],
  [0.2, [-0.45, 0.5, 0.35, -60, 58, 90]],
]
/** From high on the left back down across the front to the trailing guard. */
const RETURN: Array<[number, Grip]> = [
  [0.1, [0.1, 0.62, 0.05, 30, 100, 90]],
  [0.22, TRAIL],
]

/** Free-leg poses per side: [lx, ly, lz, lp] (pose.ts). */
type Leg = [number, number, number, number]
const STANCE: Record<'L' | 'R', Leg> = { L: [0.06, 0.61, 0, 0], R: [0.1, -0.44, 0, 0] }
/** Gliding low through a cut, the rear foot pushing off its toe. */
const SPRINT: Record<'L' | 'R', Leg> = { L: [0.02, 0.7, 0.08, -8], R: [0.05, -0.75, 0.18, 38] }
/** Both feet ploughing wide round a hairpin. */
const SKID: Record<'L' | 'R', Leg> = { L: [0.32, 0.4, 0, 0], R: [0.28, -0.35, 0, 0] }
const PLANTED: Record<'L' | 'R', Leg> = { L: [0.2, 0.5, 0, 0], R: [0.15, -0.45, 0, 0] }

const LAUNCH = 1.2
const STOP = 3.55
const IGNITE = 4.26

/** The dash, point by point: [t, lateral, forward, turn (deg)], plus the cut and hairpin windows. */
function plan() {
  const path: Array<[number, number, number, number]> = [[LAUNCH, 0, 0, 0]]
  const cuts: Array<[number, number]> = []
  const hairpins: Array<[number, number]> = []
  // cut 1 from the stance straight through the centre
  let t = LAUNCH
  let at: Point = ring(0)
  path.push([t + 0.11, 0, CENTER, 0], [t + 0.22, at[0], at[1], 0])
  cuts.push([t, t + 0.22])
  t += 0.22
  let heading = 0
  let turn = 0
  // hairpin right to the next start, then through the centre: end angles on the rim
  for (const [end, next] of [[0, -45], [135, 90], [-90, -135]] as const) {
    const a = move(at, heading, 1.3, 0.45)
    const b = ring((end + next) / 2, OUT)
    const start = ring(next)
    path.push([t + HAIRPIN / 3, a[0], a[1], turn - 70], [t + HAIRPIN * 2 / 3, b[0], b[1], turn - 150], [t + HAIRPIN, start[0], start[1], turn - 225])
    hairpins.push([t, t + HAIRPIN])
    t += HAIRPIN
    turn -= 225
    heading = next + 180
    at = ring(next + 180)
    path.push([t + CUT / 2, 0, CENTER, turn], [t + CUT, at[0], at[1], turn])
    cuts.push([t, t + CUT])
    t += CUT
  }
  // out of the ring and skidding to a stop, its back to it
  const slow = move(at, heading, 2.2)
  const stop = move(at, heading, 3.6)
  path.push([t + 0.18, slow[0], slow[1], turn], [STOP, stop[0], stop[1], turn])
  return { path, cuts, hairpins }
}

const PLAN = plan()

function keys(): Partial<Record<Channel, Key[]>> {
  const k: Partial<Record<Channel, Key[]>> = {}
  const put = (channel: Channel, t: number, v: number): void => { (k[channel] ??= []).push([t, v]) }
  // root motion
  for (const [t, lat, fwd, turn] of PLAN.path) {
    put('advance', t, fwd)
    put('strafe', t, lat)
    put('turn', t, turn)
  }
  // the sword: drawn, cut, trailed, cut again...
  const grip = (t: number, g: Grip): void => {
    const names = ['w.x', 'w.y', 'w.z', 'w.yaw', 'w.pitch', 'w.roll'] as const
    names.forEach((n, i) => put(n, t, g[i]))
  }
  grip(0.45, DRAWN)
  grip(LAUNCH, DRAWN)
  // the draw comes forward off the hip first, clear of the chest
  grip(LAUNCH + 0.05, [-0.55, 0.66, -0.28, -100, 94, 90])
  grip(LAUNCH + 0.11, [-0.1, 0.68, -0.08, -10, 90, 90])
  grip(LAUNCH + 0.16, [0.45, 0.55, -0.02, 75, 90, 90])
  grip(LAUNCH + 0.22, [0.62, 0.25, -0.1, 118, 96, 90])
  PLAN.hairpins.forEach(([t0, t1], i) => {
    if (i === 0) grip(t0 + 0.14, TRAIL)
    else for (const [dt, g] of RETURN) grip(t0 + dt, g)
    grip(t1, TRAIL)
  })
  PLAN.cuts.slice(1).forEach(([t0]) => { for (const [dt, g] of RISE) grip(t0 + dt, g) })
  // after the last cut: down across to the right in the skid, held, then flicked clean
  const last = PLAN.cuts[3][1]
  grip(last + 0.1, [0.05, 0.7, 0.1, 15, 95, 90])
  grip(last + 0.22, [0.5, 0.5, -0.08, 90, 100, 90])
  grip(last + 0.35, ZANSHIN)
  grip(IGNITE - 0.14, ZANSHIN)
  grip(IGNITE - 0.02, FLICKED)
  grip(6.4, FLICKED)

  // free legs through the dash, planted for the stance before and after
  const leg = (t: number, pose: Record<'L' | 'R', Leg>): void => {
    for (const side of ['L', 'R'] as const) {
      const [lx, ly, lz, lp] = pose[side]
      put(`${side}.lx`, t, lx)
      put(`${side}.ly`, t, ly)
      put(`${side}.lz`, t, lz)
      put(`${side}.lp`, t, lp)
    }
  }
  leg(1.08, STANCE)
  PLAN.cuts.forEach(([t0, t1]) => leg((t0 + t1) / 2, SPRINT))
  PLAN.hairpins.forEach(([t0, t1]) => leg((t0 + t1) / 2, SKID))
  leg(STOP - 0.08, PLANTED)
  for (const side of ['L', 'R'] as const) {
    k[`${side}.free`] = [[1.12, 0], [LAUNCH, 1], [STOP - 0.05, 1], [STOP + 0.07, 0]]
  }

  // the body: low through the cuts, leaning into each hairpin, the chest winding and unwinding with the blade
  const body = (t: number, drop: number, pitch: number, lean: number, twist: number): void => {
    put('hipDrop', t, drop)
    put('hipPitch', t, pitch)
    put('hipRoll', t, lean * 0.8)
    put('spineY', t, lean)
    put('chestZ', t, twist)
    put('headZ', t, -twist * 0.6)
  }
  body(0.35, 0.2, 4, 0, 14)
  body(0.75, 0.36, 9, 0, 22)
  body(1.1, 0.4, 10, 0, 24)
  body(LAUNCH + 0.11, 0.3, 18, 0, 0)
  body(LAUNCH + 0.22, 0.32, 16, 0, -24)
  PLAN.hairpins.forEach(([t0, t1]) => {
    body(t0 + HAIRPIN / 2, 0.56, 12, -12, -14)
    body(t1, 0.42, 16, -4, -20)
  })
  PLAN.cuts.slice(1).forEach(([t0, t1]) => {
    body((t0 + t1) / 2, 0.3, 18, 0, 6)
    body(t1, 0.32, 14, 0, 24)
  })
  body(last + 0.22, 0.48, 12, -6, -18)
  body(STOP, 0.44, 10, 0, -22)
  body(IGNITE - 0.14, 0.4, 9, 0, -20)
  body(IGNITE, 0.45, 12, 0, -26)
  body(5.2, 0.28, 6, 0, -14)
  body(6.3, 0.08, 1, 0, 0)
  // hips square to the stance side-on, then face the cut
  k.hipYaw = [[0.4, 24], [1.1, 28], [LAUNCH + 0.15, 0], [STOP, -10], [5.6, -4], [6.4, 0]]
  // eyes fixed ahead; a look back over the shoulder at what went up
  k.headX = [[0.3, 6], [1.1, 4], [STOP, 2], [4.5, -2], [4.9, 4]]
  k.headZ = [...(k.headZ ?? []).filter(([t]) => t < IGNITE + 0.1), [4.75, -40], [5.5, -36], [6.3, 0]]
  k.chestZ = [...(k.chestZ ?? []).filter(([t]) => t < IGNITE + 0.1), [4.75, -34], [5.5, -30], [6.3, 0]]

  // the sword hand to the hilt at the hip; the other hand on the scabbard, then out for balance
  k['R.az'] = [[0.35, -58]]
  k['R.el'] = [[0.35, -52]]
  k['R.reach'] = [[0.35, 0.6]]
  k['R.elbow'] = [[0.35, 30], [LAUNCH + 0.2, 20], [STOP, 18]]
  k['R.grip'] = [[0.3, 0.7], [0.45, 1]]
  k['w.wield'] = [[0.4, 0], [0.55, 1]]
  k['L.az'] = [[0.35, 8], [1.1, 10], [LAUNCH + 0.12, 40], [STOP - 0.1, 42], [STOP + 0.2, 16], [6.3, 4]]
  k['L.el'] = [[0.35, -58], [1.1, -56], [LAUNCH + 0.12, -26], [STOP - 0.1, -28], [STOP + 0.2, -44], [6.3, -18]]
  k['L.reach'] = [[0.35, 0.55], [LAUNCH + 0.12, 0.82], [STOP - 0.1, 0.8], [STOP + 0.2, 0.52], [6.3, 0.5]]
  k['L.elbow'] = [[0.35, 20]]
  k['L.grip'] = [[0.1, 1]]
  // the feet leave for the dash from the heel-up of the stance
  k['R.heel'] = [[0.8, 16], [1.15, 22], [1.25, 0]]

  // strictly increasing times per channel
  for (const list of Object.values(k)) {
    list!.sort((a, b) => a[0] - b[0])
    for (let i = list!.length - 1; i > 0; i--) if (list![i][0] - list![i - 1][0] < 1e-3) list!.splice(i - 1, 1)
  }
  return k
}

function cues(): MoveCue[] {
  const list: MoveCue[] = [
    { t: 0.02, cue: 'servo', value: 0.35 },
    { t: 0.1, cue: 'eyes', value: 1 },
    { t: 0.3, cue: 'limiter', value: 1 },
    { t: 0.5, cue: 'zone', value: 1 },
    { t: 0.55, cue: 'weapon-in', value: 0.5 },
    { t: 1.16, cue: 'zone', value: 0 },
    { t: LAUNCH, cue: 'drive', value: 1 },
    { t: LAUNCH + 0.11, cue: 'mark', value: 1 },
    { t: STOP - 0.1, cue: 'drive', value: 0 },
    { t: STOP + 0.2, cue: 'servo', value: 0.3 },
    { t: IGNITE, cue: 'ignite', value: 1 },
    { t: 4.6, cue: 'weapon-out', value: 0.5 },
    { t: 4.8, cue: 'engine', value: 0 },
    { t: 5.2, cue: 'eyes', value: 0 },
  ]
  for (const [t0, t1] of PLAN.cuts) list.push({ t: t0 + 0.02, cue: 'arc', value: 1 }, { t: t1 - 0.01, cue: 'arc', value: 0 })
  for (const [t0, t1] of PLAN.hairpins) list.push({ t: t0 + 0.07, cue: 'drag', value: 1 }, { t: t1 - 0.02, cue: 'drag', value: 0 })
  return list.sort((a, b) => a.t - b.t)
}

const [STOP_LAT, STOP_FWD] = PLAN.path[PLAN.path.length - 1].slice(1, 3) as [number, number]
/** The stop faces out of the ring along the last cut: 45 degrees left of the special's heading. */
const FACE = Math.SQRT1_2
/** A point `d` m ahead of the stopped robot and `side` m to its right (ground frame [lateral, forward]). */
const ahead = (d: number, side: number): Point => [STOP_LAT + (d - side) * FACE, STOP_FWD + (d + side) * FACE]
/** A point share `k` of the way from the stopped robot back to the ring's centre. */
const between = (k: number): Point => [STOP_LAT * (1 - k), STOP_FWD + (CENTER - STOP_FWD) * k]

export const F1_SPECIAL: SpecialMove = {
  name: 'red-line',
  handback: 5.6,
  handbackView: { yaw: 0, pitch: 0.2 },
  // bullet time as the third cut passes the camera; the blast held a moment
  tempo: [[2.38, 1], [2.43, 0.12], [2.47, 0.12], [2.54, 1], [IGNITE + 0.04, 1], [IGNITE + 0.1, 0.32], [4.9, 0.45], [5.3, 1]],
  move: { name: 'red-line', duration: 6.6, chain: [6.6, 6.6], keys: keys(), cues: cues() },
  shots: [
    // the eyes, as the engine climbs to the limiter
    { at: 0, eyeFrame: 'head', eye: [[0, -0.55, 1.6, 0.22], [0.55, -0.4, 1.3, 0.18]], lookFrame: 'head', look: [[0, 0, 0.1, 0.18], [0.55, 0, 0.1, 0.16]], fov: [[0, 30], [0.55, 26]] },
    // low off its front-left, facing the turned chest and the hand on the hilt, the colour draining
    { at: 0.55, eye: [[0.55, 4.8, 3.6, 0.8], [LAUNCH, 4.2, 3.1, 0.7]], lookFrame: 'body', look: [[0.55, 0, 0.2, 0.2], [LAUNCH, 0, 0.2, 0.25]], fov: [[0.55, 40], [LAUNCH, 35]] },
    // high over the ring: it is gone, a streak through the middle and round
    { at: LAUNCH, eye: [[LAUNCH, 10, -4, 9], [2.3, 11, -2.5, 9.5]], look: [[LAUNCH, 0, CENTER, 0.5], [2.3, 0, CENTER, 0.5]], fov: [[LAUNCH, 55], [2.3, 52]] },
    // at the centre, low: the third cut goes past in bullet time
    { at: 2.3, eye: [[2.3, -2.2, CENTER + 2.8, 1.4], [2.62, -2.4, CENTER + 2.8, 1.4]], lookFrame: 'body', look: [[2.3, 0, 0, 0.4], [2.62, 0, 0, 0.4]], lag: 14, fov: [[2.3, 44], [2.62, 42]] },
    // wide from the far side as it finishes and slides out
    { at: 2.62, eye: [[2.62, -10, 18, 6.5], [STOP, -8.5, 19, 5.5]], lookFrame: 'body', look: [[2.62, 0, 0, 0], [STOP, 0, 0, 0]], fov: [[2.62, 50], [STOP, 46]] },
    // in front of it at the stop, off to one side so the ring shows beside it: the stillness, the flick, the fire
    { at: STOP, eye: [[STOP, ...ahead(7, 5), 1.8], [4.95, ...ahead(6.6, 4.8), 2.3]], look: [[STOP, ...between(0.3), 2.4], [4.95, ...between(0.34), 2.9]], fov: [[STOP, 44], [4.95, 40]] },
    // high, as the ring burns
    { at: 4.95, eye: [[4.95, 16, 27, 14], [5.6, 15, 28, 15]], look: [[4.95, 1, 9.5, 0], [5.6, 1.5, 10.5, 0]], fov: [[4.95, 52], [5.6, 50]] },
  ],
}
