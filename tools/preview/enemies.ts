import { readFileSync } from 'node:fs'
import { PerspectiveCamera, Quaternion, Scene, Vector3 } from 'three/webgpu'
import { createHeadlessRenderer, writePng } from './headless'
import { bakeEnvironment, configureRenderer, createPostPipeline } from '../../src/rendering/look'
import { createDesertWorld } from '../../src/worlds/desert'
import { decodeSoldierAsset, type SoldierAsset, type SoldierManifest } from '../../src/content/soldier/asset'
import { HordeRenderer, type HordeInstance } from '../../src/content/soldier/horde-renderer'
import { SoldierRig, createSoldierPose, type SoldierPose } from '../../src/content/soldier/rig'
import type { Fort } from '../../src/worlds/desert/fort'
import { POSES, writePose } from '../../src/content/soldier/poses'
import { Soldier, type SoldierImpact } from '../../src/game/enemies/soldier'

const W = 960
const H = 540

function readSoldier(): SoldierAsset {
  const manifest = JSON.parse(readFileSync('public/models/soldier.json', 'utf8')) as SoldierManifest
  const bin = readFileSync('public/models/soldier.bin')
  return decodeSoldierAsset(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength))
}

interface Figure { x: number; z: number; yaw: number; pose?: (p: SoldierPose) => void; blade?: number; tilt?: number; y?: number }

const key = (name: keyof typeof POSES) => (p: SoldierPose): void => writePose(POSES[name], p)

type V3 = [number, number, number]

interface Sample {
  eye: V3
  look: V3
  fov?: number
  figures: Figure[]
  /** a view of a fort instead: eye and look from its plan */
  fort?: (fort: Fort) => { eye: V3; look: V3 }
  /** simulated soldiers instead of posed figures: each takes `hit` and is shown `at` seconds later */
  sim?: Array<{ x: number; z: number; yaw: number; hit: SoldierImpact; at: number }>
}

const blow = (knock: number, lift: number): SoldierImpact => ({ dirX: 0, dirZ: -1, knock, lift, damage: 10, kind: 'blunt', special: false })

/** A point in a fort's frame, lifted to height y, in world space. */
const fp = (f: Fort, x: number, z: number, y: number): V3 => {
  const p = f.toWorld(x, z)
  return [p.x, y, p.z]
}

const SAMPLES: Record<string, Sample> = {
  // three soldiers up close in the stand, seen at the robot camera's height
  lineup: {
    eye: [2.5, 2.6, 8.5], look: [0, 1.5, 0],
    figures: [
      { x: -1.6, z: 0, yaw: 0.35 },
      { x: 0, z: 0.4, yaw: 0, blade: 1 },
      { x: 1.6, z: 0, yaw: -0.6 },
    ],
  },
  // one soldier straight on and one side on, close
  close: {
    eye: [0, 2.2, 5.5], look: [0, 1.7, 0],
    figures: [
      { x: -0.9, z: 0, yaw: 0, blade: 1 },
      { x: 1.1, z: 0, yaw: Math.PI / 2, blade: 1 },
    ],
  },
  // a fort from the air
  'fort-air': {
    eye: [0, 0, 0], look: [0, 0, 0], fov: 50, figures: [],
    fort: (f) => ({ eye: fp(f, 55, 95, 75), look: fp(f, 0, -2, 0) }),
  },
  // the front gate as the robot comes up to it
  'fort-gate': {
    eye: [0, 0, 0], look: [0, 0, 0], fov: 50, figures: [],
    fort: (f) => {
      const g = f.plan.gates[0]
      const e = [g.at[0] + g.out[0] * 30 + g.out[1] * 8, g.at[1] + g.out[1] * 30 - g.out[0] * 8] as const
      return { eye: fp(f, e[0], e[1], 6), look: fp(f, g.at[0], g.at[1], 3) }
    },
  },
  // the yard from inside the front gate: the hangar door, bunker, containers
  'fort-yard': {
    eye: [0, 0, 0], look: [0, 0, 0], fov: 55, figures: [],
    fort: (f) => {
      const g = f.plan.gates[0]
      return { eye: fp(f, g.inside[0], g.inside[1], 7), look: fp(f, f.plan.hangars[0].at[0], f.plan.hangars[0].at[1], 3) }
    },
  },
  // the key poses side by side, three-quarter view
  poses: {
    eye: [4, 3.2, 11], look: [0, 1.4, 0], fov: 45,
    figures: [
      { x: -5, z: 0, yaw: 0.5, blade: 1, pose: key('guard') },
      { x: -2.5, z: 0, yaw: 0.5, blade: 1, pose: key('ready') },
      { x: 0, z: 0, yaw: 0.5, blade: 1, pose: key('roll') },
      { x: 2.5, z: 0, yaw: 0.5, blade: 1, pose: key('windup') },
      { x: 5, z: 0, yaw: 0.5, blade: 1, pose: key('strike') },
      { x: 1, z: 4, yaw: 0.5, blade: 0, pose: key('down'), tilt: -1.5, y: -1.1 },
    ],
  },
  // the same, side on (facing screen left)
  'poses-side': {
    eye: [16, 1.8, 0], look: [0, 1.4, 0], fov: 45,
    figures: [
      { x: 0, z: 5, yaw: 0, blade: 1, pose: key('guard') },
      { x: 0, z: 2.5, yaw: 0, blade: 1, pose: key('ready') },
      { x: 0, z: 0, yaw: 0, blade: 1, pose: key('roll') },
      { x: 0, z: -2.5, yaw: 0, blade: 1, pose: key('windup') },
      { x: 0, z: -5, yaw: 0, blade: 1, pose: key('strike') },
    ],
  },
  // hit reactions: a stagger, a launch in the air, landing, lying, getting up (pushed away from the camera)
  reactions: {
    eye: [2, 5, 16], look: [2, 0.8, -6], fov: 55, figures: [],
    sim: [
      { x: -8, z: 0, yaw: 0, hit: blow(7, 0.5), at: 0.12 },
      { x: -4, z: 3, yaw: 0, hit: blow(13, 5), at: 0.35 },
      { x: 0, z: 3, yaw: 0, hit: blow(13, 5), at: 0.85 },
      { x: 4, z: 3, yaw: 0, hit: blow(13, 5), at: 1.8 },
      { x: 8, z: 3, yaw: 0, hit: blow(13, 5), at: 3.0 },
      { x: 12, z: 3, yaw: 0, hit: blow(13, 5), at: 3.4 },
    ],
  },
  // the same, seen from the side where they come down: lying, getting up
  'reactions-landing': {
    eye: [26, 4.5, -12], look: [0, 0.8, -15], fov: 45, figures: [],
    sim: [
      { x: 0, z: 3, yaw: 0, hit: blow(13, 5), at: 1.05 },
      { x: -4, z: 3, yaw: 0, hit: blow(13, 5), at: 1.6 },
      { x: -8, z: 3, yaw: 0, hit: blow(13, 5), at: 2.5 },
      { x: -12, z: 3, yaw: 0, hit: blow(13, 5), at: 3.2 },
    ],
  },
  // the three detail tiers side by side at their distances
  tiers: {
    eye: [0, 3, 6], look: [0, 1.6, -40], fov: 30,
    figures: [
      { x: -1.5, z: -14, yaw: 0.3 },
      { x: 1.5, z: -45, yaw: 0.3 },
      { x: 5, z: -90, yaw: 0.3 },
    ],
  },
}

