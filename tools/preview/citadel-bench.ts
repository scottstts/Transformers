import { PerspectiveCamera, Scene, Vector3 } from 'three/webgpu'
import { createHeadlessRenderer } from './headless'
import { frameTiming, printTiming, seedRandom } from './timing'
import { bakeEnvironment, configureRenderer, createPostPipeline } from '../../src/rendering/look'
import { LightSlots } from '../../src/rendering/light-slots'
import { disableCulling, revealHidden } from '../../src/rendering/warm'
import { Lens } from '../../src/rendering/lens'
import { createDesertWorld } from '../../src/worlds/desert'
import { rosterEntry } from '../../src/content/roster'
import { readAsset, readSoldier, readWeapon } from '../../tests/support/assets'
import { AudioMix } from '../../src/audio/mix'
import { Horde, type EnemyTarget } from '../../src/game/enemies/horde'
import { mirrorCitadel } from '../mirror'

/** The real post pipeline, player, all garrisons and cached shadows at every yard. */
export async function benchCitadel(): Promise<void> {
  const restoreRandom = seedRandom(0xc17ade1)
  try {
    const start = performance.now()
    const { renderer } = await createHeadlessRenderer(1920, 1080, true)
    const backend = renderer.backend as unknown as { device: GPUDevice; trackTimestamp: boolean }
    const adapter = backend.device
    console.log(`GPU: ${adapter.adapterInfo.vendor} ${adapter.adapterInfo.architecture} ${adapter.adapterInfo.description}; 1920 x 1080; timestamps ${backend.trackTimestamp}`)
    const scene = new Scene(), mix = new AudioMix(), slots = new LightSlots()
    const asset = await mirrorCitadel()
    const build = performance.now()
    const world = createDesertWorld(scene, asset)
    console.log(`world CPU construction: ${(performance.now() - build).toFixed(1)} ms`)
    const enemies = performance.now()
    const horde = new Horde(readSoldier(), world.world.citadel, world.contactEffects, mix, readSoldier('commander'))
    console.log(`garrisons + both navigation grids + renderer CPU: ${(performance.now() - enemies).toFixed(1)} ms`)
    const entry = rosterEntry('cybertruck')
    const car = entry.create({ ...readAsset(entry.id), weapon: readWeapon(entry.weapon) }, world.contactEffects, mix)
    car.model.pose(1, null)
    slots.use(LightSlots.adopt(car.model.root, car.effects.object))
    scene.add(slots.object, car.model.root, car.effects.object, horde.object)
    configureRenderer(renderer)
    bakeEnvironment(renderer, scene, world.environmentScene())
    const bake = performance.now()
    world.world.prepare(renderer)
    await adapter.queue.onSubmittedWorkDone()
    const aoGpu = backend.trackTimestamp ? await renderer.resolveTimestampsAsync('compute') : undefined
    console.log(`AO bake submit + queue-complete: ${(performance.now() - bake).toFixed(1)} ms; GPU ${aoGpu?.toFixed(1) ?? 'unavailable'} ms`)
    const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 6000), focus = new Vector3()
    const pipeline = createPostPipeline(renderer, scene, camera, new Lens())
    const nodeFrame = (renderer as unknown as { _nodes: { nodeFrame: { update(): void } } })._nodes.nodeFrame
    const draw = (): void => { nodeFrame.update(); slots.update(); pipeline.render() }
    camera.position.set(0, 6, 16); camera.lookAt(0, 3, 0)
    world.world.update(camera, focus, 0)
    car.combat.effects.warm(true); world.contactEffects.warm(true); horde.warm(true)
    const restoreWorld = world.world.reveal(), restoreCulling = disableCulling(scene), restoreEffects = revealHidden(car.effects.object)
    await renderer.compileAsync(scene, camera)
    draw()
    restoreEffects(); restoreCulling(); restoreWorld()
    car.combat.effects.warm(false); world.contactEffects.warm(false); horde.warm(false)
    await adapter.queue.onSubmittedWorkDone()
    console.log(`headless boot through covered warm-up: ${(performance.now() - start).toFixed(1)} ms (mirror, no CDN transfer)`)
    const target: EnemyTarget = { x: 0, z: 0, radius: car.profile.robotRadius, vx: 0, vz: 0, height: 5, heading: 0, guard: 0, present: true }
    const bookmarks = [{ name: 'approach', x: 0, z: 0 }, ...world.world.citadel.plan.sectors.map((s) => ({ name: `D${s.index} ${s.role}`, ...world.world.citadel.toWorld(...s.yard.at) })), { name: 'crown bridge', ...world.world.citadel.toWorld(0, 110) }]
    const sim: number[] = []
    let worst = 0
    for (const point of bookmarks) {
      focus.set(point.x, world.world.ground.height(point.x, point.z), point.z)
      target.x = point.x; target.z = point.z
      camera.position.set(point.x + 10, focus.y + 6, point.z + 16)
      camera.lookAt(point.x, focus.y + 3, point.z)
      camera.updateMatrixWorld()
      car.model.root.position.copy(focus)
      // Advance all near/fighting enemies through a second, then freeze the scene for GPU samples.
      const step = performance.now()
      for (let i = 0; i < 60; i++) {
        world.world.update(camera, focus, 1 / 60)
        horde.update(1 / 60, target, camera)
        world.contactEffects.update(1 / 60)
      }
      const simulation = (performance.now() - step) / 60
      sim.push(simulation)
      const timing = await frameTiming(renderer, draw)
      printTiming(point.name, timing)
      worst = Math.max(worst, timing.throughput + simulation)
    }
    sim.sort((a, b) => a - b)
    console.log(`world + horde + contacts CPU simulation: median ${sim[Math.floor(sim.length / 2)].toFixed(2)} ms/frame, maximum ${sim[sim.length - 1].toFixed(2)} ms/frame`)
    console.log(`worst queued frame + simulation: ${worst.toFixed(2)} ms (33 ms budget)`)
    if (worst > 33) throw new Error('Citadel sustained-frame budget exceeded')
  } finally {
    restoreRandom()
  }
}
