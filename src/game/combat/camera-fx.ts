import { Vector3, type PerspectiveCamera } from 'three/webgpu'
import type { CombatCamera } from '../../content/transformer/combat/effects'
import type { Lens } from '../../rendering/lens'

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
 * Blast wave: radius R = SEDOV (E t^2)^(1/5) (m, s; Sedov-Taylor, E the
 * blast's energy in units of a full special), refraction strength at the
 * front, how long (s) it takes to die away, and the front's thickness (m).
 */
const SEDOV = 24
const SHOCK_STRENGTH = 0.9
const SHOCK_LIFE = 0.9
const SHOCK_THICKNESS = 0.9
/** Zone (drained palette) easing (1/s). */
const ZONE_RATE = 5

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
  private readonly lens: Lens | null
  private readonly shockAt = new Vector3()
  private shockAge = -1
  private shockEnergy = 0
  private flashLevel = 0
  private flashDecay = 1
  private zoneTarget = 0
  private zoneNow = 0

  constructor(lens: Lens | null = null) {
    this.lens = lens
  }

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

  shockwave(at: Vector3, energy: number): void {
    this.shockAt.copy(at)
    this.shockAge = 0
    this.shockEnergy = energy
  }

  flash(amount: number, seconds: number): void {
    this.flashLevel = Math.max(this.flashLevel, amount)
    this.flashDecay = 3 / Math.max(0.02, seconds)
  }

  zone(amount: number): void {
    this.zoneTarget = amount
  }

  /** Advance what lives in the world's time (the blast wave) by the world's dt: slow motion slows it too. */
  updateWorld(dt: number): void {
    if (this.shockAge >= 0) {
      this.shockAge += dt
      if (this.shockAge > SHOCK_LIFE) this.shockAge = -1
    }
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
    // the flash is the lens's: it dies in real time, however slow the world runs
    this.flashLevel *= Math.exp(-dt * this.flashDecay)
    if (this.flashLevel < 1e-3) this.flashLevel = 0
    this.zoneNow += (this.zoneTarget - this.zoneNow) * (1 - Math.exp(-dt * ZONE_RATE))
    if (this.zoneTarget === 0 && this.zoneNow < 1e-3) this.zoneNow = 0
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
    if (this.lens) this.applyLens(camera, this.lens)
  }

  /** The blast wave's ring as the camera now sees it, the flash and the zone. */
  private applyLens(camera: PerspectiveCamera, lens: Lens): void {
    lens.flash.value = this.flashLevel
    lens.zone.value = this.zoneNow
    let strength = 0
    if (this.shockAge >= 0) {
      const t = this.shockAge
      const radius = SEDOV * Math.pow(this.shockEnergy * t * t, 0.2)
      // the front is a hemisphere on the ground: aim at its middle height
      _c.copy(this.shockAt).setY(this.shockAt.y + radius * 0.35)
      camera.updateMatrixWorld()
      const distance = _c.distanceTo(camera.position)
      _c.project(camera)
      if (_c.z < 1 && distance > radius * 0.6) {
        const halfHeight = distance * Math.tan(camera.fov * Math.PI / 360)
        lens.shockCenter.value.set(_c.x * 0.5 + 0.5, 0.5 - _c.y * 0.5)
        lens.shockRadius.value = radius / halfHeight * 0.5
        lens.shockWidth.value = (SHOCK_THICKNESS + radius * 0.06) / halfHeight * 0.5
        const u = t / SHOCK_LIFE
        strength = SHOCK_STRENGTH * Math.min(1.5, this.shockEnergy) * (1 - u) * (1 - u) * Math.min(1, t / 0.03)
      }
    }
    lens.shockStrength.value = strength
  }

  /** Clear every effect (a fight cancelled, a character swapped). */
  reset(): void {
    this.kickX = this.kickV = this.shakeAmount = this.fovAdd = this.fovHold = this.pullTarget = 0
    this.stopLeft = 0
    this.timeScale = 1
    this.shockAge = -1
    this.flashLevel = 0
    this.zoneTarget = this.zoneNow = 0
  }
}

const _c = new Vector3()
