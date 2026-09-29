import type { Key } from '../../transformer/combat/curves'
import type { Channel } from '../../transformer/combat/pose'
import type { MoveCue } from '../../transformer/combat/moves'
import type { SpecialMove } from '../../transformer/combat/special'

/**
 * Descent: the Bat's special. It crouches as the spear forms, the eyes
 * blazing; springs up and throws a backflip, and comes out of it face down,
 * level, as the afterburner on its back lights. The jet drives it round a
 * ring ten metres across, low over the sand, twice, the spear held out to its
 * right toward the ring's centre and cutting through everything there, and
 * the air goes round with it: a vortex drawing the whole crowd in to the
 * centre. Then the jet bursts to full and it pulls up, standing on the flame,
 * and climbs over the centre; at the top, hung in slow motion, it somersaults
 * forward and drops, feet first, the spear held point down beneath it in both
 * hands, and drives it into the ground where the vortex drew them all. The
 * sand goes up in a crater of glass. It rises, pulls the spear out and lets it
 * go.
 *
 * Special time (s): gather 0-0.62, jump and flip 0.62-1.52, the ring
 * 1.52-4.86 (two laps, clockwise seen from above: the centre on its right),
 * the burst and climb 4.86-6.25, the apex and somersault 6.25-7.0 (slow
 * motion), the drop to the plunge at 7.62, the kneel and rise, handback 9.2.
 *
 * Ring geometry, in the special's ground frame ([lateral + left, forward]):
 * the centre CENTER ahead, radius RADIUS, so the robot starts on the ring's
 * near edge; at angle phi (clockwise from there) it stands at
 * [RADIUS sin phi, CENTER - RADIUS cos phi], heading 90 - phi degrees.
 *
 * The body's pitch runs one way: -280 degrees through the backflip (face
 * down), back to -360 as it pulls up (upright on the jet), and forward
 * through a whole somersault to 0 at the apex, so the channel ends where it
 * began and nothing unwinds.
 */
const CENTER = 6.4
const RADIUS = 6.4
const TAKEOFF = 0.62
const FLIP: [number, number] = [0.72, 1.46]
const RING: [number, number] = [1.52, 4.86]
const LAPS = 2
const CLIMB_TOP = 6.25
const SOMERSAULT: [number, number] = [6.36, 6.98]
const PLUNGE = 7.62
/** Flight height (m, the lowest foot) round the ring, the apex of the climb. */
const CRUISE = 3.1
const APEX = 24

type Point = readonly [number, number]
const rad = (deg: number): number => deg * Math.PI / 180
const ring = (phi: number): Point => [RADIUS * Math.sin(rad(phi)), CENTER - RADIUS * Math.cos(rad(phi))]

/** The ring's angle over its window: a short build-up as the jet takes hold, then steady. */
function phiAt(t: number): number {
  const u = (t - RING[0]) / (RING[1] - RING[0])
  const a = 0.14
  const total = 360 * LAPS
  // constant acceleration over the first share `a`, then constant speed: continuous speed at the join
  const v = total / (1 - a / 2)
  return u < a ? v * u * u / (2 * a) : v * (u - a / 2)
}

/** When the ring's sweeps cut (a window per quarter lap): the spear through whatever the vortex holds. */
const CUTS: Array<[number, number]> = []
for (let k = 0; k < LAPS * 4; k++) {
  const t0 = RING[0] + (RING[1] - RING[0]) * (0.1 + 0.9 * k / (LAPS * 4))
  CUTS.push([t0, t0 + (RING[1] - RING[0]) * 0.9 / (LAPS * 4) - 0.02])
}

/** Weapon frame: [x, y, z, yaw, pitch, roll]. */
type Grip = readonly [number, number, number, number, number, number]
/** Free-leg pose per side: [lx, ly, lz, lp]. */
type Leg = readonly [number, number, number, number]

/** Low and ready at the right hip, the head forward. */
const LOW: Grip = [-0.18, 0.1, -0.74, -24, 104, 90]
/** Face down in flight: the shoulders ahead of and below their rest place; the spear out to the right toward the centre, its point down toward the sand. */
const OUT: Grip = [0.62, 0.9, -0.98, 92, 128 - 360, 0]
/** Point down under the body in both hands for the drop. */
const DOWN: Grip = [-0.3, 0.62, -0.3, 0, 180, 90]
const DRIVEN: Grip = [-0.3, 0.6, -0.66, 0, 180, 90]

