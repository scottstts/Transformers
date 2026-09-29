import { Vector3, type Object3D } from 'three/webgpu'
import type { AudioMix } from '../../../audio/mix'
import type { ContactEffects } from '../../../game/contact-effects'
import type { TransformerModel } from '../../transformer/model/transformer'
import type { WeaponAsset } from '../../transformer/asset/weapon'
import type { CharacterCombat, CombatFrame } from '../../transformer/combat/effects'
import type { MoveCue } from '../../transformer/combat/moves'
import { CombatOverlay } from '../../transformer/combat/overlay'
import { Fighter, type FighterStyle } from '../../transformer/combat/fighter'
import { Weapon } from '../../transformer/combat/weapon'
import { slam } from '../../transformer/combat/audio/shots'
import { createSpearMaterials } from '../materials'
import type { BatEffects } from '../effects'
import { BAT_MOVES, BAT_GUARD, VORTEX } from './moves'
import { BAT_HITS } from './hits'
import { BAT_SPECIAL } from './special'
import { DescentFx } from './special-fx'
import { SpearAudio } from './audio/spear'
import { Lances } from './fx/lances'
import { Rings } from './fx/rings'
import { Vortex } from './fx/vortex'

/** Phantom lances round each real thrust of a flurry, and how far (rad) they fan either side of it. */
const PHANTOMS = 3
const FAN = 0.55
/** The crescent's reach and arc (m, rad): the air the big sweep throws out ahead. */
const CRESCENT = { radius: 7.5, arc: 2.6, height: 1.6 }

/**
 * The Bat fights with its spear from the first blow: forged in the right hand
 * out of the afterburner's fire, held in both hands (the left a metre up the
 * shaft) for thrusts and sweeps, spun overhead one-handed; its jet, on its
 * back, lends it the special's flight.
 */
const STYLE: FighterStyle = {
  trail: { color: [0.42, 0.3, 0.16], life: 0.1, speed: 15, tip: 0.3 },
  swing: { bodyHz: 320, edgeHz: 1400, speed: 22, edge: 0.45, level: 0.22 },
  forge: { from: 300, to: 1700, crackleHz: 1900, level: 0.28 },
  palette: 0,
  light: 0xffb070,
  step: 0.9,
  shield: [1.0, 0.7, 0.26],
}

/**
 * Cues of the Bat, on top of the shared fighter's:
 *   poke     (strength) a thrust going home: the spear's thrust take
 *   slash    (strength) a cut: the spear's slash take
 *   lance    (strength) a flurry's thrust: the point's lance, phantoms fanned round it, a spit of sparks at the point
 *   burn     (throttle) the afterburner on the back, 0 cuts it (the finisher's lunge, the special)
 *   vortex   (1 / 0) the spin's vacuum draws the sand in toward VORTEX.ahead
 *   crescent (strength) the big sweep throws a wall of air and sand out across the front
 *   eyes     (0..1) the eyes flare
 */
class BatFighter extends Fighter {
  private readonly bat: BatEffects
  private readonly spear: SpearAudio
  private readonly lances = new Lances()
  private readonly rings = new Rings()
  private readonly vortex = new Vortex()
  private readonly descent: DescentFx
  private vortexOn = false
  private eyesTarget = 0
  private readonly center = new Vector3()
  private readonly pelvis: Object3D

  constructor(model: TransformerModel, bat: BatEffects, contact: ContactEffects, mix: AudioMix, weapon: Weapon | null) {
    super(model, bat, contact, mix, weapon, STYLE)
    this.bat = bat
    this.spear = new SpearAudio(mix)
    this.vortex.ground = contact
    this.pelvis = model.node('bone:pelvis')
    this.object.add(this.lances.mesh, this.rings.mesh, this.vortex.mesh)
    this.descent = new DescentFx({
      bat, weapon, contact, mix, sparks: this.sparks, billows: this.billows, blast: this.blast, haze: this.haze, vortex: this.vortex,
      lances: this.lances, spear: this.spear, robotOffset: model.dims.robotF,
    })
  }

  beginSpecial(): void {
    // a special cutting into the finisher's lunge takes the jet over from it
    this.bat.burn = null
    this.descent.reset()
  }

