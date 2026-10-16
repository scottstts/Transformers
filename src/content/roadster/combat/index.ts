import { PointLight, Vector3, type Object3D } from 'three/webgpu'
import type { AudioMix } from '../../../audio/mix'
import type { ContactEffects } from '../../../game/contact-effects'
import type { TransformerModel } from '../../transformer/model/transformer'
import type { CharacterCombat, CombatFrame } from '../../transformer/combat/effects'
import type { MoveCue } from '../../transformer/combat/moves'
import type { BillowBurst } from '../../transformer/combat/fx/billows'
import type { SparkBurst } from '../../transformer/combat/fx/sparks'
import type { HazePatch } from '../../transformer/combat/fx/haze'
import type { VaporBurst } from '../fx/vapor'
import { CombatOverlay } from '../../transformer/combat/overlay'
import { Fighter, type FighterStyle } from '../../transformer/combat/fighter'
import { Lightning, type BoltColors, type BoltStyle } from '../../transformer/combat/fx/lightning'
import type { RoadsterEffects } from '../effects'
import { FIELD_AHEAD, ROADSTER_GUARD, ROADSTER_MOVES } from './moves'
import { ROADSTER_HITS } from './hits'
import { ROADSTER_SPECIAL } from './special'
import { WhiteoutFx } from './special-fx'
import { CannonAudio } from './audio/cannons'
import { PalmGlow } from './fx/palm-glow'
import { ShockCones } from './fx/shock-cones'
import { Inflow, type InflowBurst } from './fx/inflow'
import { DistortionField } from './fx/field'
import { BurstRing } from './fx/burst-ring'
import { SpeedTrails } from './fx/speed-trails'
import { Afterimages } from './fx/afterimages'
import { EnergyOrb } from './fx/energy-orb'

/**
 * The Roadster fights with what is built into its hands: no weapon forms.
 * Its colour is a hot, bright white (the shield, the Flash Move, the energy,
 * its cannons' light).
 */
const STYLE: FighterStyle = {
  swing: { bodyHz: 240, edgeHz: 1000, speed: 22, edge: 0.3, level: 0.26 },
  forge: { from: 300, to: 1600, crackleHz: 2400, level: 0.25 },
  palette: 1,
  light: 0xeef4ff,
  step: 0.9,
  shield: [0.88, 0.94, 1.0],
}

/** The cold blue-white round the white of its streaks and afterimages. */
const STREAK_COLOUR = [0.52, 0.7, 1] as const
/** White arcs: a white-hot core in a cold blue-white sheath. */
const WHITE_BOLTS: BoltColors = { core: [1, 1, 1], sheath: [0.45, 0.62, 1] }
const PULSE_ARC: BoltStyle = { width: 0.42, life: 0.12, brightness: 1.1, roughness: 0.15, forks: 0.4, forkLength: 0.35 }
const HEAVY_ARC: BoltStyle = { width: 0.6, life: 0.16, brightness: 1.4, roughness: 0.14, forks: 0.45, forkLength: 0.4 }

/** Where a palm is in its hand's frame (m) and which way it faces there: the fingers run down the hand's -Z, the palm faces the side they curl to. */
const PALM_AT = { x: 0.07, y: -0.02, z: -0.15 }
/** The glows' rates (1/s): rising to a charge, dying after a blast. */
const GLOW_FADE = 3.2
/** The palms' light: peak intensity and reach. */
const PALM_LIGHT = { peak: 26, range: 16 }
/** Rays fanned across the front half circle to find what the arc storm's pulses strike (the robot's frame, m). */
const FAN = 9
const ARC_RANGE = 12.5
/** The singularity's field: streaks drawn in per second, the dust drawn along the sand, its rise and fall (1/s). */
const FIELD_STREAKS = 130
const FIELD_DUST = 9
const FIELD_RISE = 4

type Side = 'L' | 'R'

