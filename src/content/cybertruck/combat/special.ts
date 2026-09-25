import type { SpecialMove } from '../../transformer/combat/special'

/**
 * Skyfall: the truck robot's special. It looks up, forms the axe and sinks
 * into the sand; the lift jets light straight down and blast it thirty metres
 * into the sky. At the top the jets cut out and the world goes quiet and slow
 * while it hangs there, the axe raised beside its helmet and running with
 * plasma. Then the jets fire again, upward, and drive it down like a meteor.
 * The axe goes into the sand, which is blasted into a crater of glass around
 * it as it lands kneeling, three points down. It rises, pulls the axe free
 * and lets it go.
 *
 * Special time (s): gather 0-0.55, load 0.55-1.25 (jets at 0.72), launch
 * 1.25-1.45, climb to 28.6 m at 3.3 (slow motion from 2.8), the dive from
 * 3.55, impact at 4.45 (12 m ahead), the kneel to 5.6, rise to 6.9, then
 * the camera hands back. The weapon's poses reuse the thruster charge's raise
 * and slam (combat.md), which are proven clear of the body.
 */
const IMPACT = 4.45
const LANDING = 12

export const CYBERTRUCK_SPECIAL: SpecialMove = {
  name: 'skyfall',
  handback: 6.9,
  handbackView: { yaw: Math.PI, pitch: 0.16 },
  // the apex hangs in slow motion; the impact freezes, then plays out slowly
  tempo: [[2.8, 1], [3.0, 0.35], [3.45, 0.35], [3.62, 1], [IMPACT - 0.01, 1], [IMPACT + 0.02, 0.18], [4.9, 0.3], [5.5, 0.6], [5.9, 1]],
  move: {
    name: 'skyfall',
    duration: 8,
    chain: [8, 8],
    keys: {
      // gather, the deep load, extension at launch, gathered at the top, the kneel, standing
      hipDrop: [[0.3, 0.22], [0.55, 0.3], [0.9, 0.68], [1.2, 0.78], [1.34, -0.04], [1.7, 0.02], [2.7, 0.05], [3.1, 0.35], [3.5, 0.42], [4.1, 0.3], [4.35, 0.3], [IMPACT, 0.9], [4.62, 1.45], [5.6, 1.4], [6.2, 0.8], [6.8, 0.3], [7.6, 0.06], [8, 0]],
      hipPitch: [[0.3, -4], [0.9, 16], [1.2, 20], [1.4, 2], [2.7, 0], [3.1, -8], [3.45, -10], [3.75, 24], [4.2, 22], [IMPACT, 16], [4.7, 14], [5.6, 12], [6.4, 6], [7.4, 2], [8, 0]],
      hipYaw: [[0.9, -6], [1.4, 0], [4.2, -4], [4.7, 6], [5.6, 6], [6.6, 0]],
      spineX: [[0.3, -6], [0.9, 8], [1.4, -4], [2.7, -2], [3.1, -12], [3.45, -14], [3.75, 14], [4.2, 12], [4.7, 14], [5.6, 12], [6.4, 4], [7.6, 1], [8, 0]],
      chestX: [[0.3, -8], [0.9, 6], [1.4, -6], [2.7, -4], [3.1, -10], [3.45, -12], [3.75, 12], [4.2, 10], [4.7, 12], [5.6, 10], [6.4, 4], [7.6, 1], [8, 0]],
      chestZ: [[0.9, -8], [1.4, 0], [2.4, -6], [3.2, -4], [4.3, -8], [4.7, 4], [6.4, 2], [8, 0]],
      // looks up to the sky, down at the mark, bowed at the impact, then up
      headX: [[0.35, -24], [0.6, -26], [0.95, 6], [1.4, -12], [2.6, -6], [3.1, 34], [3.45, 36], [3.75, 18], [4.2, 20], [IMPACT, 14], [4.8, 26], [5.5, 22], [5.95, -6], [6.8, -4], [8, 0]],
      headZ: [[0.9, 6], [1.4, 0], [3.2, -6], [4.7, 0]],

      // the axe hand: down to the carry, the raise beside the helmet, the strike, low in front, released
      'R.grip': [[0.12, 1], [7.4, 1], [7.85, 0]],
      'R.elbow': [[0.3, 20], [1.4, 26], [2.4, 30], [2.75, 60], [3.4, 62], [4.33, 60], [4.6, 10], [6.2, 10], [7.0, 30]],
      'R.az': [[0.3, -3]],
      'R.el': [[0.3, -22]],
      'R.reach': [[0.3, 0.5]],
      'R.wx': [[6.9, 0], [7.9, 172]],
      'R.wy': [[6.9, 0], [7.9, -63]],
      'R.wz': [[6.9, 0], [7.9, 27]],
      'w.x': [[0.3, 0.25], [2.3, 0.25], [2.5, -0.1], [2.75, -0.2], [3.5, -0.2], [4.22, -0.2], [4.35, -0.2], [IMPACT, -0.4], [5.7, -0.4], [6.25, -0.3], [6.8, -0.2]],
      'w.y': [[0.3, 0.25], [2.3, 0.3], [2.5, 0.42], [2.75, 0.6], [3.5, 0.55], [4.22, 0.6], [4.35, 0.9], [IMPACT, 0.75], [5.7, 0.78], [6.25, 0.85], [6.8, 0.7]],
      'w.z': [[0.3, -0.45], [2.3, -0.45], [2.5, 0.35], [2.75, 0.8], [3.5, 0.82], [4.22, 0.8], [4.35, 0.4], [IMPACT, -0.3], [5.7, -0.3], [6.25, -0.2], [6.8, -0.35]],
      'w.yaw': [[0.3, 15], [2.3, 15], [2.75, 0], [5.7, 0], [6.8, -10]],
      'w.pitch': [[0.3, 115], [2.3, 115], [2.5, 30], [2.75, -25], [3.5, -28], [4.22, -25], [4.35, 65], [IMPACT, 170], [5.7, 172], [6.25, 165], [6.8, 160]],
      'w.roll': [[0.3, 0], [5.7, 0], [6.8, -20]],
      'w.wield': [[0.18, 0], [0.32, 1], [7.4, 1], [7.85, 0]],

      // the free arm: back for the load, out for balance, pointing at the mark, flung back at the landing
      'L.grip': [[0.12, 1], [6.9, 1], [7.7, 0.3]],
      'L.az': [[0.3, -4], [0.9, 18], [1.4, 30], [2.2, 62], [3.0, 16], [3.45, 10], [3.8, 40], [4.1, 36], [IMPACT, 70], [5.6, 72], [6.4, 20], [7.4, 6]],
      'L.el': [[0.3, -24], [0.9, -48], [1.4, -40], [2.2, -8], [3.0, -30], [3.45, -38], [3.8, -30], [4.1, -26], [IMPACT, -36], [5.6, -34], [6.4, -40], [7.4, -30]],
      'L.reach': [[0.3, 0.55], [0.9, 0.85], [2.2, 0.9], [3.5, 0.96], [4.1, 0.9], [IMPACT, 0.95], [5.6, 0.95], [6.4, 0.6], [7.4, 0.52]],
      'L.elbow': [[0.3, 16], [2.2, 30], [3.5, 10], [IMPACT, 20], [6.4, 24]],

      // stance widened for the launch; carried with the body in the air; kneeling on the left
      'R.free': [[1.24, 0], [1.34, 1], [IMPACT - 0.01, 1], [IMPACT + 0.09, 0]],
      'R.lx': [[1.2, 0.26], [1.6, 0.04], [3.1, 0.1], [4.2, 0.08]],
      'R.ly': [[1.2, -0.15], [1.6, 0.05], [3.1, 0.55], [3.45, 0.6], [3.8, -0.3], [4.12, -0.1], [4.3, 1.1], [IMPACT, 1.1]],
      'R.lz': [[1.2, 0], [1.6, 0.05], [2.9, 0.1], [3.2, 1.25], [3.45, 1.3], [3.8, 0.45], [4.12, 0.5], [4.35, 0.12], [IMPACT, 0]],
      'R.lp': [[1.2, 0], [1.6, 45], [2.9, 40], [3.3, 5], [3.8, 45], [4.2, 0]],
      'L.free': [[1.24, 0], [1.34, 1], [IMPACT - 0.01, 1], [IMPACT + 0.09, 0]],
      'L.lx': [[1.2, 0.26], [1.6, 0.05], [3.1, 0.15], [4.2, 0.05]],
      'L.ly': [[1.2, 0.2], [1.6, -0.05], [3.1, -0.55], [3.45, -0.6], [3.8, -0.9], [4.3, -1.3], [IMPACT, -1.3]],
      'L.lz': [[1.2, 0], [1.6, 0.1], [2.9, 0.15], [3.2, 0.2], [3.45, 0.22], [3.8, 0.55], [4.1, 0.5], [4.35, 0.2], [IMPACT, 0]],
      'L.lp': [[1.2, 0], [1.6, 50], [2.9, 45], [3.3, 55], [3.8, 50], [4.2, 55], [IMPACT, 70]],
      'L.heel': [[IMPACT, 0], [4.56, 72], [5.8, 72], [6.2, 10], [6.5, 0]],
      'R.heel': [[1.2, 0], [1.3, 30], [1.4, 0]],

      advance: [[1.3, 0], [1.6, 0.6], [2.4, 3.5], [3.3, 6.8], [3.9, 9.4], [IMPACT, LANDING]],
      // up like a rocket, a hang at the top, then down hard: the last key sits a frame before the ground
      air: [[1.3, 0], [1.38, 0.5], [1.55, 2.6], [1.8, 7], [2.1, 13.5], [2.4, 19.5], [2.7, 24.5], [3.0, 27.5], [3.3, 28.6], [3.55, 28.3], [3.8, 25.5], [4.0, 20], [4.2, 12], [4.33, 5.6], [4.42, 1.2], [IMPACT, 0]],
    },
    steps: [
      { side: 'L', t0: 0.55, t1: 0.8, to: [0.85, 0.2], yaw: 6, lift: 0.22 },
      { side: 'R', t0: 0.62, t1: 0.88, to: [-0.85, -0.15], yaw: -6, lift: 0.22 },
      // the kneeling foot comes forward, then the front foot draws back under the body
      { side: 'L', t0: 6.0, t1: 6.45, to: [0.59, LANDING], yaw: 0, lift: 0.35 },
      { side: 'R', t0: 6.55, t1: 6.95, to: [-0.59, LANDING], yaw: 0, lift: 0.2 },
    ],
    cues: [
      { t: 0.02, cue: 'servo', value: 0.5 },
      { t: 0.1, cue: 'visor', value: 1 },
      { t: 0.3, cue: 'weapon-in', value: 0.45 },
      { t: 0.55, cue: 'servo', value: 0.55 },
      { t: 0.72, cue: 'lift', value: 0.45 },
      { t: 0.72, cue: 'shake', value: 0.3 },
      { t: 0.95, cue: 'charge', value: 0.3 },
      { t: 1.18, cue: 'lift', value: 1.35 },
      { t: 1.2, cue: 'punch', value: 8 },
      { t: 1.26, cue: 'launch', value: 1 },
      { t: 1.28, cue: 'shake', value: 0.85 },
      { t: 2.4, cue: 'servo', value: 0.4 },
      { t: 2.85, cue: 'lift', value: 0 },
      { t: 2.9, cue: 'hush', value: 0.65 },
      { t: 2.95, cue: 'charge', value: 1 },
      { t: 3.5, cue: 'hush', value: 0 },
      { t: 3.55, cue: 'dive', value: 1.45 },
      { t: 3.56, cue: 'kick', value: 0.35 },
      { t: 3.6, cue: 'trail', value: 1 },
      { t: 4.4, cue: 'dive', value: 0 },
      { t: IMPACT, cue: 'trail', value: 0 },
      { t: IMPACT, cue: 'impact', value: 1 },
      { t: 4.6, cue: 'charge', value: 0 },
      { t: 5.7, cue: 'servo', value: 0.6 },
      { t: 6.3, cue: 'servo', value: 0.4 },
      { t: 6.8, cue: 'weapon-out', value: 0.5 },
      { t: 6.9, cue: 'visor', value: 0 },
    ],
  },
  shots: [
    // the face, lit by the visor, looking up
    { at: 0, eyeFrame: 'head', eye: [[0, -1.9, 2.7, 0.55], [0.55, -1.5, 2.3, 0.45]], lookFrame: 'head', look: [[0, 0, 0.15, 0.4], [0.55, 0, 0.1, 0.45]], fov: [[0, 34], [0.55, 30]] },
    // low and wide off the front: the load, the jets lighting, the sand blown flat
    { at: 0.55, eye: [[0.55, -6.5, 8, 0.6], [1.25, -5.8, 7, 0.35]], lookFrame: 'body', look: [[0.55, 0, 0.2, 0.6], [1.25, 0, 0.3, 0.9]], fov: [[0.55, 46], [1.25, 48]] },
    // from the ground beside it, panning up as it goes, the lens closing in to keep it big
    { at: 1.25, eye: [[1.25, -4.2, -2.6, 0.4], [1.5, -4.4, -2.8, 0.45]], lookFrame: 'body', look: [[1.25, 0, 1.2, 1.4], [1.5, 0, 1, 1.2]], lag: 5, fov: [[1.25, 54], [1.5, 50]] },
    // from well off, outside the dust: it climbs out of its own cloud, the lens closing in to keep it big
    { at: 1.5, eye: [[1.5, -14, -9, 0.6], [2.75, -14.5, -9.5, 0.8]], lookFrame: 'body', look: [[1.5, 0, 0, 1], [2.75, 0, 0, 0.8]], fov: [[1.5, 40], [2.1, 32], [2.75, 26]] },
    // at the top, from below: hanging against the sky, the axe raised, slowly circling
    { at: 2.75, eyeFrame: 'body', eye: [[2.75, 6, 4, -5.5], [3.55, 3.2, 6, -3.4]], lookFrame: 'body', look: [[2.75, 0, 0, 1.6], [3.55, 0, 0.4, 1.2]], fov: [[2.75, 44], [3.55, 40]], roll: [[2.75, -5], [3.55, 4]] },
    // well off to the side: a streak of plasma and smoke drawn down the sky
    { at: 3.55, eye: [[3.55, 26, 9, 1.5], [4.05, 25, 10, 1.2]], lookFrame: 'body', look: [[3.55, 0, 0, -1], [4.05, 0, 0, -1]], lag: 7, fov: [[3.55, 34], [4.05, 40]] },
    // alongside the dive, the ground rushing up
    { at: 4.05, eyeFrame: 'body', eye: [[4.05, -5.5, -3, 1.5], [4.42, -4.8, -3, 0.5]], lookFrame: 'body', look: [[4.05, 0, 1.5, -1.5], [4.42, 0, 1.5, -1]], fov: [[4.05, 56], [4.42, 60]], roll: [[4.05, -8], [4.42, 4]] },
    // the impact, wide and low as the wave and the surge roll out
    { at: IMPACT, eye: [[IMPACT, -9.5, 21.5, 3.4], [5.9, -8, 19.5, 3.8]], look: [[IMPACT, 0, 13.2, 1.2], [5.9, 0, 12.8, 1.4]], fov: [[IMPACT, 52], [5.9, 48]] },
    // low off its right as it rises out of the glass, swinging round toward its side
    { at: 5.9, eye: [[5.9, -5, 20.5, 0.9], [6.9, -7.5, 17.5, 1.8]], lookFrame: 'head', look: [[5.9, 0, 0, -1], [6.9, 0, 0, -0.8]], fov: [[5.9, 46], [6.9, 44]] },
  ],
}
