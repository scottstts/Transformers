import { Group, Vector3, type Object3D } from 'three/webgpu'
import type { TransformerModel } from '../../transformer/model/transformer'
import type { ContactEffects } from '../../../game/contact-effects'
import { HeatHaze, type HazePatch } from '../../transformer/combat/fx/haze'
import { JetColumns, COLUMN_SLOTS, type ColumnState } from './jet-columns'
import { Vapor, type VaporBurst } from './vapor'

/**
 * The Roadster's compressed-air propulsion (roadster-model.md, the reference's
 * hovering car): cold air, not burning fuel, so its jets are columns of white
 * condensate and the cloud they throw where they strike the ground, never
 * flame or glow.
 *
 *   lift  four lift jets on telescoping stages under the car (behind the
 *         front wheels, under the rear pods): they launch the car into its
 *         flight and, played backward, brake its landing as a car
 *   pack  the tail standing on the robot's back, its four compressor engines
 *         and four nozzles thrusting down: it brakes the robot's landing
 *         (and launches it when it jumps back into the car), and drives its
 *         flying in a fight
 *
 * The throttle follows the baked flight (`flight.py`, seconds of the 9 s
 * transformation): the jets spool as the stages reach the ground, burn
 * through the boost (0.8 to 1.6 s) and die away into the ballistic arc; a few
 * short attitude puffs steady the backflip; the pack lights as the robot
 * comes out of the flip and burns to the touchdown (6.6 s). The schedule is
 * a function of the transformation's time only, so it plays the same
 * backward. A fight drives the pack through `boost`; the car fires it through
 * `drive` (Shift's full power: the drive profile's air thrust), its outlets
 * pointing back and 12 degrees down, so the columns strike the sand about
 * 2.7 m behind the tail and blow it back along the ground.
 */

type Kind = 'lift' | 'nozzle' | 'fan'

interface Outlet {
  node: Object3D
  /** outlet centre and jet axis, node frame */
  at: Vector3
  axis: Vector3
  radius: number
  kind: Kind
  /** world, this frame */
  exit: Vector3
  dir: Vector3
  /** the exit last frame: the body's velocity carries the puffs it sheds a little */
  last: Vector3
  primed: boolean
}

/** Per kind: full-throttle visible length (m), radius at the far end (m), density, puffs shed per second. */
const KIND: Record<Kind, { length: number; spread: number; density: number; shed: number }> = {
  lift: { length: 4.6, spread: 0.42, density: 1, shed: 28 },
  nozzle: { length: 3.6, spread: 0.3, density: 0.85, shed: 18 },
  fan: { length: 3.2, spread: 0.75, density: 0.32, shed: 10 },
}
/** Lift jet stages (asm:jet.*.stage): the outlet at the stage's foot, thrust down its axis (rdb/aero.py). */
const LIFT_JETS = ['FL', 'FR', 'RL', 'RR']
const LIFT_EXIT = new Vector3(0, 0, -0.2)
const LIFT_AXIS = new Vector3(0, 0, -1)
const LIFT_RADIUS = 0.058
/** The tail's rear face (rdb/propulsion.py, tail frame): its outward normal, the nozzles' and engines' axis. */
const FACE_AXIS = new Vector3(0, 0.979, -0.204)
const NOZZLES = [0.114, 0.34]
const NOZZLE_AT = { y: 0.892, z: -0.055, r: 0.042 }
const ENGINES = [0.137, 0.425]
const ENGINE_AT = { y: 0.77, z: -0.204, r: 0.11 }

/** The transformation's throttle schedules (s of its 9 s): spool up, full, die away. */
const LIFT_BURN = { on: [0.42, 0.82], off: [1.6, 2.2] } as const
/** Attitude puffs through the flip: time (s), length (s), throttle. */
const PUFFS: ReadonlyArray<readonly [number, number, number]> = [[2.95, 0.16, 0.5], [3.4, 0.14, 0.45], [4.45, 0.15, 0.5], [4.95, 0.13, 0.4]]
const PACK_BURN = { on: [5.25, 5.95], off: [6.58, 7.05] } as const

