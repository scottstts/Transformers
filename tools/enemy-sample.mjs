// Headless samples of the enemy soldiers and forts with the game's renderer and image (Dawn WebGPU in Node, no browser).
// Usage: node tools/enemy-sample.mjs <out> <sample,...>   (writes <out>-<sample>.png; samples in tools/preview/enemies.ts)
import { createServer } from 'vite'

globalThis.self = globalThis
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

const [out = 'enemy', names = 'lineup'] = process.argv.slice(2)
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
try {
  const { renderEnemies } = await server.ssrLoadModule('/tools/preview/enemies.ts')
  await renderEnemies(out, names.split(','))
} finally {
  await server.close()
}
process.exit(0)
