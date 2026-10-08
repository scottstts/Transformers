// A fight's pose defects: parts coming apart, frames that snap, a wrung hand: node tools/pose-audit.mjs [car] [clicks, F<t> the special] [until]
import { createServer } from 'vite'
globalThis.self = globalThis
const [car = 'impala', clicks = 'F0', until = '10'] = process.argv.slice(2)
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
try {
  const { auditPose } = await server.ssrLoadModule('/tools/preview/pose-audit.ts')
  await auditPose(car, clicks.split(',').filter(Boolean), Number(until))
} finally {
  await server.close()
}
process.exit(0)
