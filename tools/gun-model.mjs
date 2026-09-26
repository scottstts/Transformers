// Fits the Semi's gun sounds (src/content/semi/audio/gun.ts) to two recordings, a machine-gun burst and a
// cannon shot: spectral-envelope models (level over time in third-octave bands, plus any ringing partials)
// written to src/content/semi/audio/gun-models.ts. The game synthesises fresh takes from the models
// (src/audio/spectral.ts); nothing of the recordings is shipped.
//
//   shot    one period of the burst from a shot's onset (averaged over the burst's inner shots, so it
//           carries the previous shots' tails as the recording does): tiled at the recorded rate it is
//           the burst
//   tail    the burst's decay after its last period
//   cannon  the cannon shot from its onset to the end of its roll
//
// Usage: node tools/gun-model.mjs <machine_gun.mp3> <cannon.mp3>            (needs ffmpeg)
//        node tools/gun-model.mjs --compare <machine_gun.mp3> <cannon.mp3>  (band-envelope error of a take)
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { createServer } from 'vite'

const SR = 48000
const args = process.argv.slice(2)
const compare = args[0] === '--compare'
const [gunFile, cannonFile] = compare ? args.slice(1) : args
/** band centres: third octaves 31.5 Hz .. 16 kHz */
const BANDS = Array.from({ length: 28 }, (_, k) => 31.5 * 2 ** (k / 3))
const Q = 4.32
const SHOT_TIMES = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 21, 25, 30, 35, 40, 46, 52, 58, 64, 70, 76, 82]
/** a shot's take runs this far past its period, fading, under the next shot's onset (s) */
const SHOT_OVERLAP = 0.004
const TAIL_TIMES = [0, 10, 20, 30, 40, 55, 70, 85, 100, 120, 140, 160, 180, 200]
const CANNON_TIMES = [0, 3, 6, 10, 15, 20, 30, 40, 55, 70, 90, 110, 135, 160, 190, 220, 260, 300, 350, 400, 460, 530, 610,
  700, 800, 920, 1050, 1200, 1350, 1500, 1700, 1900, 2150, 2400, 2700, 3000, 3400, 3800, 4300, 4800, 5300]

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

/** RMS of y (dB) around each grid time after `start`: a window of 4 ms, two periods of the band or 8 % of the time, the longest. */
function envelope(y, start, f, times) {
  return times.map((ms) => {
    const half = Math.round(Math.max(0.004, 2 / f, ms * 0.08 / 1000) * SR / 2)
    const c = start + Math.round(ms / 1000 * SR)
    let s = 0, n = 0
    for (let i = Math.max(0, c - half); i < Math.min(y.length, c + half); i++) { s += y[i] * y[i]; n++ }
    return 10 * Math.log10(s / Math.max(1, n) + 1e-14)
  })
}

/**
 * Onsets: the peaks of the 5 ms level within 8 dB of the loudest, 60 ms apart at least, each walked back
 * to where its rise begins (the first millisecond within 12 dB of the peak, then its first sample over a
 * tenth of the peak's amplitude).
 */
function onsets(x) {
  const w = SR / 1000
  const lv = []
  for (let i = 0; i + w <= x.length; i += w) {
    let s = 0
    for (let j = i; j < i + w; j++) s += x[j] * x[j]
    lv.push(s / w)
  }
  const smooth = lv.map((_, k) => {
    let s = 0, n = 0
    for (let j = Math.max(0, k - 2); j <= Math.min(lv.length - 1, k + 2); j++) { s += lv[j]; n++ }
    return 10 * Math.log10(s / n + 1e-14)
  })
  const db = lv.map((v) => 10 * Math.log10(v + 1e-14))
  const top = Math.max(...smooth)
  const peaks = []
  for (let k = 1; k < smooth.length - 1; k++) {
    if (smooth[k] < top - 8 || smooth[k] < smooth[k - 1] || smooth[k] < smooth[k + 1]) continue
    if (peaks.length && k - peaks.at(-1) < 60) {
      if (smooth[k] > smooth[peaks.at(-1)]) peaks[peaks.length - 1] = k
      continue
    }
    peaks.push(k)
  }
  return peaks.map((p) => {
    let k = p
    while (k > 0 && db[k - 1] > db[p] - 12 && p - k < 15) k--
    let peak = 0
    for (let j = k * w; j < (p + 1) * w; j++) peak = Math.max(peak, Math.abs(x[j]))
    let i = k * w
    while (Math.abs(x[i]) < peak * 0.1) i++
    return i
  })
}

/** The first onset: the first millisecond within 20 dB of the loudest, then its first sample over a tenth of the amplitude around it. */
function firstOnset(x) {
  const w = SR / 1000
  let top = 0
  for (const v of x) top = Math.max(top, Math.abs(v))
  let i = 0
  while (Math.abs(x[i]) < top * 0.1) i++
  let peak = 0
  for (let j = i; j < i + 3 * w; j++) peak = Math.max(peak, Math.abs(x[j]))
  i = Math.max(0, i - w)
  while (Math.abs(x[i]) < peak * 0.1) i++
  return i
}

/** Band envelopes (dB) of each window start, averaged in power. */
function bandModel(x, starts, times) {
  return BANDS.map((f) => {
    const y = bandpass(x, f, Q)
    const envs = starts.map((s) => envelope(y, s, f, times))
    return times.map((_, k) => 10 * Math.log10(envs.reduce((a, e) => a + 10 ** (e[k] / 10), 0) / envs.length))
  })
}

