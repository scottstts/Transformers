import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { PerspectiveCamera, Scene, Vector3, type Mesh, type InstancedBufferGeometry } from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createHeadlessRenderer } from './headless'
import { seedRandom } from './timing'
import { mirrorCitadel, mirrorModel } from '../mirror'
import { bakeEnvironment, configureRenderer, createPostPipeline } from '../../src/rendering/look'
import { disableCulling } from '../../src/rendering/warm'
import { createDesertWorld } from '../../src/worlds/desert'
import { decodeSoldierAsset, type SoldierManifest } from '../../src/content/soldier/asset'
import { HordeRenderer } from '../../src/content/soldier/horde-renderer'
import { createCommanderMaterials } from '../../src/content/commander/materials'
import { AudioMix } from '../../src/audio/mix'
import { Horde, type EnemyTarget } from '../../src/game/enemies/horde'
import type { CommanderPost } from '../../src/game/enemies/commander-post'
import type { Soldier } from '../../src/game/enemies/soldier'

const FPS = 30
const SAMPLES = 4
const SHOT_SECONDS = 6
const SHOTS = ['gate approach', 'forecourt patrol', 'crown commander', 'hydroponics glide', 'crown bridge elevated pass']

/** Native 3840×2160, 30 fps, five cuts, exactly 30 s, no audio or player model. */
export async function renderCitadelFilm(output: string, preview = false, lastShot = false): Promise<void> {
  output = resolve(output)
  mkdirSync(preview ? output : dirname(output), { recursive: true })
  const restoreRandom = seedRandom(0xc17ade1)
  const width = preview ? 960 : 3840, height = preview ? 540 : 2160
  const { renderer, capture, grab } = await createHeadlessRenderer(width, height)
  const scene = new Scene()
  const citadelAsset = await mirrorCitadel()
  const towerHeight = Math.max(...citadelAsset.parts.map(({ geometry }) => {
    geometry.computeBoundingBox()
    return geometry.boundingBox!.max.y
  }))
  const world = createDesertWorld(scene, citadelAsset)
  const readUnit = (name: string) => {
    const { manifest, buffer } = mirrorModel<SoldierManifest>(name)
    const asset = decodeSoldierAsset(manifest, buffer)
    // Film shadows use the complete LOD0 body, never a simplified proxy.
    asset.shadow = mergeGeometries(asset.lods[0].filter((slot) => slot.material !== 'blade').map(({ geometry }) => {
      const shadow = geometry.clone()
      shadow.deleteAttribute('normal')
      return shadow
    }))!
    return asset
  }
  // An unprepared AudioMix has no context; the encoder receives video only.
  const soldierAsset = readUnit('soldier'), commanderAsset = readUnit('commander')
  const horde = new Horde(soldierAsset, world.world.citadel, world.contactEffects, new AudioMix(), commanderAsset)
  scene.add(horde.object)
  // Tool-local access keeps cinematic presentation out of the shipping game.
  const cast = horde as unknown as {
    bars: { mesh: Mesh }; posts: CommanderPost[]; garrisons: Array<{ soldiers: Soldier[] }>
    renderer: HordeRenderer; commanders: HordeRenderer
  }
  horde.object.remove(cast.bars.mesh)
  const citadel = world.world.citadel
  // Remove distance-based architecture LOD without changing the game's class.
  const architecture = citadel as unknown as { shown: Array<{ reachSq: number }> }
  for (const entry of architecture.shown) entry.reachSq = Infinity
  for (const caster of citadel.staticCasters) caster.coarsest = Infinity
  const shadowCasters = (world.world.shadows as unknown as { statics: Map<Mesh, number> }).statics
  for (const mesh of shadowCasters.keys()) shadowCasters.set(mesh, Infinity)
  const soldiers = cast.garrisons.flatMap((g) => g.soldiers)
  const commanders = cast.posts.map((post) => post.unit)
  // Replace film-only renderers to remove population caps as well as distance LOD.
  horde.object.remove(cast.renderer.object, cast.commanders.object)
  cast.renderer = new HordeRenderer(soldierAsset, { capacity: soldiers.length })
  cast.commanders = new HordeRenderer(commanderAsset, { capacity: commanders.length, materials: createCommanderMaterials })
  horde.object.add(cast.renderer.object, cast.commanders.object)
  for (const unitRenderer of [cast.renderer, cast.commanders]) {
    const original = unitRenderer.draw.bind(unitRenderer)
    const internals = unitRenderer as unknown as {
      tiers: Array<{ meshes: Mesh[]; geometries: InstancedBufferGeometry[] }>
      shadows: Array<{ mesh: Mesh; geometry: InstancedBufferGeometry }>
    }
    unitRenderer.draw = (list, visible = list.length) => {
      original(list, visible)
      for (let t = 0; t < internals.tiers.length; t++) {
        const tier = internals.tiers[t]
        for (let k = 0; k < tier.meshes.length; k++) {
          tier.meshes[k].visible = t === 0 && visible > 0
          tier.meshes[k].userData.base = 0
          tier.geometries[k].instanceCount = t === 0 ? visible : 0
        }
      }
      // Every unit can cast its full body; no distance or nearest-body shadow cap.
      internals.shadows[0].mesh.visible = list.length > 0
      internals.shadows[0].mesh.userData.base = 0
      internals.shadows[0].geometry.instanceCount = list.length
      internals.shadows[1].mesh.visible = false
    }
  }
  horde.drawFor = () => {
    for (const unit of [...soldiers, ...commanders]) unit.refresh()
    cast.renderer.draw(soldiers)
    cast.commanders.draw(commanders)
  }
  const camera = new PerspectiveCamera(48, 16 / 9, 0.15, 6000)
  const focus = new Vector3(), aim = new Vector3()
  const point = (x: number, y: number, z: number, out: Vector3) => {
    const p = citadel.toWorld(x, z)
    out.set(p.x, y, p.z)
  }
  // Outside every district and never present: all units retain their peace patrols.
  const absent: EnemyTarget = { x: 10000, z: 10000, radius: 0, vx: 0, vz: 0, height: 0, heading: 0, guard: 0, present: false }
  let soldier: Soldier | undefined
  const setCamera = (shot: number, u: number) => {
    camera.fov = shot === 4 ? 26 : shot === 2 ? 45 : 48
    camera.updateProjectionMatrix()
    if (shot === 0) {
      point(-5 + 10 * u, 3.5 + u, 538 - 65 * u, camera.position)
      point(0, 10, 390, aim)
    } else if (shot === 1 && soldier) {
      camera.position.set(soldier.x + 10 - 14 * u, soldier.floor + 2.4 + 0.6 * u, soldier.z + 11)
      aim.set(soldier.x, soldier.floor + 1.8, soldier.z)
    } else if (shot === 2 || shot === 3) {
      const post = cast.posts[shot === 2 ? 11 : 8], unit = post.unit
      const a = (shot === 2 ? 2.7 : -0.6) + u * 0.65
      const distance = shot === 2 ? 18 : 27
      camera.position.set(unit.x + Math.sin(a) * distance, unit.floor + (shot === 2 ? 3.2 : 4.5) + u, unit.z + Math.cos(a) * distance)
      aim.set(unit.x, unit.floor + (shot === 2 ? 3.6 : 5.5), unit.z)
    } else {
      // An immersed crane pass over the crown bridge, aimed down into the
      // inhabited court. Narrow framing keeps the exterior desert off screen.
      point(-30 + 34 * u, 48 - 5 * u, 118 - 29 * u, camera.position)
      point(0, 20 + 2 * u, 38 - 18 * u, aim)
    }
    camera.position.y = Math.max(camera.position.y, world.world.ground.height(camera.position.x, camera.position.z) + 1.8)
    camera.lookAt(aim)
    camera.updateMatrixWorld()
    focus.copy(camera.position)
  }
  configureRenderer(renderer)
  bakeEnvironment(renderer, scene, world.environmentScene())
  world.world.prepare(renderer)
  const pipeline = createPostPipeline(renderer, scene, camera)
  const clock = (renderer as unknown as { _nodes: { nodeFrame: { update(): void; time: number; deltaTime: number } } })._nodes.nodeFrame
  let elapsed = 10
  const simulate = (dt: number) => {
    elapsed += dt
    horde.update(dt, absent, camera)
    world.contactEffects.update(dt)
    world.world.update(camera, focus, dt)
  }
  const draw = () => {
    clock.update()
    clock.time = elapsed
    clock.deltaTime = 1 / FPS
    pipeline.render()
  }
  setCamera(0, 0)
  world.world.update(camera, focus, 0)
  horde.warm(true)
  const restoreWorld = world.world.reveal(), restoreCulling = disableCulling(scene)
  console.log(`Preparing full-detail citadel, ${soldiers.length} soldiers and ${commanders.length} commanders; ${width}×${height}, ${FPS} fps; tower height ${towerHeight.toFixed(1)} m`)
  await renderer.compileAsync(scene, camera)
  draw()
  restoreCulling(); restoreWorld(); horde.warm(false)
  cast.bars.mesh.visible = false

  let encoder: ReturnType<typeof spawn> | undefined
  let completion: Promise<number | null> | undefined
  if (!preview) {
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
    encoder = spawn('zsh', ['-ic', `ffmpeg -hide_banner -loglevel error -y -f rawvideo -pixel_format rgba -video_size ${width}x${height} -framerate ${FPS} -i pipe:0 -an -c:v libx264 -preset fast -crf 14 -pix_fmt yuv420p -movflags +faststart ${quote(output)}`], { stdio: ['pipe', 'ignore', 'inherit'] })
    completion = new Promise((done, reject) => {
      encoder!.once('error', reject)
      encoder!.once('close', done)
      encoder!.stdin!.on('error', reject)
    })
  }
  try {
    for (let shot = 0; shot < SHOTS.length; shot++) {
      // Prime each district's original AI before a cut; settle temporal history.
      if (shot === 1) {
        const centre = citadel.toWorld(...citadel.plan.sectors[0].yard.at)
        camera.position.set(centre.x, 3, centre.z)
        for (let i = 0; i < 120; i++) simulate(1 / 60)
        soldier = cast.garrisons[0].soldiers.filter((s) => s.alive && Math.hypot(s.vx, s.vz) > 0.4)
          .sort((a, b) => Math.hypot(a.x - centre.x, a.z - centre.z) - Math.hypot(b.x - centre.x, b.z - centre.z))[0]
        if (!soldier) throw new Error('No moving forecourt soldier for the patrol shot')
      }
      setCamera(shot, 0)
      for (let i = 0; i < 120; i++) { simulate(1 / 60); setCamera(shot, 0) }
      pipeline.resetHistory()
      horde.drawFor(camera)
      world.world.update(camera, focus, 0)
      const record = !lastShot || shot === SHOTS.length - 1
      if (record) for (let i = 0; i < 16; i++) draw()
      if (record) console.log(`Shot ${shot + 1}/5: ${SHOTS[shot]}`)
      const frames = SHOT_SECONDS * FPS
      for (let f = 0; f < frames; f++) {
        simulate(1 / FPS)
        setCamera(shot, f / (frames - 1))
        horde.drawFor(camera)
        world.world.update(camera, focus, 0)
        if (!record) continue
        // Four frozen-time temporal samples per delivered frame retain fine
        // architectural edges and moving-body detail without speeding up patrols.
        for (let sample = 0; sample < SAMPLES; sample++) {
          if (sample > 0) horde.drawFor(camera)
          draw()
        }
        if (preview) {
          if (f === 0 || f === Math.floor(frames / 2) || f === frames - 1) await capture(join(output, `shot-${shot + 1}-${f}.png`))
        } else {
          const pixels = await grab()
          if (!encoder!.stdin!.write(pixels)) await once(encoder!.stdin!, 'drain')
          if (f % 60 === 0) console.log(`  ${((shot * frames + f) / FPS).toFixed(1)} / ${SHOTS.length * SHOT_SECONDS} seconds captured`)
        }
      }
    }
    if (encoder) {
      encoder.stdin!.end()
      if (await completion !== 0) throw new Error('Video encoding failed')
    }
    console.log(`Finished: ${output}`)
  } finally {
    if (encoder && encoder.exitCode === null) encoder.kill()
    pipeline.dispose(); renderer.dispose(); restoreRandom()
  }
}