/**
 * Cues of the Roadster, on top of the shared fighter's:
 *   charge.R / charge.L (s to the blast) a palm's cannon gathers: its glow swells
 *   shock    (s to the blast) the blast's sound, started so its loudest moment lands on it
 *   palm.R / palm.L (strength) a palm cannon fires: the cone of shocked air,
 *            the condensation it throws, the sand blown off the ground ahead,
 *            the flash and its light
 *   arc.R / arc.L (strength) one of the arc storm's pulses from that palm:
 *            arcs out to whatever stands in the front half circle (or to the sand)
 *   arcs     (strength) the storm's last pulse from both palms, heavier
 *   field    (1 on / 0 off) the singularity's field round the right fist
 *   release  (strength) the field bursts: a wall of white air rolling out all
 *            round, the sand surging after it
 * and the special's (special-fx.ts).
 */
class RoadsterFighter extends Fighter {
  private readonly roadster: RoadsterEffects
  private readonly audio: CannonAudio
  private readonly glows: Record<Side, PalmGlow> = { R: new PalmGlow(), L: new PalmGlow() }
  private readonly glow: Record<Side, number> = { R: 0, L: 0 }
  private readonly glowTarget: Record<Side, number> = { R: 0, L: 0 }
  private readonly glowRate: Record<Side, number> = { R: GLOW_FADE, L: GLOW_FADE }
  private readonly hands: Record<Side, Object3D>
  private readonly cones = new ShockCones()
  private readonly lightning = new Lightning(WHITE_BOLTS)
  private readonly inflow = new Inflow()
  private readonly field = new DistortionField()
  private readonly burst = new BurstRing()
  private readonly trails: SpeedTrails
  private readonly ghosts: Afterimages
  private readonly orb = new EnergyOrb()
  /** the orb's light: the character's third light slot (the palms' and the blast's are the fighter's) */
  private readonly orbLight = new PointLight(0xe8f0ff, 0, 70, 2)
  private readonly whiteout: WhiteoutFx
  private fieldOn = false
  private fieldLevel = 0
  private readonly fieldAt = new Vector3()
  private readonly palm: Record<Side, Vector3> = { R: new Vector3(), L: new Vector3() }
  private readonly palmNormal: Record<Side, Vector3> = { R: new Vector3(), L: new Vector3() }
  /** reused descriptions of what is emitted every frame */
  private readonly stream: InflowBurst = { count: 1, center: new Vector3(), radius: [6, 15], below: 1, above: 4, pull: 1.3, swirl: 1.6, life: [0.9, 1.6], width: 0.07, strength: 0.7 }
  private readonly drawn: BillowBurst = { count: 1, at: new Vector3(), jitter: 0.6, dir: new Vector3(), spread: 0.1, speed: [6, 10], life: [0.8, 1.3], size: [0.8, 2.6], heat: 0, drag: 1.2, buoyancy: 0.4, tone: 1, opacity: 0.22 }
  private readonly puff: VaporBurst = { count: 1, at: new Vector3(), jitter: 0.2, dir: new Vector3(), spread: 0.3, speed: [4, 10], life: [0.5, 1.1], size: [0.4, 2.2], drag: 3, buoyancy: 0.2, opacity: 0.3 }
  private readonly spark: SparkBurst = { count: 1, at: new Vector3(), dir: new Vector3(), spread: 0.4, speed: [3, 12], life: [0.15, 0.45], size: 0.016, drag: 2.5, gravity: 0.4, palette: 1 }
  private readonly patch: HazePatch = { at: new Vector3(), jitter: 0.3, size: [1, 1.8], rise: 0.4, life: [0.18, 0.3], strength: 0.6 }

  constructor(model: TransformerModel, roadster: RoadsterEffects, contact: ContactEffects, mix: AudioMix) {
    super(model, roadster, contact, mix, null, STYLE)
    this.roadster = roadster
    this.audio = new CannonAudio(mix)
    this.hands = { R: model.node('bone:hand.R'), L: model.node('bone:hand.L') }
    this.trails = new SpeedTrails(model, STREAK_COLOUR)
    this.ghosts = new Afterimages(model, STREAK_COLOUR)
    this.lightning.ground = contact
    this.light.distance = PALM_LIGHT.range
    this.object.add(this.glows.R.mesh, this.glows.L.mesh, this.cones.mesh, this.lightning.mesh, this.inflow.mesh, this.field.mesh, this.burst.mesh, this.trails.mesh, this.ghosts.mesh, this.orb.object, this.orbLight)
    this.whiteout = new WhiteoutFx({
      roadster, contact, mix, audio: this.audio, sparks: this.sparks, billows: this.billows, blast: this.blast, haze: this.haze,
      vapor: roadster.jets.vapor, lightning: this.lightning, rings: this.burst, inflow: this.inflow, trails: this.trails, ghosts: this.ghosts, orb: this.orb,
      light: this.orbLight, pelvis: model.node('bone:pelvis'), hands: this.hands,
    })
  }

