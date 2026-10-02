// Districts, floor levels, surface patches, gates, posts, bays and collider overlay.
// Usage: node tools/citadel-map.mjs [out.svg]
import { writeFileSync } from 'node:fs'
import { createServer } from 'vite'

const [out = '/tmp/citadel-map.svg'] = process.argv.slice(2)
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
try {
  const { mirrorJson } = await server.ssrLoadModule('/tools/mirror.ts')
  const { citadelPlan } = await server.ssrLoadModule('/src/worlds/desert/citadel/plan.ts')
  const plan = citadelPlan(mirrorJson('citadel.plan.json'))
  const pad = 30, scale = 1.2
  const { x0, z0, x1, z1 } = plan.bounds
  const width = (x1 - x0 + pad * 2) * scale, height = (z1 - z0 + pad * 2) * scale
  const X = (x) => ((x - x0 + pad) * scale).toFixed(2)
  const Z = (z) => ((z1 + pad - z) * scale).toFixed(2)
  const poly = (points, attrs) => `<polygon points="${points.map(([x, z]) => `${X(x)},${Z(z)}`).join(' ')}" ${attrs}/>`
  const line = (a, b, attrs) => `<line x1="${X(a[0])}" y1="${Z(a[1])}" x2="${X(b[0])}" y2="${Z(b[1])}" ${attrs}/>`
  const parts = [`<rect width="100%" height="100%" fill="#d8c8a8"/>`]
  const tiers = ['#e3d9c5', '#d0dce4', '#bdcddc', '#ecebe5']
  for (const s of plan.sectors) parts.push(poly(s.polygon, `fill="${tiers[s.tier]}" stroke="#8e948c" stroke-width="1"`))
  for (const f of plan.floor.filter((f) => f.kind === 'ramp')) parts.push(poly(f.polygon, 'fill="#6ba9b4" stroke="#267282"'))
  for (const p of plan.surfaces) parts.push(poly(p.polygon, `fill="${p.surface === 'deck' ? '#6d7279' : '#f3ece2'}" fill-opacity="0.6"`))
  for (const s of plan.segments) parts.push(line([s.ax, s.az], [s.bx, s.bz], `stroke="#b34b45" stroke-opacity="0.6" stroke-width="${Math.max(1, s.r * 2 * scale)}" stroke-linecap="round"`))
  for (const c of plan.circles) parts.push(`<circle cx="${X(c.x)}" cy="${Z(c.z)}" r="${c.r * scale}" fill="#b34b45" fill-opacity="0.6"/>`)
  for (const g of plan.gates) parts.push(line(g.inside, g.outside, 'stroke="#26734b" stroke-width="2"'), `<text x="${X(g.at[0] + 3)}" y="${Z(g.at[1] + 3)}" font-size="11" fill="#144b2b">${g.id}</text>`)
  for (const p of plan.posts) parts.push(`<polyline points="${p.beat.map(([x, z]) => `${X(x)},${Z(z)}`).join(' ')}" fill="none" stroke="#357da8" stroke-width="0.8"/>`)
  for (const s of plan.spawns) parts.push(line(s.at, s.exit, 'stroke="#8b4588" stroke-width="3"'))
  for (const s of plan.sectors) parts.push(`<circle cx="${X(s.yard.at[0])}" cy="${Z(s.yard.at[1])}" r="${s.yard.r * scale}" fill="none" stroke="#ad791f"/>`, `<text x="${X(s.yard.at[0])}" y="${Z(s.yard.at[1])}" text-anchor="middle" font-size="13">D${s.index} ${s.role} · T${s.tier}</text>`)
  writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif">${parts.join('')}</svg>`)
  console.log('wrote', out)
} finally {
  await server.close()
}
