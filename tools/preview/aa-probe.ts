import { BoxGeometry, Color, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, PlaneGeometry, RenderPipeline, Scene } from 'three/webgpu'
import { renderOutput, vec4 } from 'three/tsl'
import { antialiasScene } from '../../src/rendering/antialias'
import { createHeadlessRenderer } from './headless'

/** No bloom/grain: camera jitter must stop turning subpixel bars on and off. */
export async function probeAntialias(): Promise<void> {
  const width = 512, height = 288
  const { renderer, grab, capture } = await createHeadlessRenderer(width, height)
  const scene = new Scene()
  scene.background = new Color(0xffffff)
  const camera = new PerspectiveCamera(50, width / height, 0.1, 2000)
  camera.position.set(0, 0, 200)
  const material = new MeshBasicNodeMaterial({ color: 0x101010 })
  // Approx. 0.3 pixels wide at 200 m, with both diagonal and vertical edges.
  for (let i = -16; i <= 16; i++) {
    const bar = new Mesh(new BoxGeometry(0.2, 50, 0.2), material)
    bar.position.x = i * 3.37
    bar.rotation.z = i % 2 ? 0.23 : 0
    scene.add(bar)
  }
  const flash = new Mesh(new PlaneGeometry(25, 25), new MeshBasicNodeMaterial({ color: 0xff0000, transparent: true, depthWrite: false }))
  flash.position.set(65, 0, 5)
  scene.add(flash)
  const { scenePass, antialias: aa } = antialiasScene(scene, camera)
  const pipeline = new RenderPipeline(renderer)
  pipeline.outputColorTransform = false
  pipeline.outputNode = renderOutput(vec4(aa.getTextureNode().rgb, 1))
  const frame = (renderer as unknown as { _nodes: { nodeFrame: { update(): void } } })._nodes.nodeFrame
  const draw = (): void => { camera.updateMatrixWorld(); frame.update(); pipeline.render() }
  draw()
  const projection = camera.projectionMatrix.clone()
  const measure = async (reset: boolean): Promise<number> => {
    let previous: Uint8Array | null = null, change = 0, samples = 0
    aa.reset()
    camera.position.x = 0
    for (let i = 0; i < 80; i++) {
      // A slow orbit/translation sweeps the high-contrast bars through pixels.
      camera.position.x = Math.sin(i / 18) * 0.16
      if (reset) aa.reset()
      draw()
      const pixels = await grab()
      if (i >= 32 && previous) {
        for (let y = 60; y < height - 60; y++) for (let x = 100; x < width - 100; x++) {
          const at = (y * width + x) * 4
          change += Math.abs(pixels[at] - previous[at])
          samples++
        }
      }
      previous = pixels
      if (camera.view?.enabled) throw new Error('TRAA left camera projection jitter active after the frame')
      if (i === 0) projection.copy(camera.projectionMatrix)
      else if (!camera.projectionMatrix.equals(projection)) throw new Error(`Camera projection changed after jitter cleanup: ${camera.projectionMatrix.elements}`)
    }
    return change / samples
  }
  const raw = await measure(true)
  await capture('/tmp/aa-current-only.png')
  const rawResets = aa.resets
  const resolved = await measure(false)
  await capture('/tmp/aa-resolved.png')
  console.log(`history resets: current-only ${rawResets}, accumulating ${aa.resets - rawResets}`)
  console.log(`distant bars temporal change: current-only ${raw.toFixed(3)}, resolved ${resolved.toFixed(3)} luma/frame (${(100 * (1 - resolved / raw)).toFixed(1)}% reduction)`)
  if (!(resolved < raw * 0.55)) throw new Error('Temporal AA failed the subpixel flicker threshold')
  const before = aa.resets
  camera.position.x += 100
  draw(); await grab()
  if (aa.resets !== before + 1) throw new Error('Camera cut did not reject history exactly once')
  draw(); await grab()
  if (aa.resets !== before + 1) throw new Error('Stable camera continually resets history')
  console.log('camera cuts: history reset once; camera projection restored after every frame')
  camera.position.x = 0
  aa.reset(); draw(); await grab()
  flash.visible = false
  draw()
  const after = await grab()
  let error = 0, count = 0
  // The flash at x=65 projects into an otherwise white right-hand patch.
  for (let y = 130; y < 158; y++) for (let x = 348; x < 362; x++) {
    const at = (y * width + x) * 4
    error += 255 - Math.min(after[at], after[at + 1], after[at + 2]); count++
  }
  console.log(`removed transparent flash: residual ${((error / count) / 255 * 100).toFixed(2)}% after one frame`)
  if (error / count > 2) throw new Error('Removed transparent effect remained in temporal history')
  aa.dispose(); scenePass.dispose(); pipeline.dispose(); renderer.dispose()
}
