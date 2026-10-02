// Where the weapon or an arm passes through the robot during a fight: node tools/clash-probe.mjs [car] [clicks, F<t> a special, G the guard held, walk / run the gait alone] [until]
import { createServer } from 'vite'
globalThis.self = globalThis
const [car = 'cybertruck', clicks = '0', until = '4'] = process.argv.slice(2)
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
try {
  const { probeClash } = await server.ssrLoadModule('/tools/preview/clash-probe.ts')
  await probeClash(car, clicks.split(',').filter(Boolean), Number(until))
} finally {
  await server.close()
}
process.exit(0)
