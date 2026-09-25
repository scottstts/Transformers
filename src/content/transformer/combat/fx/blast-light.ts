import { Color, PointLight, type Vector3 } from 'three/webgpu'

/**
 * The light of a blast on everything around it: one point light that stays in
 * the scene at zero between flashes (so the light count, and every shader,
 * never changes). A flash rises in a few milliseconds, then falls away and
 * shifts from its first colour toward a fire's orange as the fireball cools.
 */
export class BlastLight {
  readonly light = new PointLight(0xffffff, 0, 60, 2)
  private level = 0
  private peak = 0
  private seconds = 1
  private age = 1e9
  private readonly hot = new Color()
  private readonly cool = new Color(1, 0.42, 0.12)

  /** A flash at `at` of `intensity`, first `color` (linear), dying over `seconds`, reaching `range` m. */
  flash(at: Vector3, color: number, intensity: number, seconds: number, range = 60): void {
    this.light.position.copy(at)
    this.hot.setHex(color)
    this.peak = intensity
    this.seconds = seconds
    this.light.distance = range
    this.age = 0
  }

  /** Move the flash with what makes it (a fireball that rises). */
  follow(at: Vector3): void {
    this.light.position.copy(at)
  }

  update(dt: number): void {
    if (this.age > this.seconds * 3) {
      this.light.intensity = 0
      return
    }
    this.age += dt
    const rise = Math.min(1, this.age / 0.03)
    const fall = Math.exp(-this.age / (this.seconds * 0.35))
    this.level = this.peak * rise * fall
    this.light.intensity = this.level * (0.92 + 0.08 * Math.random())
    this.light.color.copy(this.hot).lerp(this.cool, Math.min(1, this.age / this.seconds))
  }

  reset(): void {
    this.age = 1e9
    this.light.intensity = 0
  }
}
