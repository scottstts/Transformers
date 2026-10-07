import type { SoldierManifest } from '../../content/soldier/asset'
import type { CommanderCue } from '../../content/commander/moves'
import { CommanderAudio } from '../../content/commander/audio'
import type { AudioMix } from '../../audio/mix'
import type { Citadel, Sector, Spawn } from '../../worlds/desert/citadel'
import { insidePolygon } from '../../worlds/desert/citadel/polygon'
import { pushOut, type Contact } from '../collide'
import { CALL_OFF } from './garrison'
import { wrap } from '../math'
import { Commander, COMMANDER } from './commander'
import { DEBRIS_FADE, DEBRIS_LIE } from './debris'
import { CitadelNav, approach, waypoint } from './navigation'
import { ATTACK_WINDOW, ENGAGE_GAP, SLASH_REACH } from './engage'
import { SwingTrail } from '../../content/transformer/combat/fx/trail'
import { Vector3 } from 'three/webgpu'
import type { EnemyTarget } from './horde'

/** Seconds from its destruction until the next commander rolls out. */
export const COMMANDER_RESPAWN = 30
/**
 * The share of the way round toward the robot's front it keeps (it fights
 * where the player sees it). Its distances are the soldiers' (engage.ts:
 * where the ring stands, when they swing, how far a slash reaches, all
 * between the two bodies) scaled by its height over theirs.
 */
const FRONT_BIAS = 0.45
/** Its lance's reach over a soldier's blade, beyond their bodies' ratio: its distances are the soldiers' scaled by its size, then this. */
const RANGE = 1.4
/** It rolls a combo once facing the robot within this (rad). */
const ATTACK_FACING = 0.6
/** The combo's length, rolled as it starts: the pair (moves 1-2), or the whole combo (1-4) one time in three. */
export const FULL_COMBO_CHANCE = 1 / 3
/** Its lance's trail: crimson, lingering a little (the whirl leaves a ring of it), from this far along the lance to its tip (m, weapon frame). */
const TRAIL = { color: [1.3, 0.05, 0.08] as [number, number, number], life: 0.2, speed: 11, tip: 0.35 }
const TRAIL_BASE = 1.45
const TRAIL_TIP = 2.68
/** Between its combos (s, plus up to COOLDOWN_SPREAD), and before its first once it reaches the fight. */
const COOLDOWN = 0.7
const COOLDOWN_SPREAD = 0.6
const FIRST_COMBO = 0.4
/** At peace it walks the parade ground: a ring of points this share of the yard's radius out, at this speed (m/s), pausing (s). */
const BEAT_RING = 0.35
const BEAT_POINTS = 5
const PATROL_SPEED = 1.6
const PATROL_PAUSE: readonly [number, number] = [2.5, 5]

/** The combo length for a roll `u` in [0, 1): moves 1-2, or 1-2-3-4. */
export function comboLength(u: number): number {
  return u < FULL_COMBO_CHANCE ? 4 : 2
}

/**
 * A district's commander and its post: every district has one, and one lives
 * at a time in each.
 *
 * At peace it walks its yard, the lance at the slope. It fights only in its
 * own district: while its district's garrison is alerted and the robot is in
 * the district (or left it under CALL_OFF ago, so a body stepping through a
 * gate doesn't flicker it) it lights the lance, levels it and makes for the
 * robot; otherwise it stands down and goes back to its yard. It never
 * follows the fight into a neighbouring district, so a fight meets one
 * commander at a time. In the fight it makes for a
 * stand-off toward the robot's front and holds its side once in reach,
 * strafing to keep the distance with its lance on the robot; in reach and
 * facing it rolls a combo: moves 1-2, or the whole combo (its fourth move
 * knocks the robot back) one time in three. After a combo it waits COOLDOWN.
 *
 * Destroyed, it breaks apart like a soldier; COMMANDER_RESPAWN seconds later
 * the next rolls out of its district's spawn bay.
 */
