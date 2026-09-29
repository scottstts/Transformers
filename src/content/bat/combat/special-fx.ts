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
import type { BatEffects } from '../effects'
import type { Vortex } from './fx/vortex'
import type { Lances } from './fx/lances'
import type { SpearAudio } from './audio/spear'

/** The crater (m): the bowl round the spear. */
const CRATER = 5.2
/** Seconds the fused glass smokes after the plunge. */
const SMOKE_TIME = 7
/** Where the listener stands from the plunge (m): the plunge shot's camera distance. */
const PLUNGE_HEARD_AT = 16
/** The spear's charge rates (1/s): heating through the climb, spent into the sand. */
const CHARGE_RISE = 1.6
const CHARGE_FALL = 3
/** The vortex over the ring: its reach (m), motes a second, swirl and draw (m/s), the column's lift (m). */
const VORTEX = { radius: 17, rate: 260, swirl: 7, draw: 5, lift: 6 }

/** What the special drives of the Bat's fighter. */
export interface DescentParts {
  bat: BatEffects
  weapon: Weapon | null
  contact: ContactEffects
  mix: AudioMix
  sparks: Sparks
  billows: Billows
  blast: BlastLight
  haze: HeatHaze
  vortex: Vortex
  lances: Lances
  spear: SpearAudio
  robotOffset: number
}

/**
 * Descent's effects (special.ts), by cue:
 *
 *   mark    (m ahead) the ring's centre is fixed on the sand: the vortex turns
 *           about it and the spear comes down on it
 *   zone    the world drained of colour and sound (value 0..1)
 *   launch  the spring off the sand: a ring of sand blown out, the thump
 *   vortex  (1 / 0) the air goes round with the ring: sand drawn in along a
 *           spiral and lifted into a column at the centre
 *   wake    (1 / 0) while it circles: the flame's hot wake and sparks behind
 *           it, sand ploughed up where the spear's point skims it
 *   burst   the jet to full as it pulls up: a bloom of fire off the nozzle,
 *           a flash, the ground below scoured
 *   charge  (0..1) the spear heats: the forging glow runs out to its head
 *   hush    the whole mix closes down (value 0..1)
 *   fall    the drop begins: the spear's heat trailing
 *   plunge  the spear goes into the sand: a crater of glass, the base surge,
 *           crust thrown up, a column of sand, molten droplets, a flash, the
 *           blast wave through the lens, the explosion as heard from the
 *           camera; the glass smokes and ticks as it cools
 *
 * The jet itself is the fighter's `burn` cue (the afterburner on the back).
 */
export class DescentFx {
  private readonly p: DescentParts
  private charge = 0
  private chargeTarget = 0
  private vortexOn = false
  private waking = false
  private smoke = 0
  private readonly center = new Vector3()
  private marked = false

  constructor(parts: DescentParts) {
    this.p = parts
  }

  /** Handle a special cue; false when it is not one of these. */
  cue(cue: MoveCue, frame: CombatFrame): boolean {
    const v = cue.value ?? 1
    const p = this.p
    switch (cue.cue) {
      case 'mark': this.mark(frame, v); return true
      case 'zone':
        frame.camera.zone(v)
        p.mix.muffle(v * 0.5, v > 0 ? 0.45 : 0.15)
        return true
      case 'launch': this.launch(frame, v); return true
      case 'vortex': this.vortexOn = v > 0; return true
      case 'wake': this.waking = v > 0; return true
      case 'burst': this.burst(frame, v); return true
      case 'charge': this.chargeTarget = v; return true
      case 'hush': p.mix.muffle(v, 0.3); return true
      case 'fall': frame.camera.shake(0.2); return true
      case 'plunge': this.plunge(frame, v); return true
    }
    return false
  }

