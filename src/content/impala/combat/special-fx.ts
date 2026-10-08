import { PointLight, Vector3 } from 'three/webgpu'
import type { AudioMix } from '../../../audio/mix'
import type { ContactEffects } from '../../../game/contact-effects'
import type { CombatFrame } from '../../transformer/combat/effects'
import type { MoveCue } from '../../transformer/combat/moves'
import type { Weapon } from '../../transformer/combat/weapon'
import type { Sparks } from '../../transformer/combat/fx/sparks'
import type { Billows } from '../../transformer/combat/fx/billows'
import type { BlastLight } from '../../transformer/combat/fx/blast-light'
import type { HeatHaze } from '../../transformer/combat/fx/haze'
import { explosion } from '../../transformer/combat/audio/blast'
import type { Lightning, BoltStyle } from './fx/lightning'
import type { ShockRing } from './fx/shock-ring'
import type { SweepRing } from './fx/sweep-ring'
import { ArcVoice, lightningStrike } from './audio/lightning'
import { THUNDER } from './special'

/** Where the listener stands from what the special does (m): its wide shots' camera distances. */
const HEARD = { ground: 16, finale: 36 }
/** The lightning: how fast its front runs out over the sand (m/s; it bursts out all round in under a second), how far (m), its main channels and how often each is struck again (s). */
const FRONT = { speed: 26, reach: THUNDER.reach + 8, rays: 18, restrike: 0.07 }
/** Of the channels' re-strikes, this share also arches from high on the standing blade out over the sand to the front (the blade's height, m). */
const ARCH = { share: 0.3, height: 3.4 }
/** A body in the air is struck this often (s), from the sand under it, once the front has reached it; at most this many bodies a frame. */
const AIR_STRIKE = 0.075
const AIR_BODIES = 12
/** How high over the sand a body is still reached (m): the flip throws them some twenty metres up. */
const AIR_HEIGHT = 26
/** A thunderclap at most this often (s). */
const CLAP = 0.32
/** The fused traces the channels leave in the sand (m wide; heat 0..1). */
const FULGURITE = { width: 0.12, heat: 0.65 }
/** The weapon's charge rates (1/s): rising as it is readied, spent into the swing. */
const CHARGE_RISE = 1.4
const CHARGE_FALL = 2.6
/**
 * The finale's full circle of light: round from the robot's right in the
 * swing's sense (anticlockwise seen from above, toward the blade's side), the band from the fist out past
 * the point (m), rolling out with the wave, the sweep's time round and each
 * point's life (s, the effects' clock: the blow's slow motion stretches it).
 */
const CIRCLE = { inner: 1.6, beyond: 0.8, roll: 12, sweep: 0.12, life: 0.55, strength: 1.4 }
/** Crimson-white light of the discharge (linear), its peak and reach. */
const THUNDER_LIGHT = { color: 0xff5a6a, peak: 140, range: 34 }

const GROUND: BoltStyle = { width: 0.7, life: 0.14, brightness: 1.2, roughness: 0.13, forks: 0.35, forkLength: 0.35 }
const ARCHED: BoltStyle = { width: 0.75, life: 0.13, brightness: 1.3, roughness: 0.12, forks: 0.3, forkLength: 0.3 }
const AIR: BoltStyle = { width: 0.8, life: 0.12, brightness: 1.5, roughness: 0.14, forks: 0.3, forkLength: 0.35 }
const BLADE: BoltStyle = { width: 0.14, life: 0.07, brightness: 0.9, roughness: 0.22, forks: 0.15, forkLength: 0.4 }

