import { Group, PointLight, Vector3 } from 'three/webgpu'
import type { AudioMix } from '../../../audio/mix'
import type { ContactEffects } from '../../../game/contact-effects'
import { groundRay, onGround } from '../../../game/ground'
import type { CombatFrame } from '../../transformer/combat/effects'
import type { Weapon } from '../../transformer/combat/weapon'
import type { Sparks } from '../../transformer/combat/fx/sparks'
import type { Billows } from '../../transformer/combat/fx/billows'
import type { BlastLight } from '../../transformer/combat/fx/blast-light'
import type { HeatHaze } from '../../transformer/combat/fx/haze'
import { explosion } from '../../transformer/combat/audio/blast'
import { GunAudio } from '../audio/gun'
import { GUN_PERIOD } from '../audio/gun-models'
import { MuzzleFlashes } from './fx/flashes'
import { Tracers } from './fx/tracers'
import { Casings } from './fx/casings'

/** Rounds: speed (m/s, slowed enough to read as streaks), how far they carry (m), the aim's scatter (rad). */
const ROUND = { speed: 420, range: 90, scatter: 0.016, width: 0.08, streak: 9 }
/** The cannon's slug: speed (m/s), its channel's width (m) and how long the channel hangs (s). */
const SLUG = { speed: 260, width: 0.3, streak: 10, linger: 0.55, range: 70 }
/** The ejection port and the casings' throw in the gun's frame (m, m/s): out of its right side, up and back. */
const PORT = new Vector3(0.12, 0.26, 0.25)
const THROW = new Vector3(2.4, 4.2, -1.2)
/** Muzzle light: colour and peak per round; its fall (1/s). */
const FLASH_LIGHT = { color: 0xffb46a, peak: 90, fall: 38 }
/** Coil charge rates (1/s): building, and the discharge. */
const CHARGE_RISE = 1.8
const CHARGE_FALL = 5
/** Explosion sizes (m): a ground burst's crater bowl. */
const CRATER = 3.4
/** Rounds in flight at once (a ring: at 11 a second and under a second's flight, never full). */
const IN_FLIGHT = 32
/** Seeking: bodies in the air within this range (m) and this cone about the barrels (rad) are aimed at. */
const SEEK = { range: 60, cone: 0.62, most: 48 }

/** What the gun drives of the fighter it belongs to. */
export interface GunneryParts {
  weapon: Weapon
  contact: ContactEffects
  mix: AudioMix
  sparks: Sparks
  billows: Billows
  blast: BlastLight
  haze: HeatHaze
  /** where the camera stands (the listener, for the cannon's delay) */
  listener: Vector3
}

interface Impact {
  at: Vector3
  /** when it lands (the gun's clock); Infinity once it has */
  when: number
  /** 'ground' dust, 'body' a soldier's armour, 'sky' nothing */
  on: 'ground' | 'body' | 'sky'
}

interface Shell {
  to: Vector3
  when: number
  strength: number
  /** bursts in the air (it met nothing before its fuse) */
  air: boolean
}

/**
 * The Semi's gun in action: the rotary machine gun and the coil cannon over
 * it (the gun asset's `rotary` and `cannon` muzzles).
 *
 *   burst   while `firing`, rounds leave at the recorded rate (the sound's
 *           GUN_PERIOD), each along the barrels as the fight poses them, with
 *           a little scatter: a muzzle flash and its light, a tracer to
 *           wherever it strikes (the first soldier's body along it, the sand,
 *           or nothing within range), a casing thrown out of the port, a wisp
 *           of smoke; where it lands, dust and sparks off the sand or sparks
 *           off the armour
 *   cannon  the coils discharge: a violet flash and a fireball at the muzzle,
 *           the blast off the sand under it, the slug's channel hanging in
 *           the air along its path; where it strikes, an explosion (a crater
 *           on the ground, or a burst in the air at its fuse)
 *   charge  the coils glow, arcs crawl over them and the air above them wavers
 *
 * The damage is not traced: it is the move's authored hits (hits.ts); what
 * the rounds strike here is what the player sees.
 */
