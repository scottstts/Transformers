import { Vector3, type PerspectiveCamera } from 'three/webgpu'
import type { TransformerModel } from '../../content/transformer/model/transformer'
import type { CharacterCombat, CombatCamera, CombatFrame } from '../../content/transformer/combat/effects'
import type { CombatMove, MoveCue } from '../../content/transformer/combat/moves'
import type { SpecialMove } from '../../content/transformer/combat/special'
import type { HitEvent, MoveHits } from '../../content/transformer/combat/hits'
import { MovePlayer } from '../../content/transformer/combat/player'
import { FootPlanner } from '../../content/transformer/combat/feet'
import { Curve } from '../../content/transformer/combat/curves'
import { toePivot } from '../../content/transformer/combat/overlay'
import { CH, LEG, SIDES, type Side } from '../../content/transformer/combat/pose'
import type { MotionState } from '../types'
import { ComboController, type ComboEvent } from './combo'
import { wrap } from '../math'

/** The fight takes the pose over this fast from the gait (s), and hands it back this fast at the end. */
const ENTRY = 0.12
const EXIT = 0.22
/** Movement taking the robot back from the fight: the pose hands back to the gait this fast (s). */
const RELEASE = 0.24
/** Aim assist: cones (rad) round a steered heading and round the robot's own facing, and its range (m). */
const ASSIST_STEERED = 0.55
const ASSIST_FACING = 1.0
const ASSIST_RANGE = 8
/** A move turning the robot more than this (rad) pivots its feet into the new heading, over these times (s). */
const PIVOT_TURN = 0.35
const PIVOT_STEP: readonly [number, number] = [0.12, 0.17]
/** Recovery: channels settle by this share of it; feet off their stance by more than this step back (m, rad). */
const SETTLE_SHARE = 0.72
const STANCE_SLACK = 0.07
const STANCE_TURN = 0.17

/**
 * The robot's fighting, around the session: clicks drive the combo
 * (combo.ts), each move plays on the pose channels (MovePlayer) from where the
 * last left off, the feet step and plant on the ground (FootPlanner), and the
 * move's root motion carries the robot: its standing point and heading are
 * written into the motion state each frame, so walking resumes from wherever
 * the fight left it.
 *
 * Each move is aimed where the player steers (the movement keys or stick,
 * camera-relative, held as the move starts), else where the robot faces, and
 * turned onto the nearest soldier near that line (aim assist). A move may turn
 * the robot all the way round: the root turns in its first moments and the
 * feet pivot into the new heading. Movement takes the robot back from the
 * fight (`release`) once the combo allows it (combo.ts `cancellable`): the
 * pose hands back to the gait at once and walking resumes.
 *
 * The pose reaches the rig through the character's overlay, blended with the
 * gait by a weight that eases in at the first move and out as the recovery
 * settles into the stance.
 *
 * The special plays on the same machinery: it takes over from whatever the
 * fight (or the stance) left, as one long move, and hands back to the usual
 * recovery. While it plays it is a cutscene (`cinematic`): the combo is held,
 * its `tempo` slows the world's clock and the director films it in its ground
 * frame (`groundOrigin`, `groundHeading`).
 */