export class CommanderPost {
  readonly unit: Commander
  /** its lance's trail (drawn with the horde) */
  readonly trail = new SwingTrail(TRAIL)
  /** a move's effect cue (the horde shows it: sparks, sand, the ground split) */
  onEffect: ((cue: CommanderCue, post: CommanderPost) => void) | null = null
  /** the gap between the bodies it holds, swings from and its blows reach across (m) */
  readonly stand: number
  readonly attackGap: number
  readonly reachGap: number
  readonly citadel: Citadel
  readonly audio: CommanderAudio
  private readonly nav: CitadelNav
  /** its home district */
  readonly home: Sector
  private readonly door: Spawn | null
  /** its walk round the yard at peace (world points, clear of the scenery, on the yard's floor) */
  readonly beats: Array<{ x: number; z: number }>
  private alert = false
  /** the horde's clock when the robot was last in its district */
  private seen = -Infinity
  /** seconds until the next one rolls out, while none lives */
  private respawn = 0
  private nextCombo = 0
  private wasFighting = false
  private readonly beat = { k: -1, wait: 0, look: 0 }
  private listener = { x: 0, y: 0, z: 0 }
  private serial = 0

  /** `nav`: way-finding at its radius (shared by every post); `scale`: its height over a soldier's */
  constructor(citadel: Citadel, nav: CitadelNav, home: Sector, manifest: SoldierManifest, mix: AudioMix, scale: number) {
    this.citadel = citadel
    this.stand = ENGAGE_GAP * scale * RANGE
    this.attackGap = (ENGAGE_GAP + ATTACK_WINDOW) * scale * RANGE
    this.reachGap = SLASH_REACH * scale * RANGE
    this.nav = nav
    this.home = home
    this.door = citadel.plan.spawns.find((s) => s.sector === home.index) ?? null
    this.beats = beatPoints(citadel, home)
    this.unit = new Commander(manifest)
    this.unit.onCue = (cue) => this.cue(cue)
    this.audio = new CommanderAudio(mix)
    // the first stands in its yard facing the main gate
    const p = citadel.toWorld(home.yard.at[0], home.yard.at[1])
    this.unit.reset(p.x, p.z, citadel.plan.site.yaw, this.serial++, citadel.floorAt(p.x, p.z))
    this.unit.sector = home.index
  }

  /**
   * Per step: `garrisonAlert` while its district's garrison fights, `clock`
   * the horde's; `listener` the camera (for its sound).
   */
  update(dt: number, clock: number, t: EnemyTarget, targetSector: number, garrisonAlert: boolean, listener: { x: number; y: number; z: number }): void {
    this.listener = listener
    if (targetSector === this.home.index) this.seen = clock
    const alert = garrisonAlert && clock - this.seen <= CALL_OFF
    const u = this.unit
    if (!u.alive) {
      // its trail goes with it (and the next one's never stretches back to where this one fell)
      this.trail.reset()
      this.decay(dt)
      this.audio.update(0, this.distance())
      return
    }
    u.sector = this.citadel.sector(u.x, u.z)
    if (alert && !this.alert) this.nextCombo = Math.max(this.nextCombo, clock + FIRST_COMBO)
    if (!alert && this.alert) this.beat.k = -1
    this.alert = alert
    // a combo just ended (or was cut short): the next waits
    const fighting = u.mode === 'attack'
    if (this.wasFighting && !fighting) this.nextCombo = clock + COOLDOWN + Math.random() * COOLDOWN_SPREAD
    this.wasFighting = fighting
    if (u.leaving) {
      if (Math.hypot(u.goal.x - u.x, u.goal.z - u.z) < 2.5 || !u.free) u.leaving = false
    } else if (alert) this.engage(t, targetSector, clock)
    else this.patrol(clock)
    u.update(dt)
    this.lanceTrail(dt)
    this.audio.update(u.mode === 'down' || u.airborne ? 0 : Math.hypot(u.vx, u.vz), this.distance())
  }

