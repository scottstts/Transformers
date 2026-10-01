import { Curve, type Key } from '../transformer/combat/curves'
import { SC, SOLDIER_CHANNEL_COUNT, type SoldierChannel } from '../soldier/poses'

/**
 * The commander's moves as keyed channels: the soldier's pose channels plus
 * root motion in the move's ground frame (`advance` m forward, `turn` deg, +
 * to its left, from the heading the move began on) and the lance's energy
 * (`glow`, 1 its fighting level; the strikes flash above it).
 */
export type CommanderChannel = SoldierChannel | 'advance' | 'turn' | 'glow'
export const COMMANDER_CHANNEL_COUNT = SOLDIER_CHANNEL_COUNT + 3
export const CC: Record<CommanderChannel, number> = { ...SC, advance: SOLDIER_CHANNEL_COUNT, turn: SOLDIER_CHANNEL_COUNT + 1, glow: SOLDIER_CHANNEL_COUNT + 2 }

/**
 * What one of the commander's moves does to the robot, at the moment it lands
 * (`strike`). Its reach is the commander's (the soldiers' slash scaled to its
 * size, commander-post.ts); the move gives the arc.
 */
export interface CommanderBlow {
  /** the arc round its heading then (deg); 360 sweeps all round */
  arc: number
  /** how hard the robot shows it (CombatEffects.struck, 0..1) */
  strength: number
  /** it knocks the robot back (RobotCombat.knockback) */
  knockback?: boolean
}

/** A sound or effect at a moment of a move. */
export interface CommanderCue {
  t: number
  /**
   * sounds: `poke` a thrust's rush, `slash` a swing's rush and ring, `servo`
   * the body's drive; effects: `flash` the lance's head flaring and
   * shedding sparks as a blow lands, `charge` it crackling as it gathers,
   * `skid` the wheels throwing up sand, `slam` the point driven into the
   * ground (a burst, chunks and a surge), `whirl` a surge of sand rolling
   * out round it
   */
  cue: 'poke' | 'slash' | 'servo' | 'flash' | 'charge' | 'skid' | 'slam' | 'whirl'
  value?: number
}

export interface CommanderMove {
  name: string
  duration: number
  /** the blow lands (s) */
  strike: number
  /** the next move of a rolled combo starts from here (s) */
  chain: number
  keys: Partial<Record<CommanderChannel, readonly Key[]>>
  blow: CommanderBlow
  cues: readonly CommanderCue[]
}

/** Channels a move does not key ease back to the stance over this long (s); the re-aim turn over ROOT_SETTLE. */
const UNKEYED = 0.3
const ROOT_SETTLE = 0.22
const MAX_KEYS = 24

/**
 * Plays the commander's moves on its channels. A move starts every channel
 * from where the last left it, with its momentum where the keys go on the
 * same way (the curves' bounded entry slope), so a rolled combo flows move
 * into move; channels a move leaves unkeyed ease to the stance. `advance` and
 * `turn` start each move at its own ground frame (the caller re-aims it).
 */
export class CommanderMovePlayer {
  readonly values = new Float32Array(COMMANDER_CHANNEL_COUNT)
  private readonly curves = Array.from({ length: COMMANDER_CHANNEL_COUNT }, () => new Curve(MAX_KEYS + 1))
  private readonly velocity = new Float32Array(COMMANDER_CHANNEL_COUNT)
  move: CommanderMove | null = null
  time = 0
  private nextCue = 0

  /** Hold `stance` (channels; root zero, glow at `glow`). */
  reset(stance: Float32Array, glow = 0): void {
    this.values.fill(0)
    this.values.set(stance)
    this.values[CC.glow] = glow
    this.move = null
    this.time = 0
    for (let i = 0; i < COMMANDER_CHANNEL_COUNT; i++) this.curves[i].set(this.values[i], undefined)
  }

  /**
   * Begin `move` from the current values. `turnFrom` (deg) is where the body
   * faces in the new move's frame (it re-aimed as the move began): the turn
   * eases from there to the move's own. Unkeyed channels ease to `stance`.
   */
  start(move: CommanderMove, stance: Float32Array, turnFrom = 0, glowRest = 1): void {
    for (let i = 0; i < COMMANDER_CHANNEL_COUNT; i++) this.velocity[i] = this.curves[i].velocity(this.time)
    // a new ground frame: travel starts from here, the heading from the re-aim
    this.velocity[CC.turn] = 0
    this.values[CC.advance] = 0
    this.values[CC.turn] = turnFrom
    this.move = move
    this.time = 0
    this.nextCue = 0
    for (let i = 0; i < COMMANDER_CHANNEL_COUNT; i++) {
      const rest = i < SOLDIER_CHANNEL_COUNT ? stance[i] : i === CC.glow ? glowRest : 0
      const root = i === CC.advance || i === CC.turn
      // unkeyed root motion: no travel, the re-aim turn settling onto the new heading
      this.curves[i].settle(this.values[i], root ? 0 : rest, root ? ROOT_SETTLE : UNKEYED, this.velocity[i])
    }
    for (const [name, keys] of Object.entries(move.keys)) {
      const i = CC[name as CommanderChannel]
      if (keys?.length) this.curves[i].set(this.values[i], keys, 0, this.velocity[i])
    }
    this.sample()
  }

  /** Ease every channel to `stance` over `seconds` (the combo's recovery); root motion holds. */
  settle(stance: Float32Array, seconds: number, glowRest: number): void {
    this.move = null
    this.time = 0
    for (let i = 0; i < COMMANDER_CHANNEL_COUNT; i++) {
      const root = i === CC.advance || i === CC.turn
      this.curves[i].settle(this.values[i], root ? this.values[i] : i === CC.glow ? glowRest : stance[i], seconds)
    }
    this.sample()
  }

  /** Advance by dt; returns the cues crossed this step through `onCue`. */
  update(dt: number, onCue?: (cue: CommanderCue) => void): void {
    this.time += dt
    this.sample()
    const cues = this.move?.cues
    if (!cues) return
    while (this.nextCue < cues.length && cues[this.nextCue].t <= this.time) {
      const cue = cues[this.nextCue++]
      onCue?.(cue)
    }
  }

  /** Root travel speed along the move's heading (m/s) and turn rate (deg/s) now. */
  get advanceRate(): number {
    return this.curves[CC.advance].velocity(this.time)
  }

  get advance(): number {
    return this.values[CC.advance]
  }

  get turn(): number {
    return this.values[CC.turn]
  }

  get glow(): number {
    return this.values[CC.glow]
  }

  private sample(): void {
    for (let i = 0; i < COMMANDER_CHANNEL_COUNT; i++) this.values[i] = this.curves[i].at(this.time)
  }
}