/** A grip held in the torso's frame (m from the pelvis: x left, forward, up; the shaft's pitch in that frame). */
interface BodyGrip { x: number; f: number; u: number; pitch: number }
/** Through the backflip: out at the right side, the shaft along the body toward the feet and a little forward. */
const FLIP_GRIP: BodyGrip = { x: -1.35, f: 0.45, u: 0.6, pitch: 150 }
/** Through the somersault: at the right side, the shaft along the body toward the feet. */
const SOMERSAULT_GRIP: BodyGrip = { x: -1.3, f: 0.4, u: 0.7, pitch: 180 }
/** Coming out of the flip into the ring: the arm out to the right first, so the shaft turns out beside the body, not across it. */
const SIDE_GRIP: BodyGrip = { x: -2.3, f: 0.35, u: 0.8, pitch: 150 }

/**
 * The weapon channels (the heading's frame, which the body's pitch does not turn) that keep a grip
 * held in the torso's frame while the body is pitched `pitch` degrees (+ forward) about the pelvis:
 * the spear turns with the body through a flip instead of the body turning through it.
 */
function carried(pitch: number, g: BodyGrip): Grip {
  const a = rad(pitch)
  const f = g.f * Math.cos(a) + g.u * Math.sin(a)
  const u = -g.f * Math.sin(a) + g.u * Math.cos(a)
  return [-(g.x + 1.18) / 1.9, f / 1.9, (u - 1.64) / 1.9, 0, g.pitch + pitch, 90]
}

/** The legs trailing out behind the level body, a little apart, knees soft, feet extended. */
const TRAIL: Record<'L' | 'R', Leg> = { L: [-0.52, -1.88, 2.06, 150], R: [-0.4, -1.96, 1.98, 156] }
/** Upright on the flame: the legs hanging, one knee up. */
const HANG: Record<'L' | 'R', Leg> = { L: [-0.2, 0.25, 0.5, 30], R: [-0.3, -0.25, 0.1, 40] }
/** Coming down: the legs under the body, ready to take the ground. */
const DROP: Record<'L' | 'R', Leg> = { L: [0.05, 0.6, 0.35, 12], R: [0.0, -0.5, 0.2, 18] }

