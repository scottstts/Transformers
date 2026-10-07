import type { AudioMix } from '../../../audio/mix'
import { shapedNoise } from '../../../audio/spectral'
import { ENGINE_BANDS, ENGINE_TIMBRE, type EngineTimbre } from './engine-model'

/**
 * The Impala's big-block V8, rebuilt from the recording's measured timbre
 * (engine-model.ts, tools/engine-model.mjs) rather than designed by ear.
 *
 *   orders  the engine orders at the cycle frequency (rpm / 120) as one
 *           periodic wave per measured timbre, low revs and high, crossfaded
 *           by revs (log scale between their firing frequencies), at their
 *           measured amplitudes: the firing order, its second and third
 *           harmonics, the cross-plane crank's weaker half orders. A copy a
 *           few cents off is the other bank's pipe; their slow beating is
 *           what keeps a real engine from sounding like an oscillator
 *   noise   the noise between the orders, as measured by band at each
 *           timbre's firing frequency, looped and played at the revs' ratio
 *           to it (so it rises with the engine), at its measured level
 *           against the orders, pulsed at the firing rate as deeply as the
 *           recording's
 *   load    under load the pull's timbre; off the throttle (the overrun and
 *           the idle) the top closes and the noise falls back, leaving the
 *           low burble
 *
 * A Turbo Hydra-Matic three-speed: ratios 2.48 / 1.48 / 1.00 (the
 * recording's shift drops the revs by about 1.45, its 2-3), shift points
 * rising with throttle, a firm shift (a short dip and the note drops onto the
 * next ratio), kickdown at full throttle. It idles at 650 rpm with a lumpy
 * cam, starts with a flare and runs down as the car transforms.
 */

/** Road speed (m/s) at REDLINE in each gear: the top gear's, over the ratios. */
const RATIOS = [2.48, 1.48, 1]
const TOP = 54
const GEAR_TOP = RATIOS.map((r) => TOP / r)
const REDLINE = 5600
const IDLE = 650
/** Upshift revs at a light and at a full throttle; downshift below this. */
const SHIFT: readonly [number, number] = [2300, 5300]
const DOWNSHIFT = 1500
/** The converter lets the engine run up under throttle off the line. */
const STALL_RPM = 2200
const STALL_SPEED = 6
/**
 * Output level at full load (the measured orders and noise are at their own
 * amplitude, about 1.2 RMS: this sits the big-block about 2 dB over the Bat's
 * V8 in the mix), and on the overrun / idle (fractions of it).
 */
const LEVEL = 0.016
const OVERRUN = 0.34
const IDLE_LEVEL = 0.36
/** The other bank's pipe: detuned (ratio) and its share. */
const BANK = 1.0028
const BANK_SHARE = 0.4
/** Shaped-noise loop length (samples, a power of two). */
const LOOP = 1 << 16
/** Noise playback rate limits (its ratio to a timbre's firing frequency). */
const RATE: readonly [number, number] = [0.25, 2.2]

/** The automatic's gear and the revs it gives: pure state, one update per frame. */
export class Hydramatic {
  gear = 0
  rpm = IDLE

  update(speed: number, load: number): 'up' | 'down' | null {
    const v = Math.abs(speed)
    const shift = this.select(v, load)
    let rpm = Math.max(IDLE, REDLINE * v / GEAR_TOP[this.gear])
    // the converter slips: the engine runs ahead of the wheels under load at low speed
    const stall = STALL_SPEED * (this.gear + 1)
    if (v < stall && load > 0) rpm = Math.max(rpm, IDLE + (STALL_RPM - IDLE) * load * (1 - v / stall * 0.6))
    this.rpm = Math.min(rpm, REDLINE + 120)
    return shift
  }

  private select(v: number, load: number): 'up' | 'down' | null {
    const rpm = REDLINE * v / GEAR_TOP[this.gear]
    const up = SHIFT[0] + (SHIFT[1] - SHIFT[0]) * load
    if (rpm > up && this.gear < GEAR_TOP.length - 1) {
      this.gear++
      return 'up'
    }
    // kickdown: a full throttle drops a gear while the engine would still be under its shift point there
    const lower = this.gear > 0 ? REDLINE * v / GEAR_TOP[this.gear - 1] : Infinity
    if (this.gear > 0 && (rpm < DOWNSHIFT || (load > 0.9 && lower < SHIFT[1] * 0.82 && rpm < 3400))) {
      this.gear--
      return 'down'
    }
    return null
  }
}

