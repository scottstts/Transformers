import type { MoveCue } from '../../transformer/combat/moves'
import type { SpecialMove } from '../../transformer/combat/special'
import { free, held, keyed, reachOut, type Keys, type Pose } from './pose'

/**
 * Black Thunder: the Impala's special. It crouches as the cutlass forms in
 * its left hand, the eyes blazing and the world's colour draining; springs
 * forward and up so hard the sand it leaves breaks into a crater; lands and
 * whirls straight back up off the ground in one full turn, the blade rising
 * round it in a spiral, and everything round it is thrown high into the air.
 * While they hang and fall it stands, turns the blade point down and drives
 * it into the sand: crimson lightning runs out from it over the ground all
 * round, and wherever the bodies fall over it, it leaps up into them, again
 * and again. As they come down it draws the cutlass out of the sand and
 * lays it flat at its left shoulder, ready, the free fist clenched: the camera
 * holds on its face and the blade, the moment hung; then, seen from far off,
 * one swing from left to right, and a wave of crimson light goes out all
 * round through everything at once.
 *
 * Special time (s), in its ground frame ([lateral + left, forward]): the
 * gather 0-0.62, the leap to CENTER, the whirl (WHIRL), the plant (PLANT),
 * the lightning (LIGHTNING) over the bodies' fall (they are thrown at the
 * whirl's blow and land about four seconds later), the pull and the raise,
 * the held moment (HOLD), the swing and its wave (FINALE), the settle.
 *
 * The robot leans its pitch only a little; the whirl's full turn is the
 * root's `turn`, so the blade, held in the body's frame, goes round with it.
 */
const TAKEOFF = 0.62
const LAND = 1.02
/** where it lands, the centre of everything after (m ahead of where it began) */
const CENTER = 9
/** the whirl: its turn's window and the blow that throws everything up */
const WHIRL: [number, number] = [1.06, 1.38]
const WHIRL_STRIKE = 1.22
/** the cutlass driven into the sand, and how long the lightning runs */
const PLANT = 2.02
const LIGHTNING: [number, number] = [2.05, 5.15]
const PULL = 5.25
/** the cocked blade at the left shoulder: the held moment */
const HOLD: [number, number] = [6.0, 6.6]
const FINALE = 6.74
const END = 8.6

/** The cutlass at rest at the left side (moves.ts), for the angles everything unwinds from. */
const REST = held({ at: [1.42, 0.8, 0.1], point: [0.05, 0.9, -0.42], turn: -12, elbow: 20 })

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

/**
 * The whirl's blade: the arm out to the left at `drop` (- raised), the
 * forearm turned forward to lead the clockwise turn, the blade flat out
 * beyond the fist and `rise` degrees above level.
 */
function whirl(drop: number, rise: number, lean = 4): Pose {
  const r = rise * Math.PI / 180
  return held({ at: reachOut(-4, lean, 62, drop, 1.75), point: [0.95 * Math.cos(r), -0.05, Math.sin(r)], turn: -4, lean, out: 0.6, elbow: 70 })
}

/** Point down before it, the fist at the chest, the elbow out (the forearm runs across, square to the blade). */
const DOWN = (at: readonly [number, number, number]): Pose => held({ at, point: [0.03, 0.06, -1], turn: -6, lean: 8, elbow: 72, out: 0.2 })

