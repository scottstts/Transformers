import { PerspectiveCamera, Vector3, type Object3D } from 'three/webgpu'
import type { MotionState } from './types'
import { clamp, damp, easedRange, lerp, wrap } from './math'

const CAR_DISTANCE = 7.875
const ROBOT_DISTANCE = 12.75

export class FollowCamera {
  private readonly camera: PerspectiveCamera
  private readonly canvas: HTMLCanvasElement
  private readonly robotOffset: number
  private yaw: number
  private pitch = 0.16
  private lastLook = -10
  private initialized = false
  private radius = CAR_DISTANCE
  private readonly target = new Vector3()
  private readonly position = new Vector3()
  private readonly localFocus = new Vector3()
  private readonly focus = new Vector3()
  private readonly onPointerDown = (): void => { this.activate() }
  private readonly onPointerLockChange = (): void => {
    if (document.pointerLockElement !== this.canvas) return
    const offset = this.camera.position.clone().sub(this.target)
    this.yaw = Math.atan2(offset.x, offset.z)
    this.pitch = clamp(Math.atan2(offset.y, Math.hypot(offset.x, offset.z)), -0.05, 1.1)
    this.lastLook = performance.now() / 1000
  }
  private readonly onMouseMove = (event: MouseEvent): void => {
    if (document.pointerLockElement !== this.canvas) return
    if (event.movementX === 0 && event.movementY === 0) return
    this.yaw -= event.movementX * 0.005
    this.pitch = clamp(this.pitch + event.movementY * 0.004, -0.05, 1.1)
    this.lastLook = performance.now() / 1000
  }
  constructor(camera: PerspectiveCamera, canvas: HTMLCanvasElement, initialYaw: number, robotOffset: number) {
    this.camera = camera
    this.canvas = canvas
    this.robotOffset = robotOffset
    this.yaw = initialYaw + Math.PI
    canvas.addEventListener('pointerdown', this.onPointerDown)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    document.addEventListener('mousemove', this.onMouseMove)
  }

  get locked(): boolean { return document.pointerLockElement === this.canvas }

  activate(): void {
    if (this.locked || !this.canvas.isConnected) return
    try {
      void Promise.resolve(this.canvas.requestPointerLock()).catch(() => {
        // The entry veil or canvas click can retry with a user gesture.
      })
    } catch {
      // A canvas click can retry after the browser has a user gesture.
    }
  }

  focusPoint(state: MotionState, root: Object3D): Vector3 {
    const k = easedRange(state.progress, 0.1, 0.75)
    this.localFocus.set(0, lerp(1.1, 3.9, k), lerp(0, this.robotOffset, k))
    return this.focus.copy(this.localFocus).applyMatrix4(root.matrixWorld)
  }

  update(dt: number, state: MotionState, root: Object3D, driving = false): void {
    const now = performance.now() / 1000
    if (state.progress < 0.5 && driving && now - this.lastLook > 0.3) {
      this.yaw += wrap(state.yaw + Math.PI - this.yaw) * (1 - Math.exp(-dt * 2.4))
      this.pitch = damp(this.pitch, 0.16, 1.6, dt)
    }
    const k = easedRange(state.progress, 0.1, 0.6)
    const distance = lerp(CAR_DISTANCE, ROBOT_DISTANCE, k)
    const focus = this.focusPoint(state, root)
    if (!this.initialized) {
      this.target.copy(focus)
      this.radius = distance
      this.initialized = true
    } else {
      this.target.lerp(focus, 1 - Math.exp(-dt * 8))
      this.radius = damp(this.radius, distance, 8, dt)
    }
    const minimumPitch = Math.asin(clamp((0.5 - this.target.y) / this.radius, -1, 1))
    const pitch = Math.max(this.pitch + lerp(0, 0.02, k), minimumPitch)
    this.position.set(
      this.target.x + Math.sin(this.yaw) * Math.cos(pitch) * this.radius,
      this.target.y + Math.sin(pitch) * this.radius,
      this.target.z + Math.cos(this.yaw) * Math.cos(pitch) * this.radius,
    )
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
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    document.removeEventListener('mousemove', this.onMouseMove)
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()
  }
}
