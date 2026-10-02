import { PerspectiveCamera, Scene, Vector3 } from 'three/webgpu'
import { createHeadlessRenderer } from './headless'
import { bakeEnvironment, configureRenderer, createPostPipeline } from '../../src/rendering/look'
import { createDesertWorld } from '../../src/worlds/desert'
import { Lens } from '../../src/rendering/lens'
import { LightSlots } from '../../src/rendering/light-slots'
import { disableCulling, revealHidden } from '../../src/rendering/warm'
import { ROSTER, rosterEntry } from '../../src/content/roster'
import { AudioMix } from '../../src/audio/mix'
import { readAsset, readSoldier, readWeapon } from '../../tests/support/assets'
import { Horde, type EnemyTarget } from '../../src/game/enemies/horde'
import type { Character } from '../../src/content/transformer/character'
import { mirrorCitadel } from '../mirror'

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
  // Euler walk over the directed roster graph: every ordered switch once, on one live world/device.
  const ids = ROSTER.map((entry) => entry.id)
  const edges = new Map(ids.map((id) => [id, ids.filter((other) => other !== id)]))
  const stack = [ids[0]], all: string[] = []
  while (stack.length) {
    const next = edges.get(stack[stack.length - 1])!.pop()
    if (next) stack.push(next)
    else all.push(stack.pop()!)
  }
  const route = from === '--all' ? all.reverse() : [from, to]
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
  const world = createDesertWorld(scene, await mirrorCitadel())
  const mix = new AudioMix()
  const slots = new LightSlots()
  const lights = new Map<Character, ReturnType<typeof LightSlots.adopt>>()
  const built = new Map<string, Character>()
  const build = (id: string): Character => {
    const cached = built.get(id)
    if (cached) return cached
    const entry = rosterEntry(id)
    const car = entry.create({ ...readAsset(entry.id), weapon: readWeapon(entry.weapon) }, world.contactEffects, mix)
    lights.set(car, LightSlots.adopt(car.model.root, car.effects.object))
    built.set(id, car)
    return car
  }
  const first = build(route[0])
  configureRenderer(renderer)
  const horde = new Horde(readSoldier(), world.world.citadel, world.contactEffects, mix, readSoldier('commander'))
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

  let second = first
  const warmed = new Set([first])
  let switched = [programs, pipelines]
  for (const id of route.slice(1)) {
    const previous = second
    second = build(id)
    // A first-use switch is covered; the session switches a cached car synchronously.
    const cold = !warmed.has(second)
    const restoreModel = disableCulling(second.model.root)
    const restoreEffects = disableCulling(second.effects.object)
    if (cold) {
      second.combat.effects.warm(true)
      await renderer.compileAsync(second.model.root, camera, scene)
      await renderer.compileAsync(second.effects.object, camera, scene)
    }
    scene.remove(previous.model.root, previous.effects.object)
    scene.add(second.model.root, second.effects.object)
    slots.use(lights.get(second)!)
    for (let i = 0; cold && i < 3; i++) {
      second.combat.effects.warm(true)
      const restore = revealHidden(second.effects.object)
      frame()
      restore()
    }
    restoreEffects()
    restoreModel()
    second.combat.effects.warm(false)
    frame()
    warmed.add(second)
    switched = [programs, pipelines]

    // play: every world class, floor response and new car effect, including away from the boot camera
    restoreWorld = world.world.reveal()
    restoreCulling = disableCulling(scene)
    second.combat.effects.warm(true)
    const restore = revealHidden(second.effects.object)
    world.contactEffects.warm(true)
    const floorPoint = new Vector3()
    for (const sector of world.world.citadel.plan.sectors) {
      const p = world.world.citadel.toWorld(...sector.yard.at)
      floorPoint.set(p.x, world.world.ground.height(p.x, p.z), p.z)
      world.contactEffects.crater(floorPoint, 4, 0.5)
      world.contactEffects.burst(floorPoint, 0.5, 8)
    }
    const bridge = world.world.citadel.toWorld(0, 110)
    floorPoint.set(bridge.x, world.world.ground.height(bridge.x, bridge.z), bridge.z)
    world.contactEffects.crater(floorPoint, 4, 1)
    frame()
    restore()
    world.contactEffects.warm(false)
    restoreCulling()
    restoreWorld()
    second.combat.effects.warm(false)
    const newPrograms = programs - switched[0], newPipelines = pipelines - switched[1]
    console.log(`${previous.id} -> ${second.id} (${cold ? 'first use' : 'cached'}): built in play ${newPrograms} programs, ${newPipelines} pipelines`)
    if (newPrograms || newPipelines) throw new Error('Shaders or pipelines built during play')
  }
  // the fight at the citadel: the commander near and far, swinging, then broken apart
  const fort = world.world.citadel
  const citadel = fort.plan.sectors.find((s) => s.role === 'citadel')!
  const c = fort.toWorld(citadel.yard.at[0], citadel.yard.at[1])
  const target: EnemyTarget = { x: c.x + 9, z: c.z + 9, radius: second.profile.robotRadius, vx: 0, vz: 0, height: 5, heading: 0, guard: 0, present: true }
  const commander = horde.commanderPosts.find((p) => p.home.role === 'citadel')!.unit
  let full = false
  for (let i = 0; i < 660; i++) {
    const far = i < 60 ? 120 : i < 120 ? 45 : 14
    // the whole combo, whatever the roll: its trail, flashes, wheels' sand, the slam and the whirl
    if (i >= 240 && !full && commander.free) full = commander.fight(4)
    camera.position.set(commander.x + far * 0.7, commander.floor + 6, commander.z + far * 0.7)
    camera.lookAt(commander.x, commander.floor + 3, commander.z)
    camera.updateMatrixWorld()
    horde.update(1 / 60, target, camera)
    if (i === 620) horde.hit({ shape: 'circle', kind: 'blast', x: commander.x, z: commander.z, heading: 0, reach: 12, arc: Math.PI * 2, damage: 1e5, knock: 14, lift: 9, motion: 0, sweep: -1, radial: true, special: false, final: false, bite: true })
    frame()
  }
  console.log(`commander: whole combo ${full ? 'played' : 'not played'}, ${commander.alive ? 'alive' : 'broken apart'}`)
  console.log(`built in play: ${programs - switched[0]} programs, ${pipelines - switched[1]} pipelines`)
  if (!full || commander.alive) throw new Error('Switch probe did not exercise the commander combo and breakup')
  if (programs !== switched[0] || pipelines !== switched[1]) throw new Error('Shaders or pipelines built during play')
}
