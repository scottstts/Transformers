import type { MoveCue } from '../../transformer/combat/moves'
import type { SpecialMove } from '../../transformer/combat/special'
import { reachOut, smoothEase, Timeline, toss, type Frame, type Keys, type Placement, type V3 } from './pose'
import { IMPALA_REST } from './moves'

/**
 * Black Thunder: the Impala's special, directed as a sequence of shots.
 *
 *   gather  close on the face: the eyes blaze, the world drains, the cutlass
 *           forms; it loads down into a deep crouch, the blade trailing low
 *           behind, the arms swung back
 *   charge  one step, driven off the back foot straight into the crowd:
 *           15.5 m at some 32 m/s on a low, level line (not an arc: a thrown
 *           arc read as a hop), the sand breaking under the push-off, the
 *           body pitched hard into it, the lead leg reaching ahead and the
 *           trailing leg stretched back; it bowls through everything in its
 *           path
 *   flip    as it lands it drops into a deep wide crouch, sliding on, the
 *           feet ploughing the sand, and the blade sweeps up out of the lance
 *           through the front and on overhead: everything round it is thrown
 *           high into the air, and it holds the whole body's pose (LANDED)
 *           while they fly
 *   raise   while they hang it stands square, brings the blade over and turns
 *           it point down, and raises it high overhead in its fist, the whole
 *           body stretched up under it, held: the camera low in front,
 *           looking up at it
 *   plant   driven down into the sand with the whole body, a stamp and a
 *           drop: crimson lightning runs out from it over the ground all round
 *           and leaps up into the bodies, holding them seizing in the air,
 *           while it stands over it, a hand on the pommel at arm's length
 *   pull    as the lightning dies they fall; it sinks, braces and hauls, the
 *           blade coming up through the sand by inches, then tears it free
 *   hold    the cutlass laid across the chest, the fist before the right
 *           shoulder and the blade back past it, wound up on its right side:
 *           close and square on the face and the blade, the moment hung
 *   finale  cut to far off: one swing from right to left through everything
 *           round it, toward the blade's own side, the body unwinding behind
 *           it, and a wave of crimson light going out through everything at
 *           once
 *
 * Special time (s), in its ground frame ([lateral + left, forward]).
 */
/** the charge: its push-off, its landing, the rising cut's blow that throws everything up, and the end of the slide into the crouch (s) */
const TAKEOFF = 0.78
const LAND = 1.26
const FLIP = 1.32
const SKID = 1.4
/** the charge's line: how high the feet ride over the sand (m), lifted and set down in DASH_EDGE (s); how far it has gone at the landing (m) */
const DASH = 0.35
const DASH_EDGE = 0.07
const CHARGED = 15.5
/** where the slide stops, the centre of everything after (m ahead of where it began) */
const CENTER = 16.3
/** the flung arm drawn in and the cutlass popped up off it, turning over once outside the arm, caught reversed high overhead (point down: the raise), held, driven into the sand */
const GATHER = 1.8
const POP = 2.02
const REL1 = 2.16
const RAISE = 2.62
const PLANT = 3.06
/** how long the lightning runs; its hold on the bodies in the air lets go as it dies */
const LIGHTNING: [number, number] = [3.09, 4.74]
/** the haul on the buried blade, and the moment it tears free */
const STRAIN = 4.82
const PULL = 5.37
/** torn free, thrown up turning over, caught in the ordinary grip high on the left */
const REL2 = 5.41
const CATCH2 = 5.8
/** the cocked blade at the left shoulder: the held moment */
const HOLD: [number, number] = [6.12, 6.72]
const FINALE = 6.86
const END = 8.72
/** Where the fist holds the planted hilt (m over the sand): the blade's point a little way in. */
const HILT = 3.95
/** The pelvis's height at rest (m), and the fist's height from the pelvis that keeps the hilt at `grip` with the hips dropped `drop`. */
const HIPS = 2.87
const onHilt = (drop: number, grip = HILT): number => grip - HIPS + drop

/** Free-leg pose per side: [lx, ly, lz, lp]. */
type Leg = readonly [number, number, number, number]
const legs = (t: number, L: Leg, R: Leg, into: Keys): void => {
  for (const [side, leg] of [['L', L], ['R', R]] as const) {
    const [lx, ly, lz, lp] = leg
    ;(into[`${side}.lx`] ??= []).push([t, lx])
    ;(into[`${side}.ly`] ??= []).push([t, ly])
    ;(into[`${side}.lz`] ??= []).push([t, lz])
    ;(into[`${side}.lp`] ??= []).push([t, lp])
  }
}

/** The charge's body: low and pitched hard into it, the head up, the blade levelled ahead like a lance, point first into the crowd, the free arm pumping (`arm` -1 back .. 1 forward). */
const CHARGING = (drop: number, arm: number): Frame => ({
  turn: 8 * arm, hips: 4 * arm, drop, pitch: 24, bend: 12, nod: -30, head: 0.5,
  hold: { at: [1.5, 1.5, 0.55], point: [-0.25, 0.97, 0.02] }, free: [90 - 70 * arm, -20 + 25 * arm, 0.88, 20, 1],
})

/** The planted hilt held reversed at arm's length (the fist on top of it, the blade out of its little finger's side), the arm nearly straight and the elbow down, the blade straight down into the sand. */
const PLANTED = (drop: number, grip = HILT): Frame['hold'] => ({ at: [0.9, PLANTED_AT, onHilt(drop, grip)], point: [0, 0.02, -1], reverse: true })
/** How far ahead of the pelvis the blade stands in the sand (m): one place from the stab to the pull (it is in the sand), at arm's length from a shoulder carried forward over it. */
const PLANTED_AT = 2.3

