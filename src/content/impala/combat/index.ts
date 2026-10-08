import { PointLight, Vector3 } from 'three/webgpu'
import type { AudioMix } from '../../../audio/mix'
import type { ContactEffects } from '../../../game/contact-effects'
import type { TransformerModel } from '../../transformer/model/transformer'
import type { WeaponAsset } from '../../transformer/asset/weapon'
import type { CharacterCombat, CombatFrame } from '../../transformer/combat/effects'
import type { MoveCue } from '../../transformer/combat/moves'
import { CombatOverlay } from '../../transformer/combat/overlay'
import { Fighter, type FighterStyle } from '../../transformer/combat/fighter'
import { Weapon } from '../../transformer/combat/weapon'
import { SWORD_SWING } from '../../transformer/combat/audio/swing'
import { createCutlassMaterials } from '../materials'
import type { ImpalaEffects } from '../effects'
import { IMPALA_GUARD, IMPALA_MOVES } from './moves'
import { NATURAL_HOLD } from './pose'
import { IMPALA_HITS } from './hits'
import { IMPALA_SPECIAL } from './special'
import { ThunderFx } from './special-fx'
import { BladeArcs } from './fx/blade-arcs'
import { Lightning } from './fx/lightning'
import { ShockRing } from './fx/shock-ring'
import { SweepRing } from './fx/sweep-ring'

/**
 * The Impala fights with its cutlass from the first blow, forged in the left
 * hand out of its crimson charge: point and edge, quick and swinging. Its
 * colour is a dark crimson (the shield, the Flash Move, the energy).
 */
const STYLE: FighterStyle = {
  trail: { color: [0.36, 0.28, 0.28], life: 0.09, speed: 16, tip: 0.6 },
  // the racer's sword swing; the cutlass's edge runs about a fifth faster through the same swing
  swing: { ...SWORD_SWING, speed: 29 },
  forge: { from: 360, to: 1900, crackleHz: 2600, level: 0.27 },
  palette: 0,
  light: 0xff3a48,
  step: 0.85,
  shield: [0.62, 0.035, 0.05],
  cut: 0.2,
}

/**
 * Cues of the Impala, on top of the shared fighter's:
 *   arc      (strength) a heavy cut's light recorded along the edge; 0 ends it
 *   thrust   (strength) the point going home: a spit of sparks, the air shoved on ahead of it
 *   scoop    (strength) the rising cut's blade along the sand: sand thrown up ahead of it
 *   updraft  (strength) the rising cut's blow: a column of air and sand thrown up in front
 *   leap     (strength) the cyclone's spring off the sand
 *   whirl    (strength) the turn's rush, and sand whipped round with it
 *   touchdown (strength) a landing on both feet: the sand driven out round them
 *   stomp.L / stomp.R (strength) a foot stamped down to drive a blow: a thud through the sand, dust out round it
 *   bite     (strength) the point biting into the sand at a cut's end
 *   eyes     (0..1) the eyes flare
 * and the special's (special-fx.ts).
 */
class ImpalaFighter extends Fighter {
  private readonly impala: ImpalaEffects
  private readonly arcs = new BladeArcs()
  private readonly lightning = new Lightning()
  private readonly rings = new ShockRing()
  private readonly sweep = new SweepRing()
  /** the discharge's light: the character's third light slot (the weapon's and the blast's are the fighter's) */
  private readonly thunderLight = new PointLight(0xff5a6a, 0, 34, 2)
  private readonly thunder: ThunderFx
  private eyesTarget = 0

  constructor(model: TransformerModel, impala: ImpalaEffects, contact: ContactEffects, mix: AudioMix, weapon: Weapon | null) {
    super(model, impala, contact, mix, weapon, STYLE)
    this.impala = impala
    this.lightning.ground = contact
    this.object.add(this.arcs.mesh, this.lightning.mesh, this.rings.mesh, this.sweep.mesh, this.thunderLight)
    this.thunder = new ThunderFx({
      weapon, contact, mix, sparks: this.sparks, billows: this.billows, blast: this.blast, haze: this.haze,
      lightning: this.lightning, rings: this.rings, sweep: this.sweep, light: this.thunderLight, robotOffset: model.dims.robotF,
      foot: (side, out) => out.copy(model.contacts().feet[side]),
      thud: (strength) => impala.audio.footstep(1 + 0.25 * Math.min(1, strength)),
    })
  }

