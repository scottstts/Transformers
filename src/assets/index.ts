import catalog from './catalog.json'

/**
 * Every file the game loads comes from the asset CDN through here: models,
 * the citadel, and whatever is added later. `catalog.json` lists each file's
 * size and content hash (tools/assets.mjs writes it from the local mirror,
 * assets/). A file's URL carries its hash, so a cache never serves an old
 * version after an upload, and its size is checked on arrival: a stale or
 * truncated file fails loudly instead of decoding garbage.
 *
 * `VITE_ASSET_BASE` overrides the CDN (`/local-assets` serves the mirror from
 * the dev server: an export can be played before it is uploaded).
 */
export type AssetFile = keyof typeof catalog.files

const BASE = (import.meta.env?.VITE_ASSET_BASE || catalog.base).replace(/\/$/, '')
/** Attempts per file, and the first backoff (s, tripled each time): the CDN is rate limited and networks drop. */
const ATTEMPTS = 3
const BACKOFF = 0.4

/** Downloads in flight, shared by everyone asking for the same file (finished ones are not kept). */
const inflight = new Map<AssetFile, Promise<ArrayBuffer>>()

/** Progress of one download: bytes so far and in all. */
export type AssetProgress = (loaded: number, total: number) => void

export function assetUrl(file: AssetFile): string {
  return `${BASE}/${file}?v=${catalog.files[file].sha256.slice(0, 16)}`
}

/** The file's bytes; `label` names it in errors. */
export function fetchAssetBytes(file: AssetFile, label: string = file, progress?: AssetProgress): Promise<ArrayBuffer> {
  let request = inflight.get(file)
  if (!request) {
    request = download(file, label, progress).finally(() => inflight.delete(file))
    inflight.set(file, request)
  }
  return request
}

/** The file parsed as JSON. */
export async function fetchAssetJson<T>(file: AssetFile, label: string = file): Promise<T> {
  const bytes = await fetchAssetBytes(file, label)
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T
  } catch (error) {
    throw new Error(`${label}: invalid JSON in ${file} (${(error as Error).message})`, { cause: error })
  }
}

async function download(file: AssetFile, label: string, progress?: AssetProgress): Promise<ArrayBuffer> {
  const expected = catalog.files[file].bytes
  const url = assetUrl(file)
  let failure = ''
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    let retry = true
    try {
      const response = await fetch(url)
      if (response.ok) {
        const bytes = await read(response, expected, progress)
        if (bytes.byteLength === expected) return bytes
        failure = `${bytes.byteLength} bytes, the catalog says ${expected} (stale upload or cut off)`
      } else {
        failure = `HTTP ${response.status}`
        // a missing or forbidden file stays so; a server fault or the rate limit may pass
        retry = response.status >= 500 || response.status === 429
      }
    } catch (error) {
      failure = (error as Error).message || 'network error'
    }
    if (!retry || attempt === ATTEMPTS) break
    await new Promise((resolve) => setTimeout(resolve, BACKOFF * 3 ** (attempt - 1) * 1000))
  }
  throw new Error(`${label}: could not load ${file} from ${BASE} (${failure})`)
}

/** The response body, reporting progress as it streams in when asked. */
async function read(response: Response, total: number, progress?: AssetProgress): Promise<ArrayBuffer> {
  if (!progress || !response.body) return response.arrayBuffer()
  const out = new Uint8Array(total)
  const reader = response.body.getReader()
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    // more than the catalog's size: a different file; let the size check say so
    if (loaded + value.byteLength > total) return concat(out.subarray(0, loaded), value, reader)
    out.set(value, loaded)
    loaded += value.byteLength
    progress(loaded, total)
  }
  return loaded === total ? out.buffer : out.slice(0, loaded).buffer
}

async function concat(head: Uint8Array, value: Uint8Array, reader: ReadableStreamDefaultReader<Uint8Array>): Promise<ArrayBuffer> {
  const parts = [head, value]
  for (;;) {
    const { done, value: next } = await reader.read()
    if (done) break
    parts.push(next)
  }
  return new Blob(parts as BlobPart[]).arrayBuffer()
}

/** `file` as a catalogued asset; throws for a file the catalog does not list. */
export function assetFile(file: string): AssetFile {
  if (!Object.hasOwn(catalog.files, file)) throw new Error(`${file} is not in the asset catalog (src/assets/catalog.json)`)
  return file as AssetFile
}

/** A model exported as `<name>.json` (its manifest) and `<name>.bin` (its buffers), fetched together. */
export async function fetchModel<T>(name: string, label: string): Promise<{ manifest: T; buffer: ArrayBuffer }> {
  const [manifest, buffer] = await Promise.all([fetchAssetJson<T>(assetFile(`${name}.json`), label), fetchAssetBytes(assetFile(`${name}.bin`), label)])
  return { manifest, buffer }
}
