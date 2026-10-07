import type { CombatHits, StrikeHit } from '../../transformer/combat/hits'
import { CYCLONE, IMPALA_MOVES } from './moves'
import { THUNDER } from './special'

/**
 * What the Impala's cutlass does to the soldiers (combat/hits.ts). The
 * thrust goes home eight metres out on a narrow line; the swing takes the
 * front; the rising cut throws whatever stands close in front high into the
 * air (about one and a half robot heights); the cyclone's turn cuts the whole
 * front half circle, the bodies still in the air from the rising cut among
 * them, and its landing knocks the nearest down. Every cut bites with the
 * cutlass's own sound (the soldiers' `cutlass` blow).
 *
 * Black Thunder: the leap's rising whirl throws everything within its reach
 * far higher (lift 19: some 20 m) and marks it; the lightning feeding the
 * falling bodies marks them again as it reaches them (a jolt, a flinch on the
 * ground; it never holds them up: they fall as they were thrown, and are down
 * as the cutlass comes out of the sand); the last swing's wave breaks
 * everything all round at once. The lightning's own crack is its sound, so
 * its strikes make none from the soldiers' side.
 */
const move = (i: number): number => IMPALA_MOVES.moves[i].strike!

/** The lightning's strikes on whatever it reaches, ground and air, every THUNDER.beat over its window. */
const lightning: StrikeHit[] = []
for (let t = THUNDER.lightning[0] + 0.2; t <= THUNDER.lightning[1]; t += THUNDER.beat) {
  lightning.push({ t, kind: 'blast', blowSound: 'none', reach: THUNDER.reach, arc: 360, damage: 14, knock: 0.6, lift: 0, outward: true, bite: false })
}

export const IMPALA_HITS: CombatHits = {
  moves: [
    { strikes: [{ t: move(0), kind: 'cut', blowSound: 'cutlass', reach: 7.8, arc: 34, damage: 55, knock: 8, lift: 0.6 }] },
    { strikes: [{ t: move(1), kind: 'cut', blowSound: 'cutlass', reach: 7.4, arc: 150, aim: -12, damage: 60, knock: 10, lift: 1.4 }] },
    { strikes: [{ t: move(2), kind: 'cut', blowSound: 'cutlass', reach: 6.6, arc: 100, damage: 65, knock: 3, lift: 10.5 }] },
    {
      strikes: [{ t: CYCLONE.strike, kind: 'cut', blowSound: 'cutlass', reach: 11.5, arc: 200, damage: 190, knock: 15, lift: 5, outward: true }],
      blasts: [{ t: CYCLONE.land, kind: 'blunt', at: [0, 5.6], radius: 4.5, damage: 20, knock: 7, lift: 1.4 }],
    },
  ],
  special: {
    strikes: [
      { t: THUNDER.whirl, kind: 'cut', blowSound: 'cutlass', reach: THUNDER.reach, arc: 360, damage: 60, knock: 2, lift: 19, outward: true },
      ...lightning,
      { t: THUNDER.finale, kind: 'cut', blowSound: 'cutlass', reach: THUNDER.reach + 6, arc: 360, damage: 520, knock: 26, lift: 7, outward: true },
    ],
  },
}
