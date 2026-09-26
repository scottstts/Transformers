import { Vector3, type Object3D } from 'three/webgpu'
import type { AudioMix } from '../../../audio/mix'
import type { ContactEffects } from '../../../game/contact-effects'
import type { CombatFrame } from '../../transformer/combat/effects'
import type { MoveCue } from '../../transformer/combat/moves'
import type { Sparks } from '../../transformer/combat/fx/sparks'
import type { Billows } from '../../transformer/combat/fx/billows'
import type { BlastLight } from '../../transformer/combat/fx/blast-light'
import type { HeatHaze } from '../../transformer/combat/fx/haze'
import { explosion } from '../../transformer/combat/audio/blast'
import { slam } from '../../transformer/combat/audio/shots'
import type { SemiEffects } from '../effects'
import type { Gunnery } from './gunnery'

/** Rates (1/s) the eyes and lights follow their targets. */
const GLOW_RATE = 6
/** Where the finale's burst is heard from (m): the wide shot's camera. */
const FINALE_HEARD_AT = 24

/** What the special drives of the Semi's fighter. */
export interface JuggernautParts {
  semi: SemiEffects
  gun: Gunnery | null
  contact: ContactEffects
  mix: AudioMix
  sparks: Sparks
  billows: Billows
  blast: BlastLight
  haze: HeatHaze
  feet: [Object3D, Object3D]
  robotOffset: number
}

/**
 * Juggernaut's effects (special.ts), by cue; the gun's own (fire, charge,
 * fuse, cannon) are the fighter's (index.ts):
 *
 *   eyes    the eyes flare (value 0..1)
 *   lights  the light bar across the chest blazes (value 0..1+)
 *   air     the air brakes vent
 *   zone    the world drained of colour (value 0..1)
 *   hush    the mix closed down for the slow motion (value 0..1)
 *   stomp   the stamp: the ground heaves all round the robot (a surge rolling
 *           out, cracks running out from the foot, a ring of sand thrown up
 *           and out, crust flung up), the air shocks, the thump of it
 *   finale  the last shot's burst in the sky: a second blast of light, the
 *           wave through the lens, the burst's sound from off to the side,
 *           embers raining down for seconds
 *   smoke   (seconds) the gun smokes from its bores
 *
 * and one of the combo's: `gust` (strength), a kick's blast of air throwing
 * the sand ahead along it.
 */
export class JuggernautFx {
  private readonly p: JuggernautParts
  private eyes = 0
  private eyeTarget = 0
  private lights = 0
  private lightTarget = 0
  private rain = 0
  private smoke = 0
  private readonly rainAt = new Vector3()

  constructor(parts: JuggernautParts) {
    this.p = parts
  }

  /** Handle a special cue; false when it is not one of these. */
  cue(cue: MoveCue, frame: CombatFrame): boolean {
    const v = cue.value ?? 1
    switch (cue.cue) {
      case 'eyes': this.eyeTarget = v; return true
      case 'lights': this.lightTarget = v; return true
      case 'air': this.p.semi.audio.airBrakes(v); return true
      case 'zone': frame.camera.zone(v); return true
      case 'hush': this.p.mix.muffle(v, 0.3); return true
      case 'stomp': this.stomp(frame, v); return true
      case 'finale': this.finale(frame, v); return true
      case 'smoke': this.smoke = v; return true
      case 'gust': this.gust(frame, v); return true
    }
    return false
  }

  update(dt: number): void {
    const p = this.p
    const k = 1 - Math.exp(-dt * GLOW_RATE)
    this.eyes += (this.eyeTarget - this.eyes) * k
    this.lights += (this.lightTarget - this.lights) * k
    p.semi.eyeBoost = this.eyes
    p.semi.lightBoost = this.lights
    if (this.rain > 0) this.embers(dt)
    if (this.smoke > 0) this.smolder(dt)
  }

  reset(): void {
    this.eyes = this.eyeTarget = 0
    this.lights = this.lightTarget = 0
    this.p.semi.eyeBoost = 0
    this.p.semi.lightBoost = 0
    this.rain = 0
    this.smoke = 0
    this.p.mix.muffle(0, 0.2)
  }

  dispose(): void {
    this.reset()
  }

  /** A kick's gust: the sand ahead thrown along it. */
  private gust(frame: CombatFrame, strength: number): void {
    const s = frame.state
    const f = this.p.robotOffset + 3.2
    _a.set(s.pos.x + Math.sin(s.yaw) * f, 0, s.pos.z + Math.cos(s.yaw) * f)
    _d.set(Math.sin(s.yaw), 0.25, Math.cos(s.yaw)).normalize()
    this.p.contact.burst(_a, 0.9 * strength, 14)
    this.p.billows.emit({ count: Math.round(6 * strength), at: _a.setY(0.6), jitter: 1.2, dir: _d, spread: 0.3, speed: [4, 9], life: [1.2, 2], size: [0.8, 3.2], heat: 0, drag: 2, buoyancy: 0.2, tone: 1, opacity: 0.3 })
  }

