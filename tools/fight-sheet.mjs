// Headless contact sheet of a fighting combo (Dawn WebGPU in Node, no browser).
// Usage: node tools/fight-sheet.mjs <out> [car] [clicks] [from:to:count] [views] [zoom]   (writes <out>-<view>.png)
//   clicks: comma-separated click times (s), e.g. 0,0.6,1.3,2.5; F<t> plays the special at t (frames are then in the world's clock)
//   frames: from:to:count evenly spaced frame times, or a comma-separated list
//   clicks may also hold guard windows: G<t0>-<t1>; BRAWL=<fort index> fights that fort's garrison in its yard
//   GAIT=walk|run walks or runs straight ahead instead of fighting
//   views:  comma-separated: side | right | front | back | quarter | low | top | director (the special's own camera)
import { createServer } from 'vite'

globalThis.self = globalThis
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

const [out = 'fight', car = 'cybertruck', clicks = '0', span = '0:1:8', views = 'side', zoom = '1'] = process.argv.slice(2)
const frames = span.includes(':')
  ? (() => {
      const [a, b, n] = span.split(':').map(Number)
      return Array.from({ length: n }, (_, i) => a + (b - a) * (n > 1 ? i / (n - 1) : 0))
    })()
  : span.split(',').map(Number)
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
try {
  const { renderFightSheet } = await server.ssrLoadModule('/tools/preview/fight.ts')
  await renderFightSheet(out, { car, clicks: clicks.split(',').filter(Boolean), frames, views: views.split(','), zoom: Number(zoom), brawl: process.env.BRAWL === undefined ? undefined : Number(process.env.BRAWL) })
} finally {
  await server.close()
}
process.exit(0)