export class RobotCombat {
  readonly combat: CharacterCombat
  private readonly model: TransformerModel
  private readonly robotOffset: number
  private readonly combo: ComboController
  private readonly player = new MovePlayer()
  private readonly feet = new FootPlanner()
  private readonly moves: readonly CombatMove[]
  private readonly releaseCues: readonly MoveCue[]
  private readonly frame: CombatFrame
  /** move ground frame: origin (the robot's standing point) and heading */
  private readonly origin = new Vector3()
  private heading = 0
  /** the special playing, or null */
  private special: SpecialMove | null = null
  private readonly tempoCurve = new Curve(33)
  /** the current combo move's blow has landed */
  private struck = false
  /** a combo move's blow lands (it charges the special) */
  onStrike: ((move: number) => void) | null = null
  /** turns a move's aim (rad) from the standing point (x, z) toward something to hit within `range` m and `cone` rad, if anything is there */
  aimAssist: ((x: number, z: number, heading: number, range: number, cone: number) => number) | null = null
  /** a blow, sweep or blast of the current move reaches the world (hits.ts) */
  onHit: ((hit: HitEvent) => void) | null = null
  /** the current move's hits and how far through them the move is */
  private hits: MoveHits | null = null
  private nextStrike = 0
  private nextBlast = 0
  private sweepBase = 0
  private sweepSerial = 0
  private readonly lastDesired = new Vector3()
  /** the heading the player steers toward (camera-relative input), if any */
  private steerYaw = 0
  private steering = false
  /** released to movement: the pose is handing back to the gait, the fight no longer owns the robot */
  private loose = false
  private readonly hit: HitEvent = { shape: 'sector', kind: 'blunt', x: 0, z: 0, heading: 0, reach: 0, arc: 0, damage: 0, knock: 0, lift: 0, motion: 0, sweep: -1, radial: false, special: false }
  /** the guard is held (the input), and the guard pose is up */
  private guardHeld = false
  private guarding = false
  private nextStep = 0
  private weight = 0
  private exiting = false
  private readonly desired = new Vector3()
  /** this frame's motion state and camera, for the callbacks below (bound once: no per-frame closures) */
  private frameState: MotionState
  private frameCamera: PerspectiveCamera | null = null
  private readonly onComboEvent = (event: ComboEvent): void => this.onCombo(event, this.frameState, this.frameCamera as PerspectiveCamera)
  private readonly onMoveCue = (cue: MoveCue): void => this.combat.effects.cue(cue, this.frame)
  private readonly onLand = (side: Side, skid: boolean): void => this.combat.effects.step(side, skid ? 0.6 : 1, skid)

  constructor(combat: CharacterCombat, model: TransformerModel, robotOffset: number, state: MotionState, camera: CombatCamera) {
    this.combat = combat
    this.model = model
    this.robotOffset = robotOffset
    this.moves = combat.moveset.moves
    // Finish dissolving before movement removes the combat overlay entirely.
    this.releaseCues = (combat.moveset.recoverCues ?? []).map((cue) => cue.cue === 'weapon-out' ? { ...cue, value: 0.18 } : cue)
    const recover = combat.moveset.recover
    this.combo = new ComboController(this.moves, recover)
    this.frame = { weight: 0, values: this.player.values, move: -1, time: 0, state, camera }
    this.frameState = state
    this.player.reset(combat.overlay.neutral)
  }

  /** The fight owns the robot (movement, jumps and transforming wait). */
  get active(): boolean {
    return this.combo.active || this.special !== null || (this.weight > 0 && !this.loose) || this.guarding
  }

  /** The direction the player steers (world x, z; camera-relative input), or null; aims the next move. */
  setSteer(dir: { x: number; z: number } | null): void {
    this.steering = dir !== null && Math.hypot(dir.x, dir.z) > 1e-3
    if (dir && this.steering) this.steerYaw = Math.atan2(dir.x, dir.z)
  }

  /** Movement may take the robot back from the fight now (a recovery, or a move whose window has passed its strike). */
  get releasable(): boolean {
    return !this.special && !this.guarding && !this.guardHeld && !this.loose && this.combo.cancellable
  }

  /**
   * Movement takes the robot back: combo progress is remembered, the pose hands back to the
   * gait over RELEASE and the fight gives up the robot at once (the weapon
   * goes away as in a recovery). A prompt attack resumes at the next move.
   */
  release(): void {
    if (!this.releasable) return
    const turn = this.heading - this.frameState.yaw
    this.frameState.speed = Math.max(0, this.player.velocity(CH.advance) * Math.cos(turn) - this.player.velocity(CH.strafe) * Math.sin(turn))
    this.combo.release()
    this.queued.length = 0
    this.hits = null
    this.loose = true
    this.exiting = true
    this.player.settle(this.combat.overlay.neutral, this.combat.moveset.recover * SETTLE_SHARE, this.releaseCues, this.player.current?.recovery)
  }

  /** The guard pose is up: enemy blows land on the shield. */
  get guarded(): boolean {
    return this.guarding
  }

