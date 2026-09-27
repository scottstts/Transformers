import type { Camera, Node } from 'three/webgpu'
import { getViewPosition, length, normalize, screenSize, screenUV, smoothstep, time, uniform, vec2, vec4 } from 'three/tsl'
import { N } from './noise'

/**
 * Heat shimmer: over sun-baked sand the air near the ground boils in cells of
 * differing temperature, and the light grazing through it wavers. Only rays
 * that run long and low see it, so the offset is weighted by the distance to
 * what the pixel shows and by how close to the horizon it looks: the far
 * dunes, the fortress from across the plain and the sky just above the
 * horizon waver; nothing near the camera or overhead does.
 *
 * It is an offset to where the post pass reads the scene: one depth read and
 * one noise fetch per pixel, no extra pass.
 */
/** largest offset (screen heights) */
const AMPLITUDE = 0.0011
/** distances (m) over which it sets in */
const RANGE: [number, number] = [45, 420]
/** how far from the horizon (sine of the elevation) it reaches, up and down */
const BAND: [number, number] = [0.012, 0.06]

export function heatShimmer(depth: Node<'float'>, camera: Camera): Node<'vec2'> {
  const inverseProjection = uniform(camera.projectionMatrixInverse)
  const world = uniform(camera.matrixWorld)
  const view = getViewPosition(screenUV, depth, inverseProjection)
  const distance = length(view)
  const elevation = world.mul(vec4(normalize(view), 0)).y
  // strongest just below the horizon, where the ray skims the hot ground
  const low = elevation.add(0.008).abs()
  const weight = smoothstep(RANGE[0], RANGE[1], distance).mul(smoothstep(BAND[1], BAND[0], low))
  const aspect = screenSize.x.div(screenSize.y)
  // cells taller than wide, rising as the hot air does
  const cells = N(vec2(screenUV.x.mul(aspect).mul(26), screenUV.y.mul(80)).add(vec2(time.mul(0.3), time.mul(-1.9)))).rg.sub(0.5)
  return cells.mul(vec2(0.55, 1)).mul(weight.mul(AMPLITUDE * 2)).div(vec2(aspect, 1))
}
