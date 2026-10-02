// Thin distant geometry, camera motion, history cuts and transparent reuse.
import { createServer } from 'vite'

globalThis.self = globalThis
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
try {
  const { probeAntialias } = await server.ssrLoadModule('/tools/preview/aa-probe.ts')
  await probeAntialias()
} finally { await server.close() }
process.exit(0)
