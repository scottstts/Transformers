import type { ContactEffects } from '../../game/contact-effects'
import type { AudioMix } from '../../audio/mix'
import type { PlayableTransformerAsset, TransformerAsset } from '../transformer/asset/loader'
import { loadTransformerAsset } from '../transformer/asset/loader'
import type { TransformerManifest } from '../transformer/asset/format'
import { TransformerModel } from '../transformer/model/transformer'
import { RobotGait, type GaitStyle } from '../transformer/animation/gait'
import type { Character, CharacterProfile } from '../transformer/character'
import { createF1Materials } from './materials'
import { F1Effects } from './effects'
import { loadWeaponAsset } from '../transformer/asset/weapon'
import { createF1Combat } from './combat'

export const F1_LABEL = 'Ferrari F1'
/** The robot's sword (public/models/ferrari-f1-sword.*). */
export const F1_WEAPON = 'ferrari-f1-sword'

/**
 * Handling and framing of the F1 car (3.6 m wheelbase, 720 mm wheels, a stiff,
 * low car that pitches and rolls very little) and its robot (hips 2.1 m high,
 * about two thirds of the truck robot).
 */
export const F1_PROFILE: CharacterProfile = {
  drive: {
    wheelbase: 3.6,
    frontAxle: 1.8,
    cgHeight: 0.28,
    yawInertia: 2.9,
    grip: 1.45,
    peakSlip: 0.09,
    downforce: 0.0003,
    driveRear: 1,
    driftGrip: 0.7,
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
  robot: { walkSpeed: 4.8, runSpeed: 15.6 },
  camera: { carDistance: 7.2, robotDistance: 10.2, carFocus: 0.85, robotFocus: 2.9 },
  carRadius: 2.4,
  robotRadius: 1.2,
}

/**
 * A long, relaxed walk and an athletic run. The broad soles stay on parallel
 * tracks under the hips; the knees bend forward instead of following the
 * transformation's upward pole. Tuned against human joint ranges: a walk
 * that vaults over near-straight stance legs, and a sprinter's run with short
 * support, heel recovery and knee drive (docs/robot-locomotion.md).
 */
export const RACER_GAIT: GaitStyle = {
  stride: [1.575, 3.8],
  stance: [0.6, 0.25],
  lift: [0.22, 0.7],
  runFlight: 0.06,
  runCompression: 0.05,
  runCrouch: 0.03,
  sway: 0.035,
  bob: 0,
  hipYaw: 4,
  hipList: 2,
  shoulders: 3,
  armSwing: [18, 42],
  heelStrike: [10, 3],
  toeOff: [22, 28],
  heel: 0.43,
  toe: 0.78,
  ankle: 0.26,
  jumpCrouch: 0.3,
  jumpTuck: 0.34,
  track: [0.82, 0.7],
  armAbduct: [0.45, 0.4],
  runElbow: 52,
  armCross: 6,
  kneePoleUp: [1, 0],
  lean: [0, 0.3],
  reach: [0.47, 0.38],
  kneeFloor: [10, 18],
  vault: 1,
  liftWindow: [[0.25, 0.3], [0.25, 0.6]],
  toeRelease: [0.5, 0.7],
  armCarry: [8, 14],
}

export async function loadF1Asset(): Promise<PlayableTransformerAsset> {
  const [asset, weapon] = await Promise.all([loadTransformerAsset('ferrari-f1', F1_LABEL), loadWeaponAsset(F1_WEAPON, F1_LABEL)])
  return { ...asset, weapon }
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
  const effects = new F1Effects(model, contactEffects, asset.manifest.events, model.duration, mix)
  const sole = { heel: RACER_GAIT.heel, toe: RACER_GAIT.toe, ankle: RACER_GAIT.ankle }
  return {
    id: 'ferrari-f1',
    model,
    gait: new RobotGait(RACER_GAIT),
    effects,
    combat: createF1Combat(model, asset.weapon, effects, contactEffects, mix, sole),
    profile: F1_PROFILE,
    transformationDuration: model.duration,
    robotOffset: model.dims.robotF,
  }
}
