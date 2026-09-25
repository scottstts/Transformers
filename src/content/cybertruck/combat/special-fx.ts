import { Vector3 } from 'three/webgpu'
import type { AudioMix } from '../../../audio/mix'
import type { ContactEffects } from '../../../game/contact-effects'
import type { CombatFrame } from '../../transformer/combat/effects'
import type { MoveCue } from '../../transformer/combat/moves'
import type { Weapon } from '../../transformer/combat/weapon'
import type { Sparks } from '../../transformer/combat/fx/sparks'
import type { Billows } from '../../transformer/combat/fx/billows'
import type { BlastLight } from '../../transformer/combat/fx/blast-light'
import type { HeatHaze } from '../../transformer/combat/fx/haze'
import { slam } from '../../transformer/combat/audio/shots'
import { explosion, sizzle } from '../../transformer/combat/audio/blast'
import type { CybertruckEffects } from '../effects'

/** Crater (m): bowl radius, and its centre ahead of the robot's standing point (between its knee and the axe head). */
const CRATER = { radius: 4.4, ahead: 1.4 }
/** Seconds the fused glass smokes after the impact. */
const SMOKE_TIME = 7
/** Where the listener stands from the impact (m): the impact shot's camera distance. */
const IMPACT_HEARD_AT = 21
/** Charge rates (1/s): building on the axe, discharged into the sand. */
const CHARGE_RISE = 2.2
const CHARGE_FALL = 3.5

/** What the special drives of the truck robot's fighter. */
export interface SkyfallParts {
  truck: CybertruckEffects
  weapon: Weapon | null
  contact: ContactEffects
  mix: AudioMix
  sparks: Sparks
  billows: Billows
  blast: BlastLight
  haze: HeatHaze
  robotOffset: number
}

/**
 * Skyfall's effects (special.ts), by cue:
 *
 *   visor   the visor flares (value: 0..1)
 *   charge  the axe overcharges with plasma (value: 0..1 target): its metal
 *           runs with light toward the head, its light bar flares and it
 *           sheds plasma sparks
 *   launch  the jets' first blast at full throttle strikes the sand: a surge
 *           of sand rolling out from under the robot, and the thump of it
 *   trail   while the dive's jets burn: plasma shed and hot gas behind them
 *   impact  the axe and the robot come down: fused-glass crater, base surge,
 *           crust thrown out, a column of sand, molten droplets and plasma, a
 *           flash of light, the blast wave through the lens, the explosion as
 *           heard from the camera; then the glass smokes and ticks as it cools
 *   hush    the whole mix closes down to a distant thud (value: 0..1)
 *
 * and heat shimmer wherever it is hot: in the jets' exhaust while they burn,
 * round the overcharged axe head, and rising off the cooling glass.
 *
 * The jets themselves (`lift` straight down, `dive` straight up and back) are
 * the fighter's thruster override (index.ts).
 */
export class SkyfallFx {
  private readonly p: SkyfallParts
  /** 0..1 the axe's charge, and where it is heading */
  charge = 0
  private chargeTarget = 0
  private visorTarget = 0
  private trailing = false
  private smoke = 0
  private readonly crater = new Vector3()

  constructor(parts: SkyfallParts) {
    this.p = parts
  }

  /** Handle a special cue; false when it is not one of these. */
  cue(cue: MoveCue, frame: CombatFrame): boolean {
    const v = cue.value ?? 1
    switch (cue.cue) {
      case 'visor': this.visorTarget = v; return true
      case 'charge': this.chargeTarget = v; return true
      case 'launch': this.launch(frame, v); return true
      case 'trail': this.trailing = v > 0; return true
      case 'impact': this.impact(frame, v); return true
      case 'hush': this.p.mix.muffle(v, 0.3); return true
    }
    return false
  }

