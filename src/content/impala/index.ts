import type { ContactEffects } from '../../game/contact-effects'
import type { AudioMix } from '../../audio/mix'
import type { PlayableTransformerAsset, TransformerAsset } from '../transformer/asset/loader'
import { loadTransformerAsset } from '../transformer/asset/loader'
import { TransformerModel } from '../transformer/model/transformer'
import { RobotGait, type GaitStyle } from '../transformer/animation/gait'
import type { Character, CharacterProfile } from '../transformer/character'
import { loadWeaponAsset } from '../transformer/asset/weapon'
import { createImpalaMaterials } from './materials'
import { ImpalaEffects } from './effects'
import { createImpalaCombat } from './combat'

export const IMPALA_LABEL = 'Impala'
/** The robot's cutlass (impala-cutlass.* on the asset CDN). */
export const IMPALA_WEAPON = 'impala-cutlass'

/**
 * Handling and framing of the Impala, a 1967 full-size Chevrolet (5.7 m
 * long, a 3.14 m wheelbase and 1.68 m track on narrow 0.36 m bias-ply
 * tyres, a big-block V8 through a three-speed automatic to the rear wheels)
 * and its robot (hips 2.87 m up, 5.5 m tall: the pickup's size). A heavy,
 * softly sprung cruiser: it rolls and pitches more than the others, gives up
 * grip early and steps its tail out readily, and stops on drums.
 */
export const IMPALA_PROFILE: CharacterProfile = {
  drive: {
    wheelbase: 3.14,
    frontAxle: 1.61,
    cgHeight: 0.6,
    yawInertia: 3.3,
    grip: 1.02,
    peakSlip: 0.16,
    downforce: 0,
    driveRear: 1,
    driftGrip: 0.64,
    wheelRadius: 0.3616,
    maxSpeed: 42,
    boostSpeed: 54,
    accel: 8,
    boostAccel: 12,
    brake: 15,
    reverse: 5.5,
    reverseSpeed: 9,
    coast: 1.3,
    coastDrag: 0.028,
    steerLock: 0.56,
    steerFade: 0.05,
    pitchGain: 0.0058,
    pitchLimit: 0.06,
    rollGain: 0.0085,
    rollLimit: 0.085,
    pivotHeight: 0.55,
    track: 1.68,
    rideFrequency: 1.15,
    bump: 0.16,
  },
  robot: { walkSpeed: 3.77, runSpeed: 14.5 },
  camera: { carDistance: 8, robotDistance: 12.5, carFocus: 1.0, robotFocus: 3.7, carHalfLength: 2.9 },
  carRadius: 2.4,
  robotRadius: 1.45,
  // the long body (2.2 m wide, 5.7 m long) as three circles along it
  carBody: [[1.85, 1.12], [0, 1.12], [-1.85, 1.12]],
}

/**
 * The Impala's walk and run: the heavy machine's (a walk at Froude 0.5,
 * pelvis and chest carried nearly as one block), scaled to its 2.87 m hips:
 * strides by the legs, speeds by their square root. Its stand is wide (feet
 * 0.94 m out, hips 0.47 m), so moving draws the feet in under the hips
 * (`track`), and it runs on short support and straight support legs. The run
 * is a `runCycle` run, its flight ballistic: on the heavy machines' run the
 * ground projection dragged the body 7 cm down after the lifting feet in
 * every flight (38 g at 60 Hz; 1.4 g with it).
 *
 * The soles (fitted with the probe's --sole): the toe and heel are rounded
 * (9 cm), and the heel pad stands a little higher than the toe pad (the
 * bottom rakes 1 degree, `soleTilt`): modelled flat, the heel held the ankle
 * up to 9 mm high until the toe pad took the weight, and the body dropped
 * 1 cm at every foot-flat (6.5 g).
 */
export const IMPALA_GAIT: GaitStyle = {
  stride: [2.27, 4.26],
  stance: [0.58, 0.26],
  reach: [0.45, 0.38],
  kneeFloor: [12, 8],
  vault: 0.5,
  lift: [0.3, 0.64],
  runFlight: 0.07,
  runCompression: 0.065,
  runCrouch: 0,
  sway: [0.065, 0.03],
  bob: 0.032,
  hipYaw: [3, 5],
  hipList: [1.5, 1.8],
  shoulders: [1.5, 4],
  armSwing: [18, 38],
  heelStrike: [20, 5],
  toeOff: [38, 32],
  heel: 0.19,
  toe: 0.65,
  ankle: 0.417,
  soleRadius: 0.09,
  soleTilt: -1,
  jumpCrouch: 0.36,
  jumpTuck: 0.4,
  track: [0.66, 0.56],
  runCycle: { recoveryPeak: 0.38 },
}

export async function loadImpalaAsset(): Promise<PlayableTransformerAsset> {
  const [asset, weapon] = await Promise.all([loadTransformerAsset('impala', IMPALA_LABEL), loadWeaponAsset(IMPALA_WEAPON, IMPALA_LABEL)])
  return { ...asset, weapon }
}

/** The Impala's authored parts and simulation settings. */
export function createImpala(asset: TransformerAsset, contactEffects: ContactEffects, mix: AudioMix): Character & { effects: ImpalaEffects } {
  const model = new TransformerModel(asset, createImpalaMaterials(), {
    label: IMPALA_LABEL,
    // the feet's castings ride their joints as parts (the bones carry no geometry)
    footNodes: ['part:foot.L', 'part:foot.R', 'part:toe.L', 'part:toe.R'],
    rollSupport: true,
  })
  const effects = new ImpalaEffects(model, contactEffects, asset.manifest.events, model.duration, mix)
  const sole = { heel: IMPALA_GAIT.heel, toe: IMPALA_GAIT.toe, ankle: IMPALA_GAIT.ankle, soleRadius: IMPALA_GAIT.soleRadius }
  return {
    id: 'impala',
    model,
    gait: new RobotGait(IMPALA_GAIT),
    effects,
    combat: createImpalaCombat(model, asset.weapon, effects, contactEffects, mix, sole),
    profile: IMPALA_PROFILE,
    transformationDuration: model.duration,
    robotOffset: model.dims.robotF,
  }
}
