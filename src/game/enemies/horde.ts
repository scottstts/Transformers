import { Frustum, Group, Matrix4, Sphere, Vector3, type PerspectiveCamera } from 'three/webgpu'
import type { SoldierAsset } from '../../content/soldier/asset'
import { HordeRenderer, HORDE_CAPACITY, SHADOW_FAR } from '../../content/soldier/horde-renderer'
import { HealthBars } from '../../content/soldier/health-bars'
import { SoldierAudio } from '../../content/soldier/audio'
import { Sparks } from '../../content/transformer/combat/fx/sparks'
import { Billows } from '../../content/transformer/combat/fx/billows'
import type { HitEvent, PullEvent } from '../../content/transformer/combat/hits'
import type { AudioMix } from '../../audio/mix'
import type { ContactEffects } from '../contact-effects'
import type { Citadel } from '../../worlds/desert/citadel'
import type { Contact } from '../collide'
import { wrap } from '../math'
import { Soldier, SOLDIER, type SoldierImpact } from './soldier'
import { COMMANDER } from './commander'
import { CommanderPost } from './commander-post'
import { createCommanderMaterials } from '../../content/commander/materials'
import { enemyHeld, enemyReacts } from '../combat/contract'
import type { CommanderCue } from '../../content/commander/moves'
import { Debris, DEBRIS_FADE, DEBRIS_LIE } from './debris'
import { aliveIn, createGarrison, patrol, reinforce, station, updateAlert, type Garrison } from './garrison'
import { engage, REEL, SLASH_REACH } from './engage'
import { CitadelNav } from './navigation'
import { throwVariation } from './toss'

/** The slash's cone (rad) either side of the soldier's heading (its reach is engage.ts's). */
const SLASH_CONE = 1.05
/**
 * Bodies whose floors differ by more than this (m) are on different levels
 * of the citadel: blows, slashes, vacuums, aim assist and body contact pass
 * between them only on the same level (a ramp's slope stays within it). On
 * one level this is everything, as before.
 */
export const LEVEL_REACH = 2.5
/**
 * Simulation rates by a district's distance from the camera (m, from its
 * bounds): every frame near (or fighting), every other frame across the
 * citadel, every sixth beyond; nothing past DRAW_FAR.
 */
const SIM_NEAR = 90
const SIM_MID = 200
const DRAW_FAR = 460
/** A soldier's body for a ray (the gun's rounds): a sphere this big about this height over its feet (m). */
const BODY_RADIUS = 1.1
const BODY_HEIGHT = 1.6
/** How far a soldier's shadow can reach from it across the sand (m): a 3 m body under a sun 25 degrees up. */
const SHADOW_REACH = 7
/** Health bars: drawn within BAR_FAR m, fading out from BAR_FADE; their anchor above the head bone (m). */
const BAR_FAR = 62
const BAR_FADE = 46
const BAR_LIFT = 0.78
/** A hit's flash on the bar (s). */
const BAR_FLASH = 0.18
/** The commander's bar: its size over a soldier's, and its anchor above the head bone (m). */
const COMMANDER_BAR = 1.7
const COMMANDER_BAR_LIFT = 1.15
/** The commander's detail tiers (m): it stands 2.3 times a soldier's height, so it keeps its detail that much further out. */
const COMMANDER_LOD = [60, 160] as const
/** The commander's draw sphere (m, alive and in pieces) and how far its shadow reaches across the sand (m). */
const COMMANDER_SPHERE = [4.2, 9] as const
const COMMANDER_SHADOW_REACH = 15
/** The commander's body for a ray: a sphere this big about this height (m). */
const COMMANDER_BODY_RADIUS = 2.2
const COMMANDER_BODY_HEIGHT = 3.8
/**
 * The robot and the commander push each other apart: the share of their
 * overlap the commander gives (the rest moves the robot, `shove`), and its
 * blows' height on the robot (share of the robot's height, at most).
 */
const COMMANDER_YIELD = 0.6
/** Its blade stops on a raised shield this share of its reach past it, as a soldier's does (1.2 of its 2.1 m). */
const GUARD_REACH = 0.57
const COMMANDER_BLOW_HEIGHT = 0.62

/** What the soldiers fight: the player's body on the ground this frame. */
export interface EnemyTarget {
  x: number
  z: number
  /** body radius (m) */
  radius: number
  /** ground velocity (m/s) */
  vx: number
  vz: number
  /** the robot's height (m): where on it the blades land */
  height: number
  /** the way it faces (rad, three.js yaw): the ring favours its front, where it can hit back */
  heading: number
  /** its raised shield's radius (m), 0 without: the soldiers fight from outside it and their blades stop on it */
  guard: number
  /** it can be fought (it stands in robot form, or is anywhere once they are alerted) */
  present: boolean
  /** Flash Move already delivers a swept toss; omit ordinary damaging body ramming this frame. */
  flash?: boolean
}

/** The citadel, the soldiers' way-finding in it and its districts' garrisons. */
interface Stronghold {
  citadel: Citadel
  nav: CitadelNav
  garrisons: Garrison[]
  /** each district's commander (by district), if the commander's asset was given */
  posts: CommanderPost[]
}

/**
 * The citadel's garrisons of robot soldiers and everything they do.
 *
 * Every district keeps its own garrison (garrison.ts): at peace its soldiers
 * walk their beats; when the robot comes into the district they light their
 * blades and fight (engage.ts), following it one district over through the
 * gates, and they stand down a moment after it leaves the citadel or goes
 * further (garrison.ts `updateAlert`), finding their way back to their
 * beats. While a fight lasts, reinforcements roll out of the district's
 * spawn doors whenever the garrison runs low; at peace it slowly refills.
 *
 * Blows from the robot (hits.ts) take a soldier's health: it flinches and
 * recovers, is thrown, or, with its health gone, breaks into its parts
 * (debris.ts), which lie for four seconds and burn away. A special's blows
 * before its last leave an emptied soldier doomed in its flinch; the last
 * one breaks every doomed soldier at once. Flying bodies bowl over the
 * soldiers they hit.
 *
 * Everything is drawn by one HordeRenderer: culled to the view, sorted by
 * distance for its detail tiers, capacity HORDE_CAPACITY; the health bars
 * are one more draw over the nearest.
 */
