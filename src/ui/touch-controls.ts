/** What the on-screen controls drive. */
export interface TouchHost {
  /** stick deflection on the unit disc (x right, y forward); `run` at the rim */
  stick(x: number, y: number, run: boolean): void
  /** orbit the camera by a drag, in CSS pixels */
  look(dx: number, dy: number): void
  transform(): void
  jump(): void
}

/** Stick travel (px) from the centre to the rim. */
const STICK_RADIUS = 52
/** Deflection past which the stick runs (robot) or boosts (car), as Shift does. */
const RUN_DEFLECTION = 0.92
/** Touch drag is a little quicker than a mouse: a thumb covers fewer pixels. */
const LOOK_GAIN = 1.35
/** Share of the screen width, from the left, where a touch grabs the stick. */
const STICK_ZONE = 0.45

const TRANSFORM_ICON = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 14.5a9.2 9.2 0 0 1 16-5.3"/><path d="M23.6 4.6v5h-5"/><path d="M25 17.5a9.2 9.2 0 0 1-16 5.3"/><path d="M8.4 27.4v-5h5"/><path d="m13 16 3-3 3 3-3 3z"/></svg>'
const JUMP_ICON = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="m9 15 7-7 7 7"/><path d="m9 23 7-7 7 7"/></svg>'

/**
 * Touch controls: a floating stick on the left (it jumps to where the thumb
 * lands and rests, faint, in the corner), a drag anywhere else to look, and
 * transform and jump buttons on the right. Each finger is tracked by its own
 * pointer id, so steering, looking and a button can be held together. All
 * feedback is a CSS transform on a small element; nothing runs per frame.
 */
export class TouchControls {
  private readonly host: TouchHost
  private readonly root: HTMLDivElement
  private readonly base: HTMLDivElement
  private readonly knob: HTMLDivElement
  private readonly jumpButton: HTMLButtonElement
  private stickPointer: number | null = null
  private readonly stickOrigin = { x: 0, y: 0 }
  private lookPointer: number | null = null
  private readonly lookLast = { x: 0, y: 0 }

  private readonly onDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse') return
    event.preventDefault()
    if (event.clientX < window.innerWidth * STICK_ZONE && this.stickPointer === null) {
      this.stickPointer = event.pointerId
      // the stick centres under the thumb, kept clear of the screen edges
      const margin = STICK_RADIUS + 12
      this.stickOrigin.x = Math.max(margin, event.clientX)
      this.stickOrigin.y = Math.min(window.innerHeight - margin, Math.max(margin, event.clientY))
      this.base.style.transform = `translate(${this.stickOrigin.x}px, ${this.stickOrigin.y}px)`
      this.base.classList.add('held')
      this.moveStick(event.clientX, event.clientY)
    } else if (this.lookPointer === null) {
      this.lookPointer = event.pointerId
      this.lookLast.x = event.clientX
      this.lookLast.y = event.clientY
    } else {
      return
    }
    this.root.setPointerCapture(event.pointerId)
  }

  private readonly onMove = (event: PointerEvent): void => {
    if (event.pointerId === this.stickPointer) {
      this.moveStick(event.clientX, event.clientY)
    } else if (event.pointerId === this.lookPointer) {
      this.host.look((event.clientX - this.lookLast.x) * LOOK_GAIN, (event.clientY - this.lookLast.y) * LOOK_GAIN)
      this.lookLast.x = event.clientX
      this.lookLast.y = event.clientY
    }
  }

  private readonly onUp = (event: PointerEvent): void => {
    if (event.pointerId === this.stickPointer) this.releaseStick()
    else if (event.pointerId === this.lookPointer) this.lookPointer = null
  }

  constructor(host: TouchHost) {
    this.host = host
    this.root = document.createElement('div')
    this.root.className = 'touch-controls'
    this.base = document.createElement('div')
    this.base.className = 'touch-stick'
    this.base.setAttribute('aria-hidden', 'true')
    this.knob = document.createElement('div')
    this.knob.className = 'touch-knob'
    this.base.append(this.knob)
    this.jumpButton = this.button('touch-jump', 'Jump', JUMP_ICON, () => host.jump())
    this.setJumpAvailable(false)
    this.root.append(
      this.base,
      this.button('touch-transform', 'Transform', TRANSFORM_ICON, () => host.transform()),
      this.jumpButton,
    )
    this.root.addEventListener('pointerdown', this.onDown)
    this.root.addEventListener('pointermove', this.onMove)
    this.root.addEventListener('pointerup', this.onUp)
    this.root.addEventListener('pointercancel', this.onUp)
    this.root.addEventListener('lostpointercapture', this.onUp)
    this.root.addEventListener('contextmenu', (event) => event.preventDefault())
    document.body.append(this.root)
  }

  /** Show the jump button only while the robot stands: a car cannot jump. */
  setJumpAvailable(available: boolean): void {
    this.jumpButton.classList.toggle('away', !available)
    this.jumpButton.inert = !available
  }

  /** Let go of everything (an overlay opened, or the page lost focus). */
  release(): void {
    this.releaseStick()
    this.lookPointer = null
  }

  dispose(): void {
    this.release()
    this.root.remove()
  }

  private button(kind: string, label: string, icon: string, action: () => void): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `touch-button ${kind}`
    button.setAttribute('aria-label', label)
    button.innerHTML = icon
    button.addEventListener('pointerdown', (event) => {
      // fire on touch-down (no click delay) and keep the press from starting a look drag
      event.stopPropagation()
      event.preventDefault()
      button.classList.add('pressed')
      action()
    })
    const lift = (): void => { button.classList.remove('pressed') }
    button.addEventListener('pointerup', lift)
    button.addEventListener('pointercancel', lift)
    button.addEventListener('pointerleave', lift)
    return button
  }

  private moveStick(x: number, y: number): void {
    let dx = (x - this.stickOrigin.x) / STICK_RADIUS
    let dy = (y - this.stickOrigin.y) / STICK_RADIUS
    const length = Math.hypot(dx, dy)
    if (length > 1) {
      dx /= length
      dy /= length
    }
    const run = length >= RUN_DEFLECTION
    this.knob.style.transform = `translate(${dx * STICK_RADIUS}px, ${dy * STICK_RADIUS}px)`
    this.base.classList.toggle('run', run)
    this.host.stick(dx, -dy, run)
  }

  private releaseStick(): void {
    if (this.stickPointer === null) return
    this.stickPointer = null
    this.base.classList.remove('held', 'run')
    this.base.style.transform = ''
    this.knob.style.transform = ''
    this.host.stick(0, 0, false)
  }
}
