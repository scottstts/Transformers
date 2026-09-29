// Fits the Bat's spear sounds (src/content/bat/combat/audio/spear.ts) to two recordings, a spear's thrust
// and a slash: spectral-envelope models (level over time in third-octave bands, plus the partials the
// slash's blade rings with) written to src/content/bat/combat/audio/spear-models.ts. The game synthesises
// fresh takes from the models (src/audio/spectral.ts); nothing of the recordings is shipped.
//
//   poke   the thrust from the start of its rising rush to the end of its thud
//   slash  the cut from the start of its rush through the blade's ring
//
// Usage: node tools/spear-model.mjs <spear_poke.mp3> <spear_slash.mp3>            (needs ffmpeg)
//        node tools/spear-model.mjs --compare <spear_poke.mp3> <spear_slash.mp3>  (band-envelope error of a take)
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { createServer } from 'vite'

const SR = 48000
const args = process.argv.slice(2)
const compare = args[0] === '--compare'
const [pokeFile, slashFile] = compare ? args.slice(1) : args
/** band centres: third octaves 31.5 Hz .. 16 kHz */
const BANDS = Array.from({ length: 28 }, (_, k) => 31.5 * 2 ** (k / 3))
const Q = 4.32
/** a partial is measured through a narrow band this sharp */
const PARTIAL_Q = 36
const POKE_TIMES = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 195, 210, 230, 250, 275, 300, 330]
const SLASH_TIMES = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 115, 130, 145, 160, 175, 190, 205, 220, 240, 260, 285, 310, 340, 370, 400,
  440, 480, 520, 560, 600, 650, 700]
/** the level (dB under the loudest 5 ms) where a take starts on the rising rush, and where it has died away */
const START_BELOW = 42
const END_BELOW = 44
/** ringing partials: spectral peaks this far (dB) over their neighbourhood after the rush */
const RING_PROMINENCE = 16

function decode(path) {
  const raw = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', path, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 })
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4)
}

function bandpass(x, f, q) {
  const w = 2 * Math.PI * f / SR, alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha
  const b0 = alpha / a0, b2 = -alpha / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - alpha) / a0
  const y = new Float32Array(x.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v }
  return y
}

/** RMS of y (dB) around each grid time after `start`: a window of 6 ms, two periods of the band or 8 % of the time, the longest. */
function envelope(y, start, f, times) {
  return times.map((ms) => {
    const half = Math.round(Math.max(0.006, 2 / f, ms * 0.08 / 1000) * SR / 2)
    const c = start + Math.round(ms / 1000 * SR)
    let s = 0, n = 0
    for (let i = Math.max(0, c - half); i < Math.min(y.length, c + half); i++) { s += y[i] * y[i]; n++ }
    return 10 * Math.log10(s / Math.max(1, n) + 1e-14)
  })
}

/** 5 ms levels (dB) of the recording. */
function levels(x) {
  const w = Math.round(SR * 0.005)
  const out = []
  for (let i = 0; i + w <= x.length; i += w) {
    let s = 0
    for (let j = i; j < i + w; j++) s += x[j] * x[j]
    out.push(10 * Math.log10(s / w + 1e-14))
  }
  return out
}

/** The event: from where the rush first rises within START_BELOW dB of the loudest to where it has fallen END_BELOW under it; and the loudest moment. */
function span(x) {
  const lv = levels(x)
  let top = -Infinity, peak = 0
  lv.forEach((v, k) => { if (v > top) { top = v; peak = k } })
  let a = peak
  while (a > 0 && lv[a - 1] > top - START_BELOW) a--
  let b = peak
  while (b < lv.length - 1 && lv[b + 1] > top - END_BELOW) b++
  const w = SR * 0.005
  return { start: a * w, end: (b + 1) * w, peak: (peak - a) * 5 }
}

