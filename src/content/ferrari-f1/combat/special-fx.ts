import { Vector3, type Object3D } from 'three/webgpu'
import type { AudioMix } from '../../../audio/mix'
import type { ContactEffects } from '../../../game/contact-effects'
import type { CombatFrame } from '../../transformer/combat/effects'
import type { MoveCue } from '../../transformer/combat/moves'
import type { Weapon } from '../../transformer/combat/weapon'
import type { Sparks } from '../../transformer/combat/fx/sparks'
import type { Billows } from '../../transformer/combat/fx/billows'
import type { BlastLight } from '../../transformer/combat/fx/blast-light'
import type { HeatHaze } from '../../transformer/combat/fx/haze'
import { FireVoice, explosion, passBy, sandScrape, sizzle } from '../../transformer/combat/audio/blast'
import { REDLINE } from '../audio/power-unit'
import type { F1Effects } from '../effects'
import type { SlashArcs } from './fx/slashes'

/** The dragged tip is in the sand below this height (m); a glass segment is laid every SEGMENT m of it. */
const TIP_DOWN = 0.4
const SEGMENT = 0.6
const FURROW_WIDTH = 0.34
/** How fast fire runs along a furrow once it catches (m/s). */
const FIRE_SPEED = 38
/** Seconds from the flick to the centre going up. */
const BLAST_DELAY = 0.1
/** Rolling radius of the wheels the robot wears (m): they spin with its speed. */
const WHEEL_RADIUS = 0.36
/** Seconds the fire keeps burning after the blast. */
const BURN_TIME = 4.5
/** Where the listener stands from the blast (m): the stop shot's camera. */
const BLAST_HEARD_AT = 13

/** What the special drives of the racer's fighter. */
export interface RedLineParts {
  racer: F1Effects
  weapon: Weapon | null
  contact: ContactEffects
  mix: AudioMix
  sparks: Sparks
  billows: Billows
  blast: BlastLight
  slashes: SlashArcs
  haze: HeatHaze
  feet: [Object3D, Object3D]
  robotOffset: number
}

/** Something to set off later: fire at a point, at a world time. */
interface Pending { at: number; point: Vector3; kind: 'furrow' | 'arc' }

type Engine = 'off' | 'limiter' | 'drive' | 'coast'

/**
 * Red Line's effects (special.ts), by cue:
 *
 *   eyes      the eyes and visor flare (value 0..1)
 *   limiter   the power unit free-revs against its limiter, the rain light strobing
 *   zone      the world drained of colour and sound (value 0..1)
 *   drive     the power unit follows the robot's own speed through the gears (1),
 *             or lifts off and runs down on the overrun (0)
 *   engine    shut down (0)
 *   mark      the centre of the ring, as the first cut passes it
 *   arc       a cut starts (1): its arc is recorded from the edge, with the rush
 *             of it going past; or ends (0)
 *   drag      the blade's tip ploughs the sand (1/0): a molten furrow follows it,
 *             spitting sand and sparks
 *   ignite    the flick: the arcs flare one after another, the centre goes up, fire
 *             runs along every furrow from where it began, and burns on
 *
 * and each frame while dashing: dust wakes from the feet and the body, the
 * wheels it wears spinning with its speed. Heat shimmers off the robot while
 * its power unit sits on the limiter, along the hanging arcs (which shed
 * embers as they burn) and over the burning ring.
 */
export class RedLineFx {
  private readonly p: RedLineParts
  private engine: Engine = 'off'
  private readonly rev = { speed: 0, throttle: 0, neutral: undefined as number | undefined }
  private eyeTarget = 0
  private clock = 0
  private speed = 0
  private readonly last = new Vector3()
  private primed = false
  private cutting = false
  private dragging = false
  private readonly lastGround = new Vector3()
  private hasGround = false
  /** furrows laid: handle, start, end and how far along the blade's path it starts (m) */
  private readonly furrows: Array<{ handle: number; a: Vector3; b: Vector3; along: number }> = []
  private dragged = 0
  private readonly center = new Vector3()
  private readonly pending: Pending[] = []
  private burning = 0
  private blastAt = -1
  private readonly fire: FireVoice
  /** the camera the last frame came with (the blast goes off between cues) */
  private lastCamera: CombatFrame['camera'] | null = null

  constructor(parts: RedLineParts) {
    this.p = parts
    this.fire = new FireVoice(parts.mix)
  }

