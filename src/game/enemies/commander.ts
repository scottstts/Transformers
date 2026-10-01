import type { SoldierManifest } from '../../content/soldier/asset'
import { SC, SOLDIER_CHANNEL_COUNT } from '../../content/soldier/poses'
import { CommanderRig } from '../../content/commander/rig'
import { COMMANDER_POSES } from '../../content/commander/poses'
import { COMMANDER_MOVES } from '../../content/commander/combo'
import { CommanderMovePlayer, type CommanderBlow, type CommanderCue } from '../../content/commander/moves'
import { wrap } from '../math'
import { SOLDIER, Soldier, type UnitTuning } from './soldier'

/**
 * The commander's tuning in the soldier's terms (soldier.ts): a 7 m duellist
 * on the same wheels, quick where the soldiers are mindless: fast off the
 * mark, turning on the spot, and within 16 m of its point it strafes there
 * on its steering wheels with its eyes and lance on the robot instead of
 * turning away to roll. It takes blows as a soldier does (the combat
 * contract, combat/contract.ts) at its weight: six times a soldier's, it
 * takes 40 % of a blow's push, is thrown only past a lift of 7.5 m/s (never
 * by knock alone; a special's lift reaches it whole, at a soldier's
 * threshold, so a special throws it with the soldiers), skids and brakes a
 * little harder and lies longer.
 */
export const COMMANDER: UnitTuning = {
  ...SOLDIER,
  health: 2000,
  chargeSpeed: 12,
  engageSpeed: 7.5,
  accel: 22,
  turnRate: 7,
  radius: 1.7,
  push: 0.4,
  launchLift: 7.5,
  launchKnock: Infinity,
  brake: 9,
  skidFriction: 14,
  down: [1.4, 2.2],
  rise: 1.3,
  shuffle: 16,
  shuffleGrip: 9,
  // its body is deeper than a soldier's: lying on its back its pelvis stands this high
  lie: 0.75,
}

/**
 * It leans into its own acceleration (deg per m/s^2, at most LEAN_MAX), forward
 * into a dash, back against a brake, over into a strafe's start, eased at
 * LEAN_RATE (1/s): a body that moves with its wheels, not on top of them.
 */
const LEAN_GAIN = 1.5
const LEAN_MAX = 14
const LEAN_RATE = 8
/** A move's travel stretches to cover a longer gap, to at most this share. */
const TRAVEL_MAX = 1.6
/** The room (m) a move's step-in leaves between its body and the robot's. */
const CLOSEST = 1.2
/** Rolled the whole combo, its lance burns this much hotter from the first move: the tell that the knock-back is coming (guard it). */
const COMMITTED_GLOW = 1.3
/** A move's re-aim at the robot as it begins (rad, at most). */
const REAIM = 0.8
/** The lance's level: fighting, and at peace (its `blade`, 1 the fighting level). */
const GLOW_READY = 1
const GLOW_PEACE = 0.3

/**
 * The commander: a soldier's body plan at 7 m (the same wheels, physics,
 * falls and break-up, soldier.ts) with a lance and a four-move combo
 * (content/commander/combo.ts) played on its channels by a move player, the
 * root carried by the moves' own travel and turns. `fight` rolls a combo's
 * length (commander-post.ts); each move re-aims at the robot as it begins
 * and its blow is left in `blow` at the moment it lands, for the horde to
 * try against the robot.
 *
 * It takes blows by the combat contract (combat/contract.ts): mid-combo
 * only a special's blow or vacuum interrupts it (others take its health and
 * rock its springs); out of one it reacts as a soldier does, at its weight
 * (COMMANDER). Its health running out destroys it, except that a special's
 * blows (before its last) hold it emptied as they do soldiers.
 */
export class Commander extends Soldier {
  /** the blow of the move that landed this step, for the horde to try against the robot (cleared once read) */
  blow: CommanderBlow | null = null
  /** the moves still to come in the rolled combo, and the move playing (-1 none) */
  private length = 0
  private move = -1
  private moveYaw = 0
  private struck = false
  /** its lean into its acceleration (deg), and the velocity it measures it from */
  private leanFwd = 0
  private leanSide = 0
  private lastVx = 0
  private lastVz = 0
  /** the bearing to the robot (rad) and the room between their bodies (m): each move re-aims at it as it begins, and steps in only as far as there is room */
  aim = 0
  gap = Infinity
  /** the share of the playing move's travel it takes (the room it had as the move began) */
  private travel = 1
  private readonly player = new CommanderMovePlayer()
  /** a move's sounds and effects (the post's audio hears them) */
  onCue: ((cue: CommanderCue, unit: Commander) => void) | null = null
  private readonly cue = (cue: CommanderCue): void => this.onCue?.(cue, this)

  constructor(manifest: SoldierManifest) {
    super(manifest, new CommanderRig(manifest), COMMANDER, COMMANDER_POSES)
  }

