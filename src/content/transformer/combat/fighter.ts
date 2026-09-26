import { Group, PointLight, Vector3, type Object3D } from 'three/webgpu'
import type { AudioMix } from '../../../audio/mix'
import type { ContactEffects } from '../../../game/contact-effects'
import type { CharacterEffects } from '../character'
import type { TransformerModel } from '../model/transformer'
import type { MechanismEvent } from '../asset/format'
import type { CombatCamera, CombatEffects, CombatFrame } from './effects'
import type { MoveCue } from './moves'
import type { Side } from './pose'
import { Sparks } from './fx/sparks'
import { Billows } from './fx/billows'
import { BlastLight } from './fx/blast-light'
import { HeatHaze } from './fx/haze'
import { SwingTrail, type TrailStyle } from './fx/trail'
import { SwingVoice, type SwingTuning } from './audio/swing'
import { dissolve, forge, slam, type ForgeTuning } from './audio/shots'
import type { Weapon } from './weapon'
import { Shield } from './fx/shield'
import { armourStruck, guardBlocked, guardDrop, guardRaise } from './audio/guard'

/** A character's fighting look and sound. */
export interface FighterStyle {
  trail: TrailStyle
  swing: SwingTuning
  forge: ForgeTuning
  /** sparks of the weapon forming and going: 0 hot metal, 1 plasma */
  palette: number
  /** colour of the light the forming weapon throws (linear) */
  light: number
  /** step dust and sound at a fighting footfall (share of a running step) */
  step: number
  /** the guard shield's energy colour (linear): the character's special light */
  shield: [number, number, number]
}

/** How long the weapon takes to form and to go (s), unless a cue says otherwise. */
const FORM_TIME = 0.4
const LIGHT_INTENSITY = 12

/**
 * The effects every fighter shares, driven by move cues:
 *
 *   weapon-in  (value: seconds) the weapon forms in the hand, sparks and light
 *   weapon-out (value: seconds) it goes back into the hand, shedding embers
 *   slam       (value: strength) the weapon head is driven into the sand: dust
 *              ring, a gash in the ground, a few sparks, the sound of it, a
 *              camera kick and a moment of hit-stop
 *   kick / shake / punch / pull / stop   camera reactions (value: strength,
 *              degrees, metres, seconds)
 *   servo      (value: seconds) a heavy joint drive on the character's machine
 *
 * and, every frame: the swing voice follows the fastest fist, foot or edge,
 * the weapon's edge leaves its trail, fighting footfalls plant the
 * character's foot (dust, footprint) with its own footfall at the fight's strength.
 */
export class Fighter implements CombatEffects {
  readonly object = new Group()
  protected readonly model: TransformerModel
  protected readonly character: CharacterEffects
  protected readonly contact: ContactEffects
  protected readonly mix: AudioMix
  readonly weapon: Weapon | null
  protected readonly style: FighterStyle
  protected readonly sparks = new Sparks()
  /** fire, smoke and blast dust, for the special */
  protected readonly billows = new Billows()
  /** the light of a blast, for the special */
  protected readonly blast = new BlastLight()
  /** heat shimmer over whatever the special makes hot */
  protected readonly haze = new HeatHaze()
  protected readonly trail: SwingTrail
  /** the guard's energy shield */
  protected readonly shield: Shield
  protected readonly voice: SwingVoice
  protected readonly light: PointLight
  protected camera: CombatCamera | null = null
  private presenceTarget = 0
  private presenceRate = 1 / FORM_TIME
  private lightLevel = 0
  private readonly tracked: Object3D[]
  private readonly lastPos: Vector3[]
  private primed = false
  protected readonly edgeBase = new Vector3()
  protected readonly edgeTip = new Vector3()
  private readonly lastTip = new Vector3()
  /** fastest cutting edge this frame (m/s) */
  protected swingSpeed = 0
  /** 0..1 the weapon's light held on while it is whole (an overcharged weapon lights its surroundings) */
  protected charged = 0

  constructor(model: TransformerModel, character: CharacterEffects, contact: ContactEffects, mix: AudioMix, weapon: Weapon | null, style: FighterStyle) {
    this.model = model
    this.character = character
    this.contact = contact
    this.mix = mix
    this.weapon = weapon
    this.style = style
    this.trail = new SwingTrail(style.trail)
    this.voice = new SwingVoice(mix, style.swing)
    // kept in the scene at zero: the light count, and so every shader, never changes
    this.light = new PointLight(style.light, 0, 14, 2)
    // the shield encloses the robot's own parts, fitted as it moves
    this.shield = new Shield(style.shield, model.node('bone:pelvis'), model.root)
    this.object.add(this.sparks.mesh, this.trail.mesh, this.light, this.billows.mesh, this.blast.light, this.haze.mesh, this.shield.mesh)
    this.tracked = ['hand.R', 'hand.L', 'foot.R', 'foot.L'].map((b) => model.node(`bone:${b}`))
    this.lastPos = this.tracked.map(() => new Vector3())
    if (weapon) weapon.attach(model.node('bone:hand.R'))
  }

