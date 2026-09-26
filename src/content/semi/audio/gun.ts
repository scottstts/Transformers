import type { AudioMix } from '../../../audio/mix'
import { GUN_TAKES, gunTake, type GunSound } from './gun-bank'
import { GUN_PERIOD } from './gun-models'

/** Speed of sound (m/s): the cannon's shell bursting away from the camera arrives late. */
const SOUND_SPEED = 343
/** Levels: the machine gun's bus, the cannon's, and the coils' charge at full. */
const GUN_LEVEL = 0.46
const CANNON_LEVEL = 0.8
const CHARGE_LEVEL = 0.12
/** Scheduling latency (s): shots land this far after the frame that fires them, at their sub-frame offset. */
const LATENCY = 0.025

/**
 * The Semi's gun on the shared mix, from the takes of gun-bank.ts:
 *
 *   burst   one shot take per round, each starting exactly a period after the
 *           last (the recording's rate: the takes tile), scheduled at their
 *           offset within the frame so frame timing never makes it stutter;
 *           the tail when the burst stops
 *   cannon  the fitted cannon shot, delayed and dulled by its distance
 *   charge  the coils charging: mains hum through the capacitor bank and the
 *           crackle of corona on the coils, fixed filters, levels only
 *
 * The takes render once (about 150 ms, nearly all of it the two cannon
 * takes), when the fighter prepares its audio under the loading cover; if
 * there was no audio context then, the first shot renders them.
 */
export class GunAudio {
  private readonly mix: AudioMix
  private readonly takes: Record<GunSound, AudioBuffer[]> = { shot: [], tail: [], blast: [] }
  private bus: { gun: GainNode; cannon: GainNode } | null = null
  private charge: { gain: GainNode; loops: AudioBufferSourceNode[]; out: GainNode } | null = null
  /** audio time of the last shot, and the take last used (never the same twice running) */
  private lastShot = -Infinity
  private lastTake = -1
  private firing = false
  private lastFrame = 0
  /** real seconds of the last frame (the world's step may be slowed; shots follow real time) */
  private frameSeconds = 1 / 60

  constructor(mix: AudioMix) {
    this.mix = mix
  }

