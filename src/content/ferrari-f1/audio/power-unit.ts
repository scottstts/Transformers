import type { AudioMix } from '../../../audio/mix'

/**
 * The car's 1.6 L V6 turbo-hybrid power unit, synthesized from its physics.
 *
 *   tone        one oscillator at the engine's cycle frequency (rpm / 120: one
 *               four-stroke cycle) carrying the engine orders as harmonics:
 *               the firing order (6 per cycle, 3 per crank revolution) and its
 *               multiples dominate, the bank order (3 per cycle, each bank of
 *               three fires alone into its own exhaust) is strong, and weak
 *               orders in between come from cylinder-to-cylinder spread. A
 *               second copy a few cents off is the other bank / intake side:
 *               their slow beating is the texture of a real engine note
 *   combustion  band-limited noise amplitude-modulated at the firing frequency:
 *               the exhaust's pulsing rasp, brighter and louder under load
 *   turbo       the compressor and MGU-H: a faint high whine that follows
 *               boost (rpm x load), well below the engine
 *   MGU-K       the electric motor on the crank: a faint whine following road
 *               speed, audible mostly on the overrun
 *
 * Gearing is an 8-speed seamless-shift box: upshifts at 11 600 rpm drop the
 * engine onto the next ratio with a few milliseconds of torque interruption
 * (no clunk), downshifts are rev-matched. It idles at ~4 800 rpm with the
 * slightly uneven note of a race engine and starts with a rev flare.
 *
 * Free-revved in neutral against its limiter (a special's gather), the
 * ignition cuts in and out: level and pitch stutter at the limiter's rate.
 */

/** Road speed (m/s) at 12 000 rpm in each gear. */
export const GEAR_TOP = [22, 30, 38, 46, 54, 62, 71, 82]
export const REDLINE = 12000
const UPSHIFT = 11600
const DOWNSHIFT = 7600
export const IDLE = 4800
/** Launch: the clutch slips the engine up to this under full throttle below this speed. */
const LAUNCH_RPM = 9500
const LAUNCH_SPEED = 9
/** Level of the whole unit at full load, and on the overrun / idle (fractions). */
const LEVEL = 0.075
const OVERRUN = 0.4
const IDLE_LEVEL = 0.28
/** The rev limiter: its cut-in rpm, how fast it bounces (Hz), how far it cuts the level and pulls the pitch (cents). */
const LIMITER = { rpm: REDLINE - 150, hz: 13, cut: 0.32, cents: 30 }
/** Engine orders (harmonic of the cycle frequency) and their amplitudes. */
const ORDERS: Array<[number, number]> = [
  [1, 0.1], [2, 0.16], [3, 0.5], [4, 0.14], [5, 0.1], [6, 1], [7, 0.09], [8, 0.1], [9, 0.34],
  [10, 0.07], [11, 0.05], [12, 0.55], [13, 0.04], [15, 0.2], [18, 0.3], [21, 0.1], [24, 0.14], [27, 0.05], [30, 0.07], [36, 0.04],
]

/**
 * The 8-speed seamless box and the engine speed it gives: pure state, one
 * update per frame. Upshifts at UPSHIFT, rev-matched downshifts below
 * DOWNSHIFT, clutch slip holds launch revs off the line.
 */
export class Gearbox {
  /** 0-based gear */
  gear = 0
  rpm = IDLE

  update(speed: number, load: number): 'up' | 'down' | null {
    const v = Math.abs(speed)
    const shift = this.select(v)
    let rpm = Math.max(IDLE, REDLINE * v / GEAR_TOP[this.gear])
    if (this.gear === 0 && v < LAUNCH_SPEED && load > 0) rpm = Math.max(rpm, IDLE + (LAUNCH_RPM - IDLE) * load)
    this.rpm = Math.min(rpm, REDLINE + 200)
    return shift
  }

  private select(v: number): 'up' | 'down' | null {
    const rpm = REDLINE * v / GEAR_TOP[this.gear]
    if (rpm > UPSHIFT && this.gear < GEAR_TOP.length - 1) {
      this.gear++
      return 'up'
    }
    if (this.gear > 0 && rpm < DOWNSHIFT * (this.gear === 1 ? 0.7 : 1)) {
      this.gear--
      return 'down'
    }
    return null
  }
}

interface Graph {
  tone: OscillatorNode
  tone2: OscillatorNode
  pulse: OscillatorNode
  toneFilter: BiquadFilterNode
  rasp: GainNode
  raspFilter: BiquadFilterNode
  turbo: OscillatorNode
  turboGain: GainNode
  mguk: OscillatorNode
  mgukGain: GainNode
  level: GainNode
  /** the limiter's ignition cut: its level gain, the LFO depth into it and into the pitch */
  cut: GainNode
  cutDepth: GainNode
  pitchDepth: GainNode
  sources: AudioScheduledSourceNode[]
}

export class PowerUnit {
  private readonly mix: AudioMix
  private graph: Graph | null = null
  readonly gearbox = new Gearbox()
  private running = false
  private jitter = 0
  /** audio time until which a scheduled start flare or shift dip owns the pitch / level */
  private pitchHold = 0
  private levelHold = 0