/** Standing over the planted blade, the lightning running out from it. */
const OVER = (drop: number, nod: number, extra: Partial<Frame> = {}): Frame => ({
  turn: -6, hips: -2, drop, pitch: 3, bend: 2, nod, hold: PLANTED(drop), free: [18, -60, 0.72, 22, 1], ...extra,
})

/**
 * The held moment before the finale: the cutlass laid across the chest, the
 * arm reaching nearly straight across the front at shoulder height to the
 * fist before the right shoulder (well out ahead of the car's front on the
 * chest) and the blade back past it, flat, the edge (and the knuckle bow on
 * its side) turned straight ahead: the edge faces along the forearm, so a
 * bent arm with the elbow low stood it up and raised the bow over the face; the body wound right onto the
 * right leg, the edge out to the right, the free fist low at the right hip.
 * Held in the left hand, the cutlass swings from here to the left (the
 * reference's right-handed sword, across to the left and swung right,
 * mirrored): swung the other way, the body was in the blade's way.
 */
const WOUND: Frame = { turn: -22, hips: -10, drop: 0.52, pitch: 6, bend: 2, nod: 0, hold: { at: [-0.25, 2.25, 1.68], point: [-0.85, -0.52, 0.05] }, free: [120, -45, 0.74, 24, 1] }

/**
 * The left arm's direction from the shoulder toward `phi` (deg + left of the
 * heading) raised `-drop`, tipped `back` degrees toward the robot's back:
 * a blade held on along the arm (reachOut's direction).
 */
function alongArm(phi: number, drop: number, back: number, toward: V3 = TIP): V3 {
  const p = phi * Math.PI / 180, d = drop * Math.PI / 180, b = back * Math.PI / 180
  const dir = [Math.cos(d) * Math.sin(p), Math.cos(d) * Math.cos(p), -Math.sin(d)]
  // the side it tips to, square to the arm
  const k = toward[0] * dir[0] + toward[1] * dir[1] + toward[2] * dir[2]
  const away = [toward[0] - dir[0] * k, toward[1] - dir[1] * k, toward[2] - dir[2] * k]
  const n = Math.hypot(away[0], away[1], away[2]) || 1
  return [dir[0] * Math.cos(b) + away[0] / n * Math.sin(b), dir[1] * Math.cos(b) + away[1] / n * Math.sin(b), dir[2] * Math.cos(b) + away[2] / n * Math.sin(b)]
}

/** a blade flung up on along the arm tips a little forward, where the hand holds it unturned on the forearm */
const TIP: V3 = [0, 1, 0]
/** The sword arm thrown up and out on the left at the end of the rising cut, the blade on along it (tipped a little back), the grip pivoted in the fist to hold it there. */
const FLUNG = (phi: number, drop: number, off = 10): NonNullable<Frame['hold']> => ({ at: reachOut(10, 26, phi, drop, 2.2), point: alongArm(phi, drop + ARM_SAG, off), out: 0.8, bend: Math.min(25, Math.max(0, 45 - off)) })
/**
 * How far below reachOut's line the flung arm really lies (deg): the crouch's
 * pitched, tilted torso carries the shoulder off reachOut's turned and leant
 * one, and the arm reaches past its length, so it points from where the
 * shoulder is (measured by pose-audit's trace); the blade is laid on the arm
 * there.
 */
const ARM_SAG = 14

/**
 * Landed out of the charge, the whole body's pose as its rising cut throws
 * everything round it into the sky and they fly: down into a deep wide crouch, the weight dropped over the deeply bent
 * right knee and the left leg stretched far out to the side, the hips shifted
 * and tipped down to the right and the torso leaning over toward the right
 * hand, which reaches down to the sand; the sword arm flung high up and out
 * on the left, the blade straight on along it into the sky (FLUNG), the head
 * turned up after them. An arm raised alone, the body standing under it, read
 * as a twisted arm and not as a pose.
 */
const LANDED: Frame = {
  turn: 10, hips: 4, drop: 1.28, shift: -0.3, roll: -8, pitch: 20, bend: 6, tilt: -14, nod: -26, head: 0.4,
  hold: FLUNG(80, -64), free: [62, -66, 1, 10, 0.4],
}

/**
 * The raise, as the toss's catch: standing tall, the arm thrust straight up
 * over the left shoulder, the cutlass held reversed, its blade hanging point
 * down outside the arm beside the head (the grip pivoted a little in the fist,
 * as a hand's does to let a blade hang along the arm).
 */
const RAISED: Frame = {
  turn: -4, hips: -1, drop: -0.04, pitch: -3, bend: -6, nod: -10, head: 0.6,
  hold: { at: [1.6, 0.34, 4.0], point: [0.86, -0.1, -0.5], reverse: true, out: 0.9 }, free: [26, -62, 0.72, 20, 1],
}

/**
 * Gathered for the throw: the flung arm drawn in and down, the fist before the
 * face with the blade standing straight up in it (the one place the ordinary
 * grip stands a blade up: with the arm still raised the forearm points up too,
 * and a blade stood up along it spins the hand), the body starting up out of
 * the crouch.
 */
