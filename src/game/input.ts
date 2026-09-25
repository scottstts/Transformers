import { PerspectiveCamera, Vector3 } from 'three/webgpu'

/** Stick deflection (0..1) past which the throttle engages; the car throttle is on/off, as on a keyboard. */
const STICK_THROTTLE = 0.35
/** Stick deflection below which the stick is at rest. */
const STICK_DEAD = 0.15

/**
 * Keyboard and mouse input, plus an analog stick from the touch controls. The
 * stick maps onto the same controls as the keys: forward/back is the throttle,
 * sideways steers (proportionally), and a stick pushed to the rim runs only in
 * robot form. Car drift is a separate held Shift state. A left click under
 * pointer lock is an attack (the click that
 * takes the lock is not); holding the right button holds the guard; F is the
 * special.
 */
export class GameInput {
  /** touch stick: x right, y forward, each -1..1 */
  private stickX = 0
  private stickY = 0
  private stickRun = false
  /** mobile drift button: held state, equivalent to either Shift key */
  private touchShift = false
  private readonly onTransform: () => void
  private readonly onInteraction: () => void
  private readonly keys = new Set<string>()
  private jumpPressed = false
  private attackPressed = false
  private specialPressed = false
  /** right mouse button held (under pointer lock), and the touch guard button */
  private guardMouse = false
  private guardTouch = false
  private readonly forward = new Vector3()
  private readonly right = new Vector3()
  private readonly direction = new Vector3()
  private readonly canvas: HTMLCanvasElement
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'KeyR' || event.code === 'Space') event.preventDefault()
    if (document.pointerLockElement !== this.canvas) return
    this.onInteraction()
    if (event.repeat) return
    this.keys.add(event.code)
    if (event.code === 'KeyR') this.onTransform()
    if (event.code === 'Space') this.jumpPressed = true
    if (event.code === 'KeyF') this.specialPressed = true
  }
  private readonly onKeyUp = (event: KeyboardEvent): void => { this.keys.delete(event.code) }
  private readonly onBlur = (): void => {
    this.keys.clear()
    this.guardMouse = false
    this.guardTouch = false
    this.setStick(0, 0, false)
    this.setShift(false)
  }
  private readonly onPointerLockChange = (): void => {
    if (document.pointerLockElement !== this.canvas) {
      this.keys.clear()
      this.guardMouse = false
    }
  }
  private readonly onPointerDown = (event: PointerEvent): void => {
    this.onInteraction()
    if (document.pointerLockElement !== this.canvas) return
    if (event.button === 0) this.attackPressed = true
    if (event.button === 2) this.guardMouse = true
  }
  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.button === 2) this.guardMouse = false
  }
  private readonly onContextMenu = (event: Event): void => {
    // the right button is the guard, not a menu
    if (document.pointerLockElement === this.canvas || event.target === this.canvas) event.preventDefault()
  }

  constructor(canvas: HTMLCanvasElement, onTransform: () => void, onInteraction: () => void) {
    this.canvas = canvas
    this.onTransform = onTransform
    this.onInteraction = onInteraction
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    window.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('contextmenu', this.onContextMenu)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
  }

  /** The guard is held (right mouse button, or the touch guard button). */
  get guarding(): boolean {
    return this.guardMouse || this.guardTouch
  }

  /** Hold or release the guard from the touch controls. */
  setGuard(held: boolean): void { this.guardTouch = held }

  /** Space was pressed since the last call. */
  consumeJump(): boolean {
    const pressed = this.jumpPressed
    this.jumpPressed = false
    return pressed
  }

  /** A click (or the touch attack button) since the last call. */
  consumeAttack(): boolean {
    const pressed = this.attackPressed
    this.attackPressed = false
    return pressed
  }

  /** An attack from the touch controls (same as a click). */
  pressAttack(): void { this.attackPressed = true }

  /** F (or the touch special button) since the last call. */
  consumeSpecial(): boolean {
    const pressed = this.specialPressed
    this.specialPressed = false
    return pressed
  }

  /** The special from the touch controls (same as F). */
  pressSpecial(): void { this.specialPressed = true }

  /** Touch stick deflection (clamped to the unit disc by the caller); `run` when pushed to the rim. */
  setStick(x: number, y: number, run: boolean): void {
    this.stickX = x
    this.stickY = y
    this.stickRun = run
  }

  /** A jump from the touch controls (same as Space). */
  pressJump(): void { this.jumpPressed = true }

  /** Hold/release Shift from the touch drift button. */
  setShift(held: boolean): void { this.touchShift = held }

  pressed(...codes: string[]): boolean { return codes.some((code) => this.keys.has(code)) }
  /** Robot run: stick at the rim or either Shift source. */
  get running(): boolean { return this.stickRun || this.driftHeld }
  /** Car drift/boost: only an explicit held Shift key or the mobile Drift button. */
  get driftHeld(): boolean { return this.touchShift || this.pressed('ShiftLeft', 'ShiftRight') }
  get driveThrottle(): number {
    const keys = Number(this.pressed('KeyW', 'ArrowUp')) - Number(this.pressed('KeyS', 'ArrowDown'))
    return keys || (this.stickY > STICK_THROTTLE ? 1 : this.stickY < -STICK_THROTTLE ? -1 : 0)
  }
  get driveSteering(): number {
    const keys = Number(this.pressed('KeyD', 'ArrowRight')) - Number(this.pressed('KeyA', 'ArrowLeft'))
    return keys || (Math.abs(this.stickX) > STICK_DEAD ? this.stickX : 0)
  }
  get driving(): boolean {
    return Math.hypot(this.stickX, this.stickY) > STICK_DEAD ||
      this.pressed('KeyW', 'ArrowUp', 'KeyS', 'ArrowDown', 'KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight')
  }

  movementDirection(camera: PerspectiveCamera): Vector3 | null {
    let f = Number(this.pressed('KeyW', 'ArrowUp')) - Number(this.pressed('KeyS', 'ArrowDown'))
    let r = Number(this.pressed('KeyD', 'ArrowRight')) - Number(this.pressed('KeyA', 'ArrowLeft'))
    if (!f && !r && Math.hypot(this.stickX, this.stickY) > STICK_DEAD) {
      f = this.stickY
      r = this.stickX
    }
    if (!f && !r) return null
    camera.getWorldDirection(this.forward)
    this.forward.y = 0
    this.forward.normalize()
    this.right.set(-this.forward.z, 0, this.forward.x)
    return this.direction.copy(this.forward).multiplyScalar(f).addScaledVector(this.right, r).normalize()
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    window.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('contextmenu', this.onContextMenu)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
  }
}
