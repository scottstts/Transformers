import type { Textures } from '../../../audio/textures'
import type { VoiceOutput } from '../../../audio/mix'

/**
 * Transformation sound: the hum of one machine (tuned per character).
 *
 * Every stroke is an electric actuator whose pitch and load follow the
 * stroke's speed profile: it spins up from rest, runs, and spins down as the
 * part eases into place. Nothing strikes, clicks or rattles. All motors share
 * one timbre and three fixed sizes (large / medium / small), so overlapping
 * strokes blend into a single machine rather than a crowd of gadgets.
 * Under everything runs a machine bed (supply hum and pump drone) while the
 * transformation is in progress.
 */

/**
 * A machine's voice: every character tunes the same actuator model to its
 * own size and build (a truck-sized electro-hydraulic machine, a carbon racer's
 * high-speed servos).
 */
export interface MechanismTuning {
  /** motor fundamentals (Hz) by part size; kind trims them slightly */
  motorHz: { large: number; medium: number; small: number }
  /** gear-mesh partial over the motor fundamental (non-integer: a reduction stage) */
  gearRatio: number
  /** spectral slope of the motor timbre (higher: darker) */
  timbreSlope: number
  /** machine bed supply hum (Hz) and level */
  bedHz: number
  bedLevel: number
  /** the two drive motors carrying the body's weight (Hz) */
  liftHz: [number, number]
  /** overall stroke level */
  level: number
}

export const HEAVY_MACHINE: MechanismTuning = {
  motorHz: { large: 58, medium: 82, small: 116 },
  gearRatio: 4.37,
  timbreSlope: 1.45,
  bedHz: 52,
  bedLevel: 0.045,
  liftHz: [38, 57],
  level: 1,
}

/** Points in the speed-profile curves handed to the audio thread. */
const CURVE_POINTS = 64

interface MachineBed {
  gain: GainNode
  hum: OscillatorNode
}

export class MechanismVoices {
  private readonly ctx: AudioContext
  private readonly tex: Textures
  private readonly out: VoiceOutput
  private readonly wave: PeriodicWave
  private readonly bed: MachineBed
  private readonly tune: MechanismTuning
  private readonly sources: AudioScheduledSourceNode[] = []

  constructor(ctx: AudioContext, textures: Textures, out: VoiceOutput, tuning: MechanismTuning = HEAVY_MACHINE) {
    this.ctx = ctx
    this.tune = tuning
    this.tex = textures
    this.out = out
    // motor timbre: a soft harmonic series with the slot harmonics (6th, 12th) lifted
    const n = 16
    const real = new Float32Array(n + 1)
    const imag = new Float32Array(n + 1)
    for (let k = 1; k <= n; k++) imag[k] = Math.pow(k, -tuning.timbreSlope) * (k % 6 === 0 ? 2.4 : 1)
    this.wave = ctx.createPeriodicWave(real, imag)
    this.bed = this.buildBed()
  }

  /* ------------------------------------------------------------- strokes */

  /**
   * Electric actuator running one stroke of `dur` s. `size` is the moved
   * part's area (m^2); `trim` scales the motor speed (slides run a little
   * faster than hinges, joints slower).
   */
  motor(t: number, dur: number, size: number, pan: number, level = 1, trim = 1): void {
    const ctx = this.ctx
    const f0 = (size > 2 ? this.tune.motorHz.large : size > 0.6 ? this.tune.motorHz.medium : this.tune.motorHz.small) * trim
    const speed = speedProfile(dur)
    const freq = speed.map((v) => f0 * (0.5 + 0.5 * v))
    const load = speed.map((v) => Math.sqrt(v))
    const gain = 0.05 * this.tune.level * level * (size > 2 ? 1.25 : size > 0.6 ? 1 : 0.8)
    const bus = this.voiceBus(t, dur, gain, pan, 0.2)

    const body = ctx.createBiquadFilter()
    body.type = 'lowpass'
    body.frequency.value = f0 * 9
    body.Q.value = 0.4
    const loadGain = ctx.createGain()
    loadGain.gain.value = 0
    loadGain.gain.setValueCurveAtTime(load, t, dur)
    body.connect(loadGain).connect(bus)

    const motor = ctx.createOscillator()
    motor.setPeriodicWave(this.wave)
    motor.frequency.setValueCurveAtTime(freq, t, dur)
    motor.connect(body)
    const gear = ctx.createOscillator()
    gear.frequency.setValueCurveAtTime(freq.map((f) => f * this.tune.gearRatio), t, dur)
    const gearGain = ctx.createGain()
    gearGain.gain.value = 0.09
    gear.connect(gearGain).connect(loadGain)
    for (const o of [motor, gear]) {
      o.start(t)
      o.stop(t + dur + 0.05)
    }
    // brush and bearing noise, a soft band around the motor's upper harmonics
    this.texture(this.tex.brown, t, dur, loadGain, 'bandpass', f0 * 5, 0.7, 0.35)
  }

  /** Hydraulic lifter stroke: pump whine and fluid flow, swelling with the flow rate. */
  hydraulic(t: number, dur: number, pan: number, level = 1): void {
    const ctx = this.ctx
    const speed = speedProfile(dur)
    const bus = this.voiceBus(t, dur, 0.04 * level, pan, 0.15)
    const flow = ctx.createGain()
    flow.gain.value = 0
    flow.gain.setValueCurveAtTime(speed.map((v) => Math.sqrt(v)), t, dur)
    flow.connect(bus)
    const pump = ctx.createOscillator()
    pump.setPeriodicWave(this.wave)
    pump.frequency.setValueCurveAtTime(speed.map((v) => 150 * (0.8 + 0.2 * v)), t, dur)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 900
    const pg = ctx.createGain()
    pg.gain.value = 0.35
    pump.connect(lp).connect(pg).connect(flow)
    pump.start(t)
    pump.stop(t + dur + 0.05)
    this.texture(this.tex.brown, t, dur, flow, 'lowpass', 420, 0.5, 0.8)
  }