export class Horde {
  readonly object = new Group()
  /** soldiers destroyed so far (a running count, for tools and tests) */
  destroyed = 0
  /** a soldier's blade (or the commander's lance) lands on the robot: where (world), from where, how hard 0..1 */
  onStruck: ((at: Vector3, from: Vector3, strength: number) => void) | null = null
  /** the commander's fourth blow lands on the robot: knock it back from `from` (world) */
  onKnockback: ((from: Vector3) => void) | null = null
  /** the ground shakes at `at` (world), strength 0..1 (the session shakes the camera by its distance) */
  onQuake: ((at: Vector3, strength: number) => void) | null = null
  /** the commander's body pushed the robot this frame (world x, z, m): the session moves the robot by it and clears it */
  readonly shove = { x: 0, z: 0 }
  /**
   * A special is playing: nothing destroys a soldier until its last blow
   * (walls and bowling bodies included); an emptied one is held doomed.
   */
  special = false
  private readonly asset: SoldierAsset
  private readonly renderer: HordeRenderer
  private readonly bars = new HealthBars(HORDE_CAPACITY)
  private readonly audio: SoldierAudio
  private readonly sparks = new Sparks()
  private readonly billows = new Billows()
  private readonly contact: ContactEffects
  private readonly strongholds: Stronghold[] = []
  /** every district's commander (none without its asset) */
  private readonly posts: CommanderPost[] = []
  private readonly commanders: HordeRenderer | null = null
  private readonly commanderList: Soldier[] = []
  private readonly garrisons: Garrison[] = []
  private readonly pool: Soldier[] = []
  private readonly drawList: Soldier[] = []
  /** scratch: soldiers off screen whose shadows may fall into view */
  private readonly shadowList: Soldier[] = []
  /** scratch: the alerted garrisons' standing soldiers; every soldier stepped this frame and its citadel */
  private readonly fighters: Soldier[] = []
  private readonly stepped: Soldier[] = []
  private readonly steppedFort: Citadel[] = []
  /** the floor under the target (the robot) at the last step: blows and slashes reach only its level */
  private targetFloor = 0
  private serial = 0
  private clock = 0
  private frame = 0
  private readonly frustum = new Frustum()
  private readonly sphere = new Sphere()
  private readonly projScreen = new Matrix4()
  private readonly listener = new Vector3()

  constructor(asset: SoldierAsset, citadel: Citadel, contact: ContactEffects, mix: AudioMix, commander: SoldierAsset | null = null) {
    this.asset = asset
    this.contact = contact
    this.renderer = new HordeRenderer(asset)
    this.audio = new SoldierAudio(mix)
    this.object.add(this.renderer.object, this.sparks.mesh, this.billows.mesh, this.bars.mesh)
    {
      const nav = new CitadelNav(citadel.plan, SOLDIER.radius)
      const garrisons = citadel.plan.sectors.map((sector) => createGarrison(citadel, nav, sector))
      const stronghold: Stronghold = { citadel, nav, garrisons, posts: [] }
      this.strongholds.push(stronghold)
      for (const g of garrisons) {
        this.garrisons.push(g)
        if (!g.posts.length) continue
        for (let i = 0; i < g.sector.garrison; i++) station(g, this.soldier(), i, this.serial++, this.clock)
      }
      if (commander) {
        // one way-finding at the commanders' radius for all of them; their distances are the soldiers' at their size
        const commanderNav = new CitadelNav(citadel.plan, COMMANDER.radius)
        const scale = commander.manifest.dims.height / asset.manifest.dims.height
        for (const sector of citadel.plan.sectors) {
          const post = new CommanderPost(citadel, commanderNav, sector, commander.manifest, mix, scale)
          post.onEffect = (cue, p) => this.commanderEffect(cue, p)
          this.object.add(post.trail.mesh)
          stronghold.posts.push(post)
          this.posts.push(post)
        }
      }
    }
    if (commander) {
      this.commanders = new HordeRenderer(commander, { capacity: this.posts.length, materials: createCommanderMaterials, lodDistance: COMMANDER_LOD })
      this.object.add(this.commanders.object)
    }
  }

  prepareAudio(): void {
    this.audio.prepare()
    for (const post of this.posts) post.audio.prepare()
  }

  /** How many soldiers are alive in the district of (x, z), and whether it is fighting; null outside the citadel. */
  status(x: number, z: number): { alive: number; alert: boolean } | null {
    for (const { citadel, garrisons } of this.strongholds) {
      const k = citadel.sector(x, z)
      if (k < garrisons.length) return { alive: aliveIn(garrisons[k]), alert: garrisons[k].alert }
    }
    return null
  }

  /** Observe the attacking robot's current ground point before combat emits blows, including the first frame after a switch. */
  targetAt(x: number, z: number): void {
    this.targetFloor = this.strongholds[0].citadel.floorAt(x, z)
  }

  update(dt: number, target: EnemyTarget, camera: PerspectiveCamera): void {
    // the dust the horde raises (blows, break-ups, the commander's moves) is the fight's
    const fight = this.contact.fight
    if (fight === 'none') this.contact.fight = 'combo'
    this.step(dt, target, camera)
    this.contact.fight = fight
  }

