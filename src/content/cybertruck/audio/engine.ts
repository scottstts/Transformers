import type { MechanismEvent } from '../asset/format'
import { MechanismVoices } from './mechanism'
import { RocketVoice } from './rocket'
import { renderTextures, type Textures } from './textures'

/**
 * Procedural audio for the Cybertruck, all synthesized with Web Audio.
 *
 *   transformation  one electro-hydraulic machine (see mechanism.ts): a bed hum
 *                   while it runs and an actuator voice per stroke from the
 *                   exported mechanism events; no impacts
 *   thrusters       the rocket burn of the lift jets (see rocket.ts)
 *   footfall        a multi-tonne foot: ground thump, sub pressure, gravel
 *                   crunch and damper exhale
 *   drive           a soft electric drive-motor hum
 *
 * The mix runs through a bus compressor and an outdoor space: a ground
 * reflection, a few sparse early reflections and a short dark tail (open
 * desert, nothing to reverberate against for long).
 */
interface DriveMotor {
  gain: GainNode
  hum: OscillatorNode
  whine: OscillatorNode
}

/** Drive motor: hum and whine base pitch (Hz) and peak level. */
const DRIVE_HUM_HZ = 48
const DRIVE_WHINE_HZ = 190
const DRIVE_LEVEL = 0.035

/** Concurrent stroke voices kept; the smallest strokes yield first. */
const VOICE_BUDGET = 10

export class CybertruckAudio {
  private ctx: AudioContext | null = null
  private enabled = true
  private out!: GainNode
  private bus!: GainNode
  private verbSend!: GainNode
  private tex!: Textures
  private voices!: MechanismVoices
  private rocketVoice!: RocketVoice
  private motor!: DriveMotor
  private active: Array<{ end: number; size: number }> = []