const GATHERED: Frame = {
  turn: 8, hips: 3, drop: 1.08, shift: -0.25, roll: -6, pitch: 15, bend: 4, tilt: -11, nod: -32, head: 0.45,
  hold: { at: reachOut(8, 18, 30, -15, 1.45), point: [-0.05, 0.08, 0.99], out: 0.3 }, free: [54, -63, 0.95, 12, 0.6],
}
/** Let go: the fist popped up before the face, the blade still standing, the eyes on it; let go early in the drive, before the forearm stands up under the blade. */
const POPPED: Frame = {
  turn: 5, hips: 2, drop: 0.86, shift: -0.2, roll: -4, pitch: 9, bend: 2, tilt: -7, nod: -40, head: 0.5,
  hold: { at: reachOut(5, 12, 33, -30, 1.52), point: [-0.08, 0.02, 0.99], out: 0.5 }, free: [46, -62, 0.9, 14, 0.8],
}

/** The last of the raise's wind before the stab: up a hand higher, the chest lifted. */
const WOUND_UP: Frame = { ...RAISED, drop: -0.08, pitch: -5, bend: -9, nod: -2, hold: { ...RAISED.hold!, at: [1.6, 0.46, 4.12], point: [0.8, -0.1, -0.59] }, free: [40, -40, 0.75, 20, 1] }

/** Caught out of the second toss, in the ordinary grip: high up and out on the left, the blade lying back over the head, the stance wide. */
const CAUGHT: Frame = {
  turn: 4, hips: 2, drop: 0.22, pitch: -2, bend: -4, nod: -16, head: 0.6,
  hold: { at: reachOut(4, 0, 55, -52, 1.95), point: [-0.45, -0.6, 0.66], out: 0.8 }, free: [120, -30, 0.8, 18, 1],
}

/** The sword arm thrown straight out at the end of the finale's swing, toward `phi` (deg + left of the heading), the blade on along it (tipped a little ahead, trailing the arm), the grip pivoted in the fist to hold it there. */
const OUT = (turn: number, lean: number, phi: number, drop: number): NonNullable<Frame['hold']> => ({ at: reachOut(turn, lean, phi, drop, 2.2), point: alongArm(phi, drop, 10), bend: 25 })
/**
 * The finale's follow-through: the hips and chest turned well round to the
 * left, the whole sword arm thrown straight out on the left and carried a
 * little past the shoulder's line toward the back, the blade in line with it;
 * the free arm hanging bent in front of the body.
 */
const SWUNG: Frame = { turn: 48, hips: 26, drop: 0.74, pitch: 11, bend: 5, nod: 4, hold: OUT(48, 11, 158, 2), free: [-4, -60, 0.72, 24, 0.9] }

