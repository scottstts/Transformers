/** Cells in the strip: a full combo lights about four of them. */
const CELLS = 12
/** How long a gain's flash and the spend's discharge play (ms); must match the CSS animations. */
const GAIN_MS = 460
const SPEND_MS = 700

/**
 * The special's energy in the top-left corner: a strip of skewed cells in a
 * small glass plate, lit from the left like a racing car's shift lights, with
 * a diamond core at its head. A landed blow lights the next stretch with a
 * brief flash; a full meter ignites the core, glows and sends a shine along
 * the strip until it is spent, when it discharges and drains. No text: level,
 * charge and readiness are all in the light.
 *
 * Everything is CSS on a handful of elements: the level is one registered
 * custom property that the cells read, so a change is a single style write.
 */
export class EnergyMeter {
  private readonly root: HTMLDivElement
  private flashTimer = 0

  constructor() {
    this.root = document.createElement('div')
    this.root.className = 'energy'
    this.root.setAttribute('role', 'meter')
    this.root.setAttribute('aria-label', 'Special energy')
    this.root.setAttribute('aria-valuemin', '0')
    this.root.setAttribute('aria-valuemax', '100')
    const core = document.createElement('span')
    core.className = 'energy-core'
    const cells = document.createElement('span')
    cells.className = 'energy-cells'
    for (let i = 0; i < CELLS; i++) {
      const cell = document.createElement('i')
      cell.style.setProperty('--i', String(i))
      cells.append(cell)
    }
    this.root.style.setProperty('--cells', String(CELLS))
    this.root.append(core, cells)
    document.body.append(this.root)
    this.set(0, false)
  }

  /** The level (0..1); `gained` for a landed blow, false when the special spends it. */
  set(level: number, gained: boolean): void {
    const full = level >= 1
    const wasFull = this.root.classList.contains('full')
    this.root.style.setProperty('--level', level.toFixed(4))
    this.root.setAttribute('aria-valuenow', String(Math.round(level * 100)))
    this.root.classList.toggle('full', full)
    if (gained && level > 0) this.pulse(full ? 'charged' : 'gain', GAIN_MS)
    else if (!gained && wasFull && !full) this.pulse('spent', SPEND_MS)
  }

  /** The special's colour (CSS), from the character playing. */
  tint(color: string): void {
    this.root.style.setProperty('--charge', color)
  }

  /** Dimmed while the robot is not standing to fight (car form, transforming). */
  setActive(active: boolean): void {
    this.root.classList.toggle('idle', !active)
  }

  dispose(): void {
    window.clearTimeout(this.flashTimer)
    this.root.remove()
  }

  /** Restart a one-shot animation class (a reflow between, so the same class can play again). */
  private pulse(kind: 'gain' | 'charged' | 'spent', ms: number): void {
    this.root.classList.remove('gain', 'charged', 'spent')
    void this.root.offsetWidth
    this.root.classList.add(kind)
    window.clearTimeout(this.flashTimer)
    this.flashTimer = window.setTimeout(() => this.root.classList.remove(kind), ms)
  }
}

/**
 * Letterbox bars for a cutscene: they slide in from the screen edges when a
 * special starts and back out as it hands control back.
 */
export class CinemaBars {
  private readonly root: HTMLDivElement

  constructor() {
    this.root = document.createElement('div')
    this.root.className = 'cinema'
    this.root.setAttribute('aria-hidden', 'true')
    this.root.append(document.createElement('i'), document.createElement('i'))
    document.body.append(this.root)
  }

  dispose(): void {
    this.root.remove()
  }
}
