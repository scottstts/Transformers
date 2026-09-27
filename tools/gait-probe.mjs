// Gait timing, joint ranges and body bounce of each robot's settled walk and run, measured through
// the rendered model against gravity and leg length (Froude number, dimensionless cadence, 60 Hz
// vertical acceleration), so a gait that reads as sped up or jolting shows as numbers.
// Usage: node tools/gait-probe.mjs [robot ...] [--table] [--sole]   (robots: ferrari-f1, cybertruck, semi)
//   --table            one cycle phase by phase, with where the bounce peaks (ground lift or rig pelvis)
//   --lateral [--run]  the cycle seen from behind: sway, roll and yaw of pelvis, chest and head, knee and foot tracks
//   --jump [--walk]   a jump from a settled run (walk), AT=<stride fraction> to take off from: pose table and joint snaps
//   --sole             each sole's lowest point against foot pitch, beside the gait's heel/toe model
//   GAIT='{...}'       trial style values laid over the probed robots' gait styles, without editing them
//   LIFT=<n>           with --table: ground lift and rig pelvis height every n frames (240 Hz)
import { createServer } from 'vite'

const args = process.argv.slice(2)
const table = args.includes('--table')
const robots = args.filter((a) => !a.startsWith('--'))
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
try {
  if (args.includes('--jump')) {
    const { jumpProbe } = await server.ssrLoadModule('/tools/gait-probe/jump.ts')
    const at = Number(process.env.AT ?? 0.1)
    for (const name of robots.length ? robots : ['ferrari-f1', 'cybertruck', 'semi']) jumpProbe(name, !args.includes('--walk'), at, table)
  } else if (args.includes('--lateral')) {
    const { lateral } = await server.ssrLoadModule('/tools/gait-probe/lateral.ts')
    for (const name of robots.length ? robots : ['ferrari-f1', 'cybertruck', 'semi']) lateral(name, args.includes('--run'), table)
  } else if (args.includes('--sole')) { const { sole } = await server.ssrLoadModule('/tools/gait-probe/sole.ts'); for (const name of robots.length ? robots : ['ferrari-f1', 'cybertruck', 'semi']) { console.log(name); sole(name) } }
  else {
    const { probe } = await server.ssrLoadModule('/tools/gait-probe/probe.ts')
    for (const name of robots.length ? robots : ['ferrari-f1', 'cybertruck', 'semi']) {
      for (const running of [false, true]) probe(name, running, table)
    }
  }
} finally {
  await server.close()
}
process.exit(0)