  /**
   * Hold or release the guard. It rises whenever no move is playing (a combo's
   * recovery gives way to it) or a move could be cut short (`releasable`), and
   * holds while held; releasing it recovers into the stance. A click from the
   * guard starts the combo from the guard pose.
   */
  setGuard(held: boolean): void {
    this.guardHeld = held
  }

  /** The special is playing: a cutscene, no input. */
  get cinematic(): boolean {
    return this.special !== null
  }

  /** The world's clock rate the special asks for (1 outside it). */
  get tempo(): number {
    return this.special ? Math.max(0.01, this.tempoCurve.at(this.player.time)) : 1
  }

  /** Time into the special (s), or -1. */
  get specialTime(): number {
    return this.special ? this.player.time : -1
  }

  /** The current move's ground frame: its origin on the sand and its heading. */
  get groundOrigin(): Vector3 {
    return this.origin
  }

  get groundHeading(): number {
    return this.heading
  }

  /** The fight's share of the pose. */
  get poseWeight(): number {
    return this.weight
  }

  /** Height of the lowest foot the fight lifts the robot to (m). */
  get air(): number {
    return this.player.values[CH.air]
  }

  press(): void {
    this.combo.press()
  }

  /**
   * Play the special now, from whatever the fight is doing (or from the
   * stance), aimed toward the camera's heading as a first move is.
   */
  startSpecial(state: MotionState, camera: PerspectiveCamera): SpecialMove {
    const special = this.combat.special
    this.frameState = state
    this.frameCamera = camera
    if (this.weight === 0) {
      this.player.reset(this.combat.overlay.neutral)
      this.combat.effects.begin()
    }
    if (this.weight === 0 || this.loose) this.plantFeet()
    this.combo.cancel()
    this.queued.length = 0
    this.exiting = false
    this.loose = false
    this.endGuard()
    this.special = special
    this.tempoCurve.set(1, special.tempo)
    this.beginMove(special.move, state, camera, true)
    this.hits = this.combat.hits.special
    this.combat.effects.beginSpecial()
    return special
  }

  /** Drop the fight at once and hand the pose back (the robot leaves the stance, or the character is swapped out). */
  cancel(): void {
    this.special = null
    this.hits = null
    if (this.guarding) this.combat.effects.guard(false)
    this.guarding = false
    this.combo.cancel()
    this.weight = 0
    this.exiting = false
    this.loose = false
    this.combat.overlay.weight = 0
    this.model.overlay = null
    this.combat.effects.reset()
  }

  update(dt: number, state: MotionState, camera: PerspectiveCamera): void {
    this.frameState = state
    this.frameCamera = camera
    if (!this.special) this.combo.update(dt, this.onComboEvent)
    this.updateGuard(state, camera)
    if (!this.combo.active && !this.special && this.weight === 0 && !this.guarding) {
      this.loose = false
      this.combat.effects.ambient(dt, state.yaw)
      return
    }
    if (this.loose) {
      this.updateLoose(dt)
      return
    }

    this.player.update(dt, this.onMoveCue)
    if (!this.special && this.combo.phase === 'move' && !this.struck) {
      const strike = this.moves[this.combo.move].strike
      if (strike !== undefined && this.player.time >= strike) {
        this.struck = true
        this.onStrike?.(this.combo.move)
      }
    }
    this.spawnSteps()
    this.feet.update(dt, this.onLand)
    if (this.special && this.player.time >= this.special.move.duration) {
      this.special = null
      this.combo.recover(this.onComboEvent)
    }
    const owning = this.combo.active || this.special !== null || this.guarding

    // weight: in over the first moments, out as the recovery settles
    if (this.combo.phase === 'recover' && this.combo.time > this.combat.moveset.recover - EXIT) this.exiting = true
    if (this.combo.phase === 'move' || this.special) this.exiting = false
    this.weight = this.exiting || !owning ? Math.max(0, this.weight - dt / EXIT) : Math.min(1, this.weight + dt / ENTRY)
    this.combat.overlay.weight = smooth(this.weight)
    this.model.overlay = this.weight > 0 ? this.combat.overlay : null

    this.combat.overlay.pose.v.set(this.player.values)
    this.applyRoot(state)
    this.poseFeet(state, dt)
    this.emitHits(state, dt)

    const f = this.frame
    f.weight = this.combat.overlay.weight
    f.move = this.special ? this.moves.length : this.combo.phase === 'move' ? this.combo.move : -1
    f.time = this.special ? this.player.time : this.combo.time
    this.combat.effects.update(dt, f)
    if (this.weight === 0 && !owning) this.combat.effects.end()
  }

