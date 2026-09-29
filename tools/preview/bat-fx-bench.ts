import { Object3D, PerspectiveCamera, Scene, Vector3 } from 'three/webgpu'
import { createHeadlessRenderer } from './headless'
import { bakeEnvironment, configureRenderer, createPostPipeline } from '../../src/rendering/look'
import { createDesertWorld } from '../../src/worlds/desert'
import { Lens } from '../../src/rendering/lens'
import { Vortex } from '../../src/content/bat/combat/fx/vortex'
import { Afterburner } from '../../src/content/bat/fx/afterburner'

const W = 1920
const H = 1080
const FRAMES = 40

/**
 * GPU time of the game's full frame at 1080p with the Bat's heaviest effects:
 * the special's vortex (sand drawn in round the ring's centre, fed until its
 * live count settles) filmed from its wide shot, and the afterburner at full
 * burn filmed from close behind, each against the same frame without it.
 */
export async function benchBatFx(): Promise<void> {
  const { renderer } = await createHeadlessRenderer(W, H)
  const scene = new Scene()
  const world = createDesertWorld(scene)
  configureRenderer(renderer)
  bakeEnvironment(renderer, scene, world.environmentScene())
  world.world.prepare(renderer)
  const camera = new PerspectiveCamera(50, W / H, 0.1, 6000)
  const pipeline = createPostPipeline(renderer, scene, camera, new Lens())
  const focus = new Vector3(40, 0, 40)
  focus.y = world.world.terrain.height(focus.x, focus.z)
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

  // the vortex from the ring's wide shot (high and off to the side, about 20 m away), and close in at the centre
  const vortex = new Vortex()
  vortex.ground = world.contactEffects
  scene.add(vortex.mesh)
  camera.position.set(focus.x - 14, focus.y + 15, focus.z - 6)
  camera.lookAt(focus.x, focus.y + 0.5, focus.z)
  world.world.update(camera, focus)
  vortex.update(0)
  vortex.mesh.visible = false
  await renderer.compileAsync(scene, camera)
  const empty = await time()
  const dt = 1 / 60
  for (let t = 0; t < 3; t += dt) {
    vortex.emit(focus, 17, 260, dt, -1, 7, 5, 6)
    vortex.update(dt)
  }
  const wide = await time()
  camera.position.set(focus.x + 1, focus.y + 1.4, focus.z - 6)
  camera.lookAt(focus.x, focus.y + 1, focus.z)
  const closeEmpty = await (async () => { vortex.mesh.visible = false; return time() })()
  vortex.mesh.visible = true
  const close = await time()
  scene.remove(vortex.mesh)

  // the afterburner at full burn, pointing back along a flying body, filmed from behind and beside it
  const pod = new Object3D()
  pod.position.set(focus.x, focus.y + 1.2, focus.z)
  pod.updateMatrixWorld(true)
  const jet = new Afterburner(pod)
  scene.add(jet.object)
  jet.floor = focus.y
  jet.target = 1.3
  for (let i = 0; i < 90; i++) jet.update(dt)
  camera.position.set(jet.lip.x + 3, jet.lip.y + 1.2, jet.lip.z + 7)
  camera.lookAt(jet.lip.x, jet.lip.y, jet.lip.z + 2.5)
  const jetEmpty = await (async () => { jet.object.visible = false; return time() })()
  jet.object.visible = true
  const burn = await time()

  console.log(`vortex, wide shot: ${empty.toFixed(2)} ms -> ${wide.toFixed(2)} ms (+${(wide - empty).toFixed(2)})`)
  console.log(`vortex, close at the centre: ${closeEmpty.toFixed(2)} ms -> ${close.toFixed(2)} ms (+${(close - closeEmpty).toFixed(2)})`)
  console.log(`afterburner at full burn, close: ${jetEmpty.toFixed(2)} ms -> ${burn.toFixed(2)} ms (+${(burn - jetEmpty).toFixed(2)})`)
}
