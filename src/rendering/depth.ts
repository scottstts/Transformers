import type { Camera } from 'three/webgpu'

/**
 * The depth buffer is reversed float (1 at the near plane, 0 at the far):
 * its precision is relative to the distance, about 0.1 mm per kilometre, so
 * trim standing millimetres proud of a wall resolves across the whole view.
 * A standard buffer with a 0.1 m near plane loses 15 mm by 160 m, and the
 * citadel's inlays z-fought (flickering under the temporal jitter) from
 * there on. Every renderer, the game's and the headless tools', takes these
 * options, so bias signs and depth compares hold everywhere.
 */
export const DEPTH_OPTIONS = { reversedDepthBuffer: true } as const

/**
 * Mark a camera reversed before its first draw. Three adopts a camera at its
 * first render, after a shadow's matrix has been taken from it: a map drawn
 * once (a cached static level) would keep the unreversed matrix.
 */
export function adoptReversedDepth(camera: Camera): void {
  (camera as unknown as { _reversedDepth: boolean })._reversedDepth = DEPTH_OPTIONS.reversedDepthBuffer
}

/**
 * A polygon offset toward the camera (decals over their surface), in the
 * buffer's direction: reversed depth grows toward the camera.
 */
export function towardCamera(units: number): number {
  return DEPTH_OPTIONS.reversedDepthBuffer ? units : -units
}
