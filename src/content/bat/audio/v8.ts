import type { AudioMix } from '../../../audio/mix'

/**
 * The Tumbler's 5.7 L cross-plane V8, synthesized from its physics.
 *
 *   tone        one oscillator at the engine's cycle frequency (rpm / 120)
 *               carrying the engine orders as harmonics. Eight cylinders fire
 *               once per cycle each, so the firing order (8) dominates; a
 *               cross-plane crank fires each bank unevenly (its exhausts
 *               pulse at an uneven beat), which puts strong energy in the
 *               lower orders (2, 4, 6) and the half orders between: the
 *               burble. A second copy a few cents off is the other bank's
 *               pipe; their slow beating is the texture of a real engine
 *   rasp        band-limited noise pulsed at the firing frequency: the
 *               exhaust's roughness, louder and brighter under load
 *   intake      the carburettor's roar, a low band of pink noise opening
 *               with throttle
 *
 * A four-speed automatic: shifts at 5 400 rpm with a soft torque-converter
 * flare instead of a clunk, kickdown under full throttle. It idles at 750 rpm
 * with a lumpy cam (the idle hunts), starts with a flare and runs down when
 * the car transforms.
 */

/** Road speed (m/s) at 6 000 rpm in each gear (on 44 in tyres). */
const GEAR_TOP = [14, 23, 33, 46]
const REDLINE = 6000
const UPSHIFT = 5400
const DOWNSHIFT = 2800
const IDLE = 750
/** The converter lets the engine run up under throttle off the line. */
const STALL_RPM = 2600
const STALL_SPEED = 7
/** Level at full load, and on the overrun / idle (fractions). */
const LEVEL = 0.085
const OVERRUN = 0.32
const IDLE_LEVEL = 0.34
/** Engine orders (harmonics of the cycle frequency) and amplitudes: a cross-plane V8's uneven bank pulses. */
const ORDERS: Array<[number, number]> = [
  [1, 0.22], [2, 0.5], [3, 0.26], [4, 0.72], [5, 0.24], [6, 0.42], [7, 0.16], [8, 1], [9, 0.12], [10, 0.22],
  [12, 0.34], [14, 0.1], [16, 0.5], [20, 0.12], [24, 0.22], [32, 0.1],
]

/** The automatic's gear and the engine speed it gives: pure state, one update per frame. */
export class Automatic {
  gear = 0
  rpm = IDLE

  update(speed: number, load: number): 'up' | 'down' | null {
    const v = Math.abs(speed)
    const shift = this.select(v, load)
    let rpm = Math.max(IDLE, REDLINE * v / GEAR_TOP[this.gear])
    // the converter slips: the engine runs ahead of the wheels under load at low speed
    if (v < STALL_SPEED * (this.gear + 1) && load > 0) rpm = Math.max(rpm, IDLE + (STALL_RPM - IDLE) * load * (1 - v / (STALL_SPEED * (this.gear + 1)) * 0.6))
    this.rpm = Math.min(rpm, REDLINE + 150)
    return shift
  }

