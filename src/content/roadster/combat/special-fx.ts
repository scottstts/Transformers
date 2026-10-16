import { Vector3, type Object3D, type PointLight } from 'three/webgpu'
import type { AudioMix } from '../../../audio/mix'
import type { ContactEffects } from '../../../game/contact-effects'
import type { CombatFrame } from '../../transformer/combat/effects'
import type { MoveCue } from '../../transformer/combat/moves'
import type { Sparks, SparkBurst } from '../../transformer/combat/fx/sparks'
import type { Billows, BillowBurst } from '../../transformer/combat/fx/billows'
import type { BlastLight } from '../../transformer/combat/fx/blast-light'
import type { HeatHaze, HazePatch } from '../../transformer/combat/fx/haze'
import type { BoltStyle, Lightning } from '../../transformer/combat/fx/lightning'
import type { RoadsterEffects } from '../effects'
import type { Vapor, VaporBurst } from '../fx/vapor'
import type { CannonAudio } from './audio/cannons'
import type { BurstRing } from './fx/burst-ring'
import type { Inflow, InflowBurst } from './fx/inflow'
import type { SpeedTrails } from './fx/speed-trails'
import type { Afterimages } from './fx/afterimages'
import type { EnergyOrb } from './fx/energy-orb'
import { WHITEOUT } from './special'

/** The impact's deep explosion (sound-models.ts `explosion`): its level, and played a little slower for its weight. */
const BLAST_SOUND = { level: 1.5, rate: 0.9 }
/**
 * The run as a speedster's (the Quicksilver look): the speeds (m/s) over which
 * its streaks of light come up to full, and over which its afterimages do; an
 * afterimage is left every GHOST_EVERY s, so how far apart they stand is how
 * fast it runs.
 */
const STREAKS = [4, 30] as const
const GHOSTS = [8, 45] as const
const GHOST_EVERY = 0.03
/** The speed (m/s) at which the sand and air the run throws are at their fullest. */
const FULL_RUN = 45
/** Sand torn up and air shed by the run, per second at full speed. */
const RUN_DUST = 26
const RUN_VAPOR = 30
const RUN_INFLOW = 60
/** The orb: its radius at full growth (m), how high over the hands it hangs (m), how fast it grows and fades (1/s). */
const ORB = { radius: 2.7, above: 1.9, grow: 0.62, fade: 6 }
/** Arcs of the sky's charge struck into the growing orb, per second at full growth. */
const ORB_ARCS = 16
/** The orb's light: peak intensity and reach. */
const ORB_LIGHT = { peak: 320, range: 70 }

const SKY_ARC: BoltStyle = { width: 0.32, life: 0.09, brightness: 1.1, roughness: 0.16, forks: 0.3, forkLength: 0.35 }
const GROUND_ARC: BoltStyle = { width: 0.55, life: 0.14, brightness: 1.3, roughness: 0.13, forks: 0.35, forkLength: 0.35 }

/** What the special drives of the Roadster's fighter. */
export interface WhiteoutParts {
  roadster: RoadsterEffects
  contact: ContactEffects
  mix: AudioMix
  audio: CannonAudio
  sparks: Sparks
  billows: Billows
  blast: BlastLight
  haze: HeatHaze
  vapor: Vapor
  lightning: Lightning
  rings: BurstRing
  inflow: Inflow
  trails: SpeedTrails
  ghosts: Afterimages
  orb: EnergyOrb
  /** the orb's own light (the character's third light slot) */
  light: PointLight
  pelvis: Object3D
  hands: Record<'L' | 'R', Object3D>
}

/**
 * Whiteout's effects (special.ts), by cue:
 *
 *   visor   the visor blazes (value 0..1)
 *   mark    the ring's centre is set, `value` m ahead
 *   pack    the air pack on its back (throttle 0..1+)
 *   zone    the world drained of colour and the mix closing (0..1)
 *   hush    the whole mix closes down (0..1)
 *   sprint  the run round the ring begins (1) or ends (0): streaks of light
 *           trailing round the ring from the head, torso and limbs, the body's
 *           afterimages strung out behind it ever further apart as it speeds
 *           up, sand torn up, air shed and drawn in, the passes heard going by
 *   leap    the spring off the last lap: sand and air blown out under it
 *   orb     the blast is conjured between the raised hands, the sky's charge
 *           crackling into it and down into the crowd, its light growing
 *   throw   it is hurled down: the beam from the hands, the orb flying
 *   impact  a white sun on the sand: a crater of glass, the surge, crust and
 *           sand thrown up, the bursts rolling out, arcs crawling out over
 *           the ground, the flash and the blast wave through the lens, the
 *           deep explosion fitted to the user's recording
 *   land    it comes down in the glass: sand and air pressed out under it
 */
