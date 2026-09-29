import type { Key } from '../../transformer/combat/curves'
import type { CombatMove, MoveCue, Moveset } from '../../transformer/combat/moves'
import type { Channel } from '../../transformer/combat/pose'
import { POKE_PEAK, SLASH_PEAK } from './audio/spear-models'

/**
 * The Bat's combo: all spear, in one hand, fought as a spear is in the
 * Chinese forms: the body turns, sinks and steps behind every blow, the free
 * hand an open palm that balances it, and the spear never stops between
 * strikes. A thrust that runs the shaft out through the hand, a sweep carried
 * round the whole front that loops up and back to the side, a flurry of
 * thrusts too fast to follow, leaning in, and the spear spun flat overhead
 * into a vortex, run out to its butt for one broad sweep, looped once more
 * overhead and brought to rest at the side. Distances in metres (hips 2.76 m
 * up, arms 1.9 m), angles in degrees; see pose.ts for the channels.
 *
 * The spear is held at the side (`SIDE`): the right fist beside the hip, the
 * shaft through it on the diagonal, the point ahead and low. The overlay turns
 * the wrist with the forearm (`wristFollows`), so a pose names only where the
 * fist is, where the point goes and where along the shaft the hand holds it
 * (`w.slide`): at its grip band at rest, at the middle for the spin, near the
 * butt when a thrust or a sweep wants the whole reach.
 *
 * Feet start in the stance: left [0.86, 0], right [-0.86, 0] in the move's
 * ground frame.
 */

type Pose = Partial<Record<Channel, number>>
type Keys = Partial<Record<Channel, Key[]>>
type V3 = readonly [number, number, number]

/** The right shoulder's rest place from the pelvis (m: x + left, forward, up) and the arm's length: the weapon channels' origin and unit. */
const SHOULDER: V3 = [-1.18, 0, 1.64]
const ARM = 1.9
/** Along the shaft from the grip band (m): its middle (a spin's pivot) and the hand near the butt (a thrust's or a sweep's reach). */
const MIDDLE = 1.65
const LONG = -1.5

/**
 * The spear in the right hand: the fist at `at` (m from the pelvis at rest, in
 * the heading's frame: x + left, forward, up), the point toward `aim` (deg,
 * + left of the heading) and `elev` (deg above level), the hand `slide` m up
 * the shaft from its grip band.
 */
export function spear(at: V3, aim: number, elev: number, slide = 0): Pose {
  return {
    'w.x': -(at[0] - SHOULDER[0]) / ARM, 'w.y': (at[1] - SHOULDER[1]) / ARM, 'w.z': (at[2] - SHOULDER[2]) / ARM,
    'w.yaw': -aim, 'w.pitch': 90 - elev, 'w.roll': 0, 'w.slide': slide,
  }
}

const rad = (deg: number): number => deg * Math.PI / 180
/** Past a straight arm's reach (m from the shoulder): a swung fist on the arm held straight toward it. */
const STRAIGHT = 2.3

/** A swung spear: the arm's line from the shoulder and where the point goes (see `swing`). */
interface Swing {
  /** the torso's turn (deg + left) and forward lean (deg, the hips, spine and chest together) */
  turn: number
  lean?: number
  /** the arm toward `phi` (deg + left of the heading), `drop` below level (deg; - raised), the fist `reach` m out */
  phi: number
  drop: number
  reach?: number
  /** the point toward `aim` (deg + left of the heading) and `elev` (deg above level) */
  aim: number
  elev: number
  slide?: number
  /** how far the head turns back against the torso's turn */
  head?: number
}

/**
 * A swung spear: the torso turned and leant, the arm out from the shoulder
 * where they carry it (straight, unless a shorter reach bends it), and the
 * point where it goes. A pose keeps the arm well off the shaft's line (a
 * lowered arm and a level shaft, the point trailing or leading the hand), so
 * the wrist can take it and the butt passes the fist's far side, clear of the
 * gauntlet.
 */
function swing(o: Swing): Pose {
  const a = rad(o.turn), l = rad(o.lean ?? 0)
  const up = SHOULDER[2] * Math.cos(l), ahead = SHOULDER[2] * Math.sin(l)
  const x = SHOULDER[0] * Math.cos(a) + ahead * Math.sin(a)
  const f = -SHOULDER[0] * Math.sin(a) + ahead * Math.cos(a)
  const p = rad(o.phi), d = rad(o.drop), r = o.reach ?? STRAIGHT
  return {
    ...spear([x + r * Math.cos(d) * Math.sin(p), f + r * Math.cos(d) * Math.cos(p), up - r * Math.sin(d)], o.aim, o.elev, o.slide ?? LONG),
    ...turned(o.turn, o.head ?? 0.6),
  }
}

