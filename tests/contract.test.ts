import { describe, expect, it } from 'vitest'
import { Scene, Vector3 } from 'three/webgpu'
import { ROSTER } from '../src/content/roster.ts'
import { AudioMix } from '../src/audio/mix.ts'
import { SOLDIER, Soldier, type SoldierImpact } from '../src/game/enemies/soldier.ts'
import { COMMANDER, Commander } from '../src/game/enemies/commander.ts'
import { Horde } from '../src/game/enemies/horde.ts'
import { Forts } from '../src/worlds/desert/fort'
import type { Character } from '../src/content/transformer/character.ts'
import type { MoveHits } from '../src/content/transformer/combat/hits.ts'
import { NO_CONTACT, readAsset, readSoldier, readWeapon } from './support/assets.ts'
import { DT, runFight } from './support/fight.ts'

/**
 * The combat interaction contract (src/game/combat/contract.ts), for every
 * robot in the roster: a robot added later is held to it without touching
 * this file.
 */
const soldiers = readSoldier()
const commanders = readSoldier('commander')

/** Every blow a robot's combo and special can throw, as it reaches one enemy. */
function blows(c: Character): SoldierImpact[] {
  const out: SoldierImpact[] = []
  const add = (h: MoveHits, special: boolean): void => {
    for (const s of h.strikes ?? []) out.push({ dirX: 0, dirZ: -1, knock: s.knock, lift: s.lift, damage: 1, kind: s.kind, special })
    for (const s of h.sweeps ?? []) out.push({ dirX: 0, dirZ: -1, knock: s.knock, lift: s.lift, damage: 1, kind: s.kind, special })
    for (const b of h.blasts ?? []) out.push({ dirX: 0, dirZ: -1, knock: b.knock, lift: b.lift, damage: 1, kind: b.kind, special })
  }
  c.combat.hits.moves.forEach((h) => add(h, false))
  add(c.combat.hits.special, true)
  return out
}

describe.each(ROSTER.map((entry) => ({ name: entry.id, entry })))('the combat contract: $name', ({ entry }) => {
  const make = (): Character => entry.create({ ...readAsset(entry.id), weapon: readWeapon(entry.weapon) }, NO_CONTACT, new AudioMix())
  const character = make()

  it('its every blow reaches the commander, out of a combo, as it reaches a soldier, at the commander\'s weight', () => {
    for (const hit of blows(character)) {
      const s = new Soldier(soldiers.manifest)
      s.reset(0, 0, 0, 1)
      const c = new Commander(commanders.manifest)
      c.reset(0, 0, 0, 2)
      s.impact(hit)
      c.impact(hit)
      const what = `${hit.special ? 'special' : 'combo'} ${hit.kind} knock ${hit.knock} lift ${hit.lift}`
      // it reacts (a flinch at least, never shrugged off) and is pushed by its share
      expect(['hit', 'air'], what).toContain(c.mode)
      expect(c.vz, what).toBeCloseTo(s.vz * COMMANDER.push, 6)
      // a special throws it whenever it throws a soldier, as high
      if (hit.special && s.mode === 'air' && hit.lift > SOLDIER.launchLift) {
        expect(c.mode, what).toBe('air')
        expect(c.vy, what).toBeCloseTo(s.vy, 6)
      }
    }
  })

  it('its special holds what it empties, soldiers and commander alike, until its last blow', () => {
    const forts = new Forts(new Scene())
    const horde = new Horde(soldiers, forts, NO_CONTACT, new AudioMix(), commanders)
    const c = horde.commanderPosts[0].unit
    const [s] = horde.nearby(c.x, c.z, 60).filter((k) => k !== c)
    horde.special = true
    for (const hit of blows(character).filter((b) => b.special)) {
      for (const u of [c, s]) {
        // the blow lands on it with all its health in it
        horde.hit({ shape: 'circle', kind: hit.kind, x: u.x + 1, z: u.z, heading: 0, reach: 2.5, arc: Math.PI * 2, damage: 1e5, knock: hit.knock, lift: hit.lift, motion: 0, sweep: -1, radial: true, special: true, final: false, bite: true })
        expect(u.alive).toBe(true)
        expect(u.doomed).toBe(true)
      }
    }
    // the last blow breaks them both, wherever they are
    const before = horde.destroyed
    horde.hit({ shape: 'circle', kind: 'blast', x: c.x + 500, z: c.z, heading: 0, reach: 1, arc: Math.PI * 2, damage: 1, knock: 1, lift: 1, motion: 0, sweep: -1, radial: true, special: true, final: true, bite: true })
    expect(c.alive || s.alive).toBe(false)
    expect(horde.destroyed).toBeGreaterThanOrEqual(before + 2)
  })

  it('only its special\'s blows interrupt the commander mid-combo', () => {
    for (const hit of blows(character)) {
      const c = new Commander(commanders.manifest)
      c.reset(0, 0, 0, 2)
      c.goal.ready = true
      c.fight(4)
      c.update(0.05)
      c.impact(hit)
      expect(c.mode === 'attack', `${hit.special ? 'special' : 'combo'} ${hit.kind} knock ${hit.knock} lift ${hit.lift}`).toBe(!hit.special)
    }
  })

  it('its combo is broken by the commander\'s knock-back, but not its special or its guard', () => {
    const knockedAt = (t0: number, clicks: number[], specials: number[], guard: boolean): boolean => {
      let staggered = false
      runFight(make(), clicks, t0 + 0.2, () => undefined, DT, specials, (t, fight, s) => {
        fight.setGuard(guard)
        if (Math.abs(t - t0) < DT / 2) {
          fight.knockback(new Vector3(s.pos.x + 6, 4, s.pos.z))
          staggered = fight.staggered
        }
      })
      return staggered
    }
    // in its combo's second move, and standing
    expect(knockedAt(0.75, [0, 0.4], [], false)).toBe(true)
    expect(knockedAt(0.4, [], [], false)).toBe(true)
    // in its special, and behind its guard
    expect(knockedAt(0.5, [], [0], false)).toBe(false)
    expect(knockedAt(0.8, [], [], true)).toBe(false)
  })
})