  beginSpecial(): void {
    this.thunder.reset()
    this.arcs.end()
  }

  interrupt(): void {
    super.interrupt()
    this.arcs.end()
    this.eyesTarget = 0
  }

  cue(cue: MoveCue, frame: CombatFrame): void {
    const v = cue.value ?? 1
    switch (cue.cue) {
      case 'arc':
        if (v > 0) this.arcs.begin(v)
        else this.arcs.end()
        return
      case 'thrust': this.thrust(v); return
      case 'scoop': this.scoop(v); return
      case 'updraft': this.updraft(frame, v); return
      case 'leap': this.leap(frame, v); return
      case 'whirl': this.whirl(frame, v); return
      case 'touchdown': this.touchdown(frame, v); return
      case 'eyes': this.eyesTarget = v; return
      case 'stomp.L': this.stomp('L', frame, v); return
      case 'stomp.R': this.stomp('R', frame, v); return
      case 'bite': this.bite(frame, v); return
    }
    if (!this.thunder.cue(cue, frame)) super.cue(cue, frame)
  }

  update(dt: number, frame: CombatFrame): void {
    super.update(dt, frame)
    if (this.arcs.recording && this.weapon && this.weapon.presence > 0.6) this.arcs.add(this.edgeBase, this.edgeTip)
    this.thunder.update(dt, frame)
    this.effects(dt)
  }

  ambient(dt: number, yaw: number): void {
    super.ambient(dt, yaw)
    // what the fight left plays out: dust and smoke, the arcs and the lightning fading, the discharge's light
    this.billows.update(dt)
    this.haze.update(dt)
    this.blast.update(dt)
    this.thunder.update(dt, null)
    this.effects(dt)
  }

  reset(): void {
    super.reset()
    this.arcs.reset()
    this.lightning.reset()
    this.rings.reset()
    this.sweep.reset()
    this.thunder.reset()
    this.eyesTarget = 0
    this.impala.eyeBoost = 0
  }

  warm(on: boolean): void {
    super.warm(on)
    this.arcs.warm(on)
    this.lightning.warm(on)
    this.rings.warm(on)
    this.sweep.warm(on)
  }

  dispose(): void {
    super.dispose()
    this.thunder.dispose()
  }

  private effects(dt: number): void {
    this.arcs.update(dt)
    this.lightning.update(dt)
    this.rings.update(dt)
    this.sweep.update(dt)
    this.impala.eyeBoost += (this.eyesTarget - this.impala.eyeBoost) * (1 - Math.exp(-dt * 6))
  }

  /** The point going home: sparks spat off it, and the air it shoves on ahead shimmering. */
  private thrust(strength: number): void {
    const w = this.weapon
    if (!w || w.presence < 0.5) return
    const W = w.object.matrixWorld
    _dir.set(0, 0, 1).transformDirection(W)
    _a.set(0, 0, w.asset.manifest.extent[1]).applyMatrix4(W)
    this.sparks.emit({ count: Math.round(10 * strength), at: _a, dir: _dir, spread: 0.3, speed: [4, 11], life: [0.08, 0.24], size: 0.013, drag: 5, gravity: 0.3, palette: 0 })
    for (let k = 1; k <= 3; k++) {
      _b.copy(_a).addScaledVector(_dir, k * 0.9)
      this.haze.emit({ at: _b, jitter: 0.2, size: [0.8 + k * 0.3, 1.4 + k * 0.4], rise: 0.1, life: [0.12, 0.2], strength: 0.55 * strength / k })
    }
  }

  /** The blade along the sand: the sand thrown up ahead of it, where it meets it. */
  private scoop(strength: number): void {
    const w = this.weapon
    if (!w || w.presence < 0.5) return
    const at = this.edgeTip.y < this.edgeBase.y ? this.edgeTip : this.edgeBase
    _a.copy(at)
    _a.y = this.contact.height(_a.x, _a.z)
    this.contact.burst(_a, 1.1 * strength, 22)
    _dir.subVectors(this.edgeTip, this.edgeBase).setY(0).normalize()
    _b.set(_dir.x * 0.5, 0.9, _dir.z * 0.5).normalize()
    this.billows.emit({ count: 6, at: _a, jitter: 0.6, dir: _b, spread: 0.3, speed: [4, 9], life: [1.2, 2.2], size: [0.8, 3], heat: 0, drag: 2, buoyancy: 0.3, tone: 1, opacity: 0.32 * strength })
  }

