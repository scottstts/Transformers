import { MeshBasicNodeMaterial, Vector3, type Material, type Node } from 'three/webgpu'
import { color, uniform } from 'three/tsl'
import type { AudioMix } from '../../../audio/mix'
import type { ContactEffects } from '../../../game/contact-effects'
import type { TransformerModel } from '../../transformer/model/transformer'
import type { WeaponAsset } from '../../transformer/asset/weapon'
import type { CharacterCombat, CombatFrame } from '../../transformer/combat/effects'
import type { MoveCue } from '../../transformer/combat/moves'
import { CombatOverlay } from '../../transformer/combat/overlay'
import { Fighter, type FighterStyle } from '../../transformer/combat/fighter'
import { Weapon } from '../../transformer/combat/weapon'
import { HEAVY_GAIT } from '../../transformer/animation/gait'
import { createMaterials } from '../materials'
import type { CybertruckEffects } from '../effects'
import { CYBERTRUCK_MOVES } from './moves'

/** The axe's light bar at rest and at a flare (emissive scale). */
const LIGHTBAR = { rest: 5, flare: 16 }
/** Thruster charge: throttle ramp (1/s) and the exhaust's share pointing down (the rest straight back). */
const BOOST_RAMP = 7
const BOOST_DOWN = 0.32

/**
 * The truck robot fights like a brawler until it draws the axe: blows through
 * heavy, planted steps, the stainless great-axe formed in the hand from blue
 * plasma (the lift jets' plasma), and a thruster charge on the same jets.
 */
const STYLE: FighterStyle = {
  trail: { color: [0.16, 0.24, 0.42], life: 0.11, speed: 16, tip: 0.25 },
  swing: { bodyHz: 260, edgeHz: 1100, speed: 22, edge: 0.35, level: 0.32 },
  forge: { from: 260, to: 1500, crackleHz: 2400, level: 0.3 },
  palette: 1,
  light: 0xa8c4ff,
  step: 0.9,
}

class CybertruckFighter extends Fighter {
  private readonly truck: CybertruckEffects
  private readonly lightbar: { value: number }
  private boostTarget = 0
  private boostPower = 0
  private readonly exhaust = new Vector3()

  constructor(model: TransformerModel, truck: CybertruckEffects, contact: ContactEffects, mix: AudioMix, weapon: Weapon | null, lightbar: { value: number }) {
    super(model, truck, contact, mix, weapon, STYLE)
    this.truck = truck
    this.lightbar = lightbar
  }

  cue(cue: MoveCue, frame: CombatFrame): void {
    if (cue.cue === 'boost') this.boostTarget = cue.value ?? 1
    else super.cue(cue, frame)
  }

  update(dt: number, frame: CombatFrame): void {
    super.update(dt, frame)
    // the charge: jets straight back and a little down, throttle ramped
    const k = 1 - Math.exp(-dt * BOOST_RAMP)
    this.boostPower += (this.boostTarget - this.boostPower) * k
    if (this.boostTarget === 0 && this.boostPower < 0.01) this.boostPower = 0
    const yaw = frame.state.yaw
    this.exhaust.set(-Math.sin(yaw) * (1 - BOOST_DOWN), -BOOST_DOWN, -Math.cos(yaw) * (1 - BOOST_DOWN))
    this.truck.thrusters.boost(this.boostPower, this.exhaust)
    // the light bar flares with the edge's speed
    const flare = Math.min(1, this.swingSpeed / 24)
    this.lightbar.value = LIGHTBAR.rest + (LIGHTBAR.flare - LIGHTBAR.rest) * flare * flare
  }

  reset(): void {
    super.reset()
    this.boostTarget = 0
    this.boostPower = 0
    this.truck.thrusters.boost(0, this.exhaust)
  }
}

/** The axe's material slots: the truck's own, plus its light-bar strip. */
function axeMaterials(lightbar: Node<'float'>): Record<string, Material> {
  const M = createMaterials()
  const glow = new MeshBasicNodeMaterial()
  glow.colorNode = color(0xdff0ff).mul(lightbar)
  glow.userData.emissive = true
  M.glow = glow
  return M
}

export function createCybertruckCombat(model: TransformerModel, weaponAsset: WeaponAsset | undefined, truck: CybertruckEffects, contact: ContactEffects, mix: AudioMix): CharacterCombat {
  const overlay = new CombatOverlay(model.rig, {
    main: 'R',
    grip: [0.115, 0.0, -0.406],
    fist: [84, 98, 72],
    handle: [48, 78, 72],
    thumb: [18, 24, 18],
    offGrip: weaponAsset ? weaponAsset.manifest.grips.off : [0, 0, 0.95],
    sole: { heel: HEAVY_GAIT.heel, toe: HEAVY_GAIT.toe, ankle: HEAVY_GAIT.ankle },
  })
  const lightbar = uniform(LIGHTBAR.rest)
  const weapon = weaponAsset
    ? new Weapon(weaponAsset, axeMaterials(lightbar), { front: [5, 8, 14], after: [0.15, 0.4, 1.8], band: 0.12, cool: 0.3 }, overlay.grip)
    : null
  const effects = new CybertruckFighter(model, truck, contact, mix, weapon, lightbar)
  truck.object.add(effects.object)
  return { moveset: CYBERTRUCK_MOVES, overlay, effects, stepLift: 0.3 }
}
