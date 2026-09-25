import { describe, expect, it } from 'vitest'
import { Matrix4, Vector3 } from 'three/webgpu'
import { createCybertruck } from '../src/content/cybertruck/index.ts'
import { createF1 } from '../src/content/ferrari-f1/index.ts'
import { AudioMix } from '../src/audio/mix.ts'
import { CH, CHANNEL_NAMES, LEG } from '../src/content/transformer/combat/pose.ts'
import { MAX_KEYS } from '../src/content/transformer/combat/moves.ts'
import type { Character } from '../src/content/transformer/character.ts'
import { NO_CONTACT, readAsset, readWeapon } from './support/assets.ts'
import { bodyCore, runFight } from './support/fight.ts'

interface Fighter {
  name: string
  make: () => Character
  /** a click that starts move 2 of the combo, where the special can cut in mid-move */
  midCombo: number[]
  /** the special's highest point (m) and how far it travels over the ground (m), at least */
  apex: number
  travel: number
}

const FIGHTERS: Fighter[] = [
  {
    name: 'cybertruck',
    make: () => createCybertruck({ ...readAsset('cybertruck'), weapon: readWeapon('cybertruck-axe') }, NO_CONTACT, new AudioMix()),
    midCombo: [0, 0.6],
    apex: 25,
    travel: 10,
  },
  {
    name: 'ferrari-f1',
    make: () => createF1({ ...readAsset('ferrari-f1'), weapon: readWeapon('ferrari-f1-sword') }, NO_CONTACT, new AudioMix()),
    midCombo: [0, 0.45],
    apex: 0,
    travel: 12,
  },
]