const line = new Timeline()
  // ---- the gather: loading down, the blade levelled low at the crowd ahead, the free arm swung back, the head up
  .key(0.16, { turn: 16, hips: 6, drop: 0.4, pitch: 10, bend: 2, nod: -8, hold: { at: [1.6, 0.9, 0.5], point: [-0.3, 0.9, -0.3] }, free: [40, -40, 0.78, 24, 1] })
  .key(TAKEOFF - 0.06, { turn: 14, hips: 6, drop: 1.0, pitch: 28, bend: 10, nod: -24, hold: { at: [1.55, 0.75, 0.45], point: [-0.25, 0.95, -0.1] }, free: [150, -30, 0.88, 18, 1] })
  // ---- the charge: the back leg fires, one step straight in on a low line, the point driving ahead
  .cut(TAKEOFF - 0.06, TAKEOFF + 0.06, [
    { turn: 14, hips: 6, drop: 1.0, pitch: 28, bend: 10, nod: -24, hold: { at: [1.55, 0.75, 0.45], point: [-0.25, 0.95, -0.1] }, free: [150, -30, 0.88, 18, 1] },
    CHARGING(0.35, 1),
  ], { ease: smoothEase, lead: 0.3, lag: 0.05 })
  .key((TAKEOFF + LAND) / 2, CHARGING(0.45, 0.2))
  .key(LAND - 0.04, CHARGING(0.4, -0.4))
  // ---- the landing: as the lead foot meets the sand the body drops into the wide crouch, sliding on, and the blade sweeps up out of the
  // lance, through the front and on up overhead: the rising cut that throws everything round it into the sky
  .cut(LAND - 0.04, LAND + 0.18, [
    CHARGING(0.4, -0.4),
    { turn: 4, hips: 2, drop: 0.9, shift: -0.15, roll: -4, pitch: 16, bend: 6, tilt: -6, nod: -16, head: 0.5, hold: { at: [1.8, 2.1, 1.3], point: [0.05, 0.85, 0.52] }, free: [40, -60, 0.95, 12, 0.6] },
    // rising up the front with the arm (the blade falls out to the left only as the arm gets there: carried out ahead of it, it wrung the hand)
    { turn: 7, hips: 3, drop: 1.1, shift: -0.22, roll: -6, pitch: 18, bend: 6, tilt: -10, nod: -22, head: 0.45, hold: { at: reachOut(10, 26, 58, -34, 2.15), point: [0.15, 0.62, 0.77], out: 0.5, bend: 10 }, free: [52, -64, 0.98, 11, 0.5] },
    { ...LANDED, drop: 1.22, hold: FLUNG(82, -56) },
  ], { lead: 0.3, lag: 0.1 })
  // ---- the whole body's pose as the bodies fly (LANDED): still rising after the cut, the arm and the gaze carried on up
  .key(LAND + 0.34, LANDED)
  // ---- the throw, a plain toss and regrip: the flung arm drawn in, the blade stood up before the face as the body starts up out of the
  // crouch, then popped up and let go; the cutlass rises some 0.6 m turning over once (the shortest way, about 140 degrees), its point
  // swinging out and down outside the arm while the hilt comes up, and the open hand follows it up, the body standing and the feet
  // stepping in under it, and takes it reversed, point down, at full stretch overhead just past the top of its rise
  .key(GATHER, { ...LANDED, drop: 1.22, nod: -30, hold: FLUNG(80, -60) })
  .cut(GATHER, POP, [
    { ...LANDED, drop: 1.22, nod: -30, hold: FLUNG(80, -60) },
    { ...LANDED, drop: 1.16, shift: -0.27, roll: -7, pitch: 17, bend: 5, tilt: -12, nod: -31, hold: { at: reachOut(9, 20, 56, -40, 1.75), point: [0.3, 0.36, 0.88], out: 0.5 } },
    GATHERED,
  ], { ease: smoothEase, lead: 0.25, lag: 0.05 })
  // (the pop passes through the release at speed, the hand going on up after it: eased into the release, the toss left a hand at rest)
  .cut(POP, REL1 + 0.06, [
    GATHERED,
    { ...GATHERED, drop: 0.98, pitch: 12, bend: 3, tilt: -9, nod: -36, hold: { at: reachOut(7, 16, 31, -22, 1.48), point: [-0.06, 0.05, 0.99], out: 0.4 } },
    POPPED,
    { ...POPPED, drop: 0.78, nod: -42, hold: { at: reachOut(4, 10, 35, -44, 1.65), point: [-0.05, 0, 1], out: 0.6 } },
  ], { ease: (s) => s, lead: 0.2, lag: 0 })
  // the open hand following the hilt up, under it and inside the blade, the eyes on it
  .key(2.4, { turn: 0, hips: 0, drop: 0.36, shift: -0.08, roll: -2, pitch: 4, bend: -2, tilt: -4, nod: -42, head: 0.55, hold: { ...RAISED.hold!, at: [1.4, 1.45, 3.12], bend: 6 }, free: [34, -62, 0.8, 16, 0.9] })
  // ---- the raise: caught reversed, the arm straight up, the blade hanging point down beside the head, the whole body stretched tall under it;
  // charging, held
  .key(RAISE, RAISED)
  .key(RAISE + 0.24, { ...RAISED, drop: -0.06, nod: -8 })
  // the last of the wind: up a hand higher, the chest lifted, then stabbed down through the sand with the whole body, the blade kept point
  // down: the arm long, swung over and down in front (an elbow folded under the fist stood the forearm up, where no grip points a blade down it)
  .key(PLANT - 0.14, WOUND_UP)
  .cut(PLANT - 0.14, PLANT, [
    WOUND_UP,
    { turn: -6, hips: -2, drop: 0.12, pitch: -1, bend: -4, nod: 0, hold: { at: reachOut(-6, -2, 14, -48, 2.1), point: [0.3, 0.05, -0.95], reverse: true, bend: 10, out: 0.6 }, free: [60, -36, 0.78, 18, 1] },
    { turn: -7, hips: -2.5, drop: 0.3, pitch: 3, bend: 2, nod: 5, hold: { at: reachOut(-7, 4, 16, -8, 2.1), point: [0.14, 0.04, -0.99], reverse: true, bend: 4, out: 0.4 }, free: [90, -32, 0.82, 16, 1] },
    { turn: -8, hips: -3, drop: 0.45, pitch: 6, bend: 5, nod: 10, hold: PLANTED(0.45), free: [110, -30, 0.86, 14, 1] },
  ], { ease: (s) => s ** 1.6, lead: 0.2, lag: 0 })
  // ---- standing tall over it, the hand on the hilt, the lightning running out from it; looking up at the bodies it holds
  .key(PLANT + 0.3, OVER(0.08, -22))
  .key(3.6, OVER(0.06, -30, { head: 0.5 }))
  .key(4.5, OVER(0.08, -18, { head: 0.8 }))
  // ---- the haul: sunk and braced, hunched over the hilt, the head down; the blade coming up through the sand by inches
  .key(STRAIN, { turn: -10, hips: -4, drop: 0.5, pitch: 16, bend: 10, nod: 14, hold: PLANTED(0.5, HILT), free: [40, -30, 0.75, 30, 1] })
  .key(4.98, { turn: -10, hips: -4, drop: 0.46, pitch: 15, bend: 9, nod: 10, hold: PLANTED(0.46, HILT + 0.06), free: [55, -26, 0.78, 26, 1] })
  .key(5.12, { turn: -10, hips: -4, drop: 0.38, pitch: 13, bend: 7, nod: 6, hold: PLANTED(0.38, HILT + 0.16), free: [60, -24, 0.78, 26, 1] })
  .key(5.28, { turn: -10, hips: -4, drop: 0.3, pitch: 10, bend: 4, nod: 2, hold: PLANTED(0.3, HILT + 0.3), free: [60, -24, 0.78, 26, 1] })
  // ---- torn free: the body comes up and the arm whips it out of the sand and up, the wrist flicking the blade out to the left, letting go:
  // it goes on up turning over outside the arm (let go hanging under the fist, it had to turn up through the hand), caught in the ordinary
  // grip high on the left, the blade lying back over the head
  .cut(5.28, REL2, [
    { turn: -10, hips: -4, drop: 0.3, pitch: 10, bend: 4, nod: 2, hold: PLANTED(0.3, HILT + 0.3), free: [60, -24, 0.78, 26, 1] },
    { turn: -4, hips: -1.5, drop: 0.12, pitch: 2, bend: -1, nod: -6, hold: { at: [1.25, 1.85, 2.0], point: [0.45, 0.18, -0.88], reverse: true }, free: [110, -22, 0.84, 18, 1] },
    { turn: -3, hips: -1, drop: 0.02, pitch: -3, bend: -5, nod: -12, hold: { at: [1.4, 1.7, 2.45], point: [0.92, 0.12, -0.36], reverse: true }, free: [120, -20, 0.86, 16, 1] },
  ], { ease: smoothEase, lead: 0.25, lag: 0.05 })
  // the open hand held under it, forward, while it turns over above (chased up after it, the forearm was in the blade's way), then up to it
  .key(5.6, { turn: 2, hips: 1, drop: 0.1, pitch: -3, bend: -5, nod: -24, head: 0.6, hold: { at: [1.3, 1.45, 2.55], point: [-0.25, 0.3, 0.92], out: 0.4 }, free: [130, -22, 0.86, 14, 1] })
  .key(CATCH2, CAUGHT)
  // ---- brought down and across: the arm sweeps down in front of the face to the right shoulder, the blade, lying back over the head,
  // lowered with it until it lies flat back past the right shoulder (swung down through the front instead, it wrung the hand and threw the
  // elbow over the top), the arm reaching across the chest, the body wound right, the free fist low at the right hip
  .key(5.98, { turn: -10, hips: -4, drop: 0.36, pitch: 3, bend: 0, nod: -4, hold: { at: [0.5, 1.9, 2.55], point: [-0.88, -0.3, 0.36], out: 0.3 }, free: [90, -42, 0.74, 24, 1] })
  .key(HOLD[0], { ...WOUND, turn: -18, hips: -8, drop: 0.48 })
  .key(HOLD[1], WOUND)
  // ---- the swing: a flat backhand right to left across the whole front and out round the left, the hips firing first, the chest after, the
  // arm and blade last and fastest; the hand palm down throughout, so the blade stays level, trailing the fist through the front, then
  // snapping into line with the arm as the arm is thrown straight out on the left; the free arm carried round in front of the body
  .cut(HOLD[1], FINALE + 0.1, [
    WOUND,
    { turn: -10, hips: 6, drop: 0.62, pitch: 8, bend: 3, hold: { at: [0.35, 2.45, 1.75], point: [-0.95, -0.28, 0.02] }, free: [70, -50, 0.78, 22, 0.9] },
    { turn: 18, hips: 16, drop: 0.72, pitch: 10, bend: 5, hold: { at: reachOut(18, 14, 40, 2, 2.0), point: [-0.45, 0.89, 0.02] }, free: [20, -56, 0.74, 24, 0.9] },
    { turn: 38, hips: 22, drop: 0.76, pitch: 10, bend: 5, hold: { at: reachOut(38, 13, 100, 2, 2.1), point: [0.86, 0.5, 0.0] }, free: [2, -58, 0.72, 24, 0.9] },
  ], { lead: 0.3, lag: 0.1 })
  // ---- thrown out and held: the whole arm straight out on the left and carried a little past the shoulder's line toward the back, the
  // blade in line with it, the free arm in front of the body: then lowered and gone
  .key(FINALE + 0.22, SWUNG)
  .key(FINALE + 0.72, { ...SWUNG, drop: 0.68, pitch: 10, free: [0, -62, 0.72, 24, 0.85] })
  // brought back round ahead on the left as it comes down, the elbow giving, the blade level (lowered straight from behind, the elbow and
  // the hand flipped over to bring the blade ahead), then lowered by the side on the blade's own side, the blade settling level ahead as
  // the arm comes down (where the lowered hand holds it: turned in across the body or down along the hanging forearm, it rolled the hand)
  .key(FINALE + 0.88, { turn: 40, hips: 22, drop: 0.6, pitch: 9, bend: 5, hold: { at: reachOut(40, 12, 116, 14, 1.85), point: [0.86, 0.45, -0.22] }, free: [6, -64, 0.72, 22, 0.8] })
  .key(FINALE + 1.0, { turn: 26, hips: 10, drop: 0.44, pitch: 6, bend: 3, hold: { at: [1.75, 1.1, 0.45], point: [0.08, 0.99, 0.06] }, free: [10, -64, 0.74, 22, 0.8] })
  .key(FINALE + 1.18, { turn: -12, hips: -4, drop: 0.3, pitch: 4, bend: 0, hold: { at: [1.4, 0.9, 0.12], point: [-0.05, 0.99, -0.08] }, free: [16, -66, 0.76, 22, 0.7] })
  .add(FINALE + 1.58, { hipDrop: 0.16, hipPitch: 2, 'L.out': 0 })

