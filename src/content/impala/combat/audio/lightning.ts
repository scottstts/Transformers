import type { AudioMix } from '../../../../audio/mix'
import { rng, shapedNoise } from '../../../../audio/spectral'
import { voice } from '../../../transformer/combat/audio/shots'

/** Speed of sound (m/s): a strike is heard late by its distance. */
const SOUND_SPEED = 343
/** The crackle's loop: rate (Hz) and length (samples, a power of two: 2.7 s). */
const RATE = 48000
const LENGTH = 1 << 17
/**
 * Measured from ref_sounds/lightening.mp3 (a sustained electric arc): its
 * third-octave spectrum (dB, relative), rising some 4 dB an octave to a
 * broad top at 5-8 kHz; its crackle, a dense train of small discharges each
 * dying within a couple of milliseconds, swelling and sagging over tens of
 * ms. Fitted to the recording's texture: band kurtosis about 8 in the mids
 * and 5.5 in the highs (a steady hiss under the top, less impulsive than
 * the mids), the 5 ms envelope's 10-90% spread 8.7 dB, some 11 discharges a
 * second standing 8 dB over the rest. A sparse train of large discharges
 * (the first fit: 700 a second, three times the spread) measured twice the
 * kurtosis and six times the standouts: popping, not an arc's sizzle. No
 * thunder: the arc is all of it.
 */
const BANDS = [31.5, 50, 79.4, 126, 200, 318, 504, 800, 1270, 2016, 3200, 5080, 8064, 10160, 12800, 16128]
const LEVELS = [-34, -29, -28, -25, -23, -21, -18, -15, -10, -7, -4, -1, 0, -2, -14, -30]
/** The steady hiss under the top: the arc's spectrum above 3 kHz only. */
const HISS = LEVELS.map((db, i) => db - Math.max(0, Math.log2(3200 / BANDS[i])) * 18)
const CRACKLE = { rate: 3000, decay: [0.0004, 0.0025], spread: 0.45, floor: 0.1, swell: 3, hiss: 0.3 }

let data: Float32Array<ArrayBuffer> | null = null
const buffers = new WeakMap<BaseAudioContext, AudioBuffer>()

/** The arc's crackle, one seamless loop (built once: pure, at load). */
export function arcCrackle(): Float32Array<ArrayBuffer> {
  if (data) return data
  const r = rng(0xa4c)
  const out = shapedNoise(LENGTH, RATE, BANDS, LEVELS, 0x5a7)
  const hiss = shapedNoise(LENGTH, RATE, BANDS, HISS, 0x15)
  // the discharges: impulses at random, lognormal in size, each dying exponentially (wrapped, so the loop holds)
  const env = new Float32Array(LENGTH).fill(CRACKLE.floor)
  const count = Math.round(CRACKLE.rate * LENGTH / RATE)
  for (let e = 0; e < count; e++) {
    const at = Math.floor(r() * LENGTH)
    const size = Math.exp((r() + r() + r() - 1.5) * 2 * CRACKLE.spread)
    const tau = (CRACKLE.decay[0] + r() * (CRACKLE.decay[1] - CRACKLE.decay[0])) * RATE
    const span = Math.round(tau * 5)
    for (let i = 0; i < span; i++) env[(at + i) % LENGTH] += size * Math.exp(-i / tau)
  }
  // the swell: whole cycles over the loop between 10 and 45 Hz, about CRACKLE.swell dB deep
  const cycles: Array<[number, number, number]> = []
  for (let k = 0; k < 12; k++) cycles.push([Math.round((10 + r() * 35) * LENGTH / RATE), r() * Math.PI * 2, 0.5 + r()])
  const norm = Math.sqrt(cycles.reduce((s, c) => s + c[2] * c[2] / 2, 0))
  // the discharges' envelope at unit RMS, so the hiss's share is against the crackle's level
  let power = 0
  for (const v of env) power += v * v
  const unit = 1 / Math.sqrt(power / LENGTH)
  let sum = 0
  for (let i = 0; i < LENGTH; i++) {
    let g = 0
    for (const [n, phase, a] of cycles) g += a * Math.cos((2 * Math.PI * n * i) / LENGTH + phase)
    out[i] = out[i] * env[i] * unit * 10 ** ((g / norm) * CRACKLE.swell / 20) + hiss[i] * CRACKLE.hiss
    sum += out[i] * out[i]
  }
  const rms = Math.sqrt(sum / LENGTH) || 1
  for (let i = 0; i < LENGTH; i++) out[i] /= rms * 4
  data = out
  return out
}

function crackleBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = buffers.get(ctx)
  if (!b) {
    b = ctx.createBuffer(1, LENGTH, RATE)
    b.copyToChannel(arcCrackle(), 0)
    buffers.set(ctx, b)
  }
  return b
}

/**
 * A strike: the arc's crackle flaring at once and dying over a quarter of a
 * second (a stretch of the same loop, from anywhere in it), a little dulled
 * and late by distance. `strength` 0..1+; `distance` from the listener (m).
 */
export function lightningStrike(mix: AudioMix, strength: number, distance: number): void {
  const ctx = mix.ctx
  if (!ctx || !mix.enabled) return
  const g = Math.min(1.4, strength)
  const t = ctx.currentTime + 0.004 + distance / SOUND_SPEED
  const bus = voice(mix, 0.9 * g / (1 + distance * 0.03), 0.4, 1)
  const dull = ctx.createBiquadFilter()
  dull.type = 'lowpass'
  dull.frequency.value = Math.max(3000, 16000 - distance * 160)
  dull.Q.value = 0.5
  const env = ctx.createGain()
  env.gain.setValueAtTime(0, t)
  env.gain.linearRampToValueAtTime(1, t + 0.002)
  env.gain.setValueAtTime(1, t + 0.04 + Math.random() * 0.04)
  env.gain.setTargetAtTime(0, t + 0.08, 0.07 + Math.random() * 0.05)
  const src = ctx.createBufferSource()
  src.buffer = crackleBuffer(ctx)
  src.connect(dull).connect(env).connect(bus)
  src.start(t, Math.random() * (src.buffer.duration - 0.6), 0.6)
}

/**
 * The discharge running: the arc's crackle on and on while it lasts. Level
 * set every frame (0..1), surging a little with the current; the crackle is
 * built at load, its graph on first use, silent between discharges.
 */
export class ArcVoice {
  private readonly mix: AudioMix
  private graph: { gain: GainNode; src: AudioBufferSourceNode; out: GainNode } | null = null

  constructor(mix: AudioMix) {
    this.mix = mix
    arcCrackle()
  }

  update(level: number): void {
    const ctx = this.mix.ctx
    if (!ctx) return
    if (!this.graph && level <= 0) return
    const g = this.graph ?? this.build(ctx)
    const surge = level > 0 ? 0.75 + 0.25 * Math.random() : 0
    g.gain.gain.setTargetAtTime(this.mix.enabled ? 0.5 * Math.min(1.2, level) * surge : 0, ctx.currentTime, 0.02)
  }

  dispose(): void {
    if (!this.graph) return
    this.graph.src.stop()
    this.graph.out.disconnect()
    this.graph = null
  }

  private build(ctx: AudioContext) {
    const out = ctx.createGain()
    out.connect(this.mix.output.dry)
    const send = ctx.createGain()
    send.gain.value = 0.35
    out.connect(send).connect(this.mix.output.send)
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.connect(out)
    const src = ctx.createBufferSource()
    src.buffer = crackleBuffer(ctx)
    src.loop = true
    src.connect(gain)
    src.start(0, Math.random() * src.buffer.duration)
    this.graph = { gain, src, out }
    return this.graph
  }
}
