import type { AudioMix } from '../../../../audio/mix'

/** How a character's limbs and weapon cut the air. */
export interface SwingTuning {
  /** turbulent body band centre at full speed (Hz): a big blunt limb or axe head roars low */
  bodyHz: number
  /** edge band centre at full speed (Hz): the thin trailing edge's hiss, lower for a thick edge */
  edgeHz: number
  /** speed (m/s) of a full swing */
  speed: number
  /** share of the edge band in the mix */
  edge: number
  level: number
}

/** Response of the voice to the swing (s). */
const RESPONSE = 0.025

/**
 * The air a swing moves, as a microphone metres away hears it. Flow noise off
 * a moving body rises steeply with speed (its acoustic power goes roughly with
 * the sixth power of speed, so the amplitude with its cube) and its spectrum
 * slides up with speed (vortex shedding scales as speed over thickness): a
 * turbulent body band from the pink "roar" texture and a narrower band for the
 * edge from white noise, both following the fastest edge every frame. Silent
 * at rest; the graph is built once and runs quietly between swings.
 */
export class SwingVoice {
  private readonly mix: AudioMix
  private readonly tuning: SwingTuning
  private graph: { body: BiquadFilterNode; edge: BiquadFilterNode; gain: GainNode; edgeGain: GainNode; loops: AudioBufferSourceNode[]; out: GainNode } | null = null

  constructor(mix: AudioMix, tuning: SwingTuning) {
    this.mix = mix
    this.tuning = tuning
  }

  /** Per frame: the fastest cutting edge's speed (m/s). */
  update(speed: number): void {
    const ctx = this.mix.ctx
    if (!ctx) return
    const g = this.graph ?? this.build(ctx)
    const tune = this.tuning
    const x = Math.min(1.6, Math.max(0, speed / tune.speed))
    const t = ctx.currentTime
    const level = this.mix.enabled ? tune.level * Math.min(1, x * x * x) : 0
    g.gain.gain.setTargetAtTime(level, t, RESPONSE)
    g.body.frequency.setTargetAtTime(tune.bodyHz * (0.35 + 0.65 * x), t, RESPONSE)
    g.edge.frequency.setTargetAtTime(tune.edgeHz * (0.3 + 0.7 * x), t, RESPONSE)
    g.edgeGain.gain.setTargetAtTime(tune.edge * Math.min(1, x), t, RESPONSE)
  }

  dispose(): void {
    if (!this.graph) return
    for (const l of this.graph.loops) l.stop()
    this.graph.out.disconnect()
    this.graph = null
  }

  private build(ctx: AudioContext) {
    const out = ctx.createGain()
    out.connect(this.mix.output.dry)
    const send = ctx.createGain()
    send.gain.value = 0.3
    out.connect(send).connect(this.mix.output.send)
    const gain = ctx.createGain()
    gain.gain.value = 0
    // heard from a distance: the air takes the top off
    const distance = ctx.createBiquadFilter()
    distance.type = 'lowpass'
    distance.frequency.value = 3200
    gain.connect(distance).connect(out)
    const loop = (buffer: AudioBuffer, offset: number): AudioBufferSourceNode => {
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.loop = true
      src.start(0, offset % buffer.duration)
      return src
    }
    const body = ctx.createBiquadFilter()
    body.type = 'bandpass'
    body.Q.value = 0.7
    const bodyLoop = loop(this.mix.tex.roar, Math.random() * 5)
    bodyLoop.connect(body).connect(gain)
    const edge = ctx.createBiquadFilter()
    edge.type = 'bandpass'
    edge.Q.value = 1.6
    const edgeGain = ctx.createGain()
    edgeGain.gain.value = 0
    const edgeLoop = loop(this.mix.tex.white, Math.random() * 1.5)
    edgeLoop.connect(edge).connect(edgeGain).connect(gain)
    this.graph = { body, edge, gain, edgeGain, loops: [bodyLoop, edgeLoop], out }
    return this.graph
  }
}