/** What the special drives of the Impala's fighter. */
export interface ThunderParts {
  weapon: Weapon | null
  contact: ContactEffects
  mix: AudioMix
  sparks: Sparks
  billows: Billows
  blast: BlastLight
  haze: HeatHaze
  lightning: Lightning
  rings: ShockRing
  /** the finale's full circle of light */
  sweep: SweepRing
  /** the discharge's own light (the character's third light slot) */
  light: PointLight
  robotOffset: number
  /** where a foot is on the ground (world), for the charge's footfalls and the skid's furrows */
  foot(side: 'L' | 'R', out: Vector3): Vector3
  /**
   * The robot's weight driven into the sand (its own footfall, heavy). The
   * shared `slam`, `sizzle` and pass-by rush hissed like a steam leak under
   * every beat (the truck's sounds); the special sounds none of them.
   */
  thud(strength: number): void
}

/**
 * Black Thunder's effects (special.ts), by cue:
 *
 *   zone     the world drained of colour and the mix closing (value 0..1)
 *   hush     the whole mix closes down (value 0..1)
 *   charge   (0..1) the cutlass charges: its forging glow runs out to the tip
 *   break    the leap's push-off: the sand it leaves breaks into a crater,
 *            cracks run out of it, crust is thrown up, dust rolls out
 *   rush     (1 / 0) the charge at speed: sand torn up and dust thrown back
 *            from under it, the air shoved ahead of it shimmering
 *   skid     (1 / 0) the skid: both feet ploughing furrows, sand sprayed
 *            ahead of them
 *   launch   the rising cut's blow: a wave of wind and sand thrown up all round,
 *            a ring of light low over the sand, the lens's blast wave
 *   plant    the blade driven into the sand: a little glass round it, sparks,
 *            a crack of discharge
 *   lightning (1 / 0) the discharge runs out from the blade over the sand in
 *            every direction, and leaps up into the bodies falling over it;
 *            the channels leave fused traces in the sand
 *   strain   (1 / 0) the buried blade hauled on: sand trickling and spitting
 *            round it, small arcs off the root
 *   unplant  the blade torn out: a burst of sand and sparks
 *   crackle  (1 / 0) the charged blade crackles with small arcs along it
 *   finale   the swing's wave: a full circle of the cut's light swept round
 *            and rolling out, a band of light going out all round, the
 *            surge, a wall of dust, crust thrown, the flash and the blast wave
 */
export class ThunderFx {
  private readonly p: ThunderParts
  private charge = 0
  private chargeTarget = 0
  private running = false
  private crackling = false
  private straining = false
  private strainClock = 0
  /** the lightning's root (the blade's point in the sand) and its run so far (s, world time) */
  private readonly root = new Vector3()
  private age = 0
  private readonly rays: number[] = []
  private readonly rayStruck: number[] = []
  private readonly rayLaid: boolean[] = []
  private clap = 0
  private airClock = 0
  private readonly bodies: Vector3[] = Array.from({ length: AIR_BODIES * 2 }, () => new Vector3())
  private lightLevel = 0
  private readonly arc: ArcVoice
  private smoke = 0
  private rushing = false
  private rushClock = 0
  private skidding = false
  /** each foot where its furrow last reached (world) */
  private readonly ploughed: Record<'L' | 'R', Vector3> = { L: new Vector3(), R: new Vector3() }

  constructor(parts: ThunderParts) {
    this.p = parts
    this.arc = new ArcVoice(parts.mix)
    for (let i = 0; i < FRONT.rays; i++) {
      this.rays.push(0)
      this.rayStruck.push(0)
      this.rayLaid.push(false)
    }
  }

  /** Handle a special cue; false when it is not one of these. */
  cue(cue: MoveCue, frame: CombatFrame): boolean {
    const v = cue.value ?? 1
    const p = this.p
    switch (cue.cue) {
      case 'zone':
        frame.camera.zone(v)
        p.mix.muffle(v * 0.45, v > 0 ? 0.4 : 0.15)
        return true
      case 'hush': p.mix.muffle(v, 0.25); return true
      case 'charge': this.chargeTarget = v; return true
      case 'break': this.breakGround(frame, v); return true
      case 'rush': this.rushing = v > 0; return true
      case 'skid':
        this.skidding = v > 0
        if (this.skidding) for (const side of ['L', 'R'] as const) this.p.foot(side, this.ploughed[side])
        return true
      case 'launch': this.launch(frame, v); return true
      case 'plant': this.plant(frame, v); return true
      case 'lightning':
        if (v > 0) this.start()
        else this.running = false
        return true
      case 'strain': this.straining = v > 0; return true
      case 'unplant': this.unplant(frame); return true
      case 'crackle': this.crackling = v > 0; return true
      case 'finale': this.finale(frame, v); return true
    }
    return false
  }

