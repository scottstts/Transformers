// Fits the Roadster's sounds (src/content/roadster/audio/) to five recordings in ref_sounds/roadster:
// spectral-envelope models (level over time in third-octave bands, plus the low tones that ring under the
// blasts) for the one-shots, and steady spectra (plus their tones and how their level swells) for the loops,
// written to src/content/roadster/audio/sound-models.ts. The game synthesises fresh takes and loops from the
// models (src/audio/spectral.ts); nothing of the recordings is shipped.
//
//   shock      shock-wave-blast.mp3: the palm cannon's blast, a 36 Hz punch under a broadband roar
//   energy     energy-blast.mp3: the energy cannon's discharge, a 41 Hz body under a bright crackling wash
//   pass       fast-running.mp3: one pass of the sprint, a rising rush to the moment it goes by and its tail
//   explosion  explosion.mp3: Whiteout's impact, a deep blast (its body under 60 Hz) rolling on for two seconds
//   landing    landing.wav: the robot coming down at the end of its transformation, a heavy thump with a metal ring
//   distortion distortion-field.wav (loop): the fist's field, a sub rumble with a 50 Hz series of lines over it
//   propeller  propeller.mp3 (loop): the air pack's roar (the recording is band-limited to 4 kHz)
//
// Usage: node tools/roadster-sound-model.mjs                (reads ref_sounds/roadster, needs ffmpeg)
//        node tools/roadster-sound-model.mjs --compare      (band-envelope error of a take against each recording)
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { createServer } from 'vite'

const SR = 48000
const DIR = 'ref_sounds/roadster'
const compare = process.argv.includes('--compare')
/** band centres: third octaves 31.5 Hz .. 16 kHz */
const BANDS = Array.from({ length: 28 }, (_, k) => 31.5 * 2 ** (k / 3))
const Q = 4.32
/** a tone is measured through a narrow band this sharp */
const PARTIAL_Q = 36
/** tones: spectral peaks this far (dB) over their neighbourhood, between these frequencies */
const TONE_PROMINENCE = 9
const TONE_RANGE = [25, 1500]

const ONE_SHOTS = {
  shock: {
    file: 'shock-wave-blast.mp3', from: 'start', length: 2.3, tones: 4,
    times: [0, 10, 20, 30, 45, 60, 80, 100, 125, 150, 180, 210, 250, 300, 350, 400, 460, 520, 600, 700, 800, 950, 1100, 1300, 1500, 1750, 2000, 2300],
  },
  energy: {
    file: 'energy-blast.mp3', from: 'start', length: 2.6, tones: 6,
    times: [0, 10, 20, 30, 45, 60, 80, 100, 125, 150, 180, 210, 250, 300, 350, 400, 460, 520, 600, 700, 800, 950, 1100, 1300, 1500, 1750, 2000, 2300, 2600],
  },
  explosion: {
    file: 'explosion.mp3', from: 'start', length: 2.6, tones: 3,
    times: [0, 10, 20, 30, 45, 60, 80, 100, 125, 150, 180, 210, 250, 300, 350, 400, 460, 520, 600, 700, 800, 950, 1100, 1300, 1500, 1750, 2000, 2300, 2600],
  },
  landing: {
    file: 'landing.wav', from: 'start', length: 0.9, tones: 3,
    times: [0, 5, 10, 15, 20, 30, 40, 50, 60, 75, 90, 105, 120, 140, 160, 185, 210, 240, 280, 320, 370, 430, 500, 580, 680, 790, 900],
  },
  pass: {
    file: 'fast-running.mp3', from: 'peak', before: 0.62, length: 1.5, tones: 0,
    times: [0, 40, 80, 120, 160, 200, 250, 300, 350, 400, 450, 500, 540, 580, 600, 620, 640, 660, 690, 720, 760, 800, 860, 920, 1000, 1100, 1200, 1350, 1500],
  },
}
const LOOPS = {
  distortion: { file: 'distortion-field.wav', span: [0.2, 2.5], tones: 8 },
  propeller: { file: 'propeller.mp3', span: [0.5, 5.0], tones: 0, bandLimit: 3600 },
}

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

/** 5 ms levels (dB). */
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

/** Where the take starts: where the sound first rises within 40 dB of its loudest 5 ms (`start`), or `before` s ahead of the loudest (`peak`); and the loudest moment from there (ms). */
function onset(x, spec) {
  const lv = levels(x)
  let top = -Infinity, peak = 0
  lv.forEach((v, k) => { if (v > top) { top = v; peak = k } })
  const w = SR * 0.005
  if (spec.from === 'peak') return { start: Math.max(0, Math.round((peak * 5 / 1000 - spec.before) * SR)), peak: spec.before * 1000 }
  let a = 0
  while (a < peak && lv[a] < top - 40) a++
  return { start: a * w, peak: (peak - a) * 5 }
}