  /** The rising cut's blow: a column of air and sand thrown up through the front, a spray of sparks up the arc. */
  private updraft(frame: CombatFrame, strength: number): void {
    const s = frame.state
    const ahead = this.model.dims.robotF + 3
    const cx = s.pos.x + Math.sin(s.yaw) * ahead, cz = s.pos.z + Math.cos(s.yaw) * ahead
    for (let k = 0; k < 12; k++) {
      const a = s.yaw + (k / 11 - 0.5) * 1.6
      const r = 1.5 + Math.random() * 3.5
      _a.set(cx + Math.sin(a) * r - Math.sin(s.yaw) * 1.5, 0, cz + Math.cos(a) * r - Math.cos(s.yaw) * 1.5)
      _a.y = this.contact.height(_a.x, _a.z)
      _b.set(Math.sin(s.yaw) * 0.25, 1, Math.cos(s.yaw) * 0.25).normalize()
      this.billows.emit({ count: 1, at: _a, jitter: 0.7, dir: _b, spread: 0.18, speed: [9, 17], life: [1.4, 2.4], size: [1, 3.8], heat: 0, drag: 1.7, buoyancy: 0.4, tone: 1, opacity: 0.36 * strength })
    }
    _a.set(cx, s.pos.y + 3, cz)
    this.haze.emit({ at: _a, jitter: 1.2, size: [2.4, 3.6], rise: 2, life: [0.3, 0.5], strength: 0.9 * strength })
    this.sparks.emit({ count: Math.round(30 * strength), at: this.edgeTip, dir: _up, spread: 0.45, speed: [3, 12], life: [0.25, 0.7], size: 0.016, drag: 1.5, gravity: 0.9, palette: 0, jitter: 0.6 })
    frame.camera.shockwave(_a.set(cx, s.pos.y + 2, cz), 0.3 * strength)
  }

  /** The cyclone's spring off the sand. */
  private leap(frame: CombatFrame, strength: number): void {
    const s = frame.state
    const ahead = this.model.dims.robotF
    _a.set(s.pos.x + Math.sin(s.yaw) * ahead, 0, s.pos.z + Math.cos(s.yaw) * ahead)
    _a.y = this.contact.height(_a.x, _a.z)
    this.contact.surge(_a, 1.4, 0.35 * strength)
    this.contact.burst(_a, 1.2 * strength, 30)
    this.thud(_a, strength)
    frame.camera.kick(0.35 * strength)
  }