/** The torso turned `turn` degrees (+ left) through hips, spine and chest, the head held on the front. */
function turned(turn: number, head = 0.75): Pose {
  return { hipYaw: turn * 0.3, spineZ: turn * 0.25, chestZ: turn * 0.45, headZ: -turn * head }
}

/** The free left hand: direction (az + outward, el + up), reach, elbow roll, an open palm. */
function palm(az: number, el: number, reach = 0.85, elbow = 20): Pose {
  return { 'L.az': az, 'L.el': el, 'L.reach': reach, 'L.elbow': elbow, 'L.grip': 0.12 }
}

/** At rest between blows: the fist beside the right hip, the point ahead and low; the body a little turned, the palm up in front. */
const SIDE_AT: V3 = [-1.55, 0.35, -0.42]
const SIDE = (): Pose => ({ ...spear(SIDE_AT, -3, -16), ...turned(-10), ...palm(-6, -12, 0.8, 26), hipDrop: 0.22, hipPitch: 3 })

/** Keys from poses at times; later poses add to the channels they name. */
function keyed(list: ReadonlyArray<readonly [number, Pose]>, into: Keys = {}): Keys {
  for (const [t, pose] of list) for (const [c, v] of Object.entries(pose)) (into[c as Channel] ??= []).push([t, v as number])
  for (const keys of Object.values(into)) {
    keys!.sort((a, b) => a[0] - b[0])
    for (let i = keys!.length - 1; i > 0; i--) if (keys![i][0] - keys![i - 1][0] < 1e-3) keys!.splice(i - 1, 1)
  }
  return into
}

/** The spear forming in the fist as the move begins (out of the guard, the left hand lets go of it at once). */
const WIELD: Keys = { 'w.wield': [[0.1, 1]], 'w.two': [[0.05, 0]], 'R.grip': [[0.08, 1]] }
/** The first move turns the shaft onto its line at once, while barely formed, so the forming spear never sweeps through the legs (the others take it up formed). */
const LINE_UP = 0.04

/** Letting the spear go (a move's `recovery`, overlaid on the settle): held at the side as it dissolves, then the hand drops to the stance's hang. */
const RELEASE: CombatMove['recovery'] = {
  ...keyed([[0.28, spear(SIDE_AT, 3, -18)]]),
  'w.wield': [[0.28, 1], [0.54, 0]],
}

/**
 * 1. The thrust: the body coils to the right, then the left foot steps in, the
 * hips and shoulders turn through and the arm drives the point out, the shaft
 * running through the hand to its butt; the palm swings back to balance it.
 * The point draws a small circle as it comes back to the side.
 */
const THRUST: CombatMove = {
  name: 'thrust',
  strike: 0.3,
  duration: 0.85,
  chain: [0.42, 0.95],
  cancelAt: 0.44,
  recovery: RELEASE,
  keys: keyed([
    [LINE_UP, spear([-1.6, 0.1, -0.45], -4, -8)],
    [0.12, { ...spear([-1.55, -0.1, -0.3], -4, -6), ...turned(-34), ...palm(-8, 0, 0.9, 30), hipDrop: 0.26, hipPitch: 2 }],
    [0.2, { ...spear([-1.3, 1.3, -0.3], -1, -4, -0.8), ...turned(0), hipDrop: 0.34 }],
    [0.3, { ...swing({ turn: 46, lean: 16, phi: 3, drop: 36, aim: 2, elev: -9 }), ...palm(125, -25, 0.92, 10), hipDrop: 0.4, hipPitch: 10, chestX: 6, hipX: 0.12 }],
    [0.4, { ...swing({ turn: 40, lean: 15, phi: 5, drop: 32, aim: 6, elev: -1 }), hipPitch: 9 }],
    [0.52, { ...spear([-1.35, 1.6, -0.35], -3, -9, -0.6), ...turned(8), ...palm(40, -20, 0.85, 20), hipPitch: 6, chestX: 3, hipX: 0.05 }],
    [0.78, SIDE()],
  ], {
    ...WIELD,
    'R.heel': [[0.18, 0], [0.3, 22], [0.5, 8], [0.62, 0]],
    advance: [[0.1, 0.05], [0.3, 0.75], [0.6, 0.95]],
  }),
  steps: [
    { side: 'L', t0: 0.08, t1: 0.26, to: [0.95, 1.3], yaw: 10, lift: 0.22 },
    { side: 'R', t0: 0.46, t1: 0.66, to: [-0.9, 0.55], yaw: -8, lift: 0.14 },
  ],
  cues: [
    { t: 0.02, cue: 'weapon-in', value: 0.18 },
    { t: 0.04, cue: 'servo', value: 0.35 },
    { t: 0.3 - POKE_PEAK, cue: 'poke', value: 1 },
    { t: 0.29, cue: 'lance', value: 1.1 },
    { t: 0.3, cue: 'kick', value: 0.24 },
  ],
}

