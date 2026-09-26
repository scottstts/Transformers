import type { Fort, Sector } from '../../worlds/desert/fort'
import type { Post, Spawn } from '../../worlds/desert/fort/plan'
import { Soldier, SOLDIER } from './soldier'
import { adjacent, approach, waypoint, type FortNav } from './navigation'
import type { EnemyTarget } from './horde'

/** A garrison below this share of its size sends out a wave of reinforcements during a fight. */
const REINFORCE_SHARE = 0.55
/** Seconds between reinforcements during a fight, and while the district refills at peace. */
export const REINFORCE_EVERY = 0.6
const REFILL_EVERY = 3
/** Most alive at once, over the garrison's own size (a wave may overshoot while the dead still lie). */
const OVERSHOOT = 4
/**
 * How long the target may stay out of a garrison's reach before it stands
 * down (s): out of the fortress, or more than one district from its own. A
 * body stepping through a gate's opening should not flicker it.
 */
export const CALL_OFF = 1
/** At peace: rolling speed on a beat (m/s), how near a point counts as there (m), pauses (s) on a patrol and on a sentry's pacing. */
const PATROL_SPEED = 1.8
const PATROL_ARRIVE = 1.0
const PATROL_PAUSE: readonly [number, number] = [0.6, 2.8]
const SENTRY_PAUSE: readonly [number, number] = [2.2, 6]
/** Posts' second rank when a garrison outnumbers its posts (m). */
const RANK = 1.8

/**
 * One district's garrison: its soldiers, the posts and spawn doors of its
 * district (plan.ts), whether it is fighting, and its clocks. Every district
 * of the fortress keeps its own.
 */
export interface Garrison {
  fort: Fort
  /** the fortress's way-finding for a soldier's radius (shared by its garrisons) */
  nav: FortNav
  sector: Sector
  posts: Post[]
  spawns: Spawn[]
  soldiers: Soldier[]
  /** fighting; `calm` counts the time the target has been out of its reach */
  alert: boolean
  calm: number
  /** a wave of reinforcements is rolling out (started below its share, runs until the garrison is whole) */
  wave: boolean
  spawnClock: number
  /** the district's bounding circle in world space (simulation and draw distances) */
  cx: number
  cz: number
  radius: number
}

export function createGarrison(fort: Fort, nav: FortNav, sector: Sector): Garrison {
  const c = fort.toWorld(sector.bounds.at[0], sector.bounds.at[1])
  return {
    fort, nav, sector,
    posts: fort.plan.posts.filter((p) => p.sector === sector.index),
    spawns: fort.plan.spawns.filter((p) => p.sector === sector.index),
    soldiers: [], alert: false, calm: 0, wave: false, spawnClock: 0,
    cx: c.x, cz: c.z, radius: sector.bounds.r,
  }
}

export function aliveIn(g: Garrison): number {
  let n = 0
  for (const s of g.soldiers) if (s.alive) n++
  return n
}

/** Put soldier `s` at post `i` of its district (a second rank behind the first when the posts run out); `clock` the horde's. */
export function station(g: Garrison, s: Soldier, i: number, serial: number, clock: number): void {
  const post = g.posts[i % g.posts.length]
  const rank = Math.floor(i / g.posts.length)
  const p = g.fort.toWorld(post.at[0] + rank * RANK, post.at[1] - rank * RANK, _p)
  s.reset(p.x, p.z, post.yaw + g.fort.plan.site.yaw, serial)
  s.post = i
  s.sector = g.sector.index
  s.nextSwing = clock + 1 + Math.random() * 2
  g.soldiers.push(s)
}

/**
 * Alerted while the target stands in the district; it stays alerted while
 * the target is in the district or the next one over (it follows through
 * the gate), and stands down once the target has been beyond that, or out
 * of the fortress, for CALL_OFF seconds: back to its beats from wherever
 * the fight left it. Returns true on the moment it is alerted.
 */
export function updateAlert(g: Garrison, t: EnemyTarget, targetSector: number, dt: number): boolean {
  const own = g.sector.index
  const inside = targetSector < g.fort.plan.sectors.length
  if (!g.alert) {
    if (!t.present || targetSector !== own) return false
    g.alert = true
    g.calm = 0
    return true
  }
  const reach = inside && adjacent(g.fort, own, targetSector)
  g.calm = reach ? 0 : g.calm + dt
  if (g.calm >= CALL_OFF) {
    g.alert = false
    g.calm = 0
    // back to their beats, each joining its own at the nearest point
    for (const s of g.soldiers) s.beat.k = -1
  }
  return false
}