  /** Released: the pose settles and hands back to the gait; the robot is the gait's to move. */
  private updateLoose(dt: number): void {
    this.player.update(dt, this.onMoveCue)
    this.weight = Math.max(0, this.weight - dt / RELEASE)
    this.combat.overlay.weight = smooth(this.weight)
    this.model.overlay = this.weight > 0 ? this.combat.overlay : null
    this.combat.overlay.pose.v.set(this.player.values)
    // the feet go with the body: planted where they were, the gait's own share grows as the weight falls
    this.feet.update(dt, this.onLand)
    const f = this.frame
    f.weight = this.combat.overlay.weight
    f.move = -1
    f.time = this.combo.time
    this.combat.effects.update(dt, f)
    if (this.weight === 0) {
      this.loose = false
      this.combat.effects.end()
    }
  }

  /** After the scenery pushed the robot: the ground frame moves with it (the feet keep their offsets). */
  afterCollisions(state: MotionState): void {
    if (!this.active || this.loose) return
    const fx = Math.sin(state.yaw), fz = Math.cos(state.yaw)
    const px = state.pos.x + fx * this.robotOffset
    const pz = state.pos.z + fz * this.robotOffset
    this.origin.x += px - this.desired.x
    this.origin.z += pz - this.desired.z
  }

  private onCombo(event: ComboEvent, state: MotionState, camera: PerspectiveCamera): void {
    const effects = this.combat.effects
    if (event.type === 'start') {
      this.endGuard()
      const first = this.weight === 0
      if (first) {
        this.player.reset(this.combat.overlay.neutral)
        effects.begin()
      }
      // from the stance, or from walking away after a release: the feet are where the model shows them
      if (first || this.loose) this.plantFeet()
      this.beginMove(this.moves[event.move], state, camera, true)
      this.hits = this.combat.hits.moves[event.move] ?? null
      effects.moveStart(event.move, this.frame.camera)
    } else if (event.type === 'recover') {
      this.hits = null
      this.setGround(state, state.yaw)
      this.player.settle(this.combat.overlay.neutral, this.combat.moveset.recover * SETTLE_SHARE, this.combat.moveset.recoverCues, this.player.current?.recovery)
      this.recoverFeet(state)
    }
  }

  /**
   * Start `move` from the current pose. An aimed move turns toward where the
   * player steers (else the way the robot faces), then onto the nearest
   * soldier near that line; a turn past PIVOT_TURN pivots the feet into it.
   */
  private beginMove(move: CombatMove, state: MotionState, _camera: PerspectiveCamera, aimed: boolean): void {
    const fromGait = this.loose || this.weight === 0
    const fromHeading = fromGait ? state.yaw : this.heading
    const forwardVelocity = fromGait ? state.speed : this.player.velocity(CH.advance)
    const lateralVelocity = fromGait ? 0 : this.player.velocity(CH.strafe)
    let heading = state.yaw
    if (aimed) {
      const steered = this.steering
      heading = steered ? this.steerYaw : state.yaw
      if (this.aimAssist) {
        const x = state.pos.x + Math.sin(state.yaw) * this.robotOffset
        const z = state.pos.z + Math.cos(state.yaw) * this.robotOffset
        heading = this.aimAssist(x, z, heading, ASSIST_RANGE, steered ? ASSIST_STEERED : ASSIST_FACING)
      }
      heading = state.yaw + wrap(heading - state.yaw)
    }
    this.loose = false
    this.setGround(state, heading)
    if (Math.abs(heading - state.yaw) > PIVOT_TURN) this.pivotFeet()
    const v = this.player.values
    v[CH.advance] = 0
    v[CH.strafe] = 0
    v[CH.turn] = (state.yaw - heading) * 180 / Math.PI
    // Re-express momentum in the new ground frame before the bounded curves
    // take it up. Turning into an opposing attack brakes rather than backslides.
    const turn = fromHeading - heading
    this.player.start(move, this.combat.overlay.neutral,
      forwardVelocity * Math.cos(turn) - lateralVelocity * Math.sin(turn),
      forwardVelocity * Math.sin(turn) + lateralVelocity * Math.cos(turn))
    this.nextStep = 0
    this.struck = false
    this.hits = null
    this.nextStrike = 0
    this.nextBlast = 0
    this.sweepBase = this.sweepSerial
    this.sweepSerial += 16
    this.lastDesired.set(NaN, 0, 0)
  }