/** Renders named soldier / fort samples headlessly with the game's image: `<out>-<name>.png`. */
export async function renderEnemies(out: string, names: string[]): Promise<void> {
  const { renderer, grab } = await createHeadlessRenderer(W, H)
  const asset = readSoldier()
  for (const name of names) {
    const sample = SAMPLES[name]
    if (!sample) throw new Error(`no enemy sample ${name}; have ${Object.keys(SAMPLES).join(', ')}`)
    const scene = new Scene()
    const world = createDesertWorld(scene)
    configureRenderer(renderer)
    bakeEnvironment(renderer, scene, world.environmentScene())
    const camera = new PerspectiveCamera(sample.fov ?? 42, W / H, 0.1, 6000)
    const view = sample.fort ? sample.fort(world.world.forts.list[Number(process.env.FORT ?? 0)]) : sample
    camera.position.set(...view.eye)
    camera.lookAt(...view.look)
    const pipeline = createPostPipeline(renderer, scene, camera)
    const horde = new HordeRenderer(asset)
    scene.add(horde.object)
    const simulated: HordeInstance[] = (sample.sim ?? []).map((k) => {
      const s = new Soldier(asset.manifest)
      s.reset(k.x, k.z, k.yaw, 0)
      s.goal.ready = true
      for (let t = 0; t < 0.5; t += 1 / 60) s.update(1 / 60)
      s.impact(k.hit)
      for (let t = 0; t < k.at; t += 1 / 60) s.update(1 / 60)
      s.distance = camera.position.distanceTo(new Vector3(s.x, 1.5, s.z))
      return s
    })
    const list: HordeInstance[] = [...simulated, ...sample.figures.map((f) => {
      const rig = new SoldierRig(asset.manifest)
      const pose = createSoldierPose()
      f.pose?.(pose)
      rig.pose({ x: f.x, z: f.z, y: f.y ?? 0, yaw: f.yaw, tilt: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), f.tilt ?? 0) }, pose)
      return { rows: rig.rows, heat: 0, dissolve: 0, lights: 1, blade: f.blade ?? 0, distance: camera.position.distanceTo(new Vector3(f.x, 1.5, f.z)) }
    })].sort((a, b) => a.distance - b.distance)
    horde.draw(list)
    world.world.update(camera, new Vector3(...view.look))
    if (sample.fort) console.log('fort triangles', world.world.forts.list.map((f) => f.triangles))
    await renderer.compileAsync(scene, camera)
    pipeline.render()
    writePng(`${out}-${name}.png`, W, H, await grab())
    console.log(name)
  }
}
