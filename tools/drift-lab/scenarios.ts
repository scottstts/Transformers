import { createMotionState, type MotionState } from '../../src/game/types'
import { updateCar } from '../../src/game/car-dynamics'
import { CYBERTRUCK_PROFILE } from '../../src/content/cybertruck'
import { F1_PROFILE } from '../../src/content/ferrari-f1'
import type { DriveProfile } from '../../src/content/transformer/character'

interface Input { driveThrottle: number; driveSteering: number; running: boolean }
/** A driver script: inputs as a function of time (s). Steering +1 = right (D). */
type Script = (t: number) => Input
interface Scenario { start: number; duration: number; script: Script }

const drive = (throttle: number, steer: number, shift: boolean): Input => ({ driveThrottle: throttle, driveSteering: steer, running: shift })

export const SCENARIOS: Record<string, Scenario> = {
  // grip cornering at speed, no Shift
  grip: { start: 22, duration: 3, script: () => drive(1, -1, false) },
  // Shift + throttle + hold left: a sustained drift
  hold: { start: 20, duration: 5, script: () => drive(1, -1, true) },
  // Shift + throttle, flick left then neutral steering
  neutral: { start: 20, duration: 5, script: (t) => drive(1, t < 0.6 ? -1 : 0, true) },
  // drift left, then release Shift at 2.5 s (neutral steering after)
  exit: { start: 20, duration: 5, script: (t) => drive(1, t < 2.5 ? -1 : 0, t < 2.5) },
  // drift left, then countersteer right at 2 s
  counter: { start: 20, duration: 4, script: (t) => drive(1, t < 2 ? -1 : 1, true) },
  // Shift, throttle lifted
  lift: { start: 20, duration: 4, script: (t) => drive(t < 1 ? 1 : 0, -1, true) },
  // from standstill: Shift + throttle + full left: donut
  donut: { start: 0, duration: 6, script: () => drive(1, -1, true) },
  // hard braking at speed, straight, then with steering
  brake: { start: 30, duration: 3, script: (t) => drive(-1, t > 0.8 ? -1 : 0, false) },
  // handbrake turn: Shift + brake + left from speed
  handbrake: { start: 15, duration: 3, script: () => drive(-1, -1, true) },
  // Shift held on a straight
  straight: { start: 20, duration: 3, script: () => drive(1, 0, true) },
  // left-right transition drift
  swing: { start: 22, duration: 6, script: (t) => drive(1, t < 2 ? -1 : 1, true) },
  // high-speed drift entry
  fast: { start: 40, duration: 4, script: () => drive(1, -1, true) },
}

export function runScenarios(car: string, names: string[]): void {
  const profile: DriveProfile = (car === 'ferrari-f1' ? F1_PROFILE : CYBERTRUCK_PROFILE).drive
  for (const name of names.length ? names : Object.keys(SCENARIOS)) {
    const s = SCENARIOS[name]
    if (!s) throw new Error(`unknown scenario ${name}`)
    const state = createMotionState()
    state.yaw = 0
    state.speed = s.start
    const dt = 1 / 60
    console.log(`\n== ${car} ${name}`)
    console.log('   t     u      v   beta   r(°/s) steer  drvS  rearSl  spinR  release  |V|  radius')
    for (let f = 0; f <= s.duration * 60; f++) {
      const t = f * dt
      if (f % 15 === 0) line(t, state)
      updateCar(state, s.script(t), dt, false, profile)
    }
  }
}

function line(t: number, s: MotionState): void {
  const V = Math.hypot(s.speed, s.lateral)
  const beta = Math.atan2(s.lateral, Math.max(Math.abs(s.speed), 0.5)) * 180 / Math.PI
  const radius = Math.abs(s.yawRate) > 0.02 ? V / Math.abs(s.yawRate) : Infinity
  const f = (x: number, w = 6, d = 1): string => x.toFixed(d).padStart(w)
  console.log(`${f(t, 5, 2)} ${f(s.speed)} ${f(s.lateral)} ${f(beta)} ${f(s.yawRate * 57.3, 7)} ${f(s.steer * 57.3)} ${f(s.steerInput * 57.3)} ${f(s.slideRear, 7, 2)} ${f(s.spinRear, 6, 2)} ${f(s.release, 7, 2)} ${f(V)} ${f(radius, 7)}`)
}