  private step(dt: number, target: EnemyTarget, camera: PerspectiveCamera): void {
    this.listener.copy(camera.position)
    this.clock += dt
    this.frame++
    const stepped = this.stepped, steppedFort = this.steppedFort
    stepped.length = 0
    steppedFort.length = 0
    let rolling = 0, lit = 0
    for (const { citadel, nav, garrisons, posts } of this.strongholds) {
      const targetSector = citadel.sector(target.x, target.z)
      this.targetFloor = citadel.floorAt(target.x, target.z)
      const fighters = this.fighters
      fighters.length = 0
      let swinging = 0
      garrisons.forEach((g, gi) => {
        const camDist = Math.max(0, Math.hypot(camera.position.x - g.cx, camera.position.z - g.cz) - g.radius)
        if (camDist > DRAW_FAR && !g.alert) return
        const rate = g.alert || camDist < SIM_NEAR ? 1 : camDist < SIM_MID ? 2 : 6
        if (this.frame % rate !== gi % rate) return
        const step = dt * rate
        if (updateAlert(g, target, targetSector, step)) {
          for (const s of g.soldiers) if (s.alive) this.audio.ignite(this.listener.distanceTo(_v.set(s.x, s.floor + 1.5, s.z)))
        }
        const fresh = reinforce(g, step, () => this.soldier(), this.serial, this.clock)
        if (fresh) {
          this.serial++
          if (g.alert) this.audio.ignite(this.listener.distanceTo(_v.set(fresh.x, fresh.floor + 1.5, fresh.z)))
        }
        for (const s of g.soldiers) {
          if (!s.alive) continue
          s.sector = citadel.sector(s.x, s.z)
          if (s.leaving) {
            if (Math.hypot(s.goal.x - s.x, s.goal.z - s.z) > 2 || !s.free) continue
            s.leaving = false
          }
          if (!s.free && s.mode !== 'attack') continue
          if (g.alert) {
            fighters.push(s)
            if (s.mode === 'attack') swinging++
          } else if (s.free) patrol(g, s, this.clock)
        }
        for (const s of g.soldiers) {
          if (!s.alive) continue
          s.update(step)
          stepped.push(s)
          steppedFort.push(citadel)
          if (rate === 1) {
            const d = Math.max(4, Math.hypot(s.x - camera.position.x, s.z - camera.position.z))
            rolling += Math.min(1, Math.hypot(s.vx, s.vz) / SOLDIER.chargeSpeed) * (8 / d)
            lit += s.blade * (6 / d)
          }
        }
        this.decay(g, step)
      })
      // the fight: mid-swing soldiers keep their swing; the others take their places round the robot
      let k = 0
      for (let i = 0; i < fighters.length; i++) if (fighters[i].mode !== 'attack') fighters[k++] = fighters[i]
      fighters.length = k
      engage(citadel, nav, fighters, target, targetSector, this.clock, swinging, (s) => this.audio.swing(this.listener.distanceTo(_v.set(s.x, s.floor + 1.5, s.z))))
      for (let pi = 0; pi < posts.length; pi++) {
        // a calm commander far from the camera is stepped less often, as its garrison is
        const post = posts[pi], u = post.unit
        const garrison = garrisons[post.home.index]
        const camDist = Math.hypot(camera.position.x - u.x, camera.position.z - u.z)
        const rate = garrison.alert || camDist < SIM_NEAR ? 1 : camDist < SIM_MID ? 2 : 6
        if (this.frame % rate === pi % rate) this.command(post, garrison, dt * rate, target, targetSector)
      }
    }
    this.collide(target)
    this.strikes(target)
    this.sparks.update(dt)
    this.billows.update(dt)
    this.audio.update(rolling, lit)
    this.drawFor(camera)
  }

  /** A blow of the robot's (hits.ts) reaches the world: returns how many soldiers it caught. */
  hit(e: HitEvent): number {
    let n = 0
    let nearest = Infinity
    // a special's blows before its last cannot destroy: an emptied soldier is held doomed until then
    const hold = enemyHeld(e.special, this.special, e.final)
    const hx = Math.sin(e.heading), hz = Math.cos(e.heading)
    const span = e.shape === 'capsule' ? Math.hypot(e.x - (e.fromX ?? e.x), e.z - (e.fromZ ?? e.z)) : 0
    // (every garrison: a soldier may have followed the fight out of its own district)
    for (const g of this.garrisons) {
      for (const s of g.soldiers) {
        if (!this.blowOn(e, s, SOLDIER.radius, hold, hx, hz, span)) continue
        nearest = Math.min(nearest, this.listener.distanceTo(_v.set(s.x, s.floor + 1.5, s.z)))
        n++
      }
    }
    for (const post of this.posts) {
      const c = post.unit
      if (!this.blowOn(e, c, COMMANDER.radius, hold, hx, hz, span)) continue
      nearest = Math.min(nearest, this.listener.distanceTo(_v.set(c.x, c.floor + 3, c.z)))
      n++
    }
    if (n > 0 && e.blowSound !== 'none') {
      // the blow itself, once: a blade's chop and ring, a heavy hit, or a punch
      const kind = e.blowSound ?? (e.kind === 'cut' ? 'slash' : e.kind === 'blast' || e.knock >= 13 || e.lift >= 3 ? 'heavy' : 'punch')
      this.audio.blow(kind, Math.min(1.4, 0.55 + (e.knock + e.damage * 0.02) / 20), n, nearest)
    }
    if (e.final) this.settle(e.x, e.z)
    return n
  }

  /** Whether blow `e` catches unit `s` (body `radius` m, on the robot's level): if so it takes it (thrown along the blow, out from a blast). */
  private blowOn(e: HitEvent, s: Soldier, radius: number, hold: boolean, hx: number, hz: number, span: number): boolean {
    if (!s.alive || Math.abs(s.floor - this.targetFloor) > LEVEL_REACH) return false
    let dx = s.x - e.x, dz = s.z - e.z
    if (e.shape === 'capsule') {
      const ax = e.fromX ?? e.x, az = e.fromZ ?? e.z
      const ex = e.x - ax, ez = e.z - az
      if (e.reaction === 'toss') {
        // A broad moving front: width catches the crowd beside the mesh,
        // but doesn't reach a width's distance ahead of the actual travel.
        const along = (s.x - ax) * hx + (s.z - az) * hz
        const side = (s.x - ax) * hz - (s.z - az) * hx
        if (along < -radius || along > span + radius) return false
        dx = side * hz; dz = -side * hx
      } else {
        const length = span * span
        const along = length > 0 ? Math.max(0, Math.min(1, ((s.x - ax) * ex + (s.z - az) * ez) / length)) : 0
        dx = s.x - (ax + ex * along)
        dz = s.z - (az + ez * along)
      }
    }
    const d = Math.hypot(dx, dz)
    if (d > e.reach + radius) return false
    if (e.shape === 'sector') {
      const ang = Math.abs(wrap(Math.atan2(dx, dz) - e.heading))
      if (d > 0.8 && ang > e.arc / 2 + Math.atan2(radius, d)) return false
    }
    if (e.sweep >= 0) {
      if (s.lastSweep === e.sweep) return false
      s.lastSweep = e.sweep
    }
    const rx = d > 1e-3 ? dx / d : hx, rz = d > 1e-3 ? dz / d : hz
    let dirX: number, dirZ: number, knock = e.knock, lift = e.lift, damage = e.damage
    if (e.reaction === 'toss') {
      // Rule 7: a forward crowd wave, with independent kick/lift and a
      // small outward fan. Weight is applied once in Soldier.impact.
      const lane = Math.max(-1, Math.min(1, (dx * hz - dz * hx) / Math.max(0.001, e.reach)))
      const kick = throwVariation(s.serial, 0)
      const angle = lane * 0.16 + (kick - 0.5) * 0.08
      const ca = Math.cos(angle), sa = Math.sin(angle)
      dirX = hx * ca + hz * sa
      dirZ = hz * ca - hx * sa
      knock *= (0.82 + 0.4 * kick) * (1 - 0.18 * Math.abs(lane))
      lift *= 0.72 + 0.63 * throwVariation(s.serial, 1)
    } else if (e.toward) {
      dirX = e.toward[0] - s.x
      dirZ = e.toward[1] - s.z
    } else if (e.radial) {
      // a blast: straight out from it, harder nearer
      const f = 1 - 0.55 * Math.pow(Math.min(1, d / e.reach), 2)
      dirX = rx; dirZ = rz
      knock *= f
      if (e.shape === 'circle') damage *= Math.min(1, 0.4 + 0.6 * (1 - d / e.reach) * 1.6)
    } else if (e.shape === 'circle' || e.shape === 'capsule') {
      // ploughed through: along the motion and out of the path
      const side = Math.sign(dx * hz - dz * hx) || 1
      dirX = hx * 0.8 + hz * side * 0.6
      dirZ = hz * 0.8 - hx * side * 0.6
      if (e.shape === 'circle') knock = Math.min(16, knock + e.motion * 0.2)
    } else {
      dirX = rx * 0.55 + hx * 0.45
      dirZ = rz * 0.55 + hz * 0.45
    }
    const l = Math.hypot(dirX, dirZ) || 1
    if (e.radial) lift *= 1 - 0.5 * Math.min(1, d / e.reach)
    const hit = _impact
    hit.dirX = dirX / l; hit.dirZ = dirZ / l; hit.knock = knock; hit.lift = lift; hit.damage = damage; hit.kind = e.kind; hit.special = e.special
    hit.reaction = e.reaction
    hit.shock = e.shock ?? 0
    this.impact(s, hit, hold)
    return true
  }

