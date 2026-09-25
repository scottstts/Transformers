import { Vector2, type Node } from 'three/webgpu'
import { exp, float, max, normalize, screenSize, screenUV, uniform, vec2 } from 'three/tsl'

/**
 * What the lens adds to the picture during a big moment, as uniforms the
 * post pipeline reads (`look.ts`); the fight's camera reactions drive them.
 *
 *   shock  a blast wave's compressed air bends the light behind it: a thin
 *          refracting ring on screen, centred on the blast's projection, its
 *          radius following the wave out (radius and width in screen heights)
 *   flash  the exposure blown out by a blast of light (0..1+)
 *   zone   the palette drained toward grey (0..1): a moment held out of time
 *
 * All of it is a few ALU operations and one scene read that the pipeline
 * makes anyway: at rest the distortion is exactly zero.
 */
export class Lens {
  readonly shockCenter = uniform(new Vector2(0.5, 0.5))
  readonly shockRadius = uniform(0)
  readonly shockWidth = uniform(0.05)
  readonly shockStrength = uniform(0)
  readonly flash = uniform(0)
  readonly zone = uniform(0)

  /**
   * The screen coordinate to read the scene at: pushed outward just inside the
   * ring and pulled in just outside it (the derivative of a Gaussian shell), as
   * a thin shell of denser air refracts what lies behind it.
   */
  sampleUV(): Node<'vec2'> {
    const aspect = screenSize.x.div(screenSize.y)
    const p = screenUV.sub(this.shockCenter).mul(vec2(aspect, 1))
    const r = p.length()
    const d = r.sub(this.shockRadius).div(max(this.shockWidth, float(1e-4)))
    const bend = d.mul(exp(d.mul(d).negate())).mul(this.shockStrength).mul(this.shockWidth)
    const offset = normalize(p.add(vec2(1e-5, 0))).mul(bend).div(vec2(aspect, 1))
    return screenUV.sub(offset)
  }
}
