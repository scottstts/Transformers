import { PerspectiveCamera, Scene, Vector3 } from 'three/webgpu'
import { createHeadlessRenderer } from './headless'
import { bakeEnvironment, configureRenderer, createPostPipeline } from '../../src/rendering/look'
import { createDesertWorld } from '../../src/worlds/desert'
import { Lens } from '../../src/rendering/lens'
import { LightSlots } from '../../src/rendering/light-slots'
import { createRoadster } from '../../src/content/roadster'
import { AudioMix } from '../../src/audio/mix'
import { createMotionState } from '../../src/game/types'
import { RobotCombat } from '../../src/game/combat/robot-combat'
import { CameraFx } from '../../src/game/combat/camera-fx'
import { readAsset } from '../../tests/support/assets'
import { mirrorCitadel } from '../mirror'

const W = 1920
const H = 1080
const FRAMES = 30

/**
 * GPU time of the game's full frame at 1080p with the Roadster's heaviest
 * effects, each against the same frame with the character's effects hidden:
 * the lift jets' launch (the four columns and the cloud they throw under
 * the car, filmed from the follow camera behind it), the singularity's field
 * (the warp, the streaks and the sand drawn in), Whiteout's ring at full
 * speed from its wide shot and its impact from the wide shot after it.
 */
export async function benchRoadsterFx(): Promise<void> {
  const { renderer } = await createHeadlessRenderer(W, H)
  const scene = new Scene()
  const world = createDesertWorld(scene, await mirrorCitadel())
  configureRenderer(renderer)
  const car = createRoadster({ ...readAsset('roadster'), weapon: null }, world.contactEffects, new AudioMix())
  const slots = new LightSlots()
  slots.use(LightSlots.adopt(car.model.root, car.effects.object))
  scene.add(slots.object, car.model.root, car.effects.object)
  bakeEnvironment(renderer, scene, world.environmentScene())
  world.world.prepare(renderer)
  const camera = new PerspectiveCamera(48, W / H, 0.1, 6000)
  const pipeline = createPostPipeline(renderer, scene, camera, new Lens())
  const focus = new Vector3(40, 0, 40)
  focus.y = world.world.terrain.height(focus.x, focus.z)
  const device = (renderer.backend as unknown as { device: GPUDevice }).device
  const nodeFrame = (renderer as unknown as { _nodes: { nodeFrame: { update(): void } } })._nodes.nodeFrame
  const time = async (): Promise<number> => {
    const samples: number[] = []
    for (let i = 0; i < FRAMES + 5; i++) {
      nodeFrame.update()
      slots.update()
      const t0 = performance.now()
      pipeline.render()
      await device.queue.onSubmittedWorkDone()
      if (i >= 5) samples.push(performance.now() - t0)
    }
    samples.sort((a, b) => a - b)
    return samples[Math.floor(samples.length / 2)]
  }
  const against = async (label: string): Promise<void> => {
    const shown = await time()
    car.effects.object.visible = false
    const hidden = await time()
    car.effects.object.visible = true
    console.log(`${label}: ${hidden.toFixed(2)} ms -> ${shown.toFixed(2)} ms (+${(shown - hidden).toFixed(2)})`)
  }
  const look = (x: number, y: number, z: number, at: Vector3): void => {
    camera.position.set(at.x + x, at.y + y, at.z + z)
    camera.lookAt(at)
    camera.updateMatrixWorld()
    world.world.update(camera, focus)
  }
  const state = createMotionState()
  state.pos.copy(focus)
  car.model.root.position.copy(focus)
  car.model.pose(0, null)
  await renderer.compileAsync(scene, camera)
  const dt = 1 / 60

  // the launch: the transformation played to the boost's end, the cloud fed as it is in play
  let T = 0
  while (T * car.transformationDuration < 1.55) {
    const previous = T
    T += dt / car.transformationDuration
    state.progress = T
    car.model.pose(T, null)
    car.effects.timeline(previous, T)
    car.effects.update(dt, state)
  }
  const body = new Vector3().setFromMatrixPosition(car.model.node('bone:pelvis').matrixWorld)
  look(0, 3 + car.altitude!() * 0.45, -9 - car.altitude!() * 0.55, body)
  await against(`lift jets at the boost (${car.altitude!().toFixed(1)} m up), follow camera`)
  look(-9, 1.6, -9, focus.clone().setY(focus.y + 2))
  await against('lift jets at the boost, from beside the cloud')

  // the fight: a whole combo to the singularity's field, then the special
  car.model.pose(1, car.gait.update(0, 0, 0, false, true, null))
  state.progress = 1
  state.mode = 'robot'
  state.target = 1
  const fight = new RobotCombat(car.combat, car.model, car.robotOffset, state, new CameraFx())
  const play = (until: number, clicks: number[] = [], special = -1): void => {
    for (let t = 0; t < until; t += dt) {
      while (clicks.length && clicks[0] <= t) { clicks.shift(); fight.press() }
      if (special >= 0 && t >= special) { fight.startSpecial(state, camera); special = -1 }
      const s = dt * fight.tempo
      fight.update(s, state, camera)
      const pose = car.gait.update(s, state.speed, state.yawRate, false, true, null)
      if (fight.poseWeight > 0) pose.air = (pose.air ?? 0) + (fight.air - (pose.air ?? 0)) * fight.poseWeight
      car.model.root.position.copy(state.pos)
      car.model.root.rotation.set(0, state.yaw, 0)
      car.model.pose(1, pose)
      car.combat.effects.afterPose()
      car.effects.update(s, state)
    }
  }
  play(3.2, [0, 0.4, 0.8, 2.15])
  const robot = new Vector3().setFromMatrixPosition(car.model.node('bone:pelvis').matrixWorld)
  look(-4, 1, -11, robot)
  await against('singularity field, the follow camera behind the robot')
  fight.cancel()
  play(1.5)
  // Whiteout: the ring at full speed from its wide shot, then the impact
  play(3.6, [], 0)
  const centre = new Vector3(state.pos.x, focus.y, state.pos.z + 16)
  look(-6, 28, -32, centre)
  await against('Whiteout ring at full speed, wide shot')
  play(4.6)
  look(-28, 14, -26, centre)
  await against('Whiteout impact, wide shot')
}