export class Gunnery {
  readonly object = new Group()
  readonly flashes = new MuzzleFlashes()
  readonly tracers = new Tracers()
  readonly casings: Casings
  readonly audio: GunAudio
  /** 0..1 the coils' glow, for the gun's `glow` material */
  charge = 0
  private chargeTarget = 0
  private readonly p: GunneryParts
  private readonly light = new PointLight(FLASH_LIGHT.color, 0, 35, 2)
  private lightLevel = 0
  private firing = false
  /** world seconds into the current round's period */
  private cycle = 0
  private rounds = 0
  private clock = 0
  private heat = 0
  private readonly impacts: Impact[] = Array.from({ length: IN_FLIGHT }, () => ({ at: new Vector3(), when: Infinity, on: 'sky' as const }))
  private nextImpact = 0
  private readonly shells: Shell[] = []
  private readonly rotary: Vector3
  private readonly cannonMuzzle: Vector3
  /** aim at bodies in the air near the barrels' line (a special's barrage) */
  private seeking = false
  private readonly targets: Vector3[] = Array.from({ length: SEEK.most }, () => new Vector3())

  constructor(parts: GunneryParts) {
    this.p = parts
    this.casings = new Casings(parts.contact)
    this.audio = new GunAudio(parts.mix)
    const muzzles = parts.weapon.asset.manifest.muzzles ?? {}
    this.rotary = new Vector3(...(muzzles.rotary ?? [0, 0, parts.weapon.asset.manifest.extent[1]]))
    this.cannonMuzzle = new Vector3(...(muzzles.cannon ?? [0, 0, parts.weapon.asset.manifest.extent[1]]))
    this.object.add(this.flashes.plumes, this.flashes.stars, this.tracers.mesh, this.casings.mesh, this.light)
  }

  /** Start or stop the machine gun. */
  fire(on: boolean): void {
    if (on === this.firing) return
    this.firing = on
    // the first round leaves at once
    if (on) this.cycle = GUN_PERIOD
    else this.audio.cease()
  }

  /** Aim each round and shot at a body in the air near the barrels' line (on), or along them (off). */
  seek(on: boolean): void {
    this.seeking = on
  }

  /**
   * A body in the air within the cone about `dir` from `from`, or null: the
   * nearest to the line for the cannon (`nearest`), else any (spreading the
   * rounds over everything in the cone).
   */
  private target(frame: CombatFrame, from: Vector3, dir: Vector3, nearest: boolean): Vector3 | null {
    if (!this.seeking || !frame.airborne) return null
    const n = frame.airborne(from, SEEK.range, this.targets)
    const cos = Math.cos(SEEK.cone)
    let best: Vector3 | null = null
    let bestDot = cos
    let seen = 0
    for (let i = 0; i < n; i++) {
      const t = this.targets[i]
      const d = _t.subVectors(t, from).normalize().dot(dir)
      if (d < cos) continue
      seen++
      if (nearest ? d > bestDot : Math.random() * seen < 1) {
        best = t
        bestDot = d
      }
    }
    return best
  }

  /** The coils charge toward `level` (0..1). */
  chargeTo(level: number): void {
    this.chargeTarget = level
  }

