import type { RosterEntry } from '../content/roster'

/** What the menu needs from the running game. */
export interface VehicleHost {
  readonly roster: readonly RosterEntry[]
  current(): string
  readonly canSwitch: boolean
  switchTo(entry: RosterEntry): Promise<boolean>
  /** return to play (pointer lock), from a user gesture */
  resume(): void
  /** pause / restore mouse look while the menu sits over the locked pointer */
  holdLook(held: boolean): void
  readonly playing: boolean
}

/** Horizontal drag (px) that counts as a swipe. */
const SWIPE_PX = 40

/**
 * The vehicle menu: a carousel of car names. Tab opens it over the locked
 * pointer (mouse look and game keys pause; Escape still releases the pointer,
 * as browsers require, leaving the menu open for the mouse); the arrow keys, the arrow buttons, a horizontal swipe or a click
 * on a neighbouring name swipe to the next car, which is swapped in live
 * behind the panel. Tab, Escape, Enter or the backdrop closes it and returns
 * to play. While the game is paused (pointer released) a small chip says how
 * to resume and open it; normal play shows nothing.
 */
export class VehicleMenu {
  private readonly host: VehicleHost
  private readonly root: HTMLDivElement
  private readonly panel: HTMLDivElement
  private readonly track: HTMLDivElement
  private readonly names: HTMLButtonElement[] = []
  private readonly prev: HTMLButtonElement
  private readonly next: HTMLButtonElement
  private readonly status: HTMLParagraphElement
  private readonly chip: HTMLDivElement
  private open = false
  /** the car shown in the centre (the one being switched to while loading) */
  private index = 0
  private loading = false
  private dragX: number | null = null

  private readonly onKey = (event: KeyboardEvent): void => {
    if (!document.body.classList.contains('ready')) return
    if (event.code === 'Tab') {
      event.preventDefault()
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
      this.close(true)
    }
  }

  private readonly onLockChange = (): void => { this.refreshChip() }

  constructor(host: VehicleHost) {
    this.host = host
    this.root = document.createElement('div')
    this.root.className = 'garage'
    this.root.hidden = true
    this.root.setAttribute('role', 'dialog')
    this.root.setAttribute('aria-modal', 'true')
    this.root.setAttribute('aria-label', 'Vehicle')

    this.panel = document.createElement('div')
    this.panel.className = 'garage-panel'
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
    this.panel.append(this.prev, view, this.next, this.status)
    this.root.append(this.panel)

    // a click on the backdrop closes the menu; a horizontal drag on the panel swipes
    this.root.addEventListener('pointerdown', (event) => {
      if (event.target === this.root) this.close(true)
      else this.dragX = event.clientX
    })
    this.root.addEventListener('pointerup', (event) => {
      if (this.dragX === null) return
      const dx = event.clientX - this.dragX
      this.dragX = null
      if (Math.abs(dx) > SWIPE_PX) this.swipe(dx < 0 ? 1 : -1)
    })
    this.root.addEventListener('wheel', (event) => {
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY) && Math.abs(event.deltaX) > 24) {
        event.preventDefault()
        this.swipe(event.deltaX > 0 ? 1 : -1)
      }
    }, { passive: false })

    this.chip = document.createElement('div')
    this.chip.className = 'resume-chip'
    this.chip.innerHTML = 'Click to play <span aria-hidden="true">·</span> <kbd>Tab</kbd> vehicles'
    document.body.append(this.root, this.chip)
    window.addEventListener('keydown', this.onKey, true)
    document.addEventListener('pointerlockchange', this.onLockChange)
    this.refreshChip()
  }

  show(): void {
    if (this.open) return
    this.open = true
    this.host.holdLook(true)
    this.index = this.currentIndex()
    this.status.textContent = ''
    this.render(false)
    this.root.hidden = false
    this.refreshChip()
  }

  close(resume: boolean): void {
    if (!this.open) return
    this.open = false
    this.root.hidden = true
    this.refreshChip()
    this.host.holdLook(false)
    if (resume) this.host.resume()
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey, true)
    document.removeEventListener('pointerlockchange', this.onLockChange)
    this.root.remove()
    this.chip.remove()
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

  /** Move the carousel by `dir` cars and swap that car in (the latest swipe wins while one loads). */
  private swipe(dir: number): void {
    if (!this.open) return
    const target = Math.min(this.host.roster.length - 1, Math.max(0, this.index + dir))
    if (target === this.index) {
      this.nudge(dir)
      return
    }
    if (!this.host.canSwitch) {
      this.status.textContent = 'Finish the transformation first'
      this.nudge(dir)
      return
    }
    this.index = target
    this.status.textContent = ''
    this.render(true)
    void this.settle()
  }

  /** Switch until the game drives the car shown in the centre. */
  private async settle(): Promise<void> {
    if (this.loading) return
    this.loading = true
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
          if (!this.status.textContent) this.status.textContent = 'Finish the transformation first'
          this.index = this.currentIndex()
          break
        }
      }
    } finally {
      this.loading = false
      this.render(true)
    }
  }

  private render(animate: boolean): void {
    const i = this.index
    const current = this.currentIndex()
    this.track.classList.toggle('still', !animate)
    this.track.style.setProperty('--i', String(i))
    this.panel.style.setProperty('--accent', this.host.roster[i].accent)
    this.panel.classList.toggle('loading', this.loading && i !== current)
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

  private refreshChip(): void {
    const paused = document.body.classList.contains('ready') && !this.open && !this.host.playing
    this.chip.classList.toggle('shown', paused)
  }
}
