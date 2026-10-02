import type { AudioMix } from '../../audio/mix'
import { noise, voice } from '../transformer/combat/audio/shots'
import { SPEAR_TAKES, spearTake, type SpearSound } from '../bat/combat/audio/spear-bank'
import { STRIKE_TAKES, strikeTake } from './strike-bank'

/** Swings: level of a take at strength 1, and the rate a 7 m lance plays the fitted spear at (bigger and slower is lower and longer). */
const SWING_LEVEL: Record<SpearSound, number> = { poke: 0.5, slash: 0.55 }
const SWING_RATE = 0.8

interface CommanderBank {
  strikes: { light: AudioBuffer[]; heavy: AudioBuffer[] }
  takes: Record<SpearSound, AudioBuffer[]>
}
const banks = new WeakMap<BaseAudioContext, CommanderBank>()

/** The commanders' rendered takes for an audio context: its blows on plate and its lance's swings. */
function commanderBank(ctx: BaseAudioContext): CommanderBank {
  let bank = banks.get(ctx)
  if (bank) return bank
  bank = { strikes: { light: [], heavy: [] }, takes: { poke: [], slash: [] } }
  for (let v = 0; v < STRIKE_TAKES; v++) {
    for (const heavy of [false, true]) {
      const data = strikeTake(v, heavy, ctx.sampleRate)
      const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate)
      buffer.copyToChannel(data, 0)
      bank.strikes[heavy ? 'heavy' : 'light'].push(buffer)
    }
  }
  for (const sound of ['poke', 'slash'] as const) {
    for (let v = 0; v < SPEAR_TAKES[sound]; v++) {
      const data = spearTake(sound, v, ctx.sampleRate)
      const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate)
      buffer.copyToChannel(data, 0)
      bank.takes[sound].push(buffer)
    }
  }
  banks.set(ctx, bank)
  return bank
}
/** Its blow landing on the robot: level at strength 1, and on a raised shield (the shield's own sound carries it there). */
const HIT_LEVEL = 0.75
const HIT_GUARDED = 0.4
/** The wheels' bed at full speed (crunch, body) and the speed that is full (m/s). */
const WHEELS = { crunch: 0.05, body: 0.09, full: 7 }

/**
 * The commander's sound, heard from where it is (delayed at 343 m/s and
 * dulled with distance, like the soldiers'):
 *
 *   swing   its lance through the air: the spear's thrust and slash takes
 *           (fitted to recordings, bat/combat/audio/spear-bank.ts), played
 *           slower for the longer, heavier lance
 *   servo   its body driving a move: a low, soft mechanical push (brown
 *           noise under a fixed low-pass and a faint fixed band of drive
 *           whine), levels only
 *   wheels  its heavy tyres on the sand: a continuous bed (granular crunch
 *           and low body) following its speed
 *   hit     its lance landing on the robot (strike-bank.ts): heavy point on
 *           thick plate, the body's thud and the lance's energy arcing into
 *           the metal; the whirl's knock-back a heavier take
 *   charge  the lance gathering energy: an arc's crackle and hiss
 *   slam    the lance driven into the ground: a deep pressure thump and the
 *           sand thrown up and raining back
 *
 * Fixed filters and level envelopes only; nothing is pitched or swept.
 */
export class CommanderAudio {
  private readonly mix: AudioMix
  private takes: Record<SpearSound, AudioBuffer[]> = { poke: [], slash: [] }
  private readonly last: Record<SpearSound, number> = { poke: -1, slash: -1 }
  private wheels: { crunch: GainNode; body: GainNode } | null = null
  private strikes: { light: AudioBuffer[]; heavy: AudioBuffer[] } = { light: [], heavy: [] }
  private lastStrike = -1

  constructor(mix: AudioMix) {
    this.mix = mix
  }

  /** Render the swing and strike takes (once per audio context, shared by every commander) and build the wheels' voice (under the loading cover). */
  prepare(): void {
    const ctx = this.mix.ctx
    if (!ctx || this.wheels) return
    const bank = commanderBank(ctx)
    this.strikes = bank.strikes
    this.takes = bank.takes
    const loop = (buffer: AudioBuffer, type: BiquadFilterType, f: number): GainNode => {
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.loop = true
      const filter = ctx.createBiquadFilter()
      filter.type = type
      filter.frequency.value = f
      filter.Q.value = 0.4
      const gain = ctx.createGain()
      gain.gain.value = 0
      src.connect(filter).connect(gain).connect(this.mix.output.dry)
      const send = ctx.createGain()
      send.gain.value = 0.15
      gain.connect(send).connect(this.mix.output.send)
      src.start(ctx.currentTime, Math.random() * buffer.duration)
      return gain
    }
    this.wheels = { crunch: loop(this.mix.tex.crackle, 'bandpass', 900), body: loop(this.mix.tex.brown, 'lowpass', 110) }
  }