  begin(): void {}

  beginSpecial(): void {}

  moveStart(_move: number, camera: CombatCamera): void {
    this.camera = camera
  }

  cue(cue: MoveCue, frame: CombatFrame): void {
    const cam = frame.camera
    this.camera = cam
    switch (cue.cue) {
      case 'weapon-in': this.formWeapon(cue.value ?? FORM_TIME); break
      case 'weapon-out': this.dropWeapon(cue.value ?? FORM_TIME); break
      case 'slam': this.slam(cue.value ?? 1, cam); break
      case 'kick': cam.kick(cue.value ?? 0.5); break
      case 'shake': cam.shake(cue.value ?? 0.4); break
      case 'punch': cam.punch(cue.value ?? 6, 0.3); break
      case 'pull': cam.pull(cue.value ?? 0); break
      case 'stop': cam.hitStop(cue.value ?? 0.06, 0.12); break
      case 'servo': this.servo(cue.value ?? 0.4); break
    }
  }

  step(side: Side, strength: number): void {
    this.character.plantFoot(side, this.style.step * strength)
    this.character.audio.footstep(strength)
  }

  skid(_side: Side, at: Vector3, speed: number, dt: number): void {
    // a dragged foot ploughs the sand: a spray at the heel of it
    if (Math.random() < Math.min(1, speed * dt * 3)) this.contact.burst(at, Math.min(1.2, speed * 0.18), 6)
  }

  update(dt: number, frame: CombatFrame): void {
    this.shield.update(dt, frame.state.yaw)
    this.sparks.update(dt)
    this.billows.update(dt)
    this.blast.update(dt)
    this.haze.update(dt)
    this.trackSpeed(dt)
    const w = this.weapon
    if (w) {
      const before = w.presence
      w.presence = this.presenceTarget > w.presence
        ? Math.min(this.presenceTarget, w.presence + dt * this.presenceRate)
        : Math.max(this.presenceTarget, w.presence - dt * this.presenceRate)
      w.update(dt)
      if (w.presence > 0) {
        w.worldEdge(this.edgeBase, this.edgeTip)
        if (before === 0) {
          this.trail.reset()
          this.lastTip.copy(this.edgeTip)
        }
        this.swingSpeed = Math.max(this.swingSpeed, dt > 0 ? this.edgeTip.distanceTo(this.lastTip) / dt : 0)
        this.lastTip.copy(this.edgeTip)
        this.trail.strength = w.presence * w.presence
        this.trail.update(dt, this.edgeBase, this.edgeTip)
        // forming: sparks shed along the front, light from the hand
        if (w.presence < 1 && w.presence > 0 && this.presenceTarget !== w.presence) this.shed(w.presence, dt)
      } else this.trail.reset()
      const forming = w.presence > 0 && w.presence < 1
      this.lightLevel = forming ? 1 : Math.max(0, this.lightLevel - dt * 4)
      const level = Math.max(this.lightLevel, w.presence > 0 ? this.charged : 0)
      if (level > 0) {
        this.light.position.setFromMatrixPosition(w.object.matrixWorld)
        this.light.intensity = LIGHT_INTENSITY * level * (0.85 + 0.15 * Math.random())
      } else this.light.intensity = 0
    }
    this.voice.update(this.swingSpeed * Math.min(1, frame.weight * 1.5))
  }

  ambient(dt: number, yaw: number): void {
    this.shield.update(dt, yaw)
    this.sparks.update(dt)
  }

  end(): void {
    this.voice.update(0)
  }

  reset(): void {
    this.presenceTarget = 0
    if (this.weapon) {
      this.weapon.presence = 0
      this.weapon.update(0)
    }
    this.trail.reset()
    this.light.intensity = 0
    this.lightLevel = 0
    this.blast.reset()
    this.voice.update(0)
    this.shield.set(false)
    this.shield.update(1, 0)
  }

  warm(on: boolean): void {
    this.weapon?.warm(on)
    this.trail.mesh.visible = on
    this.sparks.mesh.visible = on
    this.billows.warm(on)
    this.haze.warm(on)
    this.shield.warm(on)
  }

  guardReach(): number {
    // at a soldier's chest height
    return this.shield.reach(1.6)
  }

  guard(on: boolean): void {
    this.shield.set(on)
    const weight = this.model.dims.hipZ / 3
    if (on) guardRaise(this.mix, weight)
    else guardDrop(this.mix, weight)
  }

