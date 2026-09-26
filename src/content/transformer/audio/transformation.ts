import type { AudioMix } from '../../../audio/mix'
import type { MechanismEvent } from '../asset/format'
import { MachineVoices, type MachineTuning } from './machine'

/** Concurrent stroke voices kept; the smallest strokes yield first. */
const VOICE_BUDGET = 12

/**
 * The transformation as one machine (see machine.ts): the hydraulic power unit
 * runs while it transforms and every exported mechanism event drives the
 * actuator it describes. The graph is prepared during loading when the shared
 * audio context exists.
 */
export class TransformationSound {
  private readonly mix: AudioMix
  private readonly tuning: MachineTuning
  private voices: MachineVoices | null = null
  private active: Array<{ end: number; size: number }> = []

  constructor(mix: AudioMix, tuning: MachineTuning) {
    this.mix = mix
    this.tuning = tuning
  }

  private get machine(): MachineVoices | null {
    if (!this.mix.ctx) return null
    if (!this.voices) this.voices = new MachineVoices(this.mix, this.tuning)
    return this.voices
  }

  prepare(): void {
    void this.machine
  }

  /** The machine powers up at the start of a transformation (either way). */
  power(): void {
    if (this.mix.enabled) this.machine?.spool()
  }

  /** Per frame: the power unit runs while the transformation is in progress. */
  running(on: boolean): void {
    this.machine?.update(on && this.mix.enabled)
  }

  /** A mechanism begins its stroke; `seconds` is its duration at play speed. */
  stroke(event: MechanismEvent, seconds: number): void {
    const voices = this.machine
    if (!voices || !this.mix.enabled || !this.admit(seconds, event.size)) return
    const t = (this.mix.ctx as AudioContext).currentTime + 0.01
    const pan = event.side * 0.35
    const dur = Math.max(0.15, seconds)
    const seed = event.name
    switch (event.kind) {
      case 'slide':
        voices.drive(t, dur, event.size, pan, seed, { trim: 1.05, rail: true })
        break
      case 'hinge':
        voices.drive(t, dur, event.size, pan, seed, { trim: 0.85, rotary: true })
        break
      case 'joint':
        // the robot's own joints are smooth harmonic drives over long moves: no ratchet on those
        voices.drive(t, dur, Math.max(event.size, 2.1), pan, seed, { trim: 0.7, rotary: dur < 1.5, level: 0.9 })
        break
      case 'servo':
        voices.drive(t, dur, 0.1, pan, seed, { trim: 1.2, rotary: true, level: 0.45 })
        break
      case 'telescope':
      case 'hydraulic':
        voices.ram(t, dur, event.size, pan, seed)
        break
      case 'lift':
        voices.heavyLift(t, dur, seed)
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