/**
 * 2. The sweep, backhand: the body winds hard to the left, the arm reaching
 * across the front and the point trailing out behind to the left, run long
 * through the hand; then hips, spine and chest unwind and carry it flat round
 * the whole front at a soldier's chest, a step in behind it, the point
 * trailing the hand into the blow and leading it out, and the body opens wide
 * to the right, the spear rising out behind it. It swings on round the
 * outside of the right side, the point coming forward, to rest at the side.
 */
const SWEEP: CombatMove = {
  name: 'sweep',
  strike: 0.3,
  duration: 0.9,
  chain: [0.68, 1.1],
  cancelAt: 0.68,
  recovery: RELEASE,
  keys: keyed([
    [0.04, { 'w.slide': LONG }],
    [0.14, { ...swing({ turn: 66, phi: 72, drop: 40, aim: 112, elev: -4, head: 0.45 }), ...palm(115, -10, 0.9, 20), hipDrop: 0.3, hipX: 0.14, hipPitch: 2 }],
    // the coil tightens a moment, then everything goes at once: the arc from here to the open finish in 0.2 s
    [0.2, { ...swing({ turn: 72, phi: 78, drop: 42, aim: 118, elev: -4, head: 0.45 }), hipDrop: 0.34, hipX: 0.16 }],
    [0.26, { ...swing({ turn: 14, phi: 40, drop: 40, aim: 66, elev: -6 }), hipDrop: 0.4, hipX: 0.04 }],
    [0.3, { ...swing({ turn: -48, lean: 8, phi: -8, drop: 40, aim: 4, elev: -8 }), ...palm(20, 0, 0.9, 30), hipDrop: 0.46, hipPitch: 9, chestX: 6, hipX: -0.08 }],
    [0.34, { ...swing({ turn: -76, lean: 6, phi: -55, drop: 38, aim: -70, elev: -6 }), hipX: -0.14 }],
    [0.4, { ...swing({ turn: -90, lean: 5, phi: -92, drop: 25, aim: -118, elev: 16 }), ...palm(-10, 5, 0.92, 30), hipPitch: 6, chestX: 3, hipX: -0.16, hipDrop: 0.44 }],
    [0.5, { ...swing({ turn: -88, lean: 5, phi: -94, drop: 24, aim: -122, elev: 18 }), hipDrop: 0.4 }],
    // the spear swung on round the outside of the right side, the point coming forward to the side's
    [0.68, { ...swing({ turn: -26, phi: -95, drop: 32, reach: 2.1, aim: -50, elev: -6 }), hipX: -0.06 }],
    [0.86, SIDE()],
  ], {
    ...WIELD,
    'R.heel': [[0.18, 0], [0.32, 16], [0.6, 4]],
    advance: [[0.14, 0], [0.3, 0.6], [0.5, 0.9]],
  }),
  steps: [
    // the left foot steps in across the front as the blow lands, then the right steps out as the body opens to the right
    { side: 'L', t0: 0.14, t1: 0.29, to: [0.75, 1.2], yaw: -15, lift: 0.22 },
    { side: 'R', t0: 0.33, t1: 0.5, to: [-1.15, 0.6], yaw: -30, lift: 0.16 },
  ],
  cues: [
    { t: 0.03, cue: 'servo', value: 0.4 },
    { t: 0.3 - SLASH_PEAK, cue: 'slash', value: 1.2 },
    { t: 0.3, cue: 'crescent', value: 0.55 },
    { t: 0.3, cue: 'stop', value: 0.05 },
    { t: 0.31, cue: 'punch', value: 5 },
    { t: 0.31, cue: 'shake', value: 0.22 },
  ],
}