/** Spectral peaks of the recording from `from` for `len` s standing RING_PROMINENCE dB over their neighbourhood (Hz). */
function rings(x, from, len) {
  const N = Math.round(len * SR)
  const out = []
  for (let f = 150; f < 9000; f *= 1.004) {
    const w = 2 * Math.PI * f / SR
    let re = 0, im = 0
    for (let i = 0; i < N; i++) {
      const h = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)
      const v = x[from + i] * h
      re += v * Math.cos(w * i)
      im -= v * Math.sin(w * i)
    }
    out.push([f, 10 * Math.log10((re * re + im * im) / N + 1e-14)])
  }
  const peaks = []
  for (let i = 0; i < out.length; i++) {
    let lo = Infinity, top = true
    for (let j = Math.max(0, i - 12); j < Math.min(out.length, i + 12); j++) {
      if (out[j][1] > out[i][1]) top = false
      lo = Math.min(lo, out[j][1])
    }
    if (top && out[i][1] - lo > RING_PROMINENCE) peaks.push(out[i])
  }
  // the loudest few, strongest first
  return peaks.sort((a, b) => b[1] - a[1]).slice(0, 6).map(([f]) => Math.round(f))
}

function model(x, times, withRings) {
  const { start, end, peak } = span(x)
  const bands = BANDS.map((f) => envelope(bandpass(x, f, Q), start, f, times))
  // a narrow band passes the broadband noise round a partial too (its share of the third-octave's bandwidth):
  // take that power off, so the partial carries only the tone that rings over the noise
  const share = Q / PARTIAL_Q
  const partials = withRings
    ? rings(x, start + Math.round((peak / 1000 + 0.12) * SR), 0.25).map((f) => {
      const narrow = envelope(bandpass(x, f, PARTIAL_Q), start, f, times)
      const wide = envelope(bandpass(x, f, Q), start, f, times)
      const tone = narrow.map((v, k) => 10 * Math.log10(Math.max(10 ** (v / 10) - share * 10 ** (wide[k] / 10), 10 ** ((v - 30) / 10))))
      // the subtraction is noisy point to point: a running median over three, so the ring swells and decays smoothly
      return { f, env: tone.map((_, k) => [tone[Math.max(0, k - 1)], tone[k], tone[Math.min(tone.length - 1, k + 1)]].sort((p, q) => p - q)[1]) }
    })
    : []
  let top = -Infinity
  for (const e of bands) for (const v of e) top = Math.max(top, v)
  const norm = (e) => e.map((v) => Math.round((v - top) * 2) / 2)
  return { m: { bands: bands.map(norm), partials: partials.map((p) => ({ f: p.f, env: norm(p.env) })) }, seconds: (end - start) / SR, peak }
}

function bandModel(x, times) {
  return BANDS.map((f) => envelope(bandpass(x, f, Q), 0, f, times))
}