  /** A vacuum (hits.ts pulls): every soldier within its reach is drawn toward its centre. */
  pull(e: PullEvent): void {
    for (const g of this.garrisons) for (const s of g.soldiers) this.pullOn(e, s, SOLDIER.radius)
    for (const post of this.posts) this.pullOn(e, post.unit, COMMANDER.radius)
  }

  /** A vacuum on one unit (body `radius` m, on the robot's level), by the combat contract: not on one mid-combo, unless it is a special's. */
  private pullOn(e: PullEvent, s: Soldier, radius: number): void {
    if (!s.alive || !enemyReacts(s.inCombo, e.special) || Math.abs(s.floor - this.targetFloor) > LEVEL_REACH) return
    if (Math.hypot(s.x - e.x, s.z - e.z) > e.radius + radius) return
    s.pull(e.x, e.z, e.speed, e.dt)
  }

  /**
   * Break apart every doomed soldier (a special's last blow has landed, or
   * the special ended): thrown out from (x, z), where the blow fell.
   */
  settle(x = NaN, z = NaN): void {
    for (const g of this.garrisons) for (const s of g.soldiers) this.settleOne(s, x, z)
    for (const post of this.posts) this.settleOne(post.unit, x, z)
  }

  private settleOne(s: Soldier, x: number, z: number): void {
    if (!s.doomed || !s.settle()) return
    const dx = s.x - x, dz = s.z - z
    const d = Math.hypot(dx, dz)
    const ux = d > 1e-3 ? dx / d : Math.sin(s.yaw + Math.PI), uz = d > 1e-3 ? dz / d : Math.cos(s.yaw + Math.PI)
    this.breakup(s, { dirX: ux, dirZ: uz, knock: 6, lift: 3, damage: 0, kind: 'blast', special: true })
  }

  /**
   * Aim assist for a move starting at (x, z) toward `heading`: the bearing to
   * the nearest standing soldier on the robot's level within `range` m and
   * `cone` rad of it, or the heading itself.
   */
  assist(x: number, z: number, heading: number, range = 7, cone = 0.9): number {
    this.targetAt(x, z)
    let best = heading
    let bd = range
    for (const g of this.garrisons) {
      if (!g.alert) continue
      for (const s of g.soldiers) {
        if (!s.alive || s.doomed || s.mode === 'down' || s.airborne || Math.abs(s.floor - this.targetFloor) > LEVEL_REACH) continue
        const d = Math.hypot(s.x - x, s.z - z)
        if (d >= bd) continue
        const bearing = Math.atan2(s.x - x, s.z - z)
        if (Math.abs(wrap(bearing - heading)) > cone) continue
        bd = d
        best = bearing
      }
    }
    for (const { unit: c } of this.posts) {
      if (!c.alive || c.doomed || c.mode === 'down' || c.airborne || Math.abs(c.floor - this.targetFloor) > LEVEL_REACH) continue
      // its body is broader: it is in reach as far beyond a soldier's as it is wider
      const d = Math.hypot(c.x - x, c.z - z) - (COMMANDER.radius - SOLDIER.radius)
      if (d >= bd) continue
      const bearing = Math.atan2(c.x - x, c.z - z)
      if (Math.abs(wrap(bearing - heading)) > cone + Math.atan2(COMMANDER.radius, Math.max(1, d))) continue
      bd = d
      best = bearing
    }
    return best
  }

  /**
   * How far along a ray (world, `dir` unit) the first living soldier's body
   * stands, within `range` m, or Infinity: the gun's rounds and shells stop
   * where they strike one. A body is a sphere about its chest (it follows a
   * soldier thrown into the air).
   */
  ray(from: Vector3, dir: Vector3, range: number): number {
    let best = Infinity
    const r = BODY_RADIUS
    for (const g of this.garrisons) {
      for (const s of g.soldiers) {
        if (!s.alive) continue
        const rx = s.x - from.x, ry = s.floor + s.y + BODY_HEIGHT - from.y, rz = s.z - from.z
        const t = rx * dir.x + ry * dir.y + rz * dir.z
        if (t < 0 || t > range + r) continue
        const d2 = rx * rx + ry * ry + rz * rz - t * t
        if (d2 >= r * r) continue
        const hit = t - Math.sqrt(r * r - d2)
        if (hit < best && hit <= range) best = Math.max(0, hit)
      }
    }
    for (const { unit: c } of this.posts) {
      if (!c.alive) continue
      const R = COMMANDER_BODY_RADIUS
      const rx = c.x - from.x, ry = c.floor + c.y + COMMANDER_BODY_HEIGHT - from.y, rz = c.z - from.z
      const t = rx * dir.x + ry * dir.y + rz * dir.z
      if (t < 0 || t > range + R) continue
      const d2 = rx * rx + ry * ry + rz * rz - t * t
      if (d2 >= R * R) continue
      const hit = t - Math.sqrt(R * R - d2)
      if (hit < best && hit <= range) best = Math.max(0, hit)
    }
    return best
  }

