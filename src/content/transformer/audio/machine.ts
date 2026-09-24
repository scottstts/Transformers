import type { AudioMix } from '../../../audio/mix'

/**
 * The transformation as a recording of a real machine would have it, and the
 * way film transformations are built: layers of real mechanical sounds, one
 * articulated event per visible motion, big machines pitched low and heard from
 * a distance. Nothing is a clean oscillator tone, nothing is bright or close:
 *
 *   drives      large, slow geared motors: a soft noise whirr in a low band that
 *               rises with speed, the load rumble behind it and a faint gear
 *               mesh that wanders with tooth error; moves ramp up and down
 *               smoothly over about 0.4 s
 *   ratchet     turning parts run through a gear train: rapid tooth engagements
 *               ring the gearbox housing, a deep "trrrt" following the speed
 *   friction    sliding panels: a soft rolling rush from the guides
 *   seat        a larger part arriving: a deep, damped settle, mostly heard
 *               through the body (no clank)
 *   hydraulics  rams and telescoping struts: a low flow rush and the cylinder
 *               rumble; the valve closes with a soft breath of air
 *   power unit  one hydraulic pump running while the machine moves: piston
 *               ripple over broadband pump noise; it spools up when the
 *               transformation starts, labours (pitch sags, level rises) while
 *               actuators draw flow, and coasts down when it ends
 *   body        every voice is also heard through the chassis: a bank of the
 *               body's panel modes (ringing steel, damped carbon) colours all
 *               of them the same way, which is what makes them one machine
 *   distance    one lowpass over the whole machine and a generous reverb send:
 *               the listener stands metres away, not at the motor
 *
 * Each actuator's variation (speed, gearing, housing) is seeded by its name,
 * so the same part sounds the same every time.
 */
export interface MachineTuning {
  /** motor whirr band centre (Hz) of a medium drive at full speed */
  driveHz: number
  /** gear-mesh whine over the whirr band */
  meshRatio: number
  /** hydraulic pump: shaft rate (Hz) and piston count (the ripple is their product) */
  pumpHz: number
  pistons: number
  /** body panel modes (Hz) and their resonance (Q: high rings, low is damped) */
  modes: number[]
  modeQ: number
  /** share of each voice heard through the body rather than direct */
  bodyShare: number
  /** heard from a distance: lowpass over the whole machine (Hz) */
  distanceHz: number
  /** gear-train ratchet: tooth rate (Hz) of a medium drive at full speed */
  ratchetHz: number
  /** overall level */
  level: number
}

/** The truck: big electro-hydraulics in a stainless-steel body with low, ringing panel modes. */
export const HEAVY_MACHINE: MachineTuning = {
  driveHz: 150,
  meshRatio: 2.1,
  pumpHz: 22,
  pistons: 9,
  modes: [131, 207, 318, 466, 690, 1030, 1540, 2310],
  modeQ: 12,
  bodyShare: 0.7,
  distanceHz: 1500,
  ratchetHz: 16,
  level: 1,
}

/** Largest and smallest drive (by moved part area, m^2) relative to a medium one. */
const DRIVE_SCALE = { large: 0.8, medium: 1, small: 1.15 }
/** Points in the speed-profile curves handed to the audio thread. */
const CURVE_POINTS = 64
const PUMP_LEVEL = 0.09
const VOICE_LEVEL = 0.07

/** How a drive moves its part. */
export interface DriveStyle {
  /** drive speed (hinges turn slower than slides) */
  trim?: number
  /** the part slides on guides: friction rush */
  rail?: boolean
  /** the part turns through a gear train: ratchet */
  rotary?: boolean
  level?: number
}

interface Stroke {
  start: number
  dur: number
  weight: number
}