  cue(cue: MoveCue, frame: CombatFrame): void {
    const v = cue.value ?? 1
    switch (cue.cue) {
      case 'poke': this.spear.play('poke', v); return
      case 'slash': this.spear.play('slash', v, 1 / Math.max(0.6, Math.min(1.4, v))); return
      case 'lance': this.lance(v); return
      case 'burn': this.bat.burn = v > 0 ? v : null; return
      case 'vortex':
        this.vortexOn = v > 0
        if (!this.vortexOn) this.vortex.release()
        return
      case 'crescent': this.crescent(frame, v); return
      case 'eyes': this.eyesTarget = v; return
    }
    if (!this.descent.cue(cue, frame)) super.cue(cue, frame)
  }

  update(dt: number, frame: CombatFrame): void {
    super.update(dt, frame)
    this.lances.update(dt)
    this.rings.update(dt)
    this.vortex.clear(_body.setFromMatrixPosition(this.pelvis.matrixWorld))
    this.vortex.update(dt)
    if (this.vortexOn) {
      const s = frame.state
      const ahead = this.model.dims.robotF + VORTEX.ahead
      this.center.set(s.pos.x + Math.sin(s.yaw) * ahead, s.pos.y, s.pos.z + Math.cos(s.yaw) * ahead)
      // turning with the spin, clockwise seen from above
      this.vortex.emit(this.center, VORTEX.radius, 150, dt, -1, 6, 4.5, 3.2)
    }
    this.bat.eyeBoost += (this.eyesTarget - this.bat.eyeBoost) * (1 - Math.exp(-dt * 6))
    this.descent.update(dt)
    this.shimmer(dt)
  }

  ambient(dt: number, yaw: number): void {
    super.ambient(dt, yaw)
    // the car's boost: its flame shimmers the air behind it; what the fight left plays out
    this.billows.update(dt)
    this.haze.update(dt)
    this.blast.update(dt)
    this.lances.update(dt)
    this.rings.update(dt)
    this.vortex.clear(_body.setFromMatrixPosition(this.pelvis.matrixWorld))
    this.vortex.update(dt)
    this.shimmer(dt)
  }

  reset(): void {
    super.reset()
    this.bat.burn = null
    this.vortexOn = false
    this.vortex.reset()
    this.eyesTarget = 0
    this.bat.eyeBoost = 0
    this.descent.reset()
  }

  warm(on: boolean): void {
    super.warm(on)
    this.lances.warm(on)
    this.rings.warm(on)
    this.vortex.warm(on)
  }

  prepareAudio(): void {
    super.prepareAudio()
    this.spear.prepare()
  }

  end(): void {
    super.end()
    this.bat.burn = null
  }

  /** Hot air behind the flame while it burns. */
  private shimmer(dt: number): void {
    const jet = this.bat.afterburner
    if (jet.power < 0.2 || Math.random() > dt * 20) return
    _a.copy(jet.lip).addScaledVector(jet.axis, 0.8 + Math.random() * 3.2 * jet.power)
    this.haze.emit({ at: _a, jitter: 0.4, size: [1.2, 2.6], rise: 0.9, life: [0.3, 0.55], strength: Math.min(1.2, jet.power) })
  }

  /**
   * A thrust going home: the point's lance smeared out past it, the air
   * cracking in rings round the point, heat shimmer and sparks there, and
   * phantom lances fanned round it.
   */
  private lance(strength: number): void {
    const w = this.weapon
    if (!w || w.presence < 0.5) return
    const W = w.object.matrixWorld
    const tip = w.asset.manifest.extent[1]
    _dir.set(0, 0, 1).transformDirection(W)
    _a.set(0, 0, tip - 3.2).applyMatrix4(W)
    this.lances.emit(_a, _dir, 4.1 + strength * 0.9, 0.1)
    _b.set(0, 0, tip).applyMatrix4(W)
    this.sparks.emit({ count: 6, at: _b, dir: _dir, spread: 0.35, speed: [3, 9], life: [0.08, 0.22], size: 0.012, drag: 5, gravity: 0.3, palette: 0 })
    _c.copy(_b).addScaledVector(_dir, 0.3)
    this.rings.emit(_c, _dir, 0.7 + 0.45 * strength)
    _c.addScaledVector(_dir, 1.1)
    this.rings.emit(_c, _dir, 0.45 + 0.25 * strength)
    this.haze.emit({ at: _b, jitter: 0.3, size: [0.9, 1.6], rise: 0.2, life: [0.12, 0.22], strength: 0.6 * strength })
    for (let k = 0; k < PHANTOMS; k++) {
      // a phantom thrust: the same drive, turned across the front and a little up or down
      const turn = (Math.random() * 2 - 1) * FAN
      _up.set(0, 1, 0)
      _c.copy(_dir).applyAxisAngle(_up, turn)
      _c.y += (Math.random() - 0.5) * 0.25
      _c.normalize()
      _root.copy(_a).addScaledVector(_c, 0.4 + Math.random() * 0.5)
      this.lances.emit(_root, _c, 2.2 + Math.random() * 1.6, 0.05 + Math.random() * 0.03)
    }
  }