function keys(): Partial<Record<Channel, Key[]>> {
  const k: Partial<Record<Channel, Key[]>> = {}
  const put = (c: Channel, t: number, v: number): void => { (k[c] ??= []).push([t, v]) }
  const grip = (t: number, g: Grip): void => (['w.x', 'w.y', 'w.z', 'w.yaw', 'w.pitch', 'w.roll'] as const).forEach((c, i) => put(c, t, g[i]))
  const leg = (t: number, pose: Record<'L' | 'R', Leg>): void => {
    for (const side of ['L', 'R'] as const) {
      const [lx, ly, lz, lp] = pose[side]
      put(`${side}.lx`, t, lx)
      put(`${side}.ly`, t, ly)
      put(`${side}.lz`, t, lz)
      put(`${side}.lp`, t, lp)
    }
  }

  // ---- the gather: crouched low, spear at the hip, head up
  put('hipDrop', 0.3, 0.3)
  put('hipDrop', TAKEOFF - 0.06, 0.62)
  put('hipDrop', TAKEOFF + 0.08, 0.02)
  put('hipPitch', 0.3, 4)
  put('hipPitch', TAKEOFF - 0.06, 14)
  put('headX', 0.3, -14)
  put('headX', TAKEOFF - 0.06, -24)
  grip(0.3, LOW)
  grip(TAKEOFF, LOW)
  put('R.heel', TAKEOFF - 0.06, 0)
  put('R.heel', TAKEOFF + 0.02, 34)
  put('L.heel', TAKEOFF - 0.06, 0)
  put('L.heel', TAKEOFF + 0.02, 34)

  // ---- the jump and the backflip: the body turns back through 280 degrees and comes out face down,
  // tucked through the turn, its heading swinging left onto the ring's tangent
  const flip = (u: number): number => -280 * (u * u * (3 - 2 * u))
  // the pelvis flies a smooth arc; `air` is the lowest foot's height, so it follows from the legs at each key
  const arc: Array<[number, number]> = [[TAKEOFF, 2.1], [0.76, 4.3], [0.95, 6.9], [1.1, 7.7], [1.3, 6.8], [FLIP[1], 5.0], [RING[0] + 0.3, CRUISE + 0.3]]
  const pelvisAt = (t: number): number => {
    for (let i = 1; i < arc.length; i++) {
      if (t <= arc[i][0]) {
        const [t0, h0] = arc[i - 1], [t1, h1] = arc[i]
        const u = (t - t0) / (t1 - t0)
        return h0 + (h1 - h0) * u * u * (3 - 2 * u)
      }
    }
    return arc[arc.length - 1][1]
  }
  for (let i = 0; i <= 6; i++) {
    const u = i / 6
    const t = FLIP[0] + (FLIP[1] - FLIP[0]) * u
    const pitch = flip(u)
    put('hipPitch', t, pitch)
    // tucked: the feet drawn up under the hips, carried round with the turn about the hips
    const tuck = Math.sin(Math.PI * Math.min(1, u * 1.15))
    const reach = 1.25 + 1.0 * (1 - tuck)
    const a = rad(pitch)
    // a foot hanging `reach` below the hips, turned with the body (+pitch leans forward: the foot swings back)
    const ly = -reach * Math.sin(a)
    const lz = 2.3 - reach * Math.cos(a)
    const lp = 30 * tuck - pitch
    if (i > 0) put('air', t, Math.max(0, pelvisAt(t) - 2.3 + lz))
    if (i > 0) grip(t, carried(pitch, FLIP_GRIP))
    for (const [side, dx] of [['L', -0.3], ['R', -0.4]] as const) {
      put(`${side}.lx`, t, dx)
      put(`${side}.ly`, t, side === 'L' ? ly + 0.12 : ly - 0.12)
      put(`${side}.lz`, t, lz)
      put(`${side}.lp`, t, lp)
    }
  }
  put('hipDrop', FLIP[0], 0.1)
  put('hipDrop', FLIP[1], 0.02)
  put('spineX', FLIP[0], -6)
  put('spineX', (FLIP[0] + FLIP[1]) / 2, 14)
  put('spineX', FLIP[1], 4)
  put('headX', (FLIP[0] + FLIP[1]) / 2, 10)
  put('turn', TAKEOFF, 0)
  put('turn', FLIP[1] + 0.04, 90)
  put('advance', TAKEOFF, 0)
  put('strafe', TAKEOFF, 0)
  put('air', TAKEOFF, 0)
  put('air', TAKEOFF + 0.08, 0.9)

  // ---- the ring: face down, level, the jet driving it round; the spear out toward the centre
  put('hipPitch', RING[0] + 0.14, -280)
  put('hipPitch', RING[1] - 0.06, -280)
  put('hipDrop', RING[0] + 0.2, 0)
  put('spineX', RING[0] + 0.2, 2)
  put('headX', RING[0] + 0.2, -38)
  put('headX', RING[1] - 0.1, -34)
  grip(RING[0] + 0.12, carried(-280, SIDE_GRIP))
  grip(RING[0] + 0.36, OUT)
  grip(RING[1] - 0.1, OUT)
  leg(RING[0] + 0.22, TRAIL)
  leg((RING[0] + RING[1]) / 2, { L: [-0.46, -1.9, 2.02, 152], R: [-0.46, -1.9, 2.02, 152] })
  leg(RING[1] - 0.12, TRAIL)
  put('air', RING[0] + 0.3, CRUISE)
  put('air', RING[1] - 0.08, CRUISE)
  const samples = LAPS * 12
  for (let i = 1; i <= samples; i++) {
    // sampled evenly in time, so the path's speed follows phiAt
    const t = RING[0] + (RING[1] - RING[0]) * i / samples
    const phi = phiAt(t)
    const [lat, fwd] = ring(phi)
    put('strafe', t, lat)
    put('advance', t, fwd)
    put('turn', t, 90 - phi)
  }

  // ---- the burst: it pulls up onto the flame and climbs over the centre, turning to face out along the heading it began on
  const climb: Array<[number, number, number]> = [[5.2, 1.2, 5.2], [5.6, 3.4, 12], [5.95, 5.4, 19], [CLIMB_TOP, 6.2, APEX - 0.6], [SOMERSAULT[0], CENTER, APEX]]
  for (const [t, fwd, air] of climb) {
    put('advance', t, fwd)
    put('strafe', t, 0)
    put('air', t, air)
  }
  put('turn', 5.35, -720)
  put('hipPitch', 5.3, -360)
  put('hipDrop', 5.3, 0.06)
  put('spineX', 5.3, -2)
  put('headX', 5.3, -10)
  leg(5.3, HANG)
  grip(5.3, [0.3, 0.1, -0.5, 60, 150 - 360, 60])
  grip(CLIMB_TOP, carried(-360, SOMERSAULT_GRIP))

  // ---- the apex: hung in slow motion, a somersault forward, the spear coming round to point down
  put('hipPitch', SOMERSAULT[0], -360)
  for (let i = 1; i <= 4; i++) {
    const u = i / 4
    const t = SOMERSAULT[0] + (SOMERSAULT[1] - SOMERSAULT[0]) * u
    const pitch = -360 + 360 * (u * u * (3 - 2 * u))
    put('hipPitch', t, pitch)
    const tuck = Math.sin(Math.PI * u)
    const reach = 1.3 + 0.9 * (1 - tuck)
    const a = rad(pitch)
    const ly = -reach * Math.sin(a)
    const lz = 2.3 - reach * Math.cos(a)
    // hung at the top: the pelvis holds its height while the body turns about it
    put('air', t, Math.max(0, APEX + 2.2 - 2.3 + lz))
    if (i < 4) grip(t, carried(pitch, SOMERSAULT_GRIP))
    for (const [side, dx] of [['L', -0.25], ['R', -0.35]] as const) {
      put(`${side}.lx`, t, dx)
      put(`${side}.ly`, t, ly)
      put(`${side}.lz`, t, lz)
      put(`${side}.lp`, t, 25 * tuck - pitch)
    }
  }
  put('spineX', SOMERSAULT[0] + 0.3, 14)
  put('spineX', SOMERSAULT[1], 4)
  put('headX', SOMERSAULT[0] + 0.3, 16)
  put('headX', SOMERSAULT[1], 22)
  grip(SOMERSAULT[0], carried(-360, SOMERSAULT_GRIP))
  grip(SOMERSAULT[1] + 0.06, DOWN)

  // ---- the drop: feet first, the spear point down beneath it, straight onto the centre
  put('advance', PLUNGE - 0.01, CENTER)
  put('strafe', PLUNGE - 0.01, 0)
  put('air', 7.1, APEX - 1.2)
  put('air', 7.3, APEX * 0.62)
  put('air', 7.48, APEX * 0.26)
  put('air', PLUNGE - 0.02, 0)
  leg(7.2, DROP)
  grip(7.45, DOWN)
  put('hipDrop', 7.45, 0.1)
  put('headX', 7.45, 26)

  // ---- the plunge: the spear driven home as it lands, a knee down; held; the rise
  grip(PLUNGE, DRIVEN)
  grip(8.3, DRIVEN)
  grip(8.75, [-0.28, 0.74, -0.14, 0, 176, 90])
  // pulled out and held point down beside the body like a staff while it goes: tipping it up would swing the butt into the chest
  grip(9.05, [-0.2, 0.62, -0.4, -6, 174, 90])
  put('hipDrop', PLUNGE + 0.06, 1.25)
  put('hipDrop', 8.3, 1.2)
  put('hipDrop', 8.9, 0.4)
  put('hipDrop', 9.6, 0.05)
  put('hipPitch', PLUNGE + 0.06, 16)
  put('hipPitch', 8.3, 14)
  put('hipPitch', 8.7, 5)
  put('hipPitch', 9.2, 3)
  put('hipPitch', 9.8, 0)
  put('spineX', PLUNGE + 0.06, 12)
  put('spineX', 8.3, 10)
  put('spineX', 8.7, -3)
  put('spineX', 9.2, 0)
  put('headX', PLUNGE + 0.08, 30)
  put('headX', 8.1, -8)
  put('headX', 9.2, 0)
  // down on the right knee behind, the left foot planted ahead
  put('R.heel', PLUNGE + 0.02, 0)
  put('R.heel', PLUNGE + 0.12, 70)
  put('R.heel', 8.4, 68)
  put('R.heel', 8.85, 10)
  put('R.heel', 9.1, 0)
  for (const side of ['L', 'R'] as const) {
    k[`${side}.free`] = [[TAKEOFF + 0.02, 0], [TAKEOFF + 0.1, 1], [PLUNGE - 0.01, 1], [PLUNGE + 0.08, 0]]
    // landing: the last key a frame before the ground, feet under the body
    put(`${side}.lz`, PLUNGE - 0.03, 0)
  }
  put('L.ly', PLUNGE - 0.03, 0.8)
  put('R.ly', PLUNGE - 0.03, -1.3)

  // the hands: the spear hand throughout; the free hand back along the body in flight, onto the shaft for the drop
  k['w.wield'] = [[0.2, 0], [0.34, 1], [9.34, 1], [9.52, 0]]
  k['w.two'] = [[0.2, 0], [SOMERSAULT[1] - 0.12, 0], [7.2, 1], [8.75, 1], [9.0, 0]]
  k['R.grip'] = [[0.12, 1], [9.3, 1], [9.6, 0.5]]
  k['L.grip'] = [[0.12, 1]]
  k['L.az'] = [[0.3, 20], [TAKEOFF, 30], [FLIP[1], 12], [RING[0] + 0.3, 8], [RING[1], 8], [5.3, 40], [SOMERSAULT[0], 30], [SOMERSAULT[1], -10], [9.0, 16]]
  k['L.el'] = [[0.3, -30], [TAKEOFF, 20], [FLIP[1], -60], [RING[0] + 0.3, -80], [RING[1], -80], [5.3, -30], [SOMERSAULT[0], -20], [SOMERSAULT[1], -30], [9.0, -60]]
  k['L.reach'] = [[0.3, 0.6], [TAKEOFF, 0.8], [RING[0] + 0.3, 0.92], [RING[1], 0.92], [5.3, 0.8], [SOMERSAULT[1], 0.6], [9.0, 0.55]]
  k['L.elbow'] = [[0.3, 20]]
  // yaw back upright once the spear is gone and nothing holds it
  put('w.yaw', 9.55, -10)
  put('w.pitch', 9.55, 150)
  put('w.pitch', 9.7, 100)

  for (const list of Object.values(k)) {
    list!.sort((a, b) => a[0] - b[0])
    for (let i = list!.length - 1; i > 0; i--) if (list![i][0] - list![i - 1][0] < 1e-3) list!.splice(i - 1, 1)
  }
  return k
}

