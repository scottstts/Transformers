// The commander's pose numbers and lance clearance: node tools/commander-probe.mjs pose <name|all|json> | move <1-4> [every]
import { createServer } from 'vite'
globalThis.self = globalThis
const [kind = 'pose', what = 'all', every = '0.05'] = process.argv.slice(2)
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
try {
  const { probeCommander } = await server.ssrLoadModule('/tools/preview/commander-probe.ts')
  probeCommander(kind, what, Number(every))
} finally {
  await server.close()
}
process.exit(0)
