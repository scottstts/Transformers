import { ACESFilmicToneMapping, PCFShadowMap, PMREMGenerator, RenderPipeline, type Camera, type Scene, type WebGPURenderer } from 'three/webgpu'
import { pass, renderOutput, vec4 } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { filmicGrade } from './grade'

/** The game's image: filmic tone mapping, soft shadows, baked environment light, bloom and a film grade. */
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

/**
 * Scene pass and bloom in linear HDR, then tone mapping and output encoding,
 * then the display-referred film grade (`grade.ts`). The pipeline's own output
 * transform is off because `renderOutput` applies it ahead of the grade.
 */
export function createPostPipeline(renderer: WebGPURenderer, scene: Scene, camera: Camera): RenderPipeline {
  const color = pass(scene, camera).getTextureNode('output')
  const hdr = color.add(bloom(color, 0.32, 0.45, 0.92))
  const pipeline = new RenderPipeline(renderer)
  pipeline.outputColorTransform = false
  pipeline.outputNode = vec4(filmicGrade(renderOutput(hdr)), 1)
  return pipeline
}
