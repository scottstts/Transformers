import { Matrix4, NoBlending, RenderPipeline, Vector3, type Camera, type Scene, type Node, type NodeFrame, type NodeBuilder, type NodeMaterial, type TextureNode, type WebGPURenderer } from 'three/webgpu'
import { Fn, float, max, mix, mrt, output, pass, texture, uniform, uv, vec2, vec4, velocity } from 'three/tsl'
import TRAANode from 'three/addons/tsl/display/TRAANode.js'

/**
 * Temporal scene sampling for subpixel architectural silhouettes and shaded
 * detail. Three owns Halton jitter, depth rejection and variance clipping;
 * we own cuts, scene changes and reactive transparent effects. Lens effects
 * and presentation remain after this resolve, so they never enter history.
 */
export class SceneAntialias extends TRAANode {
  private readonly reactive: TextureNode
  private readonly resetFrame = uniform(1)
  private pending = true
  private lastTime = -1
  private readonly lastProjection = new Matrix4()
  private readonly lastPosition = new Vector3()
  private readonly direction = new Vector3()
  private readonly lastDirection = new Vector3()
  /** Headless validation can distinguish stable accumulation from cut resets. */
  resets = 0

  constructor(color: TextureNode, depth: TextureNode, motion: TextureNode, camera: Camera) {
    super(color, depth, motion, camera)
    this.reactive = motion
    this.useSubpixelCorrection = false
  }

  reset(): void { this.pending = true }

  getTextureNode(): TextureNode<'vec4'> {
    return (this as unknown as { _textureNode: TextureNode<'vec4'> })._textureNode
  }

  setup(builder: NodeBuilder): Node {
    const result = super.setup(builder)
    // r186's resolve material has no public reactive/history-reset input.
    // Keep this version-specific bridge here; all history ownership is local.
    const { _resolveMaterial: material, _historyRenderTarget: history } = this as unknown as { _resolveMaterial: NodeMaterial; _historyRenderTarget: { texture: TextureNode['value'] } }
    const motion = this.reactive.sample(uv())
    const currentReactive = motion.z.saturate()
    // History alpha carries the previous reactive coverage, so a disappearing
    // puff or flash also rejects its old colour without another render target.
    const priorReactive = texture(history.texture, uv().sub(motion.xy.mul(vec2(0.5, -0.5)))).a
    const reject = max(max(currentReactive, priorReactive), this.resetFrame).saturate()
    // The quad replaces every pixel; preserve its history alpha rather than
    // NodeMaterial's normal opaque-output override to 1.
    material.blending = NoBlending
    material.fragmentNode = vec4(mix((material.colorNode as Node<'vec4'>).rgb, this.beautyNode.sample(uv()).rgb, reject), currentReactive)
    return result
  }

  updateBefore(frame: NodeFrame): boolean {
    const camera = this.camera
    const matrix = camera.matrixWorld.elements
    const projection = camera.projectionMatrix.elements
    this.direction.set(matrix[8], matrix[9], matrix[10])
    const moved = this.lastPosition.distanceToSquared(camera.position) > 144
    const turned = this.direction.dot(this.lastDirection) < 0.85
    const lens = Math.abs(projection[0] / this.lastProjection.elements[0] - 1) > 0.08 || Math.abs(projection[5] / this.lastProjection.elements[5] - 1) > 0.08
    const cut = this.pending || moved || turned || lens || (this.lastTime >= 0 && frame.time - this.lastTime > 0.5)
    if (cut) this.resets++
    this.resetFrame.value = cut ? 1 : 0
    this.pending = false
    this.lastTime = frame.time
    this.lastProjection.copy(camera.projectionMatrix)
    this.lastPosition.copy(camera.position)
    this.lastDirection.copy(this.direction)
    super.updateBefore(frame)
    return true
  }
}

export class GamePostPipeline extends RenderPipeline {
  readonly antialias: SceneAntialias
  private readonly scenePass: { dispose(): void }
  private readonly bloom: { dispose(): void }
  constructor(renderer: WebGPURenderer, aa: SceneAntialias, scenePass: { dispose(): void }, bloom: { dispose(): void }) {
    super(renderer)
    this.antialias = aa
    this.scenePass = scenePass
    this.bloom = bloom
  }
  resetHistory(): void { this.antialias.reset() }
  dispose(): void { this.antialias.dispose(); this.scenePass.dispose(); this.bloom.dispose(); super.dispose() }
}

/** Shared production/diagnostic scene buffers: HDR colour, depth, motion and reactive coverage. */
export function antialiasScene(scene: Scene, camera: Camera) {
  const scenePass = pass(scene, camera)
  const reactive = Fn((builder: any) => float(builder.material.transparent || builder.material.userData.temporalReactive ? 1 : 0))()
  scenePass.setMRT(mrt({ output, velocity: vec4(velocity as unknown as Node<'vec2'>, reactive, output.a) }))
  const antialias = new SceneAntialias(scenePass.getTextureNode('output'), scenePass.getTextureNode('depth'), scenePass.getTextureNode('velocity'), camera)
  return { scenePass, antialias }
}