function cues(): MoveCue[] {
  const list: MoveCue[] = [
    { t: 0.02, cue: 'servo', value: 0.4 },
    { t: 0.08, cue: 'eyes', value: 1 },
    { t: 0.16, cue: 'weapon-in', value: 0.4 },
    { t: 0.3, cue: 'mark', value: CENTER },
    { t: 0.4, cue: 'zone', value: 1 },
    { t: TAKEOFF - 0.04, cue: 'zone', value: 0 },
    { t: TAKEOFF, cue: 'launch', value: 1 },
    { t: TAKEOFF, cue: 'burn', value: 0.55 },
    { t: TAKEOFF + 0.25, cue: 'burn', value: 0.12 },
    { t: FLIP[1] - 0.14, cue: 'burn', value: 1.1 },
    { t: FLIP[1] - 0.14, cue: 'punch', value: 7 },
    { t: RING[0], cue: 'vortex', value: 1 },
    { t: RING[0], cue: 'wake', value: 1 },
    { t: 4.86, cue: 'burst', value: 1 },
    { t: 4.86, cue: 'burn', value: 1.3 },
    { t: 5.0, cue: 'wake', value: 0 },
    { t: 5.1, cue: 'vortex', value: 0 },
    { t: 5.4, cue: 'charge', value: 1 },
    { t: 6.05, cue: 'burn', value: 0.2 },
    { t: 6.3, cue: 'burn', value: 0 },
    { t: 6.32, cue: 'hush', value: 0.6 },
    { t: 7.02, cue: 'hush', value: 0 },
    { t: 7.05, cue: 'kick', value: 0.3 },
    { t: 7.1, cue: 'fall', value: 1 },
    { t: PLUNGE, cue: 'plunge', value: 1 },
    { t: PLUNGE + 0.2, cue: 'charge', value: 0 },
    { t: 8.4, cue: 'servo', value: 0.5 },
    { t: 8.75, cue: 'slash', value: 0.8 },
    { t: 9.0, cue: 'eyes', value: 0 },
    { t: 9.05, cue: 'weapon-out', value: 0.35 },
  ]
  // the spear through the vortex, a cut each quarter lap
  for (const [t0] of CUTS) list.push({ t: t0, cue: 'slash', value: 0.9 })
  return list.sort((a, b) => a.t - b.t)
}

