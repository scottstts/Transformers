import { Curve } from './curves'
import { CHANNELS, CH, ROOT_CHANNELS } from './pose'
import { MAX_KEYS, UNKEYED_SETTLE, type CombatMove, type MoveCue } from './moves'

/** Root motion channels settle quickly when unkeyed: the re-aim turn at a move's start. */
const ROOT_SETTLE = 0.2

/**
 * Plays one move at a time on the pose channels. `start` captures the current
 * values as every channel's start, so a chained move (or the recovery) picks
 * up exactly where the last one was; unkeyed channels ease to their neutral.
 */
export class MovePlayer {
  /** current channel values */
  readonly values = new Float32Array(CHANNELS)
  private readonly curves: Curve[] = Array.from({ length: CHANNELS }, () => new Curve(MAX_KEYS + 1))
  private move: CombatMove | null = null
  private cues: readonly MoveCue[] = []
  private nextCue = 0
  time = 0

  /** Begin `move` from the current values; `neutral` is where unkeyed channels settle. */
  start(move: CombatMove, neutral: Float32Array): void {
    this.move = move
    this.time = 0
    this.cues = move.cues ?? []
    this.nextCue = 0
    for (let i = 0; i < CHANNELS; i++) this.curves[i].settle(this.values[i], neutral[i], ROOT_CHANNELS.has(i) ? ROOT_SETTLE : UNKEYED_SETTLE)
    for (const [name, keys] of Object.entries(move.keys)) {
      if (keys?.length) this.curves[CH[name as keyof typeof CH]].set(this.values[CH[name as keyof typeof CH]], keys)
    }
    this.sample()
  }

  /** Settle every channel to `neutral` over `seconds` (the recovery into the stance). */
  settle(neutral: Float32Array, seconds: number, cues: readonly MoveCue[] = []): void {
    this.move = null
    this.time = 0
    this.cues = cues
    this.nextCue = 0
    for (let i = 0; i < CHANNELS; i++) this.curves[i].settle(this.values[i], neutral[i], seconds)
    this.sample()
  }

  /** Reset every channel to `values` (a combo starting from the gait). */
  reset(values: Float32Array): void {
    this.values.set(values)
    this.move = null
    this.cues = []
    this.time = 0
  }

  /** Advance by dt; `onCue` hears every cue crossed. */
  update(dt: number, onCue: (cue: MoveCue) => void): void {
    this.time += dt
    this.sample()
    while (this.nextCue < this.cues.length && this.cues[this.nextCue].t <= this.time) onCue(this.cues[this.nextCue++])
  }

  get current(): CombatMove | null {
    return this.move
  }

  private sample(): void {
    const t = this.time
    for (let i = 0; i < CHANNELS; i++) this.values[i] = this.curves[i].at(t)
  }
}
