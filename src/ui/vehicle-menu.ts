import type { RosterEntry } from '../content/roster'

/** What the menu needs from the running game. */
export interface VehicleHost {
  readonly roster: readonly RosterEntry[]
  current(): string
  switchTo(entry: RosterEntry): Promise<boolean>
  canSwitchInstantly(entry: RosterEntry): boolean
  /** return to play (pointer lock), from a user gesture */
  resume(): void
  /** pause / restore mouse look while the menu sits over the locked pointer */
  holdLook(held: boolean): void
  readonly playing: boolean
  /** the robot stands (it can fight) */
  readonly standing: boolean
  /** the special's meter is full */
  readonly specialReady: boolean
  /** a special's cutscene is playing: the menu stays shut */
  readonly cinematic: boolean
  /** on-screen touch controls instead of mouse and keyboard */
  readonly touch: boolean
  /** the menu opened or closed */
  openChanged?(open: boolean): void
}

/** Horizontal drag (px) that counts as a swipe. */
const SWIPE_PX = 40

type HintMode = 'play' | 'fight' | 'special' | 'paused' | 'touch'

const HINTS: Record<HintMode, string> = {
  play: '<kbd>Tab</kbd><span>to switch</span><i></i><kbd>R</kbd><span>to transform</span>',
  fight: '<kbd>Tab</kbd><span>to switch</span><i></i><kbd>R</kbd><span>to transform</span><i></i><kbd>Click</kbd><span>to fight</span><i></i><kbd>Right</kbd><span>guard</span>',
  special: '<kbd>Click</kbd><span>to fight</span><i></i><kbd>Right</kbd><span>guard</span><i></i><kbd>F</kbd><span>special</span>',
  paused: '<span>Click to play</span><i></i><kbd>Tab</kbd><span>to switch</span>',
  touch: '<span>Switch vehicle</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 10 4-4 4 4"/></svg>',
}

/**
 * The vehicle menu. Collapsed, it is a small hint pill at the bottom of the
 * screen (on touch screens at the top, clear of the thumbs) saying how to
 * switch and transform; opening it grows the same glass panel out of the pill
 * into a carousel of car names. The morph is one clip-path transition on the
 * panel, laid out at full size throughout, so nothing reflows while it runs.
 *
 * Tab opens it over the locked pointer (mouse look and game keys pause;
 * Escape still releases the pointer, as browsers require, leaving the menu open
 * for the mouse); the arrow keys, the arrow buttons, a horizontal swipe or a
 * click on a neighbouring name swipe to the next car, which is swapped in live
 * behind the panel. Tab, Escape, Enter or the backdrop closes it and returns
 * to play. On touch screens a tap on the pill opens it.
 */
export class VehicleMenu {
  private readonly host: VehicleHost
  private readonly root: HTMLDivElement
  private readonly panel: HTMLDivElement
  private readonly body: HTMLDivElement
  private readonly track: HTMLDivElement
  private readonly names: HTMLButtonElement[] = []
  private readonly prev: HTMLButtonElement
  private readonly next: HTMLButtonElement
  private readonly status: HTMLParagraphElement
  private readonly hint: HTMLButtonElement
  /** darkens the screen while a car loads; the game is locked and silent until it lifts */
  private readonly cover: HTMLDivElement
  private readonly coverName: HTMLElement
  private readonly hintLabels = new Map<HintMode, HTMLSpanElement>()
  private hintMode: HintMode | null = null
  private open = false
  /** the car shown in the centre (the one being switched to while loading) */
  private index = 0
  private loading = false
  private dragX: number | null = null

