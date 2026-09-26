import type { CombatHits, SweepHit } from '../../transformer/combat/hits'
import { RED_LINE } from './special'

/**
 * What the racer's blows do to the soldiers (combat/hits.ts): quick, light
 * hands, a draw-cut that opens a wide arc, and the ERS dash cutting through
 * everything along its 9 m. Red Line marks every soldier its four cuts pass
 * through and throws the ones its hairpins skid into; at the flick the
 * centre goes up and takes the whole ring with it.
 */
const cuts: SweepHit[] = RED_LINE.cuts.map(([t0, t1]) => ({ t0, t1, kind: 'cut', radius: 2.8, ahead: 0, damage: 70, knock: 4, lift: 1.5 }))
const hairpins: SweepHit[] = RED_LINE.hairpins.map(([t0, t1]) => ({ t0, t1, kind: 'blunt', radius: 2.4, ahead: 0, damage: 30, knock: 13, lift: 3 }))

export const F1_HITS: CombatHits = {
  moves: [
    { strikes: [{ t: 0.2, kind: 'blunt', reach: 3.5, arc: 95, damage: 50, knock: 8, lift: 0.5 }] },
    { strikes: [{ t: 0.4, kind: 'blunt', reach: 4.0, arc: 170, aim: 20, damage: 65, knock: 11.5, lift: 2.6 }] },
    { strikes: [{ t: 0.42, kind: 'cut', reach: 5.0, arc: 180, damage: 130, knock: 8, lift: 2 }] },
    { sweeps: [{ t0: 0.36, t1: 0.68, kind: 'cut', radius: 3.2, ahead: 0.8, damage: 130, knock: 13, lift: 2.6 }] },
  ],
  special: {
    sweeps: [...cuts, ...hairpins],
    blasts: [{ t: RED_LINE.ignite + 0.1, kind: 'blast', at: [0, RED_LINE.center], radius: RED_LINE.radius + 7, damage: 500, knock: 20, lift: 12 }],
  },
}