  /** The turn's sand whipped round with it (its rush is the swing voice). */
  private whirl(frame: CombatFrame, strength: number): void {
    const s = frame.state
    const ahead = this.model.dims.robotF
    const cx = s.pos.x + Math.sin(s.yaw) * ahead, cz = s.pos.z + Math.cos(s.yaw) * ahead
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2
      _a.set(cx + Math.cos(a) * 4.2, 0, cz + Math.sin(a) * 4.2)
      _a.y = this.contact.height(_a.x, _a.z)
      // round with the turn, anticlockwise seen from above (toward the blade's side), and out
      _b.set(-Math.sin(a) * 0.9 + Math.cos(a) * 0.4, 0.25, Math.cos(a) * 0.9 + Math.sin(a) * 0.4).normalize()
      this.billows.emit({ count: 1, at: _a, jitter: 0.8, dir: _b, spread: 0.15, speed: [6, 12], life: [1.2, 2.2], size: [0.9, 3.4], heat: 0, drag: 2, buoyancy: 0.3, tone: 1, opacity: 0.28 * strength })
    }
  }

  /**
   * The robot's weight driven into the sand (a stamp, a push-off, a landing):
   * its own footfall, heavy. The shared `slam` (the truck's axe into the
   * ground, its sand hissing as it rains back for over a second) read as a
   * steam leak under every blow.
   */
  private thud(at: Vector3, strength: number): void {
    this.impala.audio.footstep(1 + 0.25 * Math.min(1, strength), this.contact.surface(at.x, at.z))
  }

  /** The point biting into the sand at the end of a cut: sand and sparks thrown up round it, the blow's hit-stop; a heavy thud. */
  private bite(frame: CombatFrame, strength: number): void {
    const w = this.weapon
    if (!w || w.presence < 0.5) return
    const at = _a.copy(this.edgeBase.y < this.edgeTip.y ? this.edgeBase : this.edgeTip)
    at.y = this.contact.height(at.x, at.z)
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2
      _b.set(at.x + Math.cos(a) * 0.9 * strength, 0, at.z + Math.sin(a) * 0.9 * strength)
      _b.y = this.contact.height(_b.x, _b.z)
      this.contact.burst(_b, 1.2 * strength, 10)
    }
    this.contact.burst(at, 1.6 * strength, 40)
    this.sparks.emit({ count: Math.round(40 * strength), at, dir: _up, spread: 0.75, speed: [3, 11], life: [0.25, 0.8], size: 0.018, drag: 1.2, gravity: 1, palette: 0, jitter: 0.3 })
    this.thud(at, strength)
    frame.camera.kick(Math.min(1, strength))
    frame.camera.shake(Math.min(1, 0.7 * strength))
    frame.camera.hitStop(0.075, 0.1)
  }

  /** A foot stamped down under a blow: the weight driven through it into the sand. */
  private stomp(side: 'L' | 'R', frame: CombatFrame, strength: number): void {
    _a.copy(this.model.contacts().feet[side])
    _a.y = this.contact.height(_a.x, _a.z)
    this.contact.surge(_a, 1.5, 0.22 * strength)
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2
      _b.set(_a.x + Math.cos(a) * 0.9, _a.y, _a.z + Math.sin(a) * 0.9)
      this.contact.burst(_b, 0.8 * strength, 6)
    }
    this.thud(_a, strength)
    frame.camera.kick(0.22 * strength)
  }

  /** A hard landing on both feet: the sand driven out round them. */
  private touchdown(frame: CombatFrame, strength: number): void {
    const s = frame.state
    const ahead = this.model.dims.robotF
    _a.set(s.pos.x + Math.sin(s.yaw) * ahead, 0, s.pos.z + Math.cos(s.yaw) * ahead)
    _a.y = this.contact.height(_a.x, _a.z)
    this.contact.surge(_a, 2, 0.4 * strength)
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2
      _b.set(_a.x + Math.cos(a) * 1.6, _a.y, _a.z + Math.sin(a) * 1.6)
      this.contact.burst(_b, 1.1 * strength, 10)
    }
    this.thud(_a, strength)
    frame.camera.kick(0.5 * strength)
    frame.camera.shake(0.35 * strength)
  }
}

export function createImpalaCombat(model: TransformerModel, weaponAsset: WeaponAsset | undefined, impala: ImpalaEffects, contact: ContactEffects, mix: AudioMix, sole: { heel: number; toe: number; ankle: number; soleRadius?: number }): CharacterCombat {
  const overlay = new CombatOverlay(model.rig, {
    main: 'L',
    // the grip's axis inside the curled fingers' loop, clear of the palm's end (measured on the rig: its knuckle row runs across the hand, its fingers short)
    grip: [0, 0.085, -0.295],
    fist: [78, 96, 74],
    handle: [24, 66, 50],
    // straight along the top of the grip, its tip curled over it
    thumb: [-45, -45, 60],
    // the pommel's grip (the cutlass is fought one-handed: two of these fists do not fit its hilt)
    offGrip: weaponAsset ? weaponAsset.manifest.grips.off : [0, 0, -0.2],
    // the grip runs across the fist: the wrist turns with the forearm, so the edge faces along it, away from the elbow
    wristFollows: true,
    // held as a person holds a one-handed blade: the elbow places it, the wrist only finishes it (pose.ts)
    natural: NATURAL_HOLD,
    sole,
  })
  const weapon = weaponAsset
    ? new Weapon(weaponAsset, createCutlassMaterials(), { front: [14, 1.1, 1.3], after: [2.0, 0.1, 0.12], band: 0.1, cool: 0.24 }, overlay.grip, overlay.build.main)
    : null
  const effects = new ImpalaFighter(model, impala, contact, mix, weapon)
  impala.object.add(effects.object)
  return { moveset: IMPALA_MOVES, overlay, effects, stepLift: 0.24, special: IMPALA_SPECIAL, hits: IMPALA_HITS, guard: IMPALA_GUARD }
}

const _up = new Vector3(0, 1, 0)
const _a = new Vector3()
const _b = new Vector3()
const _dir = new Vector3()
