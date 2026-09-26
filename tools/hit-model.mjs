// Fits the soldiers' hit sounds (src/content/soldier/hit-bank.ts) to Foley recordings: for each recording a
// spectral-envelope model (level over time in third-octave bands) and its ringing partials (tonal lines that
// outlast the impact, with their own envelopes), written to src/content/soldier/hit-models.ts. The game
// synthesises fresh takes from the model; nothing of the recordings is shipped.
// Usage: node tools/hit-model.mjs <punch.mp3> <stomp.mp3> <slash.mp3>     (needs ffmpeg)
//        node tools/hit-model.mjs --compare <punch.mp3> <stomp.mp3> <slash.mp3>   (band-envelope error of a take)
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { createServer } from 'vite'

const SR = 48000
const args = process.argv.slice(2)
const compare = args[0] === '--compare'
const files = compare ? args.slice(1) : args
/** name, and where the modelled window starts after the recording's onset (ms): the slash's whoosh is the robot's own swing voice */
const SOUNDS = [['punch', 0], ['heavy', 0], ['slash', 95]]
/** band centres: third octaves 31.5 Hz .. 16 kHz */
export const BANDS = Array.from({ length: 28 }, (_, k) => 31.5 * 2 ** (k / 3))
/** the envelope's time grid (ms after the window's start) */
export const TIMES = [0, 3, 6, 10, 15, 20, 25, 30, 40, 50, 60, 75, 90, 110, 130, 150, 175, 200, 230, 260, 300, 350, 400, 460, 530, 610, 700, 800, 900]
const Q = 4.32

function decode(path) {
  const raw = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', path, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 })
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4)
}

/** RBJ band-pass, constant 0 dB peak (the Web Audio's), over x. */
export function bandpass(x, f, q) {
  const w = 2 * Math.PI * f / SR, alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha
  const b0 = alpha / a0, b2 = -alpha / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - alpha) / a0
  const y = new Float32Array(x.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v }
  return y
}

/** RMS of y around each grid time (window: 4 ms, or two periods of the band, whichever is longer), dB. */
function envelope(y, start, f) {
  const half = Math.round(Math.max(0.004, 2 / f) * SR / 2)
  return TIMES.map((ms) => {
    const c = start + Math.round(ms / 1000 * SR)
    let s = 0, n = 0
    for (let i = Math.max(0, c - half); i < Math.min(y.length, c + half); i++) { s += y[i] * y[i]; n++ }
    return 10 * Math.log10(s / Math.max(1, n) + 1e-14)
  })
}

function onsetOf(x) {
  let peak = 0
  for (const v of x) peak = Math.max(peak, Math.abs(v))
  let i = 0
  while (Math.abs(x[i]) < peak * 0.05) i++
  return i
}

/** The ringing partials: spectral peaks 12 dB over their neighbourhood late in the window, up to `max` (or at `freqs`). */
function partials(x, start, max, freqs) {
  if (freqs) return freqs.map((f) => ({ f, env: envelope(bandpass(x, f, 60), start, 400) }))
  const N = 16384, a = start + Math.round(0.2 * SR)
  const re = new Float64Array(N), im = new Float64Array(N)
  for (let i = 0; i < N; i++) re[i] = (x[a + i] ?? 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N))
  for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) [re[i], re[j]] = [re[j], re[i]] }
  for (let len = 2; len <= N; len <<= 1) { const ang = -2 * Math.PI / len; for (let i = 0; i < N; i += len) for (let k = 0; k < len / 2; k++) { const c = Math.cos(ang * k), s = Math.sin(ang * k); const ur = re[i + k], ui = im[i + k]; const vr = re[i + k + len / 2] * c - im[i + k + len / 2] * s, vi = re[i + k + len / 2] * s + im[i + k + len / 2] * c; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi } }
  const m = Array.from({ length: N / 2 }, (_, i) => 10 * Math.log10(re[i] ** 2 + im[i] ** 2 + 1e-20))
  const found = []
  for (let i = Math.round(400 / SR * N); i < Math.round(15000 / SR * N); i++) {
    if (!(m[i] > m[i - 1] && m[i] >= m[i + 1])) continue
    const w = Math.round(i * 0.06)
    const around = m.slice(Math.max(0, i - w), i + w + 1).sort((p, q) => p - q)
    if (m[i] - around[Math.floor(around.length / 2)] > 12) found.push({ f: i * SR / N, level: m[i] })
  }
  found.sort((p, q) => q.level - p.level)
  const kept = []
  for (const p of found) if (kept.length < max && kept.every((k) => Math.abs(k.f / p.f - 1) > 0.02)) kept.push(p)
  return kept.map((p) => {
    const y = bandpass(x, p.f, 60)
    return { f: Math.round(p.f), env: envelope(y, start, 400) }
  })
}

function model(x, offsetMs, freqs) {
  const start = onsetOf(x) + Math.round(offsetMs / 1000 * SR)
  const parts = partials(x, start, 8, freqs)
  // the partials' power comes out of the band that holds them: the rest of the band is noise
  const bands = BANDS.map((f) => {
    const env = envelope(bandpass(x, f, Q), start, f)
    const inBand = parts.filter((p) => Math.abs(Math.log2(p.f / f)) <= 1 / 6)
    return env.map((db, k) => {
      const tonal = inBand.reduce((s, p) => s + 10 ** (p.env[k] / 10), 0)
      const total = 10 ** (db / 10)
      return 10 * Math.log10(Math.max(total - tonal, total * 0.1))
    })
  })
  // relative to the loudest point, rounded (0.5 dB)
  let top = -Infinity
  for (const e of bands) for (const v of e) top = Math.max(top, v)
  const r = (v) => Math.round((v - top) * 2) / 2
  return { bands: bands.map((e) => e.map(r)), partials: parts.map((p) => ({ f: p.f, env: p.env.map(r) })) }
}

