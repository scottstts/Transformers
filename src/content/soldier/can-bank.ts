/**
 * Thin-walled metal struck on the ground, synthesised: the parts of a broken
 * soldier land like an empty can dropped. Modelled on a recording of an empty
 * can dropped on a table (docs/enemies.md, Sound):
 *
 *  - the strike is a crunch of a few micro-contacts over ~30 ms, broadband to
 *    the top of hearing, its highs gone within ~40 ms;
 *  - the shell answers with a dense cluster of close, beating modes, mostly
 *    600-3200 Hz, plus a weak low body mode near 230 Hz. Near-degenerate
 *    pairs (a cylinder's modes split in two) make it tinny, not a bell;
 *  - higher modes die faster: T60 about 0.37 s at 600-1200 Hz, 0.25 s at
 *    1.2-2.4 kHz and 0.14 s at 2.4-4.8 kHz;
 *  - each strike lands somewhere else on the shell, so it excites a
 *    different mix of the same modes.
 *
 * Each object is a set of modes; each of its strikes a different micro-contact
 * crunch and mode weighting. The crunch drives two-pole resonators (one per
 * mode), so the ring grows out of the contact noise as a real one does.
 * Deterministic (seeded) and pure: the audio side copies the samples into
 * AudioBuffers.
 */

/** Distinct objects (mode sets) and strikes per object. */
export const CAN_OBJECTS = 6
export const CAN_STRIKES = 4
/** Length of one strike (s). */
export const CAN_SECONDS = 0.45

/** The mode cluster: count, band (Hz), share with a near twin and its split; and the weak high modes above it. */
const CLUSTER = 20
const BAND: [number, number] = [420, 3400]
const HIGH = 4
const HIGH_BAND: [number, number] = [3400, 8500]
const TWIN = 0.6
const SPLIT: [number, number] = [0.01, 0.04]
/** T60 (s) at 800 Hz and how it falls with frequency; clamp. */
const T60_800 = 0.42
const T60_SLOPE = 0.6
const T60_RANGE: [number, number] = [0.05, 0.45]
/** Above this the modes are weaker (thin wall, small radiating patches). */
const TILT_ABOVE = 3200
/** The low body mode: band (Hz), level against the cluster, T60 (s). */
const BODY: [number, number] = [210, 260]
const BODY_LEVEL = 5
const BODY_T60 = 0.45
/** Micro-contacts per strike, their spread (s) and decay (s). */
const CONTACTS: [number, number] = [3, 7]
const CONTACT_SPREAD = 0.045
const CONTACT_DECAY: [number, number] = [0.0015, 0.005]
/** The scrape between the micro-contacts: level and decay (s). */
const SCRAPE = 0.3
const SCRAPE_DECAY = 0.02
/** The lower modes carry more (larger radiating patches) below this (Hz). */
const FULL_BELOW = 1100
/** How loud the contact itself is against the ring (the strike's broadband crack). */
const CRACK = 0.4

/** A mode; the body's (`fixed`) answers every strike alike, wherever it lands. */
interface Mode { f: number; a: number; t60: number; fixed?: boolean }

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

/** One object's modes: the shell cluster with its twins, and the body. */
function modesOf(object: number): Mode[] {
  const r = rng(0x5eed + object * 7919)
  const modes: Mode[] = []
  const t60 = (f: number): number => Math.min(T60_RANGE[1], Math.max(T60_RANGE[0], T60_800 * (800 / f) ** T60_SLOPE))
  for (let i = 0; i < CLUSTER + HIGH; i++) {
    const [lo, hi] = i < CLUSTER ? BAND : HIGH_BAND
    const f = lo * (hi / lo) ** r()
    const a = (0.3 + 0.7 * r()) * (f > TILT_ABOVE ? (TILT_ABOVE / f) ** 2 : f < FULL_BELOW ? 1.8 : 1)
    modes.push({ f, a, t60: t60(f) })
    if (r() < TWIN) {
      const g = f * (1 + (SPLIT[0] + (SPLIT[1] - SPLIT[0]) * r()) * (r() < 0.5 ? -1 : 1))
      modes.push({ f: g, a: a * (0.5 + 0.5 * r()), t60: t60(g) })
    }
  }
  modes.push({ f: BODY[0] + (BODY[1] - BODY[0]) * r(), a: BODY_LEVEL, t60: BODY_T60, fixed: true })
  return modes
}

/** One strike of one object at `rate` Hz, peak-normalised to 0.9. */
export function canStrike(object: number, strike: number, rate: number): Float32Array<ArrayBuffer> {
  const n = Math.round(CAN_SECONDS * rate)
  const out = new Float32Array(n)
  const r = rng(0xc0ffee + object * 131 + strike * 977)
  // the contact: a few micro-contacts, the first the hardest, each a short burst of noise, high-passed
  const drive = new Float32Array(n)
  const contacts = CONTACTS[0] + Math.floor(r() * (CONTACTS[1] - CONTACTS[0] + 1))
  for (let c = 0; c < contacts; c++) {
    const at = c === 0 ? 0 : Math.round(r() * CONTACT_SPREAD * rate)
    const level = c === 0 ? 1 : 0.25 + 0.6 * r()
    const tau = (CONTACT_DECAY[0] + (CONTACT_DECAY[1] - CONTACT_DECAY[0]) * r()) * rate
    for (let i = at; i < Math.min(n, at + Math.round(tau * 7)); i++) drive[i] += level * (r() * 2 - 1) * Math.exp(-(i - at) / tau)
  }
  // the contact scraping on between the micro-contacts
  const scrape = SCRAPE_DECAY * rate
  for (let i = 0; i < Math.min(n, Math.round(scrape * 7)); i++) drive[i] += SCRAPE * (r() * 2 - 1) * Math.exp(-i / scrape)
  // one-pole high-pass (~200 Hz): the contact's own thump is small; the body mode carries the low end
  const hp = Math.exp(-2 * Math.PI * 200 / rate)
  for (let i = n - 1; i > 0; i--) drive[i] -= drive[i - 1] * hp
  // the shell: every mode rings from the contact, weighted by where this strike landed
  for (const m of modesOf(object)) {
    const w = m.fixed ? m.a : m.a * (0.15 + 0.85 * r())
    const theta = 2 * Math.PI * m.f / rate
    const rad = Math.exp(-6.91 / (m.t60 * rate))
    const b1 = 2 * rad * Math.cos(theta), b2 = -rad * rad
    const g = w * Math.sin(theta)
    let y1 = 0, y2 = 0
    for (let i = 0; i < n; i++) {
      const y = g * drive[i] + b1 * y1 + b2 * y2
      out[i] += y
      y2 = y1
      y1 = y
    }
  }
  // the crack of the contact itself on top of the ring
  let ring = 0
  for (let i = 0; i < n; i++) ring = Math.max(ring, Math.abs(out[i]))
  for (let i = 0; i < n; i++) out[i] += drive[i] * CRACK * ring
  // fade the last 20 ms, normalise
  const fade = Math.round(0.02 * rate)
  let peak = 0
  for (let i = 0; i < n; i++) {
    if (i > n - fade) out[i] *= (n - i) / fade
    peak = Math.max(peak, Math.abs(out[i]))
  }
  if (peak > 0) for (let i = 0; i < n; i++) out[i] *= 0.9 / peak
  return out
}
