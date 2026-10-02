// GPU cost of the dust at 1080p (Dawn WebGPU in Node, no browser): the game's frame with and without a fight's dust.
// Usage: node tools/dust-bench.mjs
import { createServer } from 'vite'

globalThis.self = globalThis
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
try {
  const { benchDust } = await server.ssrLoadModule('/tools/preview/dust-bench.ts')
  await benchDust()
} finally {
  await server.close()
}
process.exit(0)
