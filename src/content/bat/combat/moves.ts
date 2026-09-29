import type { Key } from '../../transformer/combat/curves'
import type { CombatMove, MoveCue, Moveset } from '../../transformer/combat/moves'
import type { Channel } from '../../transformer/combat/pose'
import { POKE_PEAK, SLASH_PEAK } from './audio/spear-models'

/**
 * The Bat's combo: all spear. A lunging thrust, a sweep across the front, a
 * flurry of thrusts too fast to follow fanned over the whole front half, and
 * the spear spun overhead into a vortex that draws everything in, then one
 * huge sweep and a held finish. Distances in metres (hips 2.76 m up, arms
 * 1.9 m), angles in degrees; see pose.ts for the channels.
 *
 * The spear is held as a spearman holds one (`hold`): the right hand ahead of
 * the right hip, the left a metre up the shaft, the head forward and 30
 * degrees across to the left, the torso turned 40 degrees right behind it so
 * the left shoulder is forward. The robot's shoulders stand 2.36 m apart
 * against 1.9 m arms, and a square hold leaves the left hand short of the
 * shaft; and the butt runs 1.3 m behind the right hand, so a shaft pivoted
 * about the hand drives the butt through the chest. Held this way the butt
 * passes outside the right hip, and a sweep is the whole hold turned with the
 * body (hips, spine and chest), as a spearman sweeps: it stays clear from 45
 * degrees right to 55 left of the stance.
 *
 * Feet start in the stance: left [0.86, 0], right [-0.86, 0] in the move's
 * ground frame.
 */

type Pose = Partial<Record<Channel, number>>
type Keys = Partial<Record<Channel, Key[]>>

/** The hold's right hand relative to the pelvis at rest (m: x left, forward, up), and the shaft's angle across to the left. */
const HAND: readonly [number, number, number] = [-0.5, 0.32, 0.5]
const ACROSS = 30
/** The right shoulder's rest place relative to the pelvis (m) and the arm's length: the weapon channels' origin and unit. */
const SHOULDER: readonly [number, number, number] = [-1.18, 0, 1.64]
const ARM = 1.9
/** The torso's turn in the hold, and how a turn is shared between hips, spine and chest (and held off by the head). */
const TWIST = { hipYaw: -12, spineZ: -8, chestZ: -20, headZ: 30 }
const SHARE = { hipYaw: 0.35, spineZ: 0.25, chestZ: 0.4, headZ: -0.3 }
const rad = (deg: number): number => deg * Math.PI / 180

/**
 * The hold turned `turn` degrees about the pelvis (+ left), the hands driven
 * `drive` m along the shaft (back if negative) and lowered `drop` m (the hips
 * sink with them), the head pitched to `pitch` (90 level, more is point down),
 * the shaft's yaw carried round `wind` whole turns (a spin's).
 */
export function hold(turn: number, drive = 0, drop = 0, pitch = 97, wind = 0): Pose {
  const a = rad(turn)
  const yaw = -ACROSS - turn - 360 * wind
  const x = HAND[0] * Math.cos(a) + HAND[1] * Math.sin(a) - Math.sin(rad(yaw)) * drive
  const y = -HAND[0] * Math.sin(a) + HAND[1] * Math.cos(a) + Math.cos(rad(yaw)) * drive
  const z = HAND[2] - drop
  return {
    'w.x': -(x - SHOULDER[0]) / ARM, 'w.y': y / ARM, 'w.z': (z - SHOULDER[2]) / ARM,
    'w.yaw': yaw, 'w.pitch': pitch, 'w.roll': 90,
    hipYaw: TWIST.hipYaw + SHARE.hipYaw * turn, spineZ: TWIST.spineZ + SHARE.spineZ * turn,
    chestZ: TWIST.chestZ + SHARE.chestZ * turn, headZ: TWIST.headZ + SHARE.headZ * turn,
    hipDrop: 0.18 + drop * 0.6,
  }
}

/** Keys from poses at times; later poses add to the channels they name. */
function keyed(list: ReadonlyArray<readonly [number, Pose]>, into: Keys = {}): Keys {
  for (const [t, pose] of list) for (const [c, v] of Object.entries(pose)) (into[c as Channel] ??= []).push([t, v as number])
  for (const keys of Object.values(into)) {
    keys!.sort((a, b) => a[0] - b[0])
    for (let i = keys!.length - 1; i > 0; i--) if (keys![i][0] - keys![i - 1][0] < 1e-3) keys!.splice(i - 1, 1)
  }
  return into
}

