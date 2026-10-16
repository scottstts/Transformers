// Where a held pose puts the Roadster's palms (its palm cannons fire along the palm normal):
// node tools/palm-probe.mjs '{"R.az":0,"R.el":10,"R.reach":0.95,"R.wy":80}' ...   (pose channels, pose.ts)
import { createServer } from 'vite'
globalThis.self = globalThis
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
try {
  const { palmProbe } = await server.ssrLoadModule('/tools/preview/palm-probe.ts')
  for (const arg of process.argv.slice(2)) { console.log(arg); palmProbe(JSON.parse(arg)) }
} finally {
  await server.close()
}
process.exit(0)