  prepareAudio(): void {
    super.prepareAudio()
    this.audio.prepare()
  }

  beginSpecial(): void {
    this.whiteout.reset()
  }

  interrupt(): void {
    super.interrupt()
    this.stopField()
    this.glowTarget.R = this.glowTarget.L = 0
    this.roadster.jets.boost(0)
  }

  cue(cue: MoveCue, frame: CombatFrame): void {
    const v = cue.value ?? 1
    switch (cue.cue) {
      case 'charge.R': this.charge('R', v); return
      case 'charge.L': this.charge('L', v); return
      case 'shock': this.audio.play('shock', 0.9, 1, v); return
      case 'palm.R': this.palmBlast('R', frame, v); return
      case 'palm.L': this.palmBlast('L', frame, v); return
      case 'arc.R': this.pulse('R', frame, v, PULSE_ARC, 5); return
      case 'arc.L': this.pulse('L', frame, v, PULSE_ARC, 5); return
      case 'arcs': this.finalPulse(frame, v); return
      case 'field':
        if (v > 0) this.startField()
        else this.stopField()
        return
      case 'release': this.release(frame, v); return
      case 'crackle': this.whiteout.crackle(); return
    }
    if (!this.whiteout.cue(cue, frame)) super.cue(cue, frame)
  }

  update(dt: number, frame: CombatFrame): void {
    super.update(dt, frame)
    this.whiteout.update(dt)
    this.effects(dt)
    if (this.fieldOn || this.fieldLevel > 0) this.fieldFrame(dt, frame)
  }

  ambient(dt: number, yaw: number): void {
    super.ambient(dt, yaw)
    // what the fight left plays out: dust and smoke, the arcs and rings fading, the field letting go
    this.billows.update(dt)
    this.haze.update(dt)
    this.blast.update(dt)
    this.whiteout.update(dt)
    this.effects(dt)
    if (this.fieldLevel > 0) this.fieldFrame(dt, null)
  }

  /** After the pose: the glows ride the palms, the field the fist, the palm light the brighter palm. */
  afterPose(): void {
    super.afterPose()
    this.whiteout.afterPose()
    for (const side of ['R', 'L'] as const) {
      const W = this.hands[side].matrixWorld
      const s = side === 'R' ? 1 : -1
      this.palm[side].set(s * PALM_AT.x, PALM_AT.y, PALM_AT.z).applyMatrix4(W)
      this.palmNormal[side].setFromMatrixColumn(W, 0).multiplyScalar(s).normalize()
      this.glows[side].set(this.palm[side], this.glow[side], 0)
    }
    if (this.fieldLevel > 0) this.field.set(this.fieldAt.copy(this.palm.R).addScaledVector(this.palmNormal.R, -0.1), this.fieldLevel, 0)
    const side: Side = this.glow.R >= this.glow.L ? 'R' : 'L'
    const level = Math.max(this.glow[side], this.fieldLevel * 0.7)
    if (level > 0.01) {
      this.light.position.copy(this.palm[side])
      this.light.intensity = PALM_LIGHT.peak * level * (0.9 + 0.1 * Math.random())
    } else this.light.intensity = 0
  }

  reset(): void {
    super.reset()
    this.whiteout.reset()
    this.stopField()
    this.fieldLevel = 0
    this.field.set(this.fieldAt, 0, 0)
    this.glow.R = this.glow.L = this.glowTarget.R = this.glowTarget.L = 0
    this.glows.R.set(this.palm.R, 0, 0)
    this.glows.L.set(this.palm.L, 0, 0)
    this.cones.reset()
    this.lightning.reset()
    this.inflow.reset()
    this.burst.reset()
    this.orbLight.intensity = 0
    this.roadster.visorBoost = 0
  }

  warm(on: boolean): void {
    super.warm(on)
    this.glows.R.warm(on)
    this.glows.L.warm(on)
    this.cones.warm(on)
    this.lightning.warm(on)
    this.inflow.warm(on)
    this.field.warm(on)
    this.burst.warm(on)
    this.trails.warm(on)
    this.ghosts.warm(on)
    this.orb.warm(on)
    this.roadster.jets.warm(on)
  }

