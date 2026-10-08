import { FloatType, OrthographicCamera, RenderTarget, Scene, Vector3 } from 'three/webgpu'
import { Tracers } from '../../src/content/semi/combat/fx/tracers'
import { adoptReversedDepth } from '../../src/rendering/depth'
import { createHeadlessRenderer } from './headless'

/** Fixed close-up of the first seven metres, measured in linear HDR without bloom. */
export async function probeSlug(): Promise<void> {
  const W = 512, H = 192
  const { renderer, capture } = await createHeadlessRenderer(W, H)
  const target = new RenderTarget(W, H, { type: FloatType })
  const camera = new OrthographicCamera(-4, 4, 1.5, -1.5, 0.1, 100)
  adoptReversedDepth(camera)
  camera.position.set(3, 0, 10)
  camera.lookAt(3, 0, 0)
  camera.updateMatrixWorld()
  const xPixel = (metres: number): number => Math.floor((metres + 1) / 8 * W)
  const failures: string[] = []
  try {
    for (const length of [4, 40]) {
      const channel = new Tracers()
      channel.fire({ from: new Vector3(), to: new Vector3(length, 0, 0), speed: 260, width: 0.3, streak: 10, palette: 1, linger: 0.55 })
      // Measure the residue after the slug lands, early and late in its life.
      let previous = 0
      for (const residueAge of [0.05, 0.3]) {
        const age = length / 260 + residueAge
        channel.update(age - previous)
        previous = age
        const scene = new Scene()
        scene.add(channel.mesh)
        renderer.setRenderTarget(target)
        renderer.render(scene, camera)
        const px = await renderer.readRenderTargetPixelsAsync(target, 0, 0, W, H) as Float32Array
        const energy = (from: number, to: number): number => {
          let sum = 0
          const x0 = xPixel(from), x1 = xPixel(to)
          for (let x = x0; x < x1; x++) for (let y = 0; y < H; y++) {
            const i = (y * W + x) * 4
            sum += px[i] + px[i + 1] + px[i + 2]
          }
          return sum / (x1 - x0)
        }
        const width = (at: number): number => {
          const x = xPixel(at)
          let peak = 0, count = 0
          for (let y = 0; y < H; y++) {
            const i = (y * W + x) * 4
            peak = Math.max(peak, px[i] + px[i + 1] + px[i + 2])
          }
          for (let y = 0; y < H; y++) {
            const i = (y * W + x) * 4
            if (px[i] + px[i + 1] + px[i + 2] > peak * 0.05) count++
          }
          return count
        }
        const body = energy(2, 3)
        const rootRatio = energy(0, 0.05) / body
        const rootWidth = width(0.15), bodyWidth = width(2.5)
        console.log(`slug ${length}m residue ${residueAge.toFixed(2)}s: muzzle/body emission ${rootRatio.toFixed(4)}, root/body width ${rootWidth}/${bodyWidth}px`)
        if (!(body > 0 && rootRatio < 0.05 && rootWidth > 0 && rootWidth < bodyWidth)) failures.push(`${length}m at ${residueAge}s`)
        renderer.setRenderTarget(null)
        renderer.render(scene, camera)
        const path = `/tmp/semi-slug-${length}m-${residueAge.toFixed(2)}s.png`
        await capture(path)
        console.log(`capture ${path}`)
        scene.remove(channel.mesh)
      }
    }
    if (failures.length) throw new Error(`Slug muzzle did not fade and taper: ${failures.join(', ')}`)
  } finally {
    target.dispose()
    renderer.dispose()
  }
}