  update(dt: number): void {
    const p = this.p
    const up = this.chargeTarget > this.charge
    this.charge += Math.sign(this.chargeTarget - this.charge) * Math.min(Math.abs(this.chargeTarget - this.charge), dt * (up ? CHARGE_RISE : CHARGE_FALL))
    if (p.weapon) p.weapon.charge = this.charge
    p.truck.visorBoost += (this.visorTarget - p.truck.visorBoost) * (1 - Math.exp(-dt * 6))
    // an overcharged axe sheds plasma from its head
    if (p.weapon && p.weapon.presence > 0.9 && this.charge > 0.25) {
      const n = Math.min(6, Math.round(dt * 70 * this.charge))
      for (let k = 0; k < n; k++) {
        _a.set((Math.random() - 0.2) * 1.1, (Math.random() - 0.5) * 0.2, 1.2 + Math.random() * 1.5).applyMatrix4(p.weapon.object.matrixWorld)
        p.sparks.emit({ count: 1, at: _a, dir: _up, spread: 1, speed: [0.3, 2.4], life: [0.2, 0.55], size: 0.014, drag: 3, gravity: -0.1, palette: 1 })
      }
    }
    if (this.trailing) this.trail(dt)
    if (this.smoke > 0) this.smolder(dt)
    this.shimmer(dt)
  }

  /** Hot air: the jets' exhaust and the overcharged axe head. */
  private shimmer(dt: number): void {
    const p = this.p
    const jets = p.truck.thrusters
    if (jets.power > 0.15) {
      for (const port of jets.ports) {
        if (Math.random() > dt * 22) continue
        _a.copy(port).addScaledVector(jets.axis, 0.6 + Math.random() * 2.4)
        p.haze.emit({ at: _a, jitter: 0.5, size: [1.4, 2.8], rise: 0.8, life: [0.3, 0.55], strength: Math.min(1.2, jets.power) })
      }
    }
    if (p.weapon && p.weapon.presence > 0.9 && this.charge > 0.3 && Math.random() < dt * 14) {
      _a.set(0.4, 0, 2).applyMatrix4(p.weapon.object.matrixWorld)
      p.haze.emit({ at: _a, jitter: 0.6, size: [1.6, 2.4], rise: 0.6, life: [0.35, 0.6], strength: 0.7 * this.charge })
    }
  }

  reset(): void {
    this.charge = this.chargeTarget = 0
    this.visorTarget = 0
    this.p.truck.visorBoost = 0
    if (this.p.weapon) this.p.weapon.charge = 0
    this.trailing = false
    this.smoke = 0
    this.p.mix.muffle(0, 0.2)
  }