  update(dt: number): void {
    const p = this.p
    const up = this.chargeTarget > this.charge
    this.charge += Math.sign(this.chargeTarget - this.charge) * Math.min(Math.abs(this.chargeTarget - this.charge), dt * (up ? CHARGE_RISE : CHARGE_FALL))
    if (p.weapon) p.weapon.charge = this.charge
    if (this.vortexOn && this.marked) p.vortex.emit(this.center, VORTEX.radius, VORTEX.rate, dt, -1, VORTEX.swirl, VORTEX.draw, VORTEX.lift)
    if (this.waking) this.wake(dt)
    // a heated spear sheds sparks and shimmers the air round its head
    if (p.weapon && p.weapon.presence > 0.9 && this.charge > 0.3) {
      const n = Math.min(5, Math.round(dt * 60 * this.charge))
      for (let k = 0; k < n; k++) {
        _a.set((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, 1.8 + Math.random() * 1.2).applyMatrix4(p.weapon.object.matrixWorld)
        p.sparks.emit({ count: 1, at: _a, dir: _up, spread: 1, speed: [0.3, 2], life: [0.2, 0.5], size: 0.012, drag: 3, gravity: -0.1, palette: 0 })
      }
      if (Math.random() < dt * 12) {
        _a.set(0, 0, 2.5).applyMatrix4(p.weapon.object.matrixWorld)
        p.haze.emit({ at: _a, jitter: 0.4, size: [1.2, 2], rise: 0.6, life: [0.3, 0.5], strength: 0.6 * this.charge })
      }
    }
    if (this.smoke > 0) this.smolder(dt)
  }

  reset(): void {
    this.charge = this.chargeTarget = 0
    if (this.p.weapon) this.p.weapon.charge = 0
    this.vortexOn = false
    this.waking = false
    this.smoke = 0
    this.marked = false
    this.p.mix.muffle(0, 0.2)
  }

  /** The ring's centre, `ahead` m ahead of where the special began, on the sand. */
  private mark(frame: CombatFrame, ahead: number): void {
    const s = frame.state
    const along = this.p.robotOffset + ahead
    this.center.set(s.pos.x + Math.sin(s.yaw) * along, 0, s.pos.z + Math.cos(s.yaw) * along)
    this.center.y = this.p.contact.height(this.center.x, this.center.z)
    this.marked = true
  }

  /** The spring off the sand. */
  private launch(frame: CombatFrame, strength: number): void {
    const p = this.p
    this.standing(frame, _c)
    p.contact.surge(_c, 1.1, 0.35 * strength)
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2
      _d.set(Math.cos(a), 0.1, Math.sin(a))
      p.billows.emit({ count: 1, at: _c, jitter: 1, dir: _d, spread: 0.12, speed: [7, 13], life: [2, 3.4], size: [1.2, 5], heat: 0, drag: 1.8, buoyancy: 0.3, tone: 1, opacity: 0.45 })
    }
    slam(p.mix, 0.7 * strength, 44)
    frame.camera.kick(0.5)
  }

  /** While it circles: the flame's hot wake behind it, the spear's point ploughing the sand. */
  private wake(dt: number): void {
    const p = this.p
    const jet = p.bat.afterburner
    if (jet.power > 0.3) {
      _a.copy(jet.lip).addScaledVector(jet.axis, 2.4 + Math.random() * 1.5)
      p.billows.emit({ count: Math.min(3, Math.max(1, Math.round(dt * 90))), at: _a, jitter: 0.7, dir: jet.axis, spread: 0.3, speed: [1, 4], life: [1.2, 2.2], size: [1.2, 4.5], heat: 1300, drag: 2.2, buoyancy: 0.7, tone: 0.8, opacity: 0.3 })
      p.sparks.emit({ count: Math.min(3, Math.round(dt * 120)), at: jet.lip, dir: jet.axis, spread: 0.25, speed: [5, 16], life: [0.2, 0.5], size: 0.018, drag: 2.5, gravity: 0.2, palette: 0, jitter: 0.2 })
    }
    const w = p.weapon
    if (w && w.presence > 0.9) {
      _a.set(0, 0, 3.0).applyMatrix4(w.object.matrixWorld)
      const ground = p.contact.height(_a.x, _a.z)
      if (_a.y - ground < 0.6 && Math.random() < dt * 30) {
        _a.y = ground
        p.contact.burst(_a, 0.9, 8)
      }
    }
  }

  /** The jet to full as it pulls up: fire off the nozzle, a flash, the ground below scoured. */
  private burst(frame: CombatFrame, strength: number): void {
    const p = this.p
    const jet = p.bat.afterburner
    p.billows.emit({ count: 14, at: _a.copy(jet.lip).addScaledVector(jet.axis, 1.2), jitter: 0.9, dir: jet.axis, spread: 0.45, speed: [4, 12], life: [0.5, 1.1], size: [1.2, 4.5], heat: 2100, drag: 2.6, buoyancy: 2.5, tone: 0.7, opacity: 0.3 })
    p.blast.flash(_a.copy(jet.lip).addScaledVector(jet.axis, 1.5), 0xffb070, 260 * strength, 0.6, 40)
    this.standing(frame, _c)
    p.contact.surge(_c, 1.6, 0.4 * strength)
    frame.camera.kick(0.6 * strength)
    frame.camera.shake(0.5 * strength)
    frame.camera.flash(0.25 * strength, 0.25)
    slam(p.mix, 0.8 * strength, 38)
  }