  constructor(mix: AudioMix) {
    this.mix = mix
  }

  /**
   * Per frame. `speed` road speed (m/s), `throttle` -1..1 (negative: braking
   * or reverse), `boost` Shift held, `on` the car is in car form; `neutral`
   * (rpm) free-revs it out of gear instead of following the wheels.
   */
  update(dt: number, speed: number, throttle: number, boost: boolean, on: boolean, neutral?: number): void {
    const ctx = this.mix.ctx
    if (!ctx) return
    const g = this.graph ?? (this.graph = this.build(ctx))
    const t = ctx.currentTime
    const enabled = on && this.mix.enabled
    if (enabled && !this.running) this.start(g, t)
    if (!enabled && this.running) this.stop(g, t)
    if (!this.running) return

    const v = Math.abs(speed)
    const load = Math.max(0, throttle) * (boost ? 1 : 0.85)
    const shift = neutral === undefined ? this.gearbox.update(v, load) : null
    let rpm = neutral === undefined ? this.gearbox.rpm : Math.min(REDLINE, Math.max(IDLE, neutral))
    // on the limiter the ignition cuts in and out
    const limiting = rpm >= LIMITER.rpm && load > 0.5
    g.cutDepth.gain.setTargetAtTime(limiting ? LIMITER.cut / 2 : 0, t, 0.02)
    g.cut.gain.setTargetAtTime(limiting ? 1 - LIMITER.cut / 2 : 1, t, 0.02)
    g.pitchDepth.gain.setTargetAtTime(limiting ? LIMITER.cents : 0, t, 0.02)
    // a race engine's idle hunts a little
    this.jitter += ((Math.random() * 2 - 1) * 90 - this.jitter) * Math.min(1, dt * 6)
    const idling = v < 0.5 && load === 0 && neutral === undefined
    if (idling) rpm += this.jitter

    const cycle = rpm / 120
    const pitchFree = t >= this.pitchHold
    const levelFree = t >= this.levelHold
    // shifts are near-instant on a seamless box; otherwise the engine follows the wheels
    const response = shift ? 0.012 : 0.035
    if (pitchFree) {
      g.tone.frequency.setTargetAtTime(cycle, t, response)
      g.tone2.frequency.setTargetAtTime(cycle * 1.0021, t, response)
      g.pulse.frequency.setTargetAtTime(cycle * 6, t, response)
    }
    const rev = (rpm - IDLE) / (REDLINE - IDLE)
    g.toneFilter.frequency.setTargetAtTime(900 + 2600 * load + 1400 * rev, t, 0.06)
    g.raspFilter.frequency.setTargetAtTime(cycle * 12, t, response)
    g.rasp.gain.setTargetAtTime(0.18 + 0.5 * load, t, 0.06)
    const boostLevel = load * Math.max(0, rev)
    g.turbo.frequency.setTargetAtTime(2400 + 0.22 * rpm, t, 0.25)
    g.turboGain.gain.setTargetAtTime(0.012 * boostLevel, t, 0.3)
    g.mguk.frequency.setTargetAtTime(160 + v * 34, t, 0.1)
    g.mgukGain.gain.setTargetAtTime(0.01 * Math.min(1, v / 25) * (1 - 0.6 * load), t, 0.2)
    const level = idling ? IDLE_LEVEL : OVERRUN + (1 - OVERRUN) * load
    const target = LEVEL * level * (0.75 + 0.25 * rev)
    if (shift === 'up' && levelFree) {
      // torque interruption: the note dips for a few milliseconds and comes straight back
      g.level.gain.cancelScheduledValues(t)
      g.level.gain.setValueAtTime(g.level.gain.value, t)
      g.level.gain.linearRampToValueAtTime(target * 0.55, t + 0.018)
      g.level.gain.linearRampToValueAtTime(target, t + 0.07)
      this.levelHold = t + 0.07
    } else if (levelFree) {
      g.level.gain.setTargetAtTime(target, t, 0.05)
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

  /** Fire up: the starter spins it, it catches and flares, then settles to idle. */
  private start(g: Graph, t: number): void {
    this.running = true
    this.gearbox.gear = 0
    this.pitchHold = t + 1.0
    this.levelHold = t + 1.0
    const cycle = (r: number): number => r / 120
    for (const [osc, k] of [[g.tone, 1], [g.tone2, 1.0021], [g.pulse, 6]] as const) {
      osc.frequency.cancelScheduledValues(t)
      osc.frequency.setValueAtTime(cycle(1400) * k, t)
      osc.frequency.linearRampToValueAtTime(cycle(2000) * k, t + 0.35)
      osc.frequency.exponentialRampToValueAtTime(cycle(7600) * k, t + 0.62)
      osc.frequency.setTargetAtTime(cycle(IDLE) * k, t + 0.66, 0.22)
    }
    g.level.gain.cancelScheduledValues(t)
    g.level.gain.setValueAtTime(0, t)
    g.level.gain.linearRampToValueAtTime(LEVEL * 0.2, t + 0.35)
    g.level.gain.linearRampToValueAtTime(LEVEL * 0.8, t + 0.6)
    g.level.gain.setTargetAtTime(LEVEL * IDLE_LEVEL, t + 0.7, 0.3)
  }

  /** Shut down: ignition off, the engine runs down in a second. */
  private stop(g: Graph, t: number): void {
    this.running = false
    for (const [osc, k] of [[g.tone, 1], [g.tone2, 1.0021], [g.pulse, 6]] as const) {
      osc.frequency.cancelScheduledValues(t)
      osc.frequency.setValueAtTime(osc.frequency.value, t)
      osc.frequency.exponentialRampToValueAtTime(k * 900 / 120, t + 1.1)
    }
    g.level.gain.cancelScheduledValues(t)
    g.level.gain.setValueAtTime(g.level.gain.value, t)
    g.level.gain.setTargetAtTime(0, t, 0.28)
    g.turboGain.gain.setTargetAtTime(0, t, 0.4)
    g.mgukGain.gain.setTargetAtTime(0, t, 0.2)
  }

  private build(ctx: AudioContext): Graph {
    const out = this.mix.output
    const level = ctx.createGain()
    level.gain.value = 0
    // heard from outside the car: the airbox, bodywork and distance take the harsh top off
    const distance = ctx.createBiquadFilter()
    distance.type = 'lowpass'
    distance.frequency.value = 5200
    distance.Q.value = 0.4
    const body = ctx.createBiquadFilter()
    body.type = 'peaking'
    body.frequency.value = 260
    body.Q.value = 0.8
    body.gain.value = 3
    const cut = ctx.createGain()
    level.connect(cut).connect(body).connect(distance).connect(out.dry)
    const send = ctx.createGain()
    send.gain.value = 0.3
    distance.connect(send).connect(out.send)

    const n = ORDERS[ORDERS.length - 1][0]
    const real = new Float32Array(n + 1)
    const imag = new Float32Array(n + 1)
    for (const [k, a] of ORDERS) {
      // fixed pseudo-random phases: a pulse train, not a buzz
      const phase = k * 2.399
      real[k] = a * Math.cos(phase)
      imag[k] = a * Math.sin(phase)
    }
    const wave = ctx.createPeriodicWave(real, imag)
    const toneFilter = ctx.createBiquadFilter()
    toneFilter.type = 'lowpass'
    toneFilter.frequency.value = 1500
    toneFilter.Q.value = 0.6
    const toneGain = ctx.createGain()
    toneGain.gain.value = 0.55
    toneFilter.connect(toneGain).connect(level)
    const tone = ctx.createOscillator()
    tone.setPeriodicWave(wave)
    tone.frequency.value = IDLE / 120
    tone.connect(toneFilter)
    const tone2 = ctx.createOscillator()
    tone2.setPeriodicWave(wave)
    tone2.frequency.value = IDLE / 120 * 1.0021
    const tone2Gain = ctx.createGain()
    tone2Gain.gain.value = 0.7
    tone2.connect(tone2Gain).connect(toneFilter)

    // combustion rasp: noise pulsed at the firing frequency
    const noise = ctx.createBufferSource()
    noise.buffer = this.mix.tex.white
    noise.loop = true
    const raspFilter = ctx.createBiquadFilter()
    raspFilter.type = 'bandpass'
    raspFilter.frequency.value = IDLE / 10
    raspFilter.Q.value = 0.7
    const pulsed = ctx.createGain()
    pulsed.gain.value = 0.5
    const pulse = ctx.createOscillator()
    pulse.frequency.value = IDLE / 20
    const depth = ctx.createGain()
    depth.gain.value = 0.5
    pulse.connect(depth).connect(pulsed.gain)
    const rasp = ctx.createGain()
    rasp.gain.value = 0.2
    noise.connect(raspFilter).connect(pulsed).connect(rasp).connect(level)

    const turbo = ctx.createOscillator()
    turbo.frequency.value = 3000
    const turboGain = ctx.createGain()
    turboGain.gain.value = 0
    turbo.connect(turboGain).connect(level)
    const mguk = ctx.createOscillator()
    mguk.type = 'triangle'
    mguk.frequency.value = 200
    const mgukGain = ctx.createGain()
    mgukGain.gain.value = 0
    mguk.connect(mgukGain).connect(level)

    // the limiter: a square wave cutting the level and pulling the pitch, silent until it is hit
    const limiter = ctx.createOscillator()
    limiter.type = 'square'
    limiter.frequency.value = LIMITER.hz
    const cutDepth = ctx.createGain()
    cutDepth.gain.value = 0
    limiter.connect(cutDepth).connect(cut.gain)
    const pitchDepth = ctx.createGain()
    pitchDepth.gain.value = 0
    limiter.connect(pitchDepth)
    for (const osc of [tone, tone2, pulse]) pitchDepth.connect(osc.detune)

    const sources: AudioScheduledSourceNode[] = [tone, tone2, noise, pulse, turbo, mguk, limiter]
    for (const s of sources) s.start()
    return { tone, tone2, pulse, toneFilter, rasp, raspFilter, turbo, turboGain, mguk, mgukGain, level, cut, cutDepth, pitchDepth, sources }
  }
}