  update(dt: number, frame: CombatFrame | null): void {
    const p = this.p
    const up = this.chargeTarget > this.charge
    this.charge += Math.sign(this.chargeTarget - this.charge) * Math.min(Math.abs(this.chargeTarget - this.charge), dt * (up ? CHARGE_RISE : CHARGE_FALL))
    if (p.weapon) p.weapon.charge = this.charge
    this.lightLevel = Math.max(0, this.lightLevel - dt * 9)
    if (this.running) this.discharge(dt, frame)
    if (this.crackling) this.crackle(dt)
    if (this.straining) this.strain(dt)
    this.arc.update(this.running ? 1 : this.crackling ? 0.4 : 0)
    // the light follows the newest channel, flickering with the current
    p.light.intensity = THUNDER_LIGHT.peak * this.lightLevel * (0.55 + 0.45 * Math.random())
    if (this.smoke > 0) this.smolder(dt)
    if (frame && this.rushing) this.rush(dt, frame)
    if (this.skidding) this.plough()
  }

  reset(): void {
    this.charge = this.chargeTarget = 0
    if (this.p.weapon) this.p.weapon.charge = 0
    this.running = false
    this.crackling = false
    this.straining = false
    this.lightLevel = 0
    this.p.light.intensity = 0
    this.arc.update(0)
    this.smoke = 0
    this.rushing = false
    this.skidding = false
    this.p.mix.muffle(0, 0.2)
  }

  dispose(): void {
    this.arc.dispose()
  }

