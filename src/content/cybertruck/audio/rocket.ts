import type { Textures } from '../../../audio/textures'
import type { VoiceOutput } from '../../../audio/mix'

/**
 * Rocket burn of the lift thrusters, driven every frame by throttle and by how
 * hard the exhaust strikes the ground.
 *
 *   roar     decorrelated pink noise in two channels with turbulent swells; the
 *            lowpass opens with throttle (a hotter, faster jet is brighter)
 *   crackle  steep positive shocks, rising faster than the roar with throttle
 *   rumble   sub-bass pressure, reinforced when the jet is close to the ground
 *   wash     the sand-blasting hiss of the exhaust scouring the surface
 *   ignition a low "whump" as the jets light
 *
 * The graph is built once and runs silent between burns.
 */
const ROAR = 0.2
const CRACKLE = 0.11
const RUMBLE = 0.3
const WASH = 0.045
const RESPONSE = 0.05 // s: throttle response of the levels

export class RocketVoice {
  private readonly ctx: AudioContext
  private readonly tex: Textures
  private readonly out: VoiceOutput
  private readonly roar: GainNode
  private readonly roarTone: BiquadFilterNode[] = []
  private readonly crackle: GainNode
  private readonly rumble: GainNode
  private readonly wash: GainNode
  private readonly master: GainNode
  private readonly loops: AudioBufferSourceNode[] = []
  private lit = false

  constructor(ctx: AudioContext, textures: Textures, out: VoiceOutput) {
    this.ctx = ctx
    this.tex = textures
    this.out = out
    const master = ctx.createGain()
    master.gain.value = 1
    master.connect(out.dry)
    this.master = master
    const send = ctx.createGain()
    send.gain.value = 0.45
    master.connect(send).connect(out.send)
    // chest resonance of a jet heard from nearby
    const body = ctx.createBiquadFilter()
    body.type = 'peaking'
    body.frequency.value = 170
    body.Q.value = 0.7
    body.gain.value = 5
    body.connect(master)

    this.roar = ctx.createGain()
    this.roar.gain.value = 0
    this.roar.connect(body)
    for (const [offset, pan] of [[0, -0.35], [2.9, 0.35]]) {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 800
      lp.Q.value = 0.5
      const p = ctx.createStereoPanner()
      p.pan.value = pan
      this.loop(textures.roar, offset, 1).connect(lp).connect(p).connect(this.roar)
      this.roarTone.push(lp)
    }

    this.crackle = ctx.createGain()
    this.crackle.gain.value = 0
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 380
    const soften = ctx.createBiquadFilter()
    soften.type = 'lowpass'
    soften.frequency.value = 7000
    this.loop(textures.crackle, 0, 1).connect(hp).connect(soften).connect(this.crackle).connect(master)

    this.rumble = ctx.createGain()
    this.rumble.gain.value = 0
    const sub = ctx.createBiquadFilter()
    sub.type = 'lowpass'
    sub.frequency.value = 85
    this.loop(textures.brown, 1.3, 0.8).connect(sub).connect(this.rumble).connect(master)

    this.wash = ctx.createGain()
    this.wash.gain.value = 0
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 2600
    band.Q.value = 0.5
    this.loop(textures.white, 0.7, 1).connect(band).connect(this.wash).connect(master)
  }

  /** Per frame: throttle 0..1 and ground impingement 0..1. */
  update(power: number, ground: number): void {
    const t = this.ctx.currentTime
    if (!this.lit && power > 0.05) {
      this.lit = true
      this.ignite(t)
    } else if (this.lit && power < 0.02) {
      this.lit = false
    }
    const p = Math.max(0, power)
    this.roar.gain.setTargetAtTime(ROAR * Math.pow(p, 1.1), t, RESPONSE)
    for (const lp of this.roarTone) lp.frequency.setTargetAtTime(600 + 2600 * p, t, RESPONSE)
    this.crackle.gain.setTargetAtTime(CRACKLE * Math.pow(p, 1.8), t, RESPONSE)
    this.rumble.gain.setTargetAtTime(RUMBLE * p * (0.6 + 0.8 * ground), t, RESPONSE)
    this.wash.gain.setTargetAtTime(WASH * ground, t, RESPONSE * 2)
  }

  /** Stops the looping textures and leaves the mix. */
  dispose(): void {
    for (const src of this.loops) src.stop()
    this.master.disconnect()
  }

  private ignite(t: number): void {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.tex.brown
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(420, t)
    lp.frequency.exponentialRampToValueAtTime(110, t + 0.5)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.45, t + 0.05)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9)
    src.connect(lp).connect(g).connect(this.out.dry)
    src.start(t, Math.random() * 1.5)
    src.stop(t + 1)
  }

  private loop(buffer: AudioBuffer, offset: number, rate: number): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    src.playbackRate.value = rate
    src.start(0, offset % buffer.duration)
    this.loops.push(src)
    return src
  }
}