export class MachineVoices {
  private readonly ctx: AudioContext
  private readonly mix: AudioMix
  private readonly tune: MachineTuning
  /** the chassis: voices feed it, its modes colour them */
  private readonly body: GainNode
  private readonly out: GainNode
  private readonly pump: { gain: GainNode; ripple: OscillatorNode; tone: BiquadFilterNode }
  private readonly sources: AudioScheduledSourceNode[] = []
  private readonly strokes: Stroke[] = []
  private running = false
  /** a train of narrow pulses: one gear tooth engaging per period */
  private readonly tickWave: PeriodicWave

  constructor(mix: AudioMix, tuning: MachineTuning) {
    this.mix = mix
    this.ctx = mix.ctx as AudioContext
    this.tune = tuning
    const ctx = this.ctx
    // heard from several metres away: air and distance take the top off everything
    this.out = ctx.createGain()
    this.out.gain.value = tuning.level
    const distance = ctx.createBiquadFilter()
    distance.type = 'lowpass'
    distance.frequency.value = tuning.distanceHz
    distance.Q.value = 0.5
    this.out.connect(distance).connect(mix.output.dry)
    const send = ctx.createGain()
    send.gain.value = 0.38
    distance.connect(send).connect(mix.output.send)
    this.body = ctx.createGain()
    // the modes: parallel resonant bands, lower modes a little stronger (larger radiating areas)
    tuning.modes.forEach((f, i) => {
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = f
      bp.Q.value = tuning.modeQ
      const g = ctx.createGain()
      g.gain.value = (1.4 / (1 + 0.5 * i)) * Math.sqrt(tuning.modeQ / 8)
      this.body.connect(bp).connect(g).connect(this.out)
    })
    // plus the broadband body itself, softened
    const through = ctx.createBiquadFilter()
    through.type = 'lowpass'
    through.frequency.value = 900
    const tg = ctx.createGain()
    tg.gain.value = 0.45
    this.body.connect(through).connect(tg).connect(this.out)
    this.pump = this.buildPump()
    const n = 40
    const real = new Float32Array(n + 1)
    const imag = new Float32Array(n + 1)
    for (let k = 1; k <= n; k++) real[k] = 1 - k / (n + 1)
    this.tickWave = ctx.createPeriodicWave(real, imag)
  }

  /* ------------------------------------------------------------- drives */

