// GPU cost of the Roadster's heaviest effects at 1080p (Dawn WebGPU in Node, no browser): the lift jets' launch
// cloud, the singularity's field, Whiteout's ring and its impact, each against the same frame without them.
// Usage: node tools/roadster-fx-bench.mjs
import { createServer } from 'vite'

globalThis.self = globalThis
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
try {
  const { benchRoadsterFx } = await server.ssrLoadModule('/tools/preview/roadster-fx-bench.ts')
  await benchRoadsterFx()
} finally {
  await server.close()
}
process.exit(0)
