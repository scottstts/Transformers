import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PerspectiveCamera, Scene, Vector3 } from 'three/webgpu'
import { createHeadlessRenderer } from './headless'
import { bakeEnvironment, configureRenderer, createPostPipeline } from '../../src/rendering/look'
import { createDesertWorld } from '../../src/worlds/desert'
import { rosterEntry } from '../../src/content/roster'
import { decodeTransformerAsset } from '../../src/content/transformer/asset/loader'
import type { TransformerManifest } from '../../src/content/transformer/asset/format'
import type { Character } from '../../src/content/transformer/character'
import { AudioMix } from '../../src/audio/mix'
import { createMotionState } from '../../src/game/types'
import { updateCar } from '../../src/game/movement'

const WIDTH = 1280
const HEIGHT = 720
const DT = 1 / 60

type Shot = (ctx: Stage) => Promise<void> | void

interface Stage {
  scene: Scene
  camera: PerspectiveCamera
  player: Character
  world: ReturnType<typeof createDesertWorld>
  state: ReturnType<typeof createMotionState>
  step: (T: number) => void
  look: (from: [number, number, number], at: [number, number, number], absolute?: boolean) => void
}

/** Transformation frames: T values run up over half a second so the effects are live. */
const rise = (T: number, from: [number, number, number], at: [number, number, number]): Shot => (s) => {
  for (let i = 30; i >= 0; i--) s.step(Math.max(0, T - i * DT / 8))
  s.look(from, at)
}

/**
 * Drive with a steering programme, stop, let the dust settle, then look back
 * at the tracks from a camera placed in the frame of the path point 60 frames
 * before the stop (x right, y up, z forward along the path).
 */
const drive = (steer: (frame: number) => number, from: [number, number, number], at: [number, number, number]): Shot => (s) => {
  const input = { driveThrottle: 0.6, driveSteering: 0, running: false }
  const path: Array<[number, number, number]> = []
  for (let i = 0; i < 300; i++) {
    input.driveThrottle = i < 260 ? 0.6 : -1
    input.driveSteering = steer(i)
    updateCar(s.state, input, DT, false, s.player.profile.drive)
    s.step(0)
    path.push([s.state.pos.x, s.state.pos.z, s.state.yaw])
  }
  input.driveThrottle = 0
  for (let i = 0; i < 480; i++) {
    updateCar(s.state, input, DT, false, s.player.profile.drive)
    s.step(0)
  }
  const [x, z, yaw] = path[path.length - 60]
  const f = new Vector3(Math.sin(yaw), 0, Math.cos(yaw))
  const r = new Vector3(-f.z, 0, f.x)
  const place = (v: [number, number, number]): [number, number, number] => [x + r.x * v[0] + f.x * v[2], v[1], z + r.z * v[0] + f.z * v[2]]
  s.look(place(from), place(at), true)
}

const SHOTS: Record<string, Shot> = {
  'rise-33': rise(0.33, [-7, 3.2, -8], [0, 1.2, -0.5]),
  'rise-40': rise(0.4, [-8, 3.5, -7], [0, 1.8, -0.5]),
  'rise-50': rise(0.5, [-8.5, 3.8, -6], [0, 2.4, 0]),
  'rise-60': rise(0.6, [-9, 4.2, -5], [0, 3, 0.5]),
  'rise-68': rise(0.68, [-9, 4.5, -4], [0, 3, 1]),
  'rise-close': rise(0.45, [-4.5, 1.6, -5.5], [0, 1.2, -1]),
  'plume-detail': rise(0.35, [-3.6, 0.9, -1.2], [0, 0.45, -1.5]),
  tracks: drive((i) => (i > 80 && i < 220 ? 0.3 : 0), [0, 5, -9], [0, 0, 7]),
  'tracks-low': drive(() => 0, [1.8, 1.4, -4], [0, 0, 6]),
  'tracks-top': drive((i) => (i > 80 && i < 220 ? 0.3 : 0), [0, 14, -2], [0, 0, 2]),
}

/** `car`: a roster id (default: the first car). */
export async function renderShots(outDir: string, names: string[], car: string | null = null): Promise<void> {
  mkdirSync(outDir, { recursive: true })
  const entry = rosterEntry(car)
  const manifest = JSON.parse(readFileSync(`public/models/${entry.id}.json`, 'utf8')) as TransformerManifest
  const bin = readFileSync(`public/models/${entry.id}.bin`)
  const asset = decodeTransformerAsset(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), entry.label)
  const { renderer, capture } = await createHeadlessRenderer(WIDTH, HEIGHT)
  for (const name of names.length ? names : Object.keys(SHOTS)) {
    const shot = SHOTS[name]
    if (!shot) throw new Error(`unknown shot ${name}; known: ${Object.keys(SHOTS).join(', ')}`)
    const scene = new Scene()
    const world = createDesertWorld(scene)
    const player = entry.create(asset, world.contactEffects, new AudioMix())
    const camera = new PerspectiveCamera(42, WIDTH / HEIGHT, 0.1, 6000)
    configureRenderer(renderer)
    scene.add(player.model.root, player.effects.object)
    bakeEnvironment(renderer, scene, world.environmentScene())
    const pipeline = createPostPipeline(renderer, scene, camera)
    const state = createMotionState()
    state.yaw = 0
    const stage: Stage = {
      scene, camera, player, world, state,
      step: (T) => {
        const previous = state.progress
        state.progress = T
        player.model.root.position.copy(state.pos)
        player.model.root.rotation.y = state.yaw
        player.model.spin = state.spin
        player.model.steer = state.steer
        player.model.pose(T, null)
        player.effects.timeline(previous, T)
        player.effects.update(DT, state)
      },
      look: (from, at, absolute) => {
        const origin = absolute ? new Vector3() : state.pos
        camera.position.set(...from).add(origin)
        camera.lookAt(new Vector3(...at).add(origin))
        camera.updateMatrixWorld()
        world.world.update(camera, state.pos)
      },
    }
    await shot(stage)
    await renderer.compileAsync(scene, camera)
    pipeline.render()
    await capture(join(outDir, `${name}.png`))
    console.log(`wrote ${name}.png`)
  }
}