  /** At the fight: round to its stand-off toward the robot's front, through the gates if need be; a combo when in reach. */
  private engage(t: EnemyTarget, targetSector: number, clock: number): void {
    const u = this.unit
    u.goal.ready = true
    u.goal.drive = true
    const dx = t.x - u.x, dz = t.z - u.z
    const d = Math.hypot(dx, dz)
    const bearing = Math.atan2(dx, dz)
    u.aim = bearing
    const gap = d - t.radius - COMMANDER.radius
    u.gap = gap
    u.goal.face = bearing
    if (waypoint(this.citadel, this.nav, u.x, u.z, u.sector, targetSector, _w)) {
      u.goal.x = _w.x
      u.goal.z = _w.z
      u.goal.face = Math.atan2(_w.x - u.x, _w.z - u.z)
      u.goal.speed = COMMANDER.chargeSpeed
      return
    }
    const stand = Math.max(t.radius + this.stand, t.guard + this.stand * 0.3) + COMMANDER.radius
    const around = d > 1e-3 ? Math.atan2(-dx, -dz) : t.heading
    // in reach it holds its side of the robot and only keeps the distance (circling for a better one kept it from fighting); out of it, it comes round toward the robot's front
    const inReach = gap <= this.attackGap && gap >= this.stand * 0.5
    const a = inReach ? around : around + wrap(t.heading - around) * FRONT_BIAS
    approach(this.citadel, this.nav, u.x, u.z, t.x + Math.sin(a) * stand, t.z + Math.cos(a) * stand, u.sector, _w)
    u.goal.x = _w.x
    u.goal.z = _w.z
    u.goal.speed = d > stand + 6 ? COMMANDER.chargeSpeed : COMMANDER.engageSpeed
    if (t.present && u.free && clock >= this.nextCombo && gap <= this.attackGap && Math.abs(wrap(bearing - u.yaw)) < ATTACK_FACING) {
      u.fight(comboLength(Math.random()))
    }
  }

  /** At peace: round its yard, stopping to look about; back through the gates first if the fight carried it off. */
  private patrol(clock: number): void {
    const u = this.unit
    const citadel = this.citadel
    u.goal.ready = false
    u.goal.drive = true
    if (waypoint(citadel, this.nav, u.x, u.z, u.sector, this.home.index, _w)) {
      u.goal.x = _w.x
      u.goal.z = _w.z
      u.goal.face = Math.atan2(_w.x - u.x, _w.z - u.z)
      u.goal.speed = COMMANDER.engageSpeed
      return
    }
    const yard = this.home.yard
    const b = this.beat
    const beats = this.beats
    if (!beats.length) return
    const point = (k: number): { x: number; z: number } => beats[k]
    if (b.k < 0) {
      let best = Infinity
      for (let k = 0; k < beats.length; k++) {
        const p = point(k)
        const d = Math.hypot(p.x - u.x, p.z - u.z)
        if (d < best) { best = d; b.k = k }
      }
      b.wait = 0
    }
    const p = point(b.k)
    const d = Math.hypot(p.x - u.x, p.z - u.z)
    if (d > 1.2) {
      approach(citadel, this.nav, u.x, u.z, p.x, p.z, u.sector, _w)
      u.goal.x = _w.x
      u.goal.z = _w.z
      u.goal.face = Math.atan2(_w.x - u.x, _w.z - u.z)
      u.goal.speed = PATROL_SPEED
      return
    }
    u.goal.x = p.x
    u.goal.z = p.z
    u.goal.speed = PATROL_SPEED
    if (b.wait === 0) {
      b.wait = clock + PATROL_PAUSE[0] + Math.random() * (PATROL_PAUSE[1] - PATROL_PAUSE[0])
      // it looks out from the parade ground's middle, over the ground it holds
      const c = citadel.toWorld(yard.at[0], yard.at[1], _c)
      b.look = Math.atan2(p.x - c.x, p.z - c.z) + (Math.random() - 0.5) * 1.2
    }
    u.goal.face = b.look
    if (clock >= b.wait) {
      b.k = (b.k + 1) % beats.length
      b.wait = 0
    }
  }