export class WhiteoutFx {
  private readonly p: WhiteoutParts
  private readonly centre = new Vector3()
  private marked = false
  private running = false
  private lastAngle = 0
  private travelled = 0
  private passes = 0
  private speed = 0
  /** the world's step of the last update, laid by the next pose's samples (afterPose) */
  private step = 0
  private ghostClock = 0
  private primed = false
  private readonly lastPelvis = new Vector3()
  private readonly velocity = new Vector3()
  private orbOn = false
  private orbLevel = 0
  private orbSize = 0
  private arcClock = 0
  private thrown = -1
  private readonly orbAt = new Vector3()
  private readonly throwFrom = new Vector3()
  private readonly flight = new Vector3()
  /** reused descriptions of what the run and the orb emit every frame */
  private readonly puff: VaporBurst = { count: 1, at: new Vector3(), jitter: 0.6, dir: new Vector3(), spread: 0.4, speed: [2, 6], life: [0.8, 1.6], size: [0.8, 3.2], drag: 2, buoyancy: 0.2, opacity: 0.3 }
  private readonly stream: InflowBurst = { count: 1, center: new Vector3(), radius: [8, 12], below: 0.5, above: 4, pull: 0.9, swirl: -1.4, life: [1, 1.8], width: 0.08, strength: 0.6 }
  private readonly mote: SparkBurst = { count: 1, at: new Vector3(), dir: new Vector3(), spread: 0.3, speed: [2, 6], life: [0.2, 0.5], size: 0.014, drag: 2, gravity: 0, palette: 1 }
  private readonly patch: HazePatch = { at: new Vector3(), jitter: 0.8, size: [2.2, 3.4], rise: 0.4, life: [0.3, 0.5], strength: 0.7 }

  constructor(parts: WhiteoutParts) {
    this.p = parts
  }

  /** Handle a special cue; false when it is not one of these. */
  cue(cue: MoveCue, frame: CombatFrame): boolean {
    const v = cue.value ?? 1
    const p = this.p
    switch (cue.cue) {
      case 'visor': p.roadster.visorBoost = v; return true
      case 'mark': this.mark(frame, v); return true
      case 'pack': p.roadster.jets.boost(v); return true
      case 'zone':
        frame.camera.zone(v)
        p.mix.muffle(v * 0.5, v > 0 ? 0.45 : 0.15)
        return true
      case 'hush': p.mix.muffle(v, 0.3); return true
      case 'sprint': this.sprint(frame, v > 0); return true
      case 'leap': this.leap(frame, v); return true
      case 'orb': this.conjure(v > 0); return true
      case 'throw': this.hurl(frame, v); return true
      case 'impact': this.impact(frame, v); return true
      case 'land': this.land(frame, v); return true
    }
    return false
  }

  update(dt: number): void {
    if (dt <= 0) return
    this.step += dt
    if (this.running) this.run(dt)
    else this.speed = Math.max(0, this.speed - dt * 120)
    this.orbFrame(dt)
  }

  /**
   * After the model is posed (the fighter's afterPose): the streaks take this
   * frame's anchors and an afterimage is left when one is due, so neither
   * starts a frame behind the body (at full speed a frame is two metres).
   */
  afterPose(): void {
    const p = this.p
    const dt = this.step
    this.step = 0
    p.trails.recording = this.running
    p.trails.update(dt, smooth(STREAKS[0], STREAKS[1], this.speed))
    p.ghosts.update(dt)
    _a.setFromMatrixPosition(p.pelvis.matrixWorld)
    if (dt > 0 && this.primed) this.velocity.subVectors(_a, this.lastPelvis).divideScalar(dt)
    this.lastPelvis.copy(_a)
    this.primed = true
    if (!this.running || dt <= 0) return
    this.ghostClock += dt
    const strength = smooth(GHOSTS[0], GHOSTS[1], this.speed)
    if (this.ghostClock >= GHOST_EVERY && strength > 0.01) {
      this.ghostClock = 0
      p.ghosts.capture(strength, this.velocity)
    }
  }

  reset(): void {
    const p = this.p
    this.marked = this.running = this.orbOn = false
    this.speed = this.orbLevel = this.orbSize = 0
    this.step = this.ghostClock = 0
    this.primed = false
    this.thrown = -1
    p.trails.reset()
    p.ghosts.reset()
    p.orb.hide()
    p.light.intensity = 0
    p.audio.fieldLevel(0, 0.05)
    p.roadster.jets.boost(0)
    p.roadster.visorBoost = 0
    p.mix.muffle(0, 0.2)
  }

