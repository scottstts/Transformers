// Headless checks of the production AO node on isolated convex surfaces.
import { createServer } from 'vite'

globalThis.self = globalThis
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
try {
  const { probeCitadelAo } = await server.ssrLoadModule('/tools/preview/citadel-ao-probe.ts')
  await probeCitadelAo()
} finally { await server.close() }
process.exit(0)
