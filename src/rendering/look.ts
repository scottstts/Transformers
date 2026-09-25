import { ACESFilmicToneMapping, PCFShadowMap, PMREMGenerator, RenderPipeline, type Camera, type Scene, type WebGPURenderer } from 'three/webgpu'
import { pass, renderOutput, texture, vec3, vec4 } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { filmicGrade } from './grade'
import type { Lens } from './lens'

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
 *
 * With a `lens`, the scene is read through its blast-wave refraction, its
 * flash lifts the exposure before tone mapping (so it blows out as film does,
 * through the shoulder) and its zone drains the grade.
 */
export function createPostPipeline(renderer: WebGPURenderer, scene: Scene, camera: Camera, lens?: Lens): RenderPipeline {
  const scenePass = pass(scene, camera)
  const color = scenePass.getTextureNode('output')
  const glow = bloom(color, 0.32, 0.45, 0.92)
  // the distorted read is its own texture node: the bloom keeps reading the pass as it is
  const hdr = lens
    ? texture(scenePass.getTexture('output'), lens.sampleUV()).add(glow).mul(lens.flash.mul(2.5).add(1)).add(vec3(1, 0.96, 0.9).mul(lens.flash.mul(lens.flash).mul(3)))
    : color.add(glow)
  const pipeline = new RenderPipeline(renderer)
  pipeline.outputColorTransform = false
  pipeline.outputNode = vec4(filmicGrade(renderOutput(hdr), lens?.zone), 1)
  return pipeline
}
