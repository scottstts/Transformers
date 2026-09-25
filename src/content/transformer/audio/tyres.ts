import type { AudioMix } from '../../../audio/mix'

/**
 * Tyres sliding over the desert floor (a drift, wheelspin, a locked wheel),
 * heard from the chase distance. On hardpan and sand a sliding tyre does not
 * squeal: it tears through the crust with a broadband roar.
 *
 *   scrub   the tearing roar of tread over crust: pink noise with turbulent
 *           swells through fixed, gentle filters
 *   grain   the hiss of sand and grit thrown out of the roost: broadband
 *           noise, higher and quieter
 *   rumble  the car's body shaken by the tyres over the crust, low
 *
 * Nothing in this voice is pitched or resonant and no filter moves: only the
 * layers' levels follow the slide. A filter swept with the slide, or tuned
 * clicks (the chatter texture), read as a glass filling with water.
 */

export interface TyreTuning {
  /** lowpass of the scrub roar (Hz) */
  scrubHz: number
  /** lowpass of the body rumble (Hz) */
  rumbleHz: number
  /** voice level at a full slide */
  level: number
}

/** Wide all-terrain tyres under a three-tonne truck: a deep roar. */
export const HEAVY_TYRES: TyreTuning = { scrubHz: 900, rumbleHz: 110, level: 0.2 }

/** Slide speed (m/s) at which the voice is at full level. */
const FULL = 9
/** Onset below which nothing is heard (m/s of slide): ordinary cornering stays silent. */
const ONSET = 1.5
const SCRUB = 1
const GRAIN = 0.12
const RUMBLE = 0.55
/** Level response (s). */
const RESPONSE = 0.12
/** Filters (Hz), all Q 0.5 or lower: no resonance. */
const SCRUB_HIGHPASS = 120
const GRAIN_BAND: [number, number] = [900, 3000]

interface Graph {
  scrub: GainNode
  grain: GainNode
  rumble: GainNode
  master: GainNode
  sources: AudioBufferSourceNode[]
}

export class TyreVoice {
  private readonly mix: AudioMix
  private readonly tuning: TyreTuning
  private graph: Graph | null = null

  constructor(mix: AudioMix, tuning: TyreTuning) {
    this.mix = mix
    this.tuning = tuning
  }

  /** Per frame: `slide` the fastest tread slide under the car (m/s). */
  update(slide: number): void {
    const ctx = this.mix.ctx
    if (!ctx) return
    const g = this.graph ?? (this.graph = this.build(ctx))
    const t = ctx.currentTime
    const on = this.mix.enabled ? 1 : 0
    const k = Math.min(1.2, Math.max(0, slide - ONSET) / FULL)
    g.scrub.gain.setTargetAtTime(on * SCRUB * Math.pow(k, 0.8), t, RESPONSE)
    g.grain.gain.setTargetAtTime(on * GRAIN * k, t, RESPONSE)
    g.rumble.gain.setTargetAtTime(on * RUMBLE * k, t, RESPONSE)
  }

  dispose(): void {
    const g = this.graph
    if (!g) return
    for (const s of g.sources) s.stop()
    g.master.disconnect()
    this.graph = null
  }

  private build(ctx: AudioContext): Graph {
    const tex = this.mix.tex
    const out = this.mix.output
    const tu = this.tuning
    const master = ctx.createGain()
    master.gain.value = tu.level
    master.connect(out.dry)
    const send = ctx.createGain()
    send.gain.value = 0.35
    master.connect(send).connect(out.send)

    const filter = (type: BiquadFilterType, frequency: number): BiquadFilterNode => {
      const f = ctx.createBiquadFilter()
      f.type = type
      f.frequency.value = frequency
      f.Q.value = type === 'bandpass' ? 0.35 : 0.5
      return f
    }
    const layer = (buffer: AudioBuffer, filters: BiquadFilterNode[]): { gain: GainNode; source: AudioBufferSourceNode } => {
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.loop = true
      const gain = ctx.createGain()
      gain.gain.value = 0
      let node: AudioNode = source
      for (const f of filters) node = node.connect(f)
      node.connect(gain).connect(master)
      return { gain, source }
    }

    const scrub = layer(tex.roar, [filter('highpass', SCRUB_HIGHPASS), filter('lowpass', tu.scrubHz)])
    const grain = layer(tex.white, [filter('highpass', GRAIN_BAND[0]), filter('lowpass', GRAIN_BAND[1])])
    const rumble = layer(tex.brown, [filter('lowpass', tu.rumbleHz)])

    const sources = [scrub.source, grain.source, rumble.source]
    // start the loops at different points so the layers never line up
    sources.forEach((s, i) => s.start(0, (i * 0.37 + Math.random()) % (s.buffer as AudioBuffer).duration))
    return { scrub: scrub.gain, grain: grain.gain, rumble: rumble.gain, master, sources }
  }
}
