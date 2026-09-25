import { describe, expect, it } from 'vitest'
import { createMotionState, type MotionState } from '../src/game/types'
import { updateCar, type CarControls } from '../src/game/car-dynamics'
import { CYBERTRUCK_PROFILE } from '../src/content/cybertruck'
import { F1_PROFILE } from '../src/content/ferrari-f1'
import type { DriveProfile } from '../src/content/transformer/character'

const CARS: Array<[string, DriveProfile]> = [['cybertruck', CYBERTRUCK_PROFILE.drive], ['ferrari-f1', F1_PROFILE.drive]]

/** Drive a scripted input (steering +1 = right) from `speed` for `seconds`; `probe` sees every frame. */
function drive(car: DriveProfile, speed: number, seconds: number, input: (t: number) => CarControls, fps = 60, probe?: (s: MotionState, t: number) => void): MotionState {
  const state = createMotionState()
  state.yaw = 0
  state.speed = speed
  const dt = 1 / fps
  for (let f = 0; f < seconds * fps; f++) {
    updateCar(state, input(f * dt), dt, false, car)
    probe?.(state, f * dt)
  }
  return state
}

const controls = (driveThrottle: number, driveSteering: number, running: boolean): CarControls => ({ driveThrottle, driveSteering, running })
const slipAngle = (s: MotionState): number => Math.atan2(s.lateral, Math.max(Math.abs(s.speed), 0.5))

describe.each(CARS)('%s handling', (_, car) => {
  it('corners on its tyres without Shift: no slide, no drift', () => {
    let widest = 0
    drive(car, 20, 3, () => controls(1, -1, false), 60, (s) => {
      widest = Math.max(widest, Math.abs(slipAngle(s)))
      expect(Math.abs(s.slideRear)).toBeLessThan(0.8)
    })
    expect(widest).toBeLessThan(0.08)
  })

  it('holds a drift with Shift, throttle and steering into the turn, without spinning', () => {
    const angles: number[] = []
    const end = drive(car, 20, 5, () => controls(1, -1, true), 60, (s, t) => { if (t > 2) angles.push(slipAngle(s)) })
    // a left drift: the car points left of its travel
    for (const a of angles) {
      expect(a).toBeLessThan(-0.2)
      expect(a).toBeGreaterThan(-0.9)
    }
    expect(Math.max(...angles) - Math.min(...angles)).toBeLessThan(0.12)
    expect(end.drift).toBeGreaterThan(0.9)
    // sliding scrubs speed rather than gaining it
    expect(Math.hypot(end.speed, end.lateral)).toBeLessThan(26)
  })

  it('straightens and grips again when Shift is released', () => {
    const end = drive(car, 20, 5, (t) => t < 2.5 ? controls(1, -1, true) : controls(1, 0, false))
    expect(Math.abs(slipAngle(end))).toBeLessThan(0.02)
    expect(Math.abs(end.yawRate)).toBeLessThan(0.02)
    expect(end.release).toBeLessThan(0.01)
  })

  it('handles the same at any frame rate', () => {
    const script = (t: number): CarControls => controls(1, t < 2 ? -1 : 0.4, t < 3)
    const reference = drive(car, 18, 4, script, 240)
    for (const fps of [30, 60, 144]) {
      const s = drive(car, 18, 4, script, fps)
      expect(Math.hypot(s.pos.x - reference.pos.x, s.pos.z - reference.pos.z)).toBeLessThan(1.5)
      expect(Math.abs(s.yaw - reference.yaw)).toBeLessThan(0.1)
    }
  })

  it('brakes at the profile rate without Shift (no locked wheels)', () => {
    const start = 30
    let stopped = -1
    drive(car, start, 4, () => controls(-1, 0, false), 60, (s, t) => {
      expect(s.spinFront).toBe(0)
      expect(s.spinRear).toBe(0)
      if (stopped < 0 && s.speed <= 0.3) stopped = t
    })
    expect(stopped).toBeGreaterThan(0)
    expect(stopped).toBeLessThan(start / car.brake + 0.2)
  })
})