  /** The jets at full power strike the sand under the robot. */
  private launch(frame: CombatFrame, strength: number): void {
    const p = this.p
    this.standing(frame, _c)
    p.contact.surge(_c, 1.4, 0.45 * strength)
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2
      _d.set(Math.cos(a), 0.12, Math.sin(a))
      p.billows.emit({ count: 1, at: _c, jitter: 1.2, dir: _d, spread: 0.12, speed: [10, 18], life: [2.6, 4.2], size: [1.4, 6.5], heat: 0, drag: 1.7, buoyancy: 0.3, tone: 1, opacity: 0.5 })
    }
    slam(p.mix, 0.9 * strength, 40)
    frame.camera.kick(0.6)
  }

  /** The dive's jets leave plasma and hot gas behind them. */
  private trail(dt: number): void {
    const p = this.p
    const jets = p.truck.thrusters
    if (jets.power < 0.2) return
    for (const port of jets.ports) {
      _a.copy(port).addScaledVector(jets.axis, 2.2)
      p.sparks.emit({ count: Math.min(4, Math.round(dt * 150)), at: _a, dir: jets.axis, spread: 0.35, speed: [4, 14], life: [0.2, 0.6], size: 0.02, drag: 2.5, gravity: -0.1, palette: 1, jitter: 0.5 })
      // the exhaust's hot wake: glowing at first, then a pale trail hanging in the air behind the dive
      p.billows.emit({ count: Math.min(4, Math.max(2, Math.round(dt * 160))), at: _a, jitter: 0.9, dir: jets.axis, spread: 0.3, speed: [1, 5], life: [1.8, 3], size: [1.6, 6.5], heat: 1400, drag: 2, buoyancy: 0.6, tone: 0.85, opacity: 0.42 })
    }
  }

  /** The axe and the robot come down on the sand. */
  private impact(frame: CombatFrame, strength: number): void {
    const p = this.p
    const cam = frame.camera
    const c = this.standing(frame, this.crater)
    c.x += Math.sin(frame.state.yaw) * CRATER.ahead
    c.z += Math.cos(frame.state.yaw) * CRATER.ahead
    p.contact.crater(c, CRATER.radius * strength, strength)
    p.contact.surge(c, 3.2, 0.75 * strength)
    p.contact.eject(c, 21 * strength, 64, _up, 0.62, 0.62)
    // the flash of the plasma meeting the sand, the fireball, the column of sand and the ring of it
    p.billows.emit({ count: 16, at: _a.copy(c).setY(1.2), jitter: 1.6, dir: _up, spread: 1, speed: [4, 11], life: [0.5, 0.95], size: [1.5, 5.5], heat: 2500, drag: 2.8, buoyancy: 5, tone: 0.7, opacity: 0.3 })
    p.billows.emit({ count: 26, at: _a.copy(c).setY(1), jitter: 2.6, dir: _up, spread: 0.3, speed: [6, 24], life: [3.5, 6.2], size: [2, 8.5], heat: 0, drag: 1.1, buoyancy: 0.5, tone: 1, opacity: 0.42 })
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2
      _d.set(Math.cos(a), 0.08, Math.sin(a))
      p.billows.emit({ count: 1, at: c, jitter: 2, dir: _d, spread: 0.1, speed: [13, 22], life: [3, 5], size: [1.6, 7], heat: 0, drag: 1.5, buoyancy: 0.2, tone: 1, opacity: 0.42 })
    }
    p.sparks.emit({ count: 150, at: _a.copy(c).setY(0.4), dir: _up, spread: 0.72, speed: [6, 21], life: [0.9, 2.3], size: 0.028, drag: 0.35, gravity: 1, palette: 0, jitter: 2.4 })
    p.sparks.emit({ count: 90, at: _a.copy(c).setY(0.8), dir: _up, spread: 1, speed: [8, 26], life: [0.25, 0.9], size: 0.024, drag: 2, gravity: 0.15, palette: 1, jitter: 1.5 })
    p.blast.flash(_a.copy(c).setY(2.6), 0xcfe0ff, 420 * strength, 0.8, 60)
    cam.shockwave(c, strength)
    cam.flash(0.7 * strength, 0.35)
    cam.kick(1)
    cam.shake(1)
    cam.hitStop(0.1, 0.05)
    explosion(p.mix, { strength: 1.3 * strength, distance: IMPACT_HEARD_AT, subHz: 36, debris: 1 })
    slam(p.mix, 1.4 * strength, 34)
    sizzle(p.mix, 6, strength)
    this.smoke = SMOKE_TIME
  }

  /** The fused glass smokes as it cools. */
  private smolder(dt: number): void {
    this.smoke -= dt
    const k = Math.max(0, this.smoke / SMOKE_TIME)
    // the air over the glass shimmers as long as it is hot
    if (Math.random() < dt * 14 * k) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * CRATER.radius * 0.55
      _c.set(this.crater.x + Math.cos(a) * r, 1, this.crater.z + Math.sin(a) * r)
      this.p.haze.emit({ at: _c, jitter: 0.8, size: [2.6, 4.8], rise: 1.4, life: [1, 1.7], strength: 0.3 + 0.9 * k })
    }
    if (Math.random() < dt * 9 * k) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * CRATER.radius * 0.6
      _a.set(this.crater.x + Math.cos(a) * r, 0.2, this.crater.z + Math.sin(a) * r)
      this.p.billows.emit({ count: 1, at: _a, jitter: 0.3, dir: _up, spread: 0.2, speed: [0.4, 1.4], life: [2.5, 4], size: [0.5, 3.2], heat: 950, drag: 0.8, buoyancy: 1.2, tone: 0.25, opacity: 0.22 * k })
    }
  }

  /** The robot's standing point on the ground. */
  private standing(frame: CombatFrame, out: Vector3): Vector3 {
    const s = frame.state
    return out.set(s.pos.x + Math.sin(s.yaw) * this.p.robotOffset, 0, s.pos.z + Math.cos(s.yaw) * this.p.robotOffset)
  }
}

const _up = new Vector3(0, 1, 0)
const _a = new Vector3()
const _c = new Vector3()
const _d = new Vector3()
