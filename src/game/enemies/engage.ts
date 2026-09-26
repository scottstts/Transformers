import type { Fort } from '../../worlds/desert/fort'
import { wrap } from '../math'
import { SOLDIER, type Soldier } from './soldier'
import { approach, waypoint, type FortNav } from './navigation'
import type { EnemyTarget } from './horde'

/** How many may be swinging at once, and how many close in to the ring at all. */
const ATTACKERS = 4
const RING = 9
/** Share of the way round the ring the fighting soldiers move toward the robot's front. */
const FRONT_BIAS = 0.3
/** Distance beyond the robot's body where the ring stands, and the outer holding ring (m). */
const ENGAGE_GAP = 1.55
const HOLD_GAP = 5.0
/** After a blow a soldier doesn't swing back for this long (s): a combo's target reels rather than trades. */
export const REEL = 1.2

/**
 * The fight, across every alerted garrison at once (they share one target):
 * the nearest RING close in on a ring round the robot, leaning toward its
 * front; the rest hold further out, drifting round for an opening; at most
 * ATTACKERS swing at a time. A soldier on the other side of a wall from the
 * robot goes round through the gates (navigation.ts) instead.
 *
 * `fighters` are the standing soldiers of the alerted garrisons (sorted
 * here, near to far); `swinging` those already mid-swing. Calls `swing` for
 * each soldier that starts one.
 */
export function engage(fort: Fort, nav: FortNav, fighters: Soldier[], t: EnemyTarget, targetSector: number, clock: number, swinging: number, swing: (s: Soldier) => void): void {
  for (const s of fighters) s.distance = Math.hypot(s.x - t.x, s.z - t.z)
  fighters.sort((a, b) => a.distance - b.distance)
  const engageR = Math.max(t.radius + ENGAGE_GAP, t.guard + 0.45) + SOLDIER.radius
  let k = 0
  for (const s of fighters) {
    s.goal.ready = true
    s.goal.drive = true
    const bearing = Math.atan2(t.x - s.x, t.z - s.z)
    s.goal.face = bearing
    // round through the gates when the robot is in another district
    if (waypoint(fort, nav, s.x, s.z, s.sector, targetSector, _w)) {
      s.goal.x = _w.x
      s.goal.z = _w.z
      s.goal.face = Math.atan2(_w.x - s.x, _w.z - s.z)
      s.goal.speed = SOLDIER.chargeSpeed
      continue
    }
    const r = k < RING ? engageR : engageR + HOLD_GAP
    const ux = s.distance > 1e-3 ? (s.x - t.x) / s.distance : 1
    const uz = s.distance > 1e-3 ? (s.z - t.z) / s.distance : 0
    // the ring leans round toward the robot's front (they come at it where it can see them);
    // those holding back drift round for an opening
    const around = Math.atan2(ux, uz)
    const front = k < RING ? wrap(t.heading - around) * FRONT_BIAS : Math.sin(clock * 0.4 + s.serial) * 0.5
    const a = around + front
    // round whatever stands between it and its place in the ring
    approach(fort, nav, s.x, s.z, t.x + Math.sin(a) * r, t.z + Math.cos(a) * r, s.sector, _w)
    s.goal.x = _w.x
    s.goal.z = _w.z
    s.goal.speed = s.distance > r + 4 ? SOLDIER.chargeSpeed : SOLDIER.engageSpeed
    // a swing when close, facing it, off cooldown and a token is free
    const close = s.distance < engageR + 0.7
    const facing = Math.abs(wrap(bearing - s.yaw)) < 0.5
    if (k < RING && close && facing && s.free && swinging < ATTACKERS && s.nextSwing < clock) {
      s.attack()
      swinging++
      s.nextSwing = clock + SOLDIER.windup + SOLDIER.strike + SOLDIER.recover + 0.8 + Math.random() * 1.8
      swing(s)
    }
    k++
  }
}

const _w = { x: 0, z: 0 }