  /** The special owns the power unit while this is true. */
  get ownsEngine(): boolean {
    return this.engine !== 'off'
  }

  cue(cue: MoveCue, frame: CombatFrame): boolean {
    const v = cue.value ?? 1
    const p = this.p
    switch (cue.cue) {
      case 'eyes': this.eyeTarget = v; return true
      case 'limiter': this.engine = 'limiter'; return true
      case 'zone':
        frame.camera.zone(v)
        p.mix.muffle(v * 0.55, v > 0 ? 0.5 : 0.12)
        return true
      case 'drive': this.engine = v > 0 ? 'drive' : 'coast'; return true
      case 'engine': this.engine = 'off'; p.racer.rev = null; return true
      case 'mark': this.standing(frame, this.center); return true
      case 'arc':
        this.cutting = v > 0
        if (this.cutting) {
          p.slashes.begin()
          passBy(p.mix, 65, 0.42)
          frame.camera.kick(0.28)
          frame.camera.shake(0.22)
        } else p.slashes.end()
        return true
      case 'drag':
        this.dragging = v > 0
        this.hasGround = false
        return true
      case 'ignite': this.ignite(frame); return true
    }
    return false
  }

  /** Per frame, after the fighter has posed the weapon; `edgeBase` / `edgeTip` are its cutting edge (world). */
  update(dt: number, frame: CombatFrame, edgeBase: Vector3, edgeTip: Vector3): void {
    const p = this.p
    this.clock += dt
    this.lastCamera = frame.camera
    p.slashes.update(dt)
    p.racer.eyeBoost += (this.eyeTarget - p.racer.eyeBoost) * (1 - Math.exp(-dt * 6))
    this.track(dt, frame)
    this.drive(dt)
    const armed = !!p.weapon && p.weapon.presence > 0.9
    if (armed && this.cutting) p.slashes.add(edgeBase, edgeTip)
    if (armed && this.dragging) this.plough(edgeTip)
    this.release()
    if (this.burning > 0) this.burn(dt)
    this.shimmer(dt, frame)
  }

  /** Hot air off the power unit on the limiter, and along the arcs as they burn, shedding embers. */
  private shimmer(dt: number, frame: CombatFrame): void {
    const p = this.p
    if (this.engine === 'limiter' && Math.random() < dt * 12) {
      const s = frame.state
      this.standing(frame, _a).addScaledVector(_b.set(Math.sin(s.yaw), 0, Math.cos(s.yaw)), -0.5).setY(1.9)
      p.haze.emit({ at: _a, jitter: 0.5, size: [1.2, 2.4], rise: 1.2, life: [0.5, 0.8], strength: 0.55 })
    }
    for (let k = Math.min(4, Math.round(dt * 60)); k > 0; k--) {
      if (!p.slashes.randomPoint(_a, _heat)) continue
      if (Math.random() < 0.35) p.haze.emit({ at: _a, jitter: 0.4, size: [1.3, 2.4], rise: 0.5, life: [0.5, 0.9], strength: 0.85 * _heat.value })
      p.sparks.emit({ count: 1, at: _a, dir: _up, spread: 1, speed: [0.2, 1.1], life: [0.5, 1.3], size: 0.011, drag: 2.2, gravity: -0.12, palette: 0, jitter: 0.25 })
    }
  }

  reset(): void {
    this.engine = 'off'
    this.p.racer.rev = null
    this.eyeTarget = 0
    this.p.racer.eyeBoost = 0
    this.cutting = this.dragging = false
    this.primed = false
    this.furrows.length = 0
    this.pending.length = 0
    this.dragged = 0
    this.burning = 0
    this.blastAt = -1
    this.fire.update(0)
    this.p.slashes.reset()
    this.p.mix.muffle(0, 0.2)
  }

  dispose(): void {
    this.fire.dispose()
  }

  /** How fast the robot is going; dust off its feet and body at speed, its wheels spinning (the special's dash only). */
  private track(dt: number, frame: CombatFrame): void {
    if (this.engine !== 'drive' && this.engine !== 'coast') {
      this.primed = false
      this.speed = 0
      return
    }
    const at = this.standing(frame, _a)
    const measured = this.primed && dt > 0 ? at.distanceTo(this.last) / dt : 0
    this.last.copy(at)
    this.primed = true
    this.speed += (measured - this.speed) * (1 - Math.exp(-dt * 20))
    if (this.speed < 8) return
    frame.state.spin += this.speed / WHEEL_RADIUS * dt
    const p = this.p
    for (const foot of p.feet) {
      _b.setFromMatrixPosition(foot.matrixWorld)
      if (_b.y > 0.6 || Math.random() > dt * 40) continue
      _b.y = 0
      p.contact.burst(_b, Math.min(1.1, this.speed / 45), 3)
    }
    if (Math.random() < dt * 30) p.contact.burst(at, Math.min(1.2, this.speed / 40), 4)
  }

