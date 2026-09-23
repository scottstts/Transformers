import type { ContactEffects } from '../../game/contact-effects'
import { CybertruckModel } from './model/transformer.ts'
import { createMaterials } from './materials.ts'
import { CybertruckGait } from './animation/gait.ts'
import { DURATION } from './animation/choreography.ts'
import { ROBOT_Z } from './model/humanoid.ts'
import { CybertruckEffects } from './effects'

/** The current playable character's authored parts and simulation settings. */
export function createCybertruck(contactEffects: ContactEffects) {
  const model = new CybertruckModel(createMaterials())
  return {
    id: 'cybertruck',
    model,
    gait: new CybertruckGait(),
    effects: new CybertruckEffects(model, contactEffects),
    transformationDuration: DURATION,
    robotOffset: ROBOT_Z,
  } as const
}
