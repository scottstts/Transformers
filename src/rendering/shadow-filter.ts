import { TextureNode, type DepthTexture, type DirectionalLightShadow, type Node } from 'three/webgpu'
import { Fn, float, interleavedGradientNoise, nodeObject, reference, renderGroup, screenCoordinate, vogelDiskSample } from 'three/tsl'

/**
 * r186's TextureNode ignores .level(0) on comparison samples. These depth
 * maps have one level; explicit comparison sampling permits selecting a map
 * per pixel without implicit derivatives or changing hardware PCF quality.
 * Keep the bridge local to static shadow filtering.
 */
class FixedShadowCompare extends TextureNode {
  constructor(depth: DepthTexture, uv: Node, compare: Node<'float'>) {
    super(depth, uv)
    this.compareNode = compare
  }
  generateSnippet(builder: any, ...args: any[]): string {
    const sample = (TextureNode.prototype as unknown as { generateSnippet(b: unknown, ...args: unknown[]): string }).generateSnippet.call(this, builder, ...args)
    return sample.replace('textureSampleCompare(', 'textureSampleCompareLevel(')
  }
}

/** Exactly Three r186's five Vogel samples and hardware 4-tap PCF. */
export function staticShadowFilter({ depthTexture, shadowCoord, shadow }: { depthTexture: DepthTexture; shadowCoord: Node<'vec3'>; shadow: DirectionalLightShadow }): Node<'float'> {
  return Fn(() => {
    const size = (reference('mapSize', 'vec2', shadow) as any).setGroup(renderGroup)
    const radius = (reference('radius', 'float', shadow) as any).setGroup(renderGroup).div(size.x)
    const angle = interleavedGradientNoise(screenCoordinate.xy).mul(6.28318530718)
    const sum = float(0).toVar()
    for (let i = 0; i < 5; i++) {
      const uv = shadowCoord.xy.add((vogelDiskSample(float(i), float(5), angle) as Node<'vec2'>).mul(radius))
      sum.addAssign(nodeObject(new FixedShadowCompare(depthTexture, uv, shadowCoord.z)) as unknown as Node<'float'>)
    }
    return sum.mul(1 / 5)
  })() as Node<'float'>
}
