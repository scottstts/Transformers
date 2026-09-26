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
    { strikes: [{ t: 0.33, kind: 'blunt', reach: 4.3, arc: 100, damage: 60, knock: 9, lift: 0.8 }] },
    { strikes: [{ t: 0.41, kind: 'blunt', reach: 4.4, arc: 150, aim: 12, damage: 65, knock: 10, lift: 1.6 }] },
    { strikes: [{ t: 0.72, kind: 'cut', reach: 5.8, arc: 170, aim: -12, damage: 130, knock: 9, lift: 2.6 }] },
    {
      sweeps: [{ t0: 0.34, t1: 0.88, kind: 'blunt', radius: 3.3, ahead: 1.3, damage: 60, knock: 17, lift: 4 }],
      blasts: [{ t: 1.58, kind: 'blast', at: [0, 10.1], radius: 8.5, damage: 160, knock: 15, lift: 8 }],
    },
  ],
  special: {
    blasts: [
      { t: SKYFALL.launch, kind: 'blast', at: [0, 0], radius: 10, damage: 45, knock: 15, lift: 7 },
      { t: SKYFALL.impact, kind: 'blast', at: [0, SKYFALL.landing], radius: 22, damage: 500, knock: 26, lift: 14 },
    ],
  },
}
