import { PerspectiveCamera, Vector3, type Object3D } from 'three/webgpu'
import type { MotionState } from './types'
import { clamp, damp, easedRange, lerp, wrap } from './math'

export class FollowCamera {
  private readonly camera: PerspectiveCamera
  private readonly canvas: HTMLCanvasElement
  private readonly robotOffset: number
  private yaw: number
  private pitch = 0.16
  private zoom = 1
  private dragging = false
  private lastDrag = -10
  private pointerX = 0
  private pointerY = 0
  private initialized = false
  private readonly target = new Vector3()
  private readonly position = new Vector3()
  private readonly desired = new Vector3()
  private readonly localFocus = new Vector3()
  private readonly focus = new Vector3()
  private readonly onPointerDown = (event: PointerEvent): void => {
    this.dragging = true
    this.pointerX = event.clientX
    this.pointerY = event.clientY
    this.canvas.setPointerCapture(event.pointerId)
  }
  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging) return
    this.yaw -= (event.clientX - this.pointerX) * 0.005
    this.pitch = clamp(this.pitch + (event.clientY - this.pointerY) * 0.004, -0.05, 1.1)
    this.pointerX = event.clientX
    this.pointerY = event.clientY
    this.lastDrag = performance.now() / 1000
  }
  private readonly onPointerUp = (): void => { this.dragging = false }
  private readonly onWheel = (event: WheelEvent): void => {
    this.zoom = clamp(this.zoom * Math.exp(event.deltaY * 0.001), 0.5, 2.2)
  }

  constructor(camera: PerspectiveCamera, canvas: HTMLCanvasElement, initialYaw: number, robotOffset: number) {
    this.camera = camera
    this.canvas = canvas
    this.robotOffset = robotOffset
    this.yaw = initialYaw + Math.PI
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointercancel', this.onPointerUp)
    canvas.addEventListener('wheel', this.onWheel, { passive: true })
  }

  focusPoint(state: MotionState, root: Object3D): Vector3 {
    const k = easedRange(state.progress, 0.1, 0.75)
    this.localFocus.set(0, lerp(1.1, 3.9, k), lerp(0, this.robotOffset, k))
    return this.focus.copy(this.localFocus).applyMatrix4(root.matrixWorld)
  }

  update(dt: number, state: MotionState, root: Object3D): void {
    const now = performance.now() / 1000
    if (state.progress < 0.5 && !this.dragging && state.speed > 2 && now - this.lastDrag > 1.5) {
      this.yaw += wrap(state.yaw + Math.PI - this.yaw) * (1 - Math.exp(-dt * 1.2))
      this.pitch = damp(this.pitch, 0.16, 0.8, dt)
    }
    const k = easedRange(state.progress, 0.1, 0.6)
    const distance = lerp(10.5, 17, k) * this.zoom + Math.abs(state.speed) * 0.05 * (1 - k)
    const focus = this.focusPoint(state, root)
    const pitch = this.pitch + lerp(0, 0.02, k)
    this.desired.set(
      focus.x + Math.sin(this.yaw) * Math.cos(pitch) * distance,
      Math.max(focus.y + Math.sin(pitch) * distance, 0.5),
      focus.z + Math.cos(this.yaw) * Math.cos(pitch) * distance,
    )
    if (!this.initialized) {
      this.target.copy(focus)
      this.position.copy(this.desired)
      this.initialized = true
    }
    this.target.lerp(focus, 1 - Math.exp(-dt * 8))
    this.position.lerp(this.desired, 1 - Math.exp(-dt * 6))
    this.camera.position.copy(this.position)
    this.camera.lookAt(this.target)
    const fov = lerp(42, 48, clamp(Math.abs(state.speed) / 40, 0, 1) * (1 - k))
    if (this.camera.fov !== fov) {
      this.camera.fov = fov
      this.camera.updateProjectionMatrix()
    }
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerUp)
    this.canvas.removeEventListener('wheel', this.onWheel)
  }
}
