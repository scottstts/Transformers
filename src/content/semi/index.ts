import type { ContactEffects } from '../../game/contact-effects'
import type { AudioMix } from '../../audio/mix'
import type { PlayableTransformerAsset, TransformerAsset } from '../transformer/asset/loader'
import { loadTransformerAsset } from '../transformer/asset/loader'
import type { TransformerManifest } from '../transformer/asset/format'
import { TransformerModel } from '../transformer/model/transformer'
import { RobotGait, type GaitStyle } from '../transformer/animation/gait'
import type { Character, CharacterProfile } from '../transformer/character'
import { loadWeaponAsset } from '../transformer/asset/weapon'
import { createSemiMaterials } from './materials'
import { SemiEffects } from './effects'
import { createSemiCombat } from './combat'

export const SEMI_LABEL = 'Semi'
/** The robot's gun (public/models/semi-gun.*). */
export const SEMI_WEAPON = 'semi-gun'

/** The kingpin: where the van rides the fifth wheel (authoring frame, m; 2.3 m behind the car origin). */
const KINGPIN: [number, number, number] = [0, 2.3, 1.26]

/**
 * Handling and framing of the Semi (a 4.6 m wheelbase tractor on 1 m tyres,
 * three motors on the drive tandem, a 28 ft van on its fifth wheel) and its
 * robot (hips 4.2 m high, a head taller than the pickup's robot).
 */
export const SEMI_PROFILE: CharacterProfile = {
  drive: {
    wheelbase: 4.58,
    frontAxle: 2.25,
    cgHeight: 1.25,
    yawInertia: 5.6,
    grip: 1.05,
    peakSlip: 0.16,
    downforce: 0,
    driveRear: 1,
    driftGrip: 0.72,
    wheelRadius: 0.52,
    maxSpeed: 31,
    boostSpeed: 40,
    accel: 5.5,
    boostAccel: 8,
    brake: 11,
    reverse: 3.5,
    reverseSpeed: 7,
    coast: 1.1,
    coastDrag: 0.022,
    steerLock: 0.6,
    steerFade: 0.06,
    pitchGain: 0.006,
    pitchLimit: 0.045,
    rollGain: 0.008,
    rollLimit: 0.06,
    pivotHeight: 1.1,
    track: 2.05,
    rideFrequency: 1.25,
    bump: 0.12,
    // the van's front wall clears the cab's extenders by only 25 cm: it swings about 11 degrees each way
    trailer: { hitch: -KINGPIN[1], length: 6.08, limit: 0.19, circles: [[-0.2, 1.45], [2.4, 1.45], [5.0, 1.45], [7.0, 1.4]] },
  },
  robot: { walkSpeed: 5.9, runSpeed: 17 },
  camera: { carDistance: 15, robotDistance: 16.5, carFocus: 2.3, robotFocus: 5.2, carAhead: -3.1, carHalfLength: 7.4 },
  carRadius: 3,
  robotRadius: 1.9,
  carBody: [[2.7, 1.4], [0.6, 1.45]],
}

/**
 * A heavy machine a third larger than the pickup's robot: strides scaled with
 * the legs, speeds with their square root (big things move with a slower
 * cadence), the wide stand drawn in under the hips while it moves, the
 * torso carried upright (about 5 degrees walking, 8 running).
 */
export const SEMI_GAIT: GaitStyle = {
  stride: [2.75, 5.6],
  // short support at a run and straight support legs: a long contact sweep sank the pelvis 0.8 m (a crouching run)
  stance: [0.6, 0.26],
  reach: [0.5, 0.38],
  kneeFloor: [20, 8],
  lift: [0.42, 0.9],
  runFlight: 0.08,
  runCompression: 0.06,
  runCrouch: 0,
  sway: 0.09,
  bob: 0.045,
  hipYaw: 5,
  hipList: 3,
  shoulders: 4,
  armSwing: [16, 34],
  heelStrike: [12, 5],
  toeOff: [24, 30],
  heel: 0.42,
  toe: 0.95,
  ankle: 0.55,
  jumpCrouch: 0.5,
  jumpTuck: 0.55,
  track: [0.72, 0.64],
  armAbduct: [0.85, 0.75],
  // upright: a tall body leaning into the run like the pickup (about 15 degrees) read as hunched
  lean: [0.9, 0.45],
}

export async function loadSemiAsset(): Promise<PlayableTransformerAsset> {
  const [asset, weapon] = await Promise.all([loadTransformerAsset('semi', SEMI_LABEL), loadWeaponAsset(SEMI_WEAPON, SEMI_LABEL)])
  return { ...asset, weapon }
}

/**
 * The soles: every node the foot bones carry (the foot and toe structure and
 * the heel block that docks on the foot).
 */
export function semiFootNodes(manifest: TransformerManifest): string[] {
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

/** The Semi's authored parts and simulation settings. */
export function createSemi(asset: TransformerAsset, contactEffects: ContactEffects, mix: AudioMix): Character & { effects: SemiEffects } {
  const model = new TransformerModel(asset, createSemiMaterials(), {
    label: SEMI_LABEL,
    footNodes: semiFootNodes(asset.manifest),
    // the van docks on the chest (the robot's back) and rides it from then on
    carried: { 'asm:van0': 'bone:chest' },
    trailer: { node: 'asm:van0', hitch: KINGPIN },
  })
  const effects = new SemiEffects(model, contactEffects, asset.manifest.events, model.duration, mix)
  const sole = { heel: SEMI_GAIT.heel, toe: SEMI_GAIT.toe, ankle: SEMI_GAIT.ankle }
  return {
    id: 'semi',
    model,
    gait: new RobotGait(SEMI_GAIT),
    effects,
    combat: createSemiCombat(model, asset.weapon, effects, contactEffects, mix, sole),
    profile: SEMI_PROFILE,
    transformationDuration: model.duration,
    robotOffset: model.dims.robotF,
  }
}