  /** The big sweep's wall of air: refraction and sand thrown out across the front arc, the lens's blast wave. */
  private crescent(frame: CombatFrame, strength: number): void {
    const s = frame.state
    const ahead = this.model.dims.robotF
    const cx = s.pos.x + Math.sin(s.yaw) * ahead, cz = s.pos.z + Math.cos(s.yaw) * ahead
    const n = 16
    for (let k = 0; k < n; k++) {
      const a = s.yaw + (k / (n - 1) - 0.5) * CRESCENT.arc
      const dx = Math.sin(a), dz = Math.cos(a)
      for (const r of [3.2, 5.4]) {
        _a.set(cx + dx * r, 0, cz + dz * r)
        _a.y = this.contact.height(_a.x, _a.z)
        this.contact.burst(_a, 1.1 * strength, 7)
        _b.set(dx, 0.25, dz)
        this.billows.emit({ count: 1, at: _a, jitter: 0.8, dir: _b, spread: 0.15, speed: [8, 15], life: [1.4, 2.4], size: [1, 4.2], heat: 0, drag: 2.2, buoyancy: 0.3, tone: 1, opacity: 0.38 * strength })
      }
      _a.set(cx + dx * CRESCENT.radius * 0.6, s.pos.y + CRESCENT.height, cz + dz * CRESCENT.radius * 0.6)
      this.haze.emit({ at: _a, jitter: 0.6, size: [2.2, 3.4], rise: 0.4, life: [0.25, 0.4], strength: 0.9 * strength })
    }
    _a.set(cx, s.pos.y + 1.2, cz)
    frame.camera.shockwave(_a, 0.45 * strength)
    frame.camera.kick(0.5 * strength)
    frame.camera.shake(0.45 * strength)
    slam(this.mix, 0.55 * strength, 42)
  }
}

export function createBatCombat(model: TransformerModel, weaponAsset: WeaponAsset | undefined, bat: BatEffects, contact: ContactEffects, mix: AudioMix, sole: { heel: number; toe: number; ankle: number }): CharacterCombat {
  const overlay = new CombatOverlay(model.rig, {
    main: 'R',
    // the shaft's axis inside the curled fingers' loop (measured on the rig), the thumb wrapped over its far side
    grip: [0.085, 0.0, -0.255],
    fist: [86, 100, 74],
    handle: [62, 86, 78],
    thumb: [30, -50, -40],
    offGrip: weaponAsset ? weaponAsset.manifest.grips.off : [0, 0, 1],
    // one hand on a long shaft: the wrist turns with the forearm so the butt passes the fist's far side
    wristFollows: true,
    sole,
  })
  const weapon = weaponAsset
    ? new Weapon(weaponAsset, createSpearMaterials(), { front: [14, 6, 1.6], after: [1.8, 0.5, 0.1], band: 0.1, cool: 0.24 }, overlay.grip)
    : null
  const effects = new BatFighter(model, bat, contact, mix, weapon)
  bat.object.add(effects.object)
  return { moveset: BAT_MOVES, overlay, effects, stepLift: 0.26, special: BAT_SPECIAL, hits: BAT_HITS, guard: BAT_GUARD }
}

const _a = new Vector3()
const _b = new Vector3()
const _c = new Vector3()
const _dir = new Vector3()
const _root = new Vector3()
const _up = new Vector3()
const _body = new Vector3()
