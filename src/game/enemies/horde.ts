import { Frustum, Group, Matrix4, Sphere, Vector3, type PerspectiveCamera } from 'three/webgpu'
import type { SoldierAsset } from '../../content/soldier/asset'
import { HordeRenderer, HORDE_CAPACITY, SHADOW_FAR } from '../../content/soldier/horde-renderer'
import { HealthBars } from '../../content/soldier/health-bars'
import { SoldierAudio } from '../../content/soldier/audio'
import { Sparks } from '../../content/transformer/combat/fx/sparks'
import { Billows } from '../../content/transformer/combat/fx/billows'
import type { HitEvent } from '../../content/transformer/combat/hits'
import type { AudioMix } from '../../audio/mix'
import type { ContactEffects } from '../contact-effects'
import type { Fort, Forts } from '../../worlds/desert/fort'
import type { Contact } from '../collide'
import { wrap } from '../math'
import { Soldier, SOLDIER, type SoldierImpact } from './soldier'
import { Debris, DEBRIS_FADE, DEBRIS_LIE } from './debris'
import { aliveIn, createGarrison, patrol, reinforce, station, updateAlert, type Garrison } from './garrison'
import { engage, REEL } from './engage'
import { FortNav } from './navigation'

/** The slash's reach past the robot's body (m) and its cone (rad) either side of the soldier's heading. */
const SLASH_REACH = 2.1
const SLASH_CONE = 1.05
/**
 * Simulation rates by a district's distance from the camera (m, from its
 * bounds): every frame near (or fighting), every other frame across the
 * fortress, every sixth beyond; nothing past DRAW_FAR.
 */
const SIM_NEAR = 90
const SIM_MID = 200
const DRAW_FAR = 460
/** How far a soldier's shadow can reach from it across the sand (m): a 3 m body under a sun 25 degrees up. */
const SHADOW_REACH = 7
/** Health bars: drawn within BAR_FAR m, fading out from BAR_FADE; their anchor above the head bone (m). */
const BAR_FAR = 62
const BAR_FADE = 46
const BAR_LIFT = 0.78
/** A hit's flash on the bar (s). */
const BAR_FLASH = 0.18

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
}

/** A fortress, the soldiers' way-finding in it and its districts' garrisons. */
interface Stronghold {
  fort: Fort
  nav: FortNav
  garrisons: Garrison[]
}