  /**
   * A geared electric drive moving a part for `dur` s: a large, slow motor
   * behind a heavy reduction. `size` is the part's area (m^2); `trim` scales
   * the drive speed (hinges turn slower than slides); `rail`: the part runs on
   * linear guides.
   */
  drive(t: number, dur: number, size: number, pan: number, seed: string, how: DriveStyle = {}): void {
    const { trim = 1, rail = false, rotary = false, level = 1 } = how
    const ctx = this.ctx
    const r = rng(seed)
    const scale = size > 2 ? DRIVE_SCALE.large : size > 0.6 ? DRIVE_SCALE.medium : DRIVE_SCALE.small
    const fc = this.tune.driveHz * scale * trim * (0.92 + 0.16 * r())
    const v = trapezoid(dur)
    const rate = (k: number): Float32Array => v.map((s) => k * (0.4 + 0.6 * s))
    const gain = VOICE_LEVEL * level * (size > 2 ? 1.15 : size > 0.6 ? 1 : 0.7)
    const input = this.voice(t, dur, gain, pan)
    const load = ctx.createGain()
    load.gain.value = 0
    load.gain.setValueCurveAtTime(v.map((s) => Math.sqrt(s)), t, dur)
    load.connect(input)
    this.flow(t, dur, 0.35 * scale)

    // motor whirr: a soft noise band that rises with speed, barely stirred by the rotor
    const whirr = this.noise(this.mix.tex.white, t, dur)
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.Q.value = 1.1
    band.frequency.setValueCurveAtTime(rate(fc), t, dur)
    const pulse = ctx.createGain()
    pulse.gain.value = 0.85
    whirr.connect(band).connect(this.bandGain(fc / 1.1, 0.45)).connect(pulse).connect(load)
    const rotor = this.osc('sine', t, dur)
    rotor.frequency.setValueCurveAtTime(rate(fc / (6 + r())), t, dur)
    const depth = ctx.createGain()
    depth.gain.value = 0.12
    rotor.connect(depth).connect(pulse.gain)

    // the weight behind it: low load rumble of motor and gearbox
    const weight = this.noise(this.mix.tex.brown, t, dur)
    const wl = ctx.createBiquadFilter()
    wl.type = 'lowpass'
    wl.frequency.value = fc * 0.9
    const wg = ctx.createGain()
    wg.gain.value = 0.9
    weight.connect(wl).connect(wg).connect(load)

    // gear mesh: a faint, low whine that wanders with tooth error and load
    const mesh = fc * this.tune.meshRatio * (0.94 + 0.12 * r())
    const gear = this.osc('sine', t, dur)
    gear.frequency.setValueCurveAtTime(rate(mesh), t, dur)
    this.wander(gear.frequency, t, dur, mesh * 0.015)
    const gearGain = ctx.createGain()
    gearGain.gain.value = 0.025
    gear.connect(gearGain).connect(load)

    if (rail) {
      // linear guides: a soft rolling rush, its grain following the carriage speed
      const roll = this.noise(this.mix.tex.white, t, dur)
      const rb = ctx.createBiquadFilter()
      rb.type = 'bandpass'
      rb.frequency.value = 520 + 220 * r()
      rb.Q.value = 0.7
      const rough = ctx.createGain()
      rough.gain.value = 0.5
      const grain = this.noise(this.mix.tex.brown, t, dur)
      grain.playbackRate.setValueCurveAtTime(v.map((s) => 2 + 8 * s), t, dur)
      const grainHp = ctx.createBiquadFilter()
      grainHp.type = 'highpass'
      grainHp.frequency.value = 8
      const grainDepth = ctx.createGain()
      grainDepth.gain.value = 0.35
      grain.connect(grainHp).connect(grainDepth).connect(rough.gain)
      const rg = ctx.createGain()
      rg.gain.value = 0.18
      roll.connect(rb).connect(this.bandGain(rb.frequency.value / 0.7, 0.5)).connect(rough).connect(rg).connect(load)
    }
    if (rotary) this.ratchet(load, t, dur, v, this.tune.ratchetHz * scale * trim * (0.9 + 0.2 * r()), 240 + 180 * r())
    if (size > 0.3 && level > 0.6) this.seat(t + dur, size, pan)
  }

  /* --------------------------------------------------------- hydraulics */

  /** A hydraulic ram or telescoping strut: a soft flow rush through the valve and the cylinder's low rumble. */
  ram(t: number, dur: number, size: number, pan: number, seed: string, level = 1): void {
    const ctx = this.ctx
    const r = rng(seed)
    const v = trapezoid(dur)
    const input = this.voice(t, dur, VOICE_LEVEL * 0.8 * level, pan)
    const flow = ctx.createGain()
    flow.gain.value = 0
    flow.gain.setValueCurveAtTime(v.map((s) => Math.sqrt(s)), t, dur)
    flow.connect(input)
    this.flow(t, dur, 0.5 + 0.3 * Math.min(size, 2))

    const rush = this.noise(this.mix.tex.white, t, dur)
    const hb = ctx.createBiquadFilter()
    hb.type = 'bandpass'
    hb.frequency.value = 800 + 350 * r()
    hb.Q.value = 0.6
    const hg = ctx.createGain()
    hg.gain.value = 0.16
    rush.connect(hb).connect(this.bandGain(hb.frequency.value / 0.6, 0.5)).connect(hg).connect(flow)

    const rumble = this.noise(this.mix.tex.brown, t, dur)
    const rl = ctx.createBiquadFilter()
    rl.type = 'lowpass'
    rl.frequency.value = 150
    const rg = ctx.createGain()
    rg.gain.value = 0.8 * Math.min(1.5, 0.5 + size)
    rumble.connect(rl).connect(rg).connect(flow)
    this.bleed(t + dur, pan, level)
  }