/** The ground cloud: puffs thrown out along the ground per second at full impingement. */
const CLOUD_RATE = 70
/** Shimmer patches in the cold air under an outlet, per second at full throttle. */
const SHIMMER_RATE = 5

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export class AirJets {
  /** world-space effects: add to the scene */
  readonly object = new Group()
  readonly vapor = new Vapor()
  private readonly columns = new JetColumns()
  private readonly haze = new HeatHaze()
  private readonly outlets: Outlet[] = []
  private readonly contact: ContactEffects
  private readonly column: ColumnState = { exit: new Vector3(), axis: new Vector3(), length: 0, r0: 0, r1: 0, power: 0, density: 1 }
  /** throttles this frame, 0..1 */
  lift = 0
  pack = 0
  /** how hard the jets strike the ground this frame (0..1+, summed over the outlets) */
  impingement = 0
  /** a fight's pack throttle (0 hands it back to the schedule) and how much of its air it sends straight down */
  private boostPower = 0
  /** the car's air thrust (0..1): the pack driving the car */
  private drivePower = 0
  private clock = 0
  /** reused descriptions of what is emitted (a frame allocates nothing) */
  private readonly puff: VaporBurst = { count: 1, at: new Vector3(), jitter: 0, dir: new Vector3(), spread: 0, speed: [0, 0], life: [0, 0], size: [0, 0], drag: 0, buoyancy: 0, opacity: 0, carry: new Vector3() }
  private readonly patch: HazePatch = { at: new Vector3(), jitter: 0.2, size: [0.5, 0.9], rise: -0.6, life: [0.18, 0.3], strength: 0 }

  constructor(model: TransformerModel, contact: ContactEffects) {
    this.contact = contact
    this.vapor.ground = contact
    const add = (node: string, at: Vector3, axis: Vector3, radius: number, kind: Kind): void => {
      this.outlets.push({ node: model.node(node), at, axis, radius, kind, exit: new Vector3(), dir: new Vector3(), last: new Vector3(), primed: false })
    }
    for (const jet of LIFT_JETS) add(`asm:jet.${jet}.stage`, LIFT_EXIT, LIFT_AXIS, LIFT_RADIUS, 'lift')
    for (const s of [1, -1]) {
      for (const x of NOZZLES) add('asm:tail', new Vector3(s * x, NOZZLE_AT.y, NOZZLE_AT.z), FACE_AXIS, NOZZLE_AT.r, 'nozzle')
      for (const x of ENGINES) add('asm:tail', new Vector3(s * x, ENGINE_AT.y, ENGINE_AT.z), FACE_AXIS, ENGINE_AT.r, 'fan')
    }
    if (this.outlets.length > COLUMN_SLOTS) throw new Error('more outlets than jet columns')
    this.object.add(this.columns.mesh, this.vapor.mesh, this.haze.mesh)
  }

  /** The schedule's lift-jet throttle at transformation time `s` (seconds). */
  static liftThrottle(s: number): number {
    let p = smooth(LIFT_BURN.on[0], LIFT_BURN.on[1], s) * (1 - smooth(LIFT_BURN.off[0], LIFT_BURN.off[1], s))
    for (const [t, len, power] of PUFFS) p = Math.max(p, power * smooth(t, t + 0.04, s) * (1 - smooth(t + len - 0.06, t + len, s)))
    return p
  }

  /** The schedule's pack throttle at transformation time `s` (seconds). */
  static packThrottle(s: number): number {
    return smooth(PACK_BURN.on[0], PACK_BURN.on[1], s) * (1 - smooth(PACK_BURN.off[0], PACK_BURN.off[1], s))
  }

  /** A fight drives the pack: throttle 0..1 (0 hands it back to the transformation's schedule). */
  boost(power: number): void {
    this.boostPower = Math.max(0, power)
  }

  /** The car fires the pack: its thrust spool 0..1 (the motion state's `thrust`). */
  drive(power: number): void {
    this.drivePower = Math.max(0, power)
  }

  /**
   * Per frame, after the model is posed: `seconds` the transformation's time
   * (0 car .. its duration), `dt` the world's step.
   */
  update(seconds: number, transforming: boolean, dt: number): void {
    this.clock += dt
    // the flow's roughness: a few per cent of fast, uncorrelated flutter
    const flutter = 1 + 0.03 * Math.sin(this.clock * 61) + 0.02 * Math.sin(this.clock * 97.3 + 1.1)
    this.lift = transforming ? AirJets.liftThrottle(seconds) * flutter : 0
    this.pack = Math.max(transforming ? AirJets.packThrottle(seconds) * flutter : 0, this.boostPower, this.drivePower * flutter)
    this.impingement = 0
    for (let k = 0; k < this.outlets.length; k++) {
      const o = this.outlets[k]
      const power = o.kind === 'lift' ? this.lift : this.pack
      const W = o.node.matrixWorld
      o.exit.copy(o.at).applyMatrix4(W)
      o.dir.copy(o.axis).transformDirection(W)
      if (!o.primed) { o.last.copy(o.exit); o.primed = true }
      if (power < 0.004 || dt <= 0) {
        this.columns.clear(k)
        o.last.copy(o.exit)
        continue
      }
      this.burn(k, o, power, dt)
      o.last.copy(o.exit)
    }
    this.columns.commit(dt)
    this.vapor.update(dt)
    this.haze.update(dt)
  }

  /** One outlet burning at `power`: its column, the puffs it sheds, and where it strikes the ground, the cloud. */
  private burn(k: number, o: Outlet, power: number, dt: number): void {
    const spec = KIND[o.kind]
    const full = spec.length * (0.35 + 0.65 * power)
    const floor = this.contact.height(o.exit.x, o.exit.z)
    const down = -o.dir.y
    // distance along the axis to the ground (an outlet pointing up or level never reaches it)
    const reach = down > 0.08 ? Math.max(0, (o.exit.y - floor) / down) : Infinity
    const c = this.column
    c.exit.copy(o.exit)
    c.axis.copy(o.dir)
    c.length = Math.min(full, reach)
    c.r0 = o.radius * 1.15
    c.r1 = c.r0 + (spec.spread - c.r0 * 0.5) * (c.length / spec.length) * (0.6 + 0.4 * power)
    c.power = power
    c.density = spec.density
    this.columns.set(k, c)

    // the body's velocity: a little of it carried into what it sheds
    const b = this.puff
    const carry = b.carry as Vector3
    carry.subVectors(o.exit, o.last).multiplyScalar(0.3 / dt)
    if (carry.lengthSq() > 400) carry.setLength(20)

    // puffs shed off the column's sides as it mixes: they break its outline and linger behind a moving body
    let n = spec.shed * power * dt
    while (n > 0) {
      if (n < 1 && Math.random() > n) break
      n -= 1
      const along = Math.random() * c.length * 0.85
      b.at.copy(o.exit).addScaledVector(o.dir, along)
      b.jitter = c.r0 + (c.r1 - c.r0) * along / Math.max(c.length, 0.1)
      b.dir.copy(o.dir)
      b.spread = 0.35
      b.speed[0] = 3 * power; b.speed[1] = 9 * power
      b.life[0] = 0.5; b.life[1] = 1.1
      b.size[0] = 0.25 + along * 0.12; b.size[1] = 1.1 + along * 0.3
      b.drag = 2.6
      b.buoyancy = 0.25
      b.opacity = 0.26 * spec.density
      this.vapor.emit(b)
    }

    // shimmer: the cold air under the outlet bends the light behind it
    if (Math.random() < SHIMMER_RATE * power * dt) {
      this.patch.at.copy(o.exit).addScaledVector(o.dir, 0.5 + Math.random() * 0.8)
      this.patch.strength = 0.45 * power
      this.haze.emit(this.patch)
    }

    // striking the ground: the cloud rolls out along it, the sand blown with it. A jet
    // standing on the ground spreads a tall ring; a grazing one (the car's) skims a low,
    // short-lived wash back along its own line
    if (reach === Infinity) return
    const strike = power * smooth(full * 1.15, full * 0.3, reach)
    if (strike < 0.01) return
    this.impingement += strike * (o.kind === 'fan' ? 0.4 : 1)
    const graze = 1 - smooth(0.3, 0.8, down)
    _hit.copy(o.exit).addScaledVector(o.dir, reach)
    carry.set(0, 0, 0)
    b.jitter = 0.3
    b.spread = 0.12
    b.speed[0] = 6 * (0.5 + 0.5 * strike); b.speed[1] = 13 * (0.5 + 0.5 * strike)
    b.life[0] = 2 - 1.4 * graze; b.life[1] = 3.8 - 2.6 * graze
    b.size[0] = 0.6 - 0.2 * graze; b.size[1] = (3.6 + 1.6 * strike) * (1 - 0.6 * graze)
    b.drag = 1.35
    b.buoyancy = 0.18
    b.opacity = 0.34
    const radial = 1 - 0.7 * graze
    const lean = 0.6 + 0.6 * graze
    let m = CLOUD_RATE * strike * spec.density * (1 - 0.5 * graze) * dt
    while (m > 0) {
      if (m < 1 && Math.random() > m) break
      m -= 1
      const a = Math.random() * Math.PI * 2
      // out along the ground, a little up, the jet's own lean carried into it
      b.dir.set(Math.cos(a) * radial + o.dir.x * lean, 0.12 + Math.random() * 0.22, Math.sin(a) * radial + o.dir.z * lean).normalize()
      b.at.set(_hit.x + Math.cos(a) * 0.3, _hit.y + 0.25, _hit.z + Math.sin(a) * 0.3)
      this.vapor.emit(b)
    }
    this.contact.blast(_hit, Math.min(1, strike * 0.55), dt)
  }

  /** Everything off at once (the character leaves the scene). */
  reset(): void {
    this.boostPower = 0
    this.drivePower = 0
    for (let k = 0; k < this.outlets.length; k++) {
      this.columns.clear(k)
      this.outlets[k].primed = false
    }
    this.columns.commit(0)
    this.vapor.reset()
  }

  warm(on: boolean): void {
    this.columns.warm(on)
    this.vapor.warm(on)
    this.haze.warm(on)
  }
}

const _hit = new Vector3()
