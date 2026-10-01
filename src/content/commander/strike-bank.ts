/**
 * The commander's lance striking the robot's armour, synthesised. What
 * happens physically, and what each part of the take is:
 *
 *  - contact: a heavy point striking thick plate: a few hard micro-contacts
 *    within ~12 ms (broadband, the first the hardest), and a short grinding
 *    scrape as the point skids on the plate;
 *  - the plate: thick armour rings low and dense, a cluster of close modes
 *    between ~140 Hz and 1.9 kHz with near twins (bolted panels split their
 *    modes), the lower ones longest (T60 ~0.9 s at 150 Hz down to ~0.2 s at
 *    2 kHz: the frame damps them), driven by the contact so the ring grows
 *    out of it;
 *  - the mass: the robot's body takes the blow as a deep, short structural
 *    thud (~55-75 Hz, damped);
 *  - the lance's energy: the point discharges into the metal, an electrical
 *    arc's crackle: irregular snaps (a Poisson train thinning out over a
 *    quarter of a second), each a sub-millisecond burst, high-passed, with a
 *    faint hiss under them. It is what tells this blow from a soldier's
 *    blade or the robots' own blows.
 *
 * `heavy` (the whirl that knocks the robot back) hits harder: more thud,
 * a longer ring and a longer discharge. Fixed resonances, level envelopes
 * only: nothing glides or sweeps. Deterministic (seeded) and pure: the audio
 * side copies the samples into AudioBuffers.
 */

export const STRIKE_TAKES = 4
export const STRIKE_SECONDS = 1.3

interface Mode { f: number; a: number; t60: number }

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The plate's modes (one armour, struck at different places by each take). */
function plateModes(): Mode[] {
  const r = rng(0xa4302)
  const modes: Mode[] = []
  const t60 = (f: number): number => Math.min(0.95, Math.max(0.16, 0.9 * (150 / f) ** 0.55))
  for (let i = 0; i < 26; i++) {
    const f = 140 * (1900 / 140) ** r()
    const a = (0.35 + 0.65 * r()) * (f < 600 ? 1.5 : f > 1300 ? 0.6 : 1)
    modes.push({ f, a, t60: t60(f) })
    if (r() < 0.55) {
      const g = f * (1 + (0.006 + 0.02 * r()) * (r() < 0.5 ? -1 : 1))
      modes.push({ f: g, a: a * (0.5 + 0.5 * r()), t60: t60(g) })
    }
  }
  return modes
}

const PLATE = plateModes()

/** Two-pole resonator bank over `drive` into `out` (each mode weighted by `weight`). */
function ring(drive: Float32Array, out: Float32Array, modes: readonly Mode[], weight: (m: Mode) => number, rate: number, t60Scale: number): void {
  const n = out.length
  for (const m of modes) {
    const theta = (2 * Math.PI * m.f) / rate
    const rad = Math.exp(-6.91 / (m.t60 * t60Scale * rate))
    const b1 = 2 * rad * Math.cos(theta), b2 = -rad * rad
    const g = weight(m) * Math.sin(theta)
    let y1 = 0, y2 = 0
    for (let i = 0; i < n; i++) {
      const y = g * drive[i] + b1 * y1 + b2 * y2
      out[i] += y
      y2 = y1
      y1 = y
    }
  }
}