interface Graph {
  /** the two timbres' orders, and each one's other bank */
  tones: OscillatorNode[]
  /** each timbre's share (orders and noise) */
  blend: [GainNode, GainNode]
  noises: AudioBufferSourceNode[]
  /** the firing-rate pulse on the noise */
  pulse: OscillatorNode
  pulseDepth: [GainNode, GainNode]
  noiseLevel: [GainNode, GainNode]
  /** the top closes off the throttle */
  top: BiquadFilterNode
  level: GainNode
  sources: AudioScheduledSourceNode[]
}

/** A timbre's noise loop, rendered once per context (the shaped spectrum's FFT is the only cost). */
const loops = new WeakMap<BaseAudioContext, AudioBuffer[]>()

function noiseLoops(ctx: BaseAudioContext): AudioBuffer[] {
  let out = loops.get(ctx)
  if (!out) {
    out = (['low', 'high'] as const).map((name, i) => {
      const samples = shapedNoise(LOOP, ctx.sampleRate, ENGINE_BANDS, ENGINE_TIMBRE[name].noise, 0x1967 + i * 7919)
      const buffer = ctx.createBuffer(1, LOOP, ctx.sampleRate)
      buffer.copyToChannel(samples, 0)
      return buffer
    })
    loops.set(ctx, out)
  }
  return out
}

/** RMS of a timbre's orders as its periodic wave plays them (unit firing order). */
function ordersRms(t: EngineTimbre): number {
  return Math.sqrt(t.orders.reduce((s, a) => s + a * a / 2, 0))
}

export class BigBlock {
  private readonly mix: AudioMix
  private graph: Graph | null = null
  readonly box = new Hydramatic()
  private running = false
  private lope = 0
  private lopePhase = 0
  /** audio time until which a scheduled start flare or shift owns the pitch / level */
  private pitchHold = 0
  private levelHold = 0

  constructor(mix: AudioMix) {
    this.mix = mix
  }

  /** Per frame: road speed (m/s), throttle -1..1, the car is in car form. */
  update(dt: number, speed: number, throttle: number, on: boolean): void {
    const ctx = this.mix.ctx
    if (!ctx) return
    const g = this.graph ?? (this.graph = this.build(ctx))
    const t = ctx.currentTime
    const enabled = on && this.mix.enabled
    if (enabled && !this.running) this.start(g, t)
    if (!enabled && this.running) this.stop(g, t)
    if (!this.running) return

    const v = Math.abs(speed)
    const load = Math.max(0, throttle)
    const shift = this.box.update(v, load)
    let rpm = this.box.rpm
    const idling = v < 0.5 && load === 0
    // a lumpy cam: the idle hunts, a slow uneven wander
    this.lopePhase += dt * 1.5
    this.lope += ((Math.random() * 2 - 1) * 55 + Math.sin(this.lopePhase) * 45 - this.lope) * Math.min(1, dt * 5)
    if (idling) rpm += this.lope

    const response = shift ? 0.08 : 0.05
    if (t >= this.pitchHold) this.tune(g, rpm, t, response)
    // the timbres by revs, and the top by load: the pull opens it, the overrun closes it down to the burble
    const firing = rpm / 15
    const u = Math.min(1, Math.max(0, Math.log(firing / ENGINE_TIMBRE.low.firing) / Math.log(ENGINE_TIMBRE.high.firing / ENGINE_TIMBRE.low.firing)))
    g.blend[0].gain.setTargetAtTime(Math.cos(u * Math.PI / 2), t, 0.06)
    g.blend[1].gain.setTargetAtTime(Math.sin(u * Math.PI / 2), t, 0.06)
    g.top.frequency.setTargetAtTime(1400 + 9000 * load * load + 1600 * u, t, 0.07)
    for (let i = 0; i < 2; i++) g.noiseLevel[i].gain.setTargetAtTime(this.noiseGain(i) * (0.45 + 0.55 * load), t, 0.07)
    const level = idling ? IDLE_LEVEL : OVERRUN + (1 - OVERRUN) * load
    const target = LEVEL * level
    if (shift === 'up' && t >= this.levelHold) {
      // a firm shift: a short dip as the band applies and the note drops onto the next ratio
      g.level.gain.cancelScheduledValues(t)
      g.level.gain.setValueAtTime(g.level.gain.value, t)
      g.level.gain.linearRampToValueAtTime(target * 0.62, t + 0.04)
      g.level.gain.linearRampToValueAtTime(target, t + 0.16)
      this.levelHold = t + 0.16
    } else if (t >= this.levelHold) {
      g.level.gain.setTargetAtTime(target, t, 0.07)
    }
  }

