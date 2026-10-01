// vite.config.js
import { createReadStream, existsSync, statSync } from 'node:fs'
import { join, normalize } from 'node:path'
import { defineConfig } from 'vite'

const MIRROR = join(import.meta.dirname, 'assets')

/**
 * `/local-assets/<file>` serves the local asset mirror in development, so an
 * export can be played before it is uploaded: `VITE_ASSET_BASE=/local-assets npm run dev`.
 */
const localAssets = {
  name: 'local-assets',
  configureServer(server) {
    server.middlewares.use('/local-assets', (req, res, next) => {
      const file = normalize(join(MIRROR, decodeURIComponent((req.url ?? '').split('?')[0])))
      if (!file.startsWith(MIRROR) || !existsSync(file) || !statSync(file).isFile()) return next()
      res.setHeader('Content-Length', statSync(file).size)
      res.setHeader('Cache-Control', 'no-store')
      createReadStream(file).pipe(res)
    })
  },
}

export default defineConfig({
  plugins: [localAssets],
  server: {
    allowedHosts: true
  },
  test: {
    globalSetup: ['./tests/support/pull-assets.ts'],
  },
})
