import type { Key } from '../../transformer/combat/curves'
import type { Channel } from '../../transformer/combat/pose'
import type { MoveCue } from '../../transformer/combat/moves'
import type { SpecialMove } from '../../transformer/combat/special'

/**
 * Descent: the Bat's special. It crouches as the spear forms, the eyes
 * blazing; springs up and throws a quick backflip, and comes out of it face
 * down, level, as the afterburner on its back lights. The jet drives it round
 * a ring thirteen metres across, low over the sand, twice, the spear trailed
 * at its right side down and out toward the ring's centre (held as a spear is
 * carried at the side, the arm down, the shaft on the diagonal), its point
 * cutting through everything there, and the air goes round with it: a vortex
 * drawing the whole crowd in to the centre. Then the jet bursts to full and it
 * pulls up, standing on the flame, the spear hanging at its side, and climbs
 * over the centre; over the top, in slow motion, it throws a forward
 * somersault still rising and comes out of it already falling, feet first,
 * the spear held point down before it in its right hand, and drives it into
 * the ground where the vortex drew them all. The sand goes up in a crater of
 * glass. It kneels in it, rises, pulls the spear out and lets it go.
 *
 * Special time (s): gather 0-0.55, jump and flip 0.55-1.06, the ring
 * 1.12-4.46 (two laps, clockwise seen from above: the centre on its right),
 * then from the ring's end (BURST): the burst and climb, the apex and
 * somersault (slow motion), the drop to the plunge, the kneel and rise.
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
const TAKEOFF = 0.55
/** The backflip: a quick one, as a body throws it (its turn fastest in the tuck), not a slow staged roll. */
const FLIP: [number, number] = [0.6, 1.06]
const RING: [number, number] = [1.12, 4.46]
const LAPS = 2
/** The jet to full at the ring's end; the climb, the somersault at the top and the plunge timed from it. */
const BURST = RING[1]
const CLIMB_TOP = BURST + 1.39
const SOMERSAULT: [number, number] = [BURST + 1.5, BURST + 2.12]
const PLUNGE = BURST + 2.76
/** Flight height (m, the lowest foot) round the ring, and where the somersault starts and ends on the way over the top. */
const CRUISE = 3.1
const APEX = 25
/**
 * Still climbing as it throws the somersault (m/s): the body rides over the
 * top of a ballistic arc through the turn, rising RISE * half / 2 m to a peak
 * at its middle and falling back through APEX at the same speed as it comes
 * out, then accelerating down at FALL_ACCEL m/s^2 into the plunge.
 */
const RISE = 13
const FALL_ACCEL = 2 * (APEX - RISE * (PLUNGE - SOMERSAULT[1])) / (PLUNGE - SOMERSAULT[1]) ** 2

/**
 * A foot's outline about its free-leg target (forward, up; m), in its own
 * plane: the gait's sole (heel and toe edges at the ankle's depth, BAT_GAIT),
 * the back of the heel, the top of the ankle and the instep, as the model's
 * support points have them. Turned with the body, a different part of it is
 * lowest, and the lift (`air`) is measured from the lowest.
 */
const FOOT: ReadonlyArray<readonly [number, number]> = [[-0.33, -0.4], [0.86, -0.4], [-0.45, -0.15], [0, 0.17], [0.25, 0.1]]
const ANKLE = 0.4
/** How far a foot pitched `lp` degrees (+ toe down) reaches below its flat sole (m, negative): the toe tipped down, the heel back, the top turned under. */
function soleDrop(lp: number): number {
  const a = lp * Math.PI / 180
  let low = Infinity
  for (const [f, u] of FOOT) low = Math.min(low, u * Math.cos(a) - f * Math.sin(a))
  return ANKLE + low
}

type V3 = readonly [number, number, number]
type Point = readonly [number, number]
const rad = (deg: number): number => deg * Math.PI / 180
const deg = (r: number): number => r * 180 / Math.PI
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

