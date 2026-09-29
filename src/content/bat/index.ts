import type { ContactEffects } from '../../game/contact-effects'
import type { AudioMix } from '../../audio/mix'
import type { PlayableTransformerAsset, TransformerAsset } from '../transformer/asset/loader'
import { loadTransformerAsset } from '../transformer/asset/loader'
import { TransformerModel } from '../transformer/model/transformer'
import { RobotGait, type GaitStyle } from '../transformer/animation/gait'
import type { Character, CharacterProfile } from '../transformer/character'
import { loadWeaponAsset } from '../transformer/asset/weapon'
import { createBatMaterials } from './materials'
import { BatEffects } from './effects'
import { createBatCombat } from './combat'

export const BAT_LABEL = 'Bat'
/** The robot's spear (public/models/bat-spear.*). */
export const BAT_WEAPON = 'bat-spear'

/**
 * Handling and framing of the Bat, the Tumbler (a 3.6 m wheelbase off-road
 * brute on 44 in swampers at the rear and fat turf tyres on exposed arms in
 * front, a V8 through a four-speed automatic, and an afterburner for its
 * boost) and its robot (hips 2.76 m up, 5.4 m tall: about the pickup's size).
 */
export const BAT_PROFILE: CharacterProfile = {
  drive: {
    wheelbase: 3.6,
    frontAxle: 1.8,
    cgHeight: 0.8,
    yawInertia: 3.7,
    grip: 1.15,
    peakSlip: 0.15,
    downforce: 0,
    driveRear: 0.8,
    driftGrip: 0.68,
    wheelRadius: 0.555,
    maxSpeed: 38,
    boostSpeed: 58,
    accel: 9,
    boostAccel: 17,
    brake: 18,
    reverse: 6,
    reverseSpeed: 10,
    coast: 1.5,
    coastDrag: 0.03,
    steerLock: 0.56,
    steerFade: 0.05,
    pitchGain: 0.005,
    pitchLimit: 0.055,
    rollGain: 0.0065,
    rollLimit: 0.065,
    pivotHeight: 0.75,
    track: 2.15,
    rideFrequency: 1.3,
    bump: 0.2,
  },
  robot: { walkSpeed: 3.7, runSpeed: 14.2 },
  camera: { carDistance: 8.2, robotDistance: 12, carFocus: 1.15, robotFocus: 3.6, carHalfLength: 3.3 },
  carRadius: 2.4,
  robotRadius: 1.4,
  // narrow in front (the beak between the arms), massive at the rear (four swampers abreast)
  carBody: [[1.5, 0.95], [0, 1.35], [-1.55, 1.45]],
}

/**
 * The Bat's walk and run: the pickup robot's heavy machine (a walk at Froude
 * 0.5, pelvis and chest carried nearly as one block), scaled to its 2.76 m
 * hips: strides by the legs, speeds by their square root, so the cadence is
 * the size's own. Its stand is wide (feet 0.86 m out, hips 0.4 m), so moving
 * it draws the feet in under the hips (`track`), and it runs as the Semi
 * does, on short support and straight support legs: the pickup's long
 * contact sweep and run crouch bent its knees to 88 degrees with its feet
 * half a metre outside its hips (a crouching, straddling run).
 */
export const BAT_GAIT: GaitStyle = {
  stride: [2.18, 4.1],
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
  heel: 0.33,
  toe: 0.86,
  ankle: 0.4,
  belly: [0, 0.004],
  jumpCrouch: 0.36,
  jumpTuck: 0.4,
  track: [0.72, 0.6],
}

export async function loadBatAsset(): Promise<PlayableTransformerAsset> {
  const [asset, weapon] = await Promise.all([loadTransformerAsset('bat', BAT_LABEL), loadWeaponAsset(BAT_WEAPON, BAT_LABEL)])
  return { ...asset, weapon }
}

/**
 * The wheel groups are world-hosted while they draw up and swing round the
 * rising body (btb/choreo.py); from their hand-over each keeps its baked
 * place on the bone that carries it in robot form, so it follows the gait:
 * the front wheels on the shoulders, the rear corners on the calves.
 */
const CARRIED: Record<string, string> = {
  'asm:frontWheel.L': 'bone:clav.L',
  'asm:frontWheel.R': 'bone:clav.R',
  'asm:corner.L': 'bone:shin.L',
  'asm:corner.R': 'bone:shin.R',
}

/** The Bat's authored parts and simulation settings. */
export function createBat(asset: TransformerAsset, contactEffects: ContactEffects, mix: AudioMix): Character & { effects: BatEffects } {
  const model = new TransformerModel(asset, createBatMaterials(), {
    label: BAT_LABEL,
    footNodes: ['bone:foot.L', 'bone:foot.R', 'bone:toe.L', 'bone:toe.R'],
    // the heel's edge lies between the 26 box directions: sampled along the rolling plane, the ground finds it
    rollSupport: true,
    carried: CARRIED,
    // the turf tyres in front are smaller than the swampers (btb/dims.py FR_R)
    frontWheelRadius: 0.43,
  })
  const effects = new BatEffects(model, contactEffects, asset.manifest.events, model.duration, mix)
  const sole = { heel: BAT_GAIT.heel, toe: BAT_GAIT.toe, ankle: BAT_GAIT.ankle }
  return {
    id: 'bat',
    model,
    gait: new RobotGait(BAT_GAIT),
    effects,
    combat: createBatCombat(model, asset.weapon, effects, contactEffects, mix, sole),
    profile: BAT_PROFILE,
    transformationDuration: model.duration,
    robotOffset: model.dims.robotF,
  }
}
