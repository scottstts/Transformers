// Headless samples of effects with the game's renderer and image (Dawn WebGPU in Node, no browser).
// Usage: node tools/fx-sample.mjs <out> <sample,...>   (writes <out>-<sample>.png; samples in tools/preview/fx.ts)
import { createServer } from 'vite'

globalThis.self = globalThis
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

const [out = 'fx', names = 'billows'] = process.argv.slice(2)
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
try {
  const { renderFx } = await server.ssrLoadModule('/tools/preview/fx.ts')
  await renderFx(out, names.split(','))
} finally {
  await server.close()
}
process.exit(0)