/**
 * 3. The flurry: a long step in, leaning in over the lead knee, the palm swept
 * back and up, and the thrusts come too fast to follow, the straight arm
 * driving the point out and drawing it back, each at its own aim across the
 * front (degrees + left of the heading); a coil back, then the last, heaviest
 * thrust straight ahead from a deeper lunge.
 */
const FLURRY_START = 0.3
const FLURRY_BEAT = 0.09
const FLURRY_AIMS = [0, 14, -12, 26, -22, 6, 32, -30, 18, -6, 24, -16]
export const FLURRY_HOME = FLURRY_AIMS.map((_, i) => FLURRY_START + i * FLURRY_BEAT + FLURRY_BEAT / 2)
export const FLURRY_LAST = 1.58
/** Leaning in over the lead knee (hips, spine and chest: 30 degrees in all). */
const LEAN: Pose = { hipPitch: 16, spineX: 6, chestX: 8, headX: -12, hipDrop: 0.46 }

function flurry(): CombatMove {
  const poses: Array<[number, Pose]> = [[0.04, { 'w.slide': LONG }], [0.1, swing({ turn: 0, phi: -78, drop: 26, reach: 2.1, aim: -18, elev: -4 })], [0.22, { ...spear([-1.45, 0.4, -0.25], 0, 0, LONG), ...turned(12), ...palm(115, 15, 0.92, 10), ...LEAN }]]
  FLURRY_AIMS.forEach((aim, i) => {
    const home = FLURRY_HOME[i]
    // the point home along its aim, the shoulders turned a little after it; drawn back between, the elbow bent
    poses.push([home, swing({ turn: 22 + aim * 0.3, lean: 30, phi: aim, drop: 38 + 3 * (i % 3), aim, elev: -7 })])
    const next = FLURRY_AIMS[i + 1] ?? 0
    const mid = (aim + next) / 2
    poses.push([home + FLURRY_BEAT / 2, swing({ turn: 14 + mid * 0.24, lean: 30, phi: mid, drop: 55, reach: 1.75, aim: mid, elev: -2 })])
  })
  poses.push([1.42, { ...spear([-1.55, -0.1, -0.1], -4, 2, LONG), ...turned(-14), ...palm(20, 0, 0.9, 30), hipPitch: 8, spineX: 2, chestX: 2, headX: -4, hipDrop: 0.4 }])
  poses.push([FLURRY_LAST, { ...swing({ turn: 54, lean: 34, phi: 2, drop: 36, aim: 2, elev: -8 }), ...palm(130, -20, 0.95, 10), hipPitch: 16, spineX: 8, chestX: 10, headX: -12, hipDrop: 0.5, hipX: 0.14 }])
  poses.push([1.72, { ...swing({ turn: 46, lean: 28, phi: 4, drop: 32, aim: 4, elev: 0 }), hipPitch: 13, spineX: 6, chestX: 8 }])
  poses.push([1.95, { ...SIDE(), spineX: 0, chestX: 0, headX: 0 }])
  const cues: MoveCue[] = [
    { t: 0.02, cue: 'weapon-in', value: 0.18 },
    { t: 0.04, cue: 'servo', value: 0.4 },
    { t: 0.1, cue: 'eyes', value: 1 },
    { t: 0.22, cue: 'punch', value: 5 },
  ]
  FLURRY_HOME.forEach((home, i) => {
    cues.push({ t: home - POKE_PEAK * 0.6, cue: 'poke', value: 0.55 + 0.1 * (i % 3) })
    cues.push({ t: home - 0.012, cue: 'lance', value: 0.6 + 0.4 * (i % 2) })
  })
  cues.push(
    { t: 1.44, cue: 'eyes', value: 0 },
    { t: FLURRY_LAST - POKE_PEAK, cue: 'poke', value: 1.2 },
    { t: FLURRY_LAST - 0.012, cue: 'lance', value: 1.6 },
    { t: FLURRY_LAST, cue: 'kick', value: 0.4 },
    { t: FLURRY_LAST, cue: 'shake', value: 0.2 },
  )
  return {
    name: 'flurry',
    strike: FLURRY_HOME[0],
    duration: 2.0,
    chain: [1.72, 2.15],
    cancelAt: 1.74,
    recovery: RELEASE,
    keys: keyed(poses, {
      ...WIELD,
      'R.heel': [[0.2, 16], [1.42, 16], [FLURRY_LAST, 28], [1.9, 6]],
      advance: [[0.22, 0.35], [1.42, 0.4], [FLURRY_LAST, 1.05], [1.9, 1.15]],
    }),
    steps: [
      // a long bow stance, the lead foot well forward
      { side: 'L', t0: 0.04, t1: 0.22, to: [1.0, 1.35], yaw: 12, lift: 0.22 },
      { side: 'R', t0: 0.12, t1: 0.28, to: [-1.0, -0.25], yaw: -16, lift: 0.16 },
      // the last thrust's lunge
      { side: 'L', t0: 1.44, t1: 1.58, to: [0.95, 2.1], yaw: 6, lift: 0.2 },
      { side: 'R', t0: 1.74, t1: 1.92, to: [-0.86, 1.05], yaw: -4, lift: 0.14 },
    ],
    cues: cues.sort((a, b) => a.t - b.t),
  }
}