/**
 * Where the hand holds the cutlass as it lets it go and as it takes it again
 * (the holds keyed above, as the overlay's natural hold finishes them:
 * measured by `AUDIT_PLACE=2.16,2.62,5.41,5.8 node tools/pose-audit.mjs`;
 * measure again after changing those holds). The flight runs between them.
 */
const THROWN: Placement = { grip: [1.721, 1.486, 1.829], blade: [-0.317, -0.307, 0.897], edge: [0.541, 0.719, 0.437] }
const RAISED_IN: Placement = { grip: [1.6, 0.34, 4.04], blade: [0.86, -0.1, -0.5], edge: [0.447, -0.322, 0.834] }
const TORN: Placement = { grip: [1.398, 1.697, 2.436], blade: [0.924, 0.114, -0.365], edge: [0.261, 0.512, 0.818] }
const CAUGHT_IN: Placement = { grip: [2.16, 0.737, 3.157], blade: [-0.45, -0.599, 0.662], edge: [0.621, 0.323, 0.714] }

/**
 * The special's two throws of the cutlass, each turning over outside the arm
 * (s, placements, extra whole turns), each the shortest turn between the
 * holds and no more: popped up from the fist before the face, the blade
 * standing, and taken reversed overhead just past the top of its rise;
 * flicked out of the sand and taken in the ordinary grip high on the left.
 */