  /**
   * The bodies (chest points) of the living soldiers thrown into the air
   * within `range` m of `at`, written into `out` (as many as it holds);
   * returns how many (a gun seeking targets in the air).
   */
  airborne(at: Vector3, range: number, out: Vector3[]): number {
    let n = 0
    for (const g of this.garrisons) {
      for (const s of g.soldiers) {
        if (n >= out.length) return n
        if (!s.alive || s.mode !== 'air') continue
        const y = s.floor + s.y + BODY_HEIGHT
        if (Math.hypot(s.x - at.x, y - at.y, s.z - at.z) > range) continue
        out[n++].set(s.x, y, s.z)
      }
    }
    for (const { unit: c } of this.posts) {
      if (n >= out.length || !c.alive || c.mode !== 'air') continue
      const y = c.floor + c.y + COMMANDER_BODY_HEIGHT
      if (Math.hypot(c.x - at.x, y - at.y, c.z - at.z) <= range) out[n++].set(c.x, y, c.z)
    }
    return n
  }

  /** The living soldiers within `radius` of (x, z) (tools and tests). */
  nearby(x: number, z: number, radius: number): readonly Soldier[] {
    const out: Soldier[] = []
    for (const g of this.garrisons) for (const s of g.soldiers) if (s.alive && Math.hypot(s.x - x, s.z - z) < radius) out.push(s)
    return out
  }

  /** The citadel's commander (tools and tests). */
  get commanderPosts(): readonly CommanderPost[] {
    return this.posts
  }

  /** Show every piece of the horde for a shader compile, or hide them again. */
  warm(on: boolean): void {
    this.renderer.warm(on)
    this.commanders?.warm(on)
    for (const post of this.posts) post.trail.mesh.visible = on
    this.sparks.mesh.visible = on
    this.billows.warm(on)
    this.bars.warm(on)
  }

  // ------------------------------------------------------------ garrison

  private soldier(): Soldier {
    return this.pool.pop() ?? new Soldier(this.asset.manifest)
  }