function keys(): Keys {
  const poses: Array<[number, Pose]> = [
    // ---- the gather: crouched low, the fist low behind the left hip, the blade trailing back low, the head up
    [0.14, { ...held({ at: [1.5, 0.45, 0.15], point: [0.15, -0.6, -0.78], turn: 16, lean: 12, elbow: 15 }), ...free(20, -20, 0.75, 30), hipDrop: 0.3, hipPitch: 8, headX: -10 }],
    [TAKEOFF - 0.06, { ...held({ at: [1.5, 0.3, 0.0], point: [0.18, -0.65, -0.74], turn: 22, lean: 22, elbow: 15 }), ...free(30, -30, 0.8, 30), hipDrop: 0.62, hipPitch: 18, chestX: 4, headX: -18 }],
    // ---- the leap: low and fast, leaning into it, the blade trailing low behind at the left
    [TAKEOFF + 0.08, { ...held({ at: [1.45, 0.25, 0.25], point: [0.15, -0.8, -0.58], turn: 14, lean: 28, elbow: 15 }), ...free(60, -10, 0.85, 20), hipDrop: 0.1, hipPitch: 22, chestX: 6, headX: -24 }],
    [LAND - 0.1, { ...held({ at: [1.5, 0.45, 0.25], point: [0.2, -0.7, -0.68], turn: 18, lean: 12, elbow: 15 }), hipDrop: 0.2, hipPitch: 10, chestX: 2, headX: -14 }],
    // ---- down into the crouch, wound up for the whirl, the arm out low at the left
    [LAND + 0.03, { ...whirl(36, -10, 20), ...free(-20, -10, 0.8, 30), hipDrop: 0.72, hipPitch: 16, chestX: 4, headX: -12 }],
    // ---- the whirl: one full turn rising off the ground, the blade spiralling up round it
    [WHIRL[0] + 0.06, { ...whirl(24, 0, 12), hipDrop: 0.5, hipPitch: 8 }],
    [WHIRL_STRIKE, { ...whirl(2, 16, 2), ...free(-50, 10, 0.85, 30), hipDrop: 0.12, hipPitch: 0, chestX: -2, headX: -8 }],
    [WHIRL[1] - 0.06, { ...whirl(-26, 34, -2), hipDrop: 0.0, hipPitch: -4, chestX: -6, headX: -18 }],
    // ---- landed, the blade up over its head, looking up after them
    [WHIRL[1] + 0.12, { ...held({ at: [1.0, 0.75, 2.75], point: [0.15, -0.55, 0.82], turn: -4, lean: -8, out: 1, elbow: 25 }), ...free(30, -10, 0.75, 24), hipDrop: 0.18, hipPitch: -2, chestX: -6, headX: -26 }],
    [1.66, { ...held({ at: [1.0, 0.8, 2.7], point: [0.12, -0.5, 0.86], turn: -4, lean: -6, out: 1, elbow: 25 }), hipDrop: 0.2, headX: -28 }],
    // ---- the blade brought forward over the head and down before it, turned point down and driven into the sand
    [1.76, { ...held({ at: [0.95, 1.75, 2.15], point: [0.08, 0.92, 0.38], turn: -4, out: 0.6, elbow: 45 }), hipDrop: 0.24, headX: -10 }],
    [1.86, { ...DOWN([0.75, 1.85, 1.35]), ...free(20, -24, 0.72, 26), hipDrop: 0.3, hipPitch: 6, chestX: 2, headX: -6 }],
    [PLANT, { ...DOWN([0.7, 1.95, 0.05]), hipDrop: 0.5, hipPitch: 10, chestX: 4, headX: 4 }],
    // ---- holding it there, the lightning running out from it; looking up at what falls
    [PLANT + 0.3, { ...DOWN([0.7, 1.95, 0.1]), ...free(28, -30, 0.72, 26), hipDrop: 0.42, hipPitch: 6, chestX: 0, headX: -22 }],
    [3.6, { ...DOWN([0.7, 1.95, 0.15]), hipDrop: 0.4, headX: -30, headZ: 8 }],
    [LIGHTNING[1] - 0.2, { ...DOWN([0.7, 1.95, 0.12]), hipDrop: 0.42, headX: -10, headZ: 0 }],
    // ---- drawn out of the sand as they come down, swung up and laid flat at the left shoulder
    [PULL + 0.12, { ...DOWN([0.8, 1.85, 0.75]), hipDrop: 0.3, hipPitch: 4 }],
    [PULL + 0.36, { ...held({ at: [1.3, 1.5, 1.35], point: [0.3, 0.2, 0.93], turn: 12, out: 0.6, elbow: 30 }), hipDrop: 0.32, headX: 0 }],
    [5.82, { ...held({ at: [1.05, 1.6, 1.95], point: [0.5, -0.86, 0.06], turn: 28, out: 0.8, elbow: 20 }), ...free(-8, 6, 0.55, 40, 1), hipDrop: 0.4, hipPitch: 4, headX: 2 }],
    // ---- the held moment: wound onto the left side, the edge out, the right fist clenched before the chest
    [HOLD[0], { ...held({ at: [1.02, 1.62, 1.98], point: [0.52, -0.85, 0.05], turn: 32, out: 0.8, elbow: 20 }), hipDrop: 0.46, hipPitch: 5, chestX: 2, headX: 0 }],
    [HOLD[1], { ...held({ at: [1.05, 1.6, 2.0], point: [0.55, -0.83, 0.05], turn: 36, out: 0.8, elbow: 20 }), hipDrop: 0.5, hipPitch: 6 }],
    // ---- the swing: left to right across the whole front at once, the fist leading, the body unwinding behind it, one-handed from the start
    [FINALE - 0.06, { ...held({ at: [0.9, 2.0, 1.6], point: [0.8, 0.6, 0.0], turn: 10, lean: 8, out: 0.3, elbow: 40 }), ...free(60, -10, 0.85, 20, 0.6), hipDrop: 0.56, hipPitch: 8 }],
    [FINALE, { ...held({ at: [-0.3, 2.05, 1.5], point: [-0.1, 1, 0.0], turn: -24, lean: 10, elbow: 40 }), ...free(130, -12, 0.9, 14, 0.6), hipDrop: 0.6, hipPitch: 10 }],
    [FINALE + 0.06, { ...held({ at: [-1.15, 1.4, 1.45], point: [-0.9, 0.3, -0.1], turn: -52, lean: 10, elbow: 40 }), hipDrop: 0.62, hipPitch: 10 }],
    // ---- opened wide to the right, held, the free hand out behind: then the blade lowered and gone
    [FINALE + 0.18, { ...held({ at: [-1.35, 0.9, 1.3], point: [-0.75, -0.55, -0.35], turn: -62, lean: 10, elbow: 40 }), ...free(150, -16, 0.92, 10, 0.6), hipDrop: 0.6, hipPitch: 10, chestX: 4 }],
    [7.45, { ...held({ at: [-1.3, 0.95, 1.25], point: [-0.72, -0.55, -0.42], turn: -58, lean: 9, elbow: 40 }), hipDrop: 0.56, hipPitch: 9 }],
    // back to the side round the front, clear of the bumper on the chest
    [7.68, { ...held({ at: [0.2, 2.15, 0.55], point: [0.1, 0.92, -0.38], turn: -30, lean: 6, elbow: 40 }), hipDrop: 0.42, hipPitch: 6 }],
    [7.9, { ...held({ at: [1.42, 0.9, 0.12], point: [0.05, 0.9, -0.42], turn: -14, lean: 4, elbow: 20 }), ...free(20, -14, 0.75, 24), hipDrop: 0.3, hipPitch: 4, chestX: 0 }],
    [8.3, { hipDrop: 0.16, hipPitch: 2, 'L.out': 0 }],
  ]
  const k = keyed(poses, {}, REST)
  // the leap's flight and the whirl's hop: the lowest foot's height, the feet free and carried with the body
  k.air = [[TAKEOFF, 0], [TAKEOFF + 0.08, 1.3], [0.82, 2.9], [0.94, 1.5], [LAND - 0.01, 0], [WHIRL[0] + 0.02, 0], [WHIRL_STRIKE, 0.9], [WHIRL[1] - 0.04, 0.55], [WHIRL[1] + 0.03, 0]]
  k['R.free'] = [[TAKEOFF - 0.02, 0], [TAKEOFF + 0.03, 1], [WHIRL[1] + 0.04, 1], [WHIRL[1] + 0.1, 0]]
  k['L.free'] = [[TAKEOFF - 0.02, 0], [TAKEOFF + 0.03, 1], [WHIRL[1] + 0.04, 1], [WHIRL[1] + 0.1, 0]]
  legs(TAKEOFF + 0.06, [-0.2, -0.5, 0.35, 40], [-0.25, -1.0, 0.5, 50], k)
  legs(0.82, [-0.25, 0.45, 0.6, 20], [-0.3, -0.6, 0.45, 30], k)
  legs(LAND - 0.03, [0, 0.25, 0, 2], [0, -0.25, 0, 2], k)
  legs(WHIRL[0] + 0.02, [0, 0.25, 0, 0], [0, -0.25, 0, 0], k)
  legs(WHIRL_STRIKE, [-0.2, 0.1, 0.45, 26], [-0.2, -0.2, 0.3, 30], k)
  legs(WHIRL[1] + 0.01, [0, 0.2, 0, 0], [0, -0.2, 0, 0], k)
  k.advance = [[TAKEOFF - 0.02, -0.1], [TAKEOFF + 0.08, 1.2], [0.82, 5.4], [LAND, CENTER], [LAND + 0.08, CENTER + 0.1], [FINALE - 0.1, CENTER + 0.1], [FINALE + 0.06, CENTER + 0.7], [FINALE + 0.2, CENTER + 0.8]]
  k.strafe = [[TAKEOFF, 0], [END - 0.2, 0]]
  // the whirl's turn: one full circle clockwise seen from above, fastest at its blow
  k.turn = [[WHIRL[0], 0], [WHIRL[0] + 0.06, -28], [WHIRL_STRIKE, -180], [WHIRL[1] - 0.06, -332], [WHIRL[1], -360]]
  k['L.grip'] = [[0.08, 1]]
  k['w.wield'] = [[0.12, 0], [0.32, 1], [7.92, 1], [8.12, 0]]
  k['R.heel'] = [[TAKEOFF - 0.1, 0], [TAKEOFF - 0.02, 30], [TAKEOFF + 0.04, 0], [FINALE - 0.04, 0], [FINALE + 0.08, 24], [7.5, 14], [7.9, 0]]
  k['L.heel'] = [[TAKEOFF - 0.1, 0], [TAKEOFF - 0.02, 26], [TAKEOFF + 0.04, 0]]
  for (const list of Object.values(k)) {
    list!.sort((a, b) => a[0] - b[0])
    for (let i = list!.length - 1; i > 0; i--) if (list![i][0] - list![i - 1][0] < 1e-3) list!.splice(i - 1, 1)
  }
  return k
}