describe.each(FIGHTERS)('$name special', ({ make, midCombo, apex, travel }) => {
  const character = make()
  const special = character.combat.special
  const { move } = special

  it('is well-formed: keys, cues, steps, shots and tempo inside the move', () => {
    const end = move.duration + 1e-6
    for (const [name, keys] of Object.entries(move.keys)) {
      expect(CHANNEL_NAMES).toContain(name)
      expect(keys!.length, name).toBeLessThanOrEqual(MAX_KEYS)
      keys!.forEach(([t, v], i) => {
        expect(Number.isFinite(v), name).toBe(true)
        expect(t, name).toBeGreaterThan(0)
        expect(t, name).toBeLessThanOrEqual(end)
        if (i > 0) expect(t, `${name} key ${i}`).toBeGreaterThan(keys![i - 1][0])
      })
    }
    move.cues?.forEach((cue, i) => {
      expect(cue.t).toBeLessThanOrEqual(move.duration)
      if (i > 0) expect(cue.t).toBeGreaterThanOrEqual(move.cues![i - 1].t)
    })
    for (const s of move.steps ?? []) expect(s.t1).toBeLessThanOrEqual(move.duration)
    expect(special.shots[0].at).toBe(0)
    special.shots.forEach((shot, i) => {
      if (i > 0) expect(shot.at).toBeGreaterThan(special.shots[i - 1].at)
      expect(shot.at).toBeLessThan(special.handback)
      for (const track of [shot.eye, shot.look]) {
        expect(track.length).toBeLessThanOrEqual(16)
        track.forEach(([t], k) => { if (k > 0) expect(t).toBeGreaterThan(track[k - 1][0]) })
      }
    })
    expect(special.handback).toBeLessThan(move.duration)
    for (const [, rate] of special.tempo ?? []) expect(rate).toBeGreaterThan(0)
  })

  it.each(['from the stance', 'cutting into a combo'] as const)('plays %s at 120 Hz, clear of the body, and hands back to the gait', (start) => {
    const c = make()
    const chest = bodyCore(c, 'bone:chest', 0.15)
    const pelvis = bodyCore(c, 'bone:pelvis', 0.15)
    const head = bodyCore(c, 'bone:head', 0.1)
    const inv = new Matrix4()
    const p = new Vector3()
    const inside = (box: typeof chest, node: string, world: Vector3): boolean => box.containsPoint(p.copy(world).applyMatrix4(inv.copy(c.model.node(node).matrixWorld).invert()))
    const cores = [[chest, 'bone:chest'], [pelvis, 'bone:pelvis'], [head, 'bone:head']] as const
    const weapon = c.model.node('bone:hand.R').children.find((o) => o.name.startsWith('weapon:'))!
    const formed = c.combat.effects.weapon!
    const clicks = start === 'from the stance' ? [] : midCombo
    const at = start === 'from the stance' ? 0 : midCombo[1] + 0.25
    const origin = new Vector3()
    let began = false
    let played = false
    let highest = 0
    let farthest = 0
    // slow motion stretches the special in real time
    const combat = runFight(c, clicks, at + move.duration * 1.6 + 3, (t, fight) => {
      for (const node of c.model.root.children[0].children) expect(Number.isFinite(node.matrixWorld.elements[12])).toBe(true)
      if (fight.cinematic && !began) {
        began = true
        origin.copy(c.model.root.position)
      }
      if (fight.cinematic) {
        played = true
        highest = Math.max(highest, fight.air)
        farthest = Math.max(farthest, c.model.root.position.distanceTo(origin))
      }
      const v = c.combat.overlay.pose.v
      // on the sand, with the planner's feet: the lowest foot stands on it
      if (fight.poseWeight === 1 && fight.air < 0.01 && v[LEG.R] < 0.01 && v[LEG.L] < 0.01) {
        expect(Math.min(c.model.footClearance('R'), c.model.footClearance('L')), `feet at ${t.toFixed(2)}`).toBeLessThan(0.03)
      }
      for (const b of ['hand.R', 'hand.L']) {
        const w = new Vector3().setFromMatrixPosition(c.model.node(`bone:${b}`).matrixWorld)
        for (const [box, node] of cores) expect(inside(box, node, w), `${b} inside ${node} at ${t.toFixed(2)}`).toBe(false)
      }
      if (weapon.visible) {
        const m = formed.asset.manifest
        const reach = formed.presence * Math.max(-m.extent[0], m.extent[1])
        for (let z = Math.max(-reach, m.extent[0]); z <= Math.min(reach, m.extent[1]); z += 0.1) {
          const w = new Vector3(0, 0, z).applyMatrix4(weapon.matrixWorld)
          for (const [box, node] of cores) expect(inside(box, node, w), `weapon z=${z.toFixed(2)} inside ${node} at ${t.toFixed(2)}`).toBe(false)
        }
        for (let u = 0; u <= 1; u += 0.1) {
          const edge = new Vector3(...m.edge[0]).lerp(new Vector3(...m.edge[1]), u)
          if (Math.abs(edge.z) > reach) continue
          edge.applyMatrix4(weapon.matrixWorld)
          for (const [box, node] of cores) expect(inside(box, node, edge), `edge inside ${node} at ${t.toFixed(2)}`).toBe(false)
        }
      }
    }, 1 / 120, [at])
    expect(played).toBe(true)
    expect(highest).toBeGreaterThanOrEqual(apex)
    expect(farthest).toBeGreaterThan(travel)
    // done: the cutscene over, the stance back, the weapon gone, the gait in charge
    expect(combat.cinematic).toBe(false)
    expect(combat.active).toBe(false)
    expect(weapon.visible).toBe(false)
    expect(c.model.overlay).toBeNull()
    expect(c.combat.overlay.pose.v[CH.air]).toBeCloseTo(0, 3)
  })

  it('runs its tempo only while it plays', () => {
    const c = make()
    const rates: number[] = []
    const combat = runFight(c, [], move.duration + 2, (_t, fight) => { if (fight.cinematic) rates.push(fight.tempo) }, 1 / 60, [0])
    expect(Math.min(...rates)).toBeLessThan(0.5)
    expect(Math.max(...rates)).toBeCloseTo(1, 3)
    expect(combat.tempo).toBe(1)
  })
})
