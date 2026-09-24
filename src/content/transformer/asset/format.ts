/**
 * Manifest of a transformer asset exported from its Blender build
 * (blender/cybertruck_build/ctb/export.py, blender/ferrari-f1_build/f1b/export.py). All coordinates are in the
 * authoring frame: x = robot left, -y = forward, z = up; the model converts
 * to three.js space with a single rotation.
 */
/**
 * bone: skeleton joint with its fixed structure; asm: car assembly; wheel:
 * hub-centred wheel; lift: lifter stage; part: a robot part moving on its bone.
 */
export type NodeKind = 'bone' | 'asm' | 'wheel' | 'lift' | 'part'

export interface MeshRecord {
  material: string
  count: number
  triangles: number
  min: [number, number, number]
  max: [number, number, number]
  position: number
  normal: number
  index: number
  index32: boolean
}

export interface NodeRecord {
  name: string
  parent: number
  kind: NodeKind
  meshes: MeshRecord[]
}

export interface RigBone {
  name: string
  parent: string | null
  offset: [number, number, number]
}

export interface RigDims {
  thigh: number
  shin: number
  upper: number
  fore: number
  hipX: number
  hipZ: number
  ankleZ: number
  robotF: number
  crouch: number
  wheelRadius: number
  armAbduct: number
  elbowBend: number
  fingerCurl: [number, number, number]
  duration: number
  /** stance foot spacing (half, m); default hipX */
  stanceX?: number
  /** planted feet station ahead of the car origin (m); default robotF */
  footF?: number
  /** knee pole: pelvis front blended with this much pelvis up; default 0 */
  kneePoleUp?: number
}

export type MechanismKind = 'slide' | 'hinge' | 'hydraulic' | 'lift' | 'telescope' | 'joint' | 'servo'

/** One actuation of the transformation, in playback progress (0 = car, 1 = robot). */
export interface MechanismEvent {
  name: string
  kind: MechanismKind
  t0: number
  t1: number
  /** largest part surface area (m^2): drives weight / pitch of the sound */
  size: number
  /** travel: metres (slides) or degrees (hinges) */
  amount: number
  /** -1 right, 0 centre, 1 left */
  side: number
}

export interface TransformerManifest {
  version: number
  frames: number
  nodes: NodeRecord[]
  tracks: number
  lift: number
  rig: { bones: RigBone[]; stand: Record<string, [number, number, number, number, number, number, number]>; dims: RigDims }
  events: MechanismEvent[]
  triangles: number
}