  /**
   * The body taking its own weight: the pump labours under a long, heavy draw,
   * the main rams hiss and the frame carries a low strain under the load.
   */
  heavyLift(t: number, dur: number, seed: string): void {
    const ctx = this.ctx
    this.ram(t, dur, 2.5, 0, seed, 1.3)
    this.flow(t, dur, 1.6)
    const load = plateau(dur, 0.15)
    const input = this.voice(t, dur, VOICE_LEVEL * 1.4, 0)
    const strain = ctx.createGain()
    strain.gain.value = 0
    strain.gain.setValueCurveAtTime(load, t, dur)
    strain.connect(input)
    const low = this.noise(this.mix.tex.brown, t, dur)
    const lb = ctx.createBiquadFilter()
    lb.type = 'bandpass'
    lb.frequency.value = 68
    lb.Q.value = 1.1
    const swell = ctx.createGain()
    swell.gain.value = 0.8
    const slow = this.noise(this.mix.tex.brown, t, dur)
    slow.playbackRate.value = 0.25
    const sl = ctx.createBiquadFilter()
    sl.type = 'lowpass'
    sl.frequency.value = 3
    const sd = ctx.createGain()
    sd.gain.value = 0.5
    slow.connect(sl).connect(sd).connect(swell.gain)
    low.connect(lb).connect(swell).connect(strain)
  }

  /* ------------------------------------------------------- articulation */

  /**
   * A turning part's gear train: a rapid run of tooth engagements, each
   * exciting the gearbox housing. At these rates it blurs into a deep "trrrt"
   * that speeds and slows with the move (the film transformations' ratcheting
   * gears, kept low and soft).
   */
  private ratchet(dest: AudioNode, t: number, dur: number, v: Float32Array, rate: number, housingHz: number): void {
    const ctx = this.ctx
    const teeth = this.osc('sine', t, dur)
    teeth.setPeriodicWave(this.tickWave)
    teeth.frequency.setValueCurveAtTime(v.map((s) => rate * (0.35 + 0.65 * s)), t, dur)
    this.wander(teeth.frequency, t, dur, rate * 0.04)
    const housing = ctx.createBiquadFilter()
    housing.type = 'bandpass'
    housing.frequency.value = housingHz
    housing.Q.value = 5
    const g = ctx.createGain()
    g.gain.value = 0.9
    teeth.connect(housing).connect(g).connect(dest)
  }