/** One take: `variant` picks where on the plate it lands; `heavy` the knock-back's blow. Peak-normalised to 0.9. */
export function strikeTake(variant: number, heavy: boolean, rate: number): Float32Array<ArrayBuffer> {
  const n = Math.round(STRIKE_SECONDS * rate)
  const r = rng(0x5713 + variant * 7907 + (heavy ? 104729 : 0))
  const out = new Float32Array(n)
  // the contact: hard micro-contacts and the point's skid
  const drive = new Float32Array(n)
  const contacts = 2 + Math.floor(r() * 3)
  for (let c = 0; c < contacts; c++) {
    const at = c === 0 ? 0 : Math.round(r() * 0.012 * rate)
    const level = c === 0 ? 1 : 0.3 + 0.5 * r()
    const tau = (0.0008 + 0.002 * r()) * rate
    for (let i = at; i < Math.min(n, at + Math.round(tau * 7)); i++) drive[i] += level * (r() * 2 - 1) * Math.exp(-(i - at) / tau)
  }
  const skid = (heavy ? 0.06 : 0.035) * rate
  for (let i = 0; i < Math.min(n, Math.round(skid * 5)); i++) drive[i] += 0.22 * (r() * 2 - 1) * Math.exp(-i / skid)
  // the plate rings from it, struck somewhere new each take
  ring(drive, out, PLATE, (m) => m.a * (0.2 + 0.8 * r()), rate, heavy ? 1.25 : 1)
  let plate = 0
  for (let i = 0; i < n; i++) plate = Math.max(plate, Math.abs(out[i]))
  // the crack of the contact itself on top
  for (let i = 0; i < n; i++) out[i] += drive[i] * 0.45 * plate
  // the body's thud: low noise through a damped low resonance
  const thud = new Float32Array(n)
  const tt = (heavy ? 0.09 : 0.05) * rate
  for (let i = 0; i < Math.min(n, Math.round(tt * 6)); i++) thud[i] = (r() * 2 - 1) * Math.exp(-i / tt)
  const body = new Float32Array(n)
  ring(thud, body, [{ f: 55 + 20 * r(), a: 1, t60: heavy ? 0.4 : 0.28 }, { f: 95 + 20 * r(), a: 0.5, t60: 0.2 }], (m) => m.a, rate, 1)
  let bodyPeak = 0
  for (let i = 0; i < n; i++) bodyPeak = Math.max(bodyPeak, Math.abs(body[i]))
  const thudLevel = (heavy ? 1.3 : 0.9) * plate / Math.max(1e-9, bodyPeak)
  for (let i = 0; i < n; i++) out[i] += body[i] * thudLevel
  // the lance's discharge: an arc's snaps thinning out, high-passed, a faint hiss under them
  const arc = new Float32Array(n)
  const arcTime = heavy ? 0.4 : 0.24
  let t = 0.004
  while (t < arcTime) {
    const k = Math.round(t * rate)
    const level = (0.4 + 0.6 * r()) * (1 - t / arcTime) ** 1.5
    const tau = (0.00015 + 0.0005 * r()) * rate
    for (let i = k; i < Math.min(n, k + Math.round(tau * 6)); i++) arc[i] += level * (r() * 2 - 1) * Math.exp(-(i - k) / tau)
    // snaps thin out as the discharge dies
    const rateNow = 900 * (1 - t / arcTime) + 60
    t += -Math.log(1 - r() * 0.999) / rateNow
  }
  for (let i = 0; i < Math.min(n, Math.round(arcTime * rate)); i++) arc[i] += 0.06 * (r() * 2 - 1) * (1 - i / (arcTime * rate))
  const hp = Math.exp((-2 * Math.PI * 1800) / rate)
  let prev = 0
  for (let i = 0; i < n; i++) {
    const x = arc[i]
    arc[i] = x - prev * hp
    prev = x
  }
  let arcPeak = 0
  for (let i = 0; i < n; i++) arcPeak = Math.max(arcPeak, Math.abs(arc[i]))
  const arcLevel = (heavy ? 0.5 : 0.42) * plate / Math.max(1e-9, arcPeak)
  for (let i = 0; i < n; i++) out[i] += arc[i] * arcLevel
  // fade the tail, normalise
  const fade = Math.round(0.05 * rate)
  let peak = 0
  for (let i = 0; i < n; i++) {
    if (i > n - fade) out[i] *= (n - i) / fade
    peak = Math.max(peak, Math.abs(out[i]))
  }
  if (peak > 0) for (let i = 0; i < n; i++) out[i] *= 0.9 / peak
  return out
}
