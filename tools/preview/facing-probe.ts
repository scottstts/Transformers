import { PerspectiveCamera, Scene, Vector3, type Object3D } from 'three/webgpu'
import { createHeadlessRenderer } from './headless'
import { adoptReversedDepth } from '../../src/rendering/depth'
import { Sparks } from '../../src/content/transformer/combat/fx/sparks'
import { Lightning } from '../../src/content/impala/combat/fx/lightning'
import { Tracers } from '../../src/content/semi/combat/fx/tracers'
import { MuzzleFlashes } from '../../src/content/semi/combat/fx/flashes'
import { Lances } from '../../src/content/bat/combat/fx/lances'
import { Vortex } from '../../src/content/bat/combat/fx/vortex'

function withRandom<T>(random: () => number, run: () => T): T {
  const previous = Math.random
  Math.random = random
  try { return run() } finally { Math.random = previous }
}

/**
 * Whether the instanced camera-facing quads reach the screen with FrontSide:
 * each effect is drawn alone in an empty scene from a fixed camera and its lit
 * pixels counted. A quad built across its axis with the wrong cross-product
 * order faces away from the camera, is back-face culled and counts 0 however
 * bright its shading is.
 */
export async function probeFacing(): Promise<void> {
  const W = 320, H = 180
  const { renderer, grab } = await createHeadlessRenderer(W, H)
  const camera = new PerspectiveCamera(50, W / H, 0.1, 500)
  adoptReversedDepth(camera)
  camera.position.set(0, 2, 10)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  const failures: string[] = []
  const lit = async (object: Object3D): Promise<number> => {
    const scene = new Scene()
    scene.add(object)
    renderer.render(scene, camera)
    const px = await grab()
    let n = 0
    for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 60) n++
    scene.remove(object)
    return n
  }
  const check = async (name: string, object: Object3D): Promise<void> => {
    const n = await lit(object)
    console.log(`${name.padEnd(20)} lit px ${n}`)
    if (n === 0) failures.push(name)
  }
  try {
    // Freeze births without changing the production effects' random sources.
    let seed = 1337
    const random = (): number => (seed = seed * 16807 % 2147483647) / 2147483647
    const sparks = new Sparks()
    withRandom(random, () => sparks.emit({ count: 200, at: new Vector3(0, 1, 0), dir: new Vector3(0, 1, 0), spread: 1, speed: [1, 3], life: [2, 3], size: 0.05, drag: 1, gravity: 0, palette: 0 }))
    sparks.update(0.05)
    await check('sparks', sparks.mesh)
    const bolts = new Lightning()
    withRandom(random, () => bolts.strike(new Vector3(-3, 1, 0), new Vector3(3, 1, 0), { width: 0.3, life: 1, brightness: 1, roughness: 0.1, forks: 0, forkLength: 0 }))
    bolts.update(0.03)
    await check('lightning', bolts.mesh)

    for (const palette of [0, 1]) {
      const tracers = new Tracers()
      tracers.fire({ from: new Vector3(-2, 0, 0), to: new Vector3(2, 0, 0), speed: 4, width: 0.3, streak: 3, palette, linger: palette ? 1 : 0 })
      tracers.update(palette ? 1.1 : 0.5)
      await check(palette ? 'semi slug channel' : 'semi tracer', tracers.mesh)
    }
    const flashes = new MuzzleFlashes()
    withRandom(() => 0.5, () => flashes.emit({ at: new Vector3(-1, 0, 0), dir: new Vector3(1, 0, 0), length: 2, size: 1, life: 1, palette: 0 }))
    flashes.update(0.1)
    // A visible star must not hide a culled plume in the pixel count.
    await check('semi flash plume', flashes.plumes)
    await check('semi flash star', flashes.stars)

    const lances = new Lances()
    lances.emit(new Vector3(-2, 0, 0), new Vector3(1, 0, 0), 4, 0.3)
    lances.update(0.03)
    await check('bat lance', lances.mesh)
    for (const streak of [false, true]) {
      const vortex = new Vortex()
      // Same single mote in both cases; only the final random sample selects
      // puff/streak. Samples: radius, draw, angle, swirl, lift, size, kind.
      const samples = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, streak ? 0.1 : 0.9]
      let i = 0
      withRandom(() => {
        if (i >= samples.length) throw new Error('Vortex birth consumed unexpected random samples')
        return samples[i++]
      }, () => vortex.emit(new Vector3(0, 0, 0), 5, 1, 1, -1, 5, 2, 4))
      if (i !== samples.length) throw new Error('Vortex birth did not consume the puff/streak sample')
      vortex.update(0.4)
      await check(streak ? 'bat vortex streak' : 'bat vortex puff', vortex.mesh)
    }
    if (failures.length) throw new Error(`Camera-facing effects produced no lit pixels: ${failures.join(', ')}`)
  } finally {
    renderer.dispose()
  }
}
