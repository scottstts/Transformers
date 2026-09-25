import { MeshPhysicalNodeMaterial, type Material } from 'three/webgpu'
import { color, float, mix, positionLocal, vec2 } from 'three/tsl'
import type { AudioMix } from '../../../audio/mix'
import type { ContactEffects } from '../../../game/contact-effects'
import type { TransformerModel } from '../../transformer/model/transformer'
import type { WeaponAsset } from '../../transformer/asset/weapon'
import type { CharacterCombat, CombatFrame } from '../../transformer/combat/effects'
import type { MoveCue } from '../../transformer/combat/moves'
import { CombatOverlay } from '../../transformer/combat/overlay'
import { Fighter, type FighterStyle } from '../../transformer/combat/fighter'
import { Weapon } from '../../transformer/combat/weapon'
import { N } from '../../../rendering/noise.ts'
import { createF1Materials } from '../materials'
import type { F1Effects } from '../effects'
import { F1_MOVES } from './moves'

/** ERS burst: the road speed the power unit is geared for at its peak (m/s), how fast it gets there and runs down (1/s). */
const ERS = { speed: 46, rise: 3.2, fall: 1.4 }
/** Seconds the power unit keeps running after the burst before it shuts down. */
const ERS_TAIL = 0.9
/** Rolling radius of the wheels the robot wears (m): they spin with the burst. */
const WHEEL_RADIUS = 0.36

/**
 * The racer fights fast and light: short, sharp blows, a kick, a longsword
 * forged out of the hand from white-hot metal as it is drawn, and an ERS
 * burst that drives the power unit (its start, a scream through the gears,
 * its run-down), strobes the rain light and spins the wheels it wears.
 */
const STYLE: FighterStyle = {
  trail: { color: [0.42, 0.3, 0.2], life: 0.09, speed: 18, tip: 0.65 },
  swing: { bodyHz: 420, edgeHz: 1700, speed: 24, edge: 0.55, level: 0.26 },
  forge: { from: 420, to: 2100, crackleHz: 1500, level: 0.26 },
  palette: 0,
  light: 0xffb070,
  step: 0.8,
}

class F1Fighter extends Fighter {
  private readonly racer: F1Effects
  private ersTarget = 0
  private ers = 0
  private tail = 0
  private readonly rev = { speed: 0, throttle: 0 }

  constructor(model: TransformerModel, racer: F1Effects, contact: ContactEffects, mix: AudioMix, weapon: Weapon | null) {
    super(model, racer, contact, mix, weapon, STYLE)
    this.racer = racer
  }

  cue(cue: MoveCue, frame: CombatFrame): void {
    if (cue.cue === 'ers') {
      this.ersTarget = cue.value ?? 1
      if (this.ersTarget > 0) this.tail = ERS_TAIL
    } else super.cue(cue, frame)
  }

  update(dt: number, frame: CombatFrame): void {
    super.update(dt, frame)
    this.ers += (this.ersTarget - this.ers) * (1 - Math.exp(-dt * (this.ersTarget > this.ers ? ERS.rise : ERS.fall)))
    if (this.ersTarget === 0) this.tail -= dt
    if (this.ersTarget > 0 || this.tail > 0) {
      this.rev.speed = this.ers * ERS.speed
      this.rev.throttle = this.ersTarget
      this.racer.rev = this.rev
      frame.state.spin += this.ers * ERS.speed / WHEEL_RADIUS * dt
    } else this.racer.rev = null
  }

  reset(): void {
    super.reset()
    this.ersTarget = 0
    this.ers = 0
    this.tail = 0
    this.racer.rev = null
  }
}

/** The sword's material slots: the car's own, plus the polished blade. */
function swordMaterials(): Record<string, Material> {
  const M = createF1Materials()
  // polished blade steel: fine grinding lines along the blade, a mirror finish between them
  const p = positionLocal
  const grind = N(vec2(p.x.mul(40), p.z.mul(0.6))).g
  const blade = new MeshPhysicalNodeMaterial()
  blade.colorNode = mix(color(0xb9bdc2), color(0xd8dbe0), grind)
  blade.metalness = 1
  blade.roughnessNode = float(0.1).add(grind.mul(0.08))
  blade.userData.preview = 0xc9ccd0
  M.blade = blade
  return M
}

export function createF1Combat(model: TransformerModel, weaponAsset: WeaponAsset | undefined, racer: F1Effects, contact: ContactEffects, mix: AudioMix, sole: { heel: number; toe: number; ankle: number }): CharacterCombat {
  const overlay = new CombatOverlay(model.rig, {
    main: 'R',
    grip: [0.105, 0.0, -0.24],
    fist: [88, 100, 72],
    handle: [48, 78, 72],
    thumb: [24, 28, 20],
    offGrip: weaponAsset ? weaponAsset.manifest.grips.off : [0, 0, -0.21],
    sole,
  })
  const weapon = weaponAsset
    ? new Weapon(weaponAsset, swordMaterials(), { front: [18, 12, 6], after: [2.2, 0.5, 0.08], band: 0.1, cool: 0.22 }, overlay.grip)
    : null
  const effects = new F1Fighter(model, racer, contact, mix, weapon)
  racer.object.add(effects.object)
  return { moveset: F1_MOVES, overlay, effects, stepLift: 0.22 }
}
