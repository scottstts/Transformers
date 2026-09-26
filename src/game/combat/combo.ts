/** A move's timing as the combo sees it (s). */
export interface ComboMove {
  duration: number
  /** the window in which a click chains the next move; it may run past the duration (the last pose holds) */
  chain: readonly [number, number]
  /** Grounded follow-through boundary at which movement/guard may take over. */
  cancelAt?: number
}

export type ComboEvent =
  | { type: 'start'; move: number }
  | { type: 'recover' }
  | { type: 'end' }

/** After a move's chain window opens, movement may cut it short this much later (s) if no click is waiting. */
const CANCEL_AFTER = 0.1
/** How long movement may separate attacks without resetting their sequence (s). */
const CONTINUATION = 0.85

/**
 * The click combo: clicks play the moves in order, 1-2-3-4. A move chains the
 * next one when its chain window opens (as the strike settles). A click
 * earlier in the move is buffered and fires as the window opens, so mashing
 * plays the combo at its authored cadence and no click is lost. Letting the
 * window close ends the combo, which recovers into the stance and starts
 * again from the first move. A click in the last move's window, or at any
 * time in the recovery, starts a new combo at once from the pose the robot is
 * settling through.
 *
 * Movement exits at an authored grounded boundary (`cancellable`) and keeps
 * the next move for a short reposition. A hard cancel clears that memory.
 */
export class ComboController {
  phase: 'idle' | 'move' | 'recover' = 'idle'
  /** the move playing (or the last one played, while recovering) */
  move = -1
  /** time in the current move or recovery (s) */
  time = 0
  private readonly moves: readonly ComboMove[]
  private readonly recoverTime: number
  private pressed = false
  /** a click that came before the chain window opened */
  private buffered = false
  private continuation = -1
  private continuationTime = 0

  constructor(moves: readonly ComboMove[], recoverTime: number) {
    this.moves = moves
    this.recoverTime = recoverTime
  }

  get active(): boolean {
    return this.phase !== 'idle'
  }

  /** Movement may take the robot back now. */
  get cancellable(): boolean {
    if (this.phase === 'recover') return true
    if (this.phase !== 'move' || this.buffered || this.pressed) return false
    const move = this.moves[this.move]
    return this.time >= (move.cancelAt ?? move.chain[0] + CANCEL_AFTER)
  }

  /** A click; it is taken on the next update. */
  press(): void {
    this.pressed = true
  }

  /** Hard reset: stance changes, guard and specials discard continuation. */
  cancel(): void {
    this.phase = 'idle'
    this.move = -1
    this.time = 0
    this.pressed = false
    this.buffered = false
    this.continuation = -1
    this.continuationTime = 0
  }

  /** Reposition briefly without losing the next attack. A hard cancel still clears it. */
  release(): void {
    if (!this.cancellable) return
    const next = this.move >= 0 ? (this.move + 1) % this.moves.length : -1
    this.cancel()
    this.continuation = next
    this.continuationTime = next < 0 ? 0 : CONTINUATION
  }

  /** Go straight into the recovery (the special that held the fight has ended). */
  recover(emit: (event: ComboEvent) => void): void {
    this.continuation = -1
    this.continuationTime = 0
    this.phase = 'recover'
    this.move = -1
    this.time = 0
    this.pressed = false
    this.buffered = false
    emit({ type: 'recover' })
  }

  update(dt: number, emit: (event: ComboEvent) => void): void {
    const click = this.pressed
    this.pressed = false
    if (this.phase === 'idle') {
      if (click) this.begin(this.continuationTime > 0 ? this.continuation : 0, emit)
      else this.continuationTime = Math.max(0, this.continuationTime - dt)
      return
    }
    const previous = this.time
    this.time += dt
    if (this.phase === 'move') {
      const m = this.moves[this.move]
      const last = this.move === this.moves.length - 1
      if (click && this.time < m.chain[0]) this.buffered = true
      if ((click || this.buffered) && this.time >= m.chain[0] && previous <= m.chain[1]) {
        this.begin(last ? 0 : this.move + 1, emit)
        return
      }
      if (this.time >= (last ? m.duration : Math.max(m.duration, m.chain[1]))) {
        this.phase = 'recover'
        this.time = 0
        this.buffered = false
        emit({ type: 'recover' })
        // A fresh press just outside the window is a restart, never a lost input.
        if (click) this.begin(0, emit)
      }
      return
    }
    if (click) {
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
    this.buffered = false
    this.continuation = -1
    this.continuationTime = 0
    emit({ type: 'start', move })
  }
}
