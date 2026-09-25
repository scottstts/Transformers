import { Vector3, type PerspectiveCamera } from 'three/webgpu'
import type { TransformerModel } from '../../content/transformer/model/transformer'
import type { CharacterCombat, CombatCamera, CombatFrame } from '../../content/transformer/combat/effects'
import type { CombatMove, MoveCue } from '../../content/transformer/combat/moves'
import type { SpecialMove } from '../../content/transformer/combat/special'
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
/** Largest turn toward the camera's heading at the start of a move (rad): feet that stay planted limit it. */
const REAIM = { first: 0.7, chained: 0.45 }
/** Recovery: channels settle by this share of it; feet off their stance by more than this step back (m, rad). */
const SETTLE_SHARE = 0.72
const STANCE_SLACK = 0.07
const STANCE_TURN = 0.17
/** A click during the recovery restarts the combo once this share of it has passed. */
const RESTART_SHARE = 0.35

/**
 * The robot's fighting, around the session: clicks drive the combo
 * (combo.ts), each move plays on the pose channels (MovePlayer) from where the
 * last left off, the feet step and plant on the ground (FootPlanner), and the
 * move's root motion carries the robot: its standing point and heading are
 * written into the motion state each frame, so walking resumes from wherever
 * the fight left it. Each move is aimed toward the camera's heading, as far as
 * planted feet allow.
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
  private nextStep = 0
  private weight = 0
  private exiting = false
  private readonly forward = new Vector3()
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
    const recover = combat.moveset.recover
    this.combo = new ComboController(this.moves, recover, recover * RESTART_SHARE)
    this.frame = { weight: 0, values: this.player.values, move: -1, time: 0, state, camera }
    this.frameState = state
    this.player.reset(combat.overlay.neutral)
  }

  /** The fight owns the robot (movement, jumps and transforming wait). */
  get active(): boolean {
    return this.combo.active || this.special !== null || this.weight > 0
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
      this.plantFeet()
      this.combat.effects.begin()
    }
    this.combo.cancel()
    this.queued.length = 0
    this.exiting = false
    this.special = special
    this.tempoCurve.set(1, special.tempo)
    this.beginMove(special.move, state, camera, REAIM.first)
    this.combat.effects.beginSpecial()
    return special
  }

  /** Drop the fight at once and hand the pose back (the robot leaves the stance, or the character is swapped out). */
  cancel(): void {
    this.special = null
    this.combo.cancel()
    this.weight = 0
    this.exiting = false
    this.combat.overlay.weight = 0
    this.model.overlay = null
    this.combat.effects.reset()
  }

  update(dt: number, state: MotionState, camera: PerspectiveCamera): void {
    this.frameState = state
    this.frameCamera = camera
    if (!this.special) this.combo.update(dt, this.onComboEvent)
    if (!this.combo.active && !this.special && this.weight === 0) return

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
    const owning = this.combo.active || this.special !== null

    // weight: in over the first moments, out as the recovery settles
    if (this.combo.phase === 'recover' && this.combo.time > this.combat.moveset.recover - EXIT) this.exiting = true
    if (this.combo.phase === 'move' || this.special) this.exiting = false
    this.weight = this.exiting || !owning ? Math.max(0, this.weight - dt / EXIT) : Math.min(1, this.weight + dt / ENTRY)
    this.combat.overlay.weight = smooth(this.weight)
    this.model.overlay = this.weight > 0 ? this.combat.overlay : null

    this.combat.overlay.pose.v.set(this.player.values)
    this.applyRoot(state)
    this.poseFeet(state, dt)

    const f = this.frame
    f.weight = this.combat.overlay.weight
    f.move = this.special ? this.moves.length : this.combo.phase === 'move' ? this.combo.move : -1
    f.time = this.special ? this.player.time : this.combo.time
    this.combat.effects.update(dt, f)
    if (this.weight === 0 && !owning) this.combat.effects.end()
  }

  /** After the scenery pushed the robot: the ground frame moves with it (the feet keep their offsets). */
  afterCollisions(state: MotionState): void {
    if (!this.active) return
    const fx = Math.sin(state.yaw), fz = Math.cos(state.yaw)
    const px = state.pos.x + fx * this.robotOffset
    const pz = state.pos.z + fz * this.robotOffset
    this.origin.x += px - this.desired.x
    this.origin.z += pz - this.desired.z
  }

  private onCombo(event: ComboEvent, state: MotionState, camera: PerspectiveCamera): void {
    const effects = this.combat.effects
    if (event.type === 'start') {
      const first = this.weight === 0
      if (first) {
        this.player.reset(this.combat.overlay.neutral)
        this.plantFeet()
        effects.begin()
      }
      this.beginMove(this.moves[event.move], state, camera, first ? REAIM.first : REAIM.chained)
      effects.moveStart(event.move, this.frame.camera)
    } else if (event.type === 'recover') {
      this.setGround(state, state.yaw)
      this.player.settle(this.combat.overlay.neutral, this.combat.moveset.recover * SETTLE_SHARE, this.combat.moveset.recoverCues)
      this.recoverFeet(state)
    }
  }

  private beginMove(move: CombatMove, state: MotionState, camera: PerspectiveCamera, limit: number): void {
    camera.getWorldDirection(this.forward)
    const aim = Math.hypot(this.forward.x, this.forward.z) > 1e-3 ? Math.atan2(this.forward.x, this.forward.z) : state.yaw
    const heading = state.yaw + Math.max(-limit, Math.min(limit, wrap(aim - state.yaw)))
    this.setGround(state, heading)
    const v = this.player.values
    v[CH.advance] = 0
    v[CH.strafe] = 0
    v[CH.turn] = (state.yaw - heading) * 180 / Math.PI
    this.player.start(move, this.combat.overlay.neutral)
    this.nextStep = 0
    this.struck = false
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
