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
import { Director, type DirectorSubject } from '../../src/game/combat/director'
import { Lens } from '../../src/rendering/lens'
import { decodeSoldierAsset, type SoldierManifest } from '../../src/content/soldier/asset'
import { Horde, type EnemyTarget } from '../../src/game/enemies/horde'

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
  top: { from: [0, 34, -2], at: [0, 0, 6] },
}

export interface FightSheet {
  car: string | null
  /** click times (s); `F<t>` plays the special at t */
  clicks: string[]
  /** frame times (s) */
  frames: number[]
  /** one sheet per view: `<out>-<view>.png` */
  views: string[]
  /** scale of the views' distances (the F1 robot is smaller) */
  zoom?: number
  /** fight a fort's garrison: the robot stands in fort `brawl`'s yard (index), the soldiers alerted */
  brawl?: number
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
  const lens = new Lens()
  // FX_LENS=0 renders without the lens reactions, to tell their artefacts from the scene's
  const pipeline = createPostPipeline(renderer, scene, camera, process.env.FX_LENS === '0' ? undefined : lens)

  const state = createMotionState()
  state.mode = 'robot'
  state.target = 1
  state.progress = 1
  state.yaw = 0
  // the brawl: the garrison of a fort, the robot standing in its yard facing the hangar
  let horde: Horde | null = null
  const target: EnemyTarget = { x: 0, z: 0, radius: player.profile.robotRadius, vx: 0, vz: 0, height: player.model.dims.hipZ * 1.8, heading: 0, guard: 0, present: true }
  if (sheet.brawl !== undefined) {
    const [sm, sb] = read('soldier')
    horde = new Horde(decodeSoldierAsset(sm as SoldierManifest, sb), world.world.forts, world.contactEffects, new AudioMix())
    scene.add(horde.object)
    const fort = world.world.forts.list[sheet.brawl]
    const c = fort.toWorld(0, 4)
    const h = fort.toWorld(fort.plan.hangars[0].at[0], fort.plan.hangars[0].at[1])
    state.yaw = Math.atan2(h.x - c.x, h.z - c.z)
    state.pos.set(c.x - Math.sin(state.yaw) * player.robotOffset, 0, c.z - Math.cos(state.yaw) * player.robotOffset)
  }
  const guards = sheet.clicks.filter((c) => c.startsWith('G')).map((c) => c.slice(1).split('-').map(Number) as [number, number])
  const fx = new CameraFx(lens)
  const fight = new RobotCombat(player.combat, player.model, player.robotOffset, state, fx)
  if (horde) {
    const h = horde
    fight.aimAssist = (x, z, heading) => h.assist(x, z, heading)
    fight.onHit = (hit) => {
      if (process.env.HITS && hit.sweep < 0) {
        const near = h.nearby(hit.x, hit.z, 12).map((k) => {
          const d = Math.hypot(k.x - hit.x, k.z - hit.z)
          const a = Math.atan2(k.x - hit.x, k.z - hit.z) - hit.heading
          return `${d.toFixed(1)}@${((Math.atan2(Math.sin(a), Math.cos(a)) * 180) / Math.PI).toFixed(0)}:${k.mode}`
        })
        console.log('   near', near.join(' '))
      }
      const caught = h.hit(hit)
      if (process.env.HITS && (hit.sweep < 0 || caught > 0)) console.log(`  hit ${hit.shape} ${hit.kind} reach ${hit.reach.toFixed(1)} caught ${caught}`)
      if (caught > 0 && hit.shape === 'sector') fx.hitStop(0.05, 0.18)
    }
    h.onStruck = (at, from, strength) => player.combat.effects.struck(at, from, strength, fight.guarded)
  }
  const director = new Director()
  const weapon = player.combat.effects.weapon
  const subject: DirectorSubject = {
    body: player.model.node('bone:pelvis'),
    head: player.model.node('bone:head'),
    weapon: (out) => {
      if (!weapon || weapon.presence < 0.5) return false
      out.set(0, 0, weapon.asset.manifest.extent[1] * 0.8).applyMatrix4(weapon.object.matrixWorld)
      return true
    },
  }
  const specials = sheet.clicks.filter((c) => c.startsWith('F')).map((c) => Number(c.slice(1)))
  const views = sheet.views.map((name) => ({ name, ...(VIEWS[name] ?? VIEWS.side) }))
  const zoom = sheet.zoom ?? 1
  const frames = [...sheet.frames].sort((a, b) => a - b)
  const clicks = sheet.clicks.filter((c) => !c.startsWith('F') && !c.startsWith('G')).map(Number).sort((a, b) => a - b)
  const rows = Math.ceil(frames.length / COLUMNS)
  const images = views.map(() => new Uint8Array(CELL_W * COLUMNS * CELL_H * rows * 4))
  const point = new Vector3()

