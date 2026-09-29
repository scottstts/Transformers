// GPU cost of the Bat's heaviest effects at 1080p (Dawn WebGPU in Node, no browser): the special's vortex and the afterburner.
// Usage: node tools/bat-fx-bench.mjs
import { createServer } from 'vite'

globalThis.self = globalThis
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
try {
  const { benchBatFx } = await server.ssrLoadModule('/tools/preview/bat-fx-bench.ts')
  await benchBatFx()
} finally {
  await server.close()
}
process.exit(0)
