// Full-world boot and fixed-camera frame costs at 1080p; no browser/listening server.
// Usage: [BENCH_CAR=<roster id>] node tools/citadel-bench.mjs
import { createServer } from 'vite'

globalThis.self = globalThis
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
try {
  const { benchCitadel } = await server.ssrLoadModule('/tools/preview/citadel-bench.ts')
  await benchCitadel()
} finally {
  await server.close()
}
process.exit(0)