  /** Raise the guard when it is held and nothing else plays; lower it when released. */
  private updateGuard(state: MotionState, camera: PerspectiveCamera): void {
    // it rises in a recovery, or cuts a move short once movement could (its window open, no click waiting)
    if (this.guardHeld && !this.guarding && !this.special && (this.combo.phase !== 'move' || this.combo.cancellable)) {
      if (this.weight === 0) {
        this.player.reset(this.combat.overlay.neutral)
        this.combat.effects.begin()
      }
      if (this.weight === 0 || this.loose) this.plantFeet()
      this.combo.cancel()
      this.queued.length = 0
      this.exiting = false
      this.loose = false
      this.guarding = true
      this.beginMove(this.combat.guard, state, camera, false)
      this.combat.effects.guard(true)
    } else if (!this.guardHeld && this.guarding) {
      this.endGuard()
      this.combo.recover(this.onComboEvent)
    }
  }

  private endGuard(): void {
    if (!this.guarding) return
    this.guarding = false
    this.combat.effects.guard(false)
  }

  /** The current move's strikes and blasts whose time has come, and its sweeps while they run. */
  private emitHits(state: MotionState, dt: number): void {
    const hits = this.hits
    const sink = this.onHit
    const d = this.desired
    const motion = Number.isNaN(this.lastDesired.x) || dt <= 0 ? 0 : Math.hypot(d.x - this.lastDesired.x, d.z - this.lastDesired.z) / dt
    this.lastDesired.copy(d)
    if (!hits || !sink) return
    const t = this.player.time
    const e = this.hit
    e.special = this.special !== null
    const strikes = hits.strikes
    while (strikes && this.nextStrike < strikes.length && strikes[this.nextStrike].t <= t) {
      const s = strikes[this.nextStrike++]
      e.shape = 'sector'; e.kind = s.kind; e.x = d.x; e.z = d.z
      e.heading = state.yaw + ((s.aim ?? 0) * Math.PI) / 180
      e.reach = s.reach; e.arc = (s.arc * Math.PI) / 180
      e.damage = s.damage; e.knock = s.knock; e.lift = s.lift; e.motion = 0; e.sweep = -1; e.radial = false
      sink(e)
    }
    const blasts = hits.blasts
    const h = this.heading
    while (blasts && this.nextBlast < blasts.length && blasts[this.nextBlast].t <= t) {
      const b = blasts[this.nextBlast++]
      const [lat, fwd] = b.at
      e.shape = 'circle'; e.kind = b.kind
      e.x = this.origin.x + Math.sin(h) * fwd + Math.cos(h) * lat
      e.z = this.origin.z + Math.cos(h) * fwd - Math.sin(h) * lat
      e.heading = h; e.reach = b.radius; e.arc = Math.PI * 2
      e.damage = b.damage; e.knock = b.knock; e.lift = b.lift; e.motion = 0; e.sweep = -1; e.radial = true
      sink(e)
    }
    const sweeps = hits.sweeps
    if (sweeps) {
      for (let i = 0; i < sweeps.length; i++) {
        const w = sweeps[i]
        if (t < w.t0 || t > w.t1) continue
        e.shape = 'circle'; e.kind = w.kind
        e.x = d.x + Math.sin(state.yaw) * w.ahead
        e.z = d.z + Math.cos(state.yaw) * w.ahead
        e.heading = state.yaw; e.reach = w.radius; e.arc = Math.PI * 2
        e.damage = w.damage; e.knock = w.knock; e.lift = w.lift; e.motion = motion; e.sweep = this.sweepBase + i; e.radial = false
        sink(e)
      }
    }
  }