/**
 * Refine a model until its synthesis measures like the recording: the band filters overlap, so a band's
 * measured level includes its neighbours' noise, and the raw fit comes out hot where the spectrum is dense.
 * Each pass synthesises (fixed noise, no variation), measures, and takes the error off the model.
 */
async function refine(ref, synthesise) {
  const freqs = ref.partials.map((p) => p.f)
  // a synthesis measured: averaged (in power) over a few noise seeds, so a single draw's jitter isn't fitted
  const measure = (m) => {
    const runs = [0, 1, 2, 3].map((s) => model(synthesise(m, 1234 + s * 77, SR, false), 0, freqs))
    const avg = (get) => 10 * Math.log10(runs.reduce((a, r) => a + 10 ** (get(r) / 10), 0) / runs.length)
    return {
      bands: ref.bands.map((e, b) => e.map((_, k) => avg((r) => r.bands[b][k]))),
      partials: ref.partials.map((p, j) => ({ env: p.env.map((_, k) => avg((r) => r.partials[j].env[k])) })),
    }
  }
  // the cells that matter: within 35 dB of the top and 25 dB of their band's own peak (below, filter leakage sets the level)
  const counts = (b, k) => ref.bands[b][k] > -35 && ref.bands[b][k] > Math.max(...ref.bands[b]) - 25
  const m = JSON.parse(JSON.stringify(ref))
  let best = null, bestErr = Infinity
  for (let pass = 0; pass < 8; pass++) {
    const syn = measure(m)
    // the synthesis is peak-normalised: take the mean offset out first
    let off = 0, n = 0
    ref.bands.forEach((e, b) => e.forEach((v, k) => { if (counts(b, k)) { off += syn.bands[b][k] - v; n++ } }))
    off /= n
    let err = 0
    ref.bands.forEach((e, b) => e.forEach((v, k) => {
      const d = syn.bands[b][k] - off - v
      if (counts(b, k)) {
        err += d * d
        m.bands[b][k] = Math.round((m.bands[b][k] - Math.max(-4, Math.min(4, 0.7 * d))) * 2) / 2
      }
    }))
    ref.partials.forEach((p, j) => p.env.forEach((v, k) => {
      if (v < -40) return
      const d = syn.partials[j].env[k] - off - v
      m.partials[j].env[k] = Math.round((m.partials[j].env[k] - Math.max(-4, Math.min(4, 0.7 * d))) * 2) / 2
    }))
    const rms = Math.sqrt(err / n)
    console.log(`  pass ${pass}: rms ${rms.toFixed(2)} dB`)
    if (rms < bestErr) { bestErr = rms; best = JSON.parse(JSON.stringify(m)) }
  }
  return best
}

if (!compare) {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
  const { synthesise } = await server.ssrLoadModule('/src/content/soldier/hit-bank.ts')
  const out = []
  for (const [i, [name, offset]] of SOUNDS.entries()) {
    console.log(name)
    const ref = model(decode(files[i]), offset)
    out.push({ name, ...(await refine(ref, synthesise)) })
  }
  await server.close()
  const body = out.map((m) => `  ${m.name}: {\n    bands: [\n${m.bands.map((e) => `      [${e.join(', ')}],`).join('\n')}\n    ],\n    partials: [\n${m.partials.map((p) => `      { f: ${p.f}, env: [${p.env.join(', ')}] },`).join('\n')}\n    ],\n  },`).join('\n')
  writeFileSync('src/content/soldier/hit-models.ts', `// Generated by tools/hit-model.mjs from Foley recordings (a punch, a stomp, a sword slash): do not edit by hand.
// Levels in dB (relative to each sound's loudest band) on HIT_TIMES (ms) in the third-octave HIT_BANDS (Hz).

export const HIT_BANDS = [${BANDS.map((f) => f.toFixed(1)).join(', ')}]
export const HIT_TIMES = [${TIMES.join(', ')}]

export interface HitModel {
  /** noise level per band (dB) at each time */
  bands: number[][]
  /** ringing partials (Hz) and their levels (dB) at each time */
  partials: Array<{ f: number; env: number[] }>
}

export const HIT_MODELS: Record<'punch' | 'heavy' | 'slash', HitModel> = {
${body}
}
`)
  console.log('wrote src/content/soldier/hit-models.ts:', out.map((m) => `${m.name} ${m.partials.length} partials (${m.partials.map((p) => p.f).join(', ')})`).join('; '))
} else {
  // the band-envelope error of a synthesised take against its recording (dB, over the bands and times within 40 dB of the top)
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
  try {
    const { blowTake } = await server.ssrLoadModule('/src/content/soldier/hit-bank.ts')
    SOUNDS.forEach(([name, offset], i) => {
      const ref = model(decode(files[i]), offset)
      const take = blowTake(name, 0, SR)
      const syn = model(take, 0, ref.partials.map((p) => p.f))
      let err = 0, n = 0
      const rows = []
      ref.bands.forEach((e, b) => {
        let row = 0, rn = 0
        e.forEach((v, k) => { if (v > -40) { const d = syn.bands[b][k] - v; err += d * d; n++; row += d; rn++ } })
        if (rn) rows.push(`${BANDS[b] < 1000 ? BANDS[b].toFixed(0) : (BANDS[b] / 1000).toFixed(1) + 'k'}:${(row / rn).toFixed(1)}`)
      })
      console.log(`${name}: rms ${Math.sqrt(err / n).toFixed(1)} dB; mean error by band ${rows.join(' ')}`)
    })
  } finally {
    await server.close()
  }
}
process.exit(0)
