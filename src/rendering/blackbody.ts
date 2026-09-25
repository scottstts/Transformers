import type { Node } from 'three/webgpu'
import { exp, float, max, pow, vec3 } from 'three/tsl'

/** Second radiation constant (um K) and the wavelengths (um) that stand for the display's red, green and blue. */
const C2 = 14388
const LAMBDA = [0.61, 0.55, 0.465] as const
/** Temperature (K) at which the glow has unit HDR level, and the dull red below which it has gone out. */
const T_UNIT = 1500
const T_OUT = 750

/**
 * The light of hot matter at temperature `kelvin` (linear HDR): Planck's law
 * at three wavelengths gives the colour (dull red, orange, yellow, white as
 * it heats), normalised to its brightest channel; the level rises as the cube
 * of the temperature above a dull-red threshold (1 at 1500 K, 8 at 2250 K,
 * 27 at 3000 K). Planck's own level spans several orders of magnitude over
 * that range, too much for one exposure to show both a cooling crust and
 * the white-hot moment of a blast, so it keeps the colour and a compressed level.
 * Below about 800 K nothing glows (the Draper point), as in life.
 */
export function blackbody(kelvin: Node<'float'>): Node<'vec3'> {
  const t = max(kelvin, float(500))
  const planck = (lambda: number): Node<'float'> => float(1 / Math.pow(lambda, 5)).div(exp(float(C2 / lambda).div(t)).sub(1))
  const rgb = vec3(planck(LAMBDA[0]), planck(LAMBDA[1]), planck(LAMBDA[2]))
  const chroma = rgb.div(max(rgb.x, max(rgb.y, rgb.z)))
  return chroma.mul(pow(max(t.sub(T_OUT), 0).div(T_UNIT - T_OUT), 3))
}