  private select(v: number, load: number): 'up' | 'down' | null {
    const rpm = REDLINE * v / GEAR_TOP[this.gear]
    if (rpm > UPSHIFT && this.gear < GEAR_TOP.length - 1) {
      this.gear++
      return 'up'
    }
    // kickdown: full throttle drops a gear when the engine would still be in its power band there
    const down = this.gear > 0 ? REDLINE * v / GEAR_TOP[this.gear - 1] : Infinity
    if (this.gear > 0 && (rpm < DOWNSHIFT * 0.75 || (load > 0.9 && down < UPSHIFT * 0.85 && rpm < 3600))) {
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
  intake: GainNode
  intakeFilter: BiquadFilterNode
  level: GainNode
  sources: AudioScheduledSourceNode[]
}

export class V8 {
  private readonly mix: AudioMix
  private graph: Graph | null = null
  readonly box = new Automatic()
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
    this.lopePhase += dt * 1.7
    this.lope += ((Math.random() * 2 - 1) * 60 + Math.sin(this.lopePhase) * 40 - this.lope) * Math.min(1, dt * 5)
    if (idling) rpm += this.lope

    const cycle = rpm / 120
    const response = shift ? 0.09 : 0.05
    if (t >= this.pitchHold) {
      g.tone.frequency.setTargetAtTime(cycle, t, response)
      g.tone2.frequency.setTargetAtTime(cycle * 1.0034, t, response)
      g.pulse.frequency.setTargetAtTime(cycle * 8, t, response)
    }
    const rev = (rpm - IDLE) / (REDLINE - IDLE)
    g.toneFilter.frequency.setTargetAtTime(420 + 1500 * load + 900 * rev, t, 0.08)
    g.raspFilter.frequency.setTargetAtTime(cycle * 16, t, response)
    g.rasp.gain.setTargetAtTime(0.14 + 0.4 * load, t, 0.08)
    g.intakeFilter.frequency.setTargetAtTime(160 + 700 * load * (0.4 + rev), t, 0.1)
    g.intake.gain.setTargetAtTime(0.05 + 0.35 * load * (0.3 + rev), t, 0.1)
    const level = idling ? IDLE_LEVEL : OVERRUN + (1 - OVERRUN) * load
    const target = LEVEL * level * (0.8 + 0.2 * rev)
    if (shift === 'up' && t >= this.levelHold) {
      // the converter takes the shift up softly: a short dip and the note drops onto the next ratio
      g.level.gain.cancelScheduledValues(t)
      g.level.gain.setValueAtTime(g.level.gain.value, t)
      g.level.gain.linearRampToValueAtTime(target * 0.7, t + 0.06)
      g.level.gain.linearRampToValueAtTime(target, t + 0.22)
      this.levelHold = t + 0.22
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

  /** The starter turns it over, it catches with a flare and settles into its lumpy idle. */
  private start(g: Graph, t: number): void {
    this.running = true
    this.box.gear = 0
    this.pitchHold = t + 1.3
    this.levelHold = t + 1.3
    const cycle = (r: number): number => r / 120
    for (const [osc, k] of [[g.tone, 1], [g.tone2, 1.0034], [g.pulse, 8]] as const) {
      osc.frequency.cancelScheduledValues(t)
      osc.frequency.setValueAtTime(cycle(220) * k, t)
      osc.frequency.linearRampToValueAtTime(cycle(300) * k, t + 0.45)
      osc.frequency.exponentialRampToValueAtTime(cycle(2100) * k, t + 0.8)
      osc.frequency.setTargetAtTime(cycle(IDLE) * k, t + 0.85, 0.28)
    }
    g.level.gain.cancelScheduledValues(t)
    g.level.gain.setValueAtTime(0, t)
    g.level.gain.linearRampToValueAtTime(LEVEL * 0.25, t + 0.45)
    g.level.gain.linearRampToValueAtTime(LEVEL * 0.9, t + 0.78)
    g.level.gain.setTargetAtTime(LEVEL * IDLE_LEVEL, t + 0.9, 0.35)
  }

  /** Ignition off: it runs down in about a second. */
  private stop(g: Graph, t: number): void {
    this.running = false
    for (const [osc, k] of [[g.tone, 1], [g.tone2, 1.0034], [g.pulse, 8]] as const) {
      osc.frequency.cancelScheduledValues(t)
      osc.frequency.setValueAtTime(osc.frequency.value, t)
      osc.frequency.exponentialRampToValueAtTime(k * 150 / 120, t + 1.2)
    }
    g.level.gain.cancelScheduledValues(t)
    g.level.gain.setValueAtTime(g.level.gain.value, t)
    g.level.gain.setTargetAtTime(0, t, 0.3)
  }

  private build(ctx: AudioContext): Graph {
    const out = this.mix.output
    const level = ctx.createGain()
    level.gain.value = 0
    // heard from outside: the armoured body and the distance take the top off; the pipes' chest resonance
    const distance = ctx.createBiquadFilter()
    distance.type = 'lowpass'
    distance.frequency.value = 3600
    distance.Q.value = 0.4
    const body = ctx.createBiquadFilter()
    body.type = 'peaking'
    body.frequency.value = 110
    body.Q.value = 0.9
    body.gain.value = 5
    level.connect(body).connect(distance).connect(out.dry)
    const send = ctx.createGain()
    send.gain.value = 0.35
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
    toneFilter.frequency.value = 700
    toneFilter.Q.value = 0.6
    const toneGain = ctx.createGain()
    toneGain.gain.value = 0.6
    toneFilter.connect(toneGain).connect(level)
    const tone = ctx.createOscillator()
    tone.setPeriodicWave(wave)
    tone.frequency.value = IDLE / 120
    tone.connect(toneFilter)
    const tone2 = ctx.createOscillator()
    tone2.setPeriodicWave(wave)
    tone2.frequency.value = IDLE / 120 * 1.0034
    const tone2Gain = ctx.createGain()
    tone2Gain.gain.value = 0.75
    tone2.connect(tone2Gain).connect(toneFilter)

    // exhaust rasp: noise pulsed at the firing frequency
    const noise = ctx.createBufferSource()
    noise.buffer = this.mix.tex.white
    noise.loop = true
    const raspFilter = ctx.createBiquadFilter()
    raspFilter.type = 'bandpass'
    raspFilter.frequency.value = IDLE / 7.5
    raspFilter.Q.value = 0.6
    const pulsed = ctx.createGain()
    pulsed.gain.value = 0.5
    const pulse = ctx.createOscillator()
    pulse.frequency.value = IDLE / 15
    const depth = ctx.createGain()
    depth.gain.value = 0.5
    pulse.connect(depth).connect(pulsed.gain)
    const rasp = ctx.createGain()
    rasp.gain.value = 0.15
    noise.connect(raspFilter).connect(pulsed).connect(rasp).connect(level)

    // the carburettor's roar
    const air = ctx.createBufferSource()
    air.buffer = this.mix.tex.roar
    air.loop = true
    const intakeFilter = ctx.createBiquadFilter()
    intakeFilter.type = 'lowpass'
    intakeFilter.frequency.value = 200
    intakeFilter.Q.value = 0.5
    const intake = ctx.createGain()
    intake.gain.value = 0.05
    air.connect(intakeFilter).connect(intake).connect(level)

    const sources: AudioScheduledSourceNode[] = [tone, tone2, noise, pulse, air]
    for (const s of sources) s.start()
    return { tone, tone2, pulse, toneFilter, rasp, raspFilter, intake, intakeFilter, level, sources }
  }
}