  /** The ring's centre on the sand, `ahead` m before the robot. */
  private mark(frame: CombatFrame, ahead: number): void {
    const s = frame.state
    this.centre.set(s.pos.x + Math.sin(s.yaw) * ahead, 0, s.pos.z + Math.cos(s.yaw) * ahead)
    this.centre.y = this.p.contact.height(this.centre.x, this.centre.z)
    this.marked = true
  }

  private sprint(frame: CombatFrame, on: boolean): void {
    if (on && this.marked) {
      this.running = true
      _a.setFromMatrixPosition(this.p.pelvis.matrixWorld)
      this.lastAngle = Math.atan2(_a.z - this.centre.z, _a.x - this.centre.x)
      this.travelled = 0
      this.passes = 0
      // the push-off: the sand broken under the first stride
      _b.set(_a.x, this.p.contact.height(_a.x, _a.z), _a.z)
      this.p.contact.surge(_b, 1.6, 0.3)
      this.p.contact.burst(_b, 1.4, 24)
      frame.camera.kick(0.3)
    } else this.running = false
  }

  /** A frame of the run: how fast it goes round the centre, the passes heard, the sand and air it throws. */
  private run(dt: number): void {
    const p = this.p
    _a.setFromMatrixPosition(p.pelvis.matrixWorld)
    const dx = _a.x - this.centre.x, dz = _a.z - this.centre.z
    const angle = Math.atan2(dz, dx)
    let turn = angle - this.lastAngle
    if (turn > Math.PI) turn -= Math.PI * 2
    if (turn < -Math.PI) turn += Math.PI * 2
    this.lastAngle = angle
    const radius = Math.hypot(dx, dz)
    const speed = Math.abs(turn) * radius / dt
    // smoothed: a frame's angle step is noisy at these speeds
    this.speed += (speed - this.speed) * Math.min(1, dt * 10)
    this.travelled += Math.abs(turn)
    // a pass going by every half turn, its pitch rising with the speed
    if (this.travelled > Math.PI * (this.passes + 1)) {
      this.passes++
      p.audio.play('pass', this.passes % 2 ? 0.95 : 0.6, 0.9 + this.speed / 140)
    }
    const sense = turn >= 0 ? 1 : -1
    const go = Math.min(1, this.speed / FULL_RUN)
    // the sand torn up under its feet, flung back off the turn
    _b.set(_a.x, p.contact.height(_a.x, _a.z), _a.z)
    if (Math.random() < RUN_DUST * go * dt) p.contact.burst(_b, 0.8 + 0.8 * go, 8)
    // air shed off the body, left hanging behind it on the ring
    let n = RUN_VAPOR * go * dt
    const f = this.puff
    while (n > 0) {
      if (n < 1 && Math.random() > n) break
      n -= 1
      f.at.set(_a.x, _b.y + 1 + Math.random() * 3, _a.z)
      // back along the ring and out of it: the tangent, opposite the run
      f.dir.set(dz * sense, 0.15, -dx * sense).normalize()
      f.speed[0] = 1; f.speed[1] = 5
      f.size[0] = 0.8; f.size[1] = 3.4
      f.life[0] = 0.9; f.life[1] = 1.8
      f.opacity = 0.28
      p.vapor.emit(f)
    }
    // the air inside drawn round with it and in
    let m = RUN_INFLOW * go * dt
    const s = this.stream
    s.center.copy(this.centre)
    s.center.y += 1.2
    s.radius[0] = radius * 0.7
    s.radius[1] = radius * 1.05
    s.swirl = sense * 1.8
    while (m > 0) {
      if (m < 1 && Math.random() > m) break
      m -= 1
      p.inflow.emit(s)
    }
  }

  private leap(frame: CombatFrame, strength: number): void {
    const p = this.p
    _a.setFromMatrixPosition(p.pelvis.matrixWorld)
    _a.y = p.contact.height(_a.x, _a.z)
    p.contact.surge(_a, 4, 0.55 * strength)
    p.contact.burst(_a, 1.6 * strength, 40)
    const f = this.puff
    for (let k = 0; k < 26; k++) {
      const a = (k / 26) * Math.PI * 2
      f.at.set(_a.x + Math.cos(a) * 0.8, _a.y + 0.4, _a.z + Math.sin(a) * 0.8)
      f.dir.set(Math.cos(a), 0.15, Math.sin(a))
      f.speed[0] = 9; f.speed[1] = 16
      f.size[0] = 1; f.size[1] = 4.5
      f.life[0] = 1.6; f.life[1] = 2.8
      f.opacity = 0.36
      p.vapor.emit(f)
    }
    p.audio.play('shock', 0.8 * strength, 0.8)
    frame.camera.kick(0.5 * strength)
    frame.camera.shake(0.35 * strength)
  }