  struck(at: Vector3, from: Vector3, strength: number, guarded: boolean): void {
    const cam = this.camera
    const listener = this.model.root.position
    if (guarded && this.shield.raised) {
      // the blade stops on the field: a flash and ripple where it met, sparks thrown back off it
      const p = this.shield.surfacePoint(from, _p)
      this.shield.hit(p, strength)
      const out = _u.subVectors(from, p).setY(0.3).normalize()
      this.sparks.emit({ count: Math.round(18 + 22 * strength), at: p, dir: out, spread: 0.6, speed: [2, 9], life: [0.15, 0.5], size: 0.016, drag: 2.5, gravity: 0.4, palette: this.style.palette, jitter: 0.1 })
      guardBlocked(this.mix, strength, p.distanceTo(listener) * 0.2)
      cam?.shake(0.05 + 0.08 * strength)
    } else {
      // the blade rakes the armour: sparks off the steel
      const out = _u.subVectors(from, at).setY(0.2).normalize()
      this.sparks.emit({ count: Math.round(14 + 20 * strength), at, dir: out, spread: 0.7, speed: [1.5, 7], life: [0.12, 0.45], size: 0.012, drag: 3, gravity: 0.8, palette: 0, jitter: 0.08 })
      armourStruck(this.mix, strength, at.distanceTo(listener) * 0.2)
      cam?.kick(0.06 + 0.1 * strength)
    }
  }

  dispose(): void {
    this.voice.dispose()
  }

  protected formWeapon(seconds: number): void {
    if (this.presenceTarget === 1 && this.weapon && this.weapon.presence >= 0.999) return
    this.presenceTarget = 1
    this.presenceRate = 1 / Math.max(0.05, seconds)
    forge(this.mix, this.style.forge, seconds)
  }

  protected dropWeapon(seconds: number): void {
    if (!this.weapon || this.weapon.presence <= 0) return
    this.presenceTarget = 0
    this.presenceRate = 1 / Math.max(0.05, seconds)
    dissolve(this.mix, this.style.forge, seconds)
  }

  /** The weapon head driven into the sand at its edge's middle. */
  protected slam(strength: number, cam: CombatCamera): void {
    const at = _p.addVectors(this.edgeBase, this.edgeTip).multiplyScalar(0.5)
    at.y = 0
    const dir = _d.subVectors(this.edgeTip, this.edgeBase).setY(0)
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1)
    dir.normalize()
    slam(this.mix, strength)
    // the sand thrown up around it and a gash where the edge went in
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2
      _q.set(at.x + Math.cos(a) * 0.9 * strength, 0, at.z + Math.sin(a) * 0.9 * strength)
      this.contact.burst(_q, 1.2 * strength, 10)
    }
    this.contact.burst(at, 1.6 * strength, 40)
    this.contact.footprint(at, dir, 1.4 * strength, 0.35, 1.3 * strength)
    this.sparks.emit({ count: Math.round(40 * strength), at, dir: _u.set(0, 1, 0), spread: 0.75, speed: [3, 11], life: [0.25, 0.8], size: 0.018, drag: 1.2, gravity: 1, palette: 0, jitter: 0.3 })
    cam.kick(Math.min(1, strength))
    cam.shake(Math.min(1, 0.7 * strength))
    cam.hitStop(0.075, 0.1)
  }

  /** A heavy joint drive on the character's machine, `seconds` long. */
  protected servo(seconds: number): void {
    this.character.audio.mechanism(SERVO, seconds)
  }

  /** Sparks shed from the forming front while the weapon forms or goes. */
  private shed(presence: number, dt: number): void {
    const w = this.weapon as Weapon
    const reach = Math.max(-w.asset.manifest.extent[0], w.asset.manifest.extent[1])
    const n = Math.min(12, Math.round(dt * 90))
    for (let k = 0; k < n; k++) {
      // a point on the front: out along the haft by the presence, toward the head or the pommel
      const toHead = Math.random() < 0.7
      _p.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.1, (toHead ? 1 : -0.5) * presence * reach)
      if (toHead && w.asset.manifest.radius > 0.4) _p.x += Math.random() * w.asset.manifest.radius * presence
      _p.applyMatrix4(w.object.matrixWorld)
      this.sparks.emit({ count: 1, at: _p, dir: _u.set(0, 1, 0), spread: 1, speed: [0.4, 2.2], life: [0.25, 0.6], size: 0.012, drag: 3, gravity: this.style.palette > 0.5 ? -0.05 : 0.3, palette: this.style.palette })
    }
  }

  private trackSpeed(dt: number): void {
    let fastest = 0
    for (let i = 0; i < this.tracked.length; i++) {
      _p.setFromMatrixPosition(this.tracked[i].matrixWorld)
      if (this.primed && dt > 0) fastest = Math.max(fastest, _p.distanceTo(this.lastPos[i]) / dt)
      this.lastPos[i].copy(_p)
    }
    this.primed = true
    this.swingSpeed = fastest
  }
}

/** The robot's own joint drive, as the transformation machine plays it. */
const SERVO: MechanismEvent = { name: 'combat:joint', kind: 'joint', t0: 0, t1: 0, size: 2.4, amount: 60, side: 0 }

const _p = new Vector3()
const _d = new Vector3()
const _q = new Vector3()
const _u = new Vector3()