  /** Per frame: its rolling speed (m/s) and distance (m); 0 speed while it is down or gone. */
  update(speed: number, distance: number): void {
    const ctx = this.mix.ctx
    if (!ctx) return
    if (!this.wheels) this.prepare()
    const w = this.wheels!
    const k = Math.min(1, speed / WHEELS.full) / (1 + distance * 0.06)
    w.crunch.gain.setTargetAtTime(WHEELS.crunch * k, ctx.currentTime, 0.12)
    w.body.gain.setTargetAtTime(WHEELS.body * k, ctx.currentTime, 0.12)
  }

  /** A swing of the lance, `strength` 0..1.4, `distance` m away. */
  swing(sound: SpearSound, strength: number, distance: number): void {
    const ctx = this.mix.ctx
    if (!ctx || !this.mix.enabled) return
    if (!this.wheels) this.prepare()
    const list = this.takes[sound]
    if (!list.length) return
    let k = Math.floor(Math.random() * list.length)
    if (k === this.last[sound]) k = (k + 1) % list.length
    this.last[sound] = k
    const t = ctx.currentTime + 0.005 + distance / 343
    const bus = voice(this.mix, SWING_LEVEL[sound] * Math.min(1.4, strength) / (1 + distance * 0.05), 0.3, 1.2)
    const src = ctx.createBufferSource()
    src.buffer = list[k]
    src.playbackRate.value = SWING_RATE * (0.96 + Math.random() * 0.08)
    const dull = ctx.createBiquadFilter()
    dull.type = 'lowpass'
    dull.frequency.value = 14000 / (1 + distance * 0.06)
    dull.Q.value = 0.5
    src.connect(dull).connect(bus)
    src.start(t)
  }

  /** Its blow landing on the robot (`heavy` the knock-back), `strength` 0..1, `distance` m away; on a raised shield it is quieter and dulled. */
  hit(heavy: boolean, strength: number, guarded: boolean, distance: number): void {
    const ctx = this.mix.ctx
    if (!ctx || !this.mix.enabled) return
    if (!this.wheels) this.prepare()
    const list = this.strikes[heavy ? 'heavy' : 'light']
    if (!list.length) return
    let k = Math.floor(Math.random() * list.length)
    if (k === this.lastStrike) k = (k + 1) % list.length
    this.lastStrike = k
    const t = ctx.currentTime + 0.003 + distance / 343
    const bus = voice(this.mix, HIT_LEVEL * (guarded ? HIT_GUARDED : 1) * (0.6 + 0.4 * Math.min(1, strength)) / (1 + distance * 0.04), 0.35, 1.8)
    const src = ctx.createBufferSource()
    src.buffer = list[k]
    const dull = ctx.createBiquadFilter()
    dull.type = 'lowpass'
    dull.frequency.value = (guarded ? 3500 : 16000) / (1 + distance * 0.05)
    dull.Q.value = 0.5
    src.connect(dull).connect(bus)
    src.start(t)
  }

  /** The lance gathering energy, `strength` 0..1+, `distance` m away. */
  charge(strength: number, distance: number): void {
    const ctx = this.mix.ctx
    if (!ctx || !this.mix.enabled) return
    const t = ctx.currentTime + 0.005 + distance / 343
    const bus = voice(this.mix, 0.1 * Math.min(1.3, strength) / (1 + distance * 0.06), 0.3, 1.2)
    noise(ctx, this.mix.tex.crackle, bus, t, 0.6, 'highpass', 2200, 2200, 0.25, 0.6, 0.15)
    noise(ctx, this.mix.tex.white, bus, t, 0.55, 'highpass', 5000, 5000, 0.3, 0.12, 0.1)
  }

  /** The lance driven into the ground, `strength` 0..1, `distance` m away. */
  slam(strength: number, distance: number): void {
    const ctx = this.mix.ctx
    if (!ctx || !this.mix.enabled) return
    const t = ctx.currentTime + 0.005 + distance / 343
    const bus = voice(this.mix, 0.5 * Math.min(1.2, strength) / (1 + distance * 0.04), 0.5, 2)
    noise(ctx, this.mix.tex.brown, bus, t, 0.7, 'lowpass', 120, 120, 0.004, 1, 0.05)
    noise(ctx, this.mix.tex.brown, bus, t, 0.35, 'lowpass', 400, 400, 0.002, 0.4)
    // the sand thrown up and raining back
    noise(ctx, this.mix.tex.crackle, bus, t + 0.05, 1.1, 'bandpass', 1400, 1400, 0.08, 0.22, 0.2, 0.4)
  }

  /** Its body driving a move, `strength` 0..1, `distance` m away. */
  servo(strength: number, distance: number): void {
    const ctx = this.mix.ctx
    if (!ctx || !this.mix.enabled) return
    const t = ctx.currentTime + 0.005 + distance / 343
    const bus = voice(this.mix, 0.16 * Math.min(1, strength) / (1 + distance * 0.06), 0.3, 1)
    noise(ctx, this.mix.tex.brown, bus, t, 0.45, 'lowpass', 170, 170, 0.06, 0.8)
    noise(ctx, this.mix.tex.white, bus, t + 0.02, 0.35, 'bandpass', 520, 520, 0.08, 0.05, 0, 0.5)
  }
}
