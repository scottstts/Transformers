// Prints the desert landform's statistics: height range, steepest slope, sharpest crest (and the speed at
// which a car leaves the ground there) and the CPU cost of one height query.
// Usage: node tools/terrain-stats.mjs
import { createServer } from 'vite'
import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
const plan = JSON.parse(readFileSync(new URL('../assets/citadel.plan.json', import.meta.url), 'utf8'))
const pads = [{ x: plan.site.x, z: plan.site.z, r0: plan.barrier + 10, r1: plan.barrier + 95 }]
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
try {
  const { DesertTerrain } = await server.ssrLoadModule('/src/worlds/desert/terrain.ts')
  const t = new DesertTerrain(pads)
  console.log('start h', t.height(0, 0).toFixed(3), 'citadel centre', t.height(plan.site.x, plan.site.z))
  let maxS = 0, minH = 1e9, maxH = -1e9, maxK = 0
  const e = 0.5
  for (let i = 0; i < 200000; i++) {
    const x = (Math.random() - 0.5) * 6000, z = (Math.random() - 0.5) * 6000
    const h = t.height(x, z)
    minH = Math.min(minH, h); maxH = Math.max(maxH, h)
    const gx = (t.height(x + e, z) - t.height(x - e, z)) / (2 * e)
    const gz = (t.height(x, z + e) - t.height(x, z - e)) / (2 * e)
    maxS = Math.max(maxS, Math.hypot(gx, gz))
    // curvature along wind
    const d = 1.0
    const k = (t.height(x + 0.8 * d, z + 0.6 * d) - 2 * h + t.height(x - 0.8 * d, z - 0.6 * d)) / (d * d)
    maxK = Math.max(maxK, -k)
  }
  console.log('h range', minH.toFixed(2), maxH.toFixed(2), 'max slope', maxS.toFixed(3), (Math.atan(maxS) * 180 / Math.PI).toFixed(1) + 'deg', 'max convex curvature', maxK.toFixed(4), 'takeoff speed', Math.sqrt(9.81 / maxK).toFixed(1))
  const t0 = performance.now()
  let acc = 0
  for (let i = 0; i < 100000; i++) acc += t.height(i * 0.37, i * 0.21)
  console.log('us per height', ((performance.now() - t0) / 100).toFixed(3), acc > 0)
} finally { await server.close() }

// A drive across the dune seas at full throttle for each car: time in the air, longest flight, hardest landing.
const server2 = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
try {
  const { DesertTerrain } = await server2.ssrLoadModule('/src/worlds/desert/terrain.ts')
  const { createMotionState } = await server2.ssrLoadModule('/src/game/types.ts')
  const { placeCar, updateCar } = await server2.ssrLoadModule('/src/game/car-dynamics.ts')
  const cars = {
    cybertruck: (await server2.ssrLoadModule('/src/content/cybertruck/index.ts')).CYBERTRUCK_PROFILE.drive,
    'ferrari-f1': (await server2.ssrLoadModule('/src/content/ferrari-f1/index.ts')).F1_PROFILE.drive,
    semi: (await server2.ssrLoadModule('/src/content/semi/index.ts')).SEMI_PROFILE.drive,
  }
  const t = new DesertTerrain(pads)
  for (const [name, car] of Object.entries(cars)) {
    for (const boost of [false, true]) {
      const s = createMotionState()
      s.pos.set(-600, 0, -600)
      s.yaw = Math.atan2(-0.8, -0.6) // downwind: over the stoss faces and off the lee faces
      placeCar(s, car, t)
      let air = 0, longest = 0, flight = 0, impact = 0, flights = 0, frames = 0
      for (let f = 0; f < 60 * 40; f++) {
        updateCar(s, { driveThrottle: 1, driveSteering: 0, driftHeld: boost }, 1 / 60, false, car, t)
        frames++
        if (s.airborne) { air++; flight++ } else { if (flight > 0) { flights++; longest = Math.max(longest, flight) } flight = 0 }
        impact = Math.max(impact, s.impact)
      }
      console.log(`${name.padEnd(11)} ${boost ? 'boost' : 'drive'} speed ${s.speed.toFixed(0)} m/s  air ${(100 * air / frames).toFixed(1)}%  flights ${flights}  longest ${(longest / 60).toFixed(2)} s  hardest landing ${impact.toFixed(1)} m/s`)
    }
  }
} finally { await server2.close() }
