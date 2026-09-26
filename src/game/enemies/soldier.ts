import { Quaternion, Vector3 } from 'three/webgpu'
import type { SoldierManifest } from '../../content/soldier/asset'
import type { HordeInstance } from '../../content/soldier/horde-renderer'
import { SoldierRig, createSoldierPose } from '../../content/soldier/rig'
import { POSES, SC, SOLDIER_CHANNEL_COUNT, approach, blend, writePose } from '../../content/soldier/poses'
import type { HitKind } from '../../content/transformer/combat/hits'
import { wrap } from '../math'
import type { Debris } from './debris'

/** Soldier tuning: speeds (m/s), accelerations (m/s^2), times (s). */
export const SOLDIER = {
  /** a combo's four blows take one down; its first three don't (the robots' hits.ts) */
  health: 300,
  chargeSpeed: 8.5,
  engageSpeed: 3.4,
  accel: 11,
  turnRate: 4.5,
  /** coasting on its wheels, braking them (after a blow it fights to stop), and skidding sideways across them */
  rollFriction: 2.4,
  brake: 8.5,
  skidFriction: 13,
  /** body radius against the others and the scenery (m) */
  radius: 0.62,
  /** the slash: wind-up, strike and recovery, and where in it the blade lands */
  windup: 0.42,
  strike: 0.16,
  recover: 0.42,
  landsAt: 0.5,
  /** thrown clear of the ground past this lift or knock */
  launchLift: 2.4,
  launchKnock: 11,
  gravity: 9.8,
  /** lying before getting up, and the getting up */
  down: [1.1, 1.9] as const,
  rise: 0.95,
  /** a blow's flinch: how long it holds the hit pose (s), a little longer for harder blows, and how fast it snaps into it (1/s) */
  flinch: [0.3, 0.5] as const,
  flinchSnap: 34,
  /** the health bar's trailing chip: how long it holds after a blow, then how fast it drains (share of full per s) */
  chipHold: 0.4,
  chipDrain: 0.9,
}

export type SoldierMode = 'post' | 'move' | 'attack' | 'hit' | 'stagger' | 'air' | 'down' | 'rise' | 'dead'

/** A blow as it reaches one soldier: which way it is thrown and how hard. */
export interface SoldierImpact {
  dirX: number
  dirZ: number
  knock: number
  lift: number
  damage: number
  kind: HitKind
  special: boolean
}

const TMP_TILT = new Quaternion()
const X = new Vector3(1, 0, 0)
const Y = new Vector3(0, 1, 0)

/**
 * One robot soldier: a wheeled body with a rigid-part skeleton.
 *
 * It has health (SOLDIER.health): a blow takes its damage off and the body
 * flinches into a hit pose (two, alternating blow by blow, so a combo
 * visibly rocks it back and forth), holds it a moment and recovers into its
 * stance; a blow that empties it destroys it. Blows that must not destroy
 * it (a special's, before its last) leave it `doomed` at zero instead: held
 * in its hit pose (or lying where it fell) until the last blow settles it.
 *
 * Motion is physical on its two wheel pairs: driving accelerates it along its
 * heading; left alone it coasts on the wheels (little friction) but skids
 * sideways across them (a lot), so a soldier knocked back while facing the
 * robot rolls away a long way, one knocked sideways stops short. A blow hard
 * enough throws it clear: it flies ballistically, tumbling about the axis
 * across the push, lands, and either catches itself (stagger) or goes down on
 * its back or face, slides, lies still for a moment and gets up. Pose springs
 * (lean, twist, side bend, head) take the blow's direction so the body snaps
 * away from it and settles.
 *
 * Behaviour (horde.ts) sets `goal` (where to go, what to face, how fast) and
 * starts attacks; the soldier does the rest and writes its bone rows for the
 * horde renderer.
 */
export class Soldier implements HordeInstance {
  readonly rig: SoldierRig
  readonly pose = createSoldierPose()
  readonly anim = new Float32Array(SOLDIER_CHANNEL_COUNT)
  private readonly target = new Float32Array(SOLDIER_CHANNEL_COUNT)
  get rows(): Float32Array { return this.rig.rows }
  heat = 0
  dissolve = 0
  lights = 1
  blade = 0
  distance = 0