  /** One frame; returns the world time it advanced (hit-stop and the special's slow motion slow it). */
  const step = (t: number): number => {
    while (clicks.length && clicks[0] <= t) {
      clicks.shift()
      fight.press()
    }
    while (specials.length && specials[0] <= t) {
      specials.shift()
      fight.startSpecial(state, aim)
      director.start(player.combat.special, fight.groundOrigin, fight.groundHeading)
    }
    fx.update(DT)
    const dt = DT * fx.timeScale * fight.tempo
    fx.updateWorld(dt)
    aim.position.set(state.pos.x, 3, state.pos.z)
    aim.lookAt(state.pos.x + Math.sin(state.yaw), 3, state.pos.z + Math.cos(state.yaw))
    aim.updateMatrixWorld()
    fight.setGuard(guards.some(([a, b]) => t >= a && t < b))
    fight.update(dt, state, aim)
    const pose = player.gait.update(dt, state.speed, state.yawRate, false, true, null)
    if (fight.poseWeight > 0) pose.air = (pose.air ?? 0) + (fight.air - (pose.air ?? 0)) * fight.poseWeight
    player.gait.events.length = 0
    player.model.root.position.copy(state.pos)
    player.model.root.rotation.set(0, state.yaw, 0)
    player.model.pose(1, pose)
    player.effects.timeline(1, 1)
    player.effects.update(dt, state)
    if (horde) {
      target.x = state.pos.x + Math.sin(state.yaw) * player.robotOffset
      target.z = state.pos.z + Math.cos(state.yaw) * player.robotOffset
      target.heading = state.yaw
      target.present = !fight.cinematic && fight.air < 1
      target.guard = fight.guarded ? player.combat.effects.guardReach() : 0
      horde.update(dt, target, aim)
    }
    if (director.active && !fight.cinematic) director.stop()
    return dt
  }

  // settle the stance first
  for (let i = 0; i < 90; i++) step(-1)
  let t = 0
  for (let k = 0; k < frames.length; k++) {
    while (t < frames[k] - 1e-6) t += step(t)
    point.set(state.pos.x + Math.sin(state.yaw) * player.robotOffset, 0, state.pos.z + Math.cos(state.yaw) * player.robotOffset)
    for (let v = 0; v < views.length; v++) {
      const view = views[v]
      if (view.name === 'director') {
        // the follow camera stand-in behind the robot, then the special's own shot over it
        camera.position.set(point.x - Math.sin(state.yaw) * 12.75, 6, point.z - Math.cos(state.yaw) * 12.75)
        camera.lookAt(point.x, 3.9 * Math.min(1, zoom + 0.2), point.z)
        camera.fov = 42
        camera.updateProjectionMatrix()
        if (director.active) director.apply(camera, fight.specialTime, DT, subject)
        camera.updateMatrixWorld()
        fx.apply(camera)
        camera.updateMatrixWorld()
        world.world.update(camera, subject.body.getWorldPosition(new Vector3()))
        await renderer.compileAsync(scene, camera)
        pipeline.render()
        const cell = await grab()
        const cx = (k % COLUMNS) * CELL_W
        const cy = Math.floor(k / COLUMNS) * CELL_H
        for (let y = 0; y < CELL_H; y++) images[v].set(cell.subarray(y * CELL_W * 4, (y + 1) * CELL_W * 4), ((cy + y) * CELL_W * COLUMNS + cx) * 4)
        continue
      }
      // zoom moves the camera toward its target (the F1 robot is smaller: its views also look lower)
      // the views ride up with a robot in the air
      const at = [view.at[0], view.at[1] * Math.min(1, zoom + 0.2) + fight.air, view.at[2]]
      camera.position.set(point.x + at[0] + (view.from[0] - view.at[0]) * zoom, at[1] + (view.from[1] - view.at[1]) * zoom, point.z + at[2] + (view.from[2] - at[2]) * zoom)
      camera.lookAt(point.x + at[0], at[1], point.z + at[2])
      // the follow camera sets the lens every frame; the camera reactions add to it
      camera.fov = 42
      camera.updateProjectionMatrix()
      camera.updateMatrixWorld()
      fx.apply(camera)
      camera.updateMatrixWorld()
      horde?.drawFor(camera)
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
    const garrison = horde?.status(point.x, point.z)
    console.log(`t ${frames[k].toFixed(2)}  move ${fight.poseWeight.toFixed(2)}${garrison ? `  soldiers ${garrison.alive} destroyed ${horde?.destroyed}${garrison.alert ? ' alerted' : ''}` : ''}`)
  }
  views.forEach((view, v) => writePng(`${out}-${view.name}.png`, CELL_W * COLUMNS, CELL_H * rows, images[v]))
}
