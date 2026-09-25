import { readFileSync } from 'node:fs'
import { PerspectiveCamera, Scene, Vector3 } from 'three/webgpu'
import { createHeadlessRenderer, writePng } from './headless'
import { bakeEnvironment, configureRenderer, createPostPipeline } from '../../src/rendering/look'
import { createDesertWorld } from '../../src/worlds/desert'
import { rosterEntry } from '../../src/content/roster'
import { decodeTransformerAsset } from '../../src/content/transformer/asset/loader'
import { decodeWeaponAsset, type WeaponManifest } from '../../src/content/transformer/asset/weapon'
import type { TransformerManifest } from '../../src/content/transformer/asset/format'
import { AudioMix } from '../../src/audio/mix'
import { createMotionState } from '../../src/game/types'
import { RobotCombat } from '../../src/game/combat/robot-combat'
import { CameraFx } from '../../src/game/combat/camera-fx'

const CELL_W = 480
const CELL_H = 270
const COLUMNS = 4
const DT = 1 / 60

/** Camera placements around the robot's standing point (robot facing +z, its left +x). */
const VIEWS: Record<string, { from: [number, number, number]; at: [number, number, number] }> = {
  side: { from: [12, 3.6, 2], at: [0, 3.2, 2] },
  right: { from: [-12, 3.6, 2], at: [0, 3.2, 2] },
  front: { from: [3, 3.6, 13], at: [0, 2.8, 0] },
  back: { from: [-4, 5, -11], at: [0, 2.8, 1] },
  quarter: { from: [8, 4.5, 10], at: [0, 3.2, 1] },
  low: { from: [6, 1.2, 7], at: [0, 2.4, 1] },
}

export interface FightSheet {
  car: string | null
  /** click times (s) */
  clicks: number[]
  /** frame times (s) */
  frames: number[]
  /** one sheet per view: `<out>-<view>.png` */
  views: string[]
  /** scale of the views' distances (the F1 robot is smaller) */
  zoom?: number
}

/**
 * Plays a click combo headlessly (the session's order: fight, gait, pose,
 * effects, camera reactions) and renders the given moments into one contact
 * sheet, the camera following the robot's standing point.
 */
export async function renderFightSheet(out: string, sheet: FightSheet): Promise<void> {
  const entry = rosterEntry(sheet.car)
  const read = (name: string): [unknown, ArrayBuffer] => {
    const bin = readFileSync(`public/models/${name}.bin`)
    return [JSON.parse(readFileSync(`public/models/${name}.json`, 'utf8')), bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)]
  }
  const [manifest, bin] = read(entry.id)
  const asset = decodeTransformerAsset(manifest as TransformerManifest, bin, entry.label)
  if (entry.weapon) {
    const [wm, wb] = read(entry.weapon)
    asset.weapon = decodeWeaponAsset(wm as WeaponManifest, wb, entry.label)
  }
  const { renderer, grab } = await createHeadlessRenderer(CELL_W, CELL_H)
  const scene = new Scene()
  const world = createDesertWorld(scene)
  const player = entry.create(asset, world.contactEffects, new AudioMix())
  const camera = new PerspectiveCamera(42, CELL_W / CELL_H, 0.1, 6000)
  const aim = new PerspectiveCamera(42, 1, 0.1, 100)
  configureRenderer(renderer)
  scene.add(player.model.root, player.effects.object)
  bakeEnvironment(renderer, scene, world.environmentScene())
  const pipeline = createPostPipeline(renderer, scene, camera)

  const state = createMotionState()
  state.mode = 'robot'
  state.target = 1
  state.progress = 1
  state.yaw = 0
  const fx = new CameraFx()
  const fight = new RobotCombat(player.combat, player.model, player.robotOffset, state, fx)
  const views = sheet.views.map((name) => ({ name, ...(VIEWS[name] ?? VIEWS.side) }))
  const zoom = sheet.zoom ?? 1
  const frames = [...sheet.frames].sort((a, b) => a - b)
  const clicks = [...sheet.clicks].sort((a, b) => a - b)
  const rows = Math.ceil(frames.length / COLUMNS)
  const images = views.map(() => new Uint8Array(CELL_W * COLUMNS * CELL_H * rows * 4))
  const point = new Vector3()

  const step = (t: number): void => {
    while (clicks.length && clicks[0] <= t) {
      clicks.shift()
      fight.press()
    }
    fx.update(DT)
    const dt = DT * fx.timeScale
    aim.position.set(state.pos.x, 3, state.pos.z)
    aim.lookAt(state.pos.x + Math.sin(state.yaw), 3, state.pos.z + Math.cos(state.yaw))
    aim.updateMatrixWorld()
    fight.update(dt, state, aim)
    const pose = player.gait.update(dt, state.speed, state.yawRate, false, true, null)
    if (fight.poseWeight > 0) pose.air = (pose.air ?? 0) + (fight.air - (pose.air ?? 0)) * fight.poseWeight
    player.gait.events.length = 0
    player.model.root.position.copy(state.pos)
    player.model.root.rotation.set(0, state.yaw, 0)
    player.model.pose(1, pose)
    player.effects.timeline(1, 1)
    player.effects.update(dt, state)
  }

  // settle the stance first
  for (let i = 0; i < 90; i++) step(-1)
  let t = 0
  for (let k = 0; k < frames.length; k++) {
    while (t < frames[k] - 1e-6) {
      step(t)
      t += DT
    }
    point.set(state.pos.x + Math.sin(state.yaw) * player.robotOffset, 0, state.pos.z + Math.cos(state.yaw) * player.robotOffset)
    for (let v = 0; v < views.length; v++) {
      const view = views[v]
      // zoom moves the camera toward its target (the F1 robot is smaller: its views also look lower)
      const at = [view.at[0], view.at[1] * Math.min(1, zoom + 0.2), view.at[2]]
      camera.position.set(point.x + at[0] + (view.from[0] - at[0]) * zoom, at[1] + (view.from[1] - at[1]) * zoom, point.z + at[2] + (view.from[2] - at[2]) * zoom)
      camera.lookAt(point.x + at[0], at[1], point.z + at[2])
      // the follow camera sets the lens every frame; the camera reactions add to it
      camera.fov = 42
      camera.updateProjectionMatrix()
      camera.updateMatrixWorld()
      fx.apply(camera)
      camera.updateMatrixWorld()
      world.world.update(camera, point)
      await renderer.compileAsync(scene, camera)
      pipeline.render()
      const cell = await grab()
      const cx = (k % COLUMNS) * CELL_W
      const cy = Math.floor(k / COLUMNS) * CELL_H
      for (let y = 0; y < CELL_H; y++) {
        images[v].set(cell.subarray(y * CELL_W * 4, (y + 1) * CELL_W * 4), ((cy + y) * CELL_W * COLUMNS + cx) * 4)
      }
    }
    console.log(`t ${frames[k].toFixed(2)}  move ${fight.poseWeight.toFixed(2)}`)
  }
  views.forEach((view, v) => writePng(`${out}-${view.name}.png`, CELL_W * COLUMNS, CELL_H * rows, images[v]))
}
