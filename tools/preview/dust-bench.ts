import { PerspectiveCamera, Scene, Vector3 } from 'three/webgpu'
import { createHeadlessRenderer } from './headless'
import { bakeEnvironment, configureRenderer, createPostPipeline } from '../../src/rendering/look'
import { createDesertWorld } from '../../src/worlds/desert'
import { Lens } from '../../src/rendering/lens'
import { mirrorCitadel } from '../mirror'
import { disableCulling } from '../../src/rendering/warm'
import { frameTiming, printTiming, seedRandom } from './timing'

/** Full 1080p frames with frozen, settled fight dust on sand, ceramic and deck. */
export async function benchDust(): Promise<void> {
  const restoreRandom = seedRandom(0xc17ade1)
  try {
    const { renderer } = await createHeadlessRenderer(1920, 1080, true)
    const scene = new Scene()
    const world = createDesertWorld(scene, await mirrorCitadel())
    configureRenderer(renderer)
    bakeEnvironment(renderer, scene, world.environmentScene())
    world.world.prepare(renderer)
    const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 6000)
    const pipeline = createPostPipeline(renderer, scene, camera, new Lens())
    const focus = new Vector3(), p = new Vector3()
    const dust = world.contactEffects.dust
    const nodeFrame = (renderer as unknown as { _nodes: { nodeFrame: { update(): void } } })._nodes.nodeFrame
    const draw = (): void => { nodeFrame.update(); pipeline.render() }
    const live = (): number => dust.age.reduce((n, a, i) => n + (a < dust.life[i] ? 1 : 0), 0)
    const dt = 1 / 60
    camera.position.set(40, 6, 56)
    camera.lookAt(40, 3, 40)
    world.world.update(camera, focus.set(40, 0, 40), 0)
    const restoreWorld = world.world.reveal(), restoreCulling = disableCulling(scene)
    world.contactEffects.warm(true)
    await renderer.compileAsync(scene, camera)
    draw()
    restoreCulling(); restoreWorld(); world.contactEffects.warm(false)
    const ceramic = world.world.citadel.toWorld(0, 374), deck = world.world.citadel.toWorld(0, 110)
    for (const [name, x, z] of [['sand', 40, 40], ['ceramic', ceramic.x, ceramic.z], ['deck', deck.x, deck.z]] as const) {
      focus.set(x, world.world.ground.height(x, z), z)
      camera.position.set(x, focus.y + 6, z + 16)
      camera.lookAt(x, focus.y + 3, z)
      camera.updateMatrixWorld()
      world.world.update(camera, focus, 0)
      dust.age.fill(1e9)
      world.contactEffects.update(0)
      const empty = await frameTiming(renderer, draw)
      world.contactEffects.fight = 'combo'
      for (let t = 0; t < 4; t += dt) {
        if (Math.floor(t / 0.12) !== Math.floor((t - dt) / 0.12)) {
          p.set(x + (Math.random() - 0.5) * 8, 0, z + (Math.random() - 0.5) * 8)
          p.y = world.world.ground.height(p.x, p.z)
          world.contactEffects.burst(p, 0.8, 28)
        }
        if (Math.floor(t) !== Math.floor(t - dt)) world.contactEffects.burst(focus, 1.4, 28)
        world.contactEffects.update(dt)
      }
      const fight = await frameTiming(renderer, draw)
      console.log(`${name}: ${live()} fight puffs, birth surface ${world.contactEffects.surface(x, z)}`)
      printTiming('  empty', empty)
      printTiming('  fight', fight)
      world.contactEffects.fight = 'special'
      world.contactEffects.surge(focus, 8, 1)
      for (let t = 0; t < 0.6; t += dt) world.contactEffects.update(dt)
      const surge = await frameTiming(renderer, draw)
      console.log(`  with surge: ${live()} puffs`)
      printTiming('  surge', surge)
      if (empty.gpu !== null && fight.gpu !== null && surge.gpu !== null) console.log(`  GPU delta: fight +${(fight.gpu - empty.gpu).toFixed(2)} ms; surge +${(surge.gpu - empty.gpu).toFixed(2)} ms`)
    }
  } finally {
    restoreRandom()
  }
}
