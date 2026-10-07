import { PerspectiveCamera, Vector3 } from 'three/webgpu'

/**
 * Keyboard and mouse input. A left click under pointer lock is an attack
 * (the click that takes the lock is not); holding the right button guards.
 */
export class GameInput {
  private readonly onTransform: () => void
  private readonly onInteraction: () => void
  private readonly onAttack: () => boolean
  private readonly onFlash: () => void
  private readonly keys = new Set<string>()
  private jumpPressed = false
  private attackPressed = false
  private specialPressed = false
  /** right mouse button held under pointer lock */
  private guardMouse = false
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
    if (event.code === 'KeyE') this.onFlash()
  }
  private readonly onKeyUp = (event: KeyboardEvent): void => { this.keys.delete(event.code) }
  private readonly onBlur = (): void => {
    this.keys.clear()
    this.guardMouse = false
    this.jumpPressed = this.attackPressed = this.specialPressed = false
  }
  private readonly onPointerLockChange = (): void => {
    if (document.pointerLockElement !== this.canvas) {
      this.keys.clear()
      this.guardMouse = false
      this.jumpPressed = this.attackPressed = this.specialPressed = false
    }
  }
  private readonly onPointerDown = (event: PointerEvent): void => {
    this.onInteraction()
    if (document.pointerLockElement !== this.canvas) return
    // Eligibility belongs to the event, never a later frame/window.
    if (event.button === 0 && this.onAttack()) this.attackPressed = true
    if (event.button === 2) this.guardMouse = true
  }
  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.button === 2) this.guardMouse = false
  }
  private readonly onContextMenu = (event: Event): void => {
    // the right button is the guard, not a menu
    if (document.pointerLockElement === this.canvas || event.target === this.canvas) event.preventDefault()
  }

  constructor(canvas: HTMLCanvasElement, onTransform: () => void, onInteraction: () => void, onAttack: () => boolean, onFlash: () => void) {
    this.canvas = canvas
    this.onTransform = onTransform
    this.onInteraction = onInteraction
    this.onAttack = onAttack
    this.onFlash = onFlash
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    window.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('contextmenu', this.onContextMenu)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
  }

  /** The right mouse button is held. */
  get guarding(): boolean {
    return this.guardMouse
  }

  /** Space was pressed since the last call. */
  consumeJump(): boolean {
    const pressed = this.jumpPressed
    this.jumpPressed = false
    return pressed
  }

  /** A click since the last call. */
  consumeAttack(): boolean {
    const pressed = this.attackPressed
    this.attackPressed = false
    return pressed
  }

  /** F since the last call. */
  consumeSpecial(): boolean {
    const pressed = this.specialPressed
    this.specialPressed = false
    return pressed
  }

  pressed(...codes: string[]): boolean { return codes.some((code) => this.keys.has(code)) }
  /** Robot run and car drift/boost use either Shift key. */
  get running(): boolean { return this.driftHeld }
  get driftHeld(): boolean { return this.pressed('ShiftLeft', 'ShiftRight') }
  get driveThrottle(): number {
    return Number(this.pressed('KeyW', 'ArrowUp')) - Number(this.pressed('KeyS', 'ArrowDown'))
  }
  get driveSteering(): number {
    return Number(this.pressed('KeyD', 'ArrowRight')) - Number(this.pressed('KeyA', 'ArrowLeft'))
  }
  get driving(): boolean {
    return this.pressed('KeyW', 'ArrowUp', 'KeyS', 'ArrowDown', 'KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight')
  }

  movementDirection(camera: PerspectiveCamera): Vector3 | null {
    const f = Number(this.pressed('KeyW', 'ArrowUp')) - Number(this.pressed('KeyS', 'ArrowDown'))
    const r = Number(this.pressed('KeyD', 'ArrowRight')) - Number(this.pressed('KeyA', 'ArrowLeft'))
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