function cues(): MoveCue[] {
  return [
    { t: 0.02, cue: 'servo', value: 0.45 },
    { t: 0.06, cue: 'eyes', value: 1 },
    { t: 0.12, cue: 'weapon-in', value: 0.36 },
    { t: 0.2, cue: 'charge', value: 0.5 },
    { t: 0.3, cue: 'zone', value: 1 },
    { t: TAKEOFF - 0.04, cue: 'zone', value: 0 },
    { t: TAKEOFF, cue: 'break', value: 1 },
    { t: TAKEOFF, cue: 'punch', value: 8 },
    { t: LAND, cue: 'touchdown', value: 0.9 },
    { t: WHIRL[0], cue: 'arc', value: 1.4 },
    { t: WHIRL[0] + 0.02, cue: 'whirl', value: 1.2 },
    { t: WHIRL_STRIKE, cue: 'launch', value: 1 },
    { t: WHIRL_STRIKE, cue: 'stop', value: 0.06 },
    { t: WHIRL[1], cue: 'arc', value: 0 },
    { t: WHIRL[1] + 0.04, cue: 'touchdown', value: 0.5 },
    { t: 1.5, cue: 'charge', value: 0 },
    { t: 1.74, cue: 'servo', value: 0.4 },
    { t: PLANT, cue: 'plant', value: 1 },
    { t: LIGHTNING[0], cue: 'lightning', value: 1 },
    { t: LIGHTNING[1], cue: 'lightning', value: 0 },
    { t: PULL, cue: 'unplant', value: 1 },
    { t: PULL + 0.2, cue: 'servo', value: 0.45 },
    { t: 5.7, cue: 'charge', value: 1 },
    { t: 5.75, cue: 'crackle', value: 1 },
    { t: HOLD[0], cue: 'zone', value: 1 },
    { t: HOLD[0] + 0.02, cue: 'hush', value: 0.55 },
    { t: HOLD[1] + 0.02, cue: 'hush', value: 0 },
    { t: HOLD[1] + 0.04, cue: 'zone', value: 0 },
    { t: FINALE - 0.08, cue: 'arc', value: 1.6 },
    { t: FINALE - 0.02, cue: 'crackle', value: 0 },
    { t: FINALE, cue: 'finale', value: 1 },
    { t: FINALE + 0.1, cue: 'arc', value: 0 },
    { t: FINALE + 0.3, cue: 'charge', value: 0 },
    { t: 7.4, cue: 'eyes', value: 0 },
    { t: 7.5, cue: 'servo', value: 0.4 },
    { t: 7.85, cue: 'weapon-out', value: 0.3 },
  ]
}