  /** Its parts lie and burn away; COMMANDER_RESPAWN after it fell, the next rolls out of its district's bay. */
  private decay(dt: number): void {
    const u = this.unit
    const debris = u.debris
    if (debris && debris.age < DEBRIS_LIE + DEBRIS_FADE) {
      debris.update(dt)
      u.dissolve = Math.max(0, Math.min(1, (debris.age - DEBRIS_LIE) / DEBRIS_FADE))
      u.lights = Math.max(0, u.lights - dt * 3)
      u.blade = Math.max(0, u.blade - dt * 4)
      u.heat = Math.max(0, u.heat - dt * 0.35)
    }
    this.respawn -= dt
    if (this.respawn > 0 || (debris && debris.age < DEBRIS_LIE + DEBRIS_FADE)) return
    const door = this.door
    const at = door ? this.citadel.toWorld(door.at[0], door.at[1]) : this.citadel.toWorld(this.home.yard.at[0], this.home.yard.at[1])
    const exit = door ? this.citadel.toWorld(door.exit[0], door.exit[1]) : at
    u.reset(at.x, at.z, Math.atan2(exit.x - at.x, exit.z - at.z) || this.citadel.plan.site.yaw, this.serial++, this.citadel.floorAt(at.x, at.z))
    u.sector = this.home.index
    if (door) {
      u.goal.x = exit.x
      u.goal.z = exit.z
      u.goal.drive = true
      u.goal.speed = COMMANDER.engageSpeed
      u.goal.face = u.yaw
      u.leaving = true
    }
    this.beat.k = -1
  }

  /** It has just been destroyed: the next one comes after COMMANDER_RESPAWN. */
  fell(): void {
    this.respawn = COMMANDER_RESPAWN
  }

  /** It is gone and its parts have burned away (nothing of it to draw). */
  get gone(): boolean {
    const u = this.unit
    return !u.alive && (!u.debris || u.debris.age >= DEBRIS_LIE + DEBRIS_FADE)
  }

  private cue(cue: CommanderCue): void {
    const d = this.distance()
    switch (cue.cue) {
      case 'servo': this.audio.servo(cue.value ?? 0.5, d); return
      case 'poke': case 'slash': this.audio.swing(cue.cue, cue.value ?? 1, d); return
      case 'charge': this.audio.charge(cue.value ?? 1, d); break
      case 'slam': this.audio.slam(cue.value ?? 1, d); break
      case 'whirl': this.audio.slam((cue.value ?? 1) * 0.6, d); break
    }
    this.onEffect?.(cue, this)
  }

  /** The lance's head and tip (world), after the last pose. */
  lance(base: Vector3, tip: Vector3): void {
    const u = this.unit
    u.refresh()
    const m = u.rig.world[u.rig.index.weapon]
    base.set(0, 0, TRAIL_BASE).applyMatrix4(m)
    tip.set(0, 0, TRAIL_TIP).applyMatrix4(m)
  }

  /** The lance leaves its trail through a move's fast arcs (and only then). */
  private lanceTrail(dt: number): void {
    const u = this.unit
    if (!u.alive) {
      this.trail.reset()
      return
    }
    this.lance(_base, _tip)
    this.trail.strength = u.mode === 'attack' ? 1 : 0
    this.trail.update(dt, _base, _tip)
  }

  private distance(): number {
    const u = this.unit, l = this.listener
    return Math.hypot(u.x - l.x, u.floor + 3 - l.y, u.z - l.z)
  }
}

/**
 * Its walk round the yard: BEAT_POINTS on a ring BEAT_RING of the yard's
 * radius out, each pushed clear of the scenery at its radius, and dropped if
 * that takes it off the floor or out of the district (a yard's ring may
 * cross a building). Deterministic.
 */
export function beatPoints(citadel: Citadel, home: Sector): Array<{ x: number; z: number }> {
  const plan = citadel.plan
  const contact: Contact = { nx: 0, nz: 0, depth: 0 }
  const out: Array<{ x: number; z: number }> = []
  const { at, r } = home.yard
  for (let k = 0; k < BEAT_POINTS; k++) {
    const a = (k / BEAT_POINTS) * Math.PI * 2
    const q = { x: at[0] + Math.sin(a) * r * BEAT_RING, z: at[1] + Math.cos(a) * r * BEAT_RING }
    for (let i = 0; i < 4 && pushOut(q, COMMANDER.radius + 0.3, plan.segments, plan.circles, contact); i++) { /* pushed clear */ }
    if (pushOut({ x: q.x, z: q.z }, COMMANDER.radius, plan.segments, plan.circles, contact)) continue
    if (!plan.floor.some((f) => insidePolygon(f.polygon, q.x, q.z))) continue
    const p = citadel.toWorld(q.x, q.z)
    if (citadel.sector(p.x, p.z) !== home.index) continue
    out.push(p)
  }
  return out
}

const _w = { x: 0, z: 0 }
const _base = new Vector3()
const _tip = new Vector3()
const _c = { x: 0, z: 0 }
