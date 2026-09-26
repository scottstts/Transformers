import type { Object3D } from 'three/webgpu'

/**
 * Turn frustum culling off for everything under `root`; returns the undo.
 *
 * `compileAsync` and a render only prepare what the camera (and the sun's
 * shadow camera) can see. For a warm-up that must cover the whole world, the
 * forts far off the start view and their shadow casters included, everything
 * is drawn once behind the loading screen with culling off; otherwise their
 * pipelines compile and their buffers upload the first time they come into
 * view, mid-game, as a visible hitch.
 */
export function disableCulling(root: Object3D): () => void {
  const touched: Object3D[] = []
  root.traverse((o) => {
    if (!o.frustumCulled) return
    o.frustumCulled = false
    touched.push(o)
  })
  return () => {
    for (const o of touched) o.frustumCulled = true
  }
}