  /** The stamp: the ground heaves all round the robot. */
  private stomp(frame: CombatFrame, strength: number): void {
    const p = this.p
    const st = frame.state
    const f = p.robotOffset
    const c = _c.set(st.pos.x + Math.sin(st.yaw) * f, 0, st.pos.z + Math.cos(st.yaw) * f)
    p.contact.surge(c, 5, 1.1 * strength)
    p.contact.eject(c, 16 * strength, 48, _up, 0.7, 0.55)
    // cracks running out from the foot through the crust
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + Math.random() * 0.4
      const r = 5 + Math.random() * 6
      _a.set(c.x + Math.cos(a) * 1.4, 0, c.z + Math.sin(a) * 1.4)
      _b.set(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r)
      p.contact.furrow(_a, _b, 0.35 + Math.random() * 0.2, 0)
    }
    // a ring of sand thrown up and out, rolling away across the whole circle
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2
      _d.set(Math.cos(a), 0.18, Math.sin(a)).normalize()
      p.billows.emit({ count: 1, at: _a.set(c.x + Math.cos(a) * 2, 0.4, c.z + Math.sin(a) * 2), jitter: 0.8, dir: _d, spread: 0.08, speed: [14, 24], life: [2.4, 3.6], size: [1.4, 6.5], heat: 0, drag: 1.4, buoyancy: 0.2, tone: 1, opacity: 0.36 })
    }
    p.billows.emit({ count: 10, at: _a.copy(c).setY(1), jitter: 2.5, dir: _up, spread: 0.3, speed: [5, 14], life: [2, 3.2], size: [1.5, 5.5], heat: 0, drag: 1.2, buoyancy: 0.4, tone: 1, opacity: 0.3 })
    p.sparks.emit({ count: 40, at: _a.copy(c).setY(0.3), dir: _up, spread: 0.8, speed: [4, 12], life: [0.3, 0.8], size: 0.02, drag: 1.5, gravity: 1, palette: 0, jitter: 2 })
    frame.camera.shockwave(c, 1.1 * strength)
    frame.camera.flash(0.12, 0.2)
    frame.camera.kick(1)
    frame.camera.shake(1)
    frame.camera.hitStop(0.1, 0.06)
    slam(p.mix, 1.5 * strength, 30)
    explosion(p.mix, { strength: 0.7 * strength, distance: 12, subHz: 30, debris: 1 })
  }

  /** The finale's burst: the sky lit, the wave through the lens, the sound of it, embers raining down after. */
  private finale(frame: CombatFrame, strength: number): void {
    const p = this.p
    const s = frame.state
    const f = p.robotOffset + 12
    this.rainAt.set(s.pos.x + Math.sin(s.yaw) * f, 11, s.pos.z + Math.cos(s.yaw) * f)
    this.rain = 5
    frame.camera.flash(0.6 * strength, 0.4)
    frame.camera.zone(0)
    // the burst heard from the wide shot, off to the side, late
    explosion(p.mix, { strength: 1.2 * strength, distance: FINALE_HEARD_AT, subHz: 32, debris: 0.8 })
    for (let k = 0; k < 3; k++) p.haze.emit({ at: this.rainAt, jitter: 6, size: [5, 9], rise: 1.5, life: [1.2, 2], strength: 1 })
  }

  /** Burning fragments and embers raining down out of the burst. */
  private embers(dt: number): void {
    this.rain -= dt
    const k = Math.max(0, this.rain / 5)
    const n = Math.min(4, Math.round(dt * 70 * k))
    for (let i = 0; i < n; i++) {
      _a.copy(this.rainAt).add(_b.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 14))
      this.p.sparks.emit({ count: 1, at: _a, dir: _down, spread: 0.5, speed: [1, 6], life: [1.2, 2.6], size: 0.024, drag: 0.6, gravity: 0.6, palette: 0 })
    }
    if (Math.random() < dt * 6 * k) {
      _a.copy(this.rainAt).add(_b.set((Math.random() - 0.5) * 10, -2, (Math.random() - 0.5) * 10))
      this.p.billows.emit({ count: 1, at: _a, jitter: 1, dir: _down, spread: 0.6, speed: [1, 4], life: [2, 3.5], size: [1, 3.5], heat: 1100, drag: 1.5, buoyancy: -0.4, tone: 0.2, opacity: 0.3 })
    }
  }

  /** The gun smokes from its bores after the last shot. */
  private smolder(dt: number): void {
    this.smoke -= dt
    const gun = this.p.gun
    if (!gun || Math.random() > dt * 9) return
    gun.muzzleSmoke(Math.min(1, this.smoke / 2))
  }
}

const _up = new Vector3(0, 1, 0)
const _down = new Vector3(0, -1, 0)
const _a = new Vector3()
const _b = new Vector3()
const _c = new Vector3()
const _d = new Vector3()