  private init(): boolean {
    if (this.ctx) return true
    const Context = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Context) return false
    const ctx = this.ctx = new Context()
    this.out = ctx.createGain()
    this.out.gain.value = 0.9
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -16
    comp.knee.value = 10
    comp.ratio.value = 3
    comp.attack.value = 0.01
    comp.release.value = 0.25
    // distance and air: the listener stands several metres off a large machine
    const air = ctx.createBiquadFilter()
    air.type = 'lowpass'
    air.frequency.value = 11000
    this.bus = ctx.createGain()
    this.bus.connect(air).connect(comp).connect(this.out).connect(ctx.destination)
    const verb = ctx.createConvolver()
    verb.buffer = this.outdoorImpulse(ctx)
    this.verbSend = ctx.createGain()
    this.verbSend.gain.value = 0.5
    this.verbSend.connect(verb).connect(this.bus)
    this.tex = renderTextures(ctx)
    const output = { dry: this.bus, send: this.verbSend }
    this.voices = new MechanismVoices(ctx, this.tex, output)
    this.rocketVoice = new RocketVoice(ctx, this.tex, output)
    this.buildMotor()
    return true
  }

  resume(): void {
    if (this.init() && this.ctx?.state === 'suspended') void this.ctx.resume()
  }

  setMuted(muted: boolean): void {
    this.enabled = !muted
    if (this.ctx) this.out.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.05)
  }

  private get live(): boolean {
    return !!this.ctx && this.enabled
  }

  /* ------------------------------------------------------ transformation */

  /** The machine powers up at the start of a transformation (either way). */
  power(): void {
    if (!this.live) return
    this.voices.spool()
  }

  /** Per frame: the machine bed runs while the transformation is in progress. */
  transforming(on: boolean): void {
    if (!this.ctx) return
    this.voices.bedLevel(on && this.enabled)
  }

  /** A mechanism begins its stroke; `seconds` is its duration at play speed. */
  mechanism(event: MechanismEvent, seconds: number): void {
    if (!this.live || !this.admit(seconds, event.size)) return
    const t = this.now()
    const pan = event.side * 0.35
    const dur = Math.max(0.12, seconds)
    switch (event.kind) {
      case 'slide':
        this.voices.motor(t, dur, event.size, pan, 0.9, 1.08)
        break
      case 'hinge':
        this.voices.motor(t, dur, event.size, pan, 1, 1)
        break
      case 'joint':
        this.voices.motor(t, dur, event.size, pan, 0.9, 0.9)
        break
      case 'telescope':
        this.voices.motor(t, dur, event.size, pan, 0.9, 1.15)
        break
      case 'servo':
        this.voices.motor(t, dur, 0.1, pan, 0.5, 1)
        break
      case 'hydraulic':
        this.voices.hydraulic(t, dur, pan)
        break
      case 'lift':
        this.voices.heavyLift(t, dur)
        break
    }
  }

  /** Per frame: lift-thruster throttle and ground impingement, both 0..1. */
  rocket(power: number, ground: number): void {
    if (!this.ctx) return
    this.rocketVoice.update(this.enabled ? power : 0, ground)
  }

  private now(): number {
    return (this.ctx as AudioContext).currentTime + 0.01
  }

  /** Voice budget: under load a new stroke plays only if it is larger than the smallest one running. */
  private admit(seconds: number, size: number): boolean {
    const now = (this.ctx as AudioContext).currentTime
    this.active = this.active.filter((v) => v.end > now)
    if (this.active.length >= VOICE_BUDGET && !this.active.some((v) => v.size < size)) return false
    this.active.push({ end: now + seconds + 0.1, size })
    return true
  }

  /* ------------------------------------------------------------ footfall */

  footstep(strength = 1): void {
    if (!this.live) return
    const ctx = this.ctx as AudioContext
    const t = this.now()
    const g = 0.5 * strength
    const bus = ctx.createGain()
    bus.gain.value = 0.4
    bus.connect(this.bus)
    const send = ctx.createGain()
    send.gain.value = 0.35
    bus.connect(send).connect(this.verbSend)
    // ground pressure: sub sine drop + lowpassed brown burst
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(64, t)
    o.frequency.exponentialRampToValueAtTime(34, t + 0.35)
    const og = ctx.createGain()
    og.gain.setValueAtTime(g, t)
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
    o.connect(og).connect(bus)
    o.start(t)
    o.stop(t + 0.55)
    this.shot(this.tex.brown, t, 0.32, bus, 'lowpass', 380, g * 0.9)
    // gravel crunch: a few dense grains of filtered chatter
    for (let i = 0; i < 6; i++) {
      this.shot(this.tex.chatter, t + Math.pow(Math.random(), 1.8) * 0.16, 0.05 + Math.random() * 0.05, bus, 'bandpass', 1400 + Math.random() * 2600, g * 0.18)
    }
    // damper exhale
    this.shot(this.tex.white, t + 0.05, 0.22, bus, 'bandpass', 2400, g * 0.05)
    setTimeout(() => { bus.disconnect(); send.disconnect() }, 1200)
  }

  private shot(buf: AudioBuffer, t: number, dur: number, dest: AudioNode, type: BiquadFilterType, f: number, gain: number): void {
    const ctx = this.ctx as AudioContext
    const src = ctx.createBufferSource()
    src.buffer = buf
    const fl = ctx.createBiquadFilter()
    fl.type = type
    fl.frequency.value = f
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(fl).connect(g).connect(dest)
    src.start(t, Math.random() * (buf.duration - dur - 0.05))
    src.stop(t + dur + 0.02)
  }

  /* --------------------------------------------------------------- drive */

  /**
   * The drive motor, kept deliberately plain: a soft hum whose pitch follows
   * road speed, with a faint, heavily filtered inverter whine on top. It is
   * silent at rest, like an electric car.
   */
  private buildMotor(): void {
    const ctx = this.ctx as AudioContext
    const gain = ctx.createGain()
    gain.gain.value = 0
    const soften = ctx.createBiquadFilter()
    soften.type = 'lowpass'
    soften.frequency.value = 700
    soften.Q.value = 0.5
    gain.connect(soften).connect(this.bus)
    const hum = ctx.createOscillator()
    const whine = ctx.createOscillator()
    const hg = ctx.createGain()
    hg.gain.value = 1
    const wg = ctx.createGain()
    wg.gain.value = 0.12
    hum.connect(hg).connect(gain)
    whine.connect(wg).connect(gain)
    hum.start()
    whine.start()
    this.motor = { gain, hum, whine }
  }

  drive(speed: number, throttle: number, isCar: boolean): void {
    if (!this.ctx) return
    const m = this.motor
    const t = this.ctx.currentTime
    const v = Math.abs(speed)
    const on = isCar && this.enabled ? 1 : 0
    m.hum.frequency.setTargetAtTime(DRIVE_HUM_HZ + v * 2.4, t, 0.15)
    m.whine.frequency.setTargetAtTime(DRIVE_WHINE_HZ + v * 11, t, 0.15)
    const load = Math.min(v / 30, 1) * 0.6 + Math.abs(throttle) * 0.4
    m.gain.gain.setTargetAtTime(on * DRIVE_LEVEL * Math.min(1, v / 1.5) * (0.35 + 0.65 * load), t, 0.2)
  }

  /* -------------------------------------------------------------- space */

  private outdoorImpulse(ctx: AudioContext): AudioBuffer {
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
}