/** The hands: both on the shaft once the spear has formed; the off hand a fist out of the way before. */
function twoHands(): Keys {
  return {
    'w.wield': [[0.14, 1]],
    'w.two': [[0.12, 0], [0.22, 1]],
    'R.grip': [[0.08, 1]],
    'L.az': [[0.12, -20]],
    'L.el': [[0.12, -24]],
    'L.reach': [[0.12, 0.6]],
    'L.elbow': [[0.12, 20]],
    'L.grip': [[0.1, 1]],
  }
}

/**
 * Letting the spear go (a move's `recovery`, overlaid on the settle): the left hand lets go, the
 * right carries the spear out to the right side as it dissolves, and only then drops to the stance's
 * hang; settling straight from the hold swept the fist across the chest.
 */
const RELEASE: CombatMove['recovery'] = {
  'w.x': [[0.3, -0.1]],
  'w.y': [[0.3, 0.26]],
  'w.z': [[0.3, -0.7]],
  'w.yaw': [[0.3, -50]],
  'w.pitch': [[0.3, 100]],
  'w.wield': [[0.3, 1], [0.56, 0]],
}

/** 1. The thrust: the spear forms in both hands at the hip, the hips load back, the left foot steps in and the spear goes home. */
const THRUST: CombatMove = {
  name: 'thrust',
  strike: 0.36,
  duration: 0.95,
  chain: [0.46, 1.0],
  cancelAt: 0.48,
  recovery: RELEASE,
  keys: keyed([
    [0.14, hold(-8, 0.05, 0.02)],
    [0.24, { ...hold(-18, -0.1, 0.06), hipPitch: -2, chestX: 0 }],
    [0.36, { ...hold(4, 0.8, 0.26), hipPitch: 9, chestX: 7, headX: 4 }],
    [0.62, { ...hold(0, 0.4, 0.12), hipPitch: 4, chestX: 4 }],
    [0.9, hold(0, 0.12, 0.02)],
  ], {
    ...twoHands(),
    hipX: [[0.18, -0.06], [0.36, 0.1], [0.7, 0.04]],
    'R.heel': [[0.22, 0], [0.38, 22], [0.7, 10]],
    advance: [[0.14, 0.05], [0.36, 0.9], [0.7, 1.05]],
  }),
  steps: [
    { side: 'L', t0: 0.08, t1: 0.3, to: [0.82, 1.15], yaw: 8, lift: 0.26 },
    { side: 'R', t0: 0.5, t1: 0.7, to: [-0.86, 0.72], yaw: -10, lift: 0.16 },
  ],
  cues: [
    { t: 0.02, cue: 'weapon-in', value: 0.2 },
    { t: 0.04, cue: 'servo', value: 0.35 },
    { t: 0.36 - POKE_PEAK, cue: 'poke', value: 1 },
    { t: 0.36, cue: 'kick', value: 0.24 },
  ],
}

/**
 * 2. The sweep: the body winds right with the spear, then hips, spine and
 * chest unwind and carry the whole hold round to the left, the head passing
 * flat across the front at a soldier's head height, a step in behind it.
 */
const SWEEP: CombatMove = {
  name: 'sweep',
  strike: 0.46,
  duration: 1.1,
  chain: [0.6, 1.2],
  cancelAt: 0.62,
  recovery: RELEASE,
  keys: keyed([
    [0.12, hold(-4, 0.1, 0.02)],
    [0.28, { ...hold(-44, 0.05, 0.06, 98), hipPitch: 2 }],
    [0.38, hold(-16, 0.3, 0.12, 100)],
    [0.46, { ...hold(18, 0.45, 0.14, 101), hipPitch: 7, chestX: 6 }],
    [0.56, hold(48, 0.35, 0.12, 101)],
    [0.72, { ...hold(40, 0.3, 0.08), hipPitch: 4, chestX: 3 }],
    [1.02, hold(0, 0.2, 0.02)],
  ], {
    ...twoHands(),
    hipX: [[0.26, -0.12], [0.46, 0.08], [0.8, 0.02]],
    'L.heel': [[0.3, 0], [0.48, 14], [0.8, 4]],
    advance: [[0.26, 0.1], [0.5, 0.82], [0.8, 1.0]],
  }),
  steps: [
    { side: 'L', t0: 0.26, t1: 0.44, to: [0.9, 0.95], yaw: 14, lift: 0.22 },
    { side: 'R', t0: 0.62, t1: 0.84, to: [-0.86, 0.6], yaw: 6, lift: 0.14 },
  ],
  cues: [
    { t: 0.03, cue: 'servo', value: 0.4 },
    { t: 0.46 - SLASH_PEAK, cue: 'slash', value: 1 },
    { t: 0.46, cue: 'kick', value: 0.3 },
    { t: 0.47, cue: 'shake', value: 0.12 },
  ],
}

