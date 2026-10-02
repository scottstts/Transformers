// Dev-only offline capture. Nothing in src/ imports this entry point.
// zsh -ic 'node tools/citadel-film.mjs'
// zsh -ic 'node tools/citadel-film.mjs --preview /tmp/citadel-film-preview'
import { createServer } from 'vite'

globalThis.self = globalThis
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
const preview = process.argv.includes('--preview')
const lastShot = process.argv.includes('--last-shot')
const output = process.argv.slice(2).find((arg) => !arg.startsWith('--'))
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
try {
  const { renderCitadelFilm } = await server.ssrLoadModule('/tools/preview/citadel-film.ts')
  await renderCitadelFilm(output ?? (preview ? '/tmp/citadel-film-preview' : 'assets/citadel-cinematic.mp4'), preview, lastShot)
} finally {
  await server.close()
}
process.exit(0)