  /** The move's ground frame starts at the robot's standing point, facing `heading`. */
  private setGround(state: MotionState, heading: number): void {
    this.origin.set(state.pos.x + Math.sin(state.yaw) * this.robotOffset, 0, state.pos.z + Math.cos(state.yaw) * this.robotOffset)
    this.heading = heading
    const v = this.player.values
    v[CH.advance] = 0
    v[CH.strafe] = 0
    v[CH.turn] = (state.yaw - heading) * 180 / Math.PI
  }

  /** Both feet step into the stance of the new heading, the one farther from it first. */
  private pivotFeet(): void {
    const d = this.model.dims
    const stanceX = d.stanceX ?? d.hipX
    const back = (d.footF ?? d.robotF) - d.robotF
    const h = this.heading
    const places = SIDES.map((side) => {
      const lat = side === 'L' ? stanceX : -stanceX
      const to = { x: this.origin.x + Math.sin(h) * back + Math.cos(h) * lat, z: this.origin.z + Math.cos(h) * back - Math.sin(h) * lat, yaw: h }
      const at = this.feet.sample(side)
      return { side, to, off: Math.hypot(at.x - to.x, at.z - to.z) }
    })
    places.sort((a, b) => b.off - a.off)
    places.forEach((p, k) => this.feet.step(p.side, p.to, PIVOT_STEP[k], this.combat.stepLift * 0.6))
  }

  private plantFeet(): void {
    for (const side of SIDES) {
      const m = this.model.node(`bone:foot.${side}`).matrixWorld
      _v.setFromMatrixPosition(m)
      _f.set(0, -1, 0).transformDirection(m)
      this.feet.plant(side, { x: _v.x, z: _v.z, yaw: Math.atan2(_f.x, _f.z) })
    }
  }

  /** Start the current move's footsteps whose time has come (in the move's ground frame). */
  private spawnSteps(): void {
    const move = this.player.current
    if (!move?.steps) return
    const t = this.player.time
    while (this.nextStep < move.steps.length && move.steps[this.nextStep].t0 <= t) {
      const s = move.steps[this.nextStep++]
      const h = this.heading
      const ground = (lat: number, fwd: number): { x: number; z: number } => ({
        x: this.origin.x + Math.sin(h) * fwd + Math.cos(h) * lat,
        z: this.origin.z + Math.cos(h) * fwd - Math.sin(h) * lat,
      })
      const via = s.via
        ? { ...ground(s.via[0], s.via[1]), up: s.via[2], yaw: h + (s.viaYaw ?? 0) * Math.PI / 180, point: (s.point ?? 0) * Math.PI / 180 }
        : null
      this.feet.step(s.side, { ...ground(s.to[0], s.to[1]), yaw: h + (s.yaw ?? 0) * Math.PI / 180 }, s.t1 - Math.max(s.t0, t - 0.0001), s.lift ?? this.combat.stepLift, via)
    }
  }

  /** At the recovery: feet that are off their stance step back under the body, the farther first. */
  private recoverFeet(state: MotionState): void {
    const d = this.model.dims
    const stanceX = d.stanceX ?? d.hipX
    const back = (d.footF ?? d.robotF) - d.robotF
    const h = state.yaw
    const recover = this.combat.moveset.recover
    const need: Array<[Side, number, { x: number; z: number; yaw: number }]> = []
    for (const side of SIDES) {
      const lat = side === 'L' ? stanceX : -stanceX
      const to = {
        x: this.origin.x + Math.sin(h) * back + Math.cos(h) * lat,
        z: this.origin.z + Math.cos(h) * back - Math.sin(h) * lat,
        yaw: h,
      }
      const at = this.feet.sample(side)
      const off = Math.hypot(at.x - to.x, at.z - to.z)
      if (off > STANCE_SLACK || Math.abs(wrap(at.yaw - h)) > STANCE_TURN || this.feet.stepping) need.push([side, off, to])
    }
    need.sort((a, b) => b[1] - a[1])
    need.forEach(([side, , to], k) => {
      const t0 = 0.05 + k * recover * 0.3
      this.stepAt(side, to, t0, recover * 0.36)
    })
  }

