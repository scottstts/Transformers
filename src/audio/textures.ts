/**
 * Offline-rendered source textures. Rendering them once at start-up keeps
 * every voice down to a few nodes: a voice plays a looped texture through its
 * own filter and gain instead of synthesizing grains live.
 *
 *   white / brown  broadband and low-weighted noise
 *   chatter        dense small clicks ringing small resonances (gravel under a foot)
 *   roar           pink noise with slow turbulent swells: the body of a jet's roar
 *   crackle        sparse, steep positive shocks with slower recovery (heavy-tailed
 *                  amplitudes): the crackle that makes a rocket sound like a rocket
 */
export interface Textures {
  white: AudioBuffer
  brown: AudioBuffer
  chatter: AudioBuffer
  roar: AudioBuffer
  crackle: AudioBuffer
}

export function renderTextures(ctx: BaseAudioContext): Textures {
  const rate = ctx.sampleRate
  return {
    white: buffer(ctx, 2, (d) => { for (let i = 0; i < d.length; i++) d[i] = rand() }),
    brown: buffer(ctx, 3, loop(rate, (d) => {
      let last = 0
      for (let i = 0; i < d.length; i++) {
        last = (last + 0.02 * rand()) / 1.02
        d[i] = last * 3.5
      }
    })),
    chatter: buffer(ctx, 3, (d) => {
      // Poisson clicks, log-normal level, each exciting a two-pole resonator
      let t = 0
      while (t < d.length) {
        t += Math.floor(-Math.log(1 - Math.random()) * rate / 110)
        const f = 1300 + Math.pow(Math.random(), 1.6) * 5600
        const decay = 0.003 + Math.random() * 0.01
        ring(d, t, f, decay, Math.exp(rand() * 0.9) * 0.35, rate)
      }
    }),
    roar: buffer(ctx, 6, loop(rate, (d) => {
      // Kellet pink noise under a turbulence envelope (white noise through two 5 Hz poles, ~30 % rms)
      const a = 1 - Math.exp(-2 * Math.PI * 5 / rate)
      const swell = new Float32Array(d.length)
      let l1 = 0, l2 = 0, sq = 0
      for (let i = 0; i < d.length; i++) {
        l1 += (rand() - l1) * a
        l2 += (l1 - l2) * a
        swell[i] = l2
        sq += l2 * l2
      }
      const depth = 0.3 / Math.sqrt(sq / d.length)
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
      for (let i = 0; i < d.length; i++) {
        const w = rand()
        b0 = 0.99886 * b0 + w * 0.0555179
        b1 = 0.99332 * b1 + w * 0.0750759
        b2 = 0.969 * b2 + w * 0.153852
        b3 = 0.8665 * b3 + w * 0.3104856
        b4 = 0.55 * b4 + w * 0.5329522
        b5 = -0.7616 * b5 - w * 0.016898
        const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362
        b6 = w * 0.115926
        d[i] = pink * (1 + 0.45 * Math.tanh(swell[i] * depth / 0.45))
      }
    })),
    crackle: buffer(ctx, 4, (d) => {
      // Poisson shocks (~260/s, clustered): jump up, fall back through a short
      // undershoot; amplitudes Pareto-distributed so a few crack hard
      let t = 0
      let burst = 0
      while (t < d.length) {
        burst = Math.random() < 0.08 ? 3 + Math.floor(Math.random() * 6) : burst
        const gap = burst > 0 ? (burst--, 0.0012 + Math.random() * 0.002) : -Math.log(1 - Math.random()) / 260
        t += Math.max(1, Math.floor(gap * rate))
        const a = Math.min(1, 0.12 * Math.pow(1 - Math.random(), -1 / 2.1))
        const fall = Math.floor(rate * (0.0004 + Math.random() * 0.0012))
        for (let j = 0; j < fall * 3 && t + j < d.length; j++) {
          const x = j / fall
          d[t + j] += a * (x < 1 ? 1 - 1.6 * x : -0.6 * Math.exp(-(x - 1) * 2.2))
        }
      }
    }),
  }
}

function buffer(ctx: BaseAudioContext, seconds: number, fill: (d: Float32Array) => void): AudioBuffer {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate)
  const d = b.getChannelData(0)
  fill(d)
  normalize(d)
  return b
}

/** Wrap a generator so its buffer loops without a click: the head crossfades
 *  with signal generated past the end. */
function loop(rate: number, generate: (d: Float32Array) => void): (d: Float32Array) => void {
  return (d) => {
    const n = Math.floor(rate * 0.05)
    const sig = new Float32Array(d.length + n)
    generate(sig)
    d.set(sig.subarray(0, d.length))
    for (let i = 0; i < n; i++) {
      const w = i / n
      d[i] = sig[i] * w + sig[d.length + i] * (1 - w)
    }
  }
}

/** Add a decaying two-pole resonator impulse response at sample `at`. */
function ring(d: Float32Array, at: number, f: number, decay: number, level: number, rate: number): void {
  const r = Math.exp(-1 / (decay * rate))
  const c = 2 * r * Math.cos((2 * Math.PI * f) / rate)
  let y1 = 0
  let y2 = 0
  const n = Math.min(d.length - at, Math.floor(decay * rate * 6))
  for (let i = 0; i < n; i++) {
    const x = i < 3 ? level * rand() : 0
    const y = x + c * y1 - r * r * y2
    d[at + i] += y
    y2 = y1
    y1 = y
  }
}

function normalize(d: Float32Array): void {
  let peak = 0
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]))
  if (peak > 0) for (let i = 0; i < d.length; i++) d[i] /= peak
}

function rand(): number {
  return Math.random() * 2 - 1
}