  /** The spring: the sand under it breaks. */
  private breakGround(frame: CombatFrame, strength: number): void {
    const p = this.p
    const c = this.standing(frame, _c)
    // the robot's facing: the cracks run out behind it, the crust thrown back and up
    const yaw = frame.state.yaw
    p.contact.crater(c, 2.6 * strength, 0)
    p.contact.surge(c, 2.4, 0.55 * strength)
    _d.set(-Math.sin(yaw) * 0.6, 0.8, -Math.cos(yaw) * 0.6).normalize()
    p.contact.eject(c, 11 * strength, 46, _d, 0.7, 0.55)
    for (let k = 0; k < 7; k++) {
      // cracks out from the break, more of them behind it (the thrust went into the sand back there)
      const a = yaw + Math.PI + (k / 6 - 0.5) * 2.6 + (Math.random() - 0.5) * 0.3
      const r0 = 1.1, r1 = 2.6 + Math.random() * 2.6
      _a.set(c.x + Math.sin(a) * r0, c.y, c.z + Math.cos(a) * r0)
      _b.set(c.x + Math.sin(a) * r1, c.y, c.z + Math.cos(a) * r1)
      _a.y = p.contact.height(_a.x, _a.z)
      _b.y = p.contact.height(_b.x, _b.z)
      p.contact.furrow(_a, _b, 0.14 + Math.random() * 0.08, 0)
    }
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2
      _d.set(Math.cos(a), 0.15, Math.sin(a))
      p.billows.emit({ count: 1, at: c, jitter: 1.2, dir: _d, spread: 0.15, speed: [6, 12], life: [1.8, 3.2], size: [1.2, 4.6], heat: 0, drag: 1.8, buoyancy: 0.3, tone: 1, opacity: 0.42 * strength })
    }
    p.billows.emit({ count: 10, at: _a.copy(c).setY(c.y + 0.6), jitter: 1.4, dir: _d.set(-Math.sin(yaw), 1.6, -Math.cos(yaw)).normalize(), spread: 0.35, speed: [5, 11], life: [2, 3.4], size: [1.4, 5], heat: 0, drag: 1.4, buoyancy: 0.4, tone: 1, opacity: 0.4 * strength })
    p.thud(strength)
    explosion(p.mix, { strength: 0.45 * strength, distance: HEARD.ground, subHz: 38, debris: 0.8 })
    frame.camera.kick(0.7 * strength)
    frame.camera.shake(0.55 * strength)
  }

  /** The charge at speed: sand torn up and thrown back from under it, the air it shoves ahead shimmering. */
  private rush(dt: number, frame: CombatFrame): void {
    const p = this.p
    this.rushClock -= dt
    if (this.rushClock > 0) return
    this.rushClock = 0.03
    const c = this.standing(frame, _c)
    const yaw = frame.state.yaw
    const fx = Math.sin(yaw), fz = Math.cos(yaw)
    // torn up from under it and flung back, low
    _a.set(c.x - fx * 1.5, c.y, c.z - fz * 1.5)
    _d.set(-fx, 0.35, -fz).normalize()
    p.billows.emit({ count: 2, at: _a, jitter: 1.2, dir: _d, spread: 0.3, speed: [5, 11], life: [1.2, 2.4], size: [1, 3.6], heat: 0, drag: 2, buoyancy: 0.3, tone: 1, opacity: 0.34 })
    p.contact.burst(_a, 0.9, 10)
    // the air shoved ahead of it
    _b.set(c.x + fx * 4, c.y + 2.6, c.z + fz * 4)
    p.haze.emit({ at: _b, jitter: 0.8, size: [2, 3.2], rise: 0.2, life: [0.15, 0.25], strength: 0.55 })
  }

  /** The skid: each foot ploughs its furrow on from where it last reached, spraying sand ahead of it. */
  private plough(): void {
    const p = this.p
    for (const side of ['L', 'R'] as const) {
      const at = p.foot(side, _a)
      const from = this.ploughed[side]
      if (at.distanceTo(from) < 0.3) continue
      at.y = p.contact.height(at.x, at.z)
      from.y = p.contact.height(from.x, from.z)
      p.contact.furrow(from, at, 0.32, 0)
      _d.subVectors(at, from).setY(0).normalize().setY(0.6).normalize()
      p.contact.burst(at, 1, 14)
      p.billows.emit({ count: 1, at, jitter: 0.5, dir: _d, spread: 0.3, speed: [3, 7], life: [1, 2], size: [0.8, 2.6], heat: 0, drag: 2, buoyancy: 0.3, tone: 1, opacity: 0.3 })
      from.copy(at)
    }
  }

  /** The rising cut's blow: everything round it thrown up on a wave of wind and sand. */
  private launch(frame: CombatFrame, strength: number): void {
    const p = this.p
    const c = this.standing(frame, _c)
    p.rings.emit(_a.copy(c).setY(c.y + 1.4), 2.5, THUNDER.reach + 4, 0.55, 1.8)
    p.contact.surge(c, 3.2, 0.6 * strength)
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2 + Math.random() * 0.2
      const r = 3 + Math.random() * 7
      _a.set(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r)
      _a.y = p.contact.height(_a.x, _a.z)
      // thrown up and a little out
      _d.set(Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35).normalize()
      p.billows.emit({ count: 1, at: _a, jitter: 0.8, dir: _d, spread: 0.2, speed: [8, 18], life: [1.6, 2.8], size: [1, 4.2], heat: 0, drag: 1.6, buoyancy: 0.35, tone: 1, opacity: 0.38 * strength })
    }
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2
      _a.set(c.x + Math.cos(a) * 4.5, c.y + 2.2, c.z + Math.sin(a) * 4.5)
      p.haze.emit({ at: _a, jitter: 1, size: [2.4, 3.6], rise: 1.2, life: [0.25, 0.45], strength: 0.9 * strength })
    }
    frame.camera.shockwave(_a.copy(c).setY(c.y + 1.5), 0.55 * strength)
    frame.camera.kick(0.6 * strength)
    frame.camera.shake(0.4 * strength)
    frame.camera.punch(7, 0.3)
    p.thud(strength)
  }

  /** The blade into the sand: the discharge's root. */
  private plant(frame: CombatFrame, strength: number): void {
    const p = this.p
    const c = this.tip(frame, this.root)
    p.contact.crater(c, 1.6 * strength, 0.85 * strength)
    p.contact.burst(c, 1.4 * strength, 30)
    p.sparks.emit({ count: Math.round(90 * strength), at: _a.copy(c).setY(c.y + 0.2), dir: _up, spread: 0.65, speed: [4, 15], life: [0.4, 1.3], size: 0.02, drag: 0.8, gravity: 1, palette: 0, jitter: 0.5 })
    for (let k = 0; k < 6; k++) {
      // the first discharge: a few channels straight up off the blade and out over the sand
      const a = Math.random() * Math.PI * 2
      _b.set(c.x + Math.cos(a) * (3 + Math.random() * 4), 0, c.z + Math.sin(a) * (3 + Math.random() * 4))
      _b.y = p.contact.height(_b.x, _b.z)
      p.lightning.strike(_a.copy(c).setY(c.y + 0.1), _b, GROUND, true)
    }
    p.blast.flash(_a.copy(c).setY(c.y + 1.5), 0xff6070, 260 * strength, 0.45, 40)
    this.flashLight(c)
    lightningStrike(p.mix, 1.1 * strength, 9)
    p.thud(strength)
    frame.camera.kick(0.55)
    frame.camera.shake(0.4)
    frame.camera.flash(0.18, 0.2)
  }

  private start(): void {
    this.running = true
    this.age = 0
    this.clap = 0
    this.airClock = 0
    for (let i = 0; i < FRONT.rays; i++) {
      this.rays[i] = (i / FRONT.rays) * Math.PI * 2 + (Math.random() - 0.5) * 0.4
      this.rayStruck[i] = -1
      this.rayLaid[i] = false
    }
  }

  /** The discharge at work: the front running out, its channels re-struck, the bodies over it struck from the sand under them. */
  private discharge(dt: number, frame: CombatFrame | null): void {
    const p = this.p
    this.age += dt
    const reach = Math.min(FRONT.reach, 1 + FRONT.speed * this.age)
    const c = this.root
    // the main channels out to the front, re-struck in a ragged rhythm; each lays its fused trace once at full length
    for (let i = 0; i < FRONT.rays; i++) {
      if (this.age - this.rayStruck[i] < FRONT.restrike * (0.6 + Math.random() * 0.8)) continue
      this.rayStruck[i] = this.age
      const a = this.rays[i] + (Math.random() - 0.5) * 0.12
      const r = reach * (0.82 + Math.random() * 0.18)
      _b.set(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r)
      _b.y = p.contact.height(_b.x, _b.z)
      p.lightning.strike(_a.copy(c).setY(c.y + 0.05), _b, GROUND, true)
      if (Math.random() < ARCH.share) {
        // arched off the blade high over the sand, landing out at the front
        _b.set(c.x + Math.cos(a + (Math.random() - 0.5) * 0.3) * r * 0.85, 0, c.z + Math.sin(a + (Math.random() - 0.5) * 0.3) * r * 0.85)
        _b.y = p.contact.height(_b.x, _b.z)
        p.lightning.strike(_a.copy(c).setY(c.y + ARCH.height * (0.6 + Math.random() * 0.4)), _b, ARCHED)
      }
      if (!this.rayLaid[i] && reach >= FRONT.reach) {
        this.rayLaid[i] = true
        this.trace(a)
      }
    }
    // stray channels between them, wandering out from the root
    if (Math.random() < dt * 14) {
      const a = Math.random() * Math.PI * 2, r = reach * (0.3 + Math.random() * 0.6)
      _b.set(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r)
      _b.y = p.contact.height(_b.x, _b.z)
      p.lightning.strike(_a.copy(c).setY(c.y + 0.05), _b, GROUND, true)
    }
    this.flashLight(p.lightning.lastMid)
    // up into the bodies falling over it
    this.airClock += dt
    if (frame?.airborne && this.airClock >= AIR_STRIKE) {
      this.airClock = 0
      // the query's reach is a distance in space: the bodies are up to twenty metres over the sand, so it reaches high and they are taken by their ground distance
      const n = Math.min(this.bodies.length, frame.airborne(c, reach + AIR_HEIGHT, this.bodies))
      let struck = 0
      for (let i = 0; i < n && struck < AIR_BODIES; i++) {
        const body = this.bodies[i]
        if (Math.hypot(body.x - c.x, body.z - c.z) > reach || Math.random() < 0.25) continue
        struck++
        // from the sand under it, a little off, up into it
        const a = Math.random() * Math.PI * 2, off = 0.8 + Math.random() * 2.2
        _a.set(body.x + Math.cos(a) * off, 0, body.z + Math.sin(a) * off)
        _a.y = p.contact.height(_a.x, _a.z)
        p.lightning.strike(_a, body, AIR)
        p.sparks.emit({ count: 8, at: body, dir: _up, spread: 1, speed: [2, 8], life: [0.2, 0.6], size: 0.016, drag: 2, gravity: 0.8, palette: 0, jitter: 0.6 })
        // now and then the long arc straight from the blade's root to it
        if (Math.random() < 0.3) p.lightning.strike(_b.copy(c).setY(c.y + ARCH.height), body, AIR)
      }
    }
    // thunder: a clap now and then, its rumble under the crackle
    this.clap -= dt
    if (this.clap <= 0) {
      this.clap = CLAP * (0.7 + Math.random() * 0.8)
      lightningStrike(p.mix, 0.5 + Math.random() * 0.4, HEARD.ground)
    }
    if (Math.random() < dt * 8) p.haze.emit({ at: _a.copy(c).setY(c.y + 0.8), jitter: 0.5, size: [1.4, 2.4], rise: 0.8, life: [0.3, 0.5], strength: 0.6 })
  }

  /** A channel's fused trace in the sand along ray `a`: two straight runs, kinked, like the bolt's own path. */
  private trace(a: number): void {
    const p = this.p
    const c = this.root
    const bend = a + (Math.random() - 0.5) * 0.35
    const mid = FRONT.reach * (0.45 + Math.random() * 0.15)
    _a.set(c.x + Math.cos(a) * 1.2, 0, c.z + Math.sin(a) * 1.2)
    _b.set(c.x + Math.cos(bend) * mid, 0, c.z + Math.sin(bend) * mid)
    _a.y = p.contact.height(_a.x, _a.z)
    _b.y = p.contact.height(_b.x, _b.z)
    p.contact.furrow(_a, _b, FULGURITE.width, FULGURITE.heat)
    _a.set(c.x + Math.cos(a) * FRONT.reach * 0.92, 0, c.z + Math.sin(a) * FRONT.reach * 0.92)
    _a.y = p.contact.height(_a.x, _a.z)
    p.contact.furrow(_b, _a, FULGURITE.width * 0.8, FULGURITE.heat * 0.8)
  }

  /** The charged blade: small arcs crawling along it, and the air round it shimmering. */
  private crackle(dt: number): void {
    const p = this.p
    const w = p.weapon
    if (!w || w.presence < 0.9) return
    const W = w.object.matrixWorld
    const tip = w.asset.manifest.extent[1]
    const n = Math.min(3, Math.round(dt * 70))
    for (let k = 0; k < n; k++) {
      const z0 = 0.4 + Math.random() * (tip - 0.6), z1 = Math.min(tip, z0 + 0.3 + Math.random() * 0.8)
      _a.set((Math.random() - 0.3) * 0.08, (Math.random() - 0.5) * 0.06, z0).applyMatrix4(W)
      _b.set((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, z1).applyMatrix4(W)
      p.lightning.strike(_a, _b, BLADE)
    }
    if (Math.random() < dt * 10) {
      _a.set(0, 0, tip * 0.6).applyMatrix4(W)
      p.haze.emit({ at: _a, jitter: 0.6, size: [1.2, 2], rise: 0.5, life: [0.25, 0.4], strength: 0.5 })
    }
    this.lightLevel = Math.max(this.lightLevel, 0.25)
    _a.set(0, 0, tip * 0.5).applyMatrix4(W)
    p.light.position.copy(_a)
    p.light.color.setHex(THUNDER_LIGHT.color)
    p.light.distance = THUNDER_LIGHT.range * 0.5
  }

  /** The buried blade hauled on: the sand round it trickling and spitting, small arcs off the root. */
  private strain(dt: number): void {
    const p = this.p
    this.strainClock -= dt
    if (this.strainClock > 0) return
    this.strainClock = 0.07 + Math.random() * 0.05
    const c = this.root
    const a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 0.6
    _a.set(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r)
    _a.y = p.contact.height(_a.x, _a.z)
    p.contact.burst(_a, 0.45 + Math.random() * 0.3, 6)
    p.sparks.emit({ count: 6, at: _a, dir: _up, spread: 0.6, speed: [1.5, 5], life: [0.15, 0.4], size: 0.014, drag: 2, gravity: 1, palette: 0, jitter: 0.2 })
    _b.set(c.x + Math.cos(a) * (1 + Math.random() * 1.5), 0, c.z + Math.sin(a) * (1 + Math.random() * 1.5))
    _b.y = p.contact.height(_b.x, _b.z)
    p.lightning.strike(_a.copy(c).setY(c.y + 0.15), _b, BLADE, true)
    this.lightLevel = Math.max(this.lightLevel, 0.3)
  }

  /** The blade torn out of the sand. */
  private unplant(frame: CombatFrame): void {
    const p = this.p
    const c = this.root
    p.contact.burst(c, 1.6, 34)
    p.contact.surge(c, 1.4, 0.3)
    p.thud(0.8)
    frame.camera.shake(0.25)
    p.sparks.emit({ count: 60, at: _a.copy(c).setY(c.y + 0.3), dir: _up, spread: 0.5, speed: [3, 9], life: [0.3, 0.9], size: 0.016, drag: 1, gravity: 1, palette: 0, jitter: 0.3 })
    for (let k = 0; k < 3; k++) {
      _b.set(c.x + (Math.random() - 0.5) * 3, c.y + 1 + Math.random() * 2, c.z + (Math.random() - 0.5) * 3)
      p.lightning.strike(_a.copy(c).setY(c.y + 0.2), _b, BLADE)
    }
    frame.camera.kick(0.2)
    this.smoke = 5
  }

  /** The swing's wave going out all round. */
  private finale(frame: CombatFrame, strength: number): void {
    const p = this.p
    const cam = frame.camera
    const c = this.standing(frame, _c)
    // the full circle of the cut, at the blade's height, from its right round to the left and on
    const w = p.weapon
    const height = w && w.presence > 0.5 ? _a.setFromMatrixPosition(w.object.matrixWorld).y : c.y + 3.4
    const reach = w ? w.asset.manifest.extent[1] : 4.5
    p.sweep.emit(_b.set(c.x, height, c.z), frame.state.yaw - Math.PI / 2, 1, CIRCLE.inner, CIRCLE.inner + reach + CIRCLE.beyond, CIRCLE.roll, CIRCLE.sweep, CIRCLE.life, CIRCLE.strength * strength)
    p.rings.emit(_a.copy(c).setY(c.y + 2.6), 3, 40, 1.0, 2.8)
    p.rings.emit(_a.copy(c).setY(c.y + 0.7), 2, 30, 0.85, 1.2)
    p.contact.surge(c, 7, 1.0 * strength)
    p.contact.eject(c, 16 * strength, 60, _up, 0.85, 0.5)
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2
      _d.set(Math.cos(a), 0.1, Math.sin(a))
      _a.set(c.x + Math.cos(a) * 2.5, c.y + 0.4, c.z + Math.sin(a) * 2.5)
      p.billows.emit({ count: 1, at: _a, jitter: 1.4, dir: _d, spread: 0.08, speed: [16, 28], life: [2.4, 4.4], size: [1.6, 7], heat: 0, drag: 1.5, buoyancy: 0.25, tone: 1, opacity: 0.46 * strength })
    }
    for (let k = 0; k < 16; k++) {
      // the discharge let go all at once along the sand behind the wave
      const a = (k / 16) * Math.PI * 2 + Math.random() * 0.2
      _b.set(c.x + Math.cos(a) * (9 + Math.random() * 7), 0, c.z + Math.sin(a) * (9 + Math.random() * 7))
      _b.y = p.contact.height(_b.x, _b.z)
      p.lightning.strike(_a.copy(c).setY(c.y + 0.1), _b, GROUND, true)
    }
    p.blast.flash(_a.copy(c).setY(c.y + 2.6), 0xff4a5a, 520 * strength, 0.8, 70)
    this.flashLight(_a)
    cam.shockwave(_a.copy(c).setY(c.y + 2), 1.25 * strength)
    cam.flash(0.6 * strength, 0.35)
    cam.kick(1)
    cam.shake(1)
    cam.hitStop(0.1, 0.05)
    explosion(p.mix, { strength: 1.25 * strength, distance: HEARD.finale, subHz: 32, debris: 1 })
    lightningStrike(p.mix, 1.3 * strength, 12)
    this.crackling = false
  }

  /** The broken glass at the root smoking as it cools. */
  private smolder(dt: number): void {
    this.smoke -= dt
    const k = Math.max(0, this.smoke / 5)
    if (Math.random() < dt * 10 * k) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 1.2
      _a.set(this.root.x + Math.cos(a) * r, this.root.y + 0.2, this.root.z + Math.sin(a) * r)
      this.p.billows.emit({ count: 1, at: _a, jitter: 0.3, dir: _up, spread: 0.2, speed: [0.4, 1.2], life: [2, 3.4], size: [0.4, 2.4], heat: 900, drag: 0.8, buoyancy: 1.2, tone: 0.25, opacity: 0.2 * k })
    }
  }

  private flashLight(at: Vector3): void {
    const light = this.p.light
    light.position.copy(at)
    light.position.y += 0.6
    light.color.setHex(THUNDER_LIGHT.color)
    light.distance = THUNDER_LIGHT.range
    this.lightLevel = 1
  }

  /** The robot's standing point on the ground. */
  private standing(frame: CombatFrame, out: Vector3): Vector3 {
    const s = frame.state
    out.set(s.pos.x + Math.sin(s.yaw) * this.p.robotOffset, 0, s.pos.z + Math.cos(s.yaw) * this.p.robotOffset)
    out.y = this.p.contact.height(out.x, out.z)
    return out
  }

  /** Where the blade's point meets the sand (its point, on the ground under it), or the standing point without a blade. */
  private tip(frame: CombatFrame, out: Vector3): Vector3 {
    const w = this.p.weapon
    if (!w || w.presence < 0.5) return this.standing(frame, out)
    out.set(0, 0, w.asset.manifest.extent[1]).applyMatrix4(w.object.matrixWorld)
    out.y = this.p.contact.height(out.x, out.z)
    return out
  }
}

const _up = new Vector3(0, 1, 0)
const _a = new Vector3()
const _b = new Vector3()
const _c = new Vector3()
const _d = new Vector3()
