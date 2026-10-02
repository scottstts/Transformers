import { ACESFilmicToneMapping, PCFShadowMap, PMREMGenerator, type Camera, type Node, type Scene, type WebGPURenderer } from 'three/webgpu'
import { Fn, clamp, luminance, max, renderOutput, screenUV, texture, vec3, vec4 } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { filmicGrade } from './grade'
import type { Lens } from './lens'
import { heatShimmer } from './heat-shimmer'
import { antialiasScene, GamePostPipeline } from './antialias'

/** Width of the bloom threshold's knee (luminance). */
const KNEE = 0.5

/**
 * The bloom's bright pass: what a pixel carries above the threshold, eased in
 * through a quadratic knee. The stock pass switched a pixel's whole radiance
 * on at the threshold, so a wide bright gradient (the dusty sky round the
 * sun) bloomed with a hard edge along its threshold contour and veiled
 * everything in front of it. Strong highlights (flashes, glowing metal) bloom
 * almost as before; dim ones only a little.
 */
const softKnee = Fn(({ input, threshold }: { input: Node<'vec4'>; threshold: Node<'float'> }) => {
  const lum = luminance(input.rgb)
  const soft = clamp(lum.sub(threshold).add(KNEE), 0, 2 * KNEE).pow(2).div(4 * KNEE)
  const above = max(soft, lum.sub(threshold))
  return vec4(input.rgb.mul(above.div(max(lum, 1e-4))), input.a)
})

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
  scene.environmentIntensity = 1
  pmrem.dispose()
}

/**
 * Scene pass and bloom in linear HDR, then tone mapping and output encoding,
 * then the display-referred film grade (`grade.ts`). The pipeline's own output
 * transform is off because `renderOutput` applies it ahead of the grade.
 *
 * The scene is read through the heat shimmer over the sand (heat-shimmer.ts)
 * and, with a `lens`, through its blast-wave refraction; its flash lifts the
 * exposure before tone mapping (so it blows out as film does, through the
 * shoulder) and its zone drains the grade.
 */
export function createPostPipeline(renderer: WebGPURenderer, scene: Scene, camera: Camera, lens?: Lens): GamePostPipeline {
  const { scenePass, antialias: aa } = antialiasScene(scene, camera)
  const color = aa.getTextureNode()
  const glow = bloom(color, 0.32, 0.45, 0.92)
  glow.highPassFn = softKnee
  // the distorted read is its own texture node: the bloom keeps reading the pass as it is
  const shimmer = heatShimmer(scenePass.getTextureNode('depth').r, camera)
  const read = texture(color.value, (lens ? lens.sampleUV() : screenUV).add(shimmer))
  const hdr = lens
    ? read.add(glow).mul(lens.flash.mul(2.5).add(1)).add(vec3(1, 0.96, 0.9).mul(lens.flash.mul(lens.flash).mul(3)))
    : read.add(glow)
  const pipeline = new GamePostPipeline(renderer, aa, scenePass, glow)
  pipeline.outputColorTransform = false
  // AA's history alpha is a reactive mask, not image opacity. Restore opaque
  // scene alpha before RenderOutput's premultiplied colour conversion.
  pipeline.outputNode = vec4(filmicGrade(renderOutput(vec4(hdr.rgb, 1)), lens?.zone), 1)
  return pipeline
}