  reset(x: number, z: number, yaw: number, serial: number, floor = 0): void {
    super.reset(x, z, yaw, serial, floor)
    this.leanFwd = this.leanSide = 0
    this.lastVx = this.lastVz = 0
    this.length = 0
    this.move = -1
    this.blow = null
    this.blade = GLOW_PEACE
  }

  /** Committed to the whole combo (rolled four moves and still in it). */
  get committed(): boolean {
    return this.mode === 'attack' && this.length === 4
  }

  /** Mid-combo: which move (0-3), or -1. */
  get comboMove(): number {
    return this.mode === 'attack' ? this.move : -1
  }

  /** Start a combo of `length` moves (2 or 4), aimed at `aim`; false if it is not free to. */
  fight(length: number): boolean {
    if (!this.free) return false
    this.mode = 'attack'
    this.t = 0
    this.length = length
    this.player.reset(this.anim, this.blade)
    this.begin(0)
    return true
  }

  /** Mid-combo (the contract's rule 1: only a special interrupts it). */
  get inCombo(): boolean {
    return this.mode === 'attack'
  }

  update(dt: number): void {
    // its acceleration in its own frame, for the lean
    if (dt > 0) {
      const ax = (this.vx - this.lastVx) / dt, az = (this.vz - this.lastVz) / dt
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw)
      const k = Math.min(1, dt * LEAN_RATE)
      this.leanFwd += (clamp((ax * fx + az * fz) * LEAN_GAIN, LEAN_MAX) - this.leanFwd) * k
      // over toward the way it is pushed sideways (+ side bends to its left)
      this.leanSide += (clamp((ax * fz - az * fx) * LEAN_GAIN * 0.7, LEAN_MAX) - this.leanSide) * k
    }
    this.lastVx = this.vx
    this.lastVz = this.vz
    super.update(dt)
    // a stagger, a throw or its end cut the combo short
    if (this.mode !== 'attack' && this.move >= 0) {
      this.move = -1
      this.length = 0
    }
  }

  /** The move's own travel along the heading it began on, and its turn. */
  protected rootMotion(dt: number): boolean {
    if (this.mode !== 'attack' || this.move < 0) return false
    this.player.update(dt, this.cue)
    this.yaw = wrap(this.moveYaw + (this.player.turn * Math.PI) / 180)
    const v = this.player.advanceRate * (this.player.advanceRate > 0 ? this.travel : 1)
    this.vx = Math.sin(this.moveYaw) * v
    this.vz = Math.cos(this.moveYaw) * v
    return true
  }

  protected modes(): void {
    if (this.mode !== 'attack') {
      super.modes()
      return
    }
    const move = COMMANDER_MOVES[this.move]
    if (!this.struck && this.player.time >= move.strike) {
      this.struck = true
      this.blow = move.blow
    }
    const last = this.move >= this.length - 1
    if (this.player.time < (last ? move.duration : move.chain)) return
    if (!last) {
      this.begin(this.move + 1)
      return
    }
    // the combo is over: the stance takes it from where the last move left it
    this.mode = 'move'
    this.t = 0
    this.move = -1
    this.length = 0
  }

  protected poseTarget(T: Float32Array): number {
    if (this.mode !== 'attack') {
      const rate = super.poseTarget(T)
      if (this.mode === 'post' || this.mode === 'move') {
        T[SC.lean] += this.leanFwd
        T[SC.side] += this.leanSide
      }
      return rate
    }
    for (let i = 0; i < SOLDIER_CHANNEL_COUNT; i++) T[i] = this.player.values[i]
    return 0
  }

  protected finishPose(dt: number): void {
    super.finishPose(dt)
    if (this.mode === 'attack') this.blade = this.player.glow * (this.committed ? COMMITTED_GLOW : 1)
  }

  protected bladeTarget(): number {
    return this.goal.ready ? GLOW_READY : GLOW_PEACE
  }

  /** Move `index` of the combo from where the body is, re-aimed toward the robot. */
  private begin(index: number): void {
    this.move = index
    this.struck = false
    // a move steps in only as far as there is room before the robot's body (it never steps back for want of it)
    const keys = COMMANDER_MOVES[index].keys.advance
    const ahead = keys ? keys[keys.length - 1][1] : 0
    this.travel = ahead > 0 ? Math.max(0, Math.min(TRAVEL_MAX, (this.gap - CLOSEST) / ahead)) : 1
    this.moveYaw = this.yaw + Math.max(-REAIM, Math.min(REAIM, wrap(this.aim - this.yaw)))
    this.player.start(COMMANDER_MOVES[index], COMMANDER_POSES.ready, ((this.yaw - this.moveYaw) * 180) / Math.PI, GLOW_READY)
  }
}

const clamp = (v: number, m: number): number => Math.max(-m, Math.min(m, v))