  /** The power unit: against its limiter, through the gears with the robot's speed, or running down. */
  private drive(dt: number): void {
    const rev = this.rev
    const racer = this.p.racer
    switch (this.engine) {
      case 'off': return
      case 'limiter':
        rev.speed = 0
        rev.throttle = 1
        rev.neutral = REDLINE
        break
      case 'drive':
        rev.speed = this.speed
        rev.throttle = 1
        rev.neutral = undefined
        break
      case 'coast':
        rev.speed = Math.max(0, rev.speed - dt * 40)
        rev.throttle = 0
        rev.neutral = undefined
        break
    }
    racer.rev = rev
  }

  /** The blade's tip in the sand: glass behind it, sand and sparks thrown off it. */
  private plough(tip: Vector3): void {
    if (tip.y > TIP_DOWN) {
      this.hasGround = false
      return
    }
    _a.set(tip.x, 0, tip.z)
    if (!this.hasGround) {
      this.lastGround.copy(_a)
      this.hasGround = true
      return
    }
    const d = _a.distanceTo(this.lastGround)
    if (d < SEGMENT) return
    const p = this.p
    const handle = p.contact.furrow(this.lastGround, _a, FURROW_WIDTH, 1)
    this.furrows.push({ handle, a: this.lastGround.clone(), b: _a.clone(), along: this.dragged })
    this.dragged += d
    _d.subVectors(_a, this.lastGround).normalize()
    p.contact.burst(_a, 0.7, 5)
    sandScrape(p.mix, 1)
    p.sparks.emit({ count: 6, at: _b.copy(_a).setY(0.1), dir: _d.set(_d.x, 1.2, _d.z).normalize(), spread: 0.5, speed: [2, 7], life: [0.3, 0.8], size: 0.016, drag: 1, gravity: 1, palette: 0 })
    this.lastGround.copy(_a)
  }

  /**
   * The flick: every arc flares, one after another, and fire runs along each
   * furrow from where the blade first bit; the centre goes up a moment later.
   */
  private ignite(frame: CombatFrame): void {
    const p = this.p
    const stagger = 0.05
    const sweep = 0.1
    p.slashes.ignite(0.02, stagger, sweep)
    p.slashes.forEachPoint(3, (point, arc, along) => {
      this.pending.push({ at: this.clock + 0.02 + arc * stagger + along * sweep, point: point.clone(), kind: 'arc' })
    })
    for (const f of this.furrows) {
      const delay = BLAST_DELAY + f.along / FIRE_SPEED
      p.contact.reignite(f.handle, delay, 0, FIRE_SPEED)
      this.pending.push({ at: this.clock + delay, point: f.a.clone().lerp(f.b, 0.5), kind: 'furrow' })
    }
    this.blastAt = this.clock + BLAST_DELAY
    frame.camera.kick(0.2)
  }