/** Prominent tones (Hz) in x[from, from + len s): local maxima TONE_PROMINENCE dB over their neighbourhood's median. */
function tones(x, from, len, count) {
  if (!count) return []
  const N = Math.min(Math.round(len * SR), x.length - from)
  const out = []
  for (let f = TONE_RANGE[0]; f < TONE_RANGE[1]; f *= 1.003) {
    const w = 2 * Math.PI * f / SR
    let re = 0, im = 0
    for (let i = 0; i < N; i += 2) {
      const h = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)
      const v = x[from + i] * h
      re += v * Math.cos(w * i)
      im -= v * Math.sin(w * i)
    }
    out.push([f, 10 * Math.log10((re * re + im * im) / N + 1e-14)])
  }
  // a peak is the loudest within max(2 Hz, 1.5 %) and stands over the median of max(15 Hz, 12 %) round it
  const peaks = []
  for (let i = 0; i < out.length; i++) {
    const f = out[i][0]
    const own = Math.max(2, f * 0.015), wide = Math.max(15, f * 0.12)
    const near = []
    let top = true
    for (let j = 0; j < out.length; j++) {
      const d = Math.abs(out[j][0] - f)
      if (d > wide) continue
      if (j !== i && d < own && out[j][1] > out[i][1]) top = false
      near.push(out[j][1])
    }
    near.sort((p, q) => p - q)
    if (top && out[i][1] - near[near.length >> 1] > TONE_PROMINENCE) peaks.push(out[i])
  }
  // the loudest few, one per 4 %
  const kept = []
  for (const pk of peaks.sort((a, b) => b[1] - a[1])) {
    if (kept.length < count && !kept.some((k) => Math.abs(k[0] - pk[0]) < pk[0] * 0.04)) kept.push(pk)
  }
  return kept.map(([f]) => Math.round(f * 10) / 10).sort((a, b) => a - b)
}

/** A tone's own level, the broadband noise its narrow band also passes taken off (dB, per grid time). */
function toneEnvelope(x, start, f, times) {
  const share = Q / PARTIAL_Q
  const narrow = envelope(bandpass(x, f, PARTIAL_Q), start, f, times)
  const wide = envelope(bandpass(x, f, Q), start, f, times)
  const tone = narrow.map((v, k) => 10 * Math.log10(Math.max(10 ** (v / 10) - share * 10 ** (wide[k] / 10), 10 ** ((v - 30) / 10))))
  return tone.map((_, k) => [tone[Math.max(0, k - 1)], tone[k], tone[Math.min(tone.length - 1, k + 1)]].sort((p, q) => p - q)[1])
}

function oneShot(name) {
  const spec = ONE_SHOTS[name]
  const x = decode(`${DIR}/${spec.file}`)
  const { start, peak } = onset(x, spec)
  const bands = BANDS.map((f) => envelope(bandpass(x, f, Q), start, f, spec.times))
  const found = tones(x, start, Math.min(1, spec.length), spec.tones)
  const partials = found.map((f) => ({ f, env: toneEnvelope(x, start, f, spec.times) }))
  let top = -Infinity
  for (const e of bands) for (const v of e) top = Math.max(top, v)
  const norm = (e) => e.map((v) => Math.round((v - top) * 2) / 2)
  return { m: { bands: bands.map(norm), partials: partials.map((p) => ({ f: p.f, env: norm(p.env) })) }, peak, spec }
}