  /** ground point (world x, z), height above the sand, velocities */
  x = 0
  z = 0
  y = 0
  vx = 0
  vz = 0
  vy = 0
  yaw = 0
  health: number = SOLDIER.health
  mode: SoldierMode = 'post'
  /** time in the current mode (s) */
  t = 0
  /** behaviour's wish: point to reach, heading to face there, speed; `drive` false lets it coast */
  readonly goal = { x: 0, z: 0, face: 0, speed: 0, drive: false, ready: false }
  /** the attack's blade landed this swing (horde checks the robot at that moment) */
  landed = false
  /** the sweep hits that already reached it (one per sweep) */
  lastSweep = -1
  /** spawn serial: debris and effects key off it */
  serial = 0
  /** its health ran out under blows that could not destroy it (a special's): held until the last one */
  doomed = false
  /** time since the last blow (s), the health bar's trailing chip (0..1) and how long it holds */
  hurt = 99
  chip = 1
  private chipHold = 0
  /** the hit pose this blow shows (alternates blow by blow) and how long it holds */
  private flinchPose = 0
  private flinchTime = 0
  /** behaviour's bookkeeping (horde.ts): its post, where it is on the post's beat, when it may swing next,
   * whether it is still rolling out of its spawn door, and the district it stands in */
  post = 0
  readonly beat = { k: -1, wait: 0, look: 0 }
  nextSwing = 0
  leaving = false
  sector = -1
  /** the rig's bones match the last update (posing is deferred to the soldiers that are drawn or hit) */
  private posed = false
  /** its parts once destroyed (kept with the soldier and reused) */
  debris: Debris | null = null
  private readonly tilt = new Quaternion()
  private tumbleX = 0
  private tumbleY = 0
  private downTime = 0
  private rising = new Quaternion()
  /** pose springs: value, velocity */
  private readonly spring = new Float32Array(8)
  private spin = 0
  private forwardSpeed = 0
  private wheelYaw = 0
  private accelLean = 0
  private readonly place = { x: 0, z: 0, y: 0, yaw: 0, tilt: this.tilt }
  private breathe = Math.random() * 10

  constructor(manifest: SoldierManifest) {
    this.rig = new SoldierRig(manifest)
    this.anim.set(POSES.guard)
  }

  /** Put a fresh soldier on the sand at (x, z) facing `yaw`. */
  reset(x: number, z: number, yaw: number, serial: number): void {
    this.x = x; this.z = z; this.y = 0
    this.vx = this.vz = this.vy = 0
    this.yaw = yaw
    this.health = SOLDIER.health
    this.mode = 'post'
    this.t = 0
    this.tilt.identity()
    this.tumbleX = this.tumbleY = 0
    this.spring.fill(0)
    this.anim.set(POSES.guard)
    this.heat = 0
    this.dissolve = 0
    this.lights = 1
    this.blade = 0
    this.landed = false
    this.lastSweep = -1
    this.serial = serial
    this.doomed = false
    this.hurt = 99
    this.chip = 1
    this.chipHold = 0
    this.flinchPose = 0
    this.flinchTime = 0
    this.post = 0
    this.beat.k = -1
    this.nextSwing = 0
    this.leaving = false
    this.sector = -1
    this.posed = false
    this.goal.x = x; this.goal.z = z; this.goal.face = yaw; this.goal.speed = 0; this.goal.drive = false; this.goal.ready = false
    this.place.x = x; this.place.z = z; this.place.y = 0; this.place.yaw = yaw
    writePose(this.anim, this.pose)
    this.refresh()
  }

  /** Health left, 0..1 (the bar). */
  get vitality(): number {
    return Math.max(0, this.health / SOLDIER.health)
  }

  get alive(): boolean {
    return this.mode !== 'dead'
  }

  /** Standing and able to act on the behaviour's wishes. */
  get free(): boolean {
    return !this.doomed && (this.mode === 'post' || this.mode === 'move')
  }

  /** Begin a slash (the horde decides when). */
  attack(): void {
    if (!this.free) return
    this.mode = 'attack'
    this.t = 0
    this.landed = false
  }

