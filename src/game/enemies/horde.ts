import { Frustum, Group, Matrix4, Sphere, Vector3, type PerspectiveCamera } from 'three/webgpu'
import type { SoldierAsset } from '../../content/soldier/asset'
import { HordeRenderer, HORDE_CAPACITY } from '../../content/soldier/horde-renderer'
import { SoldierAudio } from '../../content/soldier/audio'
import { Sparks } from '../../content/transformer/combat/fx/sparks'
import { Billows } from '../../content/transformer/combat/fx/billows'
import type { HitEvent } from '../../content/transformer/combat/hits'
import type { AudioMix } from '../../audio/mix'
import type { ContactEffects } from '../contact-effects'
import type { Fort, Forts } from '../../worlds/desert/fort'
import { pushOut, type Contact } from '../collide'
import { wrap } from '../math'
import { Soldier, SOLDIER, type SoldierImpact } from './soldier'
import { Debris, DEBRIS_FADE, DEBRIS_LIE } from './debris'

/** Garrison size at peace, the level at which reinforcements roll out during a fight, and the most alive at once. */
export const GARRISON = 14
export const REINFORCE_BELOW = 8
const MAX_ALIVE = 16
/** Seconds between reinforcements during a fight, and while the fort refills at peace. */
const REINFORCE_EVERY = 1.1
const REFILL_EVERY = 5
/** How many may be swinging at once, and how many close in to the ring at all. */
const ATTACKERS = 3
const RING = 7
/** Share of the way round the ring the fighting soldiers move toward the robot's front. */
const FRONT_BIAS = 0.3
/** Distance beyond the robot's body where the ring stands, and the outer holding ring (m). */
const ENGAGE_GAP = 1.55
const HOLD_GAP = 5.0
/** The slash's reach past the robot's body (m) and its cone (rad) either side of the soldier's heading. */
const SLASH_REACH = 2.1
const SLASH_CONE = 1.05
/** Draw and simulate forts within these distances of the camera (m); beyond `SIM_FAR` they tick slowly. */
const DRAW_FAR = 460
const SIM_FAR = 170

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

interface Garrison {
  fort: Fort
  soldiers: Soldier[]
  alert: boolean
  /** a wave of reinforcements is rolling out (started below REINFORCE_BELOW, runs until the garrison is whole) */
  wave: boolean
  spawnClock: number
  /** per soldier: next time it may swing (s of garrison clock), post index */
  clock: number
  cooldown: Map<Soldier, number>
  post: Map<Soldier, number>
  /** each soldier's destination when it came out of the hangar (it rolls out before it fights) */
  leaving: Set<Soldier>
}

/**
 * The forts' garrisons of robot soldiers and everything they do.
 *
 * Each fort keeps a garrison standing at its posts. When the robot comes
 * inside the walls the fort is alerted: every soldier lights its blade and
 * charges; the nearest close in on a ring round the robot and a few at a time
 * wind up and slash, the rest hold further out, circling for an opening.
 * Leaving the fort's grounds calls them back to their posts. While the fight
 * lasts, reinforcements roll out of the hangar whenever the garrison drops
 * below REINFORCE_BELOW; at peace it slowly refills.
 *
 * Blows from the robot (hits.ts) reach every soldier in their shape; a
 * soldier is thrown, staggered, launched or destroyed (soldier.ts), and a
 * destroyed one breaks into its parts (debris.ts), which lie for four
 * seconds and burn away. Flying bodies bowl over the soldiers they hit.
 *
 * Everything is drawn by one HordeRenderer for all forts: culled to the view,
 * sorted by distance for its detail tiers, capacity HORDE_CAPACITY.
 */