export const THROWS = [
  { release: REL1, catch: RAISE, from: THROWN, to: RAISED_IN, turns: 0 },
  { release: REL2, catch: CATCH2, from: TORN, to: CAUGHT_IN, turns: 0 },
] as const

function keys(): Keys {
  const k = line.keys({}, IMPALA_REST)
  const [first, second] = THROWS.map((w) => toss(w.release, w.catch, w.from, w.to, false, w.turns))
  for (const [c, list] of Object.entries(first) as Array<[keyof Keys, NonNullable<Keys[keyof Keys]>]>) k[c] = [...list, ...second[c]!]
  // the charge's line (lifted off the sand at once, held level, set down at the landing): the lowest foot's height, the feet free and
  // carried with the body (sliding with it into the crouch, the left one out wide)
  k.air = [[TAKEOFF, 0], [TAKEOFF + DASH_EDGE, DASH * 0.9], [(TAKEOFF + LAND) / 2, DASH], [LAND - DASH_EDGE, DASH * 0.9], [LAND, 0]]
  k['R.free'] = [[TAKEOFF - 0.02, 0], [TAKEOFF + 0.03, 1], [SKID, 1], [SKID + 0.05, 0]]
  k['L.free'] = [[TAKEOFF - 0.02, 0], [TAKEOFF + 0.03, 1], [SKID, 1], [SKID + 0.05, 0]]
  // driven off the right foot: the left leg reaching far ahead low, the right stretched back off the push, held through the line; the left set down first, the right trailing
  legs(TAKEOFF + 0.05, [0, 1.1, 0.25, 6], [-0.1, -1.3, 0.4, 55], k)
  legs((TAKEOFF + LAND) / 2, [0, 1.2, 0.2, 4], [-0.1, -1.3, 0.45, 50], k)
  legs(LAND - 0.06, [0, 1.0, 0.08, 2], [-0.05, -1.1, 0.4, 40], k)
  legs(LAND, [0.3, 0.7, 0, 0], [0, -0.9, 0, 0], k)
  // sliding into the wide crouch: the left foot out far to the side, the right drawn in under the bent knee (re-planted there, stepped back in for the raise)
  legs(SKID, [1.2, 0.25, 0, 0], [0.15, -0.45, 0, 0], k)
  // the charge's speed, the slide braking it, the finale's step into the swing
  k.advance = [[TAKEOFF - 0.04, 0], [TAKEOFF, 0.1], [LAND, CHARGED], [SKID, CENTER], [FINALE - 0.12, CENTER], [FINALE + 0.06, CENTER + 0.63], [FINALE + 0.2, CENTER + 0.73]]
  k.strafe = [[TAKEOFF, 0], [END - 0.2, 0]]
  // the hand opens as it lets the cutlass go and closes on it as it comes into it
  k['L.grip'] = [[0.08, 1], [REL1, 1], [REL1 + 0.05, 0.1], [RAISE - 0.05, 0.1], [RAISE, 1], [REL2, 1], [REL2 + 0.05, 0.1], [CATCH2 - 0.05, 0.1], [CATCH2, 1]]
  k['w.wield'] = [[0.12, 0], [0.32, 1], [FINALE + 1.2, 1], [FINALE + 1.4, 0]]
  k['R.heel'] = [[TAKEOFF - 0.12, 0], [TAKEOFF - 0.02, 16], [TAKEOFF + 0.02, 0], [FINALE - 0.04, 0], [FINALE + 0.1, 18], [FINALE + 0.78, 10], [FINALE + 1.18, 0]]
  k['L.heel'] = [[HOLD[0], 0], [HOLD[1], 10], [FINALE - 0.04, 0]]
  for (const list of Object.values(k)) {
    list!.sort((a, b) => a[0] - b[0])
    for (let i = list!.length - 1; i > 0; i--) if (list![i][0] - list![i - 1][0] < 1e-3) list!.splice(i - 1, 1)
  }
  return k
}

