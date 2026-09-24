import type { AudioMix } from '../../../audio/mix'
import type { MechanismEvent } from '../asset/format'
import { MechanismVoices, type MechanismTuning } from './mechanism'

/** Concurrent stroke voices kept; the smallest strokes yield first. */
const VOICE_BUDGET = 10

/**
 * The transformation as one machine: a bed hum while it runs and an actuator
 * voice per stroke from the exported mechanism events (see mechanism.ts). The
 * graph is built on first use, once the shared audio context exists.
 */
export class TransformationSound {
  private readonly mix: AudioMix
  private readonly tuning: MechanismTuning
  private voices: MechanismVoices | null = null
  private active: Array<{ end: number; size: number }> = []

  constructor(mix: AudioMix, tuning: MechanismTuning) {
    this.mix = mix
    this.tuning = tuning
  }

  private get machine(): MechanismVoices | null {
    const ctx = this.mix.ctx
    if (!ctx) return null
    if (!this.voices) this.voices = new MechanismVoices(ctx, this.mix.tex, this.mix.output, this.tuning)
    return this.voices
  }

  /** The machine powers up at the start of a transformation (either way). */
  power(): void {
    if (this.mix.enabled) this.machine?.spool()
  }

  /** Per frame: the machine bed runs while the transformation is in progress. */
  running(on: boolean): void {
    this.machine?.bedLevel(on && this.mix.enabled)
  }

  /** A mechanism begins its stroke; `seconds` is its duration at play speed. */
  stroke(event: MechanismEvent, seconds: number): void {
    const voices = this.machine
    if (!voices || !this.mix.enabled || !this.admit(seconds, event.size)) return
    const t = (this.mix.ctx as AudioContext).currentTime + 0.01
    const pan = event.side * 0.35
    const dur = Math.max(0.12, seconds)
    switch (event.kind) {
      case 'slide':
        voices.motor(t, dur, event.size, pan, 0.9, 1.08)
        break
      case 'hinge':
        voices.motor(t, dur, event.size, pan, 1, 1)
        break
      case 'joint':
        voices.motor(t, dur, event.size, pan, 0.9, 0.9)
        break
      case 'telescope':
        voices.motor(t, dur, event.size, pan, 0.9, 1.15)
        break
      case 'servo':
        voices.motor(t, dur, 0.1, pan, 0.5, 1)
        break
      case 'hydraulic':
        voices.hydraulic(t, dur, pan)
        break
      case 'lift':
        voices.heavyLift(t, dur)
        break
    }
  }

  dispose(): void {
    this.voices?.dispose()
    this.voices = null
    this.active = []
  }

  /** Voice budget: under load a new stroke plays only if it is larger than the smallest one running. */
  private admit(seconds: number, size: number): boolean {
    const now = (this.mix.ctx as AudioContext).currentTime
    this.active = this.active.filter((v) => v.end > now)
    if (this.active.length >= VOICE_BUDGET && !this.active.some((v) => v.size < size)) return false
    this.active.push({ end: now + seconds + 0.1, size })
    return true
  }
}
