import type { Forts } from '../../worlds/desert/fort'
import type { MotionState } from '../types'

/** Width of the band outside a fort's ring in which the car is slowed (m). */
export const BARRIER_BAND = 30

/**
 * The forts' perimeter against the car. Each fort has a ring (plan.barrier,
 * outside its walls) that only the robot may cross: a car driving at it is
 * held back through a band outside the ring, its speed toward the fort capped
 * the closer it gets (as if pushing into a thickening field), coming to rest
 * at the ring itself. It can drive along the ring and away freely. A car that
 * came to be inside (the robot transformed back in the yard) can drive out;
 * once out, the ring holds it.
 */
export class CarBarrier {
  /** per fort: the car was outside the ring on the last frame it was checked */
  private readonly outside: boolean[] = []
  /** the car is being held at a ring this frame */
  holding = false

  apply(state: MotionState, forts: Forts, maxSpeed: number, carForm: boolean): void {
    this.holding = false
    forts.list.forEach((fort, i) => {
      const s = fort.plan.site
      const R = fort.plan.barrier
      const dx = state.pos.x - s.x, dz = state.pos.z - s.z
      const d = Math.hypot(dx, dz)
      // where the car stands relative to the ring; a robot is only tracked
      const out = (this.outside[i] ?? d >= R) || d >= R
      this.outside[i] = carForm ? out : d >= R
      if (!carForm || !out || d > R + BARRIER_BAND) return
      const nx = dx / Math.max(d, 1e-4), nz = dz / Math.max(d, 1e-4)
      // the car's velocity toward the fort: its forward speed and its sideways slide
      const fx = Math.sin(state.yaw), fz = Math.cos(state.yaw)
      const vx = fx * state.speed + fz * state.lateral
      const vz = fz * state.speed - fx * state.lateral
      const inward = -(vx * nx + vz * nz)
      const room = Math.max(0, (d - R) / BARRIER_BAND)
      const limit = maxSpeed * Math.pow(room, 0.8)
      if (inward > limit) {
        const k = limit / inward
        state.speed *= k
        state.lateral *= k
        this.holding = room < 0.35
      }
      if (d < R) {
        state.pos.x = s.x + nx * R
        state.pos.z = s.z + nz * R
        this.holding = true
      }
    })
  }
}
