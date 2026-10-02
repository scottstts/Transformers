import { Vector3, type Scene } from 'three/webgpu'
import { Sparks, type SparkBurst } from '../../content/transformer/combat/fx/sparks'
import type { Ground } from '../../game/ground'

/** Hot flecks sheared from metal deck. The pool and material exist before warm-up. */
export class DeckImpacts {
  readonly sparks = new Sparks()
  private budget = 64
  private readonly burst: SparkBurst = {
    count: 0, at: new Vector3(), dir: new Vector3(0, 1, 0), spread: 0.8,
    speed: [2, 10], life: [0.12, 0.45], size: 0.014, drag: 3, gravity: 1, palette: 0,
  }

  constructor(scene: Scene, ground: Ground) {
    this.sparks.ground = ground
    scene.add(this.sparks.mesh)
  }

  strike(at: Vector3, strength: number, count: number): void {
    const n = Math.min(24, Math.round(count), Math.floor(this.budget))
    if (n <= 0) return
    this.budget -= n
    const b = this.burst
    b.count = n
    b.at.set(at.x, this.sparks.ground.height(at.x, at.z) + 0.035, at.z)
    b.speed[1] = 5 + Math.min(2, strength) * 6
    this.sparks.emit(b)
  }

  warm(on: boolean): void {
    this.sparks.mesh.visible = on
  }

  update(dt: number): void {
    this.budget = Math.min(64, this.budget + dt * 150)
    this.sparks.update(dt)
  }
}
