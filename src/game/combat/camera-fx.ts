import { Vector3, type PerspectiveCamera } from 'three/webgpu'
import type { CombatCamera } from '../../content/transformer/combat/effects'

/** Kick: a damped spring along the view (rad/s, damping ratio) and its size at full strength (m). */
const KICK_SPRING = 26
const KICK_DAMPING = 0.42
const KICK_DISTANCE = 0.55
/** Shake: decay per second and size at full strength (m, rad). */
const SHAKE_DECAY = 2.4
const SHAKE_MOVE = 0.14
const SHAKE_ROLL = 0.012
/** Pull-back easing (1/s). */
const PULL_RATE = 3.2

/**
 * What a fight does to the camera on top of the follow rig, as an operator
 * would react: a jolt along the view when a heavy blow lands (a spring, so it
 * overshoots once and settles), a short bounded shake, the lens widening for
 * a burst of speed, room made for a big move, and hit-stop: the fight's clock
 * slowed for a few hundredths of a second as a strike lands. Everything is
 * applied after the follow camera has placed itself, and none of it feeds
 * back into the follow rig's own state.
 */
export class CameraFx implements CombatCamera {
  /** the fight's clock rate this frame (hit-stop) */
  timeScale = 1
  private kickX = 0
  private kickV = 0
  private shakeAmount = 0
  private fovAdd = 0
  private fovHold = 0
  private fovPeak = 0
  private pullTarget = 0
  private pullNow = 0
  private stopLeft = 0
  private stopScale = 1
  private time = 0
  private readonly back = new Vector3()

  kick(strength: number): void {
    this.kickV -= KICK_SPRING * KICK_DISTANCE * Math.min(1, strength)
  }

  shake(strength: number): void {
    this.shakeAmount = Math.min(1, Math.max(this.shakeAmount, strength))
  }

  punch(degrees: number, seconds: number): void {
    this.fovPeak = degrees
    this.fovHold = seconds
  }

  pull(metres: number): void {
    this.pullTarget = metres
  }

  hitStop(seconds: number, scale: number): void {
    this.stopScale = this.stopLeft > 0 ? Math.min(this.stopScale, scale) : scale
    this.stopLeft = Math.max(this.stopLeft, seconds)
  }

  /** Advance by the real frame time; sets `timeScale` for this frame. */
  update(dt: number): void {
    this.time += dt
    if (this.stopLeft > 0) {
      this.stopLeft -= dt
      this.timeScale = this.stopLeft > 0 ? this.stopScale : 1
    } else this.timeScale = 1
    // kick spring (sub-stepped)
    const steps = Math.max(1, Math.ceil(dt * 240))
    const h = dt / steps
    const k = KICK_SPRING * KICK_SPRING
    const c = 2 * KICK_DAMPING * KICK_SPRING
    for (let i = 0; i < steps; i++) {
      this.kickV += (-k * this.kickX - c * this.kickV) * h
      this.kickX += this.kickV * h
    }
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * SHAKE_DECAY)
    // lens: up fast, held, back slowly
    if (this.fovHold > 0) {
      this.fovHold -= dt
      this.fovAdd += (this.fovPeak - this.fovAdd) * (1 - Math.exp(-dt * 14))
    } else this.fovAdd += (0 - this.fovAdd) * (1 - Math.exp(-dt * 3))
    this.pullNow += (this.pullTarget - this.pullNow) * (1 - Math.exp(-dt * PULL_RATE))
  }

  /** Offset the placed camera. */
  apply(camera: PerspectiveCamera): void {
    const pull = this.pullNow + this.kickX
    if (Math.abs(pull) > 1e-4) {
      camera.getWorldDirection(this.back).negate()
      camera.position.addScaledVector(this.back, pull)
      camera.position.y += this.pullNow * 0.18
    }
    const s = this.shakeAmount * this.shakeAmount
    if (s > 1e-5) {
      const t = this.time
      // incommensurate sines: a jolting but bounded, frame-rate independent shake
      camera.position.x += (Math.sin(t * 47.3) + Math.sin(t * 29.1 + 1.7)) * 0.5 * s * SHAKE_MOVE
      camera.position.y += (Math.sin(t * 53.9 + 0.4) + Math.sin(t * 31.7)) * 0.5 * s * SHAKE_MOVE
      camera.rotateZ(Math.sin(t * 41.1 + 2.1) * s * SHAKE_ROLL)
    }
    if (Math.abs(this.fovAdd) > 0.01) {
      camera.fov += this.fovAdd
      camera.updateProjectionMatrix()
    }
  }

  /** Clear every effect (a fight cancelled, a character swapped). */
  reset(): void {
    this.kickX = this.kickV = this.shakeAmount = this.fovAdd = this.fovHold = this.pullTarget = 0
    this.stopLeft = 0
    this.timeScale = 1
  }
}