/**
 * The fortress's garrisons of robot soldiers and everything they do.
 *
 * Every district keeps its own garrison (garrison.ts): at peace its soldiers
 * walk their beats; when the robot comes into the district they light their
 * blades and fight (engage.ts), following it one district over through the
 * gates, and they stand down a moment after it leaves the fortress or goes
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
  /** a soldier's blade lands on the robot: where (world), from where, how hard 0..1 */
  onStruck: ((at: Vector3, from: Vector3, strength: number) => void) | null = null
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
  private readonly garrisons: Garrison[] = []
  private readonly pool: Soldier[] = []
  private readonly drawList: Soldier[] = []
  /** scratch: soldiers off screen whose shadows may fall into view */
  private readonly shadowList: Soldier[] = []
  /** scratch: the alerted garrisons' standing soldiers; every soldier stepped this frame and its fort */
  private readonly fighters: Soldier[] = []
  private readonly stepped: Soldier[] = []
  private readonly steppedFort: Fort[] = []
  private serial = 0
  private clock = 0
  private frame = 0
  private readonly frustum = new Frustum()
  private readonly sphere = new Sphere()
  private readonly projScreen = new Matrix4()
  private readonly listener = new Vector3()

  constructor(asset: SoldierAsset, forts: Forts, contact: ContactEffects, mix: AudioMix) {
    this.asset = asset
    this.contact = contact
    this.renderer = new HordeRenderer(asset)
    this.audio = new SoldierAudio(mix)
    this.object.add(this.renderer.object, this.sparks.mesh, this.billows.mesh, this.bars.mesh)
    for (const fort of forts.list) {
      const nav = new FortNav(fort.plan, SOLDIER.radius)
      const garrisons = fort.plan.sectors.map((sector) => createGarrison(fort, nav, sector))
      this.strongholds.push({ fort, nav, garrisons })
      for (const g of garrisons) {
        this.garrisons.push(g)
        if (!g.posts.length) continue
        for (let i = 0; i < g.sector.garrison; i++) station(g, this.soldier(), i, this.serial++, this.clock)
      }
    }
  }

  /** How many soldiers are alive in the district of (x, z), and whether it is fighting; null outside every fortress. */
  status(x: number, z: number): { alive: number; alert: boolean } | null {
    for (const { fort, garrisons } of this.strongholds) {
      const k = fort.sector(x, z)
      if (k < garrisons.length) return { alive: aliveIn(garrisons[k]), alert: garrisons[k].alert }
    }
    return null
  }

  update(dt: number, target: EnemyTarget, camera: PerspectiveCamera): void {
    this.listener.copy(camera.position)
    this.clock += dt
    this.frame++
    const stepped = this.stepped, steppedFort = this.steppedFort
    stepped.length = 0
    steppedFort.length = 0
    let rolling = 0, lit = 0
    for (const { fort, nav, garrisons } of this.strongholds) {
      const targetSector = fort.sector(target.x, target.z)
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
          for (const s of g.soldiers) if (s.alive) this.audio.ignite(this.listener.distanceTo(_v.set(s.x, 1.5, s.z)))
        }
        const fresh = reinforce(g, step, () => this.soldier(), this.serial, this.clock)
        if (fresh) {
          this.serial++
          if (g.alert) this.audio.ignite(this.listener.distanceTo(_v.set(fresh.x, 1.5, fresh.z)))
        }
        for (const s of g.soldiers) {
          if (!s.alive) continue
          s.sector = fort.sector(s.x, s.z)
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
          steppedFort.push(fort)
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
      engage(fort, nav, fighters, target, targetSector, this.clock, swinging, (s) => this.audio.swing(this.listener.distanceTo(_v.set(s.x, 1.5, s.z))))
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
    const hold = (e.special || this.special) && !e.final
    // (every garrison: a soldier may have followed the fight out of its own district)
    for (const g of this.garrisons) {
      for (const s of g.soldiers) {
        if (!s.alive) continue
        const dx = s.x - e.x, dz = s.z - e.z
        const d = Math.hypot(dx, dz)
        const reach = e.reach + SOLDIER.radius
        if (d > reach) continue
        const hx = Math.sin(e.heading), hz = Math.cos(e.heading)
        if (e.shape === 'sector') {
          const ang = Math.abs(wrap(Math.atan2(dx, dz) - e.heading))
          if (d > 0.8 && ang > e.arc / 2 + Math.atan2(SOLDIER.radius, d)) continue
        }
        if (e.sweep >= 0) {
          if (s.lastSweep === e.sweep) continue
          s.lastSweep = e.sweep
        }
        const rx = d > 1e-3 ? dx / d : hx, rz = d > 1e-3 ? dz / d : hz
        let dirX: number, dirZ: number, knock = e.knock, damage = e.damage
        if (e.radial) {
          // a blast: straight out from it, harder nearer
          const f = 1 - 0.55 * Math.pow(Math.min(1, d / e.reach), 2)
          dirX = rx; dirZ = rz
          knock *= f
          damage *= Math.min(1, 0.4 + 0.6 * (1 - d / e.reach) * 1.6)
        } else if (e.shape === 'circle') {
          // ploughed through: along the motion and out of the path
          const side = Math.sign(dx * hz - dz * hx) || 1
          dirX = hx * 0.8 + hz * side * 0.6
          dirZ = hz * 0.8 - hx * side * 0.6
          knock = Math.min(16, knock + e.motion * 0.2)
        } else {
          dirX = rx * 0.55 + hx * 0.45
          dirZ = rz * 0.55 + hz * 0.45
        }
        const l = Math.hypot(dirX, dirZ) || 1
        const lift = e.lift * (e.radial ? 1 - 0.5 * Math.min(1, d / e.reach) : 1)
        this.impact(s, { dirX: dirX / l, dirZ: dirZ / l, knock, lift, damage, kind: e.kind, special: e.special }, hold)
        nearest = Math.min(nearest, this.listener.distanceTo(_v.set(s.x, 1.5, s.z)))
        n++
      }
    }
    if (n > 0) {
      // the blow itself, once: a blade's chop and ring, a heavy hit, or a punch
      const kind = e.kind === 'cut' ? 'slash' : e.kind === 'blast' || e.knock >= 13 || e.lift >= 3 ? 'heavy' : 'punch'
      this.audio.blow(kind, Math.min(1.4, 0.55 + (e.knock + e.damage * 0.02) / 20), n, nearest)
    }
    if (e.final) this.settle(e.x, e.z)
    return n
  }

  /**
   * Break apart every doomed soldier (a special's last blow has landed, or
   * the special ended): thrown out from (x, z), where the blow fell.
   */
  settle(x = NaN, z = NaN): void {
    for (const g of this.garrisons) {
      for (const s of g.soldiers) {
        if (!s.doomed || !s.settle()) continue
        const dx = s.x - x, dz = s.z - z
        const d = Math.hypot(dx, dz)
        const ux = d > 1e-3 ? dx / d : Math.sin(s.yaw + Math.PI), uz = d > 1e-3 ? dz / d : Math.cos(s.yaw + Math.PI)
        this.breakup(s, { dirX: ux, dirZ: uz, knock: 6, lift: 3, damage: 0, kind: 'blast', special: true })
      }
    }
  }

  /**
   * Aim assist for a move starting at (x, z) toward `heading`: the bearing to
   * the nearest standing soldier within `range` m and `cone` rad of it, or
   * the heading itself.
   */
  assist(x: number, z: number, heading: number, range = 7, cone = 0.9): number {
    let best = heading
    let bd = range
    for (const g of this.garrisons) {
      if (!g.alert) continue
      for (const s of g.soldiers) {
        if (!s.alive || s.doomed || s.mode === 'down' || s.mode === 'air') continue
        const d = Math.hypot(s.x - x, s.z - z)
        if (d >= bd) continue
        const bearing = Math.atan2(s.x - x, s.z - z)
        if (Math.abs(wrap(bearing - heading)) > cone) continue
        bd = d
        best = bearing
      }
    }
    return best
  }

  /** The living soldiers within `radius` of (x, z) (tools and tests). */
  nearby(x: number, z: number, radius: number): readonly Soldier[] {
    const out: Soldier[] = []
    for (const g of this.garrisons) for (const s of g.soldiers) if (s.alive && Math.hypot(s.x - x, s.z - z) < radius) out.push(s)
    return out
  }

  /** Show every piece of the horde for a shader compile, or hide them again. */
  warm(on: boolean): void {
    this.renderer.warm(on)
    this.sparks.mesh.visible = on
    this.billows.warm(on)
    this.bars.warm(on)
  }

  // ------------------------------------------------------------ garrison

  private soldier(): Soldier {
    return this.pool.pop() ?? new Soldier(this.asset.manifest)
  }

  /** Walls and props, the robot's body, and each other (every soldier stepped this frame). */
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
          if (into < -7) this.impact(s, { dirX: c.nx, dirZ: c.nz, knock: 0, lift: 0, damage: (-into - 7) * 6, kind: 'blunt', special: false }, this.special)
        }
      }
      // the robot's body: soldiers give way; a body moving fast into them shoves them
      if (t.present) {
        const dx = s.x - t.x, dz = s.z - t.z
        const d = Math.hypot(dx, dz)
        const min = t.radius + SOLDIER.radius
        if (d < min && d > 1e-4) {
          const nx = dx / d, nz = dz / d
          s.x = t.x + nx * min
          s.z = t.z + nz * min
          const push = t.vx * nx + t.vz * nz
          const rel = push - (s.vx * nx + s.vz * nz)
          if (rel > 2.5 && s.free) this.impact(s, { dirX: nx, dirZ: nz, knock: rel * 1.1, lift: rel * 0.12, damage: rel * 2, kind: 'blunt', special: false }, this.special)
          else if (rel > 0) { s.vx += nx * rel; s.vz += nz * rel }
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
          a.vx -= nx * share; a.vz -= nz * share
          this.impact(b, { dirX: nx, dirZ: nz, knock: share, lift: share * 0.15, damage: share * 3, kind: 'blunt', special: false }, this.special)
        } else {
          const k = rel * 0.5
          a.vx -= nx * k; a.vz -= nz * k
          b.vx += nx * k; b.vz += nz * k
        }
      }
    }
  }

  /** Blades landing on the robot, at the moment in each swing they reach it. */
  private strikes(t: EnemyTarget): void {
    if (!t.present) return
    for (const s of this.stepped) {
      if (s.mode !== 'attack' || s.landed || s.t < SOLDIER.windup + SOLDIER.strike * SOLDIER.landsAt) continue
      s.landed = true
      const dx = t.x - s.x, dz = t.z - s.z
      const d = Math.hypot(dx, dz)
      if (d > Math.max(t.radius + SLASH_REACH, t.guard + 1.2) + SOLDIER.radius) continue
      if (Math.abs(wrap(Math.atan2(dx, dz) - s.yaw)) > SLASH_CONE) continue
      s.bladeEnds(_a, _b)
      // where it lands: on the robot's body toward the soldier, at the blade's height
      const nx = -dx / d, nz = -dz / d
      _hit.set(t.x + nx * t.radius, Math.min(t.height * 0.7, Math.max(1.2, _b.y)), t.z + nz * t.radius)
      _from.set(s.x, 2.2, s.z)
      this.onStruck?.(_hit, _from, 0.55 + Math.random() * 0.3)
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
          const dist = this.listener.distanceTo(_v.set(s.x, 0.5, s.z))
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
      s.nextSwing = Math.max(s.nextSwing, this.clock + REEL)
      this.audio.impact(hit.kind, strength, dist)
      if (hit.knock > 6) this.contact.burst(_v.set(s.x, 0, s.z), Math.min(1.2, hit.knock / 12), 8)
      return
    }
    this.breakup(s, hit)
  }

  /** Broken apart where it stands: the joints give, the parts fly. */
  private breakup(s: Soldier, hit: SoldierImpact): void {
    this.destroyed++
    const chest = _c.setFromMatrixPosition(s.rig.world[s.rig.index.chest])
    const dist = this.listener.distanceTo(chest)
    const strength = Math.min(1.5, (hit.knock + hit.damage * 0.04) / 10)
    const debris = s.debris ??= new Debris(s.rig, this.asset.manifest.pieces)
    const burst = hit.kind === 'blast' ? 2.4 : hit.kind === 'cut' ? 1.3 : 1.6
    _push.set(hit.dirX * hit.knock, hit.lift * 0.6, hit.dirZ * hit.knock).multiplyScalar(hit.special ? 1.3 : 1)
    _base.set(s.vx * 0.3, 0, s.vz * 0.3)
    debris.start(_push, _base, burst)
    this.audio.breakup(strength + 0.3, dist)
    this.sparks.emit({ count: 60, at: chest, dir: _u.set(0, 1, 0), spread: 1, speed: [2, 12], life: [0.2, 0.9], size: 0.016, drag: 2, gravity: 0.9, palette: 0, jitter: 0.5 })
    this.billows.emit({ count: 5, at: chest, jitter: 0.6, dir: _u.set(0, 1, 0), spread: 0.8, speed: [0.5, 2], life: [1.8, 3.2], size: [0.9, 1.9], heat: 0, drag: 1.2, buoyancy: 0.6, tone: 0.15, opacity: 0.55 })
    this.contact.burst(_v.set(s.x, 0, s.z), 1, 16)
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
    this.frustum.setFromProjectionMatrix(this.projScreen)
    const list = this.drawList
    const extra = this.shadowList
    list.length = 0
    extra.length = 0
    for (const g of this.garrisons) {
      for (const s of g.soldiers) {
        this.sphere.center.set(s.x, 1.6 + s.y, s.z)
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
    bars.end()
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