  /** Render the takes and build the buses (once the shared context exists). */
  prepare(): void {
    const ctx = this.mix.ctx
    if (!ctx || this.bus) return
    for (const sound of ['shot', 'tail', 'blast'] as const) {
      for (let v = 0; v < GUN_TAKES[sound]; v++) {
        const data = gunTake(sound, v, ctx.sampleRate)
        const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate)
        buffer.copyToChannel(data, 0)
        this.takes[sound].push(buffer)
      }
    }
    const out = this.mix.output
    const make = (level: number, air: number, send: number): GainNode => {
      const gain = ctx.createGain()
      gain.gain.value = level
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = air
      lp.Q.value = 0.5
      gain.connect(lp).connect(out.dry)
      const s = ctx.createGain()
      s.gain.value = send
      lp.connect(s).connect(out.send)
      return gain
    }
    // the robot's own gun, heard from the camera a dozen metres off
    this.bus = { gun: make(GUN_LEVEL, 7500, 0.35), cannon: make(CANNON_LEVEL, 9000, 0.55) }
  }

  /** Per frame, before this frame's shots: measures the frame's real length. */
  frame(): void {
    const ctx = this.mix.ctx
    if (!ctx) return
    const now = ctx.currentTime
    this.frameSeconds = Math.min(0.05, Math.max(1 / 240, now - this.lastFrame))
    this.lastFrame = now
  }

  /**
   * One round, `at` the share (0..1) of the way through this frame's world
   * step it was fired: it sounds a period after the last round if the burst
   * is running (the takes tile), else at its moment in the frame.
   */
  shot(at: number): void {
    const ctx = this.mix.ctx
    if (ctx && !this.bus) this.prepare()
    if (!ctx || !this.bus || !this.mix.enabled) return
    let t = ctx.currentTime + LATENCY + at * this.frameSeconds
    // a running burst keeps the recorded rate exactly: slow motion stretches the gaps, never the rounds
    if (this.firing && t - this.lastShot < GUN_PERIOD * 1.02) t = Math.max(t, this.lastShot + GUN_PERIOD)
    this.play(this.pick('shot'), this.bus.gun, t, 0.85 + Math.random() * 0.3)
    this.lastShot = t
    this.firing = true
  }

  /** The burst stops: its tail rings on after the last round's period. */
  cease(): void {
    const ctx = this.mix.ctx
    if (!ctx || !this.bus || !this.firing) return
    this.firing = false
    if (this.mix.enabled) this.play(this.pick('tail'), this.bus.gun, Math.max(ctx.currentTime, this.lastShot + GUN_PERIOD), 1)
  }

  /** The cannon: `distance` (m) from the camera to where it sounds, `strength` 0..1+. */
  cannon(distance: number, strength = 1): void {
    const ctx = this.mix.ctx
    if (ctx && !this.bus) this.prepare()
    if (!ctx || !this.bus || !this.mix.enabled) return
    const t = ctx.currentTime + 0.01 + distance / SOUND_SPEED
    const air = ctx.createBiquadFilter()
    air.type = 'lowpass'
    air.frequency.value = Math.max(1500, 12000 - distance * 160)
    air.Q.value = 0.5
    air.connect(this.bus.cannon)
    this.play(this.pick('blast'), air, t, Math.min(1.4, strength))
  }

  /** The coils charging (0 off .. 1 full), per frame. */
  charging(level: number): void {
    const ctx = this.mix.ctx
    if (!ctx) return
    if (!this.charge && level <= 0) return
    const c = this.charge ?? this.buildCharge(ctx)
    c.gain.gain.setTargetAtTime(this.mix.enabled ? CHARGE_LEVEL * Math.min(1.2, level) : 0, ctx.currentTime, 0.06)
  }

  dispose(): void {
    this.firing = false
    if (this.charge) {
      for (const l of this.charge.loops) l.stop()
      this.charge.out.disconnect()
      this.charge = null
    }
  }

  private pick(sound: GunSound): AudioBuffer {
    const list = this.takes[sound]
    let k = Math.floor(Math.random() * list.length)
    if (sound === 'shot' && list.length > 1 && k === this.lastTake) k = (k + 1) % list.length
    if (sound === 'shot') this.lastTake = k
    return list[k]
  }

  private play(buffer: AudioBuffer, dest: AudioNode, t: number, level: number): void {
    const ctx = this.mix.ctx as AudioContext
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const g = ctx.createGain()
    g.gain.value = level
    src.connect(g).connect(dest)
    src.start(t)
    src.onended = () => { g.disconnect(); if (dest !== this.bus?.gun && dest !== this.bus?.cannon) dest.disconnect() }
  }

  private buildCharge(ctx: AudioContext) {
    const out = ctx.createGain()
    out.connect(this.mix.output.dry)
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.connect(out)
    const loop = (buffer: AudioBuffer, type: BiquadFilterType, f: number, q: number, level: number): AudioBufferSourceNode => {
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.loop = true
      const fl = ctx.createBiquadFilter()
      fl.type = type
      fl.frequency.value = f
      fl.Q.value = q
      const g = ctx.createGain()
      g.gain.value = level
      src.connect(fl).connect(g).connect(gain)
      src.start(0, Math.random() * buffer.duration)
      return src
    }
    // the capacitor bank's hum (noise through narrow bands at 100 and 200 Hz: a transformer's, not an oscillator's) and corona crackle
    const loops = [
      loop(this.mix.tex.brown, 'bandpass', 100, 7, 2.2),
      loop(this.mix.tex.brown, 'bandpass', 200, 7, 0.9),
      loop(this.mix.tex.crackle, 'highpass', 2600, 0.5, 0.35),
    ]
    this.charge = { gain, loops, out }
    return this.charge
  }
}
