// Back faces visible from the walkable floor (faces that vanish in game). Usage: node tools/citadel-backfaces.mjs [spacing m] [shots dir]
import { createServer } from 'vite'

globalThis.self = globalThis
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
try {
  const { auditBackfaces } = await server.ssrLoadModule('/tools/preview/citadel-backfaces.ts')
  await auditBackfaces(Number(process.argv[2] ?? 16), process.argv[3] ?? "")
} finally { await server.close() }
process.exit(0)