  dispose(): void {
    super.dispose()
    this.audio.dispose()
  }

  private effects(dt: number): void {
    for (const side of ['R', 'L'] as const) {
      const g = this.glow[side], target = this.glowTarget[side]
      const rate = target > g ? this.glowRate[side] : GLOW_FADE
      this.glow[side] = g + Math.sign(target - g) * Math.min(Math.abs(target - g), dt * rate)
      // a blast's flare falls back: the cannon emptied
      if (this.glowTarget[side] > 1) this.glowTarget[side] = Math.max(0, this.glowTarget[side] - dt * 9)
    }
    this.cones.update(dt)
    this.lightning.update(dt)
    this.inflow.update(dt)
    this.burst.update(dt)
  }

  /** A palm's cannon gathers over `seconds`. */
  private charge(side: Side, seconds: number): void {
    this.glowTarget[side] = 0.75
    this.glowRate[side] = 0.75 / Math.max(0.05, seconds)
  }

  /** A palm cannon fires along the palm. */
  private palmBlast(side: Side, frame: CombatFrame, strength: number): void {
    const at = this.palm[side], dir = this.palmNormal[side]
    this.glow[side] = 1.6
    this.glowTarget[side] = 1.6
    // the cone of shocked air, and a slower, wider one behind it
    this.cones.emit(at, dir, 9 * strength, 0.32, 0.3, 0.3, 1.1 * strength)
    this.cones.emit(_a.copy(at).addScaledVector(dir, 0.3), dir, 6 * strength, 0.55, 0.45, 0.42, 0.7 * strength)
    // the condensation it throws: a ring off the palm and a cone of it along the blast
    const f = this.puff
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2
      _b.set(0, 1, 0)
      if (Math.abs(dir.y) > 0.9) _b.set(1, 0, 0)
      _c.crossVectors(dir, _b).normalize()
      _b.crossVectors(dir, _c)
      f.dir.copy(_c).multiplyScalar(Math.cos(a)).addScaledVector(_b, Math.sin(a)).addScaledVector(dir, 0.8).normalize()
      f.at.copy(at).addScaledVector(dir, 0.4)
      f.speed[0] = 6; f.speed[1] = 11
      f.size[0] = 0.35; f.size[1] = 1.8
      f.life[0] = 0.45; f.life[1] = 0.9
      f.opacity = 0.32
      this.roadster.jets.vapor.emit(f)
    }
    for (let k = 0; k < 10; k++) {
      f.at.copy(at).addScaledVector(dir, 0.6 + Math.random() * 5 * strength)
      f.dir.copy(dir)
      f.speed[0] = 8; f.speed[1] = 16
      f.size[0] = 0.5; f.size[1] = 2.4
      f.life[0] = 0.35; f.life[1] = 0.75
      f.opacity = 0.2
      this.roadster.jets.vapor.emit(f)
    }
    // white sparks of the discharge along it
    const s = this.spark
    s.count = Math.round(26 * strength)
    s.at.copy(at)
    s.dir.copy(dir)
    s.spread = 0.25
    s.speed[0] = 6; s.speed[1] = 22
    this.sparks.emit(s)
    // the sand blown off the ground ahead along the blast
    const st = frame.state
    for (let k = 1; k <= 4; k++) {
      _a.copy(at).addScaledVector(dir, 2 + k * 1.6 * strength)
      _a.y = this.contact.height(_a.x, _a.z)
      this.contact.burst(_a, (1.2 - k * 0.15) * strength, 10)
    }
    const d = this.drawn
    d.count = 6
    d.at.copy(at).addScaledVector(dir, 3)
    d.at.y = this.contact.height(d.at.x, d.at.z) + 0.4
    d.dir.set(Math.sin(st.yaw), 0.25, Math.cos(st.yaw)).normalize()
    d.speed[0] = 6; d.speed[1] = 13
    d.opacity = 0.26 * strength * this.contact.loose(d.at.x, d.at.z)
    this.billows.emit(d)
    for (let k = 1; k <= 3; k++) {
      this.patch.at.copy(at).addScaledVector(dir, k * 1.1)
      this.patch.size[0] = 0.9 + k * 0.3
      this.patch.size[1] = 1.5 + k * 0.4
      this.patch.strength = 0.6 * strength / k
      this.haze.emit(this.patch)
    }
    this.blast.flash(at, 0xf0f6ff, 70 * strength, 0.22, 26)
    frame.camera.shockwave(_a.copy(at).addScaledVector(dir, 2.5), 0.22 * strength)
    frame.camera.shake(0.16 * strength)
  }

  /**
   * One of the arc storm's pulses: arcs from the palm out to whatever stands
   * in the front half circle (rays fanned across it find the bodies), the
   * rest to the sand; `bolts` at most.
   */
  private pulse(side: Side, frame: CombatFrame, strength: number, style: BoltStyle, bolts: number): void {
    const at = this.palm[side]
    const st = frame.state
    this.glow[side] = 1.3
    this.glowTarget[side] = 1.3
    let made = 0
    const start = Math.floor(Math.random() * FAN)
    for (let i = 0; i < FAN && made < bolts; i++) {
      const k = (start + i * 4) % FAN
      // across the front half circle, a little jitter so no two pulses take the same paths
      const a = st.yaw + ((k + 0.5) / FAN - 0.5) * Math.PI + (Math.random() - 0.5) * 0.25
      _c.set(Math.sin(a), 0, Math.cos(a))
      _a.set(at.x, this.contact.height(at.x, at.z) + 2.2, at.z)
      const hit = frame.probe ? frame.probe(_a, _c, ARC_RANGE) : Infinity
      if (hit < ARC_RANGE) {
        _b.copy(_a).addScaledVector(_c, hit)
        _b.y += (Math.random() - 0.3) * 1.2
      } else {
        _b.copy(at).addScaledVector(_c, 5 + Math.random() * (ARC_RANGE - 5))
        _b.y = this.contact.height(_b.x, _b.z)
        this.contact.burst(_b, 0.5 * strength, 5)
      }
      this.lightning.strike(at, _b, style)
      const s = this.spark
      s.count = Math.round(8 * strength)
      s.at.copy(_b)
      s.dir.set(0, 1, 0)
      s.spread = 0.8
      s.speed[0] = 2; s.speed[1] = 8
      this.sparks.emit(s)
      made++
    }
    this.cones.emit(at, this.palmNormal[side], 5 * strength, 0.5, 0.35, 0.2, 0.6 * strength)
    this.blast.flash(at, 0xe8f0ff, 45 * strength, 0.12, 24)
    this.audio.play('energy', 0.42 * strength, 1.18, 0)
  }

  /** The storm's last pulse: from both palms, heavier, a burst of air rolling out across the front. */
  private finalPulse(frame: CombatFrame, strength: number): void {
    this.pulse('R', frame, strength, HEAVY_ARC, 6)
    this.pulse('L', frame, strength, HEAVY_ARC, 6)
    const st = frame.state
    _a.set(st.pos.x + Math.sin(st.yaw) * 2, 0, st.pos.z + Math.cos(st.yaw) * 2)
    _a.y = this.contact.height(_a.x, _a.z)
    this.burst.emit(_a, 1.5, 13, 0.5, 3)
    frame.camera.shockwave(_b.copy(this.palm.R).lerp(this.palm.L, 0.5), 0.4 * strength)
    this.audio.play('energy', 0.9 * strength, 0.92, 0)
  }

  private startField(): void {
    this.fieldOn = true
    this.audio.play('energy', 0.45, 0.6)
  }

  private stopField(): void {
    if (!this.fieldOn) return
    this.fieldOn = false
    this.inflow.release()
    this.audio.fieldLevel(0, 0.08)
  }

  /** The field's frame: its strength, the air and sand drawn into it, its hum. */
  private fieldFrame(dt: number, frame: CombatFrame | null): void {
    const target = this.fieldOn ? 1 : 0
    this.fieldLevel += Math.sign(target - this.fieldLevel) * Math.min(Math.abs(target - this.fieldLevel), dt * (this.fieldOn ? FIELD_RISE : 12))
    if (!this.fieldOn || !frame) return
    this.audio.fieldLevel(this.fieldLevel)
    this.glowTarget.R = 0.6
    // the air drawn in to the fist, wound round it
    const s = this.stream
    s.center.copy(this.fieldAt)
    let n = FIELD_STREAKS * this.fieldLevel * dt
    while (n > 0) {
      if (n < 1 && Math.random() > n) break
      n -= 1
      this.inflow.emit(s)
    }
    // the sand dragged along the ground toward the point under it
    const st = frame.state
    const d = this.drawn
    let m = FIELD_DUST * this.fieldLevel * dt
    while (m > 0) {
      if (m < 1 && Math.random() > m) break
      m -= 1
      const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 8
      _c.set(st.pos.x + Math.sin(st.yaw) * FIELD_AHEAD, 0, st.pos.z + Math.cos(st.yaw) * FIELD_AHEAD)
      d.at.set(_c.x + Math.cos(a) * r, 0, _c.z + Math.sin(a) * r)
      d.at.y = this.contact.height(d.at.x, d.at.z) + 0.3
      d.dir.set(-Math.cos(a) - Math.sin(a) * 0.5, 0.08, -Math.sin(a) + Math.cos(a) * 0.5).normalize()
      d.count = 1
      d.speed[0] = r * 0.6; d.speed[1] = r * 0.9
      d.opacity = 0.2 * this.contact.loose(d.at.x, d.at.z)
      this.billows.emit(d)
    }
  }

  /** The field bursts as the arm is swung out: a wall of white air rolling out all round, the sand after it. */
  private release(frame: CombatFrame, strength: number): void {
    this.stopField()
    this.fieldLevel = 0
    this.glowTarget.R = 1.4
    this.glow.R = 1.4
    const st = frame.state
    _a.set(st.pos.x + Math.sin(st.yaw) * 0.6, 0, st.pos.z + Math.cos(st.yaw) * 0.6)
    _a.y = this.contact.height(_a.x, _a.z)
    this.burst.emit(_a, 2, 24, 0.75, 6)
    this.burst.emit(_a, 1, 17, 0.5, 2.4)
    this.contact.surge(_a, 7, 0.75 * strength)
    const f = this.puff
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2
      f.at.set(_a.x + Math.cos(a) * 2, _a.y + 0.8 + Math.random(), _a.z + Math.sin(a) * 2)
      f.dir.set(Math.cos(a), 0.1, Math.sin(a))
      f.speed[0] = 16; f.speed[1] = 26
      f.size[0] = 1.2; f.size[1] = 5
      f.life[0] = 1.2; f.life[1] = 2.2
      f.opacity = 0.32
      this.roadster.jets.vapor.emit(f)
    }
    const s = this.spark
    s.count = Math.round(90 * strength)
    s.at.copy(this.palm.R)
    s.dir.set(0, 1, 0)
    s.spread = 1
    s.speed[0] = 4; s.speed[1] = 20
    this.sparks.emit(s)
    this.blast.flash(this.palm.R, 0xf2f6ff, 160 * strength, 0.5, 45)
    frame.camera.shockwave(_b.copy(this.palm.R), 0.9 * strength)
    frame.camera.flash(0.45 * strength, 0.25)
    this.audio.play('energy', 1.1 * strength, 0.8, 0)
    this.audio.play('shock', 1.0 * strength, 0.85, 0)
  }
}

export function createRoadsterCombat(model: TransformerModel, roadster: RoadsterEffects, contact: ContactEffects, mix: AudioMix, sole: { heel: number; toe: number; ankle: number; soleRadius?: number }): CharacterCombat {
  const overlay = new CombatOverlay(model.rig, {
    main: 'R',
    // no weapon is ever held: the closed fist's loop, measured on the rig (inside the curled middle finger, the thumb over it)
    grip: [0.1, -0.035, -0.27],
    fist: [80, 96, 74],
    handle: [40, 70, 60],
    thumb: [20, 24, 18],
    offGrip: [0, 0, 0.9],
    sole,
  })
  const effects = new RoadsterFighter(model, roadster, contact, mix)
  roadster.object.add(effects.object)
  return { moveset: ROADSTER_MOVES, overlay, effects, stepLift: 0.3, special: ROADSTER_SPECIAL, hits: ROADSTER_HITS, guard: ROADSTER_GUARD }
}

const _a = new Vector3()
const _b = new Vector3()
const _c = new Vector3()
