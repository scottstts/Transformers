import type { AudioMix } from '../../../audio/mix'

/**
 * Tyres sliding over the desert floor (a drift, wheelspin, a locked wheel),
 * heard from the chase distance. On hardpan and sand a sliding tyre does not
 * squeal: it tears through the crust and throws grit.
 *
 *   scrub   the broadband tearing roar of tread over crust: pink noise with
 *           turbulent swells, band-passed, rising in pitch and level with the
 *           slide speed
 *   grit    the spray of gravel and clods rattling out of the roost: dense
 *           small clicks, denser the faster the tread slides
 *   rumble  the car's body shaken by the tyres hopping over the crust, low
 *
 * All of it through one distance lowpass, so nothing is shrill. The graph is
 * built once (lazily, on the shared mix) and runs silent while nothing slides.
 */

export interface TyreTuning {
  /** scrub band centre (Hz) at the onset of a slide, and its rise per m/s of slide */
  scrubHz: [number, number]
  /** lowpass of the body rumble (Hz) */
  rumbleHz: number
  /** distance lowpass over the whole voice (Hz) */
  distanceHz: number
  /** voice level at a full slide */
  level: number
}

/** Wide all-terrain tyres under a three-tonne truck: a deep tearing roar. */
export const HEAVY_TYRES: TyreTuning = { scrubHz: [260, 26], rumbleHz: 110, distanceHz: 2400, level: 0.2 }

/** Slide speed (m/s) at which the voice is at full level. */
const FULL = 9
/** Onset below which nothing is heard (m/s of slide). */
const ONSET = 0.6
const SCRUB = 1
const GRIT = 0.32
const RUMBLE = 0.55
/** Level / pitch response (s). */
const RESPONSE = 0.07

interface Graph {
  scrub: GainNode
  scrubBand: BiquadFilterNode
  grit: GainNode
  gritSource: AudioBufferSourceNode
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

  /** Per frame: `slide` the fastest tread slide under the car (m/s), `speed` its road speed (m/s). */
  update(slide: number, speed: number): void {
    const ctx = this.mix.ctx
    if (!ctx) return
    const g = this.graph ?? (this.graph = this.build(ctx))
    const t = ctx.currentTime
    const on = this.mix.enabled ? 1 : 0
    const s = Math.max(0, slide - ONSET)
    const k = Math.min(1.25, s / FULL)
    const tu = this.tuning
    g.scrubBand.frequency.setTargetAtTime(tu.scrubHz[0] + s * tu.scrubHz[1] + Math.abs(speed) * 3, t, RESPONSE)
    g.scrub.gain.setTargetAtTime(on * SCRUB * Math.pow(k, 0.8), t, RESPONSE)
    g.grit.gain.setTargetAtTime(on * GRIT * Math.pow(k, 1.3), t, RESPONSE)
    g.gritSource.playbackRate.setTargetAtTime(0.75 + 0.6 * Math.min(1, k), t, 0.15)
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
    const distance = ctx.createBiquadFilter()
    distance.type = 'lowpass'
    distance.frequency.value = tu.distanceHz
    distance.Q.value = 0.5
    master.connect(distance).connect(out.dry)
    const send = ctx.createGain()
    send.gain.value = 0.35
    distance.connect(send).connect(out.send)

    const loop = (buffer: AudioBuffer): AudioBufferSourceNode => {
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.loop = true
      return src
    }

    const scrubSource = loop(tex.roar)
    const scrubBand = ctx.createBiquadFilter()
    scrubBand.type = 'bandpass'
    scrubBand.frequency.value = tu.scrubHz[0]
    scrubBand.Q.value = 0.8
    const scrub = ctx.createGain()
    scrub.gain.value = 0
    scrubSource.connect(scrubBand).connect(scrub).connect(master)

    const gritSource = loop(tex.chatter)
    const gritBand = ctx.createBiquadFilter()
    gritBand.type = 'bandpass'
    gritBand.frequency.value = 1500
    gritBand.Q.value = 0.6
    const grit = ctx.createGain()
    grit.gain.value = 0
    gritSource.connect(gritBand).connect(grit).connect(master)

    const rumbleSource = loop(tex.brown)
    const rumbleLow = ctx.createBiquadFilter()
    rumbleLow.type = 'lowpass'
    rumbleLow.frequency.value = tu.rumbleHz
    const rumble = ctx.createGain()
    rumble.gain.value = 0
    rumbleSource.connect(rumbleLow).connect(rumble).connect(master)

    const sources = [scrubSource, gritSource, rumbleSource]
    // start the loops at different points so the layers never line up
    sources.forEach((s, i) => s.start(0, (i * 0.37 + Math.random()) % (s.buffer as AudioBuffer).duration))
    return { scrub, scrubBand, grit, gritSource, rumble, master, sources }
  }
}
