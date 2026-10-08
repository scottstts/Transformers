import type { CombatHits, StrikeHit } from '../../transformer/combat/hits'
import { CYCLONE, IMPALA_MOVES } from './moves'
import { THUNDER } from './special'

/**
 * What the Impala's cutlass does to the soldiers (combat/hits.ts). The
 * thrust goes home nine metres out on a narrow line; the cleave takes the
 * front; the rising cut throws everything in the front half circle high into
 * the air (about one and a half robot heights); the cyclone's turn cuts all
 * round it, the bodies still in the air from the rising cut among them, and
 * its landing knocks the nearest down. Reaches follow the 4.3 m blade. Every cut bites with the
 * cutlass's own sound (the soldiers' `cutlass` blow).
 *
 * Black Thunder: the charge bowls through everything in its path (a heavy
 * blunt blow every tenth of a second over the front, thrown out of its way
 * and a little up); the landing's rising cut throws everything within its reach
 * far higher (lift 16: some 14 m) and marks it; the lightning reaches them
 * still rising and holds them there (`shock`: each strike keeps a body in
 * the air seizing a little past the next; a flinch on the ground), and as it
 * dies they are let go and thrown down, landing as the cutlass is torn out
 * of the sand; the last swing's wave breaks
 * everything all round at once. The lightning's own crack is its sound, so
 * its strikes make none from the soldiers' side.
 */
const move = (i: number): number => IMPALA_MOVES.moves[i].strike!

/** The charge's blows on whatever is in its path, every CHARGE_BEAT over its run. */
const CHARGE_BEAT = 0.1
const charge: StrikeHit[] = []
for (let t = THUNDER.charge[0] + 0.05; t <= THUNDER.charge[1] + 0.1; t += CHARGE_BEAT) {
  charge.push({ t, kind: 'blunt', blowSound: 'heavy', reach: 6.5, arc: 220, damage: 25, knock: 11, lift: 3.5, outward: true, bite: false })
}

/** The lightning's strikes on whatever it reaches, ground and air, every THUNDER.beat over its window. */
const lightning: StrikeHit[] = []
for (let t = THUNDER.lightning[0] + 0.12; t <= THUNDER.lightning[1] - THUNDER.shock; t += THUNDER.beat) {
  lightning.push({ t, kind: 'blast', blowSound: 'none', reach: THUNDER.reach, arc: 360, damage: 14, knock: 0.6, lift: 0, outward: true, bite: false, shock: THUNDER.shock })
}

export const IMPALA_HITS: CombatHits = {
  moves: [
    { strikes: [{ t: move(0), kind: 'cut', blowSound: 'cutlass', reach: 9.4, arc: 40, damage: 55, knock: 13, lift: 1.2 }] },
    { strikes: [{ t: move(1), kind: 'cut', blowSound: 'cutlass', reach: 9, arc: 160, aim: -12, damage: 60, knock: 14, lift: 2 }] },
    { strikes: [{ t: move(2), kind: 'cut', blowSound: 'cutlass', reach: 10, arc: 190, damage: 65, knock: 3, lift: 12 }] },
    {
      strikes: [{ t: CYCLONE.strike, kind: 'cut', blowSound: 'cutlass', reach: 13, arc: 360, damage: 190, knock: 20, lift: 5, outward: true }],
      blasts: [{ t: CYCLONE.land, kind: 'blunt', at: [0, 5.8], radius: 6, damage: 20, knock: 9, lift: 1.6 }],
    },
  ],
  special: {
    strikes: [
      ...charge,
      { t: THUNDER.flip, kind: 'cut', blowSound: 'cutlass', reach: THUNDER.reach, arc: 360, damage: 60, knock: 2, lift: 16, outward: true },
      ...lightning,
      { t: THUNDER.finale, kind: 'cut', blowSound: 'cutlass', reach: THUNDER.reach + 6, arc: 360, damage: 520, knock: 26, lift: 7, outward: true },
    ],
  },
}
