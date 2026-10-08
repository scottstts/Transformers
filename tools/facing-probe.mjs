// Whether the instanced camera-facing effects (sparks, bolts) reach the screen, as lit pixels (0 = back-face culled): node tools/facing-probe.mjs
import { createServer } from 'vite'
globalThis.self = globalThis
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
try {
  const { probeFacing } = await server.ssrLoadModule('/tools/preview/facing-probe.ts')
  await probeFacing()
} finally {
  await server.close()
}
process.exit(0)
