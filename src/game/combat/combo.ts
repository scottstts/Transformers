/** A move's timing as the combo sees it (s). */
export interface ComboMove {
  duration: number
  /** the window in which a click chains the next move; it may run past the duration (the last pose holds) */
  chain: readonly [number, number]
}

export type ComboEvent =
  | { type: 'start'; move: number }
  | { type: 'recover' }
  | { type: 'end' }

/**
 * The click combo: clicks play the moves in order, 1-2-3-4. A move accepts the
 * next click only in its chain window, as the strike settles: clicking
 * earlier does nothing (the throttle), and letting the window close ends the
 * combo, which recovers into the stance and starts again from the first move.
 * After the last move no click chains; once the recovery is far enough along
 * (`restartAt`) a click starts a new combo from its current pose.
 */
export class ComboController {
  phase: 'idle' | 'move' | 'recover' = 'idle'
  /** the move playing (or the last one played, while recovering) */
  move = -1
  /** time in the current move or recovery (s) */
  time = 0
  private readonly moves: readonly ComboMove[]
  private readonly recoverTime: number
  private readonly restartAt: number
  private pressed = false

  constructor(moves: readonly ComboMove[], recoverTime: number, restartAt: number) {
    this.moves = moves
    this.recoverTime = recoverTime
    this.restartAt = restartAt
  }

  get active(): boolean {
    return this.phase !== 'idle'
  }

  /** A click; it is taken on the next update. */
  press(): void {
    this.pressed = true
  }

  /** Stop at once (the robot leaves its stance). */
  cancel(): void {
    this.phase = 'idle'
    this.move = -1
    this.time = 0
    this.pressed = false
  }

  update(dt: number, emit: (event: ComboEvent) => void): void {
    const click = this.pressed
    this.pressed = false
    if (this.phase === 'idle') {
      if (click) this.begin(0, emit)
      return
    }
    this.time += dt
    if (this.phase === 'move') {
      const m = this.moves[this.move]
      const last = this.move === this.moves.length - 1
      if (click && !last && this.time >= m.chain[0] && this.time <= m.chain[1]) {
        this.begin(this.move + 1, emit)
        return
      }
      if (this.time >= (last ? m.duration : Math.max(m.duration, m.chain[1]))) {
        this.phase = 'recover'
        this.time = 0
        emit({ type: 'recover' })
      }
      return
    }
    if (click && this.time >= this.restartAt) {
      this.begin(0, emit)
      return
    }
    if (this.time >= this.recoverTime) {
      this.phase = 'idle'
      this.move = -1
      this.time = 0
      emit({ type: 'end' })
    }
  }

  private begin(move: number, emit: (event: ComboEvent) => void): void {
    this.phase = 'move'
    this.move = move
    this.time = 0
    emit({ type: 'start', move })
  }
}
