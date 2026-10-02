// Fixed gate views, actual-asset temporal flicker and lighting isolation.
import { createServer } from 'vite'

globalThis.self = globalThis
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
try {
  const { renderCitadel } = await server.ssrLoadModule('/tools/preview/citadel-render.ts')
  await renderCitadel(process.argv[2] ?? '/tmp/citadel-render')
} finally { await server.close() }
process.exit(0)
