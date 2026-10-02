// Asset, floor, navigation and CPU boot diagnostics. No browser or listening server.
// Usage: node tools/citadel-plan.mjs
import { createServer } from 'vite'

globalThis.self = globalThis
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
try {
  const { inspectCitadel } = await server.ssrLoadModule('/tools/preview/citadel-plan.ts')
  await inspectCitadel()
} finally {
  await server.close()
}
