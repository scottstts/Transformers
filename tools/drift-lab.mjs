// Handling telemetry for tuning the car model without a browser: scripted driver inputs, printed traces.
// Usage: node tools/drift-lab.mjs [car] [scenario ...]   (cars: cybertruck, ferrari-f1; scenarios: see tools/drift-lab/scenarios.ts)
import { createServer } from 'vite'

const [car = 'cybertruck', ...names] = process.argv.slice(2)
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
try {
  const { runScenarios } = await server.ssrLoadModule('/tools/drift-lab/scenarios.ts')
  runScenarios(car, names)
} finally {
  await server.close()
}