  update(dt: number, frame: CombatFrame): void {
    this.clock += dt
    this.audio.frame()
    this.flashes.update(dt)
    this.tracers.update(dt)
    this.casings.update(dt)
    const weapon = this.p.weapon
    if (this.firing && weapon.presence > 0.98) {
      this.cycle += dt
      let fired = 0
      while (this.cycle >= GUN_PERIOD && fired < 4) {
        this.cycle -= GUN_PERIOD
        // this round's place within the frame's step
        this.round(frame, dt > 0 ? 1 - this.cycle / dt : 1)
        fired++
      }
    } else if (this.firing && weapon.presence <= 0) this.fire(false)
    this.land()
    this.fly(frame)

    // the coils
    const up = this.chargeTarget > this.charge
    const step = dt * (up ? CHARGE_RISE : CHARGE_FALL)
    this.charge += Math.sign(this.chargeTarget - this.charge) * Math.min(Math.abs(this.chargeTarget - this.charge), step)
    this.audio.charging(weapon.presence > 0.5 ? this.charge : 0)
    if (this.charge > 0.05 && weapon.presence > 0.9) this.arcs(dt)

    // the muzzle's light falls away between rounds; the barrels stay hot a while after a burst
    this.lightLevel *= Math.exp(-dt * FLASH_LIGHT.fall)
    this.light.intensity = this.lightLevel < 0.01 ? 0 : this.lightLevel * FLASH_LIGHT.peak * (0.85 + 0.3 * Math.random())
    this.heat = Math.max(0, this.heat - dt * 0.35)
    if (this.heat > 0.2 && weapon.presence > 0.9 && Math.random() < dt * 12 * this.heat) {
      this.p.haze.emit({ at: this.muzzle(this.rotary, _a), jitter: 0.25, size: [0.6, 1.4], rise: 1.1, life: [0.35, 0.6], strength: 0.5 * this.heat })
    }
  }