/**
 * The spear in the right hand, held in the torso's frame (m from the pelvis:
 * x + left, forward of the chest, up the spine): the fist, the point's
 * direction and where along the shaft the hand is (`w.slide`). The overlay
 * turns the wrist with the forearm.
 */
interface Grip {
  at: V3
  dir: V3
  slide: number
  /** the point's direction in the heading's frame instead (x + left, forward, up): the fist rides with the body, the shaft swings its own way */
  aim?: V3
}
/** Free-leg pose per side: [lx, ly, lz, lp]. */
type Leg = readonly [number, number, number, number]

/** Gathered: the fist beside the right hip, the point ahead and low. */
const LOW: Grip = { at: [-1.55, 0.3, -0.4], dir: [-0.05, 0.99, -0.06], slide: 0 }
/**
 * Through the backflip: the fist out from the right hip, riding with the
 * body, while the shaft swings its own way (in the heading's frame) from ahead
 * and low, out level to the right as the body goes over, round into the trail
 * behind it: turned rigidly with the body it came out of the flip pointing
 * down the chest into the sand.
 */
const FLIP_GRIP: Grip = { at: [-1.95, 0.4, -0.2], dir: [0, 1, 0], slide: -1.5 }
const FLIP_AIM: V3[] = [[-0.1, 0.97, -0.2], [-0.8, 0.55, 0.1], [-1, -0.05, 0], [-0.72, -0.54, -0.44]]
/** Face down round the ring: the arm down the right side, the shaft trailed on the diagonal, down to the sand (the chest's forward), out toward the centre and back toward the feet. */
const TRAIL_GRIP: Grip = { at: [-1.7, 0.3, -0.35], dir: [-0.72, 0.34, -0.61], slide: -1.5 }
/** Upright on the flame, and through the somersault: the arm down and a little out at the right side, the shaft hanging on the diagonal, point forward and down, out past the legs. */
const HANG_GRIP: Grip = { at: [-2.0, 0.3, -0.1], dir: [-0.2, 0.8, -0.56], slide: -1.5 }
/**
 * Point down for the drop, in the right hand out ahead and to the right (the
 * deep chest leaves no room for both hands on an upright shaft before it, and
 * an arm held along the shaft would put it through the gauntlet): the arm
 * nearly straight and well off the shaft's line, the hand held a third of the
 * way up it so the point reaches the sand as the feet do; driven, the hand
 * stays with the kneeling body and the point goes a metre in.
 */
const DOWN: Grip = { at: [-1.0, 1.7, 0.9], dir: [0, 0.02, -1], slide: 1.35 }
const DRIVEN: Grip = { at: [-1.0, 1.7, 1.0], dir: [0, 0.02, -1], slide: 1.35 }

/**
 * The weapon channels (the heading's frame, which the body's pitch does not
 * turn) for a grip held in the torso's frame while the body is pitched `pitch`
 * degrees (+ forward) about the pelvis: the spear turns with the body through
 * a flip instead of the body turning through it. Of the equivalent yaw and
 * pitch pairs (the turns, and the shaft's pitch mirrored with its yaw turned
 * round) it takes the one nearest `prev`, so no key swings the shaft the long
 * way round.
 */
