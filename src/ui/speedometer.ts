const SVG = 'http://www.w3.org/2000/svg'
/** Segments round the dial's 270° sweep; every fifth is a long one. */
const TICKS = 45
const SWEEP = 270
const KMH = 3.6
const MPH = 2.236936

/**
 * The car's speed in the bottom-left corner: a race dash's segmented dial in
 * the HUD's chamfered glass plate. The segments light round the sweep with
 * the speed in the special's colour, and the stretch past the car's normal
 * top speed (reached only with Shift's boost) burns ember. km/h is the large
 * readout in the dial; mph sits in the dial's open foot.
 *
 * Written once per whole km/h: the level is one custom property the segments
 * read, so a change is a single style write and two text writes.
 */
export class Speedometer {
  private readonly root: HTMLDivElement
  private readonly kmh: HTMLElement
  private readonly mph: HTMLElement
  private readonly ticks: SVGLineElement[] = []
  /** full scale and the car's normal top speed (m/s) */
  private scale = 1
  private top = 1
  private shownKmh = -1
  private shown = false
  private boosting = false

  constructor() {
    this.root = document.createElement('div')
    this.root.className = 'speedo'
    this.root.setAttribute('aria-hidden', 'true')
    this.root.style.setProperty('--n', String(TICKS))
    const svg = document.createElementNS(SVG, 'svg')
    svg.setAttribute('class', 'speedo-dial')
    svg.setAttribute('viewBox', '0 0 140 140')
    for (let i = 0; i < TICKS; i++) {
      // clockwise from the lower left, over the top, to the lower right
      const a = ((135 + (SWEEP * (i + 0.5)) / TICKS) * Math.PI) / 180
      const major = i % 5 === 4
      const inner = major ? 49 : 53, outer = 62
      const line = document.createElementNS(SVG, 'line')
      line.setAttribute('x1', (70 + Math.cos(a) * inner).toFixed(2))
      line.setAttribute('y1', (70 + Math.sin(a) * inner).toFixed(2))
      line.setAttribute('x2', (70 + Math.cos(a) * outer).toFixed(2))
      line.setAttribute('y2', (70 + Math.sin(a) * outer).toFixed(2))
      line.style.setProperty('--i', String(i))
      if (major) line.classList.add('major')
      svg.append(line)
      this.ticks.push(line)
    }
    const track = document.createElementNS(SVG, 'circle')
    track.setAttribute('class', 'speedo-track')
    track.setAttribute('cx', '70')
    track.setAttribute('cy', '70')
    track.setAttribute('r', '44')
    track.setAttribute('pathLength', '360')
    svg.append(track)
    const read = document.createElement('div')
    read.className = 'speedo-read'
    this.kmh = document.createElement('b')
    this.kmh.textContent = '0'
    const unit = document.createElement('span')
    unit.textContent = 'km/h'
    read.append(this.kmh, unit)
    const foot = document.createElement('div')
    foot.className = 'speedo-mph'
    this.mph = document.createElement('b')
    this.mph.textContent = '0'
    const mphUnit = document.createElement('span')
    mphUnit.textContent = 'mph'
    foot.append(this.mph, mphUnit)
    this.root.append(svg, read, foot)
    document.body.append(this.root)
  }

  /** The playing car's normal and boosted top speeds (m/s): the dial's full scale and its ember stretch. */
  range(top: number, boost: number): void {
    // full scale on a round 20 km/h
    this.scale = Math.ceil((boost * KMH) / 20) * 20 / KMH
    this.top = top
    const red = (top / this.scale) * TICKS
    for (let i = 0; i < TICKS; i++) this.ticks[i].classList.toggle('red', i + 0.5 >= red)
    this.shownKmh = -1
  }

  /** The car's speed over the ground (m/s), or null in robot form. */
  update(speed: number | null): void {
    const shown = speed !== null
    if (shown !== this.shown) {
      this.shown = shown
      this.root.classList.toggle('shown', shown)
    }
    if (speed === null) return
    const kmh = Math.round(speed * KMH)
    if (kmh === this.shownKmh) return
    this.shownKmh = kmh
    this.kmh.textContent = String(kmh)
    this.mph.textContent = String(Math.round(speed * MPH))
    this.root.style.setProperty('--v', Math.min(1, speed / this.scale).toFixed(4))
    const boosting = speed > this.top + 0.5
    if (boosting !== this.boosting) {
      this.boosting = boosting
      this.root.classList.toggle('boost', boosting)
    }
  }

  /** The special's colour (CSS), from the character playing. */
  tint(color: string): void {
    this.root.style.setProperty('--charge', color)
  }

  dispose(): void {
    this.root.remove()
  }
}
