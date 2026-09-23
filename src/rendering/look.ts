import { ACESFilmicToneMapping, PCFShadowMap, PMREMGenerator, RenderPipeline, type Camera, type Scene, type WebGPURenderer } from 'three/webgpu'
import { pass, uv, float, smoothstep } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'

/** The game's image: filmic tone mapping, soft shadows, baked environment light, bloom and a light vignette. */
export function configureRenderer(renderer: WebGPURenderer): void {
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.92
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFShadowMap
}

/** Bake image-based lighting for `scene` from a small environment scene. */
export function bakeEnvironment(renderer: WebGPURenderer, scene: Scene, environment: Scene): void {
  const pmrem = new PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(environment, 0, 0.1, 200).texture
  scene.environmentIntensity = 0.95
  pmrem.dispose()
}

export function createPostPipeline(renderer: WebGPURenderer, scene: Scene, camera: Camera): RenderPipeline {
  const color = pass(scene, camera).getTextureNode('output')
  const vignette = float(1).sub(smoothstep(0.45, 0.95, uv().sub(0.5).length()).mul(0.35))
  const pipeline = new RenderPipeline(renderer)
  pipeline.outputNode = color.add(bloom(color, 0.32, 0.45, 0.92)).mul(vignette)
  return pipeline
}
