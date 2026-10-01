import { Quaternion, Vector3 } from 'three/webgpu'
import type { SoldierManifest, SoldierPiece } from '../../content/soldier/asset'
import type { HordeInstance } from '../../content/soldier/horde-renderer'
import { SoldierRig, createSoldierPose } from '../../content/soldier/rig'
import { POSES, SC, SOLDIER_CHANNEL_COUNT, approach, blend, writePose } from '../../content/soldier/poses'
import type { HitKind } from '../../content/transformer/combat/hits'
import { wrap } from '../math'
import type { Debris } from './debris'
import { enemyReacts } from '../combat/contract'

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
  /** within this of its point it shuffles there sideways on its steering wheels, facing where it is told (m), and how fast it takes up that motion (1/s); beyond it, it faces the way it rolls */
  shuffle: 3.5,
  shuffleGrip: 6,
  /** the slash: wind-up, strike and recovery, and where in it the blade lands */
  windup: 0.42,
  strike: 0.16,
  recover: 0.42,
  landsAt: 0.5,
  /** the share of a blow's push (knock, and lift short of a special's) its weight lets it take: 1 a soldier's (combat/contract.ts) */
  push: 1,
  /** thrown clear of the ground past this lift or knock (a special's blows: past a soldier's) */
  launchLift: 2.4,
  launchKnock: 11,
  gravity: 9.8,
  /** the pelvis's height off the sand lying on its back (m) */
  lie: 0.38,
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

/** A unit's tuning in the soldier's terms (SOLDIER, or the commander's). */
export type UnitTuning = { readonly [K in keyof typeof SOLDIER]: (typeof SOLDIER)[K] extends readonly [number, number] ? readonly [number, number] : number }

/** A unit's key poses on the soldier's channels (poses.ts). */
export type UnitPoses = { readonly [K in keyof typeof POSES]: Float32Array }

export type SoldierMode ='post' | 'move' | 'attack' | 'hit' | 'stagger' | 'air' | 'down' | 'rise' | 'dead'

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

/** A vacuum: the speed it draws at per metre from its centre (1/s, so a body arrives rather than overshoots), and how fast it takes hold (1/s) on the ground and in the air. */
const PULL_ARRIVE = 1.6
const PULL_GRIP = 7
const PULL_GRIP_AIR = 2.5
/**
 * Held in a vacuum's draw it seizes, as a flurry's blows rock it: thrown
 * between its two hit poses on this beat (s, jittered), each time jolted back
 * away from the draw as hard as a flurry's blow (the springs' strength), head
 * thrown up, straining against it; and it seizes on this long after the draw
 * lets go (s).
 */