function held(pitch: number, g: Grip, prev: [number, number]): Partial<Record<Channel, number>> {
  const a = rad(pitch)
  const turn = ([x, f, u]: V3): V3 => [x, f * Math.cos(a) + u * Math.sin(a), -f * Math.sin(a) + u * Math.cos(a)]
  const [x, f, u] = turn(g.at)
  const d = g.aim ?? turn(g.dir)
  const n = Math.hypot(d[0], d[1], d[2])
  const p = deg(Math.acos(Math.max(-1, Math.min(1, d[2] / n))))
  // straight up or down the yaw means nothing: keep the last
  const yaw = Math.hypot(d[0], d[1]) / n < 0.05 ? prev[0] : deg(Math.atan2(-d[0], d[1]))
  let best: [number, number] = [yaw, p]
  let cost = Infinity
  for (const [y0, p0] of [[yaw, p], [yaw + 180, -p]]) {
    const y1 = y0 + 360 * Math.round((prev[0] - y0) / 360)
    const p1 = p0 + 360 * Math.round((prev[1] - p0) / 360)
    const c = Math.abs(y1 - prev[0]) + Math.abs(p1 - prev[1])
    if (c < cost) { cost = c; best = [y1, p1] }
  }
  prev[0] = best[0]
  prev[1] = best[1]
  return {
    'w.x': -(x + 1.18) / 1.9, 'w.y': f / 1.9, 'w.z': (u - 1.64) / 1.9,
    'w.yaw': best[0], 'w.pitch': best[1], 'w.roll': 0, 'w.slide': g.slide,
  }
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
  // grips are converted in time order at the end, each against the one before it
  const grips: Array<[number, number, Grip]> = []
  const grip = (t: number, pitch: number, g: Grip): void => { grips.push([t, pitch, g]) }
  const leg = (t: number, pose: Record<'L' | 'R', Leg>): void => {
    for (const side of ['L', 'R'] as const) {
      const [lx, ly, lz, lp] = pose[side]
      put(`${side}.lx`, t, lx)
      put(`${side}.ly`, t, ly)
      put(`${side}.lz`, t, lz)
      put(`${side}.lp`, t, lp)
    }
  }

  // ---- the gather: crouched low, spear at the side, head up
  put('hipDrop', 0.26, 0.3)
  put('hipDrop', TAKEOFF - 0.05, 0.6)
  put('hipDrop', TAKEOFF + 0.06, 0.02)
  put('hipPitch', 0.26, 4)
  put('hipPitch', TAKEOFF - 0.05, 14)
  put('headX', 0.26, -14)
  put('headX', TAKEOFF - 0.05, -24)
  grip(0.04, 0, LOW)
  grip(0.26, 4, LOW)
  grip(TAKEOFF - 0.05, 14, LOW)
  put('R.heel', TAKEOFF - 0.05, 0)
  put('R.heel', TAKEOFF + 0.02, 34)
  put('L.heel', TAKEOFF - 0.05, 0)
  put('L.heel', TAKEOFF + 0.02, 34)

  // ---- the jump and the backflip: the body turns back through 280 degrees and comes out face down,
  // tucked through the turn, its heading swinging left onto the ring's tangent. It turns as a thrown
  // flip does: already turning as it leaves the ground, fastest tucked, easing out level
  const flip = (u: number): number => -280 * (u - 0.5 * Math.sin(2 * Math.PI * u) / (2 * Math.PI))
  // the pelvis flies a smooth arc; `air` is the lowest foot's height, so it follows from the legs at each key
  const arc: Array<[number, number]> = [[TAKEOFF, 2.1], [0.66, 3.9], [0.8, 5.2], [0.92, 5.3], [FLIP[1], 4.7], [RING[0] + 0.3, CRUISE + 0.3]]
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
    if (i > 0) {
      // the shaft's own swing through the flip: along FLIP_AIM, eased
      const w = u * (FLIP_AIM.length - 1)
      const j = Math.min(FLIP_AIM.length - 2, Math.floor(w))
      const [p0, p1] = [FLIP_AIM[j], FLIP_AIM[j + 1]]
      const aim: V3 = [p0[0] + (p1[0] - p0[0]) * (w - j), p0[1] + (p1[1] - p0[1]) * (w - j), p0[2] + (p1[2] - p0[2]) * (w - j)]
      grip(t, pitch, { ...FLIP_GRIP, aim })
    }
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
  put('air', TAKEOFF + 0.07, 0.9)

  // ---- the ring: face down, level, the jet driving it round; the spear trailed out toward the centre
  put('hipPitch', RING[0] + 0.12, -280)
  put('hipPitch', RING[1] - 0.06, -280)
  put('hipDrop', RING[0] + 0.2, 0)
  put('spineX', RING[0] + 0.2, 2)
  put('headX', RING[0] + 0.2, -38)
  put('headX', RING[1] - 0.1, -34)
  grip(RING[0] + 0.3, -280, TRAIL_GRIP)
  grip(RING[1] - 0.1, -280, TRAIL_GRIP)
  leg(RING[0] + 0.2, TRAIL)
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
  const climb: Array<[number, number, number]> = [[BURST + 0.34, 1.2, 5.2], [BURST + 0.74, 3.4, 12], [BURST + 1.09, 5.4, 19], [CLIMB_TOP, 6.2, APEX - 1.45], [SOMERSAULT[0], CENTER, APEX]]
  for (const [t, fwd, air] of climb) {
    put('advance', t, fwd)
    put('strafe', t, 0)
    put('air', t, air)
  }
  put('turn', BURST + 0.49, -720)
  put('hipPitch', BURST + 0.44, -360)
  put('hipDrop', BURST + 0.44, 0.06)
  put('spineX', BURST + 0.44, -2)
  put('headX', BURST + 0.44, -10)
  leg(BURST + 0.44, HANG)
  grip(BURST + 0.2, -320, HANG_GRIP)
  grip(BURST + 0.44, -360, HANG_GRIP)

  // ---- the apex: in slow motion, a somersault forward over the top of the arc, the spear hanging at the side turning with it.
  // A beat of lean back gathers it; it is thrown (already turning), fastest tucked, and comes out upright, feet down
  put('hipPitch', SOMERSAULT[0] - 0.12, -367)
  put('hipPitch', SOMERSAULT[0], -360)
  const turn = (u: number): number => u * (0.6 + u * (1.8 - 1.4 * u))
  const half = (SOMERSAULT[1] - SOMERSAULT[0]) / 2
  const over = (t: number): number => APEX + RISE * half / 2 - (RISE / half) * (t - SOMERSAULT[0] - half) ** 2 / 2
  const steps = 12
  for (let i = 1; i <= steps; i++) {
    const u = i / steps
    const t = SOMERSAULT[0] + (SOMERSAULT[1] - SOMERSAULT[0]) * u
    const pitch = -360 + 360 * turn(u)
    put('hipPitch', t, pitch)
    const tuck = Math.sin(Math.PI * u)
    const reach = 1.3 + 0.9 * (1 - tuck)
    const a = rad(pitch)
    const ly = -reach * Math.sin(a)
    const lz = 2.3 - reach * Math.cos(a)
    const lp = 25 * tuck - pitch
    // over the top: the pelvis rides the arc while the body turns about it (the lift is the lowest point's, wherever on the foot that is)
    put('air', t, Math.max(0, over(t) - 0.1 + lz + soleDrop(lp)))
    if (i < steps) grip(t, pitch, HANG_GRIP)
    for (const [side, dx] of [['L', -0.25], ['R', -0.35]] as const) {
      put(`${side}.lx`, t, dx)
      put(`${side}.ly`, t, ly)
      put(`${side}.lz`, t, lz)
      put(`${side}.lp`, t, lp)
    }
  }
  put('spineX', SOMERSAULT[0] + 0.3, 14)
  put('spineX', SOMERSAULT[1], 4)
  put('headX', SOMERSAULT[0] + 0.3, 16)
  put('headX', SOMERSAULT[1], 22)
  grip(SOMERSAULT[0], -360, HANG_GRIP)
  // out of it the arm swings forward with the hand still at the butt; the hand shifts down the shaft as it falls
  grip(SOMERSAULT[1] + 0.06, 0, { ...DOWN, slide: -1.5 })

  // ---- the drop: feet first, the spear point down before it, straight onto the centre
  put('advance', PLUNGE - 0.01, CENTER)
  put('strafe', PLUNGE - 0.01, 0)
  // falling on from the arc, driven down harder and harder
  for (const dt of [0.1, 0.3, 0.48]) put('air', SOMERSAULT[1] + dt, APEX - RISE * dt - FALL_ACCEL * dt * dt / 2)
  put('air', PLUNGE - 0.02, 0)
  leg(SOMERSAULT[1] + 0.2, DROP)
  grip(PLUNGE - 0.3, 0, DOWN)
  grip(PLUNGE - 0.17, 0, DOWN)
  put('hipDrop', PLUNGE - 0.17, 0.1)
  put('headX', PLUNGE - 0.17, 26)

  // ---- the plunge: the spear driven home as it lands, a knee down; held; the rise, the spear drawn out with it
  grip(PLUNGE, 0, DRIVEN)
  grip(PLUNGE + 0.68, 0, DRIVEN)
  grip(PLUNGE + 1.13, 0, { ...DRIVEN, at: [-1.05, 1.6, 1.2] })
  grip(PLUNGE + 1.43, 0, { ...DOWN, at: [-1.2, 1.4, 0.8] })
  put('hipDrop', PLUNGE + 0.06, 1.25)
  put('hipDrop', PLUNGE + 0.68, 1.2)
  put('hipDrop', PLUNGE + 1.28, 0.4)
  put('hipDrop', PLUNGE + 1.98, 0.05)
  put('hipPitch', PLUNGE + 0.06, 10)
  put('hipPitch', PLUNGE + 0.68, 9)
  put('hipPitch', PLUNGE + 1.08, 5)
  put('hipPitch', PLUNGE + 1.58, 3)
  put('hipPitch', PLUNGE + 2.18, 0)
  put('spineX', PLUNGE + 0.06, 6)
  put('spineX', PLUNGE + 0.68, 5)
  put('spineX', PLUNGE + 1.08, -3)
  put('spineX', PLUNGE + 1.58, 0)
  put('headX', PLUNGE + 0.08, 30)
  put('headX', PLUNGE + 0.48, -8)
  put('headX', PLUNGE + 1.58, 0)
  // down on the right knee behind, the left foot planted ahead
  put('R.heel', PLUNGE + 0.02, 0)
  put('R.heel', PLUNGE + 0.12, 70)
  put('R.heel', PLUNGE + 0.78, 68)
  put('R.heel', PLUNGE + 1.23, 10)
  put('R.heel', PLUNGE + 1.48, 0)
  for (const side of ['L', 'R'] as const) {
    k[`${side}.free`] = [[TAKEOFF + 0.02, 0], [TAKEOFF + 0.09, 1], [PLUNGE - 0.01, 1], [PLUNGE + 0.08, 0]]
    // landing: the last key a frame before the ground, feet under the body
    put(`${side}.lz`, PLUNGE - 0.03, 0)
  }
  put('L.ly', PLUNGE - 0.03, 0.8)
  put('R.ly', PLUNGE - 0.03, -1.3)

  // the grips, in time order, each turned the short way from the last
  const prev: [number, number] = [3, 98]
  grips.sort((a, b) => a[0] - b[0])
  for (const [t, pitch, g] of grips) for (const [c, v] of Object.entries(held(pitch, g, prev))) put(c as Channel, t, v as number)

  // the hands: the spear hand throughout; the free hand an open palm, out for balance in flight and through the drop, on the knee kneeling
  k['w.wield'] = [[0.2, 0], [0.32, 1], [PLUNGE + 1.72, 1], [PLUNGE + 1.9, 0]]
  k['R.grip'] = [[0.12, 1], [PLUNGE + 1.68, 1], [PLUNGE + 1.98, 0.5]]
  k['L.grip'] = [[0.12, 0.12]]
  k['L.az'] = [[0.26, 20], [TAKEOFF, 30], [FLIP[1], 40], [RING[0] + 0.3, 50], [RING[1], 50], [BURST + 0.44, 40], [SOMERSAULT[0], 30], [SOMERSAULT[1] + 0.2, 75], [PLUNGE, 80], [PLUNGE + 0.5, 20], [PLUNGE + 1.38, 16]]
  k['L.el'] = [[0.26, -30], [TAKEOFF, 20], [FLIP[1], -40], [RING[0] + 0.3, -60], [RING[1], -60], [BURST + 0.44, -30], [SOMERSAULT[0], -20], [SOMERSAULT[1] + 0.2, 20], [PLUNGE, 5], [PLUNGE + 0.5, -40], [PLUNGE + 1.38, -60]]
  k['L.reach'] = [[0.26, 0.6], [TAKEOFF, 0.8], [RING[0] + 0.3, 0.92], [RING[1], 0.92], [BURST + 0.44, 0.8], [SOMERSAULT[1] + 0.2, 0.95], [PLUNGE + 0.5, 0.8], [PLUNGE + 1.38, 0.55]]
  k['L.elbow'] = [[0.26, 20]]
  // once the spear is gone and nothing holds it: back upright, the hand back at the grip band
  const end = PLUNGE + 1.93
  put('w.yaw', end, prev[0] + 360 * Math.round((-3 - prev[0]) / 360))
  put('w.yaw', end + 0.1, -3)
  put('w.pitch', end, 150)
  put('w.pitch', end + 0.15, 100)
  put('w.slide', end + 0.1, 0)

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
    { t: 0.14, cue: 'weapon-in', value: 0.4 },
    { t: 0.26, cue: 'mark', value: CENTER },
    { t: 0.34, cue: 'zone', value: 1 },
    { t: TAKEOFF - 0.04, cue: 'zone', value: 0 },
    { t: TAKEOFF, cue: 'launch', value: 1 },
    { t: TAKEOFF, cue: 'burn', value: 0.55 },
    { t: TAKEOFF + 0.2, cue: 'burn', value: 0.12 },
    { t: FLIP[0] + 0.12, cue: 'slash', value: 0.7 },
    { t: FLIP[1] - 0.1, cue: 'burn', value: 1.1 },
    { t: FLIP[1] - 0.1, cue: 'punch', value: 7 },
    { t: RING[0], cue: 'vortex', value: 1 },
    { t: RING[0], cue: 'wake', value: 1 },
    { t: BURST, cue: 'burst', value: 1 },
    { t: BURST, cue: 'burn', value: 1.3 },
    { t: BURST + 0.14, cue: 'wake', value: 0 },
    { t: BURST + 0.24, cue: 'vortex', value: 0 },
    { t: BURST + 0.54, cue: 'charge', value: 1 },
    { t: BURST + 1.19, cue: 'burn', value: 0.2 },
    { t: BURST + 1.44, cue: 'burn', value: 0 },
    { t: BURST + 1.46, cue: 'hush', value: 0.6 },
    { t: SOMERSAULT[1] + 0.04, cue: 'hush', value: 0 },
    { t: SOMERSAULT[1] + 0.07, cue: 'kick', value: 0.3 },
    { t: SOMERSAULT[1] + 0.12, cue: 'fall', value: 1 },
    { t: PLUNGE, cue: 'plunge', value: 1 },
    { t: PLUNGE + 0.2, cue: 'charge', value: 0 },
    { t: PLUNGE + 0.78, cue: 'servo', value: 0.5 },
    { t: PLUNGE + 1.13, cue: 'slash', value: 0.8 },
    { t: PLUNGE + 1.38, cue: 'eyes', value: 0 },
    { t: PLUNGE + 1.43, cue: 'weapon-out', value: 0.35 },
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
  handback: PLUNGE + 1.58,
  handbackView: { yaw: Math.PI, pitch: 0.18 },
  // the apex hangs in slow motion; the plunge freezes, then plays out slowly
  tempo: [[BURST + 1.24, 1], [BURST + 1.48, 0.3], [SOMERSAULT[1] - 0.03, 0.3], [SOMERSAULT[1] + 0.12, 1], [PLUNGE - 0.01, 1], [PLUNGE + 0.02, 0.16], [PLUNGE + 0.38, 0.3], [PLUNGE + 0.88, 0.65], [PLUNGE + 1.28, 1]],
  move: { name: 'descent', duration: PLUNGE + 2.48, chain: [PLUNGE + 2.48, PLUNGE + 2.48], keys: keys(), cues: cues() },
  shots: [
    // the eyes blaze, the spear forming below
    { at: 0, eyeFrame: 'head', eye: [[0, -1.5, 2.4, 0.35], [TAKEOFF, -1.2, 2.1, 0.3]], lookFrame: 'head', look: [[0, 0, 0.1, 0.2], [TAKEOFF, 0, 0.1, 0.25]], fov: [[0, 32], [TAKEOFF, 28]] },
    // low off its left front: the spring and the backflip against the sky
    { at: TAKEOFF, eye: [[TAKEOFF, 7.5, 5.5, 0.8], [RING[0], 8.5, 6, 1.2]], lookFrame: 'body', look: [[TAKEOFF, 0, 0, 1.4], [RING[0], 0, 0, 0.6]], lag: 6, fov: [[TAKEOFF, 50], [RING[0], 46]] },
    // high and wide over the ring: the flame going round, the vortex drawing everything in
    { at: RING[0], eye: [[RING[0], -14, -6, 15], [2.8, -12, -8, 16]], look: [[RING[0], 0, CENTER, 0.5], [2.8, 0, CENTER, 0.5]], fov: [[RING[0], 50], [2.8, 52]] },
    // over the centre, above the crowd the vortex has gathered: it comes round and round the lens, the spear through them
    { at: 2.8, eye: [[2.8, 0.6, CENTER, 5.6], [3.9, -0.6, CENTER, 5.0]], lookFrame: 'body', look: [[2.8, 0, 0, 0], [3.9, 0, 0, 0]], lag: 10, fov: [[2.8, 56], [3.9, 54]] },
    // behind it as it pulls up onto the flame and climbs
    { at: 3.9, eye: [[3.9, 12, -2, 2.5], [BURST + 1.04, 14, -4, 7]], lookFrame: 'body', look: [[3.9, 0, 0, 0], [BURST + 1.04, 0, 0, 0]], lag: 5, fov: [[3.9, 44], [BURST + 1.04, 38]] },
    // from a point hung in the sky below the top, panning after it: it rises past the lens, turns over the top and is already falling as it comes out
    { at: BURST + 1.04, eye: [[BURST + 1.04, 5.5, CENTER + 5.5, 21], [SOMERSAULT[1], 4.5, CENTER + 4.5, 23]], lookFrame: 'body', look: [[BURST + 1.04, 0, 0, 1], [SOMERSAULT[1], 0, 0, 0.5]], lag: 5, fov: [[BURST + 1.04, 46], [SOMERSAULT[1], 42]], roll: [[BURST + 1.04, -6], [SOMERSAULT[1], 4]] },
    // from the ground at the centre, looking up: it comes down on the lens
    { at: SOMERSAULT[1], eye: [[SOMERSAULT[1], -9, CENTER + 8, 1.4], [PLUNGE, -8.5, CENTER + 7.5, 1.6]], lookFrame: 'body', look: [[SOMERSAULT[1], 0, 0, 0], [PLUNGE, 0, 0, 0.5]], lag: 14, fov: [[SOMERSAULT[1], 40], [PLUNGE, 48]] },
    // the plunge, wide and low as the wave and the surge roll out
    { at: PLUNGE, eye: [[PLUNGE, -11, CENTER + 12, 3.6], [PLUNGE + 1.18, -9.5, CENTER + 10.5, 4]], look: [[PLUNGE, 0, CENTER, 1.4], [PLUNGE + 1.18, 0, CENTER, 1.6]], fov: [[PLUNGE, 52], [PLUNGE + 1.18, 48]] },
    // close off its right as it rises from the glass and pulls the spear out
    { at: PLUNGE + 1.18, eye: [[PLUNGE + 1.18, -5, CENTER + 4, 1.4], [PLUNGE + 2.18, -6.5, CENTER + 2.5, 2.2]], lookFrame: 'head', look: [[PLUNGE + 1.18, 0, 0, -1], [PLUNGE + 2.18, 0, 0, -0.6]], fov: [[PLUNGE + 1.18, 44], [PLUNGE + 2.18, 44]] },
  ],
}
