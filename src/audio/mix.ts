import { renderTextures, type Textures } from './textures'

/** Where a voice connects: the dry bus and the reverb send. */
export interface VoiceOutput {
  dry: AudioNode
  send: AudioNode
}

const OUT_LEVEL = 0.9
/** The air lowpass at rest, and fully muffled (Hz). */
const AIR_OPEN = 11000
const AIR_MUFFLED = 520

/**
 * The game's one audio context and mix, shared by every character's voices.
 *
 * Created on the first user interaction (browsers keep audio suspended until
 * then). Everything goes through a bus compressor, a gentle air lowpass and an
 * outdoor space: a ground reflection, sparse early reflections and a short
 * dark tail (open desert, nothing to reverberate against for long). Source
 * textures (noise, chatter, roar, crackle) are rendered once here.
 *
 * Voices build their graphs lazily: `ctx` is null until the first `resume()`.
 */
export class AudioMix {
  ctx: AudioContext | null = null
  private muted = false
  /** output silenced for a moment (a car loading behind the switch modal); voices keep running */
  private held = false
  private out!: GainNode
  private dryBus!: GainNode
  private verbSend!: GainNode
  private air!: BiquadFilterNode
  private textures!: Textures

  get output(): VoiceOutput {
    return { dry: this.dryBus, send: this.verbSend }
  }

  get tex(): Textures {
    return this.textures
  }

  get enabled(): boolean {
    return !this.muted
  }

  /** Called on user interaction: creates the context on first use and resumes it. */
  resume(): void {
    if (this.init() && this.ctx?.state === 'suspended') void this.ctx.resume()
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    this.level(0.05)
  }

  /**
   * Hold the output silent, or release it with a short fade-in. Unlike `setMuted`
   * the voices keep running, so what was held (an engine starting while its car
   * loads) is heard in step when the picture appears.
   */
  hold(held: boolean): void {
    this.held = held
    this.level(held ? 0.03 : 0.12)
  }

  /**
   * Close the whole mix down toward a dull, distant thud (0 open, 1 fully
   * muffled) over `seconds`: a moment held out of time, as films play slow
   * motion, and back.
   */
  muffle(amount: number, seconds: number): void {
    if (!this.ctx) return
    const f = AIR_OPEN * Math.pow(AIR_MUFFLED / AIR_OPEN, Math.min(1, Math.max(0, amount)))
    this.air.frequency.setTargetAtTime(f, this.ctx.currentTime, Math.max(0.01, seconds / 3))
  }

  private level(fade: number): void {
    if (this.ctx) this.out.gain.setTargetAtTime(this.muted || this.held ? 0 : OUT_LEVEL, this.ctx.currentTime, fade)
  }

  private init(): boolean {
    if (this.ctx) return true
    const Context = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Context) return false
    const ctx = new Context()
    this.out = ctx.createGain()
    this.out.gain.value = this.muted || this.held ? 0 : OUT_LEVEL
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -16
    comp.knee.value = 10
    comp.ratio.value = 3
    comp.attack.value = 0.01
    comp.release.value = 0.25
    // distance and air: the listener stands several metres off a large machine
    const air = ctx.createBiquadFilter()
    air.type = 'lowpass'
    air.frequency.value = AIR_OPEN
    air.Q.value = 0.5
    this.air = air
    this.dryBus = ctx.createGain()
    this.dryBus.connect(air).connect(comp).connect(this.out).connect(ctx.destination)
    const verb = ctx.createConvolver()
    verb.buffer = outdoorImpulse(ctx)
    this.verbSend = ctx.createGain()
    this.verbSend.gain.value = 0.5
    this.verbSend.connect(verb).connect(this.dryBus)
    this.textures = renderTextures(ctx)
    this.ctx = ctx
    return true
  }
}

function outdoorImpulse(ctx: AudioContext): AudioBuffer {
  const seconds = 0.9
  const n = Math.floor(ctx.sampleRate * seconds)
  const b = ctx.createBuffer(2, n, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c)
    // ground bounce at ~5-8 ms, sparse early reflections to 70 ms, short dark tail
    d[Math.floor(ctx.sampleRate * (0.005 + c * 0.0015))] = 0.55
    for (let k = 0; k < 7; k++) d[Math.floor(ctx.sampleRate * (0.012 + Math.random() * 0.06))] += (Math.random() * 2 - 1) * 0.3
    let lp = 0
    for (let i = 0; i < n; i++) {
      const t = i / ctx.sampleRate
      lp += (Math.random() * 2 - 1 - lp) * (0.5 - 0.35 * Math.min(1, t / 0.6))
      d[i] += lp * Math.exp(-t * 7.5) * Math.min(1, t / 0.015) * 0.35
    }
  }
  return b
}
