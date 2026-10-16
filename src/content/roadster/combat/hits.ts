import type { BlastHit, CombatHits, StrikeHit } from '../../transformer/combat/hits'
import { FIELD_AHEAD, ROADSTER_MOVES, ROADSTER_TIMES } from './moves'
import { WHITEOUT_HITS } from './special'

/**
 * What the Roadster's cannons do to the soldiers (combat/hits.ts). The palm
 * blasts are short cones of shocked air: a small area at the front, thrown
 * back off their feet. The arc storm's pulses catch everything in the front
 * half circle and hold it seizing a little past the next pulse (`shock`);
 * the last, heaviest pulse throws them. The singularity's field draws
 * everything within seventeen metres in toward the point before the fist,
 * blow after blow as they are crushed together, and its burst throws
 * everything round the robot outward.
 *
 * No blow sounds from the soldiers' side (`blowSound` none throughout): the
 * cannons' own blasts, discharges and the field are the Roadster's blows.
 */
const move = (i: number): number => ROADSTER_MOVES.moves[i].strike!

/** The arc storm's pulses: every soldier in the front half circle, seizing until just past the next pulse. */
const pulses: StrikeHit[] = ROADSTER_TIMES.pulses.map((t) => ({
  t, kind: 'blast', blowSound: 'none', reach: 11.5, arc: 180, damage: 13, knock: 1.2, lift: 0, outward: true, bite: false, shock: 0.32,
}))

/** The field crushing the crowd together: a blow every FIELD_BEAT at its centre while it holds. */
const FIELD_BEAT = 0.15
const crush: BlastHit[] = []
for (let t = ROADSTER_TIMES.field.on + 0.2; t < ROADSTER_TIMES.field.off - 0.05; t += FIELD_BEAT) {
  crush.push({ t, kind: 'blunt', blowSound: 'none', at: [0, FIELD_AHEAD], radius: 5.5, damage: 9, knock: 0.3, lift: 0.2 })
}

export const ROADSTER_HITS: CombatHits = {
  moves: [
    { strikes: [{ t: move(0), kind: 'blast', blowSound: 'none', reach: 8, arc: 60, damage: 55, knock: 12, lift: 1.4 }] },
    { strikes: [{ t: move(1), kind: 'blast', blowSound: 'none', reach: 8.5, arc: 70, aim: 4, damage: 62, knock: 13, lift: 1.6 }] },
    {
      strikes: [
        ...pulses,
        { t: ROADSTER_TIMES.stormFinal, kind: 'blast', blowSound: 'none', reach: 12.5, arc: 180, damage: 45, knock: 10, lift: 2.4, outward: true, shock: 0.45 },
      ],
    },
    {
      pulls: [{ t0: ROADSTER_TIMES.field.on, t1: ROADSTER_TIMES.field.off, at: [0, FIELD_AHEAD], radius: 17, speed: 10 }],
      blasts: crush,
      strikes: [{ t: ROADSTER_TIMES.release, kind: 'blast', blowSound: 'none', reach: 19, arc: 360, damage: 190, knock: 26, lift: 7, outward: true }],
    },
  ],
  special: WHITEOUT_HITS,
}
