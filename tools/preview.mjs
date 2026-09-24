// Headless frame renderer for visual review of effects (Dawn WebGPU in Node, no browser).
// Usage: [PREVIEW_CAR=ferrari-f1] node tools/preview.mjs <out-dir> [shot ...]   (shots: see tools/preview/shots.ts)
import { createServer } from 'vite'

// three's animation clock expects a window-like global
globalThis.self = globalThis
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

const [outDir = 'preview-out', ...shots] = process.argv.slice(2)
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
try {
  const { renderShots } = await server.ssrLoadModule('/tools/preview/shots.ts')
  await renderShots(outDir, shots, process.env.PREVIEW_CAR ?? null)
} finally {
  await server.close()
}
process.exit(0)