function cues(): MoveCue[] {
  return [
    { t: 0.06, cue: 'eyes', value: 1 },
    { t: 0.12, cue: 'weapon-in', value: 0.36 },
    { t: 0.2, cue: 'charge', value: 0.5 },
    { t: 0.26, cue: 'zone', value: 1 },
    { t: TAKEOFF - 0.12, cue: 'stomp.R', value: 0.7 },
    { t: TAKEOFF - 0.04, cue: 'zone', value: 0 },
    { t: TAKEOFF, cue: 'break', value: 1.2 },
    { t: TAKEOFF, cue: 'punch', value: 9 },
    { t: TAKEOFF, cue: 'stop', value: 0.05 },
    { t: TAKEOFF, cue: 'rush', value: 1 },
    { t: LAND, cue: 'rush', value: 0 },
    { t: LAND - 0.02, cue: 'arc', value: 1.8 },
    { t: LAND, cue: 'touchdown', value: 1.2 },
    { t: LAND, cue: 'skid', value: 1 },
    { t: FLIP, cue: 'launch', value: 1.3 },
    { t: FLIP, cue: 'stop', value: 0.09 },
    { t: SKID, cue: 'skid', value: 0 },
    { t: LAND + 0.2, cue: 'arc', value: 0 },
    { t: 1.72, cue: 'charge', value: 0 },
    // raised: the blade charging, crackling, the eyes blazing; then driven down
    { t: RAISE - 0.05, cue: 'charge', value: 1 },
    { t: RAISE, cue: 'crackle', value: 1 },
    { t: RAISE, cue: 'zone', value: 0.6 },
    { t: PLANT - 0.08, cue: 'arc', value: 1.2 },
    { t: PLANT - 0.02, cue: 'crackle', value: 0 },
    { t: PLANT, cue: 'plant', value: 1.2 },
    { t: PLANT, cue: 'stomp.L', value: 0.8 },
    { t: PLANT, cue: 'stop', value: 0.1 },
    { t: PLANT + 0.02, cue: 'arc', value: 0 },
    { t: PLANT + 0.02, cue: 'zone', value: 0 },
    { t: LIGHTNING[0], cue: 'lightning', value: 1 },
    { t: LIGHTNING[0] + 0.2, cue: 'charge', value: 0 },
    { t: LIGHTNING[1], cue: 'lightning', value: 0 },
    { t: STRAIN, cue: 'strain', value: 1 },
    { t: PULL, cue: 'strain', value: 0 },
    { t: PULL, cue: 'unplant', value: 1 },
    { t: CATCH2 - 0.04, cue: 'charge', value: 1 },
    { t: CATCH2 + 0.02, cue: 'crackle', value: 1 },
    { t: HOLD[0], cue: 'zone', value: 1 },
    { t: HOLD[0] + 0.02, cue: 'hush', value: 0.55 },
    { t: HOLD[1] + 0.02, cue: 'hush', value: 0 },
    { t: HOLD[1] + 0.04, cue: 'zone', value: 0 },
    { t: FINALE - 0.1, cue: 'arc', value: 1.8 },
    { t: FINALE - 0.02, cue: 'crackle', value: 0 },
    { t: FINALE, cue: 'finale', value: 1 },
    { t: FINALE, cue: 'stomp.L', value: 1 },
    { t: FINALE + 0.12, cue: 'arc', value: 0 },
    { t: FINALE + 0.3, cue: 'charge', value: 0 },
    { t: FINALE + 0.66, cue: 'eyes', value: 0 },
    { t: FINALE + 1.13, cue: 'weapon-out', value: 0.3 },
  ].sort((a, b) => a.t - b.t)
}

/** Black Thunder's geometry and times, for what it does to the soldiers (hits.ts) and its effects. */
export const THUNDER = {
  center: CENTER,
  /** the charge, bowling through what is in its path (s) */
  charge: [TAKEOFF, LAND] as const,
  /** the held moment before the finale (s) */
  hold: HOLD,
  /** the landing's rising cut, throwing everything round it into the sky */
  flip: FLIP,
  plant: PLANT,
  lightning: LIGHTNING,
  /** the lightning's front running out over the sand from the blade (m/s, from 1 m) to its whole circle (m): what it covers it strikes, on the sand and in the air */
  front: { speed: 26, reach: 24 },
  /** the lightning's strikes on the bodies, this far apart (s), each holding a body it reaches in the air this long (s) */
  beat: 0.3,
  shock: 0.4,
  /** what the lightning took lies stunned until this (s): past the finale's swing, so nothing it held is up again before the swing */
  recover: FINALE + 0.9,
  finale: FINALE,
  /** the swing's wave through the air, from the finale (ShockRing): growing from `from` to `reach` m over `life` s */
  wave: { from: 3, reach: 40, life: 1.0 },
  /** the swing's follow-through, held: the sword arm thrown straight out on the left (s) */
  follow: [FINALE + 0.22, FINALE + 0.72] as const,
  /** everything within this of it is thrown up by the flip (m) */
  reach: 16,
} as const