  dispose(): void {
    const g = this.graph
    if (!g) return
    for (const s of g.sources) s.stop()
    g.level.disconnect()
    this.graph = null
    this.running = false
  }

  /** Every oscillator and loop onto the revs. */
  private tune(g: Graph, rpm: number, t: number, response: number): void {
    const cycle = rpm / 120
    g.tones[0].frequency.setTargetAtTime(cycle, t, response)
    g.tones[1].frequency.setTargetAtTime(cycle * BANK, t, response)
    g.tones[2].frequency.setTargetAtTime(cycle, t, response)
    g.tones[3].frequency.setTargetAtTime(cycle * BANK, t, response)
    g.pulse.frequency.setTargetAtTime(cycle * 8, t, response)
    const timbres = [ENGINE_TIMBRE.low, ENGINE_TIMBRE.high]
    for (let i = 0; i < 2; i++) {
      const rate = Math.min(RATE[1], Math.max(RATE[0], cycle * 8 / timbres[i].firing))
      g.noises[i].playbackRate.setTargetAtTime(rate, t, response)
    }
  }

  /** A timbre's noise at its measured RMS against its orders (whose firing order is 1). */
  private noiseGain(i: number): number {
    const timbre = i === 0 ? ENGINE_TIMBRE.low : ENGINE_TIMBRE.high
    return timbre.noiseToTone * ordersRms(timbre) * (1 + BANK_SHARE) / Math.sqrt(1 + BANK_SHARE * BANK_SHARE)
  }

  /** The starter turns it over, it catches with a flare and settles into its lumpy idle. */
  private start(g: Graph, t: number): void {
    this.running = true
    this.box.gear = 0
    this.pitchHold = t + 1.3
    this.levelHold = t + 1.3
    const set = (rpm: number, at: number, kind: 'set' | 'lin' | 'exp'): void => {
      const cycle = rpm / 120
      const k = [1, BANK, 1, BANK]
      g.tones.forEach((o, i) => {
        if (kind === 'set') o.frequency.setValueAtTime(cycle * k[i], at)
        else if (kind === 'lin') o.frequency.linearRampToValueAtTime(cycle * k[i], at)
        else o.frequency.exponentialRampToValueAtTime(cycle * k[i], at)
      })
      if (kind === 'set') g.pulse.frequency.setValueAtTime(cycle * 8, at)
      else if (kind === 'lin') g.pulse.frequency.linearRampToValueAtTime(cycle * 8, at)
      else g.pulse.frequency.exponentialRampToValueAtTime(cycle * 8, at)
    }
    for (const o of [...g.tones, g.pulse]) o.frequency.cancelScheduledValues(t)
    set(200, t, 'set')
    set(280, t + 0.5, 'lin')
    set(1900, t + 0.85, 'exp')
    for (const [i, o] of g.tones.entries()) o.frequency.setTargetAtTime(IDLE / 120 * (i % 2 ? BANK : 1), t + 0.9, 0.3)
    g.pulse.frequency.setTargetAtTime(IDLE / 15, t + 0.9, 0.3)
    g.level.gain.cancelScheduledValues(t)
    g.level.gain.setValueAtTime(0, t)
    g.level.gain.linearRampToValueAtTime(LEVEL * 0.22, t + 0.5)
    g.level.gain.linearRampToValueAtTime(LEVEL * 0.85, t + 0.83)
    g.level.gain.setTargetAtTime(LEVEL * IDLE_LEVEL, t + 0.95, 0.35)
  }

