/**
 * Manifest of the Cybertruck asset exported from the Blender build
 * (blender/cybertruck_build/ctb/export.py). All coordinates are in the
 * authoring frame: x = robot left, -y = forward, z = up; the model converts
 * to three.js space with a single rotation.
 */
export type NodeKind = 'bone' | 'asm' | 'wheel' | 'lift'

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
}

export type MechanismKind = 'slide' | 'hinge' | 'hydraulic' | 'lift' | 'telescope' | 'joint' | 'servo'

/** One actuation of the transformation, in T (0 = truck, 1 = robot). */
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

export interface CybertruckManifest {
  version: number
  frames: number
  nodes: NodeRecord[]
  tracks: number
  lift: number
  rig: { bones: RigBone[]; stand: Record<string, [number, number, number, number, number, number, number]>; dims: RigDims }
  events: MechanismEvent[]
  triangles: number
}
