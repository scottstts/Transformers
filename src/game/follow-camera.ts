import { PerspectiveCamera, Vector3, type Object3D } from 'three/webgpu'
import type { MotionState } from './types'
import { clamp, damp, easedRange, lerp, wrap } from './math'
import type { CameraProfile } from '../content/transformer/character'

const DEFAULT_FRAMING: CameraProfile = { carDistance: 7.875, robotDistance: 12.75, carFocus: 1.1, robotFocus: 3.9 }
/**
 * Browsers can report the cursor's whole unlocked travel as the first movement
 * after the pointer locks (e.g. coming back from the vehicle menu), whenever that
 * first movement comes: the first event after every lock is dropped, so is
 * anything in a short settle window after locking, and no single event may swing
 * the orbit further than a real flick.
 */
const LOCK_SETTLE_MS = 80
const MAX_EVENT_MOVE = 400
/** A new character's framing (focus heights, distances) eases in over this long (s). */
const FRAMING_GLIDE = 1.2
/** Orbit pitch (rad) of the opening broadside shot: low, close to eye height beside the car. */
const SIDE_PITCH = 0.07
/** Half the span (m) the opening broadside keeps in frame: half a car length plus a margin. */
const SIDE_HALF_SPAN = 3.4
/**
 * Share of the car's slip angle the drive follow swings toward its travel: a
 * drifting car is seen at its angle, sliding across the frame, rather than
 * the view swinging round with its nose.
 */
const TRAVEL_FOLLOW = 0.65

export class FollowCamera {
  private readonly camera: PerspectiveCamera
  private readonly canvas: HTMLCanvasElement
  private robotOffset: number
  /** the framing in use: glides from `framingFrom` to `framingTo` after a character switch */
  private readonly framing: CameraProfile
  private readonly framingFrom: CameraProfile
  private framingTo: CameraProfile
  private framingGlide = 1
  private yaw: number
  private pitch = 0.16
  private lastLook = -10
  private initialized = false
  private radius: number
  private readonly target = new Vector3()
  private readonly position = new Vector3()
  private readonly localFocus = new Vector3()
  private readonly focus = new Vector3()
  private readonly onPointerDown = (): void => { this.activate() }
  private lockedAt = -Infinity
  private freshLock = false
  /** mouse look held by an overlay (the vehicle menu) while the pointer stays locked */
  private held = false
  /** the opening broadside holds until the first look or the car first moves */
  private broadside = false
  /** false on touch devices: the on-screen controls drive the look and nothing locks the pointer */
  pointerLock = true
  private readonly onPointerLockChange = (): void => {
    if (document.pointerLockElement !== this.canvas) return
    // the orbit is kept exactly as it was: re-locking must never move the camera
    this.lockedAt = performance.now()
    this.freshLock = true
    this.lastLook = this.lockedAt / 1000
  }
  private readonly onMouseMove = (event: MouseEvent): void => {
    if (document.pointerLockElement !== this.canvas || this.held) return
    if (event.movementX === 0 && event.movementY === 0) return
    const now = performance.now()
    if (this.freshLock) {
      this.freshLock = false
      return
    }
    if (now - this.lockedAt < LOCK_SETTLE_MS) return
    if (Math.abs(event.movementX) > MAX_EVENT_MOVE || Math.abs(event.movementY) > MAX_EVENT_MOVE) return
    this.look(event.movementX, event.movementY)
  }
  constructor(camera: PerspectiveCamera, canvas: HTMLCanvasElement, initialYaw: number, robotOffset: number, framing: CameraProfile = DEFAULT_FRAMING) {
    this.camera = camera
    this.canvas = canvas
    this.robotOffset = robotOffset
    this.framing = { ...framing }
    this.framingFrom = { ...framing }
    this.framingTo = framing
    this.radius = framing.carDistance
    this.yaw = initialYaw + Math.PI
    canvas.addEventListener('pointerdown', this.onPointerDown)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    document.addEventListener('mousemove', this.onMouseMove)
  }

