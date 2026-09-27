// Pipelines built in play after a car switch (Dawn WebGPU in Node, no browser); anything built is a mid-game hitch.
// Usage: node tools/switch-probe.mjs [from] [to]   (roster ids; default cybertruck -> semi)
import { createServer } from 'vite'

globalThis.self = globalThis
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

const [from = 'cybertruck', to = 'semi'] = process.argv.slice(2)
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
try {
  const { probeSwitch } = await server.ssrLoadModule('/tools/preview/switch-probe.ts')
  await probeSwitch(from, to)
} finally {
  await server.close()
}
process.exit(0)