/** The vortex the finisher's spin draws: its centre ahead of the standing point, its reach and draw (m, m/s). */
export const VORTEX = { ahead: 3.6, radius: 17, speed: 8 } as const
/** The finisher's times: the spin, the great sweep's blow (s). */
export const MAELSTROM = { spin: [0.3, 1.42] as const, strike: 1.85 } as const
/** The spin's rate, rising (turns a second); where the point starts it; the fist over the right shoulder, clear above the head, the fins and the wheel. */
const SPIN_RATE: readonly [number, number] = [1.6, 4.2]
const SPIN_FROM = -40
const OVERHEAD: V3 = [-1.0, 0.25, 3.35]

/**
 * 4. The maelstrom: the spear goes up at the right side, nearly upright, and
 * over the head it tips level and starts to turn on the long lever, the hand
 * sliding in to its middle as it speeds up; it spins flat overhead, faster and
 * faster (clockwise seen from above), the sand and everything round drawn in
 * toward the front. On its last turn it comes forward over the head and down
 * across the front to the left, run out through the hand to its butt; the
 * body winds onto the left foot and unwinds behind one broad backhand sweep
 * across the front, low, and opens wide to the right, the spear rising out
 * behind it, held a beat. The spear swings on round the outside of the right
 * side into a low closing stance. The spin's turns stay in the yaw until the
 * spear has gone.
 */