/** Descent's geometry and times, for what it does to the soldiers (hits.ts) and its effects. */
export const DESCENT = {
  center: CENTER,
  radius: RADIUS,
  circle: RING,
  cuts: CUTS,
  plunge: PLUNGE,
  /** the vortex's reach round the centre (m) */
  pull: 24,
} as const

export const BAT_SPECIAL: SpecialMove = {
  name: 'descent',
  handback: 9.2,
  handbackView: { yaw: Math.PI, pitch: 0.18 },
  // the apex hangs in slow motion; the plunge freezes, then plays out slowly
  tempo: [[6.1, 1], [6.34, 0.3], [6.95, 0.3], [7.1, 1], [PLUNGE - 0.01, 1], [PLUNGE + 0.02, 0.16], [8.0, 0.3], [8.5, 0.65], [8.9, 1]],
  move: { name: 'descent', duration: 10.1, chain: [10.1, 10.1], keys: keys(), cues: cues() },
  shots: [
    // the eyes blaze, the spear forming below
    { at: 0, eyeFrame: 'head', eye: [[0, -1.5, 2.4, 0.35], [0.62, -1.2, 2.1, 0.3]], lookFrame: 'head', look: [[0, 0, 0.1, 0.2], [0.62, 0, 0.1, 0.25]], fov: [[0, 32], [0.62, 28]] },
    // low off its left front: the spring and the backflip against the sky
    { at: TAKEOFF, eye: [[TAKEOFF, 7.5, 5.5, 0.8], [RING[0], 8.5, 6, 1.2]], lookFrame: 'body', look: [[TAKEOFF, 0, 0, 1.4], [RING[0], 0, 0, 0.6]], lag: 6, fov: [[TAKEOFF, 50], [RING[0], 46]] },
    // high and wide over the ring: the flame going round, the vortex drawing everything in
    { at: RING[0], eye: [[RING[0], -14, -6, 15], [3.2, -12, -8, 16]], look: [[RING[0], 0, CENTER, 0.5], [3.2, 0, CENTER, 0.5]], fov: [[RING[0], 50], [3.2, 52]] },
    // over the centre, above the crowd the vortex has gathered: it comes round and round the lens, the spear through them
    { at: 3.2, eye: [[3.2, 0.6, CENTER, 5.6], [4.3, -0.6, CENTER, 5.0]], lookFrame: 'body', look: [[3.2, 0, 0, 0], [4.3, 0, 0, 0]], lag: 10, fov: [[3.2, 56], [4.3, 54]] },
    // behind it as it pulls up onto the flame and climbs
    { at: 4.3, eye: [[4.3, 12, -2, 2.5], [5.9, 14, -4, 7]], lookFrame: 'body', look: [[4.3, 0, 0, 0], [5.9, 0, 0, 0]], lag: 5, fov: [[4.3, 44], [5.9, 38]] },
    // below it at the apex, against the sky, as it somersaults
    { at: 5.9, eyeFrame: 'body', eye: [[5.9, 5, 6, -6], [6.98, 3.5, 7, -4.5]], lookFrame: 'body', look: [[5.9, 0, 0, 1], [6.98, 0, 0, 0.5]], fov: [[5.9, 46], [6.98, 42]], roll: [[5.9, -6], [6.98, 4]] },
    // from the ground at the centre, looking up: it comes down on the lens
    { at: 6.98, eye: [[6.98, -9, CENTER + 8, 1.4], [PLUNGE, -8.5, CENTER + 7.5, 1.6]], lookFrame: 'body', look: [[6.98, 0, 0, 0], [PLUNGE, 0, 0, 0.5]], lag: 14, fov: [[6.98, 40], [PLUNGE, 48]] },
    // the plunge, wide and low as the wave and the surge roll out
    { at: PLUNGE, eye: [[PLUNGE, -11, CENTER + 12, 3.6], [8.8, -9.5, CENTER + 10.5, 4]], look: [[PLUNGE, 0, CENTER, 1.4], [8.8, 0, CENTER, 1.6]], fov: [[PLUNGE, 52], [8.8, 48]] },
    // close off its right as it rises from the glass and pulls the spear out
    { at: 8.8, eye: [[8.8, -5, CENTER + 4, 1.4], [9.8, -6.5, CENTER + 2.5, 2.2]], lookFrame: 'head', look: [[8.8, 0, 0, -1], [9.8, 0, 0, -0.6]], fov: [[8.8, 44], [9.8, 44]] },
  ],
}