  /** The cannon fires now: `fuse` (m) bursts it in the air that far out if it meets nothing first; `strength` scales the blast. */
  cannon(frame: CombatFrame, strength: number, fuse: number): void {
    const p = this.p
    const w = p.weapon
    if (w.presence < 0.5) return
    const at = this.muzzle(this.cannonMuzzle, _m)
    const dir = this.bore(_d)
    // seeking: the slug goes for the body in the air nearest the line and bursts on it
    const aim = this.target(frame, at, dir, true)
    if (aim) {
      fuse = Math.min(fuse, at.distanceTo(aim))
      dir.subVectors(aim, at).normalize()
    }
    // the flash: the coils' discharge and the burning gas behind the slug
    this.flashes.emit({ at, dir, length: 5.5 * strength, size: 4.2 * strength, life: 0.13, palette: 1 })
    this.flashes.emit({ at: _a.copy(at).addScaledVector(dir, 0.6), dir, length: 3.4 * strength, size: 3 * strength, life: 0.1, palette: 0 })
    p.blast.flash(at, 0xd8c8ff, 260 * strength, 0.35, 45)
    p.billows.emit({ count: 6, at: _a.copy(at).addScaledVector(dir, 1.2), jitter: 0.8, dir, spread: 0.25, speed: [3, 10], life: [0.35, 0.7], size: [0.8, 2.8], heat: 2400, drag: 4, buoyancy: 2, tone: 0.5, opacity: 0.25 })
    // the muzzle blast: a ring of smoke round the bore, sand blown flat under it
    _s.set(1, 0, 0)
    if (Math.abs(dir.x) > 0.9) _s.set(0, 1, 0)
    _u.crossVectors(dir, _s).normalize()
    _s.crossVectors(dir, _u).normalize()
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2
      _v.copy(_u).multiplyScalar(Math.cos(a)).addScaledVector(_s, Math.sin(a)).addScaledVector(dir, 0.35).normalize()
      p.billows.emit({ count: 1, at, jitter: 0.2, dir: _v, spread: 0.1, speed: [6, 11], life: [1.2, 2.2], size: [0.6, 2.6], heat: 600, drag: 3.2, buoyancy: 0.4, tone: 0.4, opacity: 0.32 })
    }
    const height = at.y - p.contact.height(at.x, at.z)
    if (height < 7) {
      onGround(p.contact, _a.set(at.x, 0, at.z).addScaledVector(_v.set(dir.x, 0, dir.z).normalize(), 1.5))
      p.contact.surge(_a, 1.6 + 1.2 * strength, 0.4 * strength * (1 - height / 8))
    }
    frame.camera.shockwave(at, 0.3 * strength)
    frame.camera.kick(0.55 * strength)
    frame.camera.punch(5 * strength, 0.25)
    frame.camera.shake(0.45 * strength)
    frame.camera.hitStop(0.06, 0.08)
    this.audio.cannon(at.distanceTo(p.listener), strength)
    // the slug: to the first body along it, the sand, or its fuse
    const range = Math.min(fuse, SLUG.range)
    const body = frame.probe?.(at, dir, range) ?? Infinity
    const ground = groundRay(p.contact, at, dir, range)
    const hit = Math.min(body, ground, range)
    const to = _b.copy(at).addScaledVector(dir, hit)
    const flight = this.tracers.fire({ from: at, to, speed: SLUG.speed, width: SLUG.width * strength, streak: SLUG.streak, palette: 1, linger: SLUG.linger })
    this.shells.push({ to: to.clone(), when: this.clock + flight, strength, air: hit < ground - 0.5 })
    this.heat = 1
    this.light.position.copy(at)
    this.lightLevel = Math.max(this.lightLevel, 3)
  }

  /** A wisp of smoke from the bores (a gun that has just fired a lot), `level` 0..1. */
  muzzleSmoke(level: number): void {
    const p = this.p
    if (p.weapon.presence < 0.5) return
    for (const muzzle of [this.rotary, this.cannonMuzzle]) {
      p.billows.emit({ count: 1, at: this.muzzle(muzzle, _a), jitter: 0.1, dir: _up, spread: 0.3, speed: [0.3, 1.2], life: [1.8, 3], size: [0.2, 1.6], heat: 500, drag: 1.5, buoyancy: 0.9, tone: 0.3, opacity: 0.22 * level })
    }
  }

  /** Stop at once (the fight is dropped or ends). */
  reset(): void {
    this.fire(false)
    this.seeking = false
    this.charge = this.chargeTarget = 0
    for (const hit of this.impacts) hit.when = Infinity
    this.shells.length = 0
    this.lightLevel = 0
    this.light.intensity = 0
    this.heat = 0
  }

  warm(on: boolean): void {
    this.flashes.warm(on)
    this.tracers.warm(on)
    this.casings.warm(on)
  }

  dispose(): void {
    this.audio.dispose()
  }

  /** One round, `at` the share of the way through this frame's step it left. */
  private round(frame: CombatFrame, at: number): void {
    const p = this.p
    const muzzle = this.muzzle(this.rotary, _m)
    const dir = this.bore(_d)
    const aim = this.target(frame, muzzle, dir, false)
    if (aim) dir.subVectors(aim, muzzle).normalize()
    dir.x += (Math.random() * 2 - 1) * ROUND.scatter
    dir.y += (Math.random() * 2 - 1) * ROUND.scatter
    dir.z += (Math.random() * 2 - 1) * ROUND.scatter
    dir.normalize()
    this.rounds++
    this.flashes.emit({ at: muzzle, dir, length: 1.5, size: 1.05, life: 0.045, palette: 0 })
    this.lightLevel = Math.max(this.lightLevel, 1)
    this.light.position.copy(muzzle)
    // where it strikes: a body, the sand or nothing
    const body = frame.probe?.(muzzle, dir, ROUND.range) ?? Infinity
    const ground = groundRay(p.contact, muzzle, dir, ROUND.range)
    const hit = Math.min(body, ground, ROUND.range)
    const to = _b.copy(muzzle).addScaledVector(dir, hit)
    const flight = this.tracers.fire({ from: muzzle, to, speed: ROUND.speed, width: ROUND.width, streak: ROUND.streak, palette: 0 })
    const impact = this.impacts[this.nextImpact]
    this.nextImpact = (this.nextImpact + 1) % IN_FLIGHT
    impact.at.copy(to)
    impact.when = this.clock + flight
    impact.on = body <= hit ? 'body' : ground <= hit ? 'ground' : 'sky'
    // the spent case out of the port, and a wisp of smoke from the bores
    const W = p.weapon.object.matrixWorld
    _a.copy(PORT).applyMatrix4(W)
    _v.copy(THROW).transformDirection(W).multiplyScalar(THROW.length() * (0.8 + Math.random() * 0.4))
    this.casings.eject(_a, _v)
    if (this.rounds % 2 === 0) {
      p.billows.emit({ count: 1, at: muzzle, jitter: 0.15, dir, spread: 0.4, speed: [1.5, 4], life: [0.9, 1.6], size: [0.3, 1.8], heat: 650, drag: 3, buoyancy: 0.7, tone: 0.35, opacity: 0.2 })
    }
    this.heat = Math.min(1, this.heat + 0.05)
    frame.camera.shake(0.08)
    this.audio.shot(Math.min(1, Math.max(0, at)))
  }

  /** Rounds arriving where they were going. */
  private land(): void {
    const p = this.p
    for (const hit of this.impacts) {
      if (hit.when > this.clock) continue
      hit.when = Infinity
      if (hit.on === 'ground') {
        p.contact.burst(hit.at, 0.7, 8)
        p.sparks.emit({ count: 5, at: hit.at, dir: _up, spread: 0.6, speed: [3, 9], life: [0.12, 0.35], size: 0.012, drag: 2, gravity: 1, palette: 0 })
        p.billows.emit({ count: 1, at: onGround(p.contact, _a.copy(hit.at), 0.3), jitter: 0.3, dir: _up, spread: 0.4, speed: [1.5, 4], life: [0.9, 1.8], size: [0.4, 1.9], heat: 0, drag: 2.5, buoyancy: 0.3, tone: 1, opacity: 0.35 * p.contact.loose(hit.at.x, hit.at.z) })
      } else if (hit.on === 'body') {
        // a heavy round on light armour: sparks thrown back off it, a puff of the plate's paint and dust
        p.sparks.emit({ count: 16, at: hit.at, dir: _up, spread: 0.85, speed: [2, 11], life: [0.12, 0.45], size: 0.016, drag: 2.5, gravity: 0.8, palette: 0, jitter: 0.2 })
        p.billows.emit({ count: 1, at: hit.at, jitter: 0.2, dir: _up, spread: 0.5, speed: [0.8, 2.5], life: [0.6, 1.1], size: [0.3, 1.2], heat: 900, drag: 3, buoyancy: 0.8, tone: 0.3, opacity: 0.2 })
      }
    }
  }

  /** Slugs arriving: an explosion at each. */
  private fly(frame: CombatFrame): void {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i]
      if (s.when > this.clock) continue
      this.shells.splice(i, 1)
      this.explode(frame, s.to, s.strength, s.air)
    }
  }

  /** The slug bursts at `at`: in the air, or on the ground with its crater. */
  private explode(frame: CombatFrame, at: Vector3, strength: number, air: boolean): void {
    const p = this.p
    const cam = frame.camera
    if (!air) {
      onGround(p.contact, at)
      p.contact.crater(at, CRATER * strength, 0.55 * strength)
      p.contact.surge(at, 2.6 * strength, 0.6 * strength)
      p.contact.eject(at, 15 * strength, Math.round(36 * strength), _up, 0.62, 0.5)
    }
    const lift = air ? 0 : 1
    // the fireball, the smoke it rolls up into and (on the ground) the sand thrown out round it
    p.billows.emit({ count: Math.round(14 * strength), at: _a.copy(at).setY(at.y + lift), jitter: 1.4 * strength, dir: _up, spread: 1, speed: [4, 10], life: [0.45, 0.9], size: [1.4 * strength, 5 * strength], heat: 2500, drag: 2.8, buoyancy: 5, tone: 0.6, opacity: 0.3 })
    // the sand thrown up: a supporting cloud, thin where the ground is paved
    const sand = air ? 1 : p.contact.loose(at.x, at.z)
    p.billows.emit({ count: Math.round(11 * strength), at: _a.copy(at).setY(at.y + lift), jitter: 2 * strength, dir: _up, spread: air ? 1 : 0.35, speed: [3, 14], life: [2.4, 4], size: [1.8 * strength, 6 * strength], heat: 0, drag: 1.2, buoyancy: 0.6, tone: air ? 0.15 : 0.85, opacity: 0.36 * sand })
    if (!air) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2
        _v.set(Math.cos(a), 0.1, Math.sin(a))
        p.billows.emit({ count: 1, at, jitter: 1.4, dir: _v, spread: 0.1, speed: [10, 17], life: [2, 3.2], size: [1.3, 4.8], heat: 0, drag: 1.6, buoyancy: 0.2, tone: 1, opacity: 0.34 * sand })
      }
    }
    p.sparks.emit({ count: Math.round(110 * strength), at: _a.copy(at).setY(at.y + 0.3), dir: _up, spread: air ? 1 : 0.7, speed: [6, 20], life: [0.8, 2], size: 0.026, drag: 0.4, gravity: 1, palette: 0, jitter: 1.6 })
    p.sparks.emit({ count: Math.round(50 * strength), at, dir: _up, spread: 1, speed: [8, 22], life: [0.2, 0.7], size: 0.022, drag: 2, gravity: 0.2, palette: 1, jitter: 1 })
    p.blast.flash(_a.copy(at).setY(at.y + 2), 0xffd2a0, 360 * strength, 0.7, 60)
    for (let k = 0; k < 4; k++) p.haze.emit({ at: _a.copy(at).setY(at.y + 1.5), jitter: 3, size: [3, 5.5], rise: 1.6, life: [0.8, 1.5], strength: 0.9 })
    cam.shockwave(at, 0.8 * strength)
    cam.flash(0.35 * strength, 0.3)
    cam.kick(0.7 * Math.min(1.3, strength))
    cam.shake(0.8 * Math.min(1.3, strength))
    explosion(p.mix, { strength: 0.75 * strength, distance: at.distanceTo(p.listener), subHz: 38, debris: air ? 0.3 : 1 })
  }

  /** The coils charging: arcs crawl over them and off the cannon's muzzle. */
  private arcs(dt: number): void {
    const p = this.p
    const W = p.weapon.object.matrixWorld
    const n = Math.min(5, Math.round(dt * 90 * this.charge))
    for (let k = 0; k < n; k++) {
      const z = 0.85 + Math.random() * 0.5
      const a = Math.random() * Math.PI * 2
      _a.set(0.56 + Math.cos(a) * 0.2, Math.sin(a) * 0.2, z).applyMatrix4(W)
      p.sparks.emit({ count: 1, at: _a, dir: _up, spread: 1, speed: [0.5, 3.5], life: [0.06, 0.2], size: 0.012, drag: 5, gravity: -0.1, palette: 1 })
    }
    if (this.charge > 0.6 && Math.random() < dt * 25 * this.charge) {
      p.sparks.emit({ count: 3, at: this.muzzle(this.cannonMuzzle, _a), dir: this.bore(_v), spread: 0.8, speed: [1, 5], life: [0.08, 0.25], size: 0.014, drag: 4, gravity: 0, palette: 1 })
    }
    if (this.charge > 0.5 && Math.random() < dt * 10 * this.charge) {
      _a.set(0.56, 0, 1.1).applyMatrix4(W)
      p.haze.emit({ at: _a, jitter: 0.4, size: [0.9, 1.6], rise: 0.8, life: [0.3, 0.5], strength: 0.6 * this.charge })
    }
  }

  private muzzle(local: Vector3, out: Vector3): Vector3 {
    return out.copy(local).applyMatrix4(this.p.weapon.object.matrixWorld)
  }

  private bore(out: Vector3): Vector3 {
    return out.set(0, 0, 1).transformDirection(this.p.weapon.object.matrixWorld)
  }
}

const _up = new Vector3(0, 1, 0)
const _a = new Vector3()
const _b = new Vector3()
const _d = new Vector3()
const _m = new Vector3()
const _s = new Vector3()
const _t = new Vector3()
const _u = new Vector3()
const _v = new Vector3()