/**
 * 3. The flurry: braced wide, the thrusts come too fast to follow, zig-zagging
 * across the front (the aims: where the point goes, degrees + left of the
 * heading), a breath, then the last, heaviest thrust straight ahead.
 */
const FLURRY_START = 0.36
const FLURRY_BEAT = 0.095
const FLURRY_AIMS = [0, 20, 40, 58, 36, 14, -8, -20, 4, 26, 48, 18]
export const FLURRY_HOME = FLURRY_AIMS.map((_, i) => FLURRY_START + i * FLURRY_BEAT + 0.045)
export const FLURRY_LAST = 1.62

function flurry(): CombatMove {
  const poses: Array<[number, Pose]> = [[0.26, { ...hold(-14, 0.12, 0.24), hipPitch: 6, chestX: 4, headX: 6 }]]
  FLURRY_AIMS.forEach((aim, i) => {
    const home = FLURRY_HOME[i]
    // the point home along its aim; drawn back between, the body turning toward the next
    poses.push([home, { ...hold(aim - ACROSS * 0.5, 0.62, 0.24, 99), hipPitch: 7, chestX: 6 }])
    const next = FLURRY_AIMS[i + 1] ?? 0
    poses.push([home + FLURRY_BEAT * 0.5, { ...hold((aim + next) / 2 - ACROSS * 0.5, 0.08, 0.2, 98), hipPitch: 6, chestX: 5 }])
  })
  poses.push([1.5, { ...hold(-16, 0.04, 0.18), hipPitch: 5, chestX: 3 }])
  poses.push([FLURRY_LAST, { ...hold(4, 0.85, 0.32, 97), hipPitch: 11, chestX: 8 }])
  poses.push([1.95, { ...hold(0, 0.12, 0.04), hipPitch: 3, chestX: 2 }])
  const cues: MoveCue[] = [
    { t: 0.02, cue: 'weapon-in', value: 0.2 },
    { t: 0.04, cue: 'servo', value: 0.4 },
    { t: 0.1, cue: 'eyes', value: 1 },
    { t: 0.26, cue: 'punch', value: 5 },
  ]
  FLURRY_HOME.forEach((home, i) => {
    cues.push({ t: home - POKE_PEAK * 0.6, cue: 'poke', value: 0.55 + 0.1 * (i % 3) })
    cues.push({ t: home - 0.01, cue: 'lance', value: 0.6 + 0.4 * (i % 2) })
  })
  cues.push(
    { t: 1.46, cue: 'eyes', value: 0 },
    { t: FLURRY_LAST - POKE_PEAK, cue: 'poke', value: 1.2 },
    { t: FLURRY_LAST - 0.01, cue: 'lance', value: 1.4 },
    { t: FLURRY_LAST, cue: 'kick', value: 0.4 },
    { t: FLURRY_LAST, cue: 'shake', value: 0.2 },
  )
  return {
    name: 'flurry',
    strike: FLURRY_HOME[0],
    duration: 2.05,
    chain: [1.72, 2.15],
    cancelAt: 1.74,
    recovery: RELEASE,
    keys: keyed(poses, {
      ...twoHands(),
      headX: [[0.26, 6], [1.9, 2]],
      'R.heel': [[0.24, 16], [1.5, 16], [FLURRY_LAST, 26], [1.95, 8]],
      advance: [[0.26, 0.2], [1.5, 0.4], [FLURRY_LAST, 0.95], [1.95, 1.05]],
    }),
    steps: [
      // braced wide, the lead foot forward
      { side: 'L', t0: 0.06, t1: 0.26, to: [1.0, 0.95], yaw: 12, lift: 0.22 },
      { side: 'R', t0: 0.14, t1: 0.3, to: [-1.0, -0.1], yaw: -16, lift: 0.16 },
      // the last thrust's lunge
      { side: 'L', t0: 1.48, t1: 1.62, to: [0.9, 1.7], yaw: 6, lift: 0.2 },
      { side: 'R', t0: 1.74, t1: 1.94, to: [-0.86, 0.95], yaw: -4, lift: 0.14 },
    ],
    cues: cues.sort((a, b) => a.t - b.t),
  }
}

