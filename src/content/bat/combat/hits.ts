import type { CombatHits, StrikeHit } from '../../transformer/combat/hits'
import { FLURRY_HOME, FLURRY_LAST, MAELSTROM, VORTEX } from './moves'
import { DESCENT } from './special'

/**
 * What the Bat's spear does to the soldiers (combat/hits.ts). It reaches:
 * the thrust goes home five metres out, the sweep takes a wide arc ahead.
 * The flurry hits everything in the front half circle over and over, too
 * fast for hit-stops (a dozen light blows, then the heavy last). The
 * maelstrom's spin draws everything within 17 m in toward the front before
 * the great sweep throws it all back out. Descent's circling cuts mark what
 * the vortex holds, and the spear driven into the ground where it drew them
 * breaks everything within twenty metres.
 */
const flurry: StrikeHit[] = FLURRY_HOME.map((t) => ({ t, kind: 'cut', reach: 7, arc: 180, damage: 9, knock: 1.2, lift: 0.3, outward: true, bite: false }))

/** Round the ring the spear is out to the right, toward the centre: a cut every CUT_BEAT through what the vortex holds there, swept on round with the body. */
const CUT_BEAT = 0.14
const circling: StrikeHit[] = DESCENT.cuts.flatMap(([t0, t1]) => {
  const out: StrikeHit[] = []
  for (let t = t0; t <= t1; t += CUT_BEAT) out.push({ t, kind: 'cut', reach: DESCENT.radius + 2, arc: 60, aim: -90, damage: 16, knock: 3.5, lift: 1, bite: false })
  return out
})

export const BAT_HITS: CombatHits = {
  moves: [
    { strikes: [{ t: 0.36, kind: 'cut', blowSound: 'slash', reach: 5.6, arc: 70, damage: 55, knock: 9, lift: 0.8 }] },
    { strikes: [{ t: 0.46, kind: 'cut', reach: 5.8, arc: 190, aim: 10, damage: 65, knock: 10, lift: 1.8 }] },
    { strikes: [...flurry, { t: FLURRY_LAST, kind: 'cut', blowSound: 'heavy', reach: 7.4, arc: 90, damage: 30, knock: 11, lift: 1.4 }] },
    {
      pulls: [{ t0: MAELSTROM.spin[0], t1: MAELSTROM.spin[1] + 0.3, ahead: VORTEX.ahead, radius: VORTEX.radius, speed: VORTEX.speed }],
      strikes: [{ t: MAELSTROM.strike, kind: 'cut', blowSound: 'heavy', reach: 8.6, arc: 250, damage: 190, knock: 18, lift: 5.5, outward: true }],
    },
  ],
  special: {
    pulls: [{ t0: DESCENT.circle[0], t1: DESCENT.plunge - 0.2, at: [0, DESCENT.center], radius: DESCENT.pull, speed: 9 }],
    strikes: circling,
    blasts: [{ t: DESCENT.plunge, kind: 'blast', at: [0, DESCENT.center], radius: 20, damage: 520, knock: 24, lift: 13 }],
  },
}
