// The game's assets live on the CDN (src/assets/catalog.json `base`), mirrored locally in assets/
// (gitignored): Blender exports write there, tests and tools read there.
//
//   node tools/assets.mjs pull [--force]   download every catalog file the mirror lacks or holds stale
//   node tools/assets.mjs catalog          hash the mirror into src/assets/catalog.json (after an export)
//   node tools/assets.mjs status           mirror files that differ from the catalog (what to upload)
//   node tools/assets.mjs verify           download every catalog file from the CDN and check its hash
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const MIRROR = path.join(ROOT, 'assets')
const CATALOG = path.join(ROOT, 'src', 'assets', 'catalog.json')
const ATTEMPTS = 3

export function readCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG, 'utf8'))
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** The file's bytes from the CDN, retried on network errors and server faults. */
async function download(base, file) {
  let last
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`${base}/${file}`)
      if (response.ok) return Buffer.from(await response.arrayBuffer())
      last = new Error(`${file}: HTTP ${response.status}`)
      if (response.status < 500 && response.status !== 429) break
    } catch (error) {
      last = error
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * 3 ** (attempt - 1)))
  }
  throw last
}

function localHash(file) {
  const p = path.join(MIRROR, file)
  return fs.existsSync(p) ? sha256(fs.readFileSync(p)) : null
}

/** Download the catalog's files the mirror lacks (or holds with another hash); returns how many were fetched. */
export async function pull({ force = false, log = console.log } = {}) {
  const { base, files } = readCatalog()
  fs.mkdirSync(MIRROR, { recursive: true })
  let fetched = 0
  for (const [file, entry] of Object.entries(files)) {
    if (!force && localHash(file) === entry.sha256) continue
    const bytes = await download(base, file)
    const hash = sha256(bytes)
    if (hash !== entry.sha256) throw new Error(`${file} on the CDN does not match the catalog (${hash.slice(0, 12)} vs ${entry.sha256.slice(0, 12)}): upload the mirror's file, or run catalog`)
    fs.writeFileSync(path.join(MIRROR, file), bytes)
    log(`pulled ${file} (${(bytes.length / 1e6).toFixed(2)} MB)`)
    fetched++
  }
  return fetched
}

function catalog() {
  const current = readCatalog()
  const files = {}
  for (const file of fs.readdirSync(MIRROR).filter((f) => !f.startsWith('.')).sort()) {
    const bytes = fs.readFileSync(path.join(MIRROR, file))
    files[file] = { bytes: bytes.length, sha256: sha256(bytes) }
  }
  for (const file of Object.keys(current.files)) if (!files[file]) console.warn(`${file} is in the catalog but not in the mirror: dropped`)
  fs.writeFileSync(CATALOG, JSON.stringify({ base: current.base, files }, null, 2) + '\n')
  console.log(`catalog: ${Object.keys(files).length} files`)
}

function status() {
  const { files } = readCatalog()
  let changed = 0
  for (const [file, entry] of Object.entries(files)) {
    const hash = localHash(file)
    if (hash === entry.sha256) continue
    console.log(`${hash ? 'differs' : 'missing'}  ${file}`)
    changed++
  }
  for (const file of fs.existsSync(MIRROR) ? fs.readdirSync(MIRROR) : []) {
    if (!file.startsWith('.') && !files[file]) { console.log(`uncatalogued  ${file}`); changed++ }
  }
  console.log(changed ? `${changed} differ from the catalog` : 'mirror matches the catalog')
}

async function verify() {
  const { base, files } = readCatalog()
  let bad = 0
  for (const [file, entry] of Object.entries(files)) {
    try {
      const hash = sha256(await download(base, file))
      if (hash !== entry.sha256) { console.log(`stale    ${file}`); bad++ }
    } catch (error) {
      console.log(`missing  ${file} (${error.message})`)
      bad++
    }
  }
  console.log(bad ? `${bad} of ${Object.keys(files).length} not as catalogued on ${base}` : `CDN matches the catalog (${Object.keys(files).length} files)`)
  if (bad) process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, flag] = process.argv.slice(2)
  if (command === 'pull') console.log(`${await pull({ force: flag === '--force' })} files pulled`)
  else if (command === 'catalog') catalog()
  else if (command === 'status') status()
  else if (command === 'verify') await verify()
  else {
    console.error('usage: node tools/assets.mjs pull [--force] | catalog | status | verify')
    process.exitCode = 1
  }
}
