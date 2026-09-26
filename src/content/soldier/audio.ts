import type { AudioMix } from '../../audio/mix'
import { noise, voice } from '../transformer/combat/audio/shots'
import type { HitKind } from '../transformer/combat/hits'
import { CAN_OBJECTS, CAN_STRIKES, canStrike } from './can-bank'
import { BLOW_KINDS, HIT_VARIANTS, blowTake, type BlowKind } from './hit-bank'

/**
 * The garrison's sound: small machines, heard under the robot's own. A horde
 * must not cost a voice per soldier, and a crowd of identical loops reads as
 * synthetic, so the continuous sounds are two shared voices whose levels
 * follow the whole horde's activity (distance-weighted, saturating: thirty
 * soldiers are barely louder than five):
 *
 *   wheels  hard little tyres over sand: a soft granular crunch and a faint
 *           low body, nothing more
 *   blades  the energy blades: a faint electrical crackle and a thin hiss,
 *           heard only near them
 *
 * Events are one-shots built from what physically happens:
 *
 *   swing   the blade swishing through air: a short soft broadband rush
 *   impact  a blow into a light steel body: a dull knock and the plate
 *           buckling (crackle); a cut adds the hot shear hiss
 *   breakup the body coming apart: thin sheet metal crinkling as the joints
 *           give, a soft low push and two parts knocking together
 *   land    a part hitting the ground (debris.ts reports each one from its
 *           physics): light, hollow, thin-walled metal, like an empty can
 *           dropped (can-bank.ts, synthesised against a recording of one),
 *           and on a hard landing a re-strike or two as it rocks
 *   ignite  a blade lighting: a crackle and a thin hiss
 *   blow    the robot's blow landing (once per blow, not per soldier it
 *           catches): a punch, a heavy stomp-like hit or a blade's chop and
 *           ring (hit-bank.ts, synthesised against Foley recordings), fuller
 *           the more soldiers it catches
 *
 * No filter moves (fixed filters, level envelopes only). The only tones are a
 * struck part's shell modes: a dense cluster of close, beating modes excited
 * by the contact's own noise, as in the recording. A few clean partials read
 * as a cartoon "tink". No `roar` texture: it is a jet's roar, and a horde of it
 * sounded like a turbine next to the player. No `chatter` either: its tuned
 * clicks read as robot babble.
 *
 * Distance delays (343 m/s) and dulls every event.
 */
export class SoldierAudio {
  private readonly mix: AudioMix
  private wheels: { crunch: GainNode; body: GainNode } | null = null
  private blades: GainNode | null = null
  private eventsThisFrame = 0
  /** landings allowed now: a budget refilled at LAND_RATE per second, so a blast's shower stays a light patter */
  private landBudget = LAND_BURST
  private lastTime = 0
  /** the struck-shell bank, rendered a strike per frame: [object][strike] */
  private readonly cans: AudioBuffer[][] = Array.from({ length: CAN_OBJECTS }, () => [])
  private cansReady = 0
  /** the blows' takes by kind, rendered after the shells, a take per frame */
  private readonly blows: Record<BlowKind, AudioBuffer[]> = { punch: [], heavy: [], slash: [] }
  private blowsReady = 0
  /** when the last blow of each kind sounded (a sweep catching soldiers frame after frame is one blow, not a rattle) */
  private readonly lastBlow: Record<BlowKind, number> = { punch: -1, heavy: -1, slash: -1 }

  constructor(mix: AudioMix) {
    this.mix = mix
  }

  /** Render the finite strike bank while the entry screen still covers play. */
  prepare(): void {
    const ctx = this.mix.ctx
    if (!ctx) return
    while (this.cansReady < CAN_OBJECTS * CAN_STRIKES || this.blowsReady < BLOW_KINDS.length * HIT_VARIANTS) {
      this.renderNextTake(ctx)
    }
    if (!this.wheels) this.build(ctx)
  }

  /**
   * Per frame: `rolling` (sum of speed / distance terms, ~1 is one soldier
   * charging close by), `lit` (lit blades weighted by distance).
   */
  update(rolling: number, lit: number): void {
    this.eventsThisFrame = 0
    const ctx = this.mix.ctx
    if (!ctx) return
    this.landBudget = Math.min(LAND_BURST, this.landBudget + (ctx.currentTime - this.lastTime) * LAND_RATE)
    this.lastTime = ctx.currentTime
    // Keep the incremental fallback if audio was unavailable during loading.
    this.renderNextTake(ctx)
    if (!this.wheels) this.build(ctx)
    const t = ctx.currentTime
    const w = this.wheels!
    // saturating: a crowd is a denser texture, not a louder one
    const roll = rolling / (1 + rolling)
    w.crunch.gain.setTargetAtTime(0.035 * roll, t, 0.1)
    w.body.gain.setTargetAtTime(0.045 * roll, t, 0.1)
    this.blades!.gain.setTargetAtTime(0.03 * (lit / (1 + lit)), t, 0.2)
  }