const SEIZE_BEAT = 0.1
const SEIZE_JOLT = 0.19
const SEIZE_HOLD = 0.25

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
  protected readonly target = new Float32Array(SOLDIER_CHANNEL_COUNT)
  get rows(): Float32Array { return this.rig.rows }
  heat = 0
  dissolve = 0
  lights = 1
  blade = 0
  distance = 0

  /**
   * ground point (world x, z), height above the floor under it, velocities;
   * `floor` is that floor's height (the horde keeps it up to date as the
   * body moves), so a soldier stands, flies and lands over whichever level
   * it is on
   */
  x = 0
  z = 0
  y = 0
  floor = 0
  vx = 0
  vz = 0
  vy = 0
  yaw = 0
  health = 0
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
  protected chipHold = 0
  /** the hit pose this blow shows (alternates blow by blow) and how long it holds */
  protected flinchPose = 0
  protected flinchTime = 0
  /** seizing in a vacuum's draw: how long it goes on, the next jolt, the time since the last, and the way away from the draw */
  protected seize = 0
  protected seizeNext = 0
  protected seizeAge = 99
  protected seizeX = 0
  protected seizeZ = 0
  /** behaviour's bookkeeping (horde.ts): its post, where it is on the post's beat, when it may swing next,
   * whether it is still rolling out of its spawn door, and the district it stands in */
  post = 0
  readonly beat = { k: -1, wait: 0, look: 0 }
  nextSwing = 0
  leaving = false
  sector = -1
  /** the rig's bones match the last update (posing is deferred to the soldiers that are drawn or hit) */
  protected posed = false
  /** its parts once destroyed (kept with the soldier and reused) */
  debris: Debris | null = null
  protected readonly tilt = new Quaternion()
  protected tumbleX = 0
  protected tumbleY = 0
  protected downTime = 0
  protected rising = new Quaternion()
  /** pose springs: value, velocity */
  protected readonly spring = new Float32Array(8)
  protected spin = 0
  protected forwardSpeed = 0
  protected wheelYaw = 0
  protected accelLean = 0
  protected readonly place = { x: 0, z: 0, y: 0, yaw: 0, tilt: this.tilt }
  protected breathe = Math.random() * 10

  /** its parts as rigid boxes, for the break-up (debris.ts) */
  readonly pieces: readonly SoldierPiece[]
  /** its tuning and key poses (the soldier's, or a bigger unit's in the same body plan) */
  protected readonly tune: UnitTuning
  protected readonly poses: UnitPoses

  constructor(manifest: SoldierManifest, rig: SoldierRig = new SoldierRig(manifest), tune: UnitTuning = SOLDIER, poses: UnitPoses = POSES) {
    this.rig = rig
    this.pieces = manifest.pieces
    this.tune = tune
    this.poses = poses
    this.health = tune.health
    this.anim.set(this.poses.guard)
  }

  /** Put a fresh soldier on the floor (at height `floor`) at (x, z) facing `yaw`. */
  reset(x: number, z: number, yaw: number, serial: number, floor = 0): void {
    this.x = x; this.z = z; this.y = 0; this.floor = floor
    this.vx = this.vz = this.vy = 0
    this.yaw = yaw
    this.health = this.tune.health
    this.mode = 'post'
    this.t = 0
    this.tilt.identity()
    this.tumbleX = this.tumbleY = 0
    this.spring.fill(0)
    this.anim.set(this.poses.guard)
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
    this.seize = 0
    this.seizeNext = 0
    this.seizeAge = 99
    this.post = 0
    this.beat.k = -1
    this.nextSwing = 0
    this.leaving = false
    this.sector = -1
    this.posed = false
    this.goal.x = x; this.goal.z = z; this.goal.face = yaw; this.goal.speed = 0; this.goal.drive = false; this.goal.ready = false
    this.place.x = x; this.place.z = z; this.place.y = floor; this.place.yaw = yaw
    writePose(this.anim, this.pose)
    this.refresh()
  }

  /** Health left, 0..1 (the bar). */
  get vitality(): number {
    return Math.max(0, this.health / this.tune.health)
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
  impact(blow: SoldierImpact, hold = false): boolean {
    if (!this.alive) return false
    const hit = this.weigh(blow)
    // the bar's chip keeps what the health was before the blow, and holds a moment
    this.chip = Math.max(this.chip, this.vitality)
    this.health = Math.max(0, this.health - hit.damage)
    this.hurt = 0
    this.chipHold = this.tune.chipHold
    if (hit.kind === 'blast') this.heat = Math.max(this.heat, hit.special ? 0.7 : 0.3)
    this.vx += hit.dirX * hit.knock
    this.vz += hit.dirZ * hit.knock
    if (this.health <= 0) {
      if (!hold) return this.settle()
      this.doomed = true
    }
    const k = Math.min(1.6, (hit.knock + hit.lift) / 8)
    const [along, across] = this.jolt(hit.dirX, hit.dirZ, k)
    // the combat contract: mid-combo only a special's blow interrupts (its health and springs still take it)
    if (!enemyReacts(this.inCombo, hit.special)) return false
    if (this.launches(hit)) {
      this.mode = 'air'
      this.t = 0
      this.vy = Math.max(this.vy, hit.lift + 1.2)
      this.y = Math.max(this.y, 0.05)
      // tumble so the head goes with the push, about the axis across it (body frame), about a
      // third of a turn over the flight: it comes down on its back (or face), not spun round
      const flight = (2 * this.vy) / this.tune.gravity
      const rate = Math.min(4, Math.max(1, (1.9 + hit.knock * 0.03) / Math.max(0.3, flight)))
      this.tumbleX = along * rate
      this.tumbleY = across * rate
    } else if (this.mode !== 'air' && this.mode !== 'down' && this.mode !== 'rise') {
      // the flinch: into the other hit pose from the last, held a moment by how hard it was
      this.mode = 'hit'
      this.t = 0
      this.flinchPose ^= 1
      const [lo, hi] = this.tune.flinch
      this.flinchTime = Math.min(hi, lo + (hit.knock + hit.damage * 0.02) * 0.012)
    }
    return false
  }

  /** Whether a (weighed) blow throws it clear of the ground: past its launch lift or knock, or a special's past a soldier's. */
  protected launches(hit: SoldierImpact): boolean {
    const t = hit.special ? SOLDIER : this.tune
    return hit.lift > t.launchLift || hit.knock > t.launchKnock
  }

  /**
   * A blow as its weight takes it (the combat contract): a heavier unit is
   * pushed (knocked back, lifted) by its share, a special's lift whole, so a
   * special throws every enemy alike. A soldier takes the blow as it is.
   */
  private weigh(hit: SoldierImpact): SoldierImpact {
    const share = this.tune.push
    if (share === 1) return hit
    const w = this.weighed
    w.dirX = hit.dirX; w.dirZ = hit.dirZ; w.damage = hit.damage; w.kind = hit.kind; w.special = hit.special
    w.knock = hit.knock * share
    w.lift = hit.special ? hit.lift : hit.lift * share
    return w
  }

  private readonly weighed: SoldierImpact = { dirX: 0, dirZ: 0, knock: 0, lift: 0, damage: 0, kind: 'blunt', special: false }

  /** In the middle of a combo, which only a special's blow or vacuum interrupts (combat/contract.ts); a soldier's slash is not one. */
  get inCombo(): boolean {
    return false
  }

  /**
   * The body snaps away from a push (world direction, unit) of strength `k`:
   * it leans with the push, twists and bends across it, the head thrown with
   * it. Returns the push in the body frame: forward (+), left (+).
   */
  protected jolt(dirX: number, dirZ: number, k: number): [number, number] {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw)
    const along = dirX * fx + dirZ * fz
    const across = dirX * fz - dirZ * fx
    const s = this.spring
    s[1] += along * 260 * k
    s[3] += across * 300 * k
    s[5] += (Math.random() - 0.5) * 360 * k
    s[7] += along * 320 * k
    _push[0] = along
    _push[1] = across
    return _push
  }

  /**
   * A vacuum draws it toward (x, z) at up to `speed` m/s for `dt`: on the
   * ground it loses its footing and slides in on its wheels, staggering
   * (it cannot drive against it) and seizing (SEIZE_BEAT), easing to a stop
   * as it arrives rather than overshooting; in the air it drifts that way as
   * it falls.
   */
  pull(x: number, z: number, speed: number, dt: number): void {
    if (!this.alive) return
    const dx = x - this.x, dz = z - this.z
    const d = Math.hypot(dx, dz)
    if (d < 1e-3) return
    const want = Math.min(speed, d * PULL_ARRIVE)
    const k = Math.min(1, dt * (this.mode === 'air' ? PULL_GRIP_AIR : PULL_GRIP))
    this.vx += ((dx / d) * want - this.vx) * k
    this.vz += ((dz / d) * want - this.vz) * k
    if (this.mode === 'post' || this.mode === 'move' || this.mode === 'attack' || this.mode === 'stagger') {
      this.mode = 'stagger'
      this.t = -0.3
    }
    this.seize = SEIZE_HOLD
    this.seizeX = -dx / d
    this.seizeZ = -dz / d
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
    if (this.chipHold <= 0) this.chip = Math.max(this.vitality, this.chip - this.tune.chipDrain * dt)
    if (this.mode === 'dead') return
    const onGround = this.mode !== 'air'
    const accel = onGround && this.rootMotion?.(dt) ? 0 : this.drive(dt, onGround)
    this.x += this.vx * dt
    this.z += this.vz * dt
    this.accelLean += (Math.max(-8, Math.min(8, accel)) * 1.4 - this.accelLean) * Math.min(1, dt * 5)
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw)
    const fwd = this.vx * fx + this.vz * fz
    const side = this.vx * fz - this.vz * fx
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
    this.seizing(dt)
    this.animate(dt)
  }

  /**
   * A move's own root motion (a subclass's attack carries the body itself):
   * sets the velocity and heading for this step and returns true, or false
   * to leave the body to its wheels.
   */
  protected rootMotion?(dt: number): boolean

  /** The wheels and the air for `dt`: steering toward the behaviour's goal, coasting, braking, flight. Returns the drive's acceleration. */
  protected drive(dt: number, onGround: boolean): number {
    const g = this.goal
    const canDrive = onGround && (this.mode === 'post' || this.mode === 'move' || this.mode === 'attack')
    // steering wheels: close to its point it shuffles straight there (each foot turns its wheels)
    let steering = false
    let want = 0
    let heading = g.face
    if (canDrive && g.drive && this.mode !== 'attack') {
      const dx = g.x - this.x, dz = g.z - this.z
      const d = Math.hypot(dx, dz)
      if (d > this.tune.shuffle) {
        // far: face the way it rolls
        heading = Math.atan2(dx, dz)
        want = Math.min(g.speed, d * 2.2) * Math.max(0, Math.cos(wrap(heading - this.yaw)))
      } else if (d > 0.15) {
        steering = true
        const v = Math.min(g.speed, d * 2.5)
        const k = Math.min(1, dt * this.tune.shuffleGrip)
        this.vx += ((dx / d) * v - this.vx) * k
        this.vz += ((dz / d) * v - this.vz) * k
      }
    }
    if (canDrive) {
      const turn = wrap(heading - this.yaw)
      const maxTurn = this.tune.turnRate * dt * (this.mode === 'attack' ? 0.35 : 1)
      this.yaw += Math.max(-maxTurn, Math.min(maxTurn, turn))
    }
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw)
    let fwd = this.vx * fx + this.vz * fz
    let side = this.vx * fz - this.vz * fx
    let accel = 0
    if (onGround) {
      if (canDrive && !steering && (g.drive || Math.abs(fwd) > 0.01) && want > 0) {
        accel = Math.max(-this.tune.accel, Math.min(this.tune.accel, (want - fwd) / Math.max(dt, 1e-3)))
        fwd += accel * dt
      } else if (!steering) {
        // wheels: coast along, or brake hard when knocked about; flat on the sand it just slides
        const along = this.mode === 'down' ? 6 : this.mode === 'stagger' || this.mode === 'hit' || this.mode === 'rise' ? this.tune.brake : this.tune.rollFriction
        fwd = towardZero(fwd, along * dt)
      }
      if (!steering) side = towardZero(side, (this.mode === 'down' ? 6 : this.tune.skidFriction) * dt)
      this.vx = fx * fwd + fz * side
      this.vz = fz * fwd - fx * side
    } else {
      this.vy -= this.tune.gravity * dt
      this.y += this.vy * dt
      TMP_TILT.setFromAxisAngle(X, this.tumbleX * dt)
      this.tilt.multiply(TMP_TILT)
      TMP_TILT.setFromAxisAngle(Y, this.tumbleY * dt)
      this.tilt.multiply(TMP_TILT)
      if (this.y <= 0 && this.vy < 0) this.land()
    }
    return accel
  }

  /** In a vacuum's draw: jolted back between its hit poses, beat by beat. */
  protected seizing(dt: number): void {
    if (this.seize <= 0) return
    this.seize -= dt
    this.seizeAge += dt
    this.seizeNext -= dt
    if (this.seizeNext > 0 || (this.mode !== 'stagger' && this.mode !== 'hit')) return
    this.seizeNext = SEIZE_BEAT * (0.8 + 0.4 * Math.random())
    this.seizeAge = 0
    this.flinchPose ^= 1
    this.jolt(this.seizeX, this.seizeZ, SEIZE_JOLT)
  }

  /** The body comes down: on its wheels if it is still upright enough, otherwise flat. */
  protected land(): void {
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
      this.downTime = this.tune.down[0] + Math.random() * (this.tune.down[1] - this.tune.down[0])
      const back = up.y > 0 ? 1 : -1
      this.tilt.setFromAxisAngle(X, -back * Math.PI * 0.49)
    }
  }

  protected modes(): void {
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
        if (this.t >= this.tune.windup + this.tune.strike + this.tune.recover) {
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
        const u = Math.min(1, this.t / this.tune.rise)
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
  protected animate(dt: number): void {
    const T = this.target
    const rate = this.poseTarget(T)
    if (rate > 0) approach(this.anim, T, rate, dt)
    else this.anim.set(T)
    this.finishPose(dt)
  }

  /** The pose the body eases toward in its mode, into `T`; returns how fast (1/s), or 0 to take it exactly. */
  protected poseTarget(T: Float32Array): number {
    let rate = 7
    switch (this.mode) {
      case 'post':
      case 'move': {
        const speed = Math.abs(this.forwardSpeed)
        const run = Math.min(1, speed / this.tune.chargeSpeed)
        blend(T, this.goal.ready ? this.poses.ready : this.poses.guard, this.poses.roll, Math.min(1, run * 1.4))
        break
      }
      case 'attack': {
        const t = this.t
        const w = this.tune.windup, s = this.tune.strike
        if (t < w) { T.set(this.poses.windup); rate = 9 } else if (t < w + s) { T.set(this.poses.strike); rate = 28 } else { T.set(this.poses.ready); rate = 6 }
        break
      }
      case 'hit':
        // snapped into, held; recovery is the stance's own ease once it frees
        T.set(this.flinchPose ? this.poses.hitLow : this.poses.hitHigh)
        rate = Math.min(this.t, this.seize > 0 ? this.seizeAge : 99) < 0.14 ? this.tune.flinchSnap : 10
        if (this.doomed || this.seize > 0) {
          // shaking in the hold
          T[SC.lean] += Math.sin(this.t * 31) * 2.5
          T[SC.headPitch] += Math.sin(this.t * 23 + 1) * 4
        }
        break
      case 'stagger':
        if (this.seize > 0) {
          // seizing in a vacuum's draw: thrown between the hit poses as a flurry's blows throw it, shaking
          T.set(this.flinchPose ? this.poses.hitLow : this.poses.hitHigh)
          rate = this.seizeAge < 0.14 ? this.tune.flinchSnap : 10
          T[SC.lean] += Math.sin(this.t * 31) * 2.5
          T[SC.headPitch] += Math.sin(this.t * 23 + 1) * 4
        } else {
          T.set(this.poses.ready)
          rate = 5
        }
        break
      case 'air':
        T.set(this.poses.flung)
        rate = 6
        break
      case 'down':
        T.set(this.poses.down)
        rate = 8
        break
      case 'rise': {
        const u = Math.min(1, this.t / this.tune.rise)
        blend(T, this.poses.down, this.poses.ready, u)
        rate = 10
        break
      }
    }
    return rate
  }

  /** Springs and breath on top of the eased pose, into the rig's pose; the blade and the placement. */
  protected finishPose(dt: number): void {
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
    this.blade += (this.bladeTarget() - this.blade) * Math.min(1, dt * 6)
    this.heat = Math.max(0, this.heat - dt * 0.5)
    // lying: the pelvis near the floor
    const lie = 1 - _v.set(0, 0, 1).applyQuaternion(this.tilt).z
    const lying = Math.min(1, Math.max(0, lie)) * (this.rig.dims.hipZ - this.tune.lie)
    this.place.x = this.x
    this.place.z = this.z
    this.place.y = this.floor + this.y - lying
    this.place.yaw = this.yaw
    this.posed = false
  }

  /** How lit the blade wants to be (0..1). */
  protected bladeTarget(): number {
    return this.goal.ready || this.mode === 'attack' ? 1 : 0
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
const _push: [number, number] = [0, 0]
