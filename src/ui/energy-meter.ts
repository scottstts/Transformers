/** Cells in the strip: a full combo lights about four of them. */
const CELLS = 12
/** How long a gain's flash and the spend's discharge play (ms); must match the CSS animations. */
const GAIN_MS = 460
const SPEND_MS = 700
/** Arcs crackling off the full plate; each flashes on its own cycle (CSS) and is redrawn every cycle. */
const ARCS = 5
/** How far past the plate the arcs may reach (px); must match `.energy-arcs`' inset. */
const ARC_MARGIN = 9
const SVG = 'http://www.w3.org/2000/svg'

/**
 * The special's energy in the top-left corner: a strip of skewed cells in a
 * small glass plate, lit from the left like a racing car's shift lights, with
 * a diamond core at its head. A landed blow lights the next stretch with a
 * brief flash; a full meter ignites the core, glows and sends a shine along
 * the strip until it is spent, when it discharges and drains. No text: level,
 * charge and readiness are all in the light.
 *
 * Full, it strains like a charge about to burst, on one heartbeat: the plate
 * buzzes, shudders harder and compresses, then thumps out as the core flares,
 * a ring bursts off it and the cells and the light behind the glass surge.
 * Small arcs crackle off the plate's edges, each redrawn every time it flashes.
 *
 * Everything is CSS on a handful of elements: the level is one registered
 * custom property that the cells read, so a change is a single style write.
 */
export class EnergyMeter {
  private readonly root: HTMLDivElement
  private readonly plate: HTMLDivElement
  private readonly arcs: SVGPolylineElement[] = []
  private flashTimer = 0

  constructor() {
    this.root = document.createElement('div')
    this.root.className = 'energy'
    this.root.setAttribute('role', 'meter')
    this.root.setAttribute('aria-label', 'Special energy')
    this.root.setAttribute('aria-valuemin', '0')
    this.root.setAttribute('aria-valuemax', '100')
    // the light behind the glass, the plate (clipped to its chamfer) and what bursts out past it
    const glow = document.createElement('span')
    glow.className = 'energy-glow'
    const body = document.createElement('div')
    body.className = 'energy-body'
    this.plate = document.createElement('div')
    this.plate.className = 'energy-plate'
    const ring = document.createElement('span')
    ring.className = 'energy-ring'
    const svg = document.createElementNS(SVG, 'svg')
    svg.classList.add('energy-arcs')
    svg.setAttribute('aria-hidden', 'true')
    for (let i = 0; i < ARCS; i++) {
      const arc = document.createElementNS(SVG, 'polyline')
      arc.style.setProperty('--a', String(i))
      arc.addEventListener('animationiteration', () => this.drawArc(arc))
      svg.append(arc)
      this.arcs.push(arc)
    }
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
    this.plate.append(core, cells)
    body.append(this.plate, ring, svg)
    this.root.append(glow, body)
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
    if (full && !wasFull) for (const arc of this.arcs) this.drawArc(arc)
    if (gained && level > 0) this.pulse(full ? 'charged' : 'gain', GAIN_MS)
    else if (!gained && wasFull && !full) this.pulse('spent', SPEND_MS)
  }

  /** The special's colour (CSS), from the character playing. */
  tint(color: string): void {
    this.root.style.setProperty('--charge', color)
  }

  /** Hidden while the robot is not standing to fight (car form, transforming), as the hint pill changes. */
  setActive(active: boolean): void {
    this.root.classList.toggle('idle', !active)
  }

  dispose(): void {
    window.clearTimeout(this.flashTimer)
    this.root.remove()
  }

  /**
   * A jagged arc leaping off one of the plate's edges (top, bottom or the
   * right end), in the arcs' own box: the plate plus ARC_MARGIN all round.
   */
  private drawArc(arc: SVGPolylineElement): void {
    const w = this.plate.offsetWidth, h = this.plate.offsetHeight
    if (w === 0) return
    const m = ARC_MARGIN
    const edge = Math.random()
    // start on the edge, heading out of it (ox, oy) and running along it (ax, ay)
    let x: number, y: number, ox: number, oy: number, ax: number, ay: number
    if (edge < 0.45) { x = m + h * 0.3 + Math.random() * (w - h * 0.3); y = m; ox = 0; oy = -1; ax = 1; ay = 0 }
    else if (edge < 0.8) { x = m + Math.random() * (w - h * 0.3); y = m + h; ox = 0; oy = 1; ax = 1; ay = 0 }
    else { x = m + w; y = m + Math.random() * h; ox = 1; oy = 0; ax = 0; ay = 1 }
    const reach = 5 + Math.random() * 4
    const run = (Math.random() - 0.5) * 12
    const steps = 4 + ((Math.random() * 2) | 0)
    let points = `${x.toFixed(1)},${y.toFixed(1)}`
    for (let k = 1; k <= steps; k++) {
      const f = k / steps
      const kink = (Math.random() - 0.5) * 4 * (1 - f * 0.5)
      const px = x + ox * reach * Math.sqrt(f) + ax * (run * f + kink)
      const py = y + oy * reach * Math.sqrt(f) + ay * (run * f + kink)
      points += ` ${px.toFixed(1)},${py.toFixed(1)}`
    }
    arc.setAttribute('points', points)
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