/**
 * Reinforcements out of the district's spawn doors during a fight: once the
 * garrison is cut below its share a wave rolls out, one at a time, until it
 * is whole again. At peace it slowly refills. Returns the new soldier, if
 * one rolled out this step.
 */
export function reinforce(g: Garrison, dt: number, make: () => Soldier, serial: number, clock: number): Soldier | null {
  const size = g.sector.garrison
  const alive = aliveIn(g)
  g.spawnClock += dt
  if (g.alert && alive < size * REINFORCE_SHARE) g.wave = true
  if (alive >= size || !g.alert) g.wave = false
  const every = g.alert ? REINFORCE_EVERY : REFILL_EVERY
  const want = g.alert ? g.wave : alive < size
  if (!want || !g.spawns.length || alive >= size + OVERSHOOT || g.spawnClock < every || g.soldiers.length >= size + OVERSHOOT + 12) return null
  g.spawnClock = 0
  const door = g.spawns[serial % g.spawns.length]
  const p = g.fort.toWorld(door.at[0], door.at[1])
  const e = g.fort.toWorld(door.exit[0], door.exit[1])
  const s = make()
  s.reset(p.x, p.z, Math.atan2(e.x - p.x, e.z - p.z), serial)
  s.goal.x = e.x
  s.goal.z = e.z
  s.goal.drive = true
  s.goal.speed = SOLDIER.chargeSpeed * 0.7
  s.goal.face = s.yaw
  s.leaving = true
  s.sector = g.sector.index
  // a free post to return to at peace
  let post = 0
  while (g.soldiers.some((k) => k.alive && k.post === post)) post++
  s.post = post
  s.nextSwing = clock + 1.5
  g.soldiers.push(s)
  return s
}

/**
 * At peace a soldier walks its post's beat (plan.ts `Post`): it rolls slowly
 * to each point in turn, stops there a moment and looks about (out over the
 * yard on a patrol loop, along its watch on a sentry's pacing), then goes on;
 * pacing turns back at the end of its two points. A soldier out of its own
 * district (the fight carried it off) first finds its way back through the
 * gates.
 */
export function patrol(g: Garrison, s: Soldier, clock: number): void {
  const fort = g.fort
  const plan = fort.plan
  if (!g.posts.length) return
  const post = g.posts[s.post % g.posts.length]
  const shift = Math.floor(s.post / g.posts.length) * RANK
  s.goal.drive = true
  s.goal.ready = false
  if (waypoint(fort, g.nav, s.x, s.z, s.sector, g.sector.index, _q)) {
    s.goal.x = _q.x
    s.goal.z = _q.z
    s.goal.face = Math.atan2(_q.x - s.x, _q.z - s.z)
    s.goal.speed = SOLDIER.engageSpeed
    return
  }
  const beat = post.beat
  const b = s.beat
  if (b.k < 0) {
    // join the beat at its nearest point
    let k = 0, best = Infinity
    for (let j = 0; j < beat.length; j++) {
      const p = fort.toWorld(beat[j][0] + shift, beat[j][1] - shift, _q)
      const d = Math.hypot(p.x - s.x, p.z - s.z)
      if (d < best) { best = d; k = j }
    }
    b.k = k
    b.wait = 0
  }
  const p = fort.toWorld(beat[b.k][0] + shift, beat[b.k][1] - shift, _q)
  const d = Math.hypot(p.x - s.x, p.z - s.z)
  if (d > PATROL_ARRIVE) {
    approach(fort, g.nav, s.x, s.z, p.x, p.z, s.sector, _r)
    s.goal.x = _r.x
    s.goal.z = _r.z
    s.goal.face = Math.atan2(_r.x - s.x, _r.z - s.z)
    s.goal.speed = PATROL_SPEED
    return
  }
  s.goal.x = p.x
  s.goal.z = p.z
  const pacing = beat.length === 2
  if (b.wait === 0) {
    const [lo, hi] = pacing ? SENTRY_PAUSE : PATROL_PAUSE
    b.wait = clock + lo + Math.random() * (hi - lo)
    // a patrol looks out from its yard's middle, a sentry along its watch
    const y = g.sector.yard.at
    const out = pacing ? post.yaw : Math.atan2(beat[b.k][0] - y[0], beat[b.k][1] - y[1])
    b.look = out + plan.site.yaw + (Math.random() - 0.5) * 1.6
  }
  s.goal.face = b.look
  s.goal.speed = SOLDIER.engageSpeed
  if (clock >= b.wait) {
    b.k = (b.k + 1) % beat.length
    b.wait = 0
  }
}

const _p = { x: 0, z: 0 }
const _q = { x: 0, z: 0 }
const _r = { x: 0, z: 0 }
