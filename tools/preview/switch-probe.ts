import { PerspectiveCamera, Scene, Vector3 } from 'three/webgpu'
import { createHeadlessRenderer } from './headless'
import { bakeEnvironment, configureRenderer, createPostPipeline } from '../../src/rendering/look'
import { createDesertWorld } from '../../src/worlds/desert'
import { Lens } from '../../src/rendering/lens'
import { LightSlots } from '../../src/rendering/light-slots'
import { disableCulling, revealHidden } from '../../src/rendering/warm'
import { rosterEntry } from '../../src/content/roster'
import { AudioMix } from '../../src/audio/mix'
import { readAsset, readSoldier, readWeapon } from '../../tests/support/assets'
import { Horde, type EnemyTarget } from '../../src/game/enemies/horde'
import type { Character } from '../../src/content/transformer/character'

/**
 * Pipelines built during play after a car switch: the boot warm-up of the
 * first car and the world, the switch to the second as the session makes it
 * (compile, swap, covered frames with every effect forced on), then the
 * whole world and the second car's every effect revealed as play would reach
 * them, and a fight at the citadel: its garrison alerted, the commander
 * drawn at its real distances, then broken apart. Anything built after the
 * switch is a mid-game hitch.
 */
export async function probeSwitch(from: string, to: string): Promise<void> {
  const { renderer } = await createHeadlessRenderer(960, 540)
  const backend = renderer.backend as unknown as { createProgram(p: unknown): void; createRenderPipeline(o: unknown, p: unknown): void }
  let programs = 0
  let pipelines = 0
  const createProgram = backend.createProgram.bind(backend)
  const createRenderPipeline = backend.createRenderPipeline.bind(backend)
  backend.createProgram = (p) => { programs++; createProgram(p) }
  backend.createRenderPipeline = (o, p) => { pipelines++; createRenderPipeline(o, p) }
  const nodeFrame = (renderer as unknown as { _nodes: { nodeFrame: { update(): void } } })._nodes.nodeFrame

  const scene = new Scene()
  const world = createDesertWorld(scene)
  const mix = new AudioMix()
  const slots = new LightSlots()
  const lights = new Map<Character, ReturnType<typeof LightSlots.adopt>>()
  const build = (id: string): Character => {
    const entry = rosterEntry(id)
    const car = entry.create({ ...readAsset(entry.id), weapon: readWeapon(entry.weapon) }, world.contactEffects, mix)
    lights.set(car, LightSlots.adopt(car.model.root, car.effects.object))
    return car
  }
  const first = build(from)
  configureRenderer(renderer)
  const horde = new Horde(readSoldier(), world.world.forts, world.contactEffects, mix, readSoldier('commander'))
  scene.add(slots.object, first.model.root, first.effects.object, horde.object)
  slots.use(lights.get(first)!)
  bakeEnvironment(renderer, scene, world.environmentScene())
  world.world.prepare(renderer)
  const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 6000)
  camera.position.set(0, 6, 16)
  camera.lookAt(0, 3, 0)
  const pipeline = createPostPipeline(renderer, scene, camera, new Lens())
  const frame = (): void => {
    nodeFrame.update()
    slots.update()
    pipeline.render()
  }
  world.world.update(camera, new Vector3())

  // the boot warm-up (GameSession.compile)
  first.combat.effects.warm(true)
  world.contactEffects.warm(true)
  horde.warm(true)
  let restoreWorld = world.world.reveal()
  let restoreCulling = disableCulling(scene)
  await renderer.compileAsync(scene, camera)
  frame()
  restoreCulling()
  restoreWorld()
  first.combat.effects.warm(false)
  world.contactEffects.warm(false)
  horde.warm(false)
  frame()
  frame()
  console.log(`boot: ${programs} programs, ${pipelines} pipelines`)

  // the switch (GameSession.switchCharacter)
  const second = build(to)
  second.combat.effects.warm(true)
  const restoreModel = disableCulling(second.model.root)
  const restoreEffects = disableCulling(second.effects.object)
  await renderer.compileAsync(second.model.root, camera, scene)
  await renderer.compileAsync(second.effects.object, camera, scene)
  scene.remove(first.model.root, first.effects.object)
  scene.add(second.model.root, second.effects.object)
  slots.use(lights.get(second)!)
  for (let i = 0; i < 3; i++) {
    second.combat.effects.warm(true)
    const restore = revealHidden(second.effects.object)
    frame()
    restore()
  }
  restoreEffects()
  restoreModel()
  second.combat.effects.warm(false)
  frame()
  const switched = [programs, pipelines]
  console.log(`after switching ${from} -> ${to}: ${programs} programs, ${pipelines} pipelines`)

  // play: everything the world and the new car can show
  restoreWorld = world.world.reveal()
  restoreCulling = disableCulling(scene)
  second.combat.effects.warm(true)
  const restore = revealHidden(second.effects.object)
  frame()
  restore()
  restoreCulling()
  restoreWorld()
  second.combat.effects.warm(false)
  // the fight at the citadel: the commander near and far, swinging, then broken apart
  const fort = world.world.forts.list[0]
  const citadel = fort.plan.sectors.find((s) => s.role === 'citadel')!
  const c = fort.toWorld(citadel.yard.at[0], citadel.yard.at[1])
  const target: EnemyTarget = { x: c.x + 9, z: c.z + 9, radius: second.profile.robotRadius, vx: 0, vz: 0, height: 5, heading: 0, guard: 0, present: true }
  const commander = horde.commanderPosts[0].unit
  let full = false
  for (let i = 0; i < 660; i++) {
    const far = i < 60 ? 120 : i < 120 ? 45 : 14
    // the whole combo, whatever the roll: its trail, flashes, wheels' sand, the slam and the whirl
    if (i >= 240 && !full && commander.free) full = commander.fight(4)
    camera.position.set(commander.x + far * 0.7, 6, commander.z + far * 0.7)
    camera.lookAt(commander.x, 3, commander.z)
    camera.updateMatrixWorld()
    horde.update(1 / 60, target, camera)
    if (i === 620) horde.hit({ shape: 'circle', kind: 'blast', x: commander.x, z: commander.z, heading: 0, reach: 12, arc: Math.PI * 2, damage: 1e5, knock: 14, lift: 9, motion: 0, sweep: -1, radial: true, special: false, final: false, bite: true })
    frame()
  }
  console.log(`commander: whole combo ${full ? 'played' : 'not played'}, ${commander.alive ? 'alive' : 'broken apart'}`)
  console.log(`built in play: ${programs - switched[0]} programs, ${pipelines - switched[1]} pipelines`)
}