function maelstrom(): CombatMove {
  const [s0, s1] = MAELSTROM.spin
  const strike = MAELSTROM.strike
  const poses: Array<[number, Pose]> = [
    // up out of the flurry's last thrust: the point rises ahead of the arm to stand nearly upright at the right shoulder
    [0.04, { 'w.slide': LONG }],
    [0.07, swing({ turn: 0, phi: -20, drop: 10, aim: -8, elev: 45 })],
    [0.14, { ...swing({ turn: -8, phi: -12, drop: -25, reach: 2.1, aim: -8, elev: 72 }), ...palm(40, -10, 0.85, 20), hipDrop: 0.2 }],
    [0.24, { ...spear([OVERHEAD[0], OVERHEAD[1] + 0.1, OVERHEAD[2] - 0.1], SPIN_FROM + 25, 12, LONG), ...turned(-4) }],
  ]
  // the spin: the aim runs down (clockwise) at a rate rising from SPIN_RATE[0] to [1] turns a second
  const aimAt = (t: number): number => {
    const u = Math.min(1, Math.max(0, (t - s0) / (s1 - s0)))
    return SPIN_FROM - 360 * (s1 - s0) * (SPIN_RATE[0] * u + (SPIN_RATE[1] - SPIN_RATE[0]) * u * u / 2)
  }
  const spun = aimAt(s1)
  for (let i = 0; i <= 16; i++) {
    const t = s0 + (s1 - s0) * i / 16
    // drawn in to the middle over the first turns; the body sways round under it, the palm out to the side
    const sway = Math.sin(i * 0.9)
    const slide = LONG + (MIDDLE - LONG) * Math.min(1, i / 6)
    poses.push([t, { ...spear([OVERHEAD[0] + 0.06 * sway, OVERHEAD[1] + 0.06 * Math.cos(i * 0.9), OVERHEAD[2]], aimAt(t), 0, slide), hipX: 0.06 * sway, spineY: 3 * sway, chestZ: -6 + 5 * sway, headZ: 6 - 4 * sway, hipYaw: 0, spineZ: 0 }])
  }
  // still turning, down on its last turn: forward over the head, then down across the front to the left
  // once the point has come round behind to the left, wound there; then swept back through to the right
  const wound = 112 + 360 * Math.floor((spun - 200 - 112) / 360)
  const w = wound - 112
  poses.push(
    [1.56, { ...swing({ turn: 20, phi: 10, drop: -52, reach: 2.2, aim: wound + 60, elev: 10, slide: 0 }), ...palm(60, 0, 0.9, 20), hipDrop: 0.3 }],
    [1.66, { ...swing({ turn: 50, phi: 50, drop: 5, aim: wound + 25, elev: 6, slide: -1.2, head: 0.5 }), hipDrop: 0.38, hipX: 0.1 }],
    [1.74, { ...swing({ turn: 70, phi: 76, drop: 40, aim: wound, elev: -4, head: 0.45 }), ...palm(115, -10, 0.9, 20), hipDrop: 0.44, hipX: 0.16, hipPitch: 3 }],
    // the coil tightens a moment, then the arc from here to the open finish goes in 0.14 s
    [1.79, { ...swing({ turn: 76, phi: 80, drop: 42, aim: wound + 6, elev: -4, head: 0.45 }), hipDrop: 0.48, hipX: 0.18 }],
    [1.82, { ...swing({ turn: 10, lean: 6, phi: 40, drop: 44, aim: w + 66, elev: -10 }), hipDrop: 0.54, hipX: 0.04 }],
    [strike, { ...swing({ turn: -50, lean: 14, phi: -8, drop: 44, aim: w + 4, elev: -12 }), ...palm(20, 0, 0.92, 30), hipDrop: 0.62, hipPitch: 12, chestX: 8, hipX: -0.1 }],
    [1.88, { ...swing({ turn: -80, lean: 12, phi: -55, drop: 40, aim: w - 70, elev: -10 }), hipX: -0.16 }],
    // opened wide to the right, low, the spear rising out behind it, the palm pushed out to the left: held a beat
    [1.93, { ...swing({ turn: -96, lean: 8, phi: -95, drop: 25, aim: w - 122, elev: 14 }), ...palm(-15, 8, 0.95, 30), hipPitch: 8, chestX: 4, hipX: -0.2, hipDrop: 0.62 }],
    [2.34, { ...swing({ turn: -92, lean: 7, phi: -97, drop: 24, aim: w - 126, elev: 16 }), hipPitch: 7, chestX: 3, hipDrop: 0.6 }],
    // the spear swung on round the outside of the right side, the point coming forward, into a low closing stance
    [2.52, { ...swing({ turn: -30, phi: -95, drop: 30, reach: 2.1, aim: w - 55, elev: -6, slide: -1.2 }), ...palm(10, 0, 0.9, 26), hipX: -0.06 }],
    [2.68, { ...spear(SIDE_AT, w - 3, -13, -1.0), ...turned(-14), ...palm(-4, -4, 0.92, 28), hipDrop: 0.5, hipPitch: 4, hipX: 0 }],
    [2.95, { ...spear(SIDE_AT, w - 3, -12, -1.0), ...turned(-12), ...palm(-6, -8, 0.9, 26), hipDrop: 0.44, hipPitch: 3 }],
    // standing out of it (the spear gone): the body back toward the stance's
    [3.35, { hipDrop: 0.18, hipPitch: 1, ...turned(-6) }],
  )
  const k = keyed(poses, {
    'w.wield': [[0.05, 1], [2.98, 1], [3.12, 0]],
    'R.grip': [[0.08, 1], [3.05, 1], [3.25, 0.6]],
    'R.heel': [[1.79, 0], [strike, 16], [2.5, 10], [2.9, 0]],
    'L.heel': [[1.74, 10], [1.8, 0]],
    advance: [[0.2, 0.04], [s1, 0.08], [1.79, 0.2], [strike, 0.85], [2.05, 1.2], [2.7, 1.3]],
  })
  // once nothing holds the spear (it moves nothing then): the turns taken off the yaw, the hand back at the grip band
  const rest = spear(SIDE_AT, -3, -16)
  k['w.yaw']!.push([3.14, -(w - 3)], [3.22, rest['w.yaw']!])
  k['w.slide']!.push([3.22, 0])
  const cues: MoveCue[] = [
    { t: 0.02, cue: 'weapon-in', value: 0.2 },
    { t: 0.04, cue: 'servo', value: 0.45 },
    { t: s0 - 0.06, cue: 'vortex', value: 1 },
    { t: s0, cue: 'eyes', value: 0.8 },
    { t: s0, cue: 'pull', value: 2.6 },
    { t: s1 + 0.1, cue: 'vortex', value: 0 },
    { t: 1.6, cue: 'servo', value: 0.4 },
    // the jet on its back drives the step behind the sweep, blasting the sand behind it
    { t: 1.76, cue: 'burn', value: 1 },
    { t: 1.98, cue: 'burn', value: 0 },
    { t: strike - SLASH_PEAK, cue: 'slash', value: 1.4 },
    { t: strike, cue: 'crescent', value: 1.25 },
    { t: strike, cue: 'stop', value: 0.11 },
    { t: strike + 0.02, cue: 'punch', value: 9 },
    { t: strike + 0.02, cue: 'shake', value: 0.3 },
    { t: 2.44, cue: 'slash', value: 0.6 },
    { t: 2.5, cue: 'eyes', value: 0 },
    { t: 2.64, cue: 'pull', value: 0 },
    { t: 2.66, cue: 'servo', value: 0.35 },
    { t: 2.96, cue: 'weapon-out', value: 0.3 },
  ]
  // a whoosh each turn of the spin, faster and louder as it speeds up
  for (let turn = 1; SPIN_FROM - 360 * turn >= spun; turn++) {
    let t = s0
    while (aimAt(t) > SPIN_FROM - 360 * turn) t += 0.005
    cues.push({ t: t - SLASH_PEAK * 0.5, cue: 'slash', value: 0.55 + 0.12 * turn })
  }
  return {
    name: 'maelstrom',
    strike,
    duration: 3.4,
    chain: [3.24, 3.45],
    cancelAt: 3.24,
    keys: k,
    steps: [
      { side: 'R', t0: 0.04, t1: 0.24, to: [-1.05, -0.2], yaw: -10, lift: 0.2 },
      { side: 'L', t0: 0.1, t1: 0.3, to: [1.0, 0.1], yaw: 10, lift: 0.18 },
      // wound onto the left foot, it steps in across the front, then the right steps out wide as the body opens, long and low
      { side: 'L', t0: 1.72, t1: 1.85, to: [0.8, 1.35], yaw: -18, lift: 0.24 },
      { side: 'R', t0: 1.87, t1: 2.02, to: [-1.3, 0.55], yaw: -32, lift: 0.18 },
      // gathered in under the body before the hand-back
      { side: 'R', t0: 2.98, t1: 3.16, to: [-0.86, 1.1], yaw: 0, lift: 0.14 },
      { side: 'L', t0: 3.12, t1: 3.3, to: [0.86, 1.35], yaw: 0, lift: 0.14 },
    ],
    cues: cues.sort((a, b) => a.t - b.t),
  }
}

