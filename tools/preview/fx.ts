import { PerspectiveCamera, Scene, Vector3 } from 'three/webgpu'
import { createHeadlessRenderer, writePng } from './headless'
import { bakeEnvironment, configureRenderer, createPostPipeline } from '../../src/rendering/look'
import { createDesertWorld } from '../../src/worlds/desert'
import { Billows } from '../../src/content/transformer/combat/fx/billows'
import { Lens } from '../../src/rendering/lens'

const W = 640
const H = 360

/** A sample: what it sets up (after `at` seconds of world time) and where it is seen from. */
interface Sample {
  eye: [number, number, number]
  look: [number, number, number]
  /** world seconds to run before the shot */
  at: number
  /** may place the view itself (a sample staged in the world, not at its origin) */
  setup(scene: Scene, surface: ReturnType<typeof createDesertWorld>['contactEffects'], billows: Billows, world: ReturnType<typeof createDesertWorld>['world']): void | { eye: [number, number, number]; look: [number, number, number] }
}

const UP = new Vector3(0, 1, 0)

/** A point on the long edge of the fortress's longest paved strip (its main road), in the world. */
function roadEdge(world: ReturnType<typeof createDesertWorld>['world']): Vector3 {
  const road = [...world.forts.paving.shapes].filter((s) => !s.round).sort((a, b) => b.hz - a.hz)[0]
  // its +x edge in its own frame, a third of the way along
  const x = road.hx, z = road.hz * 0.3
  const c = Math.cos(road.yaw), s = Math.sin(road.yaw)
  return new Vector3(road.x + x * c + z * s, 0, road.z - x * s + z * c)
}

const SAMPLES: Record<string, Sample> = {
  // the sun and the sky around it: banding in the glow shows here first
  sun: {
    eye: [0, 2, 0], look: [-55, 44, -72], at: 0,
    setup: () => undefined,
  },
  // cold dust on the left, fire on the right
  billows: {
    eye: [0, 3, 14], look: [0, 3, 0], at: 0.15,
    setup: (_scene, _surface, b) => {
      b.emit({ count: 20, at: new Vector3(-4, 2, 0), jitter: 2, dir: UP, spread: 1, speed: [1, 3], life: [3, 4], size: [2, 4], heat: 0, drag: 1, buoyancy: 0, tone: 1, opacity: 0.8 })
      b.emit({ count: 20, at: new Vector3(4, 2, 0), jitter: 2, dir: UP, spread: 1, speed: [1, 3], life: [3, 4], size: [2, 4], heat: 2200, drag: 1, buoyancy: 0, tone: 0.5, opacity: 0.8 })
    },
  },
  // a fused crater, hot and seen from above
  'crater-hot': {
    eye: [0, 11, 9], look: [0, 0, 0], at: 0.8,
    setup: (_scene, surface) => surface.crater(new Vector3(), 4.4, 1),
  },
  'crater-cold': {
    eye: [0, 11, 9], look: [0, 0, 0], at: 25,
    setup: (_scene, surface) => surface.crater(new Vector3(), 4.4, 1),
  },
  // a crater straddling the edge of the fortress's main road: concrete's marks on the slabs, sand's beside them
  ...Object.fromEntries([['crater-paved', 0.8], ['crater-paved-cold', 25]].map(([name, at]) => [name, {
    eye: [0, 0, 0], look: [0, 0, 0], at: at as number,
    setup: (_scene, surface, _b, world) => {
      const c = roadEdge(world)
      surface.crater(c, 4.4, 1)
      return { eye: [c.x + 2, 11, c.z + 9], look: [c.x, 0, c.z] }
    },
  } satisfies Sample])),
  // furrows cut across the road's edge, hot
  'furrows-paved': {
    eye: [0, 0, 0], look: [0, 0, 0], at: 0.6,
    setup: (_scene, surface, _b, world) => {
      const c = roadEdge(world)
      for (const a of [0, 0.8, 1.6, 2.4]) surface.furrow(new Vector3(c.x + Math.sin(a) * 6, 0, c.z + Math.cos(a) * 6), c.clone(), 0.4, 1)
      return { eye: [c.x + 2, 9, c.z + 10], look: [c.x, 0, c.z] }
    },
  },
  // four furrows meeting, just cut and reignited from their ends
  furrows: {
    eye: [0, 9, 10], look: [0, 0, 0], at: 0.6,
    setup: (_scene, surface) => {
      for (const a of [0, 0.8, 1.6, 2.4]) {
        const handle = surface.furrow(new Vector3(Math.sin(a) * 6, 0, Math.cos(a) * 6), new Vector3(), 0.4, 1)
        surface.reignite(handle, 0.3, 6, -30)
      }
    },
  },
}

/** Renders named effect samples headlessly with the game's image: `<out>-<name>.png`. */
export async function renderFx(out: string, names: string[]): Promise<void> {
  const { renderer, grab } = await createHeadlessRenderer(W, H)
  for (const name of names) {
    const sample = SAMPLES[name]
    if (!sample) throw new Error(`no fx sample ${name}; have ${Object.keys(SAMPLES).join(', ')}`)
    const scene = new Scene()
    const world = createDesertWorld(scene)
    configureRenderer(renderer)
    bakeEnvironment(renderer, scene, world.environmentScene())
    const camera = new PerspectiveCamera(50, W / H, 0.1, 6000)
    const billows = new Billows()
    scene.add(billows.mesh)
    const view = sample.setup(scene, world.contactEffects, billows, world.world) ?? sample
    camera.position.set(...view.eye)
    camera.lookAt(...view.look)
    const pipeline = createPostPipeline(renderer, scene, camera, process.env.FX_LENS === '0' ? undefined : new Lens())
    for (let t = 0; t < sample.at; t += 1 / 30) {
      billows.update(1 / 30)
      world.contactEffects.update(1 / 30)
    }
    world.world.update(camera, new Vector3(...view.look))
    await renderer.compileAsync(scene, camera)
    pipeline.render()
    writePng(`${out}-${name}.png`, W, H, await grab())
    console.log(name)
  }
}
