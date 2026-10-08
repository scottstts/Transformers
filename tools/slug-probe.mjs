// Semi cannon channel's muzzle-end emission and silhouette: node tools/slug-probe.mjs
import { createServer } from 'vite'
globalThis.self = globalThis
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
try {
  const { probeSlug } = await server.ssrLoadModule('/tools/preview/slug-probe.ts')
  await probeSlug()
} finally {
  await server.close()
}
process.exit(0)
