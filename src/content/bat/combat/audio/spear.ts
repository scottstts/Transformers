import type { AudioMix } from '../../../../audio/mix'
import { SPEAR_TAKES, spearTake, type SpearSound } from './spear-bank'

/** Levels of the thrust and the slash. */
const LEVEL: Record<SpearSound, number> = { poke: 0.5, slash: 0.55 }
/** Scheduling latency (s). */
const LATENCY = 0.02

/**
 * The spear on the shared mix, from the takes of spear-bank.ts: `poke` a
 * thrust going home, `slash` a cut and its ring. A move cues each so the
 * take's loudest moment (POKE_PEAK / SLASH_PEAK from its start) falls on the
 * blow. The takes render once (a few tens of milliseconds) when the fighter
 * prepares its audio under the loading cover; if there was no context then,
 * the first blow renders them. Takes never repeat back to back.
 */
export class SpearAudio {
  private readonly mix: AudioMix
  private readonly takes: Record<SpearSound, AudioBuffer[]> = { poke: [], slash: [] }
  private bus: GainNode | null = null
  private readonly last: Record<SpearSound, number> = { poke: -1, slash: -1 }

  constructor(mix: AudioMix) {
    this.mix = mix
  }

  prepare(): void {
    const ctx = this.mix.ctx
    if (!ctx || this.bus) return
    for (const sound of ['poke', 'slash'] as const) {
      for (let v = 0; v < SPEAR_TAKES[sound]; v++) {
        const data = spearTake(sound, v, ctx.sampleRate)
        const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate)
        buffer.copyToChannel(data, 0)
        this.takes[sound].push(buffer)
      }
    }
    // the robot's own spear, heard from the camera a dozen metres off
    const out = this.mix.output
    const gain = ctx.createGain()
    const air = ctx.createBiquadFilter()
    air.type = 'lowpass'
    air.frequency.value = 9000
    air.Q.value = 0.5
    gain.connect(air).connect(out.dry)
    const send = ctx.createGain()
    send.gain.value = 0.3
    air.connect(send).connect(out.send)
    this.bus = gain
  }

  /** A take of `sound` at `strength` 0..1+, played at `rate` (a bigger, slower swing is lower and longer). */
  play(sound: SpearSound, strength: number, rate = 1): void {
    const ctx = this.mix.ctx
    if (ctx && !this.bus) this.prepare()
    if (!ctx || !this.bus || !this.mix.enabled) return
    const list = this.takes[sound]
    let k = Math.floor(Math.random() * list.length)
    if (k === this.last[sound]) k = (k + 1) % list.length
    this.last[sound] = k
    const src = ctx.createBufferSource()
    src.buffer = list[k]
    src.playbackRate.value = rate * (0.96 + Math.random() * 0.08)
    const g = ctx.createGain()
    g.gain.value = LEVEL[sound] * Math.min(1.5, strength)
    src.connect(g).connect(this.bus)
    const t = ctx.currentTime + LATENCY
    src.start(t)
    src.onended = () => g.disconnect()
  }
}