  private conjure(on: boolean): void {
    this.orbOn = on
    if (on) {
      this.orbSize = 0.15
      this.arcClock = 0
      this.p.audio.play('energy', 0.7, 0.62)
    }
  }

  /** The orb's frame: growing between the hands, its arcs and light; flying once thrown. */
  private orbFrame(dt: number): void {
    const p = this.p
    if (this.thrown >= 0) {
      // in flight from the hands to the crowd, the beam behind it
      this.thrown = Math.min(1, this.thrown + dt / (WHITEOUT.impact - WHITEOUT.throw))
      const u = this.thrown * this.thrown
      this.flight.lerpVectors(this.throwFrom, this.centre, u)
      p.orb.set(this.flight, this.orbSize * (1 - 0.3 * u), this.orbLevel, dt)
      _a.setFromMatrixPosition(p.hands.R.matrixWorld).add(_b.setFromMatrixPosition(p.hands.L.matrixWorld)).multiplyScalar(0.5)
      p.orb.setBeam(_a, this.flight, 1.2 + this.orbSize * 0.4, 1)
      p.light.position.copy(this.flight)
      p.light.intensity = ORB_LIGHT.peak
      return
    }
    const target = this.orbOn ? 1 : 0
    this.orbLevel += (target - this.orbLevel) * Math.min(1, dt * (this.orbOn ? 3 : ORB.fade))
    if (this.orbLevel < 0.002 && !this.orbOn) {
      if (this.orbSize > 0) {
        this.orbSize = 0
        p.orb.hide()
        p.light.intensity = 0
        p.audio.fieldLevel(0, 0.1)
      }
      return
    }
    if (this.orbOn) this.orbSize = Math.min(ORB.radius, this.orbSize + dt * ORB.grow * ORB.radius)
    // over the raised hands
    this.orbAt.setFromMatrixPosition(p.hands.R.matrixWorld).add(_b.setFromMatrixPosition(p.hands.L.matrixWorld)).multiplyScalar(0.5)
    this.orbAt.y += ORB.above + this.orbSize * 0.6
    const growth = this.orbSize / ORB.radius
    p.orb.set(this.orbAt, this.orbSize, this.orbLevel * (0.6 + 0.4 * growth), dt)
    p.orb.setBeam(this.orbAt, this.orbAt, 0, 0)
    p.light.color.setRGB(0.82, 0.9, 1)
    p.light.distance = ORB_LIGHT.range
    p.light.position.copy(this.orbAt)
    p.light.intensity = ORB_LIGHT.peak * this.orbLevel * growth * (0.85 + 0.15 * Math.random())
    p.audio.fieldLevel(0.4 + 0.6 * growth)
    // the sky's charge struck into it from all round, more as it grows
    this.arcClock += dt * ORB_ARCS * (0.3 + 0.7 * growth) * this.orbLevel
    while (this.arcClock > 1) {
      this.arcClock -= 1
      _c.set(Math.random() * 2 - 1, Math.random() * 1.2 - 0.3, Math.random() * 2 - 1).normalize()
      _a.copy(this.orbAt).addScaledVector(_c, 6 + Math.random() * 8)
      _b.copy(this.orbAt).addScaledVector(_c, this.orbSize * 0.9)
      p.lightning.strike(_a, _b, SKY_ARC)
    }
    // motes drawn in, the air round it shimmering
    const mote = this.mote
    if (Math.random() < dt * 40 * growth) {
      _c.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize()
      mote.at.copy(this.orbAt).addScaledVector(_c, this.orbSize * 2.2)
      mote.dir.copy(_c).negate()
      mote.speed[0] = this.orbSize * 2; mote.speed[1] = this.orbSize * 4
      p.sparks.emit(mote)
    }
    if (Math.random() < dt * 6 * growth) {
      this.patch.at.copy(this.orbAt)
      this.patch.size[0] = this.orbSize * 2.4
      this.patch.size[1] = this.orbSize * 3.4
      this.patch.strength = 0.6 * growth
      p.haze.emit(this.patch)
    }
  }

