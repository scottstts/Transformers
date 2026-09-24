import type { RosterEntry } from '../content/roster'

/** What the menu needs from the running game. */
export interface VehicleHost {
  readonly roster: readonly RosterEntry[]
  current(): string
  readonly canSwitch: boolean
  switchTo(entry: RosterEntry): Promise<boolean>
  /** return to play (pointer lock), from a user gesture */
  resume(): void
  /** the menu is about to release the pointer: stop mouse look */
  suspend(): void
  readonly playing: boolean
}

/**
 * The vehicle menu: Tab opens it (releasing the pointer), 1-9 or a click
 * picks a car, Tab or Escape closes it and returns to play. While the game is
 * paused (pointer released) a small chip says how to resume and switch; normal
 * play shows nothing.
 */
export class VehicleMenu {
  private readonly host: VehicleHost
  private readonly root: HTMLDivElement
  private readonly chip: HTMLDivElement
  private readonly note: HTMLParagraphElement
  private readonly cards = new Map<string, HTMLButtonElement>()
  private open = false
  private loading: string | null = null

  private readonly onKey = (event: KeyboardEvent): void => {
    if (!document.body.classList.contains('ready')) return
    if (event.code === 'Tab') {
      event.preventDefault()
      if (this.open) this.close(true)
      else this.show()
      return
    }
    if (!this.open) return
    if (event.code === 'Escape') {
      event.preventDefault()
      this.close(true)
      return
    }
    const digit = /^Digit([1-9])$/.exec(event.code)
    if (digit) {
      const entry = this.host.roster[Number(digit[1]) - 1]
      if (entry) void this.choose(entry)
      return
    }
    if (event.code === 'ArrowRight' || event.code === 'ArrowDown' || event.code === 'ArrowLeft' || event.code === 'ArrowUp') {
      event.preventDefault()
      const buttons = [...this.cards.values()]
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
      const step = event.code === 'ArrowRight' || event.code === 'ArrowDown' ? 1 : -1
      buttons[(Math.max(0, at) + step + buttons.length) % buttons.length].focus()
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
    this.root.setAttribute('aria-labelledby', 'garage-title')
    const panel = document.createElement('div')
    panel.className = 'garage-panel'
    const header = document.createElement('header')
    const title = document.createElement('span')
    title.id = 'garage-title'
    title.className = 'garage-kicker'
    title.textContent = 'Vehicle'
    const hint = document.createElement('span')
    hint.className = 'garage-hint'
    hint.innerHTML = '<kbd>Tab</kbd> close'
    header.append(title, hint)
    const list = document.createElement('div')
    list.className = 'garage-list'
    host.roster.forEach((entry, i) => {
      const card = document.createElement('button')
      card.type = 'button'
      card.className = 'garage-card'
      card.style.setProperty('--accent', entry.accent)
      const key = document.createElement('kbd')
      key.className = 'garage-key'
      key.textContent = String(i + 1)
      const name = document.createElement('span')
      name.className = 'garage-name'
      name.textContent = entry.label
      const line = document.createElement('span')
      line.className = 'garage-line'
      line.textContent = entry.tagline
      const state = document.createElement('span')
      state.className = 'garage-state'
      card.append(key, name, line, state)
      card.addEventListener('click', () => { void this.choose(entry) })
      list.append(card)
      this.cards.set(entry.id, card)
    })
    this.note = document.createElement('p')
    this.note.className = 'garage-note'
    this.note.setAttribute('aria-live', 'polite')
    panel.append(header, list, this.note)
    this.root.append(panel)
    // a click on the backdrop closes the menu
    this.root.addEventListener('pointerdown', (event) => { if (event.target === this.root) this.close(true) })

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
    this.host.suspend()
    if (document.pointerLockElement) document.exitPointerLock()
    this.note.textContent = ''
    this.render()
    this.root.hidden = false
    this.refreshChip()
    this.cards.get(this.host.current())?.focus()
  }

  close(resume: boolean): void {
    if (!this.open) return
    this.open = false
    this.root.hidden = true
    this.refreshChip()
    if (resume) this.host.resume()
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey, true)
    document.removeEventListener('pointerlockchange', this.onLockChange)
    this.root.remove()
    this.chip.remove()
  }

  private async choose(entry: RosterEntry): Promise<void> {
    if (this.loading) return
    if (entry.id === this.host.current()) {
      this.close(true)
      return
    }
    if (!this.host.canSwitch) {
      this.note.textContent = 'Finish the transformation first.'
      return
    }
    this.loading = entry.id
    this.note.textContent = ''
    this.render()
    try {
      const switched = await this.host.switchTo(entry)
      this.loading = null
      if (switched) this.close(true)
      else {
        this.note.textContent = 'Finish the transformation first.'
        this.render()
      }
    } catch (error) {
      this.loading = null
      this.note.textContent = `Couldn't load the ${entry.label}: ${error instanceof Error ? error.message : String(error)}`
      this.render()
    }
  }

  private render(): void {
    const current = this.host.current()
    for (const [id, card] of this.cards) {
      const selected = id === current
      card.setAttribute('aria-pressed', String(selected))
      card.classList.toggle('loading', id === this.loading)
      card.disabled = this.loading !== null && id !== this.loading
      const state = card.querySelector('.garage-state') as HTMLElement
      state.textContent = id === this.loading ? 'Loading' : selected ? 'Driving' : ''
    }
  }

  private refreshChip(): void {
    const paused = document.body.classList.contains('ready') && !this.open && !this.host.playing
    this.chip.classList.toggle('shown', paused)
  }
}
