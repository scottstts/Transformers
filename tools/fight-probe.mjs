// Prints a fighting combo's pose numbers over time: node tools/fight-probe.mjs [car] [clicks] [until] [every]
import { createServer } from 'vite'
globalThis.self = globalThis
const [car = 'cybertruck', clicks = '0', until = '1', every = '0.1'] = process.argv.slice(2)
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
try {
  const { probeFight } = await server.ssrLoadModule('/tools/preview/fight-probe.ts')
  probeFight(car, clicks.split(',').filter(Boolean).map(Number), Number(until), Number(every))
} finally {
  await server.close()
}
process.exit(0)