export class Horde {
  readonly object = new Group()
  /** soldiers destroyed so far (a running count, for tools and tests) */
  destroyed = 0
  /** a soldier's blade lands on the robot: where (world), from where, how hard 0..1 */
  onStruck: ((at: Vector3, from: Vector3, strength: number) => void) | null = null
  private readonly asset: SoldierAsset
  private readonly renderer: HordeRenderer
  private readonly audio: SoldierAudio
  private readonly sparks = new Sparks()
  private readonly billows = new Billows()
  private readonly contact: ContactEffects
  private readonly garrisons: Garrison[] = []
  private readonly pool: Soldier[] = []
  private readonly drawList: Soldier[] = []
  /** scratch: a garrison's standing soldiers this frame */
  private readonly standing: Soldier[] = []
  private serial = 0
  private readonly frustum = new Frustum()
  private readonly sphere = new Sphere()
  private readonly projScreen = new Matrix4()
  private readonly listener = new Vector3()
  private slowTick = 0

  constructor(asset: SoldierAsset, forts: Forts, contact: ContactEffects, mix: AudioMix) {
    this.asset = asset
    this.contact = contact
    this.renderer = new HordeRenderer(asset)
    this.audio = new SoldierAudio(mix)
    this.object.add(this.renderer.object, this.sparks.mesh, this.billows.mesh)
    for (const fort of forts.list) {
      const g: Garrison = { fort, soldiers: [], alert: false, wave: false, spawnClock: 0, clock: 0, cooldown: new Map(), post: new Map(), leaving: new Set() }
      this.garrisons.push(g)
      for (let i = 0; i < GARRISON; i++) this.station(g, i)
    }
  }

  /** How many soldiers are alive in the fort the target is in (or nearest), and whether it is alerted. */
  status(x: number, z: number): { alive: number; alert: boolean } | null {
    for (const g of this.garrisons) {
      const s = g.fort.plan.site
      if (Math.hypot(x - s.x, z - s.z) < g.fort.plan.barrier + 20) return { alive: g.soldiers.filter((k) => k.alive).length, alert: g.alert }
    }
    return null
  }

  update(dt: number, target: EnemyTarget, camera: PerspectiveCamera): void {
    this.listener.copy(camera.position)
    this.slowTick = (this.slowTick + 1) % 6
    let rolling = 0
    let lit = 0
    for (const g of this.garrisons) {
      const site = g.fort.plan.site
      const camDist = Math.hypot(camera.position.x - site.x, camera.position.z - site.z)
      if (camDist > DRAW_FAR + g.fort.plan.outer) continue
      // far forts only stand guard: their soldiers tick at a sixth of the rate
      const near = camDist < SIM_FAR + g.fort.plan.outer || g.alert
      if (!near && this.slowTick !== this.garrisons.indexOf(g) % 6) continue
      const step = near ? dt : dt * 6
      g.clock += step
      this.alert(g, target)
      this.spawn(g, step)
      this.think(g, target)
      for (const s of g.soldiers) {
        if (s.alive) s.update(step)
      }
      this.collide(g, target)
      this.strikes(g, target)
      this.decay(g, step)
      if (near) {
        for (const s of g.soldiers) {
          if (!s.alive) continue
          const d = Math.max(4, Math.hypot(s.x - camera.position.x, s.z - camera.position.z))
          rolling += Math.min(1, Math.hypot(s.vx, s.vz) / SOLDIER.chargeSpeed) * (8 / d)
          lit += s.blade * (6 / d)
        }
      }
    }
    this.sparks.update(dt)
    this.billows.update(dt)
    this.audio.update(rolling, lit)
    this.drawFor(camera)
  }