  private readonly onKey = (event: KeyboardEvent): void => {
    if (!document.body.classList.contains('ready')) return
    if (event.code === 'Tab') {
      event.preventDefault()
      if (this.host.cinematic) return
      // the menu stays until the car it is loading is ready
      if (this.loading) return
      if (this.open) this.close(true)
      else this.show()
      return
    }
    if (!this.open) return
    // the menu owns the keyboard: nothing reaches the game's (bubble-phase) listeners
    event.stopPropagation()
    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      event.preventDefault()
      if (!event.repeat) this.swipe(event.code === 'ArrowLeft' ? -1 : 1)
    } else if (event.code === 'Escape' || event.code === 'Enter') {
      event.preventDefault()
      if (!this.loading) this.close(true)
    }
  }

  private readonly onLockChange = (): void => { this.refreshHint() }
  private readonly onResize = (): void => { this.measureHint() }

  constructor(host: VehicleHost) {
    this.host = host
    this.root = document.createElement('div')
    this.root.className = 'garage'
    this.root.classList.toggle('touch', host.touch)

    this.panel = document.createElement('div')
    this.panel.className = 'garage-panel'
    this.panel.setAttribute('role', 'dialog')
    this.panel.setAttribute('aria-label', 'Vehicle')

    this.hint = document.createElement('button')
    this.hint.type = 'button'
    this.hint.className = 'garage-hint'
    this.hint.setAttribute('aria-label', 'Switch vehicle')
    for (const mode of Object.keys(HINTS) as HintMode[]) {
      const label = document.createElement('span')
      label.className = 'garage-hint-label'
      label.innerHTML = HINTS[mode]
      this.hint.append(label)
      this.hintLabels.set(mode, label)
    }
    this.hint.addEventListener('click', () => { this.show() })

    this.body = document.createElement('div')
    this.body.className = 'garage-body'
    this.prev = this.arrow('prev', 'Previous vehicle', -1)
    this.next = this.arrow('next', 'Next vehicle', 1)
    const view = document.createElement('div')
    view.className = 'garage-view'
    this.track = document.createElement('div')
    this.track.className = 'garage-track'
    host.roster.forEach((entry, i) => {
      const name = document.createElement('button')
      name.type = 'button'
      name.className = 'garage-name'
      name.textContent = entry.label
      name.tabIndex = -1
      name.addEventListener('click', () => { if (i !== this.index) this.swipe(i - this.index) })
      this.track.append(name)
      this.names.push(name)
    })
    view.append(this.track)
    this.status = document.createElement('p')
    this.status.className = 'garage-status'
    this.status.setAttribute('aria-live', 'polite')
    this.body.append(this.prev, view, this.next, this.status)
    this.body.inert = true
    this.panel.append(this.body, this.hint)
    this.cover = document.createElement('div')
    this.cover.className = 'garage-cover'
    this.cover.setAttribute('role', 'status')
    const loader = document.createElement('div')
    loader.className = 'garage-loader'
    loader.innerHTML = '<span class="garage-loader-rule" aria-hidden="true"><i></i></span>'
    const caption = document.createElement('p')
    caption.append('Loading ')
    this.coverName = document.createElement('b')
    caption.append(this.coverName)
    loader.append(caption)
    this.cover.append(loader)
    this.root.append(this.cover, this.panel)

    // a tap on the backdrop closes the menu; a horizontal drag on the panel swipes
    this.root.addEventListener('pointerdown', (event) => {
      if (!this.open) return
      if (event.target === this.root && !this.loading) this.close(true)
      else this.dragX = event.clientX
    })
    this.root.addEventListener('pointerup', (event) => {
      if (this.dragX === null) return
      const dx = event.clientX - this.dragX
      this.dragX = null
      if (Math.abs(dx) > SWIPE_PX) this.swipe(dx < 0 ? 1 : -1)
    })
    this.root.addEventListener('wheel', (event) => {
      if (!this.open) return
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY) && Math.abs(event.deltaX) > 24) {
        event.preventDefault()
        this.swipe(event.deltaX > 0 ? 1 : -1)
      }
    }, { passive: false })

    document.body.append(this.root)
    this.index = this.currentIndex()
    this.render(false)
    this.measureHint()
    window.addEventListener('keydown', this.onKey, true)
    window.addEventListener('resize', this.onResize)
    document.addEventListener('pointerlockchange', this.onLockChange)
    this.refreshHint()
  }

  show(): void {
    if (this.open) return
    this.open = true
    this.host.holdLook(true)
    this.index = this.currentIndex()
    this.status.textContent = ''
    this.render(false)
    this.root.classList.add('open')
    this.body.inert = false
    this.hint.inert = true
    this.host.openChanged?.(true)
  }

  close(resume: boolean): void {
    if (!this.open) return
    this.open = false
    this.root.classList.remove('open')
    this.body.inert = true
    this.hint.inert = false
    this.refreshHint()
    this.host.holdLook(false)
    this.host.openChanged?.(false)
    if (resume) this.host.resume()
  }

  /** Refresh the pill after the game starts or stops playing, or the robot comes to or leaves its stance. */
  refreshHint(): void {
    const mode: HintMode = this.host.touch ? 'touch' : !this.host.playing ? 'paused'
      : this.host.standing ? (this.host.specialReady ? 'special' : 'fight') : 'play'
    if (mode === this.hintMode) return
    this.hintMode = mode
    this.hintLabels.forEach((label, key) => { label.classList.toggle('shown', key === mode) })
    this.measureHint()
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey, true)
    window.removeEventListener('resize', this.onResize)
    document.removeEventListener('pointerlockchange', this.onLockChange)
    this.root.remove()
  }

  /** The pill's width follows its current label; the collapsed clip reads it from `--hint-w`. */
  private measureHint(): void {
    const label = this.hintMode && this.hintLabels.get(this.hintMode)
    if (!label) return
    this.panel.style.setProperty('--hint-w', `${Math.ceil(label.offsetWidth)}px`)
  }

  private arrow(side: 'prev' | 'next', label: string, dir: number): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `garage-arrow garage-${side}`
    button.setAttribute('aria-label', label)
    button.innerHTML = side === 'prev'
      ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg>'
      : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>'
    button.addEventListener('click', () => { this.swipe(dir) })
    return button
  }

  private currentIndex(): number {
    return Math.max(0, this.host.roster.findIndex((entry) => entry.id === this.host.current()))
  }

  /**
   * Move the carousel by `dir` cars and swap that car in. A swipe while a car
   * loads retargets: the running switch goes on to the car now in the centre.
   */
  private swipe(dir: number): void {
    if (!this.open) return
    const target = Math.min(this.host.roster.length - 1, Math.max(0, this.index + dir))
    if (target === this.index) {
      this.nudge(dir)
      return
    }
    this.index = target
    this.status.textContent = ''
    this.render(true)
    void this.settle()
  }

  /**
   * Switch until the game drives the car shown in the centre. Once it does, the
   * menu closes and play resumes with the new car, as the cover lifts; after a
   * failure the menu stays open with the reason.
   */
  private async settle(): Promise<void> {
    if (this.loading) return
    this.loading = true
    let arrived = false
    try {
      while (this.host.roster[this.index].id !== this.host.current()) {
        const entry = this.host.roster[this.index]
        this.render(true)
        let switched = false
        try {
          switched = await this.host.switchTo(entry)
        } catch (error) {
          this.status.textContent = `Couldn't load the ${entry.label}: ${error instanceof Error ? error.message : String(error)}`
        }
        if (!switched) {
          if (!this.status.textContent) this.status.textContent = 'Couldn\'t switch just now'
          this.index = this.currentIndex()
          break
        }
        arrived = true
      }
    } finally {
      this.loading = false
      this.render(true)
    }
    if (arrived) this.close(true)
  }

  private render(animate: boolean): void {
    const i = this.index
    const current = this.currentIndex()
    this.track.classList.toggle('still', !animate)
    this.track.style.setProperty('--i', String(i))
    this.panel.style.setProperty('--accent', this.host.roster[i].accent)
    const loading = this.loading && i !== current && !this.host.canSwitchInstantly(this.host.roster[i])
    this.panel.classList.toggle('loading', loading)
    this.root.classList.toggle('busy', loading)
    if (loading) this.coverName.textContent = this.host.roster[i].label
    this.names.forEach((name, k) => {
      name.classList.toggle('centre', k === i)
      name.setAttribute('aria-current', String(k === current))
    })
    this.prev.disabled = i === 0
    this.next.disabled = i === this.host.roster.length - 1
  }

  /** A swipe with nowhere to go: the track leans that way and springs back. */
  private nudge(dir: number): void {
    this.track.classList.remove('nudge-prev', 'nudge-next')
    void this.track.offsetWidth
    this.track.classList.add(dir < 0 ? 'nudge-prev' : 'nudge-next')
  }
}