  /**
   * A part arriving at its stop: a deep, damped seat, mostly heard through the
   * body, whose panel modes ring briefly (steel) or barely (carbon). No clank:
   * it is low and short, the weight of the part settling onto its mount.
   */
  private seat(at: number, size: number, pan: number): void {
    const ctx = this.ctx
    const level = VOICE_LEVEL * 0.9 * Math.min(1, 0.35 + 0.35 * size)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, at - 0.02)
    env.gain.linearRampToValueAtTime(level, at + 0.012)
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.32)
    const direct = ctx.createGain()
    direct.gain.value = 0.2
    const p = ctx.createStereoPanner()
    p.pan.value = Math.max(-1, Math.min(1, pan))
    env.connect(direct).connect(p).connect(this.out)
    const toBody = ctx.createGain()
    toBody.gain.value = 0.8
    env.connect(toBody).connect(this.body)
    const thump = this.noise(this.mix.tex.brown, at - 0.02, 0.4)
    const tl = ctx.createBiquadFilter()
    tl.type = 'lowpass'
    tl.frequency.value = 160
    thump.connect(tl).connect(env)
    const knock = this.noise(this.mix.tex.white, at - 0.02, 0.4)
    const kb = ctx.createBiquadFilter()
    kb.type = 'bandpass'
    kb.frequency.value = 320
    kb.Q.value = 1.2
    const kg = ctx.createGain()
    kg.gain.value = 0.35
    knock.connect(kb).connect(this.bandGain(270, 0.5)).connect(kg).connect(env)
    setTimeout(() => { env.disconnect(); direct.disconnect(); p.disconnect(); toBody.disconnect() }, Math.max(0, (at + 0.6 - ctx.currentTime) * 1000))
  }

  /** A hydraulic stroke ends: its valve closes and the line bleeds a soft breath of air. */
  private bleed(at: number, pan: number, level: number): void {
    const ctx = this.ctx
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, at)
    env.gain.linearRampToValueAtTime(VOICE_LEVEL * 0.22 * level, at + 0.05)
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.6)
    const p = ctx.createStereoPanner()
    p.pan.value = Math.max(-1, Math.min(1, pan))
    env.connect(p).connect(this.out)
    const air = this.noise(this.mix.tex.white, at, 0.65)
    const ab = ctx.createBiquadFilter()
    ab.type = 'bandpass'
    ab.frequency.value = 1100
    ab.Q.value = 0.8
    air.connect(ab).connect(this.bandGain(1400, 0.5)).connect(env)
    setTimeout(() => { env.disconnect(); p.disconnect() }, Math.max(0, (at + 0.8 - ctx.currentTime) * 1000))
  }

  /* --------------------------------------------------------- power unit */

  /** The transformation starts (either way): the pump motor spools up from rest. */
  spool(): void {
    const t = this.ctx.currentTime
    const f = this.pump.ripple.frequency
    const run = this.tune.pumpHz
    f.cancelScheduledValues(t)
    f.setValueAtTime(run * 0.15, t)
    f.exponentialRampToValueAtTime(run, t + 1.3)
  }

  /**
   * Per frame. While running, the pump's speed and level follow the flow the
   * actuators draw; when the transformation ends it coasts down.
   */
  update(on: boolean): void {
    const t = this.ctx.currentTime
    const p = this.pump
    if (!on) {
      if (this.running) {
        this.running = false
        p.ripple.frequency.cancelScheduledValues(t)
        p.ripple.frequency.setValueAtTime(p.ripple.frequency.value, t)
        p.ripple.frequency.exponentialRampToValueAtTime(this.tune.pumpHz * 0.12, t + 1.8)
        p.gain.gain.setTargetAtTime(0, t, 0.5)
      }
      return
    }
    const first = !this.running
    this.running = true
    let draw = 0
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      const s = this.strokes[i]
      const u = (t - s.start) / s.dur
      if (u > 1) {
        this.strokes.splice(i, 1)
        continue
      }
      if (u > 0) draw += s.weight * Math.sin(Math.PI * u)
    }
    const load = Math.min(1.5, draw)
    if (!first) p.ripple.frequency.setTargetAtTime(this.tune.pumpHz * (1 - 0.06 * load), t, 0.12)
    p.tone.frequency.setTargetAtTime(700 + 900 * Math.min(1, load), t, 0.15)
    p.gain.gain.setTargetAtTime(PUMP_LEVEL * (0.55 + 0.45 * Math.min(1, load)) * (this.mix.enabled ? 1 : 0), t, 0.2)
  }

  dispose(): void {
    for (const s of this.sources) s.stop()
    this.out.disconnect()
  }

  private buildPump(): { gain: GainNode; ripple: OscillatorNode; tone: BiquadFilterNode } {
    const ctx = this.ctx
    const { pumpHz, pistons } = this.tune
    const gain = ctx.createGain()
    gain.gain.value = 0
    // mostly through the body: the pump is bolted to the frame
    const direct = ctx.createGain()
    direct.gain.value = 0.45
    gain.connect(direct).connect(this.out)
    gain.connect(this.body)
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 800
    tone.Q.value = 0.5
    tone.connect(gain)
    // piston ripple at shaft x pistons and its harmonics, with shaft-order irregularities between
    const n = pistons * 5
    const real = new Float32Array(n + 1)
    const imag = new Float32Array(n + 1)
    for (let k = 1; k <= n; k++) {
      const a = k % pistons === 0 ? Math.pow(k / pistons, -0.9) : 0.06 / Math.sqrt(k)
      const phase = k * 2.399
      real[k] = a * Math.cos(phase)
      imag[k] = a * Math.sin(phase)
    }
    const ripple = ctx.createOscillator()
    ripple.setPeriodicWave(ctx.createPeriodicWave(real, imag))
    ripple.frequency.value = pumpHz
    const rg = ctx.createGain()
    rg.gain.value = 0.5
    ripple.connect(rg).connect(tone)
    // the pump's broadband noise: fluid, bearings, swash plate
    const noise = ctx.createBufferSource()
    noise.buffer = this.mix.tex.brown
    noise.loop = true
    const nb = ctx.createBiquadFilter()
    nb.type = 'bandpass'
    nb.frequency.value = pumpHz * pistons * 1.6
    nb.Q.value = 0.6
    const ng = ctx.createGain()
    ng.gain.value = 1.1
    noise.connect(nb).connect(ng).connect(tone)
    ripple.start()
    noise.start()
    this.sources.push(ripple, noise)
    return { gain, ripple, tone }
  }

  /* ---------------------------------------------------------- plumbing */

  /** Every stroke draws on the pump. */
  private flow(t: number, dur: number, weight: number): void {
    this.strokes.push({ start: t, dur, weight })
  }

  /** A voice: click-free edges, then direct (panned) and through the body. Returns its input. */
  private voice(t: number, dur: number, gain: number, pan: number): GainNode {
    const ctx = this.ctx
    const g = ctx.createGain()
    const edge = Math.min(0.05, dur * 0.2)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(gain, t + edge)
    g.gain.setValueAtTime(gain, t + dur - edge)
    g.gain.linearRampToValueAtTime(0, t + dur + 0.03)
    const share = this.tune.bodyShare
    const direct = ctx.createGain()
    direct.gain.value = 1 - share
    const p = ctx.createStereoPanner()
    p.pan.value = Math.max(-1, Math.min(1, pan))
    g.connect(direct).connect(p).connect(this.out)
    const toBody = ctx.createGain()
    toBody.gain.value = share
    g.connect(toBody).connect(this.body)
    const end = t + dur + 0.4
    setTimeout(() => { g.disconnect(); direct.disconnect(); p.disconnect(); toBody.disconnect() }, Math.max(0, (end - ctx.currentTime) * 1000))
    return g
  }

  private noise(buffer: AudioBuffer, t: number, dur: number): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    src.start(t, Math.random() * (buffer.duration - 0.1))
    src.stop(t + dur + 0.1)
    return src
  }

  private osc(type: OscillatorType, t: number, dur: number): OscillatorNode {
    const o = this.ctx.createOscillator()
    o.type = type
    o.start(t)
    o.stop(t + dur + 0.1)
    return o
  }

  /** Unity-ish level for white noise after a band of `bandwidth` Hz (a narrow band keeps little energy). */
  private bandGain(bandwidth: number, level: number): GainNode {
    const g = this.ctx.createGain()
    g.gain.value = level * Math.sqrt(this.ctx.sampleRate / 2 / Math.max(bandwidth, 50))
    return g
  }

  /** Slow random wander of a frequency (Hz deviation): tooth error, load and cogging. */
  private wander(param: AudioParam, t: number, dur: number, deviation: number): void {
    const src = this.noise(this.mix.tex.brown, t, dur)
    const lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 12
    const g = this.ctx.createGain()
    g.gain.value = deviation * 3
    src.connect(lp).connect(g).connect(param)
  }
}

/**
 * Normalized speed of a servo move: a smooth ramp up (about 0.4 s, at most
 * 30 % of the move), cruise, and the same ramp down.
 */
function trapezoid(dur: number): Float32Array {
  const n = Math.max(12, Math.min(CURVE_POINTS, Math.round(dur * 40)))
  const ramp = Math.min(0.3, 0.4 / Math.max(dur, 1e-3))
  const c = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1)
    const a = Math.min(1, u / ramp, (1 - u) / ramp)
    c[i] = a * a * (3 - 2 * a)
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

/** Deterministic 0..1 generator seeded by a name. */
function rng(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}
