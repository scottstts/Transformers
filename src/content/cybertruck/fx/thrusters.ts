import { Group, PointLight, Vector3, type Object3D } from 'three/webgpu'
import type { TransformerModel } from '../../transformer/model/transformer'
import { ImpingementSheet, PlasmaJet, jetLength } from './plasma'

/**
 * Lift thrusters: two plasma jets that carry the upper body while it rises
 * about the planted feet (and brake it on the way back down).
 *
 * The jets leave flush ports on the chest's back plate (no nozzle geometry;
 * the plate faces the ground inside the truck and the back when standing).
 * They are gimballed most of the way toward world down, so the thrust points
 * up whatever the body's pitch and the exhaust sweeps away from the legs.
 * Throttle follows the load: the torque gravity puts on the body about the
 * feet goes with the cosine of its elevation, so the jets burn hardest at
 * lift-off and die away as the robot comes upright.
 *
 * In a fight the same jets drive a charge (`boost`): throttle and exhaust
 * axis come from the move instead of the lift schedule.
 */

/** Exhaust ports on the chest back plate (chest frame: x left, +y back, z up the spine; 15 mm off the plate). */
const PORTS = [new Vector3(0.24, 0.515, 0.55), new Vector3(-0.24, 0.515, 0.55)]
/** Share of world-down in the exhaust axis (the rest follows the back-plate normal). */
const GIMBAL = 0.7
/** T window: ignition just before the body leaves the truck, cut-off once it stands. */
const IGNITION: [number, number] = [0.272, 0.302]
const CUTOFF: [number, number] = [0.7, 0.8]
const LIGHT_INTENSITY = 14
const DOWN = new Vector3(0, -1, 0)

export class Thrusters {
  /** world-space effects: add to the scene */
  readonly object = new Group()
  /** throttle 0..1 */
  power = 0
  /** how hard the exhaust strikes the ground, 0..1 */
  impingement = 0
  /** where it strikes (midpoint of both jets) */
  readonly impact = new Vector3()

  private readonly chest: Object3D
  private readonly coolingPacks: Object3D[]
  private readonly deployedPort = new Vector3()
  private readonly jets = [new PlasmaJet(0.0), new PlasmaJet(0.53)]
  private readonly sheet = new ImpingementSheet()
  private readonly light = new PointLight(0xa8c4ff, 0, 16, 2)
  private readonly ports = [new Vector3(), new Vector3()]
  private readonly strikes = [new Vector3(), new Vector3()]
  private readonly axis = new Vector3()
  private readonly back = new Vector3()
  private readonly spine = new Vector3()
  private readonly side = new Vector3()
  private time = 0
  /** combat charge: throttle 0..1 and exhaust axis (world, unit) */
  private boostPower = 0
  private readonly boostAxis = new Vector3(0, -1, 0)

  constructor(model: TransformerModel) {
    this.chest = model.node('bone:chest')
    this.coolingPacks = ['L', 'R'].map((side) => model.node(`part:RD.back.coolingPack.${side}`))
    for (const jet of this.jets) this.object.add(jet.mesh)
    this.object.add(this.sheet.mesh, this.light)
  }

  /** Throttle at transformation time T for a body whose spine rises at elevation asin(spineY). */
  static throttle(T: number, spineY: number): number {
    const cosE = Math.sqrt(Math.max(0, 1 - spineY * spineY))
    return smooth(IGNITION[0], IGNITION[1], T) * (1 - smooth(CUTOFF[0], CUTOFF[1], T)) * (0.25 + 0.75 * cosE)
  }

  /** Drive the jets for a charge: throttle 0..1 (0 hands them back to the lift schedule) and the exhaust axis (world). */
  boost(power: number, axis: Vector3): void {
    this.boostPower = power
    this.boostAxis.copy(axis).normalize()
  }

  update(T: number, dt: number): void {
    this.time += dt
    const W = this.chest.matrixWorld
    this.spine.set(0, 0, 1).transformDirection(W)
    const charging = this.boostPower > 0
    const base = charging ? this.boostPower : Thrusters.throttle(T, this.spine.y)
    // combustion roughness: a few percent of fast, uncorrelated flutter
    const t = this.time
    const power = base * (1 + 0.035 * Math.sin(t * 71.0) + 0.025 * Math.sin(t * 123.7 + 1.3))
    this.power = power
    const on = base > 0.002
    for (const jet of this.jets) jet.mesh.visible = on
    this.sheet.mesh.visible = on
    if (!on) {
      this.impingement = 0
      this.light.intensity = 0
      return
    }

    this.back.set(0, 1, 0).transformDirection(W)
    this.side.set(1, 0, 0).transformDirection(W)
    if (charging) this.axis.copy(this.boostAxis)
    else this.axis.copy(this.back).multiplyScalar(1 - GIMBAL).addScaledVector(DOWN, GIMBAL).normalize()
    const length = jetLength(power)
    let strike = 0
    for (let k = 0; k < 2; k++) {
      const port = this.ports[k].copy(PORTS[k]).applyMatrix4(W)
      // The redesigned cooling packs deploy over the old back-plate ports.
      // Carry each exhaust outlet with its pack's lower outer edge.
      this.deployedPort.set(0, 0.21, -0.46).applyMatrix4(this.coolingPacks[k].matrixWorld)
      port.lerp(this.deployedPort, smooth(0.30, 0.57, T))
      this.jets[k].set(port, this.axis, this.side, power, t)
      const reach = port.y / Math.max(-this.axis.y, 1e-3)
      this.strikes[k].copy(port).addScaledVector(this.axis, reach)
      strike = Math.max(strike, smooth(length * 1.05, length * 0.3, reach))
    }
    this.impingement = power * strike
    this.sheet.set(this.strikes[0], this.strikes[1], this.impingement, t)
    this.impact.addVectors(this.strikes[0], this.strikes[1]).multiplyScalar(0.5)

    // the jets light the sand and the machine: from inside the plume, a third of the way to the ground
    const drop = Math.min(0.9, (this.ports[0].y + this.ports[1].y) * 0.5 * 0.35)
    this.light.position.addVectors(this.ports[0], this.ports[1]).multiplyScalar(0.5).addScaledVector(this.axis, drop / Math.max(-this.axis.y, 0.2))
    this.light.intensity = LIGHT_INTENSITY * power * (1 + 0.08 * Math.sin(t * 57.3))
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
