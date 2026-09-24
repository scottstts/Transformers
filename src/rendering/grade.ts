import { float, floor, hash, luminance, mix, mod, screenCoordinate, screenUV, screenSize, smoothstep, time, vec2, vec3 } from 'three/tsl'
import type { Node } from 'three/webgpu'

/**
 * Display-referred film grade, applied after tone mapping and sRGB encoding
 * (values in 0..1): a toe/shoulder contrast curve, cool shadows and warm
 * highlights, an elliptical vignette and luminance grain. All arithmetic, no
 * texture reads; the grain also breaks up banding in the sky gradient.
 */
export const GRADE = {
  /** blend (0..1) toward a smoothstep S-curve about mid grey */
  contrast: 0.3,
  /** saturation after the curve (the per-channel S-curve adds some on its own) */
  saturation: 0.94,
  shadowTint: vec3(0.955, 0.99, 1.04),
  highlightTint: vec3(1.035, 1.0, 0.95),
  /** darkening at the frame corners */
  vignette: 0.42,
  /** grain amplitude at mid grey, in display units */
  grain: 0.022,
}

export function filmicGrade(display: Node<'vec4'>): Node<'vec3'> {
  const c = display.rgb.clamp(0, 1)
  // S-curve: deeper toe and brighter shoulder around mid grey
  const curved = mix(c, smoothstep(0, 1, c), GRADE.contrast)
  const y = luminance(curved)
  const graded = mix(vec3(y), curved, GRADE.saturation)
    .mul(mix(GRADE.shadowTint, GRADE.highlightTint, smoothstep(0.1, 0.75, y)))

  // elliptical falloff, measured on the frame's short side so wide screens darken their flanks too
  const aspect = screenSize.x.div(screenSize.y)
  const p = screenUV.sub(0.5).mul(vec2(aspect.min(2.2), 1))
  const vignette = float(1).sub(smoothstep(0.35, 1.05, p.length()).mul(GRADE.vignette))

  // per-pixel grain, new every frame, strongest in the mid-tones where film shows it
  const frame = mod(floor(time.mul(60)), 64)
  const seed = floor(screenCoordinate.x).add(floor(screenCoordinate.y).mul(1973)).add(frame.mul(65536))
  const midtones = y.mul(float(1).sub(y)).mul(4)
  const grain = hash(seed).sub(0.5).mul(GRADE.grain).mul(midtones.mul(0.7).add(0.3))

  return graded.mul(vignette).add(grain).clamp(0, 1)
}