  private renderNextTake(ctx: AudioContext): void {
    if (this.cansReady < CAN_OBJECTS * CAN_STRIKES) {
      const o = this.cansReady % CAN_OBJECTS, k = Math.floor(this.cansReady / CAN_OBJECTS)
      const data = canStrike(o, k, ctx.sampleRate)
      const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate)
      buffer.copyToChannel(data, 0)
      this.cans[o][k] = buffer
      this.cansReady++
    } else if (this.blowsReady < BLOW_KINDS.length * HIT_VARIANTS) {
      // the blows first by kind (one take of each is enough to play), then their other takes
      const kind = BLOW_KINDS[this.blowsReady % BLOW_KINDS.length], v = Math.floor(this.blowsReady / BLOW_KINDS.length)
      const data = blowTake(kind, v, ctx.sampleRate)
      const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate)
      buffer.copyToChannel(data, 0)
      this.blows[kind].push(buffer)
      this.blowsReady++
    }
  }

  private build(ctx: AudioContext): void {
    const out = this.mix.output
    const loop = (buffer: AudioBuffer, type: BiquadFilterType, f: number, q: number, dest: AudioNode | null = null): GainNode => {
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.loop = true
      const filter = ctx.createBiquadFilter()
      filter.type = type
      filter.frequency.value = f
      filter.Q.value = q
      const gain = ctx.createGain()
      gain.gain.value = 0
      src.connect(filter).connect(gain)
      if (dest) gain.connect(dest)
      else {
        gain.connect(out.dry)
        const send = ctx.createGain()
        send.gain.value = 0.12
        gain.connect(send).connect(out.send)
      }
      src.start(ctx.currentTime, Math.random() * buffer.duration)
      return gain
    }
    const crunch = loop(this.mix.tex.crackle, 'bandpass', 1500, 0.35)
    const body = loop(this.mix.tex.brown, 'lowpass', 140, 0.5)
    this.wheels = { crunch, body }
    const blades = loop(this.mix.tex.crackle, 'highpass', 3000, 0.5)
    const hiss = loop(this.mix.tex.white, 'highpass', 5500, 0.5, blades)
    hiss.gain.value = 0.25
    this.blades = blades
  }

  swing(distance: number): void {
    const ctx = this.event(distance)
    if (!ctx) return
    const { t, g } = ctx
    const c = this.mix.ctx!
    const bus = voice(this.mix, 0.09 * g, 0.2, 0.8)
    noise(c, this.mix.tex.white, bus, t, 0.22, 'bandpass', 1100, 1100, 0.07, 0.6, 0, 0.4)
    noise(c, this.mix.tex.crackle, bus, t + 0.03, 0.18, 'highpass', 3000, 3000, 0.04, 0.3)
  }

  impact(kind: HitKind, strength: number, distance: number): void {
    const ctx = this.event(distance)
    if (!ctx) return
    const { t, g } = ctx
    const k = Math.min(1.3, strength) * g
    const c = this.mix.ctx!
    const bus = voice(this.mix, 0.28 * k, 0.3, 1)
    noise(c, this.mix.tex.brown, bus, t, 0.22, 'lowpass', 220, 220, 0.003, 0.7)
    noise(c, this.mix.tex.crackle, bus, t, 0.22, 'bandpass', 1800, 1800, 0.002, 0.45, 0.1, 0.35)
    if (kind === 'cut') {
      noise(c, this.mix.tex.white, bus, t, 0.3, 'highpass', 3200, 3200, 0.004, 0.08, 0.2)
      noise(c, this.mix.tex.crackle, bus, t, 0.25, 'highpass', 2600, 2600, 0.003, 0.25)
    }
  }

  breakup(strength: number, distance: number): void {
    const ctx = this.event(distance)
    if (!ctx) return
    const { t, g } = ctx
    const k = Math.min(1.4, strength) * g
    const c = this.mix.ctx!
    const bus = voice(this.mix, 0.16 * k, 0.25, 0.8)
    // a soft push of the body giving way, the sheet crinkling, two parts knocking together
    noise(c, this.mix.tex.brown, bus, t, 0.18, 'lowpass', 240, 240, 0.004, 0.35)
    noise(c, this.mix.tex.crackle, bus, t, 0.22, 'bandpass', 3200, 3200, 0.003, 0.4, 0.2, 0.6)
    for (let i = 0; i < 2; i++) this.strike(bus, t + 0.01 + Math.random() * 0.06, Math.floor(Math.random() * CAN_OBJECTS), 1.1 + Math.random() * 0.3, 0.25, distance)
  }

  /**
   * A part of `size` m and `mass` kg hitting the ground at `speed` m/s,
   * `distance` m away; `piece` picks its shell (the same part always sounds the same).
   */
  land(piece: number, size: number, mass: number, speed: number, distance: number): void {
    const c = this.mix.ctx
    if (!c || !this.mix.enabled || this.landBudget < 1 || distance > LAND_FAR) return
    this.landBudget--
    const t = c.currentTime + 0.005 + distance / 343
    // light and hollow whatever the part: speed sets the level, mass only a little
    const e = Math.min(1, (speed / 5) ** 1.4 * (0.7 + 0.3 * Math.min(1, mass / 60)))
    const bus = voice(this.mix, LAND_LEVEL * e / (1 + distance * 0.08), 0.18, 0.9)
    // a smaller part is a smaller shell: its modes sit higher (a fixed rate per part, never gliding)
    const rate = Math.min(1.4, Math.max(0.75, Math.sqrt(0.35 / Math.max(0.1, size))))
    const object = piece % CAN_OBJECTS
    this.strike(bus, t, object, rate, 1, distance)
    // a hard landing rocks on its rim: a re-strike or two, closer together and lighter
    let at = t, gap = 0.06 + 0.03 * Math.random()
    for (let i = 0; i < 2 && e > 0.3 + 0.3 * i; i++) {
      at += gap
      gap *= 0.6
      this.strike(bus, at, object, rate, (0.45 - 0.2 * i) * (0.7 + 0.3 * Math.random()), distance)
    }
  }

  /** One strike of a shell into `bus`, dulled with distance (a fixed low-pass). */
  private strike(bus: AudioNode, t: number, object: number, rate: number, level: number, distance: number): void {
    const strikes = this.cans[object]
    if (!strikes.length) return
    const c = this.mix.ctx!
    const src = c.createBufferSource()
    src.buffer = strikes[Math.floor(Math.random() * strikes.length)]
    src.playbackRate.value = rate
    const dull = c.createBiquadFilter()
    dull.type = 'lowpass'
    dull.frequency.value = 16000 / (1 + distance * 0.1)
    dull.Q.value = 0.5
    const g = c.createGain()
    g.gain.value = level
    src.connect(dull).connect(g).connect(bus)
    src.start(t)
  }

  /**
   * A blow of `kind` landing, `strength` 0..~1.4, catching `caught`
   * soldiers, the nearest `distance` m away.
   */
  blow(kind: BlowKind, strength: number, caught: number, distance: number): void {
    const c = this.mix.ctx
    const takes = this.blows[kind]
    if (!c || !this.mix.enabled || !takes.length) return
    if (c.currentTime - this.lastBlow[kind] < BLOW_GAP) return
    this.lastBlow[kind] = c.currentTime
    const t = c.currentTime + 0.003 + distance / 343
    // more soldiers caught is a fuller blow, not a louder one each
    const level = BLOW_LEVEL * Math.min(1.4, strength) * (1 + 0.3 * Math.log2(Math.max(1, caught))) / (1 + distance * 0.05)
    const bus = voice(this.mix, level, 0.22, 1.2)
    const src = c.createBufferSource()
    src.buffer = takes[Math.floor(Math.random() * takes.length)]
    const dull = c.createBiquadFilter()
    dull.type = 'lowpass'
    dull.frequency.value = 18000 / (1 + distance * 0.06)
    dull.Q.value = 0.5
    src.connect(dull).connect(bus)
    src.start(t)
  }

  ignite(distance: number): void {
    const ctx = this.event(distance)
    if (!ctx) return
    const { t, g } = ctx
    const c = this.mix.ctx!
    const bus = voice(this.mix, 0.08 * g, 0.2, 0.8)
    noise(c, this.mix.tex.crackle, bus, t, 0.3, 'highpass', 2800, 2800, 0.02, 0.5)
    noise(c, this.mix.tex.white, bus, t, 0.35, 'highpass', 5000, 5000, 0.05, 0.12, 0.2)
  }

  /** Timing and level for an event at `distance` m; null once the frame has enough events. */
  private event(distance: number): { t: number; g: number } | null {
    const ctx = this.mix.ctx
    if (!ctx || !this.mix.enabled || this.eventsThisFrame >= 4) return null
    this.eventsThisFrame++
    return { t: ctx.currentTime + 0.005 + distance / 343, g: 1 / (1 + distance * 0.08) }
  }
}

/** Landings heard per second, and at once; beyond this distance (m) a landing is not heard. */
const LAND_RATE = 24
const LAND_BURST = 8
const LAND_FAR = 70
/** A blow at full strength (its takes peak at 0.9), and the shortest gap between two blows of a kind (s). */
const BLOW_LEVEL = 0.55
const BLOW_GAP = 0.07
/** A landing at full speed (the bank's strikes peak at 0.9). */
const LAND_LEVEL = 0.07
