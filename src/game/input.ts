import { PerspectiveCamera, Vector3 } from 'three/webgpu'

export class GameInput {
  private readonly onTransform: () => void
  private readonly onInteraction: () => void
  private readonly keys = new Set<string>()
  private readonly forward = new Vector3()
  private readonly right = new Vector3()
  private readonly direction = new Vector3()
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    this.onInteraction()
    if (event.repeat) return
    this.keys.add(event.code)
    if (event.code === 'Space') {
      event.preventDefault()
      this.onTransform()
    }
  }
  private readonly onKeyUp = (event: KeyboardEvent): void => { this.keys.delete(event.code) }
  private readonly onBlur = (): void => { this.keys.clear() }
  private readonly onPointerDown = (): void => { this.onInteraction() }

  constructor(onTransform: () => void, onInteraction: () => void) {
    this.onTransform = onTransform
    this.onInteraction = onInteraction
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    window.addEventListener('pointerdown', this.onPointerDown)
  }

  pressed(...codes: string[]): boolean { return codes.some((code) => this.keys.has(code)) }
  get running(): boolean { return this.pressed('ShiftLeft', 'ShiftRight') }

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
  }
}