  /**
   * Frame the car broadside, from its sunlit right (the sun stands to the car's
   * right-rear at the start heading). This is only a starting orbit, so the
   * normal rules take over from it: a look drag orbits away, and once the car
   * drives the camera swings in behind it.
   */
  showSide(carYaw: number): void {
    this.yaw = wrap(carYaw - Math.PI / 2)
    this.pitch = SIDE_PITCH
    this.broadside = true
  }

  /**
   * Frame another character. The orbit (yaw, pitch) is untouched; focus heights
   * and distances ease to the new framing. The robot station switches at once:
   * the session moves the car origin so the robot, and so the focus, stay put.
   */
  setCharacter(robotOffset: number, framing: CameraProfile): void {
    this.robotOffset = robotOffset
    Object.assign(this.framingFrom, this.framing)
    this.framingTo = framing
    this.framingGlide = 0
  }

  /** Ignore mouse look while an overlay is open over the locked pointer. */
  holdLook(held: boolean): void {
    this.held = held
  }

  get locked(): boolean { return document.pointerLockElement === this.canvas }

  /** Orbit by a pointer movement in CSS pixels (mouse under pointer lock, or a touch drag). */
  look(dx: number, dy: number): void {
    if (this.held) return
    this.broadside = false
    this.yaw -= dx * 0.005
    this.pitch = clamp(this.pitch + dy * 0.004, -0.05, 1.1)
    this.lastLook = performance.now() / 1000
  }

  activate(): void {
    if (!this.pointerLock || this.locked || !this.canvas.isConnected) return
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
    this.localFocus.set(0, lerp(this.framing.carFocus, this.framing.robotFocus, k), lerp(0, this.robotOffset, k))
    return this.focus.copy(this.localFocus).applyMatrix4(root.matrixWorld)
  }

  update(dt: number, state: MotionState, root: Object3D, driving = false): void {
    const now = performance.now() / 1000
    if (this.framingGlide < 1) this.glideFraming(dt)
    if (state.progress < 0.5 && driving && now - this.lastLook > 0.3) {
      const slip = state.speed > 1 ? Math.atan2(state.lateral, state.speed) : 0
      this.yaw += wrap(state.yaw + slip * TRAVEL_FOLLOW + Math.PI - this.yaw) * (1 - Math.exp(-dt * 2.4))
      this.pitch = damp(this.pitch, 0.16, 1.6, dt)
    }
    const k = easedRange(state.progress, 0.1, 0.6)
    if (this.broadside && (Math.abs(state.speed) > 0.3 || state.progress > 0)) this.broadside = false
    let distance = lerp(this.framing.carDistance, this.framing.robotDistance, k)
    // on a narrow (portrait) screen the broadside backs off until the whole car fits across
    if (this.broadside) distance = Math.max(distance, SIDE_HALF_SPAN / (Math.tan(this.camera.fov * Math.PI / 360) * this.camera.aspect))
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
    const fov = lerp(42, 48, clamp(Math.hypot(state.speed, state.lateral) / 40, 0, 1) * (1 - k))
    if (this.camera.fov !== fov) {
      this.camera.fov = fov
      this.camera.updateProjectionMatrix()
    }
  }

  private glideFraming(dt: number): void {
    this.framingGlide = Math.min(1, this.framingGlide + dt / FRAMING_GLIDE)
    const u = easedRange(this.framingGlide, 0, 1)
    const a = this.framingFrom
    const b = this.framingTo
    const f = this.framing
    f.carDistance = lerp(a.carDistance, b.carDistance, u)
    f.robotDistance = lerp(a.robotDistance, b.robotDistance, u)
    f.carFocus = lerp(a.carFocus, b.carFocus, u)
    f.robotFocus = lerp(a.robotFocus, b.robotFocus, u)
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    document.removeEventListener('mousemove', this.onMouseMove)
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()
  }
}