export const BAT_MOVES: Moveset = {
  moves: [THRUST, SWEEP, flurry(), maelstrom()],
  recover: 1.0,
  recoverCues: [{ t: 0.0, cue: 'weapon-out', value: 0.4 }],
}

/**
 * The guard (held with the right mouse button): the spear formed and held
 * level across the front in both hands, the head out to the left, knees bent
 * and weight low; blows come onto the shaft. It is held low and well out,
 * under the breastplate's reach (a metre ahead of the pelvis at chest height).
 * The shield forms round it (fighter.ts); the pose holds for as long as the
 * guard does.
 */
export const BAT_GUARD: CombatMove = {
  name: 'guard',
  duration: 1e6,
  chain: [1e6, 1e6],
  keys: keyed([[0.18, { ...spear([-0.8, 1.1, 0.5], 90, 0, -0.8), hipDrop: 0.3, hipPitch: 6, spineX: 3, chestX: 5, headX: 6 }]], {
    'w.wield': [[0.14, 1]],
    'w.two': [[0.12, 0], [0.22, 1]],
    'R.grip': [[0.08, 1]],
    'L.grip': [[0.1, 1]],
  }),
  cues: [{ t: 0.0, cue: 'weapon-in', value: 0.2 }, { t: 0.02, cue: 'servo', value: 0.25 }],
}
