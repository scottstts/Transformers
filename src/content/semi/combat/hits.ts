import type { CombatHits, StrikeHit } from '../../transformer/combat/hits'
import { CANNON_LANDS, SWEEP_FIRE_WINDOW } from './moves'
import { JUGGERNAUT } from './special'

/**
 * What the Semi's blows do to the soldiers (combat/hits.ts). The kicks land
 * three to six metres out and shove hard (the side kick throws); the machine
 * gun's sweep hits every soldier in the half circle ahead (22 m) round by
 * round, and the cannon's blast every soldier in the half circle ahead
 * (20 m). The sweep pushes them straight back from the robot, out along the
 * arc; the cannon throws them as any blow does. The first three leave a soldier standing (55 + 70 + 11 x 11 =
 * 246), the cannon takes it down.
 *
 * Juggernaut: it walks in untouched; the stamp throws everything round it into the air, the barrage keeps it there
 * (each of its strikes re-launches a falling body; spaced so they hang rather
 * than climb), two airbursts rock it and the finale's burst breaks
 * everything at once.
 */

/** The sweep's strikes: every 0.1 s of its firing window, the whole half circle ahead (the sweep covers it). */
function sweep(): StrikeHit[] {
  const out: StrikeHit[] = []
  for (let t = SWEEP_FIRE_WINDOW[0] + 0.02; t <= SWEEP_FIRE_WINDOW[1] + 1e-6; t += 0.1) {
    out.push({ t: Math.round(t * 1000) / 1000, kind: 'blunt', reach: 22, arc: 180, damage: 11, knock: 1.5, lift: 0.4, outward: true })
  }
  return out
}

/** The barrage: every 0.45 s, everything round the robot (it turns a full circle), each re-launching whoever it catches. */
function barrage(): StrikeHit[] {
  const out: StrikeHit[] = []
  for (let t = JUGGERNAUT.barrage[0] + 0.05; t <= JUGGERNAUT.barrage[1]; t += 0.45) {
    out.push({ t: Math.round(t * 1000) / 1000, kind: 'blunt', reach: 30, arc: 360, damage: 25, knock: 1, lift: 5.5 })
  }
  return out
}

export const SEMI_HITS: CombatHits = {
  moves: [
    { strikes: [{ t: 0.38, kind: 'blunt', reach: 5.2, arc: 70, damage: 55, knock: 10, lift: 1.2 }] },
    { strikes: [{ t: 0.5, kind: 'blunt', reach: 5.8, arc: 130, damage: 70, knock: 13.5, lift: 3.2 }] },
    { strikes: sweep() },
    // the whole half circle ahead: the slug's burst (10 m out) and its blast wave
    { strikes: [{ t: CANNON_LANDS, kind: 'blast', reach: 20, arc: 180, damage: 200, knock: 15, lift: 9 }] },
  ],
  special: {
    strikes: barrage(),
    blasts: [
      // the stamp: straight up, everything round it
      { t: JUGGERNAUT.stomp, kind: 'blast', at: [0, JUGGERNAUT.stop], radius: JUGGERNAUT.quake, damage: 60, knock: 2, lift: 15 },
      ...JUGGERNAUT.bursts.map((t) => ({ t: t + 0.06, kind: 'blast' as const, at: [0, JUGGERNAUT.stop] as const, radius: JUGGERNAUT.quake, damage: 40, knock: 1.5, lift: 6 })),
      { t: JUGGERNAUT.finale + 0.07, kind: 'blast', at: [0, JUGGERNAUT.stop], radius: JUGGERNAUT.quake + 6, damage: 500, knock: 18, lift: 10 },
    ],
  },
}
