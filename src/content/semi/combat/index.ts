import { MeshBasicNodeMaterial, type Material, type Node } from 'three/webgpu'
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
import { createSemiMaterials } from '../materials'
import type { SemiEffects } from '../effects'
import { SEMI_MOVES, SEMI_GUARD } from './moves'
import { SEMI_HITS } from './hits'
import { SEMI_SPECIAL } from './special'
import { JuggernautFx } from './special-fx'
import { Gunnery } from './gunnery'

/** The coils' glow at rest and fully charged (emissive scale). */
const COILS = { rest: 0.6, charged: 9 }
/** How far a cannon shot flies before its fuse bursts it in the air, unless a cue sets it (m). */
const FUSE = 60

/**
 * The Semi fights like a heavyweight that doesn't need its hands: kicks from
 * seven metres up, then the gun, forged in the right hand out of the coils'
 * violet discharge, braced along the forearm like an arm cannon (its
 * shoulders are too broad for the left hand to reach the foregrip). The
 * gun's machine gun sweeps the front, its coil cannon blasts it.
 */
const STYLE: FighterStyle = {
  swing: { bodyHz: 190, edgeHz: 850, speed: 26, edge: 0.3, level: 0.36 },
  forge: { from: 240, to: 1300, crackleHz: 2900, level: 0.3 },
  palette: 1,
  light: 0xc8b4ff,
  step: 1.05,
  shield: [0.62, 0.42, 1.0],
}

/**
 * Cues of the gun (gunnery.ts), on top of the shared fighter's:
 *   fire    (1 / 0) the machine gun opens up or ceases
 *   charge  (0..1) the coils charge toward this level
 *   seek    (1 / 0) rounds and shots aim at bodies in the air near the barrels' line
 *   fuse    (m) the next cannon shot bursts in the air this far out
 *   cannon  (strength) the cannon fires
 */
class SemiFighter extends Fighter {
  private readonly gun: Gunnery | null
  private readonly coils: { value: number }
  private readonly juggernaut: JuggernautFx
  private fuse = FUSE

  constructor(model: TransformerModel, semi: SemiEffects, contact: ContactEffects, mix: AudioMix, weapon: Weapon | null, coils: { value: number }) {
    super(model, semi, contact, mix, weapon, STYLE)
    this.coils = coils
    this.gun = weapon ? new Gunnery({ weapon, contact, mix, sparks: this.sparks, billows: this.billows, blast: this.blast, haze: this.haze, listener: model.root.position }) : null
    if (this.gun) this.object.add(this.gun.object)
    this.juggernaut = new JuggernautFx({
      semi, gun: this.gun, contact, mix, sparks: this.sparks, billows: this.billows, blast: this.blast, haze: this.haze,
      feet: [model.node('bone:foot.L'), model.node('bone:foot.R')], robotOffset: model.dims.robotF,
    })
  }

  beginSpecial(): void {
    this.juggernaut.reset()
  }

  cue(cue: MoveCue, frame: CombatFrame): void {
    const v = cue.value ?? 1
    const gun = this.gun
    switch (cue.cue) {
      case 'fire': gun?.fire(v > 0); return
      case 'seek': gun?.seek(v > 0); return
      case 'charge': gun?.chargeTo(v); return
      case 'fuse': this.fuse = v; return
      case 'cannon':
        gun?.cannon(frame, v, this.fuse)
        this.fuse = FUSE
        return
    }
    if (!this.juggernaut.cue(cue, frame)) super.cue(cue, frame)
  }

  update(dt: number, frame: CombatFrame): void {
    super.update(dt, frame)
    const gun = this.gun
    if (gun) {
      gun.update(dt, frame)
      // the coils glow with their charge, flickering as it builds; the fighter's light holds on while they are charged
      const c = gun.charge
      this.coils.value = COILS.rest + (COILS.charged - COILS.rest) * c * c * (c > 0.05 ? 0.85 + 0.3 * Math.random() : 1)
      this.charged = c
    }
    this.juggernaut.update(dt)
  }

  ambient(dt: number, yaw: number): void {
    super.ambient(dt, yaw)
    // rounds still in flight land, casings fall, smoke drifts
    this.billows.update(dt)
    this.haze.update(dt)
    this.blast.update(dt)
    this.gun?.update(dt, this.idle)
  }

  reset(): void {
    super.reset()
    this.gun?.reset()
    this.juggernaut.reset()
    this.coils.value = COILS.rest
    this.charged = 0
    this.fuse = FUSE
  }

  warm(on: boolean): void {
    super.warm(on)
    this.gun?.warm(on)
  }

  prepareAudio(): void {
    super.prepareAudio()
    this.gun?.audio.prepare()
  }

  dispose(): void {
    super.dispose()
    this.gun?.dispose()
    this.juggernaut.dispose()
  }

  /** A frame outside the fight: no moves, no camera, nothing to strike. */
  private readonly idle: CombatFrame = {
    weight: 0, values: new Float32Array(0), move: -1, time: 0, state: null as unknown as CombatFrame['state'], probe: null, airborne: null,
    camera: { kick() {}, shake() {}, punch() {}, pull() {}, hitStop() {}, shockwave() {}, flash() {}, zone() {} },
  }
}

/** The gun's material slots: the truck's own, plus the coils' glow. */
function gunMaterials(coils: Node<'float'>): Record<string, Material> {
  const M = createSemiMaterials()
  const glow = new MeshBasicNodeMaterial()
  glow.colorNode = color(0xd8ccff).mul(coils)
  glow.userData.emissive = true
  M.glow = glow
  return M
}

export function createSemiCombat(model: TransformerModel, weaponAsset: WeaponAsset | undefined, semi: SemiEffects, contact: ContactEffects, mix: AudioMix, sole: { heel: number; toe: number; ankle: number }): CharacterCombat {
  const overlay = new CombatOverlay(model.rig, {
    main: 'R',
    grip: [0.142, 0.0, -0.34],
    fist: [86, 100, 74],
    handle: [48, 78, 72],
    // the rig's thumb rests flexed: opposed and eased open, it wraps the far side of the grip
    thumb: [30, -15, -10],
    offGrip: weaponAsset ? weaponAsset.manifest.grips.off : [-0.23, 0, 1.1],
    sole,
    pistol: true,
  })
  const coils = uniform(COILS.rest)
  const weapon = weaponAsset
    ? new Weapon(weaponAsset, gunMaterials(coils), { front: [9, 6, 16], after: [0.9, 0.35, 2.2], band: 0.1, cool: 0.28 }, overlay.grip)
    : null
  const effects = new SemiFighter(model, semi, contact, mix, weapon, coils)
  semi.object.add(effects.object)
  return { moveset: SEMI_MOVES, overlay, effects, stepLift: 0.36, special: SEMI_SPECIAL, hits: SEMI_HITS, guard: SEMI_GUARD }
}
