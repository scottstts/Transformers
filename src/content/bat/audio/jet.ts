import type { AudioMix } from '../../../audio/mix'
import { noise, voice } from '../../transformer/combat/audio/shots'

/**
 * The afterburning turbojet in the nozzle pod, driven every frame by its
 * spooled throttle and by how hard the flame strikes the ground.
 *
 *   turbine   the compressor's whine: a faint tone and its blade-pass
 *             partner a fifth up, following the spool (never shrill; kept
 *             well under the roar, as it is heard from behind the nozzle)
 *   roar      the jet's mixing noise: two decorrelated pink-noise channels
 *             whose lowpass opens with the throttle
 *   reheat    the afterburner's rumble and crackle: sub-bass pressure and
 *             steep crackling shocks, rising faster than the roar
 *   wash      the flame scouring the sand
 *   light-off the reheat lighting: a low thud as the fuel catches
 *
 * The graph is built once and runs silent while the jet is cold.
 */
const ROAR = 0.24
const CRACKLE = 0.14
const RUMBLE = 0.34
const WASH = 0.05
const TURBINE = 0.012
/** Level response to the throttle (s). */
const RESPONSE = 0.06

export class JetVoice {
  private readonly mix: AudioMix
  private graph: {
    roar: GainNode
    roarTone: BiquadFilterNode[]
    crackle: GainNode
    rumble: GainNode
    wash: GainNode
    whine: OscillatorNode[]
    whineGain: GainNode
    master: GainNode
    sources: AudioScheduledSourceNode[]
  } | null = null
  private lit = false

  constructor(mix: AudioMix) {
    this.mix = mix
  }

  /** Build the silent graph (loading). */
  prepare(): void {
    const ctx = this.mix.ctx
    if (ctx && !this.graph) this.build(ctx)
  }

  /** Per frame: spooled throttle 0..1+ and ground impingement 0..1. */
  update(power: number, ground: number): void {
    const ctx = this.mix.ctx
    if (!ctx) return
    const g = this.graph ?? this.build(ctx)
    const t = ctx.currentTime
    const p = this.mix.enabled ? Math.max(0, Math.min(1.3, power)) : 0
    if (!this.lit && p > 0.25) {
      this.lit = true
      this.lightOff(p)
    } else if (this.lit && p < 0.08) this.lit = false
    g.roar.gain.setTargetAtTime(ROAR * Math.pow(p, 1.1), t, RESPONSE)
    for (const lp of g.roarTone) lp.frequency.setTargetAtTime(380 + 2400 * p, t, RESPONSE)
    g.crackle.gain.setTargetAtTime(CRACKLE * Math.pow(Math.max(0, p - 0.2) / 0.8, 1.6), t, RESPONSE)
    g.rumble.gain.setTargetAtTime(RUMBLE * p * (0.7 + 0.6 * ground), t, RESPONSE)
    g.wash.gain.setTargetAtTime(WASH * ground, t, RESPONSE * 2)
    // the spool: the turbine speeds up and runs down behind the throttle
    const spool = 900 + 2300 * Math.min(1, p)
    g.whine[0].frequency.setTargetAtTime(spool, t, 0.35)
    g.whine[1].frequency.setTargetAtTime(spool * 1.5, t, 0.35)
    g.whineGain.gain.setTargetAtTime(TURBINE * Math.min(1, p * 1.5), t, 0.3)
  }

  dispose(): void {
    const g = this.graph
    if (!g) return
    for (const s of g.sources) s.stop()
    g.master.disconnect()
    this.graph = null
    this.lit = false
  }

  /** The reheat catching: a low, soft thud and a puff of roar. */
  private lightOff(strength: number): void {
    const ctx = this.mix.ctx as AudioContext
    const t = ctx.currentTime + 0.01
    const bus = voice(this.mix, 0.35 * Math.min(1.2, strength), 0.5, 1.2)
    noise(ctx, this.mix.tex.brown, bus, t, 0.7, 'lowpass', 300, 90, 0.02, 0.9)
    noise(ctx, this.mix.tex.roar, bus, t, 0.5, 'bandpass', 520, 520, 0.03, 0.35, 0.2, 0.7)
  }

  private build(ctx: AudioContext) {
    const out = this.mix.output
    const master = ctx.createGain()
    master.connect(out.dry)
    const send = ctx.createGain()
    send.gain.value = 0.5
    master.connect(send).connect(out.send)
    // chest resonance of a jet heard close by
    const body = ctx.createBiquadFilter()
    body.type = 'peaking'
    body.frequency.value = 140
    body.Q.value = 0.7
    body.gain.value = 6
    body.connect(master)
    const sources: AudioScheduledSourceNode[] = []
    const loop = (buffer: AudioBuffer, offset: number, rate: number): AudioBufferSourceNode => {
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.loop = true
      src.playbackRate.value = rate
      src.start(0, offset % buffer.duration)
      sources.push(src)
      return src
    }

    const roar = ctx.createGain()
    roar.gain.value = 0
    roar.connect(body)
    const roarTone: BiquadFilterNode[] = []
    for (const [offset, pan] of [[0.4, -0.3], [3.3, 0.3]]) {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 600
      lp.Q.value = 0.5
      const p = ctx.createStereoPanner()
      p.pan.value = pan
      loop(this.mix.tex.roar, offset, 0.92).connect(lp).connect(p).connect(roar)
      roarTone.push(lp)
    }

    const crackle = ctx.createGain()
    crackle.gain.value = 0
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 260
    const soften = ctx.createBiquadFilter()
    soften.type = 'lowpass'
    soften.frequency.value = 5200
    loop(this.mix.tex.crackle, 0.9, 0.8).connect(hp).connect(soften).connect(crackle).connect(master)

    const rumble = ctx.createGain()
    rumble.gain.value = 0
    const sub = ctx.createBiquadFilter()
    sub.type = 'lowpass'
    sub.frequency.value = 70
    loop(this.mix.tex.brown, 1.7, 0.7).connect(sub).connect(rumble).connect(master)

    const wash = ctx.createGain()
    wash.gain.value = 0
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 2300
    band.Q.value = 0.5
    loop(this.mix.tex.white, 0.3, 1).connect(band).connect(wash).connect(master)

    const whineGain = ctx.createGain()
    whineGain.gain.value = 0
    const whineTone = ctx.createBiquadFilter()
    whineTone.type = 'lowpass'
    whineTone.frequency.value = 3000
    whineGain.connect(whineTone).connect(master)
    const whine = [0, 1].map((k) => {
      const o = ctx.createOscillator()
      o.frequency.value = 900 * (k ? 1.5 : 1)
      const g = ctx.createGain()
      g.gain.value = k ? 0.45 : 1
      o.connect(g).connect(whineGain)
      o.start()
      sources.push(o)
      return o
    })
    this.graph = { roar, roarTone, crackle, rumble, wash, whine, whineGain, master, sources }
    return this.graph
  }
}