/** Refine a model until its synthesis measures like the recording (the band filters overlap, so a raw fit comes out hot where the spectrum is dense). */
function refine(ref, grid, synthesise) {
  const measure = (m) => {
    const runs = [0, 1, 2].map((s) => bandModel(synthesise(m, grid, 4321 + s * 77, SR, null), grid.times))
    return ref.bands.map((e, b) => e.map((_, k) => 10 * Math.log10(runs.reduce((a, r) => a + 10 ** (r[b][k] / 10), 0) / runs.length)))
  }
  const counts = (b, k) => ref.bands[b][k] > -40 && ref.bands[b][k] > Math.max(...ref.bands[b]) - 30
  const m = JSON.parse(JSON.stringify(ref))
  let best = null, bestErr = Infinity
  for (let pass = 0; pass < 8; pass++) {
    const syn = measure(m)
    let off = 0, n = 0
    ref.bands.forEach((e, b) => e.forEach((v, k) => { if (counts(b, k)) { off += syn[b][k] - v; n++ } }))
    off /= n
    let err = 0
    ref.bands.forEach((e, b) => e.forEach((v, k) => {
      const d = syn[b][k] - off - v
      if (counts(b, k)) {
        err += d * d
        m.bands[b][k] = Math.round((m.bands[b][k] - Math.max(-4, Math.min(4, 0.7 * d))) * 2) / 2
      }
    }))
    const rms = Math.sqrt(err / n)
    console.log(`  pass ${pass}: rms ${rms.toFixed(2)} dB`)
    if (rms < bestErr) { bestErr = rms; best = JSON.parse(JSON.stringify(m)) }
  }
  return best
}

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
try {
  const { synthesise } = await server.ssrLoadModule('/src/audio/spectral.ts')
  const poke = model(decode(pokeFile), POKE_TIMES, false)
  const slash = model(decode(slashFile), SLASH_TIMES, true)
  console.log(`poke: ${(poke.seconds * 1000).toFixed(0)} ms, loudest at ${poke.peak} ms`)
  console.log(`slash: ${(slash.seconds * 1000).toFixed(0)} ms, loudest at ${slash.peak} ms, partials ${slash.m.partials.map((p) => p.f).join(' ')} Hz`)
  const grids = {
    poke: { bands: BANDS, times: POKE_TIMES, seconds: poke.seconds, q: Q },
    slash: { bands: BANDS, times: SLASH_TIMES, seconds: slash.seconds, q: Q },
  }
  if (compare) {
    const { spearTake } = await server.ssrLoadModule('/src/content/bat/combat/audio/spear-bank.ts')
    for (const [name, ref] of [['poke', poke.m], ['slash', slash.m]]) {
      const syn = bandModel(spearTake(name, 0, SR), grids[name].times)
      let top = -Infinity
      for (const e of syn) for (const v of e) top = Math.max(top, v)
      let err = 0, n = 0
      ref.bands.forEach((e, b) => e.forEach((v, k) => { if (v > -40) { const d = syn[b][k] - top - v; err += d * d; n++ } }))
      console.log(`${name}: rms ${Math.sqrt(err / n).toFixed(1)} dB`)
    }
  } else {
    console.log('poke')
    const pokeFit = refine(poke.m, grids.poke, synthesise)
    console.log('slash')
    const slashFit = refine(slash.m, grids.slash, synthesise)
    const rows = (m) => m.bands.map((e) => `      [${e.join(', ')}],`).join('\n')
    const parts = (m) => m.partials.map((p) => `      { f: ${p.f}, env: [${p.env.join(', ')}] },`).join('\n')
    const entry = (name, m) => `  ${name}: {\n    bands: [\n${rows(m)}\n    ],\n    partials: [${m.partials.length ? `\n${parts(m)}\n    ` : ''}],\n  },`
    writeFileSync('src/content/bat/combat/audio/spear-models.ts', `// Generated by tools/spear-model.mjs from recordings (a spear's thrust, a slash): do not edit by hand.
// Levels in dB (relative to each sound's loudest band) on each model's times (ms) in the third-octave SPEAR_BANDS (Hz).
import type { SpectralModel } from '../../../../audio/spectral'

export const SPEAR_BANDS = [${BANDS.map((b) => b.toFixed(1)).join(', ')}]
export const POKE_TIMES = [${POKE_TIMES.join(', ')}]
export const POKE_SECONDS = ${poke.seconds.toFixed(3)}
/** the thrust's loudest moment from the take's start (s): the thud as it goes home */
export const POKE_PEAK = ${(poke.peak / 1000).toFixed(3)}
export const SLASH_TIMES = [${SLASH_TIMES.join(', ')}]
export const SLASH_SECONDS = ${slash.seconds.toFixed(3)}
/** the cut's loudest moment from the take's start (s): the blade passing */
export const SLASH_PEAK = ${(slash.peak / 1000).toFixed(3)}

export const SPEAR_MODELS: Record<'poke' | 'slash', SpectralModel> = {
${entry('poke', pokeFit)}
${entry('slash', slashFit)}
}
`)
    console.log('wrote src/content/bat/combat/audio/spear-models.ts')
  }
} finally {
  await server.close()
}
process.exit(0)
