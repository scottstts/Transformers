import type { ContactEffects } from '../../game/contact-effects'
import type { AudioMix } from '../../audio/mix'
import type { PlayableTransformerAsset, TransformerAsset } from '../transformer/asset/loader'
import { loadTransformerAsset } from '../transformer/asset/loader'
import { TransformerModel } from '../transformer/model/transformer'
import { RobotGait, type GaitStyle } from '../transformer/animation/gait'
import type { Character, CharacterProfile } from '../transformer/character'
import { createRoadsterMaterials } from './materials'
import { RoadsterEffects } from './effects'
import { createRoadsterCombat } from './combat'

export const ROADSTER_LABEL = 'Roadster'

/**
 * Handling and framing of the Roadster, the new Tesla Roadster (4.36 m long,
 * a 2.91 m wheelbase on 0.39 m tyres, electric all-wheel drive with a
 * compressed-air propulsion pack in its tail) and its robot (hips 3.62 m up,
 * 6 m tall: the Cybertruck robot's class). A low, stiff, very fast car on
 * wide tyres: high grip that gives up late, little roll, a firm ride. With
 * Shift's full power the tail's air jets fire (`airThrust`): a hard push
 * past the tyres' grip to 92 m/s.
 */
export const ROADSTER_PROFILE: CharacterProfile = {
  drive: {
    wheelbase: 2.91,
    frontAxle: 1.41,
    cgHeight: 0.42,
    yawInertia: 2.2,
    grip: 1.32,
    peakSlip: 0.13,
    downforce: 0.00045,
    driveRear: 0.62,
    driftGrip: 0.72,
    wheelRadius: 0.392,
    maxSpeed: 56,
    boostSpeed: 70,
    accel: 13,
    boostAccel: 19,
    brake: 22,
    reverse: 7,
    reverseSpeed: 12,
    coast: 1.1,
    coastDrag: 0.022,
    steerLock: 0.54,
    steerFade: 0.055,
    pitchGain: 0.0034,
    pitchLimit: 0.04,
    rollGain: 0.0042,
    rollLimit: 0.045,
    pivotHeight: 0.42,
    track: 1.72,
    rideFrequency: 1.75,
    bump: 0.1,
    airThrust: { accel: 14, topSpeed: 92, spoolUp: 7, spoolDown: 4 },
  },
  robot: { walkSpeed: 4.25, runSpeed: 16.3 },
  camera: { carDistance: 7.4, robotDistance: 13.2, carFocus: 0.95, robotFocus: 4.0, carHalfLength: 2.6 },
  carRadius: 2.1,
  robotRadius: 1.5,
  // the low wedge (1.9 m wide, 4.36 m long) as three circles along it
  carBody: [[1.35, 0.96], [0, 1.0], [-1.35, 0.98]],
}

/**
 * The Roadster's walk and run: the heavy machine's (a walk at Froude 0.5,
 * pelvis and chest carried nearly as one block), scaled to its 3.62 m hips:
 * strides by the legs, speeds by their square root, so the cadence is the
 * size's own. Its stand is wide (feet 0.85 m out against 0.5 m hips), so
 * moving draws the feet in under the hips (`track`); it runs on short
 * support and straight support legs, a `runCycle` run whose flight is
 * ballistic.
 */
export const ROADSTER_GAIT: GaitStyle = {
  stride: [2.86, 5.37],
  stance: [0.58, 0.26],
  reach: [0.45, 0.38],
  kneeFloor: [12, 8],
  vault: 0.5,
  lift: [0.38, 0.8],
  runFlight: 0.08,
  runCompression: 0.08,
  runCrouch: 0,
  sway: [0.075, 0.035],
  bob: 0.04,
  hipYaw: [3, 5],
  hipList: [1.5, 1.8],
  shoulders: [1.5, 4],
  armSwing: [18, 38],
  heelStrike: [20, 5],
  toeOff: [38, 32],
  heel: 0.395,
  toe: 0.975,
  ankle: 0.74,
  jumpCrouch: 0.45,
  jumpTuck: 0.5,
  track: [0.66, 0.56],
  runCycle: { recoveryPeak: 0.38 },
}

/** The robot carries no external weapon: its cannons are built into its palms (combat.md). */
export async function loadRoadsterAsset(): Promise<PlayableTransformerAsset> {
  const asset = await loadTransformerAsset('roadster', ROADSTER_LABEL)
  return { ...asset, weapon: null }
}

/**
 * Parts the bake hangs from one bone that rest on another's at the stand
 * (`AUDIT_HOSTS=1 node tools/pose-audit.mjs roadster`): carried by the bone
 * they rest on, so the gait and the fight do not swing them off.
 */
const CARRIED: Record<string, string> = {}

/**
 * The telescopic braces (rdb/linkage.py): each lies closed inside one limb at
 * the stand, both pins on the bone that carries the part, so the live
 * skeleton keeps them as baked.
 */
const BRACES: Record<string, readonly [string, string]> = {}

/** The Roadster's authored parts and simulation settings. */
export function createRoadster(asset: TransformerAsset, contactEffects: ContactEffects, mix: AudioMix): Character & { effects: RoadsterEffects } {
  const model = new TransformerModel(asset, createRoadsterMaterials(), {
    label: ROADSTER_LABEL,
    // the feet's castings are parts on the foot and toe bones (the bones carry no geometry)
    footNodes: ['part:foot.L', 'part:foot.R', 'part:toe.L', 'part:toe.R'],
    rollSupport: true,
    carried: CARRIED,
    braces: BRACES,
  })
  const effects = new RoadsterEffects(model, contactEffects, asset.manifest.events, model.duration, mix)
  const sole = { heel: ROADSTER_GAIT.heel, toe: ROADSTER_GAIT.toe, ankle: ROADSTER_GAIT.ankle, soleRadius: ROADSTER_GAIT.soleRadius }
  return {
    id: 'roadster',
    model,
    gait: new RobotGait(ROADSTER_GAIT),
    effects,
    combat: createRoadsterCombat(model, effects, contactEffects, mix, sole),
    profile: ROADSTER_PROFILE,
    transformationDuration: model.duration,
    robotOffset: model.dims.robotF,
    altitude: () => effects.altitude(model.T),
  }
}
