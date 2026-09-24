import type { ContactEffects } from '../../game/contact-effects'
import type { AudioMix } from '../../audio/mix'
import type { TransformerAsset } from '../transformer/asset/loader'
import { loadTransformerAsset } from '../transformer/asset/loader'
import type { TransformerManifest } from '../transformer/asset/format'
import { TransformerModel } from '../transformer/model/transformer'
import { RobotGait, type GaitStyle } from '../transformer/animation/gait'
import type { Character, CharacterProfile } from '../transformer/character'
import { createF1Materials } from './materials'
import { F1Effects } from './effects'

export const F1_LABEL = 'Ferrari F1'

/**
 * Handling and framing of the F1 car (3.6 m wheelbase, 720 mm wheels, a stiff,
 * low car that pitches and rolls very little) and its robot (hips 2.1 m high,
 * about two thirds of the truck robot).
 */
export const F1_PROFILE: CharacterProfile = {
  drive: {
    wheelbase: 3.6,
    wheelRadius: 0.36,
    maxSpeed: 58,
    boostSpeed: 80,
    accel: 11,
    boostAccel: 15,
    brake: 34,
    reverse: 5,
    reverseSpeed: 8,
    coast: 1.8,
    coastDrag: 0.045,
    steerLock: 0.45,
    steerFade: 0.05,
    pitchGain: 0.0015,
    pitchLimit: 0.018,
    rollGain: 0.002,
    rollLimit: 0.02,
    pivotHeight: 0.3,
  },
  robot: { walkSpeed: 3.2, runSpeed: 7.8 },
  camera: { carDistance: 7.2, robotDistance: 10.2, carFocus: 0.85, robotFocus: 2.9 },
  carRadius: 2.4,
  robotRadius: 1.2,
}

/** A lighter, quicker robot than the truck's: shorter strides, snappier arms. */
const RACER_GAIT: GaitStyle = {
  stride: [1.05, 1.9],
  lift: [0.26, 0.55],
  runFlight: 0.06,
  runCompression: 0.05,
  runCrouch: 0.09,
  sway: 0.045,
  armSwing: [18, 42],
  jumpCrouch: 0.3,
  jumpTuck: 0.34,
}

export function loadF1Asset(): Promise<TransformerAsset> {
  return loadTransformerAsset('ferrari-f1', F1_LABEL)
}

/**
 * The soles: every node the foot bones carry (the foot and toe structure, the
 * sole platform and its flaps, the wing halves and nose tip that dock on the
 * foot), except the carrier struts, which are retracted in the stand.
 */
export function f1FootNodes(manifest: TransformerManifest): string[] {
  const nodes = manifest.nodes
  const under = (i: number, root: number): boolean => {
    for (let p = i; p >= 0; p = nodes[p].parent) if (p === root) return true
    return false
  }
  const out: string[] = []
  for (const side of ['L', 'R']) {
    const root = nodes.findIndex((n) => n.name === `bone:foot.${side}`)
    nodes.forEach((n, i) => {
      if (under(i, root) && !n.name.startsWith('part:C.') && n.meshes.length) out.push(n.name)
    })
  }
  return out
}

/** The Ferrari F1's authored parts and simulation settings. */
export function createF1(asset: TransformerAsset, contactEffects: ContactEffects, mix: AudioMix): Character & { effects: F1Effects } {
  const model = new TransformerModel(asset, createF1Materials(), { label: F1_LABEL, footNodes: f1FootNodes(asset.manifest) })
  return {
    id: 'ferrari-f1',
    model,
    gait: new RobotGait(RACER_GAIT),
    effects: new F1Effects(model, contactEffects, asset.manifest.events, model.duration, mix),
    profile: F1_PROFILE,
    transformationDuration: model.duration,
    robotOffset: model.dims.robotF,
  }
}