function normalise(bands) {
  let top = -Infinity
  for (const e of bands) for (const v of e) top = Math.max(top, v)
  return bands.map((e) => e.map((v) => Math.round((v - top) * 2) / 2))
}

/**
 * Refine a model until its synthesis measures like the recording: the band filters overlap, so a band's
 * measured level includes its neighbours' noise, and the raw fit comes out hot where the spectrum is dense.
 */
function refine(ref, grid, synthesise) {
  const measure = (m) => {
    const runs = [0, 1, 2].map((s) => bandModel(synthesise(m, grid, 1234 + s * 77, SR, null), [0], grid.times))
    return ref.bands.map((e, b) => e.map((_, k) => 10 * Math.log10(runs.reduce((a, r) => a + 10 ** (r[b][k] / 10), 0) / runs.length)))
  }
  const counts = (b, k) => ref.bands[b][k] > -40 && ref.bands[b][k] > Math.max(...ref.bands[b]) - 30
  const m = JSON.parse(JSON.stringify(ref))
  let best = null, bestErr = Infinity
  for (let pass = 0; pass < 7; pass++) {
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

function fit() {
  const gun = decode(gunFile)
  const shots = onsets(gun)
  console.log(`  onsets (ms): ${shots.map((s) => Math.round(s / SR * 1000)).join(" ")}`)
  const periods = shots.slice(1).map((s, i) => (s - shots[i]) / SR)
  const period = periods.reduce((a, p) => a + p, 0) / periods.length
  console.log(`machine gun: ${shots.length} shots, period ${(period * 1000).toFixed(1)} ms (${(60 / period).toFixed(0)} rounds/min), jitter ${(Math.max(...periods.map((p) => Math.abs(p - period))) * 1000).toFixed(1)} ms`)
  const inner = shots.slice(1, -1)
  const shot = { bands: normalise(bandModel(gun, inner, SHOT_TIMES)), partials: [] }
  const tail = { bands: normalise(bandModel(gun, [shots.at(-1) + Math.round(period * SR)], TAIL_TIMES)), partials: [] }
  const cannon = decode(cannonFile)
  const start = firstOnset(cannon)
  console.log(`cannon: onset at ${(start / SR * 1000).toFixed(0)} ms`)
  const blast = { bands: normalise(bandModel(cannon, [start], CANNON_TIMES)), partials: [] }
  return { period, shot, tail, blast, tailSeconds: (gun.length - shots.at(-1)) / SR - period }
}

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
try {
  const { synthesise } = await server.ssrLoadModule('/src/audio/spectral.ts')
  const f = fit()
  const grids = {
    shot: { bands: BANDS, times: SHOT_TIMES, seconds: f.period + SHOT_OVERLAP, q: Q, fadeOut: SHOT_OVERLAP },
    tail: { bands: BANDS, times: TAIL_TIMES, seconds: Math.min(0.2, f.tailSeconds), q: Q },
    blast: { bands: BANDS, times: CANNON_TIMES, seconds: 5.3, q: Q },
  }
  if (compare) {
    const { gunTake } = await server.ssrLoadModule('/src/content/semi/audio/gun-bank.ts')
    for (const name of ['shot', 'tail', 'blast']) {
      const ref = f[name]
      const syn = normalise(bandModel(gunTake(name, 0, SR), [0], grids[name].times))
      let err = 0, n = 0
      ref.bands.forEach((e, b) => e.forEach((v, k) => { if (v > -40) { const d = syn[b][k] - v; err += d * d; n++ } }))
      console.log(`${name}: rms ${Math.sqrt(err / n).toFixed(1)} dB`)
    }
  } else {
    const out = {}
    for (const name of ['shot', 'tail', 'blast']) {
      console.log(name)
      out[name] = refine(f[name], grids[name], synthesise)
    }
    const rows = (m) => m.bands.map((e) => `      [${e.join(', ')}],`).join('\n')
    writeFileSync('src/content/semi/audio/gun-models.ts', `// Generated by tools/gun-model.mjs from recordings (a machine-gun burst, a cannon shot): do not edit by hand.
// Levels in dB (relative to each sound's loudest band) on each model's times (ms) in the third-octave GUN_BANDS (Hz).
import type { SpectralModel } from '../../../audio/spectral'

export const GUN_BANDS = [${BANDS.map((b) => b.toFixed(1)).join(', ')}]
/** the burst's rate: one shot every GUN_PERIOD s (${(60 / f.period).toFixed(0)} rounds a minute) */
export const GUN_PERIOD = ${f.period.toFixed(5)}
export const SHOT_TIMES = [${SHOT_TIMES.join(', ')}]
/** a shot's take runs past its period by this much (s), fading under the next shot's onset */
export const SHOT_OVERLAP = ${SHOT_OVERLAP}
export const TAIL_TIMES = [${TAIL_TIMES.join(', ')}]
export const TAIL_SECONDS = ${grids.tail.seconds.toFixed(3)}
export const BLAST_TIMES = [${CANNON_TIMES.join(', ')}]
export const BLAST_SECONDS = ${grids.blast.seconds}

export const GUN_MODELS: Record<'shot' | 'tail' | 'blast', SpectralModel> = {
${['shot', 'tail', 'blast'].map((name) => `  ${name}: {\n    bands: [\n${rows(out[name])}\n    ],\n    partials: [],\n  },`).join('\n')}
}
`)
    console.log('wrote src/content/semi/audio/gun-models.ts')
  }
} finally {
  await server.close()
}
process.exit(0)