/** Black Thunder's geometry and times, for what it does to the soldiers (hits.ts) and its effects. */
export const THUNDER = {
  center: CENTER,
  whirl: WHIRL_STRIKE,
  plant: PLANT,
  lightning: LIGHTNING,
  /** the lightning's strikes on the bodies, this far apart (s) */
  beat: 0.3,
  finale: FINALE,
  /** everything within this of it is thrown up by the whirl and fed by the lightning (m) */
  reach: 16,
} as const

export const IMPALA_SPECIAL: SpecialMove = {
  name: 'black-thunder',
  handback: 7.5,
  handbackView: { yaw: Math.PI, pitch: 0.18 },
  // the bodies flying up hang a moment; the lightning plays out a little slow; the held moment hangs; the wave's blow freezes, then plays out
  tempo: [[1.26, 1], [1.4, 0.45], [1.95, 0.45], [2.2, 0.75], [4.7, 0.75], [5.1, 1], [5.92, 1], [6.06, 0.22], [6.56, 0.22], [6.62, 1], [FINALE - 0.01, 1], [FINALE + 0.02, 0.16], [FINALE + 0.4, 0.4], [7.25, 1]],
  move: { name: 'black-thunder', duration: END, chain: [END, END], keys: keys(), cues: cues() },
  shots: [
    // the face, the eyes blazing, the cutlass forming below
    { at: 0, eyeFrame: 'head', eye: [[0, -1.3, 2.6, 0.2], [TAKEOFF, -0.95, 2.2, 0.1]], lookFrame: 'head', look: [[0, 0, 0.1, -0.1], [TAKEOFF, 0, 0.1, -0.15]], fov: [[0, 32], [TAKEOFF, 28]] },
    // low off its left: the spring, the sand breaking behind it
    { at: TAKEOFF, eye: [[TAKEOFF, 10, 3.5, 0.9], [LAND, 10.5, 7.5, 1.3]], lookFrame: 'body', look: [[TAKEOFF, 0, 0, 0.4], [LAND, 0, 0, 0]], lag: 7, fov: [[TAKEOFF, 50], [LAND, 48]] },
    // wide and low ahead: the whirl, and everything thrown up into the sky
    { at: LAND, eye: [[LAND, -13, CENTER + 19, 1.2], [1.95, -12, CENTER + 17, 1.8]], look: [[LAND, 0, CENTER, 2.5], [WHIRL_STRIKE, 0, CENTER, 4], [1.95, 0, CENTER, 13]], fov: [[LAND, 50], [1.95, 56]] },
    // closer off its left front: the blade turned down and driven in
    { at: 1.95, eye: [[1.95, 6, CENTER + 7.5, 1.3], [2.6, 6.8, CENTER + 8.2, 1.6]], look: [[1.95, 0, CENTER + 1, 1.8], [2.6, 0, CENTER + 1.5, 0.8]], fov: [[1.95, 46], [2.6, 50]] },
    // high and wide: the lightning running out over the sand all round
    { at: 2.6, eye: [[2.6, -17, CENTER - 9, 15], [3.75, -11, CENTER - 14, 18]], look: [[2.6, 0, CENTER, 2], [3.75, 0, CENTER, 4]], fov: [[2.6, 54], [3.75, 52]] },
    // from beside it, low, looking up: the bodies falling through the lightning against the sky
    { at: 3.75, eye: [[3.75, 3.5, CENTER - 3.5, 1.2], [5.0, 3, CENTER - 4.5, 1.0]], look: [[3.75, -2, CENTER + 6, 13], [5.0, -1, CENTER + 6, 4]], fov: [[3.75, 58], [5.0, 54]], roll: [[3.75, -5], [5.0, -2]] },
    // off its left front: the blade drawn out of the sand and swung up to the shoulder
    { at: 5.0, eye: [[5.0, 7, CENTER + 7, 2.2], [HOLD[0], 5.5, CENTER + 6, 3.4]], lookFrame: 'body', look: [[5.0, 0, 0, 0.8], [HOLD[0], 0, 0, 1.8]], fov: [[5.0, 46], [HOLD[0], 42]] },
    // the held moment, close and square on: the face and the blade at the shoulder
    { at: HOLD[0], eyeFrame: 'head', eye: [[HOLD[0], 0.6, 3.6, -0.6], [HOLD[1], 0.4, 3.0, -0.5]], lookFrame: 'head', look: [[HOLD[0], 0.35, 0, -0.5], [HOLD[1], 0.3, 0, -0.45]], fov: [[HOLD[0], 34], [HOLD[1], 30]], roll: [[HOLD[0], 2], [HOLD[1], 0]] },
    // cut to far off ahead and above: the swing and the wave going out through everything
    { at: HOLD[1], eye: [[HOLD[1], -8, CENTER + 34, 10], [7.5, -10, CENTER + 38, 13]], look: [[HOLD[1], 0, CENTER, 2.6], [7.5, 0, CENTER, 2]], fov: [[HOLD[1], 54], [7.5, 58]] },
  ],
}