  /** Walls and props, the robot's body, and each other (every soldier stepped this frame); then the floor under each. */
  private collide(t: EnemyTarget): void {
    const list = this.stepped
    for (let i = 0; i < list.length; i++) {
      const s = list[i]
      _p.x = s.x; _p.z = s.z
      const c = this.steppedFort[i].grid.pushOut(_p, SOLDIER.radius, _contact)
      if (c) {
        s.x = _p.x; s.z = _p.z
        const into = s.vx * c.nx + s.vz * c.nz
        if (into < 0) {
          // a body thrown into a wall stops against it (a little bounce)
          s.vx -= c.nx * into * 1.25
          s.vz -= c.nz * into * 1.25
          if (into < -7 && !s.tossing) this.impact(s, { dirX: c.nx, dirZ: c.nz, knock: 0, lift: 0, damage: (-into - 7) * 6, kind: 'blunt', special: false }, enemyHeld(false, this.special, false))
        }
      }
      // the robot's body (on its level): soldiers give way; a body moving fast into them shoves them
      if (t.present && Math.abs(s.floor - this.targetFloor) <= LEVEL_REACH) {
        const dx = s.x - t.x, dz = s.z - t.z
        const d = Math.hypot(dx, dz)
        const min = t.radius + SOLDIER.radius
        if (d < min && d > 1e-4) {
          const nx = dx / d, nz = dz / d
          s.x = t.x + nx * min
          s.z = t.z + nz * min
          const push = t.vx * nx + t.vz * nz
          const rel = push - (s.vx * nx + s.vz * nz)
          if (!t.flash) {
            if (rel > 2.5 && s.free) this.impact(s, { dirX: nx, dirZ: nz, knock: rel * 1.1, lift: rel * 0.12, damage: rel * 2, kind: 'blunt', special: false }, enemyHeld(false, this.special, false))
            else if (rel > 0) { s.vx += nx * rel; s.vz += nz * rel }
          }
        }
      }
    }
    // each other: overlap resolved, and a fast body bowls over the one it hits
    for (let i = 0; i < list.length; i++) {
      const a = list[i]
      if (!a.alive) continue
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]
        if (!b.alive) continue
        const dx = b.x - a.x, dz = b.z - a.z
        const min = SOLDIER.radius * 2
        if (dx > min || dx < -min || dz > min || dz < -min) continue
        const d2 = dx * dx + dz * dz
        if (d2 >= min * min || d2 < 1e-8) continue
        const d = Math.sqrt(d2)
        const nx = dx / d, nz = dz / d
        const over = (min - d) * 0.5
        a.x -= nx * over; a.z -= nz * over
        b.x += nx * over; b.z += nz * over
        const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz
        if (rel <= 0) continue
        if (rel > 5 && (!a.free || !b.free)) {
          // momentum shared: the struck one is thrown on, the thrown one slowed
          const share = rel * 0.55
          const harmless = a.tossing || b.tossing
          a.vx -= nx * share; a.vz -= nz * share
          this.impact(b, { dirX: nx, dirZ: nz, knock: share, lift: share * 0.15, damage: harmless ? 0 : share * 3,
            kind: 'blunt', special: false, reaction: harmless ? 'toss' : undefined }, enemyHeld(false, this.special, false))
        } else {
          const k = rel * 0.5
          a.vx -= nx * k; a.vz -= nz * k
          b.vx += nx * k; b.vz += nz * k
        }
      }
    }
    for (const post of this.posts) this.collideCommander(post, t)
    for (let i = 0; i < list.length; i++) list[i].floor = this.steppedFort[i].floorAt(list[i].x, list[i].z)
  }

  /**
   * The commander against the walls, the robot (they push each other apart:
   * it gives COMMANDER_YIELD of the overlap, the rest is the robot's
   * `shove`) and the soldiers (they give way to its bulk). The body blows
   * are a soldier's (the combat contract): a body thrown into a wall takes
   * damage, the robot barging into it at speed knocks it, and a flying body
   * bowls over the one it hits, the commander or a soldier.
   */
  private collideCommander(post: CommanderPost, t: EnemyTarget): void {
    const c = post.unit
    if (!c.alive) return
    const R = COMMANDER.radius
    _p.x = c.x; _p.z = c.z
    const wall = post.citadel.grid.pushOut(_p, R, _contact)
    if (wall) {
      c.x = _p.x; c.z = _p.z
      const into = c.vx * wall.nx + c.vz * wall.nz
      if (into < 0) {
        c.vx -= wall.nx * into * 1.25
        c.vz -= wall.nz * into * 1.25
        if (into < -7 && !c.tossing) this.impact(c, { dirX: wall.nx, dirZ: wall.nz, knock: 0, lift: 0, damage: (-into - 7) * 6, kind: 'blunt', special: false }, enemyHeld(false, this.special, false))
      }
    }
    if (t.present && c.mode !== 'down' && Math.abs(c.floor - this.targetFloor) <= LEVEL_REACH) {
      const dx = c.x - t.x, dz = c.z - t.z
      const d = Math.hypot(dx, dz)
      const min = t.radius + R
      if (d < min && d > 1e-4) {
        const nx = dx / d, nz = dz / d
        const over = min - d
        c.x += nx * over * COMMANDER_YIELD
        c.z += nz * over * COMMANDER_YIELD
        this.shove.x -= nx * over * (1 - COMMANDER_YIELD)
        this.shove.z -= nz * over * (1 - COMMANDER_YIELD)
        const rel = (t.vx - c.vx) * nx + (t.vz - c.vz) * nz
        if (!t.flash) {
          if (rel > 2.5 && c.free) this.impact(c, { dirX: nx, dirZ: nz, knock: rel * 1.1, lift: rel * 0.12, damage: rel * 2, kind: 'blunt', special: false }, enemyHeld(false, this.special, false))
          else if (rel > 0) { c.vx += nx * rel * COMMANDER_YIELD; c.vz += nz * rel * COMMANDER_YIELD }
        }
      }
    }
    for (const s of this.stepped) {
      if (!s.alive) continue
      const dx = s.x - c.x, dz = s.z - c.z
      const min = R + SOLDIER.radius
      if (dx > min || dx < -min || dz > min || dz < -min) continue
      const d = Math.hypot(dx, dz)
      if (d >= min || d < 1e-4) continue
      const nx = dx / d, nz = dz / d
      s.x = c.x + nx * min
      s.z = c.z + nz * min
      const rel = (c.vx - s.vx) * nx + (c.vz - s.vz) * nz
      if (rel > 5 && (c.tossing || s.tossing)) {
        // Either tossed body can be the incoming one: rel is positive for
        // approach in both directions. Its recipient keeps the harmless response.
        const share = rel * 0.55
        if (c.tossing) {
          c.vx -= nx * share; c.vz -= nz * share
          this.impact(s, { dirX: nx, dirZ: nz, knock: share, lift: share * 0.15, damage: 0,
            kind: 'blunt', special: false, reaction: 'toss' }, enemyHeld(false, this.special, false))
        } else {
          s.vx += nx * share; s.vz += nz * share
          this.impact(c, { dirX: -nx, dirZ: -nz, knock: share, lift: share * 0.15, damage: 0,
            kind: 'blunt', special: false, reaction: 'toss' }, enemyHeld(false, this.special, false))
        }
      } else if (rel > 5 && (!c.free || !s.free) && c.mode === 'air') {
        // the commander thrown into a soldier: the soldier is bowled over, the commander slowed
        const share = rel * 0.55
        c.vx -= nx * share; c.vz -= nz * share
        this.impact(s, { dirX: nx, dirZ: nz, knock: share, lift: share * 0.15, damage: share * 3, kind: 'blunt', special: false }, enemyHeld(false, this.special, false))
      } else if (rel < -5 && (!c.free || !s.free) && s.mode === 'air') {
        // a soldier thrown into the commander: the commander takes it as a soldier would
        const share = -rel * 0.55
        s.vx += nx * share; s.vz += nz * share
        this.impact(c, { dirX: -nx, dirZ: -nz, knock: share, lift: share * 0.15, damage: share * 3, kind: 'blunt', special: false }, enemyHeld(false, this.special, false))
      } else if (rel > 0 || c.tossing || s.tossing) { s.vx += nx * rel; s.vz += nz * rel }
    }
    c.floor = post.citadel.floorAt(c.x, c.z)
  }

  /** Blades landing on the robot (on its level), at the moment in each swing they reach it. */
  private strikes(t: EnemyTarget): void {
    if (!t.present) return
    const floor = this.targetFloor
    for (const s of this.stepped) {
      if (s.mode !== 'attack' || s.landed || s.t < SOLDIER.windup + SOLDIER.strike * SOLDIER.landsAt) continue
      s.landed = true
      if (Math.abs(s.floor - floor) > LEVEL_REACH) continue
      const dx = t.x - s.x, dz = t.z - s.z
      const d = Math.hypot(dx, dz)
      if (d > Math.max(t.radius + SLASH_REACH, t.guard + 1.2) + SOLDIER.radius) continue
      if (Math.abs(wrap(Math.atan2(dx, dz) - s.yaw)) > SLASH_CONE) continue
      s.bladeEnds(_a, _b)
      // where it lands: on the robot's body toward the soldier, at the blade's height
      const nx = -dx / d, nz = -dz / d
      _hit.set(t.x + nx * t.radius, floor + Math.min(t.height * 0.7, Math.max(1.2, _b.y - floor)), t.z + nz * t.radius)
      _from.set(s.x, s.floor + 2.2, s.z)
      this.onStruck?.(_hit, _from, 0.55 + Math.random() * 0.3)
    }
    for (const post of this.posts) {
      const c = post.unit
      const blow = c.blow
      c.blow = null
      if (!blow || !c.alive || Math.abs(c.floor - floor) > LEVEL_REACH) continue
      const dx = t.x - c.x, dz = t.z - c.z
      const d = Math.hypot(dx, dz)
      // the soldiers' reach at its size, stopping on a raised shield as their blades do
      if (d - COMMANDER.radius > Math.max(t.radius + post.reachGap, t.guard + post.reachGap * GUARD_REACH)) continue
      if (blow.arc < 360 && Math.abs(wrap(Math.atan2(dx, dz) - c.yaw)) > (blow.arc * Math.PI) / 360 + Math.atan2(t.radius, Math.max(1, d))) continue
      // where it lands: on the robot's body (or its shield) toward the commander, at the lance's height
      c.bladeEnds(_a, _b)
      const nx = -dx / Math.max(d, 1e-3), nz = -dz / Math.max(d, 1e-3)
      const skin = Math.max(t.radius, t.guard)
      _hit.set(t.x + nx * skin, floor + Math.min(t.height * COMMANDER_BLOW_HEIGHT, Math.max(1.2, _b.y - floor)), t.z + nz * skin)
      _from.set(c.x, c.floor + 4, c.z)
      this.onStruck?.(_hit, _from, blow.strength)
      post.audio.hit(blow.knockback === true, blow.strength, t.guard > 0, this.listener.distanceTo(_hit))
      this.sparks.emit({ count: Math.round(30 + 40 * blow.strength), at: _hit, dir: _d.set(nx, 0.4, nz).normalize(), spread: 0.8, speed: [3, 13], life: [0.15, 0.7], size: 0.02, drag: 2.2, gravity: 0.8, palette: 0, jitter: 0.3 })
      if (blow.knockback) this.onKnockback?.(_from)
    }
  }

  /**
   * A commander's move effect (combo.ts cues): the lance's head flaring and
   * shedding sparks, crackling as it gathers, the wheels throwing up sand,
   * the point driven into the ground (a burst, chunks, a surge, a camera
   * quake near it), or a surge of sand rolling out round the whirl. All of it
   * is the horde's sparks and billows and the world's warmed contact effects.
   */
  private commanderEffect(cue: CommanderCue, post: CommanderPost): void {
    const c = post.unit
    const v = cue.value ?? 1
    post.lance(_a, _b)
    switch (cue.cue) {
      case 'flash':
        this.sparks.emit({ count: Math.round(40 * v), at: _b, dir: _d.subVectors(_b, _a).normalize(), spread: 0.9, speed: [4, 16], life: [0.15, 0.6], size: 0.022, drag: 2.2, gravity: 0.6, palette: 0, jitter: 0.25 })
        break
      case 'charge':
        this.sparks.emit({ count: Math.round(22 * v), at: _b, dir: _u.set(0, 1, 0), spread: 1, speed: [1, 5], life: [0.2, 0.7], size: 0.014, drag: 3, gravity: 0.3, palette: 0, jitter: 0.5 })
        break
      case 'skid':
        // sand thrown up from both wheels
        for (const side of ['L', 'R']) {
          _v.setFromMatrixPosition(c.rig.world[c.rig.index[`wheel.${side}`]])
          _v.y = this.contact.height(_v.x, _v.z)
          this.contact.burst(_v, 0.8 * v, 10)
        }
        break
      case 'slam': {
        // the point at the sand: the ground under it bursts, chunks fly, a surge rolls out
        _v.set(_b.x, this.contact.height(_b.x, _b.z), _b.z)
        this.contact.burst(_v, 1.5 * v, 26)
        this.contact.eject(_v, 9 * v, 14, _u.set(0, 1, 0), 0.7, 0.35)
        this.contact.surge(_v, 7, 0.9 * v)
        this.sparks.emit({ count: 70, at: _v, dir: _u.set(0, 1, 0), spread: 0.8, speed: [4, 15], life: [0.2, 0.9], size: 0.02, drag: 2, gravity: 0.9, palette: 0, jitter: 0.6 })
        this.billows.emit({ count: 5, at: _v, jitter: 1, dir: _u.set(0, 1, 0), spread: 0.9, speed: [1, 3], life: [1.6, 2.8], size: [1.2, 2.4], heat: 0, drag: 1.2, buoyancy: 0.5, tone: 0.2, opacity: 0.5 })
        this.onQuake?.(_v, v)
        break
      }
      case 'whirl':
        _v.set(c.x, this.contact.height(c.x, c.z), c.z)
        this.contact.surge(_v, 9, v)
        this.contact.burst(_v, 1.2 * v, 20)
        this.onQuake?.(_v, 0.6 * v)
        break
    }
  }

  /** A district's commander for this step: alerted with its district's garrison while the fight is in its district; its parts' landings heard once it is destroyed. */
  private command(post: CommanderPost, garrison: Garrison, dt: number, target: EnemyTarget, targetSector: number): void {
    post.update(dt, this.clock, target, targetSector, garrison.alert, this.listener)
    const c = post.unit
    if (c.alive) {
      // only while it can be fought: in a special's cutscene or a jump nothing reaches the robot
      if (!target.present) c.blow = null
      return
    }
    const debris = c.debris
    if (!debris || post.gone || debris.landingCount === 0) return
    const dist = this.listener.distanceTo(_v.set(c.x, c.floor + 0.5, c.z))
    for (let k = 0; k < debris.landingCount; k++) {
      const l = debris.landings[k]
      this.audio.land(l.piece, debris.size(l.piece), debris.mass(l.piece), l.speed, dist)
    }
  }

  /** Destroyed soldiers' parts: lying, burning away, then gone. */
  private decay(g: Garrison, dt: number): void {
    for (let i = g.soldiers.length - 1; i >= 0; i--) {
      const s = g.soldiers[i]
      if (s.alive) continue
      const debris = s.debris
      if (debris) {
        debris.update(dt)
        if (debris.landingCount > 0) {
          // the parts lie within a few metres of where the soldier stood
          const dist = this.listener.distanceTo(_v.set(s.x, s.floor + 0.5, s.z))
          for (let k = 0; k < debris.landingCount; k++) {
            const l = debris.landings[k]
            this.audio.land(l.piece, debris.size(l.piece), debris.mass(l.piece), l.speed, dist)
          }
        }
        s.dissolve = Math.max(0, Math.min(1, (debris.age - DEBRIS_LIE) / DEBRIS_FADE))
        s.lights = Math.max(0, s.lights - dt * 3)
        s.blade = Math.max(0, s.blade - dt * 4)
        s.heat = Math.max(0, s.heat - dt * 0.35)
        if (debris.age < DEBRIS_LIE + DEBRIS_FADE) continue
      }
      g.soldiers.splice(i, 1)
      this.pool.push(s)
    }
  }

  /** A blow on one soldier: a flinch, a throw or its destruction, and its sparks and sound. */
  private impact(s: Soldier, hit: SoldierImpact, hold: boolean): void {
    s.refresh()
    const chest = _c.setFromMatrixPosition(s.rig.world[s.rig.index.chest])
    const destroyed = s.impact(hit, hold)
    const dist = this.listener.distanceTo(chest)
    const strength = Math.min(1.5, (hit.knock + hit.damage * 0.04) / 10)
    _d.set(hit.dirX, 0.35, hit.dirZ).normalize()
    this.sparks.emit({
      count: Math.round(10 + 26 * strength), at: chest, dir: _d, spread: 0.7, speed: [2, 9 + 5 * strength], life: [0.15, 0.6],
      size: 0.014, drag: 2.4, gravity: 0.8, palette: 0, jitter: 0.25,
    })
    if (!destroyed) {
      // it reels: no swing back while the blows keep coming
      if (hit.reaction !== 'toss') s.nextSwing = Math.max(s.nextSwing, this.clock + REEL)
      this.audio.impact(hit.kind, strength, dist)
      // a thrown body scuffs a little sand up; the fight's dust supports the blows, it is not a storm of its own
      if (hit.knock > 9) this.contact.burst(_v.set(s.x, this.contact.height(s.x, s.z), s.z), Math.min(0.9, hit.knock / 16), 4)
      return
    }
    this.breakup(s, hit)
  }

  /** Broken apart where it stands: the joints give, the parts fly. */
  private breakup(s: Soldier, hit: SoldierImpact): void {
    this.destroyed++
    for (const post of this.posts) if (post.unit === s) post.fell()
    const chest = _c.setFromMatrixPosition(s.rig.world[s.rig.index.chest])
    const dist = this.listener.distanceTo(chest)
    const strength = Math.min(1.5, (hit.knock + hit.damage * 0.04) / 10)
    const debris = s.debris ??= new Debris(s.rig, s.pieces, this.contact)
    const burst = hit.kind === 'blast' ? 2.4 : hit.kind === 'cut' ? 1.3 : 1.6
    _push.set(hit.dirX * hit.knock, hit.lift * 0.6, hit.dirZ * hit.knock).multiplyScalar(hit.special ? 1.3 : 1)
    _base.set(s.vx * 0.3, 0, s.vz * 0.3)
    debris.start(_push, _base, burst)
    this.audio.breakup(strength + 0.3, dist)
    this.sparks.emit({ count: 60, at: chest, dir: _u.set(0, 1, 0), spread: 1, speed: [2, 12], life: [0.2, 0.9], size: 0.016, drag: 2, gravity: 0.9, palette: 0, jitter: 0.5 })
    this.billows.emit({ count: 3, at: chest, jitter: 0.6, dir: _u.set(0, 1, 0), spread: 0.8, speed: [0.5, 2], life: [1.6, 2.8], size: [0.9, 1.9], heat: 0, drag: 1.2, buoyancy: 0.6, tone: 0.15, opacity: 0.5 })
    this.contact.burst(_v.set(s.x, this.contact.height(s.x, s.z), s.z), 0.8, 7)
  }

  /**
   * Cull to the view, sort near to far, pose what is drawn and hand it to
   * the renderer (`update` does this for its camera); the health bars of the
   * nearest living ones go over them. Soldiers just off screen whose shadows
   * can reach into view (within SHADOW_REACH of it, and SHADOW_FAR of the
   * camera) go after the visible ones: they only cast.
   */
  drawFor(camera: PerspectiveCamera): void {
    camera.updateMatrixWorld()
    this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.projScreen, camera.coordinateSystem, camera.reversedDepth)
    const list = this.drawList
    const extra = this.shadowList
    list.length = 0
    extra.length = 0
    for (const g of this.garrisons) {
      for (const s of g.soldiers) {
        this.sphere.center.set(s.x, s.floor + 1.6 + s.y, s.z)
        s.distance = camera.position.distanceTo(this.sphere.center)
        if (s.distance > DRAW_FAR) continue
        this.sphere.radius = s.alive ? 2.2 : 7
        if (this.frustum.intersectsSphere(this.sphere)) {
          list.push(s)
          continue
        }
        if (s.distance > SHADOW_FAR) continue
        this.sphere.radius += SHADOW_REACH
        if (this.frustum.intersectsSphere(this.sphere)) extra.push(s)
      }
    }
    list.sort((a, b) => a.distance - b.distance)
    if (list.length > HORDE_CAPACITY) list.length = HORDE_CAPACITY
    const visible = list.length
    extra.sort((a, b) => a.distance - b.distance)
    for (let i = 0; i < extra.length && list.length < HORDE_CAPACITY; i++) list.push(extra[i])
    for (const s of list) s.refresh()
    this.renderer.draw(list, visible)
    const bars = this.bars
    bars.begin()
    for (let i = 0; i < visible; i++) {
      const s = list[i]
      if (s.distance > BAR_FAR) break
      if (!s.alive) continue
      const head = _c.setFromMatrixPosition(s.rig.world[s.rig.index.head])
      const fade = 1 - Math.min(1, Math.max(0, (s.distance - BAR_FADE) / (BAR_FAR - BAR_FADE)))
      bars.add(head.x, head.y + BAR_LIFT, head.z, fade, s.vitality, s.chip, Math.max(0, 1 - s.hurt / BAR_FLASH))
    }
    this.drawCommanders(camera)
    bars.end()
  }

  /** The commanders (their own renderer), culled as the soldiers are; their larger bars into this frame's bars. */
  private drawCommanders(camera: PerspectiveCamera): void {
    const renderer = this.commanders
    if (!renderer) return
    const list = this.commanderList
    list.length = 0
    let visible = 0
    // the visible ones first; then those just off screen whose shadows reach into view, which only cast
    for (let pass = 0; pass < 2; pass++) {
      for (const post of this.posts) {
        const c = post.unit
        if (post.gone) continue
        this.sphere.center.set(c.x, c.floor + 3.4 + c.y, c.z)
        c.distance = camera.position.distanceTo(this.sphere.center)
        if (c.distance > DRAW_FAR) continue
        this.sphere.radius = c.alive ? COMMANDER_SPHERE[0] : COMMANDER_SPHERE[1]
        const seen = this.frustum.intersectsSphere(this.sphere)
        if (pass === 0) {
          if (seen) list.push(c)
          continue
        }
        if (seen || c.distance > SHADOW_FAR) continue
        this.sphere.radius += COMMANDER_SHADOW_REACH
        if (this.frustum.intersectsSphere(this.sphere)) list.push(c)
      }
      if (pass === 0) visible = list.length
    }
    for (const c of list) c.refresh()
    renderer.draw(list, visible)
    for (let i = 0; i < visible; i++) {
      const c = list[i]
      if (!c.alive || c.distance > BAR_FAR * COMMANDER_BAR) continue
      const head = _c.setFromMatrixPosition(c.rig.world[c.rig.index.head])
      const fade = 1 - Math.min(1, Math.max(0, (c.distance - BAR_FADE * COMMANDER_BAR) / ((BAR_FAR - BAR_FADE) * COMMANDER_BAR)))
      this.bars.add(head.x, head.y + COMMANDER_BAR_LIFT, head.z, fade, c.vitality, c.chip, Math.max(0, 1 - c.hurt / BAR_FLASH), COMMANDER_BAR)
    }
  }
}

const _v = new Vector3()
const _a = new Vector3()
const _b = new Vector3()
const _c = new Vector3()
const _d = new Vector3()
const _u = new Vector3()
const _hit = new Vector3()
const _from = new Vector3()
const _push = new Vector3()
const _base = new Vector3()
const _p = { x: 0, z: 0 }
const _contact: Contact = { nx: 0, nz: 0, depth: 0 }
const _impact: SoldierImpact = { dirX: 0, dirZ: 0, knock: 0, lift: 0, damage: 0, kind: 'blunt', special: false }