  /** Ignition off: it runs down in about a second. */
  private stop(g: Graph, t: number): void {
    this.running = false
    g.tones.forEach((o, i) => {
      o.frequency.cancelScheduledValues(t)
      o.frequency.setValueAtTime(o.frequency.value, t)
      o.frequency.exponentialRampToValueAtTime((i % 2 ? BANK : 1) * 140 / 120, t + 1.2)
    })
    g.level.gain.cancelScheduledValues(t)
    g.level.gain.setValueAtTime(g.level.gain.value, t)
    g.level.gain.setTargetAtTime(0, t, 0.3)
  }

  private build(ctx: AudioContext): Graph {
    const out = this.mix.output
    const level = ctx.createGain()
    level.gain.value = 0
    // heard in the open a few metres off: the air dulls the very top a little
    const air = ctx.createBiquadFilter()
    air.type = 'lowpass'
    air.frequency.value = 9000
    air.Q.value = 0.5
    level.connect(air).connect(out.dry)
    const send = ctx.createGain()
    send.gain.value = 0.3
    air.connect(send).connect(out.send)
    const top = ctx.createBiquadFilter()
    top.type = 'lowpass'
    top.frequency.value = 1500
    top.Q.value = 0.55
    top.connect(level)

    const sources: AudioScheduledSourceNode[] = []
    const tones: OscillatorNode[] = []
    const blend: GainNode[] = []
    const noises: AudioBufferSourceNode[] = []
    const pulseDepth: GainNode[] = []
    const noiseLevel: GainNode[] = []
    const pulse = ctx.createOscillator()
    pulse.frequency.value = IDLE / 15
    sources.push(pulse)
    const buffers = noiseLoops(ctx)
    ;(['low', 'high'] as const).forEach((name, i) => {
      const timbre = ENGINE_TIMBRE[name]
      const mixGain = ctx.createGain()
      mixGain.gain.value = i === 0 ? 1 : 0
      mixGain.connect(top)
      blend.push(mixGain)
      // the orders at their measured amplitudes, fixed pseudo-random phases (a pulse train, not a buzz)
      const n = timbre.orders.length
      const real = new Float32Array(n + 1), imag = new Float32Array(n + 1)
      timbre.orders.forEach((a, j) => {
        const phase = (j + 1) * 2.399
        real[j + 1] = a * Math.cos(phase)
        imag[j + 1] = a * Math.sin(phase)
      })
      const wave = ctx.createPeriodicWave(real, imag, { disableNormalization: true })
      // both banks together keep the measured orders' level
      const norm = 1 / Math.sqrt(1 + BANK_SHARE * BANK_SHARE)
      for (const [detune, share] of [[1, 1], [BANK, BANK_SHARE]] as const) {
        const o = ctx.createOscillator()
        o.setPeriodicWave(wave)
        o.frequency.value = IDLE / 120 * detune
        const gain = ctx.createGain()
        gain.gain.value = share * norm
        o.connect(gain).connect(mixGain)
        tones.push(o)
        sources.push(o)
      }
      // the noise between the orders, at its measured level, pulsed at the firing rate
      const noise = ctx.createBufferSource()
      noise.buffer = buffers[i]
      noise.loop = true
      noise.playbackRate.value = IDLE / 15 / timbre.firing
      const nl = ctx.createGain()
      nl.gain.value = this.noiseGain(i)
      const pulsed = ctx.createGain()
      pulsed.gain.value = 1 - timbre.pulse
      const depth = ctx.createGain()
      depth.gain.value = timbre.pulse
      pulse.connect(depth).connect(pulsed.gain)
      noise.connect(nl).connect(pulsed).connect(mixGain)
      noises.push(noise)
      pulseDepth.push(depth)
      noiseLevel.push(nl)
      sources.push(noise)
    })
    for (const s of sources) s.start()
    return {
      tones, blend: blend as [GainNode, GainNode], noises, pulse,
      pulseDepth: pulseDepth as [GainNode, GainNode], noiseLevel: noiseLevel as [GainNode, GainNode],
      top, level, sources,
    }
  }
}
