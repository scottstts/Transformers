// The Impala special's lightning as numbers (alive segments, reach, drawn): node tools/lightning-probe.mjs [until] [every]
import { createServer } from 'vite'
globalThis.self = globalThis
const [until = '6', every = '0.1'] = process.argv.slice(2)
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
try {
  const { probeLightning } = await server.ssrLoadModule('/tools/preview/lightning-probe.ts')
  await probeLightning(Number(until), Number(every))
} finally {
  await server.close()
}
process.exit(0)