  private readonly queued: Array<{ side: Side; to: { x: number; z: number; yaw: number }; at: number; duration: number }> = []

  private stepAt(side: Side, to: { x: number; z: number; yaw: number }, at: number, duration: number): void {
    if (at <= 0.05) this.feet.step(side, to, duration, this.combat.stepLift)
    else this.queued.push({ side, to, at, duration })
  }

  /** Root motion: the standing point and heading from the move's ground frame. */
  private applyRoot(state: MotionState): void {
    // queued recovery steps
    for (let i = this.queued.length - 1; i >= 0; i--) {
      const q = this.queued[i]
      if (this.combo.phase !== 'recover') this.queued.splice(i, 1)
      else if (this.combo.time >= q.at) {
        this.feet.step(q.side, q.to, q.duration, this.combat.stepLift)
        this.queued.splice(i, 1)
      }
    }
    const v = this.player.values
    const h = this.heading
    const adv = v[CH.advance]
    const lat = v[CH.strafe]
    const yaw = h + v[CH.turn] * Math.PI / 180
    this.desired.set(
      this.origin.x + Math.sin(h) * adv + Math.cos(h) * lat,
      0,
      this.origin.z + Math.cos(h) * adv - Math.sin(h) * lat,
    )
    state.yaw = yaw
    state.pos.x = this.desired.x - Math.sin(yaw) * this.robotOffset
    state.pos.z = this.desired.z - Math.cos(yaw) * this.robotOffset
    state.speed = 0
    state.yawRate = 0
  }

  /**
   * The planner's feet in the model frame, heels raised by their channels, and
   * blended toward the free-leg targets carried with the body. A fully free
   * foot keeps its planner place under it, so it lands and plants where it is.
   */
  private poseFeet(state: MotionState, _dt: number): void {
    const d = this.model.dims
    const footF = d.footF ?? d.robotF
    const stanceX = d.stanceX ?? d.hipX
    const px = this.desired.x, pz = this.desired.z
    const fx = Math.sin(state.yaw), fz = Math.cos(state.yaw)
    const sole = this.combat.overlay.build.sole
    const v = this.player.values
    for (const side of SIDES) {
      const s = this.feet.sample(side)
      const dx = s.x - px, dz = s.z - pz
      const fwd = dx * fx + dz * fz
      const lat = dx * fz - dz * fx
      const leg = this.combat.overlay.pose.legs[side]
      const heel = Math.max(0, v[side === 'R' ? CH['R.heel'] : CH['L.heel']]) * Math.PI / 180
      toePivot(d.robotF + fwd - footF, s.up, s.pitch, heel, sole, leg)
      leg.x = lat
      leg.yaw = wrap(s.yaw - state.yaw)
      if (s.skid > 0) this.combat.effects.skid(side, _p.set(s.x, 0, s.z), s.skid, _dt)
      const o = LEG[side]
      const free = Math.min(1, Math.max(0, v[o]))
      if (free <= 0) continue
      const x = (side === 'L' ? 1 : -1) * (stanceX + v[o + 1])
      const step = v[o + 2]
      leg.x += (x - leg.x) * free
      leg.step += (step - leg.step) * free
      leg.up += (Math.max(0, v[o + 3]) - leg.up) * free
      leg.pitch += (v[o + 4] * Math.PI / 180 - leg.pitch) * free
      leg.yaw *= 1 - free
      if (free > 0.999) {
        const f = step + footF - d.robotF
        this.feet.plant(side, { x: px + f * fx + x * fz, z: pz + f * fz - x * fx, yaw: state.yaw })
      }
    }
  }
}

const smooth = (u: number): number => u * u * (3 - 2 * u)
const _v = new Vector3()
const _f = new Vector3()
const _p = new Vector3()
