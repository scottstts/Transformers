import type { CombatHits } from '../../transformer/combat/hits'
import { SKYFALL } from './special'

/**
 * What the truck robot's blows do to the soldiers (combat/hits.ts). Its
 * fists land two to three metres ahead of its standing point; the axe reaches
 * further and cuts through; the thruster charge ploughs through anything in
 * its path and the slam at the end of it throws the rest. Skyfall's launch
 * blows the ring round it flat, and the impact 12 m ahead levels everything
 * within twenty metres.
 */
export const CYBERTRUCK_HITS: CombatHits = {
  moves: [
    { strikes: [{ t: 0.33, kind: 'blunt', reach: 3.7, arc: 70, damage: 45, knock: 7.5, lift: 0.6 }] },
    { strikes: [{ t: 0.41, kind: 'blunt', reach: 3.7, arc: 110, aim: 12, damage: 55, knock: 8.5, lift: 1.2 }] },
    { strikes: [{ t: 0.72, kind: 'cut', reach: 5.0, arc: 125, aim: -12, damage: 110, knock: 6, lift: 1.5 }] },
    {
      sweeps: [{ t0: 0.34, t1: 0.88, kind: 'blunt', radius: 2.7, ahead: 1.3, damage: 45, knock: 14, lift: 3.5 }],
      blasts: [{ t: 1.58, kind: 'blast', at: [0, 10.1], radius: 6.5, damage: 140, knock: 13, lift: 7 }],
    },
  ],
  special: {
    blasts: [
      { t: SKYFALL.launch, kind: 'blast', at: [0, 0], radius: 10, damage: 45, knock: 15, lift: 7 },
      { t: SKYFALL.impact, kind: 'blast', at: [0, SKYFALL.landing], radius: 22, damage: 500, knock: 26, lift: 14 },
    ],
  },
}