  /** The orb's charge reaching down into the crowd (the special's crackle strikes): arcs from it to the sand round the centre. */
  crackle(): void {
    if (!this.orbOn) return
    for (let k = 0; k < 5; k++) {
      const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 9
      _a.set(this.centre.x + Math.cos(a) * r, 0, this.centre.z + Math.sin(a) * r)
      _a.y = this.p.contact.height(_a.x, _a.z)
      this.p.lightning.strike(this.orbAt, _a, GROUND_ARC)
    }
  }

  private hurl(frame: CombatFrame, strength: number): void {
    this.orbOn = false
    this.thrown = 0
    this.throwFrom.copy(this.orbAt)
    this.p.audio.play('energy', 1.2 * strength, 0.85)
    this.p.audio.fieldLevel(0, 0.08)
    frame.camera.kick(0.4)
  }

  private impact(frame: CombatFrame, strength: number): void {
    const p = this.p
    const c = this.centre
    this.thrown = -1
    this.orbLevel = 0
    this.orbSize = 0
    p.orb.hide()
    p.light.intensity = 0
    // the white sun on the sand
    p.contact.crater(c, 9, 1.1 * strength)
    p.contact.surge(c, 18, 1.4 * strength)
    p.contact.eject(c, 17 * strength, 46, _up, 0.65, 0.65)
    const w = WHITEOUT.blastWave
    p.rings.emit(c, w.from, w.reach, w.life, 9)
    p.rings.emit(c, 1, 30, 0.8, 3.5)
    p.blast.flash(_a.copy(c).setY(c.y + 3), 0xf2f6ff, 700 * strength, 1.6, 90)
    frame.camera.flash(1.3 * strength, 0.6)
    frame.camera.shockwave(_a.copy(c).setY(c.y + 2), 1.6 * strength)
    frame.camera.kick(1)
    frame.camera.shake(1)
    // a column of white-hot gas cooling into sand smoke, and the air's own cloud rolling out low
    const fire: BillowBurst = { count: 26, at: _b.copy(c).setY(c.y + 2), jitter: 3, dir: _up, spread: 0.45, speed: [5, 16], life: [1.8, 3.4], size: [3, 9], heat: 3200, drag: 1.3, buoyancy: 2.2, tone: 1, opacity: 0.55 }
    p.billows.emit(fire)
    const f = this.puff
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2
      f.dir.set(Math.cos(a), 0.08, Math.sin(a))
      f.at.set(c.x + f.dir.x * 4, c.y + 0.6, c.z + f.dir.z * 4)
      f.speed[0] = 18; f.speed[1] = 30
      f.size[0] = 2; f.size[1] = 8
      f.life[0] = 2.4; f.life[1] = 4
      f.opacity = 0.4
      p.vapor.emit(f)
    }
    p.sparks.emit({ count: 360, at: _b.copy(c).setY(c.y + 1), dir: _up, spread: 0.9, speed: [6, 30], life: [0.4, 1.4], size: 0.03, drag: 1.1, gravity: 0.7, palette: 1, jitter: 2 })
    // arcs crawling out over the ground from it
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + Math.random() * 0.3
      const r = 12 + Math.random() * 12
      _a.set(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r)
      _a.y = p.contact.height(_a.x, _a.z)
      p.lightning.strike(c, _a, GROUND_ARC, true)
    }
    for (let k = 0; k < 6; k++) {
      this.patch.at.set(c.x + (Math.random() - 0.5) * 8, c.y + 2 + Math.random() * 4, c.z + (Math.random() - 0.5) * 8)
      this.patch.size[0] = 4; this.patch.size[1] = 7
      this.patch.strength = 1
      p.haze.emit(this.patch)
    }
    // the deep explosion, a faint crack of the energy over it as the orb bursts
    p.audio.play('explosion', BLAST_SOUND.level * strength, BLAST_SOUND.rate)
    p.audio.play('energy', 0.45 * strength, 0.8)
  }

  private land(frame: CombatFrame, strength: number): void {
    const p = this.p
    _a.setFromMatrixPosition(p.pelvis.matrixWorld)
    _a.y = p.contact.height(_a.x, _a.z)
    p.contact.surge(_a, 2.6, 0.35 * strength)
    p.contact.burst(_a, 1.4 * strength, 30)
    p.roadster.audio.footstep(1.6 * strength, p.contact.surface(_a.x, _a.z))
    frame.camera.kick(0.45 * strength)
    frame.camera.shake(0.3 * strength)
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

const _up = new Vector3(0, 1, 0)
const _a = new Vector3()
const _b = new Vector3()
const _c = new Vector3()