  /** The whole machine lifting its own weight: two deep drive motors in a fifth, under a long load. */
  heavyLift(t: number, dur: number): void {
    const ctx = this.ctx
    const bus = this.voiceBus(t, dur, 0.1, 0, 0.3)
    const load = plateau(dur, 0.12)
    const loadGain = ctx.createGain()
    loadGain.gain.value = 0
    loadGain.gain.setValueCurveAtTime(load, t, dur)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 420
    lp.Q.value = 0.5
    lp.connect(loadGain).connect(bus)
    for (const [f, g] of [[this.tune.liftHz[0], 0.7], [this.tune.liftHz[1], 0.45]]) {
      const o = ctx.createOscillator()
      o.setPeriodicWave(this.wave)
      // spins up, then labours a little under the load at mid-lift
      o.frequency.setValueCurveAtTime(load.map((v, i) => f * (0.55 + 0.45 * v) * (1 - 0.035 * Math.sin(Math.PI * i / (load.length - 1)))), t, dur)
      const og = ctx.createGain()
      og.gain.value = g
      o.connect(og).connect(lp)
      o.start(t)
      o.stop(t + dur + 0.05)
    }
    this.texture(this.tex.brown, t, dur, loadGain, 'lowpass', 90, 0.6, 0.6)
  }

  /** Stops the machine bed (strokes in flight end on their own). */
  dispose(): void {
    for (const s of this.sources) s.stop()
    this.bed.gain.disconnect()
  }

  /* ----------------------------------------------------------------- bed */

  /** Machine bed on while the transformation runs; `spool` glides the supply up to speed. */
  bedLevel(on: boolean): void {
    const t = this.ctx.currentTime
    this.bed.gain.gain.setTargetAtTime(on ? this.tune.bedLevel : 0, t, on ? 0.35 : 0.9)
  }

  spool(): void {
    const t = this.ctx.currentTime
    const f = this.bed.hum.frequency
    f.cancelScheduledValues(t)
    f.setValueAtTime(this.tune.bedHz * 0.5, t)
    f.exponentialRampToValueAtTime(this.tune.bedHz, t + 1.4)
  }

  private buildBed(): MachineBed {
    const ctx = this.ctx
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.connect(this.out.dry)
    const send = ctx.createGain()
    send.gain.value = 0.2
    gain.connect(send).connect(this.out.send)
    const hum = ctx.createOscillator()
    hum.setPeriodicWave(this.wave)
    hum.frequency.value = this.tune.bedHz
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 240
    const hg = ctx.createGain()
    hg.gain.value = 0.7
    hum.connect(lp).connect(hg).connect(gain)
    hum.start()
    this.sources.push(hum)
    // pump drone: brown noise through a broad low resonance
    const src = ctx.createBufferSource()
    src.buffer = this.tex.brown
    src.loop = true
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 95
    bp.Q.value = 0.8
    const pg = ctx.createGain()
    pg.gain.value = 0.9
    src.connect(bp).connect(pg).connect(gain)
    src.start()
    this.sources.push(src)
    return { gain, hum }
  }

  /* ---------------------------------------------------------- plumbing */

  /** Per-voice gain with short click-free edges, pan and reverb send; returns the voice input. */
  private voiceBus(t: number, dur: number, gain: number, pan: number, send: number): GainNode {
    const ctx = this.ctx
    const g = ctx.createGain()
    const edge = Math.min(0.04, dur * 0.2)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(gain, t + edge)
    g.gain.setValueAtTime(gain, t + dur - edge)
    g.gain.linearRampToValueAtTime(0, t + dur + 0.02)
    const p = ctx.createStereoPanner()
    p.pan.value = Math.max(-1, Math.min(1, pan))
    g.connect(p).connect(this.out.dry)
    const s = ctx.createGain()
    s.gain.value = send
    p.connect(s).connect(this.out.send)
    const end = t + dur + 0.3
    setTimeout(() => { g.disconnect(); p.disconnect(); s.disconnect() }, Math.max(0, (end - ctx.currentTime) * 1000))
    return g
  }

  /** Looped texture through a filter for the voice's duration. */
  private texture(buf: AudioBuffer, t: number, dur: number, dest: AudioNode, type: BiquadFilterType, f: number, Q: number, gain: number): void {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const fl = ctx.createBiquadFilter()
    fl.type = type
    fl.frequency.value = f
    fl.Q.value = Q
    const g = ctx.createGain()
    g.gain.value = gain
    src.connect(fl).connect(g).connect(dest)
    src.start(t, Math.random() * (buf.duration - 0.1))
    src.stop(t + dur + 0.05)
  }
}

/**
 * Normalized speed over a stroke eased in and out (the derivative of the
 * authored smooth ease): zero at both ends, peak 1 mid-stroke.
 */
function speedProfile(dur: number): Float32Array {
  const n = Math.max(8, Math.min(CURVE_POINTS, Math.round(dur * 40)))
  const c = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1)
    c[i] = Math.pow(4 * u * (1 - u), 1.3)
  }
  return c
}

/** Flat-topped load: ramps over `edge` of the duration at each end. */
function plateau(dur: number, edge: number): Float32Array {
  const n = Math.max(16, Math.min(CURVE_POINTS * 2, Math.round(dur * 30)))
  const c = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1)
    const a = Math.min(1, u / edge, (1 - u) / edge)
    c[i] = a * a * (3 - 2 * a)
  }
  return c
}
