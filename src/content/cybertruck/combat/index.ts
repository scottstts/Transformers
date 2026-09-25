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
import { CYBERTRUCK_SPECIAL } from './special'
import { SkyfallFx } from './special-fx'

/** The axe's light bar at rest and at a flare (emissive scale). */
const LIGHTBAR = { rest: 5, flare: 16 }
/** Thruster charge: throttle ramp (1/s) and the exhaust's share pointing down (the rest straight back). */
const BOOST_RAMP = 7
const BOOST_DOWN = 0.32
/**
 * The special's jets: the exhaust axis (share straight back of the robot; the
 * rest straight down to lift, straight up to drive the dive).
 */
const LIFT_BACK = 0.2
const DIVE_BACK = 0.62

/** Which way the charge's jets point: back (the thruster charge), down (lift-off) or up (a dive). */
type JetMode = 'back' | 'down' | 'up'

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
  private readonly skyfall: SkyfallFx
  private boostTarget = 0
  private boostPower = 0
  private jets: JetMode = 'back'
  private readonly exhaust = new Vector3()

  constructor(model: TransformerModel, truck: CybertruckEffects, contact: ContactEffects, mix: AudioMix, weapon: Weapon | null, lightbar: { value: number }) {
    super(model, truck, contact, mix, weapon, STYLE)
    this.truck = truck
    this.lightbar = lightbar
    this.skyfall = new SkyfallFx({ truck, weapon, contact, mix, sparks: this.sparks, billows: this.billows, blast: this.blast, haze: this.haze, robotOffset: model.dims.robotF })
  }

  beginSpecial(): void {
    this.skyfall.reset()
  }

  cue(cue: MoveCue, frame: CombatFrame): void {
    const v = cue.value ?? 1
    if (cue.cue === 'boost') this.jet('back', v)
    else if (cue.cue === 'lift') this.jet('down', v)
    else if (cue.cue === 'dive') this.jet('up', v)
    else if (!this.skyfall.cue(cue, frame)) super.cue(cue, frame)
  }

  private jet(mode: JetMode, power: number): void {
    if (power > 0) this.jets = mode
    this.boostTarget = power
  }

  update(dt: number, frame: CombatFrame): void {
    super.update(dt, frame)
    // the charge: jets straight back and a little down, throttle ramped
    const k = 1 - Math.exp(-dt * BOOST_RAMP)
    this.boostPower += (this.boostTarget - this.boostPower) * k
    if (this.boostTarget === 0 && this.boostPower < 0.01) this.boostPower = 0
    const yaw = frame.state.yaw
    const back = this.jets === 'back' ? 1 - BOOST_DOWN : this.jets === 'down' ? LIFT_BACK : DIVE_BACK
    const vertical = this.jets === 'back' ? -BOOST_DOWN : this.jets === 'down' ? -1 : 1
    this.exhaust.set(-Math.sin(yaw) * back, vertical * Math.sqrt(1 - back * back), -Math.cos(yaw) * back)
    this.truck.thrusters.boost(this.boostPower, this.exhaust)
    this.skyfall.update(dt)
    // the light bar flares with the edge's speed, and burns while the axe is overcharged
    const flare = Math.max(Math.min(1, this.swingSpeed / 24) ** 2, this.skyfall.charge)
    this.lightbar.value = LIGHTBAR.rest + (LIGHTBAR.flare - LIGHTBAR.rest) * flare
    this.charged = this.skyfall.charge
  }

  reset(): void {
    super.reset()
    this.boostTarget = 0
    this.boostPower = 0
    this.jets = 'back'
    this.truck.thrusters.boost(0, this.exhaust)
    this.skyfall.reset()
    this.charged = 0
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
  return { moveset: CYBERTRUCK_MOVES, overlay, effects, stepLift: 0.3, special: CYBERTRUCK_SPECIAL }
}
