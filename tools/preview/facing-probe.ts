import { PerspectiveCamera, Scene, Vector3, type Object3D } from 'three/webgpu'
import { createHeadlessRenderer } from './headless'
import { adoptReversedDepth } from '../../src/rendering/depth'
import { Sparks } from '../../src/content/transformer/combat/fx/sparks'
import { Lightning } from '../../src/content/impala/combat/fx/lightning'

/**
 * Whether the instanced camera-facing quads (sparks, bolts) reach the screen:
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
  const lit = async (object: Object3D): Promise<number> => {
    const scene = new Scene()
    scene.add(object)
    renderer.render(scene, camera)
    const px = await grab()
    let n = 0
    for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 60) n++
    return n
  }
  const sparks = new Sparks()
  sparks.emit({ count: 200, at: new Vector3(0, 1, 0), dir: new Vector3(0, 1, 0), spread: 1, speed: [1, 3], life: [2, 3], size: 0.05, drag: 1, gravity: 0, palette: 0 })
  sparks.update(0.05)
  console.log(`sparks    lit px ${await lit(sparks.mesh)}`)
  const bolts = new Lightning()
  bolts.strike(new Vector3(-3, 1, 0), new Vector3(3, 1, 0), { width: 0.3, life: 1, brightness: 1, roughness: 0.1, forks: 0, forkLength: 0 })
  bolts.update(0.03)
  console.log(`lightning lit px ${await lit(bolts.mesh)}`)
}