export const IMPALA_SPECIAL: SpecialMove = {
  name: 'black-thunder',
  handback: FINALE + 0.76,
  handbackView: { yaw: Math.PI, pitch: 0.18 },
  // the bodies thrown up hang a moment, and the pose a little longer; the throw turns over a little slow; the plant's blow bites; the lightning plays out a little slow; the held moment hangs; the wave's blow freezes, then plays out
  tempo: [[FLIP + 0.02, 1], [FLIP + 0.12, 0.55], [1.46, 0.4], [GATHER - 0.04, 0.4], [GATHER + 0.1, 0.8], [REL1 + 0.04, 0.8], [REL1 + 0.12, 0.7], [RAISE - 0.1, 0.7], [RAISE, 1], [PLANT - 0.01, 1], [PLANT + 0.02, 0.3], [PLANT + 0.22, 0.8], [LIGHTNING[1] - 0.15, 0.8], [LIGHTNING[1], 1], [HOLD[0] - 0.12, 1], [HOLD[0] + 0.02, 0.22], [HOLD[1] - 0.04, 0.22], [HOLD[1] + 0.02, 1], [FINALE - 0.01, 1], [FINALE + 0.02, 0.16], [FINALE + 0.4, 0.4], [FINALE + 0.51, 1]],
  move: {
    name: 'black-thunder', duration: END, chain: [END, END], keys: keys(), cues: cues(),
    // out of the wide landing, the feet step back in under the body as the blade comes over for the raise
    steps: [
      { side: 'L', t0: 2.12, t1: 2.3, to: [0.94, CENTER + 0.04], yaw: 0, lift: 0.18 },
      { side: 'R', t0: 2.24, t1: 2.4, to: [-0.94, CENTER + 0.04], yaw: 0, lift: 0.12 },
    ],
  },
  shots: [
    // the face, the eyes blazing, the cutlass forming below, sinking with it as it loads
    { at: 0, eyeFrame: 'head', eye: [[0, -1.3, 2.6, 0.2], [TAKEOFF, -1.0, 2.3, 0.0]], lookFrame: 'head', look: [[0, 0, 0.1, -0.1], [TAKEOFF, 0, 0.1, -0.3]], fov: [[0, 32], [TAKEOFF, 28]] },
    // down on the sand off its left, panning with it: the charge tearing past, the sand breaking under it, the bodies bowled aside
    { at: TAKEOFF, eye: [[TAKEOFF, 10, 4, 0.5], [LAND, 11.5, 16, 0.8]], lookFrame: 'body', look: [[TAKEOFF, 0, 0.5, 0.6], [LAND, 0, 0.5, 0.3]], lag: 5, fov: [[TAKEOFF, 56], [LAND, 52]] },
    // wide and low ahead: the landing's rising cut and everything thrown up into the sky; then it stays on the pose, pushing in slowly
    { at: LAND - 0.02, eye: [[LAND - 0.02, -13, CENTER + 19, 1.2], [1.46, -12.4, CENTER + 17.6, 1.3], [GATHER - 0.1, -10.6, CENTER + 14.2, 1.4]], look: [[LAND - 0.02, 0, CENTER - 1, 2.5], [FLIP + 0.1, 0, CENTER, 4], [1.46, 0.3, CENTER, 4.4], [GATHER - 0.1, 0.4, CENTER, 4.7]], fov: [[LAND - 0.02, 50], [1.46, 46], [GATHER - 0.1, 40]] },
    // low in front, looking up past the knees: gathered and popped up among the bodies, followed up as it turns over, taken
    // high overhead point down, pushing in under it, held, and stabbed in
    { at: GATHER - 0.1, eye: [[GATHER - 0.1, 4.4, CENTER + 8.4, 0.6], [RAISE, 3.2, CENTER + 5.4, 0.5], [PLANT + 0.4, 3.8, CENTER + 6.2, 0.9]], look: [[GATHER - 0.1, 0.8, CENTER + 0.3, 4.6], [REL1, 1.3, CENTER + 0.4, 5.6], [REL1 + 0.18, 1.3, CENTER + 0.5, 6.6], [RAISE, 0.2, CENTER + 0.6, 6.4], [PLANT - 0.14, 0, CENTER + 0.6, 6.0], [PLANT, 0, CENTER + 1.4, 3.2], [PLANT + 0.4, 0, CENTER + 1.6, 2.4]], fov: [[GATHER - 0.1, 50], [REL1 + 0.18, 54], [RAISE, 50], [PLANT + 0.4, 54]], roll: [[GATHER - 0.1, 3], [PLANT + 0.4, 0]] },
    // high and wide for the whole of the lightning: bursting out over the sand all round, up into the bodies it holds, drifting slowly round
    // and up over it as they seize, the bodies coming down as it dies
    { at: PLANT + 0.4, eye: [[PLANT + 0.4, -17, CENTER - 9, 15], [3.95, -12.5, CENTER - 13, 17.5], [STRAIN, -6, CENTER - 16, 19]], look: [[PLANT + 0.4, 0, CENTER, 3], [3.95, 0, CENTER, 6], [LIGHTNING[1], 0, CENTER, 5.5], [STRAIN, 0, CENTER, 4]], fov: [[PLANT + 0.4, 58], [3.95, 54], [STRAIN, 50]] },
    // off its left front: the haul on the buried blade, the bodies coming down, torn free and thrown up, eased back and up after it, taken
    { at: STRAIN, eye: [[STRAIN, 7, CENTER + 7, 2.2], [CATCH2, 8, CENTER + 8, 2.8], [HOLD[0], 5.5, CENTER + 6, 3.4]], lookFrame: 'body', look: [[STRAIN, 0, 0, 0.6], [PULL, 0, 0, 1.4], [CATCH2, 0, 0, 3.2], [HOLD[0], 0, 0, 1.8]], fov: [[STRAIN, 46], [CATCH2, 50], [HOLD[0], 42]] },
    // the held moment, close and square on: the face and the blade across the chest at the right shoulder, framed between them (the head's frame sits at its base:
    // the face is some 0.3 m over it, the blade 0.4 m under it), pushing in without losing either
    { at: HOLD[0], eyeFrame: 'head', eye: [[HOLD[0], -0.35, 3.6, 0.05], [HOLD[1], -0.25, 3.1, 0.05]], lookFrame: 'head', look: [[HOLD[0], -0.25, 0, 0.0], [HOLD[1], -0.2, 0, 0.02]], fov: [[HOLD[0], 36], [HOLD[1], 32]], roll: [[HOLD[0], -2], [HOLD[1], 0]] },
    // cut to far off ahead and above: the swing and the wave going out through everything
    { at: HOLD[1], eye: [[HOLD[1], -8, CENTER + 34, 10], [FINALE + 0.76, -10, CENTER + 38, 13]], look: [[HOLD[1], 0, CENTER, 2.6], [FINALE + 0.76, 0, CENTER, 2]], fov: [[HOLD[1], 54], [FINALE + 0.76, 58]] },
  ],
}