  /**
   * A blow reaches it. Returns true when it destroys the soldier. A blow
   * that may not destroy it (`hold`: a special's before its last) leaves it
   * doomed at zero instead; `settle` finishes it.
   */
  impact(hit: SoldierImpact, hold = false): boolean {
    if (!this.alive) return false
    // the bar's chip keeps what the health was before the blow, and holds a moment
    this.chip = Math.max(this.chip, this.vitality)
    this.health = Math.max(0, this.health - hit.damage)
    this.hurt = 0
    this.chipHold = SOLDIER.chipHold
    if (hit.kind === 'blast') this.heat = Math.max(this.heat, hit.special ? 0.7 : 0.3)
    this.vx += hit.dirX * hit.knock
    this.vz += hit.dirZ * hit.knock
    if (this.health <= 0) {
      if (!hold) return this.settle()
      this.doomed = true
    }
    // the push in the body frame: forward (+) / left (+)
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw)
    const along = hit.dirX * fx + hit.dirZ * fz
    const across = hit.dirX * fz - hit.dirZ * fx
    const s = this.spring
    const k = Math.min(1.6, (hit.knock + hit.lift) / 8)
    // the body snaps away from the blow: lean with the push, twist and bend across it
    s[1] += along * 260 * k
    s[3] += across * 300 * k
    s[5] += (Math.random() - 0.5) * 360 * k
    s[7] += along * 320 * k
    if (hit.lift > SOLDIER.launchLift || hit.knock > SOLDIER.launchKnock) {
      this.mode = 'air'
      this.t = 0
      this.vy = Math.max(this.vy, hit.lift + 1.2)
      this.y = Math.max(this.y, 0.05)
      // tumble so the head goes with the push, about the axis across it (body frame), about a
      // third of a turn over the flight: it comes down on its back (or face), not spun round
      const flight = (2 * this.vy) / SOLDIER.gravity
      const rate = Math.min(4, Math.max(1, (1.9 + hit.knock * 0.03) / Math.max(0.3, flight)))
      this.tumbleX = along * rate
      this.tumbleY = across * rate
    } else if (this.mode !== 'air' && this.mode !== 'down' && this.mode !== 'rise') {
      // the flinch: into the other hit pose from the last, held a moment by how hard it was
      this.mode = 'hit'
      this.t = 0
      this.flinchPose ^= 1
      const [lo, hi] = SOLDIER.flinch
      this.flinchTime = Math.min(hi, lo + (hit.knock + hit.damage * 0.02) * 0.012)
    }
    return false
  }

  /** Destroy it now if its health is gone (a doomed soldier, at a special's last blow); returns whether it was. */
  settle(): boolean {
    if (!this.alive || this.health > 0) return false
    this.refresh()
    this.mode = 'dead'
    this.doomed = false
    this.t = 0
    return true
  }

  /** Physics and animation for `dt`. */
  update(dt: number): void {
    this.t += dt
    this.hurt += dt
    // the bar's chip holds a moment after a blow, then drains to the health
    this.chipHold -= dt
    if (this.chipHold <= 0) this.chip = Math.max(this.vitality, this.chip - SOLDIER.chipDrain * dt)
    if (this.mode === 'dead') return
    const onGround = this.mode !== 'air'
    const g = this.goal
    const canDrive = onGround && (this.mode === 'post' || this.mode === 'move' || this.mode === 'attack')
    // steering wheels: close to its point it shuffles straight there (each foot turns its wheels)
    let steering = false
    let want = 0
    let heading = g.face
    if (canDrive && g.drive && this.mode !== 'attack') {
      const dx = g.x - this.x, dz = g.z - this.z
      const d = Math.hypot(dx, dz)
      if (d > 3.5) {
        // far: face the way it rolls
        heading = Math.atan2(dx, dz)
        want = Math.min(g.speed, d * 2.2) * Math.max(0, Math.cos(wrap(heading - this.yaw)))
      } else if (d > 0.15) {
        steering = true
        const v = Math.min(g.speed, d * 2.5)
        const k = Math.min(1, dt * 6)
        this.vx += ((dx / d) * v - this.vx) * k
        this.vz += ((dz / d) * v - this.vz) * k
      }
    }
    if (canDrive) {
      const turn = wrap(heading - this.yaw)
      const maxTurn = SOLDIER.turnRate * dt * (this.mode === 'attack' ? 0.35 : 1)
      this.yaw += Math.max(-maxTurn, Math.min(maxTurn, turn))
    }
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw)
    let fwd = this.vx * fx + this.vz * fz
    let side = this.vx * fz - this.vz * fx
    let accel = 0
    if (onGround) {
      if (canDrive && !steering && (g.drive || Math.abs(fwd) > 0.01) && want > 0) {
        accel = Math.max(-SOLDIER.accel, Math.min(SOLDIER.accel, (want - fwd) / Math.max(dt, 1e-3)))
        fwd += accel * dt
      } else if (!steering) {
        // wheels: coast along, or brake hard when knocked about; flat on the sand it just slides
        const along = this.mode === 'down' ? 6 : this.mode === 'stagger' || this.mode === 'hit' || this.mode === 'rise' ? SOLDIER.brake : SOLDIER.rollFriction
        fwd = towardZero(fwd, along * dt)
      }
      if (!steering) side = towardZero(side, (this.mode === 'down' ? 6 : SOLDIER.skidFriction) * dt)
      this.vx = fx * fwd + fz * side
      this.vz = fz * fwd - fx * side
    } else {
      this.vy -= SOLDIER.gravity * dt
      this.y += this.vy * dt
      TMP_TILT.setFromAxisAngle(X, this.tumbleX * dt)
      this.tilt.multiply(TMP_TILT)
      TMP_TILT.setFromAxisAngle(Y, this.tumbleY * dt)
      this.tilt.multiply(TMP_TILT)
      if (this.y <= 0 && this.vy < 0) this.land()
    }
    this.x += this.vx * dt
    this.z += this.vz * dt
    this.accelLean += (Math.max(-8, Math.min(8, accel)) * 1.4 - this.accelLean) * Math.min(1, dt * 5)
    const speed = Math.hypot(fwd, side)
    this.forwardSpeed = speed
    // wheels turn toward the way it moves (within their lock), and roll with it
    let rel = speed > 0.3 ? Math.atan2(side, fwd) : 0
    let dir = 1
    if (Math.abs(rel) > Math.PI / 2) { rel -= Math.sign(rel) * Math.PI; dir = -1 }
    rel = Math.max(-1.1, Math.min(1.1, rel))
    this.wheelYaw += (rel - this.wheelYaw) * Math.min(1, dt * 8)
    if (onGround) this.spin += ((dir * speed) / this.rig.dims.wheelRadius) * dt

    this.modes()
    this.animate(dt)
  }

  /** The body comes down: on its wheels if it is still upright enough, otherwise flat. */
  private land(): void {
    this.y = 0
    this.vy = 0
    this.tumbleX = this.tumbleY = 0
    const up = _v.set(0, 0, 1).applyQuaternion(this.tilt)
    if (up.z > 0.72) {
      // on its wheels: it catches itself (a doomed one stays flinched)
      this.mode = this.doomed ? 'hit' : 'stagger'
      this.t = -0.35
      this.tilt.identity()
    } else {
      // lie on the side it fell to: back (+y up) or face
      this.mode = 'down'
      this.t = 0
      this.downTime = SOLDIER.down[0] + Math.random() * (SOLDIER.down[1] - SOLDIER.down[0])
      const back = up.y > 0 ? 1 : -1
      this.tilt.setFromAxisAngle(X, -back * Math.PI * 0.49)
    }
  }

  private modes(): void {
    switch (this.mode) {
      case 'stagger':
        if (this.t >= 0) this.mode = this.doomed ? 'hit' : 'move'
        break
      case 'hit':
        // a doomed soldier holds its flinch until the special's last blow
        if (this.t >= this.flinchTime && !this.doomed) {
          this.mode = 'move'
          this.t = 0
        }
        break
      case 'attack':
        if (this.t >= SOLDIER.windup + SOLDIER.strike + SOLDIER.recover) {
          this.mode = 'move'
          this.t = 0
        }
        break
      case 'down':
        if (this.t >= this.downTime && !this.doomed) {
          this.mode = 'rise'
          this.t = 0
          this.rising.copy(this.tilt)
        }
        break
      case 'rise': {
        const u = Math.min(1, this.t / SOLDIER.rise)
        const e = u * u * (3 - 2 * u)
        this.tilt.slerpQuaternions(this.rising, _q.identity(), e)
        if (u >= 1) {
          this.mode = this.doomed ? 'hit' : 'move'
          this.t = 0
          this.tilt.identity()
        }
        break
      }
    }
  }

  /** Target pose by mode, eased; springs on top; into the rig. */
  private animate(dt: number): void {
    const T = this.target
    let rate = 7
    switch (this.mode) {
      case 'post':
      case 'move': {
        const speed = Math.abs(this.forwardSpeed)
        const run = Math.min(1, speed / SOLDIER.chargeSpeed)
        blend(T, this.goal.ready ? POSES.ready : POSES.guard, POSES.roll, Math.min(1, run * 1.4))
        break
      }
      case 'attack': {
        const t = this.t
        const w = SOLDIER.windup, s = SOLDIER.strike
        if (t < w) { T.set(POSES.windup); rate = 9 } else if (t < w + s) { T.set(POSES.strike); rate = 28 } else { T.set(POSES.ready); rate = 6 }
        break
      }
      case 'hit':
        // snapped into, held; recovery is the stance's own ease once it frees
        T.set(this.flinchPose ? POSES.hitLow : POSES.hitHigh)
        rate = this.t < 0.14 ? SOLDIER.flinchSnap : 10
        if (this.doomed) {
          // shaking in the hold
          T[SC.lean] += Math.sin(this.t * 31) * 2.5
          T[SC.headPitch] += Math.sin(this.t * 23 + 1) * 4
        }
        break
      case 'stagger':
        T.set(POSES.ready)
        rate = 5
        break
      case 'air':
        T.set(POSES.flung)
        rate = 6
        break
      case 'down':
        T.set(POSES.down)
        rate = 8
        break
      case 'rise': {
        const u = Math.min(1, this.t / SOLDIER.rise)
        blend(T, POSES.down, POSES.ready, u)
        rate = 10
        break
      }
    }
    approach(this.anim, T, rate, dt)
    // springs: lean (0,1), side (2,3), twist (4,5), head (6,7)
    const s = this.spring
    for (let i = 0; i < 8; i += 2) {
      const k = i === 6 ? 160 : 110, c = i === 6 ? 14 : 12
      s[i + 1] += (-k * s[i] - c * s[i + 1]) * dt
      s[i] += s[i + 1] * dt
    }
    this.breathe += dt
    const v = _anim
    v.set(this.anim)
    v[SC.lean] += s[0] + this.accelLean
    v[SC.side] += s[2]
    v[SC.twist] += s[4]
    v[SC.headPitch] += s[6] + Math.sin(this.breathe * 1.3) * 1.2
    v[SC.crouch] += Math.sin(this.breathe * 1.3) * 0.006
    const wy = (this.wheelYaw * 180) / Math.PI
    v[SC['R.yaw']] += wy
    v[SC['L.yaw']] += wy
    writePose(v, this.pose)
    this.pose.spin = this.spin
    this.blade += ((this.goal.ready || this.mode === 'attack' ? 1 : 0) - this.blade) * Math.min(1, dt * 6)
    this.heat = Math.max(0, this.heat - dt * 0.5)
    // lying: the pelvis near the sand
    const lie = 1 - _v.set(0, 0, 1).applyQuaternion(this.tilt).z
    const lying = Math.min(1, Math.max(0, lie)) * (this.rig.dims.hipZ - 0.38)
    this.place.x = this.x
    this.place.z = this.z
    this.place.y = this.y - lying
    this.place.yaw = this.yaw
    this.posed = false
  }

  /**
   * Bring the rig's bones up to the last update. Posing twenty bones is the
   * soldier's costliest step, so it runs only for soldiers drawn this frame
   * or read (a blow's sparks, a blade's reach, the break-up); a destroyed
   * soldier's bones belong to its debris.
   */
  refresh(): void {
    if (this.posed || this.mode === 'dead') return
    this.rig.pose(this.place, this.pose)
    this.posed = true
  }

  /** Where the blade's tip and emitter are (world), after the last pose. */
  bladeEnds(base: Vector3, tip: Vector3): void {
    this.refresh()
    const m = this.rig.world[this.rig.index.blade]
    base.setFromMatrixPosition(m)
    tip.set(0, 0, this.rig.dims.bladeLength).applyMatrix4(m)
  }
}

function towardZero(v: number, d: number): number {
  return v > 0 ? Math.max(0, v - d) : Math.min(0, v + d)
}

const _v = new Vector3()
const _q = new Quaternion()
const _anim = new Float32Array(SOLDIER_CHANNEL_COUNT)