  /** Set off whatever has come due: the centre, flames along the arcs and the furrows. */
  private release(): void {
    const p = this.p
    if (this.blastAt >= 0 && this.clock >= this.blastAt) {
      this.blastAt = -1
      this.detonate()
    }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const e = this.pending[i]
      if (this.clock < e.at) continue
      this.pending.splice(i, 1)
      if (e.kind === 'arc') {
        p.billows.emit({ count: 2, at: e.point, jitter: 0.5, dir: _up, spread: 1, speed: [0.5, 2.5], life: [0.4, 0.75], size: [0.6, 2.4], heat: 2600, drag: 2.5, buoyancy: 3, tone: 0.3, opacity: 0.22 })
      } else {
        p.billows.emit({ count: 4, at: _a.copy(e.point).setY(0.35), jitter: 0.7, dir: _up, spread: 0.35, speed: [1, 4], life: [0.8, 1.6], size: [0.9, 3.8], heat: 2350, drag: 1.8, buoyancy: 5, tone: 0.25, opacity: 0.38 })
        p.sparks.emit({ count: 8, at: _a, dir: _up, spread: 0.6, speed: [1.5, 5], life: [0.6, 1.6], size: 0.014, drag: 1.2, gravity: -0.15, palette: 0, jitter: 0.4 })
      }
    }
  }

  /** The centre of the ring goes up. */
  private detonate(): void {
    const p = this.p
    const c = this.center
    p.contact.crater(c, 2.8, 0.75)
    p.contact.surge(c, 2.2, 0.55)
    p.contact.eject(c, 15, 36, _up, 0.7, 0.42)
    p.billows.emit({ count: 40, at: _a.copy(c).setY(1.6), jitter: 2, dir: _up, spread: 1, speed: [3, 12], life: [1.8, 2.8], size: [2.6, 10], heat: 2750, drag: 2, buoyancy: 8, tone: 0.3, opacity: 0.42 })
    p.billows.emit({ count: 24, at: _a.copy(c).setY(3), jitter: 2.4, dir: _up, spread: 0.35, speed: [3, 8], life: [4.5, 7], size: [3.5, 13], heat: 1000, drag: 0.9, buoyancy: 4, tone: 0.3, opacity: 0.32 })
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2
      _d.set(Math.cos(a), 0.1, Math.sin(a))
      p.billows.emit({ count: 1, at: c, jitter: 1.4, dir: _d, spread: 0.1, speed: [10, 16], life: [2.5, 4], size: [1.4, 6], heat: 0, drag: 1.6, buoyancy: 0.3, tone: 1, opacity: 0.4 })
    }
    p.sparks.emit({ count: 120, at: _a.copy(c).setY(0.8), dir: _up, spread: 0.8, speed: [5, 18], life: [0.8, 2], size: 0.022, drag: 0.5, gravity: 1, palette: 0, jitter: 1.5 })
    p.blast.flash(_a.copy(c).setY(2.5), 0xffc890, 380, 1.1, 50)
    const cam = this.lastCamera
    cam?.shockwave(c, 0.75)
    cam?.flash(0.45, 0.3)
    cam?.shake(0.85)
    cam?.kick(0.5)
    explosion(p.mix, { strength: 1, distance: BLAST_HEARD_AT, subHz: 44, debris: 0.8 })
    sizzle(p.mix, 4, 0.8)
    this.burning = BURN_TIME
  }

  /** The ring burns on and dies down: the fire's roar, flames and embers along the furrows. */
  private burn(dt: number): void {
    this.burning = Math.max(0, this.burning - dt)
    const k = this.burning / BURN_TIME
    this.fire.update(k * k * 1.2)
    const p = this.p
    if (Math.random() < dt * 9 * k) {
      p.haze.emit({ at: _a.copy(this.center).setY(2.5), jitter: 3, size: [4, 8], rise: 2.5, life: [1, 1.6], strength: 0.4 + 0.8 * k })
    }
    if (this.furrows.length && Math.random() < dt * 26 * k) {
      const f = this.furrows[Math.floor(Math.random() * this.furrows.length)]
      _a.copy(f.a).lerp(f.b, Math.random()).setY(0.3)
      p.billows.emit({ count: 1, at: _a, jitter: 0.3, dir: _up, spread: 0.3, speed: [0.8, 2.2], life: [0.6, 1.2], size: [0.6, 2.4], heat: 1900 + 600 * k, drag: 1.8, buoyancy: 3.5, tone: 0.2, opacity: 0.3 })
      p.sparks.emit({ count: 2, at: _a, dir: _up, spread: 0.5, speed: [0.8, 3], life: [0.8, 2], size: 0.012, drag: 1.5, gravity: -0.2, palette: 0 })
      if (Math.random() < 0.5) p.haze.emit({ at: _b.copy(_a).setY(1.2), jitter: 0.6, size: [1.8, 3.4], rise: 1.6, life: [0.7, 1.2], strength: 0.3 + 0.7 * k })
    }
    if (this.burning === 0) this.fire.update(0)
  }

  private standing(frame: CombatFrame, out: Vector3): Vector3 {
    const s = frame.state
    return out.set(s.pos.x + Math.sin(s.yaw) * this.p.robotOffset, 0, s.pos.z + Math.cos(s.yaw) * this.p.robotOffset)
  }
}

const _up = new Vector3(0, 1, 0)
const _a = new Vector3()
const _b = new Vector3()
const _d = new Vector3()
const _heat = { value: 0 }