  /** The spear goes into the sand where the vortex drew everything. */
  private plunge(frame: CombatFrame, strength: number): void {
    const p = this.p
    const cam = frame.camera
    const c = this.marked ? _c.copy(this.center) : this.standing(frame, _c)
    // the spear's point: where it went in
    if (p.weapon && p.weapon.presence > 0.5) {
      _a.set(0, 0, 3.0).applyMatrix4(p.weapon.object.matrixWorld)
      c.x = _a.x
      c.z = _a.z
      c.y = p.contact.height(c.x, c.z)
    }
    p.contact.crater(c, CRATER * strength, strength)
    p.contact.surge(c, 3.4, 0.8 * strength)
    p.contact.eject(c, 22 * strength, 70, _up, 0.6, 0.62)
    // the heat of the spear meeting the sand, the column thrown up, the ring rolling out
    p.billows.emit({ count: 18, at: _a.copy(c).setY(c.y + 1.1), jitter: 1.4, dir: _up, spread: 1, speed: [4, 11], life: [0.5, 1], size: [1.4, 5.5], heat: 2600, drag: 2.8, buoyancy: 5, tone: 0.7, opacity: 0.3 })
    p.billows.emit({ count: 28, at: _a.copy(c).setY(c.y + 1), jitter: 2.4, dir: _up, spread: 0.3, speed: [6, 24], life: [3.5, 6.4], size: [2, 8.5], heat: 0, drag: 1.1, buoyancy: 0.5, tone: 1, opacity: 0.44 })
    for (let k = 0; k < 30; k++) {
      const a = (k / 30) * Math.PI * 2
      _d.set(Math.cos(a), 0.08, Math.sin(a))
      p.billows.emit({ count: 1, at: c, jitter: 2, dir: _d, spread: 0.1, speed: [13, 23], life: [3, 5], size: [1.6, 7], heat: 0, drag: 1.5, buoyancy: 0.2, tone: 1, opacity: 0.44 })
    }
    p.sparks.emit({ count: 160, at: _a.copy(c).setY(c.y + 0.4), dir: _up, spread: 0.7, speed: [6, 22], life: [0.9, 2.4], size: 0.028, drag: 0.35, gravity: 1, palette: 0, jitter: 2.2 })
    // lances of light out along the ground: the vortex's air let go all at once
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2 + Math.random() * 0.2
      _d.set(Math.cos(a), 0.05, Math.sin(a)).normalize()
      p.lances.emit(_a.copy(c).setY(c.y + 0.6).addScaledVector(_d, 1.2), _d, 5 + Math.random() * 4, 0.14)
    }
    p.blast.flash(_a.copy(c).setY(c.y + 2.4), 0xffc890, 460 * strength, 0.8, 60)
    cam.shockwave(c, 1.1 * strength)
    cam.flash(0.75 * strength, 0.35)
    cam.kick(1)
    cam.shake(1)
    cam.hitStop(0.1, 0.05)
    explosion(p.mix, { strength: 1.3 * strength, distance: PLUNGE_HEARD_AT, subHz: 34, debris: 1 })
    slam(p.mix, 1.5 * strength, 32)
    p.spear.play('poke', 1.5, 0.7)
    sizzle(p.mix, 6, strength)
    this.vortexOn = false
    this.smoke = SMOKE_TIME
  }

  /** The fused glass smokes as it cools. */
  private smolder(dt: number): void {
    this.smoke -= dt
    const k = Math.max(0, this.smoke / SMOKE_TIME)
    const c = this.center
    if (Math.random() < dt * 14 * k) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * CRATER * 0.55
      _c.set(c.x + Math.cos(a) * r, c.y + 1, c.z + Math.sin(a) * r)
      this.p.haze.emit({ at: _c, jitter: 0.8, size: [2.6, 4.8], rise: 1.4, life: [1, 1.7], strength: 0.3 + 0.9 * k })
    }
    if (Math.random() < dt * 9 * k) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * CRATER * 0.6
      _a.set(c.x + Math.cos(a) * r, c.y + 0.2, c.z + Math.sin(a) * r)
      this.p.billows.emit({ count: 1, at: _a, jitter: 0.3, dir: _up, spread: 0.2, speed: [0.4, 1.4], life: [2.5, 4], size: [0.5, 3.2], heat: 950, drag: 0.8, buoyancy: 1.2, tone: 0.25, opacity: 0.22 * k })
    }
  }

  /** The robot's standing point on the ground. */
  private standing(frame: CombatFrame, out: Vector3): Vector3 {
    const s = frame.state
    out.set(s.pos.x + Math.sin(s.yaw) * this.p.robotOffset, 0, s.pos.z + Math.cos(s.yaw) * this.p.robotOffset)
    out.y = this.p.contact.height(out.x, out.z)
    return out
  }
}

const _up = new Vector3(0, 1, 0)
const _a = new Vector3()
const _c = new Vector3()
const _d = new Vector3()
