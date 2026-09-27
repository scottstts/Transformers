import { PerspectiveCamera, Scene, Vector3 } from 'three/webgpu'
import { createHeadlessRenderer } from './headless'
import { bakeEnvironment, configureRenderer, createPostPipeline } from '../../src/rendering/look'
import { createDesertWorld } from '../../src/worlds/desert'
import { Lens } from '../../src/rendering/lens'

const W = 1920
const H = 1080
const FRAMES = 40

/**
 * GPU time of the game's full frame at 1080p with and without a fight's dust:
 * footfall and impact bursts round a robot 16 m from the camera, fed until the
 * live count settles (about what a combo keeps up), then the same frozen frame
 * drawn repeatedly, each waited out on the GPU queue.
 */
export async function benchDust(): Promise<void> {
  const { renderer } = await createHeadlessRenderer(W, H)
  const scene = new Scene()
  const world = createDesertWorld(scene)
  configureRenderer(renderer)
  bakeEnvironment(renderer, scene, world.environmentScene())
  world.world.prepare(renderer)
  const camera = new PerspectiveCamera(50, W / H, 0.1, 6000)
  const pipeline = createPostPipeline(renderer, scene, camera, new Lens())
  const terrain = world.world.terrain
  const focus = new Vector3(40, 0, 40)
  focus.y = terrain.height(focus.x, focus.z)
  camera.position.set(focus.x, focus.y + 6, focus.z + 16)
  camera.lookAt(focus.x, focus.y + 3, focus.z)
  const dust = world.contactEffects.dust
  const device = (renderer.backend as unknown as { device: GPUDevice }).device
  const nodeFrame = (renderer as unknown as { _nodes: { nodeFrame: { update(): void } } })._nodes.nodeFrame

  const time = async (): Promise<number> => {
    const samples: number[] = []
    for (let i = 0; i < FRAMES + 5; i++) {
      nodeFrame.update()
      const t0 = performance.now()
      pipeline.render()
      await device.queue.onSubmittedWorkDone()
      if (i >= 5) samples.push(performance.now() - t0)
    }
    samples.sort((a, b) => a - b)
    return samples[Math.floor(samples.length / 2)]
  }
  const live = (): number => dust.age.reduce((n, a, i) => n + (a < dust.life[i] ? 1 : 0), 0)

  world.world.update(camera, focus)
  await renderer.compileAsync(scene, camera)
  dust.update(1 / 60)
  const empty = await time()

  const p = new Vector3()
  const dt = 1 / 60
  for (let t = 0; t < 4; t += dt) {
    // a blow or footfall every 0.12 s somewhere round the robot, a full-strength slam every second
    if (Math.floor(t / 0.12) !== Math.floor((t - dt) / 0.12)) {
      p.set(focus.x + (Math.random() - 0.5) * 8, 0, focus.z + (Math.random() - 0.5) * 8)
      world.contactEffects.burst(p, 0.8, 28)
    }
    if (Math.floor(t) !== Math.floor(t - dt)) world.contactEffects.burst(focus, 1.4, 28)
    dust.update(dt)
  }
  const fight = await time()
  const n = live()

  dust.surge(focus, 8, 1)
  for (let t = 0; t < 0.6; t += dt) dust.update(dt)
  const surge = await time()

  console.log(`live puffs in the fight: ${n}, after a surge: ${live()}`)
  console.log(`frame without dust ${empty.toFixed(2)} ms`)
  console.log(`fight dust  ${fight.toFixed(2)} ms  (+${(fight - empty).toFixed(2)})`)
  console.log(`with surge  ${surge.toFixed(2)} ms  (+${(surge - empty).toFixed(2)})`)
}
