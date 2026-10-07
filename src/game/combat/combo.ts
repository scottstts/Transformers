import { comboAcceptsClick } from './contract'

/** A move's timing as the combo sees it (s). */
export interface ComboMove {
  duration: number
  /** the window in which a click chains the next move; it may run past the duration (the last pose holds) */
  chain: readonly [number, number]
  /** Grounded follow-through boundary at which movement may take over. */
  cancelAt?: number
}

export type ComboEvent =
  | { type: 'start'; move: number }
  | { type: 'recover' }
  | { type: 'end' }

/** After a move's chain window opens, movement may cut it short this much later (s). */
const CANCEL_AFTER = 0.1
/** How long movement may separate attacks without resetting their sequence (s). */
const CONTINUATION = 0.85

/**
 * The click combo: clicks play the moves in order, 1-2-3-4. A move chains the
 * next one only for a click inside its chain window (as the strike settles).
 * Earlier clicks are discarded at the press and never queued. Letting the
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
    if (this.phase !== 'move' || this.pressed) return false
    const move = this.moves[this.move]
    return this.time >= (move.cancelAt ?? move.chain[0] + CANCEL_AFTER)
  }

  /** Accept a click only if it can act at this instant; consume it once on update. */
  press(): boolean {
    if (this.pressed || !comboAcceptsClick(this.phase, this.time, this.moves[this.move]?.chain)) return false
    this.pressed = true
    return true
  }

  /** Hard reset: stance changes, guard and specials discard continuation. */
  cancel(): void {
    this.phase = 'idle'
    this.move = -1
    this.time = 0
    this.pressed = false
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
    this.time += dt
    if (this.phase === 'move') {
      const m = this.moves[this.move]
      const last = this.move === this.moves.length - 1
      if (click) {
        this.begin(last ? 0 : this.move + 1, emit)
        return
      }
      if (this.time >= (last ? m.duration : Math.max(m.duration, m.chain[1]))) {
        this.phase = 'recover'
        this.time = 0
        emit({ type: 'recover' })
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
    this.continuation = -1
    this.continuationTime = 0
    emit({ type: 'start', move })
  }
}
