// Draws the fortress plan top-down as an SVG (fort frame, +z up the page): walls, the rampart, gates, every
// module's footprint by kind, yards, posts and their beats, spawn doors, and the reserved ground if asked.
// Usage: node tools/fort-map.mjs <out.svg>
import { writeFileSync } from 'node:fs'
import { createServer } from 'vite'

const [out = 'fort-map.svg'] = process.argv.slice(2)
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
try {
  const L = await server.ssrLoadModule('/src/worlds/desert/fort/layout.ts')
  const P = await server.ssrLoadModule('/src/worlds/desert/fort/plan.ts')
  // capture the reserved rectangles as the layout takes them
  const reserved = []
  const reserve = L.Layout.prototype.reserve
  L.Layout.prototype.reserve = function (at, yaw, w, d) { reserved.push({ at, yaw, w, d }); return reserve.call(this, at, yaw, w, d) }
  const plan = P.planFort(P.FORT_SITES[0])
  const S = 3, pad = 20
  const xs = plan.corners.map((c) => c[0]), zs = plan.corners.map((c) => c[1])
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, z0 = Math.min(...zs) - pad, z1 = Math.max(...zs) + pad
  const X = (x) => ((x - x0) * S).toFixed(1), Z = (z) => ((z1 - z) * S).toFixed(1)
  const poly = (pts, attrs) => `<polygon points="${pts.map((p) => `${X(p[0])},${Z(p[1])}`).join(' ')}" ${attrs}/>`
  const rect = (at, yaw, w, d, attrs) => {
    const c = Math.cos(yaw), s = Math.sin(yaw)
    const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => [at[0] + x * c + z * s, at[1] - x * s + z * c])
    return poly(pts, attrs)
  }
  const colour = { garage: '#c84', keep: '#933', hangar: '#48c', radar: '#eee', apron: '#999', tower: '#555', helipad: '#bbb', bund: '#a86', tank: '#dc6', chu: '#dca', hq: '#b97', container: '#a53', canopy: '#789', gatehouse: '#733', pillar: '#444', stair: '#666', flagpole: '#f00', mast: '#ff0' }
  const parts = [`<rect width="100%" height="100%" fill="#d8c8a8"/>`]
  parts.push(poly(plan.corners, 'fill="#e6d9bd" stroke="#444" stroke-width="2"'))
  parts.push(poly(plan.citadel, 'fill="#d0c2a4" stroke="#222" stroke-width="3"'))
  for (const r of reserved) parts.push(rect(r.at, r.yaw, r.w, r.d, 'fill="#6a6" fill-opacity="0.15" stroke="#6a6" stroke-dasharray="4 3"'))
  for (const s of plan.sectors) parts.push(`<circle cx="${X(s.yard.at[0])}" cy="${Z(s.yard.at[1])}" r="${s.yard.r * S}" fill="#f80" fill-opacity="0.12" stroke="#f80"/>`,
    `<text x="${X(s.yard.at[0])}" y="${Z(s.yard.at[1])}" font-size="16" text-anchor="middle">${s.index} ${s.role}</text>`)
  for (const w of plan.walls) parts.push(`<line x1="${X(w.a[0])}" y1="${Z(w.a[1])}" x2="${X(w.b[0])}" y2="${Z(w.b[1])}" stroke="${w.wire ? '#222' : '#555'}" stroke-width="4"/>`)
  for (const m of plan.modules) parts.push(rect(m.at, m.yaw, Math.max(0.6, m.size[0]), Math.max(0.6, m.size[2]), `fill="${colour[m.kind] ?? '#777'}" fill-opacity="${m.kind === 'apron' ? 0.35 : 0.85}" stroke="#222" stroke-width="0.5"`))
  for (const h of plan.hangars) parts.push(rect(h.at, h.yaw, h.width, h.length, `fill="${colour.hangar}" stroke="#222"`))
  for (const g of plan.gates) parts.push(`<circle cx="${X(g.at[0])}" cy="${Z(g.at[1])}" r="5" fill="#0a0"/>`, `<line x1="${X(g.inside[0])}" y1="${Z(g.inside[1])}" x2="${X(g.outside[0])}" y2="${Z(g.outside[1])}" stroke="#0a0" stroke-width="2"/>`)
  for (const p of plan.posts) parts.push(`<polyline points="${p.beat.map((b) => `${X(b[0])},${Z(b[1])}`).join(' ')}" fill="none" stroke="#06c" stroke-width="1"/>`, `<circle cx="${X(p.at[0])}" cy="${Z(p.at[1])}" r="2.5" fill="#06c"/>`)
  for (const s of plan.spawns) parts.push(`<line x1="${X(s.at[0])}" y1="${Z(s.at[1])}" x2="${X(s.exit[0])}" y2="${Z(s.exit[1])}" stroke="#c0c" stroke-width="3"/>`)
  for (const s of plan.segments) parts.push(`<line x1="${X(s.ax)}" y1="${Z(s.az)}" x2="${X(s.bx)}" y2="${Z(s.bz)}" stroke="#f00" stroke-opacity="0.35" stroke-width="${Math.max(1, s.r * 2 * S)}" stroke-linecap="round"/>`)
  for (const c of plan.circles) parts.push(`<circle cx="${X(c.x)}" cy="${Z(c.z)}" r="${c.r * S}" fill="#f00" fill-opacity="0.35"/>`)
  writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" width="${((x1 - x0) * S).toFixed(0)}" height="${((z1 - z0) * S).toFixed(0)}">${parts.join('')}</svg>`)
  console.log('wrote', out)
} finally {
  await server.close()
}
process.exit(0)