/** The vortex the finisher's spin draws: its centre ahead of the standing point, its reach and draw (m, m/s). */
export const VORTEX = { ahead: 3.6, radius: 17, speed: 8 } as const
/** The finisher's times: the spin, the spear brought down into the hold, the sweep home. */
export const MAELSTROM = { spin: [0.42, 1.5] as const, strike: 2.1 } as const

/** Overhead, one-handed: the hand straight up over the right shoulder, the shaft level, its yaw `yaw`. */
const overhead = (yaw: number, up = 0.86): Pose => ({ 'w.x': 0.02, 'w.y': 0.12, 'w.z': up, 'w.yaw': yaw, 'w.pitch': 90, 'w.roll': 90 })

/**
 * 4. The maelstrom: the spear goes up one-handed and spins flat overhead,
 * faster and faster, the sand and everything round drawn in toward the front;
 * it winds on round as it comes down into the hold wound far to the right,
 * the left hand takes it, and one huge sweep goes across the whole front, the
 * body driven round behind it into a low, wide finish. The spin's turns are
 * carried in the yaw (`wind`), and taken off only once the spear has gone
 * and the hand holds nothing.
 */
function maelstrom(): CombatMove {
  const [s0, s1] = MAELSTROM.spin
  const strike = MAELSTROM.strike
  // the spin: the yaw runs down continuously (counter-clockwise seen from above), accelerating
  const spin: Array<[number, Pose]> = [
    [0.3, { ...overhead(10, 0.72), headX: -12 }],
    [s0, { ...overhead(-30), headX: -16 }],
    [0.7, overhead(-150)],
    [0.95, overhead(-310)],
    [1.2, overhead(-490)],
    [s1, { ...overhead(-660, 0.84), headX: -16 }],
  ]
  // down into the hold wound right (its yaw two turns on), then the sweep carried round through the front
  const sweep: Array<[number, Pose]> = [
    [1.74, { ...hold(-36, 0.0, -0.1, 94, 2), hipPitch: 0, chestX: 0, headX: 0 }],
    [1.92, { ...hold(-46, 0.05, 0.1, 98, 2), hipPitch: 3 }],
    [2.0, hold(-24, 0.35, 0.3, 101, 2)],
    [strike, { ...hold(12, 0.55, 0.42, 103, 2), hipPitch: 12, chestX: 9 }],
    [2.2, hold(44, 0.45, 0.46, 103, 2)],
    [2.44, { ...hold(54, 0.3, 0.52, 101, 2), hipPitch: 15, chestX: 11 }],
    [2.8, { ...hold(46, 0.25, 0.4, 100, 2), hipPitch: 11, chestX: 8 }],
    // standing out of the finish, the body turns back toward the hold's (a next combo takes the spear up from there)
    [3.4, { hipPitch: 3, chestX: 2, hipYaw: -10, spineZ: -6, chestZ: -16, headZ: 22 }],
  ]
  const k = keyed([...spin, ...sweep], {
    'w.wield': [[0.05, 1], [2.96, 1], [3.08, 0]],
    'w.two': [[0.1, 0], [1.74, 0], [1.9, 1], [2.9, 1], [3.02, 0]],
    'R.grip': [[0.08, 1], [3.0, 1], [3.2, 0.6]],
    // the free arm out for balance under the spin, then onto the shaft for the sweep
    'L.az': [[0.3, 20], [s1, 30], [1.74, -10]],
    'L.el': [[0.3, -20], [s1, -18], [1.74, -24]],
    'L.reach': [[0.3, 0.8], [s1, 0.82], [1.74, 0.62]],
    'L.elbow': [[0.3, 24]],
    'L.grip': [[0.1, 1]],
    // upright under the spin, the chest tipped a little to lift the arm; low and driven round through the sweep
    hipDrop: [[0.3, 0.1], [s1, 0.14]],
    chestY: [[0.3, 4], [s1, 6], [1.74, 0]],
    'L.heel': [[1.9, 0], [2.2, 20], [2.9, 16], [3.3, 4]],
    'R.heel': [[1.9, 14], [2.02, 0]],
    advance: [[0.3, 0.04], [s1, 0.06], [1.9, 0.2], [strike, 0.9], [2.44, 1.3], [2.8, 1.35]],
  })
  // once nothing holds the spear (it moves nothing then): the turns taken off the yaw and the hold
  // brought back to the stance's, where the next combo's first move takes the spear up again
  const home = hold(0, 0.2, 0.02)
  k['w.yaw']!.push([3.1, -30 - 46 - 720], [3.2, home['w.yaw']!])
  for (const c of ['w.x', 'w.y', 'w.z', 'w.pitch'] as const) k[c]!.push([3.2, home[c]!])
  const cues: MoveCue[] = [
    { t: 0.02, cue: 'weapon-in', value: 0.25 },
    { t: 0.04, cue: 'servo', value: 0.45 },
    { t: s0 - 0.06, cue: 'vortex', value: 1 },
    { t: s0, cue: 'eyes', value: 0.8 },
    { t: s0, cue: 'pull', value: 2.6 },
    { t: 0.62, cue: 'slash', value: 0.7 },
    { t: 0.9, cue: 'slash', value: 0.85 },
    { t: 1.14, cue: 'slash', value: 1 },
    { t: 1.36, cue: 'slash', value: 1.1 },
    { t: s1 + 0.1, cue: 'vortex', value: 0 },
    { t: 1.7, cue: 'servo', value: 0.4 },
    // the jet on its back drives the lunge behind the sweep, blasting the sand behind it
    { t: 1.9, cue: 'burn', value: 0.9 },
    { t: 2.26, cue: 'burn', value: 0 },
    { t: strike - SLASH_PEAK, cue: 'slash', value: 1.4 },
    { t: strike, cue: 'crescent', value: 1 },
    { t: strike, cue: 'stop', value: 0.08 },
    { t: strike + 0.02, cue: 'punch', value: 7 },
    { t: 2.5, cue: 'eyes', value: 0 },
    { t: 2.6, cue: 'servo', value: 0.35 },
    { t: 2.64, cue: 'pull', value: 0 },
    { t: 2.66, cue: 'weapon-out', value: 0.3 },
  ]
  return {
    name: 'maelstrom',
    strike,
    duration: 3.45,
    chain: [3.22, 3.45],
    cancelAt: 3.22,
    keys: k,
    steps: [
      { side: 'R', t0: 0.04, t1: 0.26, to: [-0.94, -0.3], yaw: -8, lift: 0.2 },
      // wound onto the right foot, then the left steps across as the sweep goes through, wide and low
      { side: 'L', t0: 1.84, t1: 2.04, to: [1.1, 1.3], yaw: 24, lift: 0.24 },
      { side: 'R', t0: 2.16, t1: 2.44, to: [-1.0, 0.5], yaw: 20, lift: 0.16 },
      // gathered in under the body before the hand-back
      { side: 'R', t0: 2.9, t1: 3.1, to: [-0.86, 1.1], yaw: 0, lift: 0.16 },
      { side: 'L', t0: 3.1, t1: 3.3, to: [0.86, 1.4], yaw: 0, lift: 0.14 },
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
 * level across the chest in both hands, the head out to the left, knees bent
 * and weight low; blows come onto the shaft. The shield forms round it
 * (fighter.ts); the pose holds for as long as the guard does.
 */
export const BAT_GUARD: CombatMove = {
  name: 'guard',
  duration: 1e6,
  chain: [1e6, 1e6],
  keys: keyed([[0.18, { 'w.x': -0.34, 'w.y': 0.36, 'w.z': -0.32, 'w.yaw': -90, 'w.pitch': 90, 'w.roll': 0, hipDrop: 0.3, hipPitch: 6, spineX: 3, chestX: 5, headX: 6 }]], {
    ...twoHands(),
    'L.el': [[0.12, 0]],
  }),
  cues: [{ t: 0.0, cue: 'weapon-in', value: 0.2 }, { t: 0.02, cue: 'servo', value: 0.25 }],
}
