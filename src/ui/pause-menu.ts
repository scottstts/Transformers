/** What the pause menu needs from the running game. */
export interface PauseHost {
  /** the pointer is locked to the game */
  readonly locked: boolean
  /** another overlay has the pointer and Escape (the vehicle menu, its loading cover) */
  readonly blocked: boolean
  /** take the pointer back from a user gesture; false when the browser refuses */
  lock(): Promise<boolean>
  /** freeze or release the game (simulation, rendering and sound) */
  pausedChanged(paused: boolean): void
}

/**
 * The pause menu: the frozen frame dimmed and softened behind a small plate
 * saying Paused and a Resume button.
 *
 * Browsers keep Escape to release a locked pointer, and the key may never
 * reach the page, so on desktop losing the lock during play pauses (Escape, or
 * the window losing focus) unless the vehicle menu holds the pointer. Escape
 * reaching the page pauses too. Resuming locks the pointer again, which needs
 * a gesture Escape is not: a click, Enter or Space resumes, and the game
 * releases once the lock is back. A refused lock (browsers refuse one that
 * comes right after the player released it) shakes the button to try again.
 */
export class PauseMenu {
  private readonly host: PauseHost
  private readonly root: HTMLDivElement
  private readonly button: HTMLButtonElement
  private paused = false
  private resuming = false

  private readonly onKey = (event: KeyboardEvent): void => {
    if (!this.playing) return
    if (!this.paused) {
      if (event.code === 'Escape' && !this.host.blocked) {
        event.preventDefault()
        this.pause()
      }
      return
    }
    if (event.code === 'Escape') {
      event.preventDefault()
      // Escape cannot take the pointer back: point at the button instead
      this.nudge()
    } else if (event.code === 'Enter' || event.code === 'Space') {
      event.preventDefault()
      if (!event.repeat) this.resume()
    }
  }

  private readonly onLockChange = (): void => {
    if (!this.playing) return
    if (this.host.locked) this.release()
    else if (!this.host.blocked) this.pause()
  }

  constructor(host: PauseHost) {
    this.host = host
    this.root = document.createElement('div')
    this.root.className = 'pause'
    this.root.setAttribute('role', 'dialog')
    this.root.setAttribute('aria-modal', 'true')
    this.root.setAttribute('aria-labelledby', 'pause-title')
    this.root.inert = true
    const plate = document.createElement('div')
    plate.className = 'pause-plate'
    const title = document.createElement('p')
    title.className = 'pause-title'
    title.id = 'pause-title'
    title.innerHTML = '<i aria-hidden="true"></i><span>Paused</span><i aria-hidden="true"></i>'
    this.button = document.createElement('button')
    this.button.type = 'button'
    this.button.className = 'pause-resume'
    this.button.innerHTML = '<span>Resume</span><svg viewBox="0 0 24 12" aria-hidden="true"><path d="M1 6h20M16 1l5 5-5 5" /></svg>'
    this.button.addEventListener('click', () => { this.resume() })
    this.button.addEventListener('animationend', () => { this.button.classList.remove('nudge') })
    plate.append(title, this.button)
    const keys = document.createElement('p')
    keys.className = 'pause-keys'
    keys.innerHTML = '<kbd>Enter</kbd><span>to resume</span>'
    plate.append(keys)
    this.root.append(plate)
    document.body.append(this.root)
    window.addEventListener('keydown', this.onKey)
    document.addEventListener('pointerlockchange', this.onLockChange)
  }

  get isPaused(): boolean { return this.paused }

  /**
   * Pause if play has stopped with nothing over it: the vehicle menu closed
   * and could not take the pointer back (it closed from Escape, or after a
   * load, without a gesture).
   */
  settle(): void {
    if (this.playing && !this.host.locked && !this.host.blocked) this.pause()
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey)
    document.removeEventListener('pointerlockchange', this.onLockChange)
    this.root.remove()
  }

  /** In play: past the entry screen, and not failed. */
  private get playing(): boolean {
    return document.body.classList.contains('ready')
  }

  private pause(): void {
    if (this.paused) return
    this.paused = true
    this.host.pausedChanged(true)
    document.body.classList.add('paused')
    this.root.inert = false
    this.button.focus({ preventScroll: true })
    // Escape that reached the page while locked: the browser may not have released it
    if (this.host.locked) document.exitPointerLock()
  }

  private resume(): void {
    if (!this.paused || this.resuming) return
    // the lock change releases the game; a refusal leaves the menu up
    this.resuming = true
    void this.host.lock().then((locked) => {
      this.resuming = false
      if (!locked && this.paused) this.nudge()
    })
  }

  private release(): void {
    if (!this.paused) return
    this.paused = false
    this.root.inert = true
    this.button.blur()
    document.body.classList.remove('paused')
    this.host.pausedChanged(false)
  }

  /** The button shakes: resume from it (a click, Enter or Space). */
  private nudge(): void {
    this.button.classList.remove('nudge')
    void this.button.offsetWidth
    this.button.classList.add('nudge')
    this.button.focus({ preventScroll: true })
  }
}