/** A loop: its mean band levels over the steady span (dB), its tones' levels against them, and how deep its level swells (dB, the 50 ms levels' spread). */
function loop(name) {
  const spec = LOOPS[name]
  const x = decode(`${DIR}/${spec.file}`)
  const a = Math.round(spec.span[0] * SR), b = Math.round(spec.span[1] * SR)
  const seg = x.subarray(a, b)
  const mean = (y) => { let s = 0; for (let i = 0; i < y.length; i++) s += y[i] * y[i]; return 10 * Math.log10(s / y.length + 1e-14) }
  let bands = BANDS.map((f) => mean(bandpass(seg, f, Q)))
  // above the recording's band limit, carry the measured slope on rather than the resampler's floor
  if (spec.bandLimit) {
    const last = BANDS.findLastIndex((f) => f <= spec.bandLimit)
    const slope = (bands[last] - bands[last - 3]) / 3
    bands = bands.map((v, k) => (k > last ? bands[last] + slope * (k - last) : v))
  }
  const top = Math.max(...bands)
  const share = Q / PARTIAL_Q
  const lines = tones(seg, 0, Math.min(2, seg.length / SR), spec.tones).map((f) => {
    const narrow = mean(bandpass(seg, f, PARTIAL_Q)), wide = mean(bandpass(seg, f, Q))
    const level = 10 * Math.log10(Math.max(10 ** (narrow / 10) - share * 10 ** (wide / 10), 10 ** ((narrow - 30) / 10)))
    return { f, db: Math.round((level - top) * 2) / 2 }
  })
  const w = Math.round(SR * 0.05)
  const lv = []
  for (let i = 0; i + w <= seg.length; i += w) { let s = 0; for (let j = i; j < i + w; j++) s += seg[j] * seg[j]; lv.push(10 * Math.log10(s / w + 1e-14)) }
  const m = lv.reduce((p, q) => p + q, 0) / lv.length
  const swell = Math.sqrt(lv.reduce((p, q) => p + (q - m) ** 2, 0) / lv.length)
  return { bands: bands.map((v) => Math.round((v - top) * 2) / 2), lines, swell: Math.round(swell * 100) / 100 }
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
  const counts = (b, k) => ref.bands[b][k] > -45 && ref.bands[b][k] > Math.max(...ref.bands[b]) - 30
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
  const shots = Object.fromEntries(Object.keys(ONE_SHOTS).map((name) => [name, oneShot(name)]))
  for (const [name, s] of Object.entries(shots)) console.log(`${name}: ${s.spec.length} s, loudest at ${s.peak} ms, tones ${s.m.partials.map((p) => p.f).join(' ') || 'none'} Hz`)
  const grid = (name) => ({ bands: BANDS, times: ONE_SHOTS[name].times, seconds: ONE_SHOTS[name].length, q: Q, fadeOut: 0.12 })
  if (compare) {
    const { roadsterTake } = await server.ssrLoadModule('/src/content/roadster/audio/sound-bank.ts')
    for (const [name, s] of Object.entries(shots)) {
      const syn = bandModel(roadsterTake(name, 0, SR), ONE_SHOTS[name].times)
      let top = -Infinity
      for (const e of syn) for (const v of e) top = Math.max(top, v)
      let err = 0, n = 0
      s.m.bands.forEach((e, b) => e.forEach((v, k) => { if (v > -40) { const d = syn[b][k] - top - v; err += d * d; n++ } }))
      console.log(`${name}: rms ${Math.sqrt(err / n).toFixed(1)} dB`)
    }
  } else {
    const fits = {}
    for (const name of Object.keys(shots)) {
      console.log(name)
      fits[name] = refine(shots[name].m, grid(name), synthesise)
    }
    const loops = Object.fromEntries(Object.keys(LOOPS).map((name) => [name, loop(name)]))
    for (const [name, l] of Object.entries(loops)) console.log(`${name}: swell ${l.swell} dB, lines ${l.lines.map((p) => `${p.f}@${p.db}`).join(' ') || 'none'}`)
    const rows = (m) => m.bands.map((e) => `      [${e.join(', ')}],`).join('\n')
    const parts = (m) => m.partials.map((p) => `      { f: ${p.f}, env: [${p.env.join(', ')}] },`).join('\n')
    const entry = (name, m) => `  ${name}: {\n    bands: [\n${rows(m)}\n    ],\n    partials: [${m.partials.length ? `\n${parts(m)}\n    ` : ''}],\n  },`
    const loopEntry = (name, l) => `  ${name}: {\n    bands: [${l.bands.join(', ')}],\n    lines: [${l.lines.map((p) => `{ f: ${p.f}, db: ${p.db} }`).join(', ')}],\n    swell: ${l.swell},\n  },`
    writeFileSync('src/content/roadster/audio/sound-models.ts', `// Generated by tools/roadster-sound-model.mjs from recordings (ref_sounds/roadster): do not edit by hand.
// Levels in dB (relative to each sound's loudest band) on each one-shot's times (ms) in the third-octave ROADSTER_BANDS (Hz);
// a loop's steady band levels, its tones (Hz, dB against the loudest band) and its level's swell (dB).
import type { SpectralModel } from '../../../audio/spectral'

export type RoadsterShot = ${Object.keys(ONE_SHOTS).map((n) => `'${n}'`).join(' | ')}
export type RoadsterLoop = ${Object.keys(LOOPS).map((n) => `'${n}'`).join(' | ')}

export const ROADSTER_BANDS = [${BANDS.map((b) => b.toFixed(1)).join(', ')}]
export const SHOT_TIMES: Record<RoadsterShot, readonly number[]> = {
${Object.keys(ONE_SHOTS).map((n) => `  ${n}: [${ONE_SHOTS[n].times.join(', ')}],`).join('\n')}
}
export const SHOT_SECONDS: Record<RoadsterShot, number> = { ${Object.keys(ONE_SHOTS).map((n) => `${n}: ${ONE_SHOTS[n].length}`).join(', ')} }
/** each take's loudest moment from its start (s): what a cue lines up with its blow */
export const SHOT_PEAK: Record<RoadsterShot, number> = { ${Object.keys(ONE_SHOTS).map((n) => `${n}: ${(shots[n].peak / 1000).toFixed(3)}`).join(', ')} }

export const SHOT_MODELS: Record<RoadsterShot, SpectralModel> = {
${Object.keys(ONE_SHOTS).map((n) => entry(n, fits[n])).join('\n')}
}

export interface LoopModel {
  bands: readonly number[]
  lines: ReadonlyArray<{ f: number; db: number }>
  swell: number
}

export const LOOP_MODELS: Record<RoadsterLoop, LoopModel> = {
${Object.keys(LOOPS).map((n) => loopEntry(n, loops[n])).join('\n')}
}
`)
    console.log('wrote src/content/roadster/audio/sound-models.ts')
  }
} finally {
  await server.close()
}
process.exit(0)
