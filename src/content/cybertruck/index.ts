import type { ContactEffects } from '../../game/contact-effects'
import type { AudioMix } from '../../audio/mix'
import type { TransformerAsset } from '../transformer/asset/loader'
import { loadTransformerAsset } from '../transformer/asset/loader'
import { TransformerModel } from '../transformer/model/transformer'
import { RobotGait } from '../transformer/animation/gait'
import type { Character, CharacterProfile } from '../transformer/character'
import { createMaterials } from './materials.ts'
import { CybertruckEffects } from './effects'

export const CYBERTRUCK_LABEL = 'Cybertruck'

/** Handling and framing of the Cybertruck and its robot. */
export const CYBERTRUCK_PROFILE: CharacterProfile = {
  drive: {
    wheelbase: 3.81,
    wheelRadius: 0.445,
    maxSpeed: 36,
    boostSpeed: 52,
    accel: 8.5,
    boostAccel: 12,
    brake: 18,
    reverse: 6,
    reverseSpeed: 10,
    coast: 1.4,
    coastDrag: 0.03,
    steerLock: 0.58,
    steerFade: 0.045,
    pitchGain: 0.0045,
    pitchLimit: 0.05,
    rollGain: 0.006,
    rollLimit: 0.06,
    pivotHeight: 0.7,
  },
  robot: { walkSpeed: 3.4, runSpeed: 7.5 },
  camera: { carDistance: 7.875, robotDistance: 12.75, carFocus: 1.1, robotFocus: 3.9 },
  carRadius: 2.4,
  robotRadius: 1.5,
}

export function loadCybertruckAsset(): Promise<TransformerAsset> {
  return loadTransformerAsset('cybertruck', CYBERTRUCK_LABEL)
}

/** The Cybertruck's authored parts and simulation settings. */
export function createCybertruck(asset: TransformerAsset, contactEffects: ContactEffects, mix: AudioMix): Character & { effects: CybertruckEffects } {
  const model = new TransformerModel(asset, createMaterials(), {
    label: CYBERTRUCK_LABEL,
    footNodes: ['bone:foot.L', 'bone:foot.R', 'asm:toecap.L', 'asm:toecap.R'],
  })
  return {
    id: 'cybertruck',
    model,
    gait: new RobotGait(),
    effects: new CybertruckEffects(model, contactEffects, asset.manifest.events, model.duration, mix),
    profile: CYBERTRUCK_PROFILE,
    transformationDuration: model.duration,
    robotOffset: model.dims.robotF,
  }
}