  /** A blow of the robot's (hits.ts) reaches the world: returns how many soldiers it caught. */
  hit(e: HitEvent): number {
    let n = 0
    for (const g of this.garrisons) {
      const site = g.fort.plan.site
      if (Math.hypot(e.x - site.x, e.z - site.z) > g.fort.plan.barrier + e.reach + 10) continue
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
        this.impact(s, { dirX: dirX / l, dirZ: dirZ / l, knock, lift, damage, kind: e.kind, special: e.special })
        n++
      }
    }
    return n
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
        if (!s.alive || s.mode === 'down' || s.mode === 'air') continue
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
  }

  // ------------------------------------------------------------ garrison

  private soldier(): Soldier {
    return this.pool.pop() ?? new Soldier(this.asset.manifest)
  }

  /** A soldier standing at post `i` of the fort. */
  private station(g: Garrison, i: number): Soldier {
    const plan = g.fort.plan
    const post = plan.posts[i % plan.posts.length]
    const ring = Math.floor(i / plan.posts.length)
    const p = g.fort.toWorld(post.at[0] + ring * 1.8, post.at[1] - ring * 1.8)
    const s = this.soldier()
    s.reset(p.x, p.z, post.yaw + plan.site.yaw, this.serial++)
    g.soldiers.push(s)
    g.post.set(s, i)
    g.cooldown.set(s, g.clock + 1 + Math.random() * 2)
    return s
  }

  /** Alerted while the target is inside the walls; called off once it leaves the grounds. */
  private alert(g: Garrison, t: EnemyTarget): void {
    const site = g.fort.plan.site
    const d = Math.hypot(t.x - site.x, t.z - site.z)
    if (!g.alert && t.present && g.fort.inside(t.x, t.z)) {
      g.alert = true
      for (const s of g.soldiers) if (s.alive) this.audio.ignite(this.listener.distanceTo(_v.set(s.x, 1.5, s.z)))
    } else if (g.alert && d > g.fort.plan.barrier + 25) g.alert = false
  }

  /**
   * Reinforcements out of the hangar during a fight: once the garrison is cut
   * below REINFORCE_BELOW a wave rolls out, one at a time, until it is whole
   * again. At peace it slowly refills.
   */
  private spawn(g: Garrison, dt: number): void {
    const alive = g.soldiers.reduce((n, s) => n + (s.alive ? 1 : 0), 0)
    g.spawnClock += dt
    if (g.alert && alive < REINFORCE_BELOW) g.wave = true
    if (alive >= GARRISON || !g.alert) g.wave = false
    const every = g.alert ? REINFORCE_EVERY : REFILL_EVERY
    const want = g.alert ? g.wave : alive < GARRISON
    if (!want || alive >= MAX_ALIVE || g.spawnClock < every || g.soldiers.length >= MAX_ALIVE + 6) return
    g.spawnClock = 0
    const plan = g.fort.plan
    const door = plan.spawns[this.serial % plan.spawns.length]
    const p = g.fort.toWorld(door.at[0], door.at[1])
    const e = g.fort.toWorld(door.exit[0], door.exit[1])
    const s = this.soldier()
    s.reset(p.x, p.z, Math.atan2(e.x - p.x, e.z - p.z), this.serial++)
    s.goal.x = e.x
    s.goal.z = e.z
    s.goal.drive = true
    s.goal.speed = SOLDIER.chargeSpeed * 0.7
    s.goal.face = s.yaw
    g.soldiers.push(s)
    g.leaving.add(s)
    // a free post to return to at peace
    const taken = new Set(g.post.values())
    let post = 0
    while (taken.has(post)) post++
    g.post.set(s, post)
    g.cooldown.set(s, g.clock + 1.5)
    if (g.alert) this.audio.ignite(this.listener.distanceTo(_v.set(p.x, 1.5, p.z)))
  }

  /** Where each soldier wants to be and whether it swings. */
  private think(g: Garrison, t: EnemyTarget): void {
    const alive = this.standing
    alive.length = 0
    for (const s of g.soldiers) {
      if (!s.alive) continue
      if (g.leaving.has(s)) {
        if (Math.hypot(s.goal.x - s.x, s.goal.z - s.z) > 2 || !s.free) continue
        g.leaving.delete(s)
      }
      alive.push(s)
    }
    if (!g.alert) {
      for (const s of alive) {
        const i = g.post.get(s) ?? 0
        const plan = g.fort.plan
        const post = plan.posts[i % plan.posts.length]
        const ring = Math.floor(i / plan.posts.length)
        const p = g.fort.toWorld(post.at[0] + ring * 1.8, post.at[1] - ring * 1.8)
        s.goal.x = p.x
        s.goal.z = p.z
        s.goal.face = post.yaw + plan.site.yaw
        s.goal.speed = SOLDIER.engageSpeed
        s.goal.drive = true
        s.goal.ready = false
      }
      return
    }
    // alerted: the nearest RING close in on the ring round the target, the rest hold further out
    for (const s of alive) s.distance = Math.hypot(s.x - t.x, s.z - t.z)
    alive.sort((a, b) => a.distance - b.distance)
    const engage = Math.max(t.radius + ENGAGE_GAP, t.guard + 0.45) + SOLDIER.radius
    let swinging = 0
    for (const s of g.soldiers) if (s.alive && s.mode === 'attack') swinging++
    const targetInside = g.fort.inside(t.x, t.z)
    alive.forEach((s, k) => {
      s.goal.ready = true
      s.goal.drive = true
      const bearing = Math.atan2(t.x - s.x, t.z - s.z)
      s.goal.face = bearing
      // through a gate when the target is on the other side of the walls
      if (targetInside !== g.fort.inside(s.x, s.z)) {
        const gate = this.nearestGate(g, s)
        const inside = g.fort.inside(s.x, s.z)
        const nearSide = g.fort.toWorld(inside ? gate.inside[0] : gate.outside[0], inside ? gate.inside[1] : gate.outside[1])
        const farSide = g.fort.toWorld(inside ? gate.outside[0] : gate.inside[0], inside ? gate.outside[1] : gate.inside[1])
        const p = Math.hypot(nearSide.x - s.x, nearSide.z - s.z) > 2.5 ? nearSide : farSide
        s.goal.x = p.x
        s.goal.z = p.z
        s.goal.speed = SOLDIER.chargeSpeed
        return
      }
      const r = k < RING ? engage : engage + HOLD_GAP
      const ux = s.distance > 1e-3 ? (s.x - t.x) / s.distance : 1
      const uz = s.distance > 1e-3 ? (s.z - t.z) / s.distance : 0
      // the ring leans round toward the robot's front (they come at it where it can see them);
      // those holding back drift round for an opening
      const around = Math.atan2(ux, uz)
      const front = k < RING ? wrap(t.heading - around) * FRONT_BIAS : Math.sin(g.clock * 0.4 + s.serial) * 0.5
      const a = around + front
      s.goal.x = t.x + Math.sin(a) * r
      s.goal.z = t.z + Math.cos(a) * r
      s.goal.speed = s.distance > r + 4 ? SOLDIER.chargeSpeed : SOLDIER.engageSpeed
      // a swing when close, facing it, off cooldown and a token is free
      const close = s.distance < engage + 0.7
      const facing = Math.abs(wrap(bearing - s.yaw)) < 0.5
      if (k < RING && close && facing && s.free && swinging < ATTACKERS && (g.cooldown.get(s) ?? 0) < g.clock) {
        s.attack()
        swinging++
        g.cooldown.set(s, g.clock + SOLDIER.windup + SOLDIER.strike + SOLDIER.recover + 0.8 + Math.random() * 1.8)
        this.audio.swing(this.listener.distanceTo(_v.set(s.x, 1.5, s.z)))
      }
    })
  }

  private nearestGate(g: Garrison, s: Soldier): { inside: [number, number]; outside: [number, number] } {
    let best = g.fort.plan.gates[0]
    let bd = Infinity
    for (const gate of g.fort.plan.gates) {
      const p = g.fort.toWorld(gate.at[0], gate.at[1])
      const d = Math.hypot(p.x - s.x, p.z - s.z)
      if (d < bd) { bd = d; best = gate }
    }
    return best
  }

  /** Walls and props, the robot's body, and each other. */
  private collide(g: Garrison, t: EnemyTarget): void {
    const list = g.soldiers
    const fort = g.fort
    for (const s of list) {
      if (!s.alive) continue
      _p.x = s.x; _p.z = s.z
      const c = pushOut(_p, SOLDIER.radius, fort.segments, fort.circles, _contact)
      if (c) {
        s.x = _p.x; s.z = _p.z
        const into = s.vx * c.nx + s.vz * c.nz
        if (into < 0) {
          // a body thrown into a wall stops against it (a little bounce)
          s.vx -= c.nx * into * 1.25
          s.vz -= c.nz * into * 1.25
          if (into < -7) this.impact(s, { dirX: c.nx, dirZ: c.nz, knock: 0, lift: 0, damage: (-into - 7) * 6, kind: 'blunt', special: false })
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
          if (rel > 2.5 && s.free) this.impact(s, { dirX: nx, dirZ: nz, knock: rel * 1.1, lift: rel * 0.12, damage: rel * 2, kind: 'blunt', special: false })
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
        const d2 = dx * dx + dz * dz
        const min = SOLDIER.radius * 2
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
          this.impact(b, { dirX: nx, dirZ: nz, knock: share, lift: share * 0.15, damage: share * 3, kind: 'blunt', special: false })
        } else {
          const k = rel * 0.5
          a.vx -= nx * k; a.vz -= nz * k
          b.vx += nx * k; b.vz += nz * k
        }
      }
    }
  }

  /** Blades landing on the robot, at the moment in each swing they reach it. */
  private strikes(g: Garrison, t: EnemyTarget): void {
    if (!t.present) return
    for (const s of g.soldiers) {
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
        s.dissolve = Math.max(0, Math.min(1, (debris.age - DEBRIS_LIE) / DEBRIS_FADE))
        s.lights = Math.max(0, s.lights - dt * 3)
        s.blade = Math.max(0, s.blade - dt * 4)
        s.heat = Math.max(0, s.heat - dt * 0.35)
        if (debris.age < DEBRIS_LIE + DEBRIS_FADE) continue
      }
      g.soldiers.splice(i, 1)
      g.post.delete(s)
      g.cooldown.delete(s)
      g.leaving.delete(s)
      this.pool.push(s)
    }
  }

  /** A blow on one soldier: reaction or destruction, and its sparks and sound. */
  private impact(s: Soldier, hit: SoldierImpact): void {
    const destroyed = s.impact(hit)
    const chest = _c.setFromMatrixPosition(s.rig.world[s.rig.index.chest])
    const dist = this.listener.distanceTo(chest)
    const strength = Math.min(1.5, (hit.knock + hit.damage * 0.04) / 10)
    _d.set(hit.dirX, 0.35, hit.dirZ).normalize()
    this.sparks.emit({
      count: Math.round(10 + 26 * strength), at: chest, dir: _d, spread: 0.7, speed: [2, 9 + 5 * strength], life: [0.15, 0.6],
      size: 0.014, drag: 2.4, gravity: 0.8, palette: 0, jitter: 0.25,
    })
    if (!destroyed) {
      this.audio.impact(hit.kind, strength, dist)
      if (hit.knock > 6) this.contact.burst(_v.set(s.x, 0, s.z), Math.min(1.2, hit.knock / 12), 8)
      return
    }
    // broken apart where it stands: the joints give, the parts fly
    this.destroyed++
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

  /** Cull to the view, sort near to far, hand to the renderer (`update` does this for its camera). */
  drawFor(camera: PerspectiveCamera): void {
    camera.updateMatrixWorld()
    this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.projScreen)
    const list = this.drawList
    list.length = 0
    for (const g of this.garrisons) {
      for (const s of g.soldiers) {
        this.sphere.center.set(s.x, 1.6 + s.y, s.z)
        this.sphere.radius = s.alive ? 2.2 : 7
        if (!this.frustum.intersectsSphere(this.sphere)) continue
        s.distance = camera.position.distanceTo(this.sphere.center)
        if (s.distance > DRAW_FAR) continue
        list.push(s)
      }
    }
    list.sort((a, b) => a.distance - b.distance)
    if (list.length > HORDE_CAPACITY) list.length = HORDE_CAPACITY
    this.renderer.draw(list)
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
