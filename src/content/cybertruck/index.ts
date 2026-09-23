import type { ContactEffects } from '../../game/contact-effects'
import type { CybertruckAsset } from './asset/loader'
import { CybertruckModel } from './model/transformer.ts'
import { createMaterials } from './materials.ts'
import { CybertruckGait } from './animation/gait.ts'
import { CybertruckEffects } from './effects'

export { loadCybertruckAsset } from './asset/loader'
export type { CybertruckAsset } from './asset/loader'

/** The current playable character's authored parts and simulation settings. */
export function createCybertruck(asset: CybertruckAsset, contactEffects: ContactEffects) {
  const model = new CybertruckModel(asset, createMaterials())
  return {
    id: 'cybertruck',
    model,
    gait: new CybertruckGait(),
    effects: new CybertruckEffects(model, contactEffects, asset.manifest.events, model.duration),
    transformationDuration: model.duration,
    robotOffset: model.dims.robotF,
  } as const
}
