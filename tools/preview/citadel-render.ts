import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { PerspectiveCamera, RenderPipeline, Scene, Vector3 } from 'three/webgpu'
import { renderOutput, vec4 } from 'three/tsl'
import { createHeadlessRenderer } from './headless'
import { seedRandom } from './timing'
import { antialiasScene } from '../../src/rendering/antialias'
import { bakeEnvironment, configureRenderer, createPostPipeline } from '../../src/rendering/look'
import { disableCulling } from '../../src/rendering/warm'
import { createDesertWorld } from '../../src/worlds/desert'
import { mirrorCitadel } from '../mirror'

/** Fixed views of the user-reported gate: frozen time, real asset and production AA buffers. */
export async function renderCitadel(directory: string): Promise<void> {
  mkdirSync(directory, { recursive: true })
  const restoreRandom = seedRandom(0xc17ade1)
  const width = 1280, height = 720
  const { renderer, capture, grab } = await createHeadlessRenderer(width, height)
  const scene = new Scene(), world = createDesertWorld(scene, await mirrorCitadel())
  configureRenderer(renderer)
  bakeEnvironment(renderer, scene, world.environmentScene())
  world.world.prepare(renderer)
  const camera = new PerspectiveCamera(50, width / height, 0.1, 6000)
  const citadel = world.world.citadel, focus = new Vector3(), base = new Vector3(), target = new Vector3()
  const point = (x: number, y: number, z: number, out: Vector3): void => {
    const p = citadel.toWorld(x, z)
    out.set(p.x, y + world.world.ground.height(p.x, p.z), p.z)
  }
  const gate = citadel.plan.gates.find((g) => g.kind === 'outer' && Math.abs(g.at[0]) < 1)!
  point(0, 6, gate.at[1] + 80, base)
  point(0, 6, gate.at[1] - 160, target)
  camera.position.copy(base); camera.lookAt(target); camera.updateMatrixWorld()
  focus.copy(base)
  const final = createPostPipeline(renderer, scene, camera)
  const frame = (renderer as unknown as { _nodes: { nodeFrame: { update(): void; time: number } } })._nodes.nodeFrame
  const drawFinal = (): void => { frame.update(); frame.time = 10; world.world.update(camera, focus, 0); final.render() }
  const restoreWorld = world.world.reveal(), restoreCulling = disableCulling(scene)
  await renderer.compileAsync(scene, camera)
  drawFinal()
  restoreCulling(); restoreWorld()
  for (let i = 0; i < 40; i++) drawFinal()
  await capture(join(directory, 'gate-final.png'))
  for (const [name, distance] of [['near', 20], ['far', 400]] as const) {
    point(0, 6, gate.at[1] + distance, camera.position)
    camera.lookAt(target); camera.updateMatrixWorld(); focus.copy(camera.position)
    final.resetHistory()
    for (let i = 0; i < 40; i++) drawFinal()
    await capture(join(directory, `gate-${name}-final.png`))
  }
  camera.position.copy(base); camera.lookAt(target); camera.updateMatrixWorld(); focus.copy(base)

  const { scenePass, antialias: aa } = antialiasScene(scene, camera)
  const bare = new RenderPipeline(renderer)
  bare.outputColorTransform = false
  bare.outputNode = renderOutput(vec4(aa.getTextureNode().rgb, 1))
  const draw = (): void => { frame.update(); frame.time = 10; world.world.update(camera, focus, 0); bare.render() }
  const settle = async (name: string): Promise<void> => {
    aa.reset()
    for (let i = 0; i < 40; i++) draw()
    await capture(join(directory, name))
  }
  await settle('gate-no-post.png')
  citadel.skyVisibility.strength.value = 0
  await settle('gate-no-ao.png')
  citadel.skyVisibility.strength.value = 1
  world.world.shadows.staticStrength.value = 0; world.world.shadows.dynamicStrength.value = 0
  await settle('gate-no-shadows.png')
  world.world.shadows.staticStrength.value = 1; world.world.shadows.dynamicStrength.value = 1

  const measure = async (reset: boolean): Promise<number> => {
    let previous: Uint8Array | null = null, change = 0, samples = 0
    aa.reset()
    for (let i = 0; i < 80; i++) {
      camera.position.copy(base); camera.position.x += Math.sin(i / 18) * 0.2
      camera.lookAt(target)
      if (reset) aa.reset()
      draw()
      const pixels = await grab()
      if (i >= 32 && previous) {
        // Central gate corridor: distant dark trim and successive archways.
        for (let y = 200; y < 480; y++) for (let x = 500; x < 780; x++) {
          const at = (y * width + x) * 4
          change += Math.abs(pixels[at] - previous[at]); samples++
        }
      }
      previous = pixels
    }
    return change / samples
  }
  const raw = await measure(true), resolved = await measure(false)
  console.log(`citadel gate distant trim: current-only ${raw.toFixed(3)}, resolved ${resolved.toFixed(3)} luma/frame (${(100 * (1 - resolved / raw)).toFixed(1)}% reduction)`)
  if (!(resolved < raw * 0.6)) throw new Error('Citadel temporal stability threshold failed')
  point(0, 6, gate.at[1] + 400, base)
  focus.copy(base)
  const farRaw = await measure(true), farResolved = await measure(false)
  console.log(`citadel far gate: current-only ${farRaw.toFixed(3)}, resolved ${farResolved.toFixed(3)} luma/frame (${(100 * (1 - farResolved / farRaw)).toFixed(1)}% reduction)`)
  if (!(farResolved < farRaw * 0.6)) throw new Error('Far citadel temporal stability threshold failed')
  console.log(`fixed views: ${directory}; gate local z=${gate.at[1]}; seed 0xc17ade1; 1280x720 DPR1; frozen time10; Three ${renderer.backend.constructor.name}`)
  console.log(`committed shadows: ${JSON.stringify(world.world.shadows.inspect().map((s) => ({ centre: s.centre.toArray(), texel: s.texel, depth: [s.near, s.far], empty: s.empty })))}`)
  aa.dispose(); scenePass.dispose(); bare.dispose(); final.dispose(); renderer.dispose(); restoreRandom()
}
