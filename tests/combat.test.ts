import { describe, expect, it } from 'vitest'
import { Box3, Matrix4, Quaternion, Vector3 } from 'three/webgpu'
import { createCybertruck } from '../src/content/cybertruck/index.ts'
import { createF1 } from '../src/content/ferrari-f1/index.ts'
import { AudioMix } from '../src/audio/mix.ts'
import { CH, CHANNEL_NAMES } from '../src/content/transformer/combat/pose.ts'
import type { Character } from '../src/content/transformer/character.ts'
import { NO_CONTACT, readAsset, readWeapon } from './support/assets.ts'
import { DT, bodyCore, runFight } from './support/fight.ts'

interface Fighter {
  name: string
  make: () => Character
  /** clicks that chain all four moves (s) */
  clicks: number[]
}

const FIGHTERS: Fighter[] = [
  {
    name: 'cybertruck',
    make: () => createCybertruck({ ...readAsset('cybertruck'), weapon: readWeapon('cybertruck-axe') }, NO_CONTACT, new AudioMix()),
    clicks: [0, 0.6, 1.35, 2.5],
  },
  {
    name: 'ferrari-f1',
    make: () => createF1({ ...readAsset('ferrari-f1'), weapon: readWeapon('ferrari-f1-sword') }, NO_CONTACT, new AudioMix()),
    clicks: [0, 0.45, 1.3, 2.4],
  },
]

describe.each(FIGHTERS)('$name fighting', ({ make, clicks }) => {
  const character = make()
  const { moveset } = character.combat

  it('has four well-formed moves', () => {
    expect(moveset.moves.length).toBe(4)
    for (const move of moveset.moves) {
      const end = Math.max(move.duration, move.chain[1]) + 1e-6
      expect(move.chain[0]).toBeLessThanOrEqual(move.chain[1])
      expect(move.chain[0]).toBeLessThanOrEqual(move.duration + 1e-6)
      for (const [name, keys] of Object.entries(move.keys)) {
        expect(CHANNEL_NAMES).toContain(name)
        keys!.forEach(([t], i) => {
          expect(t).toBeGreaterThan(0)
          expect(t).toBeLessThanOrEqual(end)
          if (i > 0) expect(t).toBeGreaterThan(keys![i - 1][0])
        })
      }
      move.cues?.forEach((cue, i) => {
        expect(cue.t).toBeLessThanOrEqual(move.duration)
        if (i > 0) expect(cue.t).toBeGreaterThanOrEqual(move.cues![i - 1].t)
      })
      for (const s of move.steps ?? []) {
        expect(s.t1).toBeGreaterThan(s.t0)
        expect(s.t1).toBeLessThanOrEqual(move.duration)
      }
    }
  })

  it('stands exactly in the gait stance at neutral (a seamless hand-back)', () => {
    const c = make()
    const bones = ['hand.R', 'hand.L', 'head', 'foot.R', 'foot.L', 'index3.R']
    c.model.pose(1, c.gait.update(DT, 0, 0, false, true, null))
    const gait = bones.map((b) => new Vector3().setFromMatrixPosition(c.model.node(`bone:${b}`).matrixWorld))
    // the fight starts and is cancelled before it has moved anything: weight 1, neutral channels, stance feet
    const overlay = c.combat.overlay
    overlay.weight = 1
    overlay.pose.v.set(overlay.neutral)
    const d = c.model.dims
    const stanceX = d.stanceX ?? d.hipX
    for (const [side, s] of [['R', -1], ['L', 1]] as const) Object.assign(overlay.pose.legs[side], { x: s * stanceX, step: 0, up: 0, pitch: 0, yaw: 0 })
    c.model.overlay = overlay
    c.model.pose(1, c.gait.update(0, 0, 0, false, true, null))
    bones.forEach((b, i) => {
      const p = new Vector3().setFromMatrixPosition(c.model.node(`bone:${b}`).matrixWorld)
      // the gait's idle breath and arm sway are the only difference
      expect(p.distanceTo(gait[i])).toBeLessThan(0.06)
    })
    c.model.overlay = null
  })

  it.each(['normal', 'early', 'late', 'stop-after-weapon', 'loop'] as const)('keeps feet grounded and weapons clear of the body: %s', (timing) => {
    const c = make()
    const chest = bodyCore(c, 'bone:chest', 0.15)
    const pelvis = bodyCore(c, 'bone:pelvis', 0.15)
    const head = bodyCore(c, 'bone:head', 0.1)
    const inv = new Matrix4()
    const p = new Vector3()
    const weapon = c.model.node('bone:hand.R').children.find((o) => o.name.startsWith('weapon:'))!
    expect(weapon).toBeDefined()
    expect(weapon.children.length).toBeGreaterThan(0)
    let frames = 0
    let armed = 0
    const inside = (box: Box3, node: string, world: Vector3): boolean => box.containsPoint(p.copy(world).applyMatrix4(inv.copy(c.model.node(node).matrixWorld).invert()))
    const schedule = timing === 'normal' ? clicks : timing === 'stop-after-weapon' ? clicks.slice(0, 3)
      // the next combo cut into the finisher's settle, as soon as its window opens
      : timing === 'loop' ? [...clicks, clicks[3] + moveset.moves[3].chain[0] + DT] : [0]
    if (timing === 'early' || timing === 'late') for (const move of moveset.moves.slice(0, 3)) {
      schedule.push(schedule.at(-1)! + (timing === 'early' ? move.chain[0] + DT : move.chain[1] - DT))
    }
    const combat = runFight(c, schedule, 9, (t, fight) => {
      frames++
      for (const node of c.model.root.children[0].children) expect(Number.isFinite(node.matrixWorld.elements[12])).toBe(true)
      // a planted foot stays on the ground (the lowest foot defines the ground; the other must not hang)
      if (fight.poseWeight === 1 && fight.air < 0.01) {
        const r = c.model.footClearance('R'), l = c.model.footClearance('L')
        expect(Math.min(r, l)).toBeLessThan(0.03)
      }
      // wrists and the weapon's edge never inside the torso or the head
      for (const b of ['hand.R', 'hand.L']) {
        const w = new Vector3().setFromMatrixPosition(c.model.node(`bone:${b}`).matrixWorld)
        for (const [box, node] of [[chest, 'bone:chest'], [pelvis, 'bone:pelvis'], [head, 'bone:head']] as const) {
          expect(inside(box, node, w), `${b} inside ${node} at ${t.toFixed(2)}`).toBe(false)
        }
      }
      const formed = c.combat.effects.weapon
      if (weapon.visible && formed) {
        armed++
        if (c.combat.overlay.pose.v[CH['w.two']] > 0.999 && fight.poseWeight === 1) {
          const [x, y, z] = c.combat.overlay.build.grip
          const palm = new Vector3(-x, y, z).applyMatrix4(c.model.node('bone:hand.L').matrixWorld)
          const grip = new Vector3(...formed.asset.manifest.grips.off).applyMatrix4(weapon.matrixWorld)
          expect(palm.distanceTo(grip), `off-hand grip at ${t.toFixed(2)}`).toBeLessThan(0.08)
        }
        // only what has formed of it: out to its presence along the haft
        const m = formed.asset.manifest
        const reach = formed.presence * Math.max(-m.extent[0], m.extent[1])
        for (let z = Math.max(-reach, m.extent[0]); z <= Math.min(reach, m.extent[1]); z += 0.1) {
          const w = new Vector3(0, 0, z).applyMatrix4(weapon.matrixWorld)
          for (const [box, node] of [[chest, 'bone:chest'], [pelvis, 'bone:pelvis'], [head, 'bone:head']] as const) {
            expect(inside(box, node, w), `weapon z=${z.toFixed(2)} inside ${node} at ${t.toFixed(2)}`).toBe(false)
          }
        }
        for (let u = 0; u <= 1; u += 0.1) {
          const edge = new Vector3(...m.edge[0]).lerp(new Vector3(...m.edge[1]), u)
          if (Math.abs(edge.z) > reach) continue
          edge.applyMatrix4(weapon.matrixWorld)
          for (const [box, node] of [[chest, 'bone:chest'], [pelvis, 'bone:pelvis'], [head, 'bone:head']] as const) {
            expect(inside(box, node, edge), `cutting edge inside ${node} at ${t.toFixed(2)}`).toBe(false)
          }
        }
      }
    }, 1 / 120)
    expect(frames).toBeGreaterThan(300)
    expect(armed).toBeGreaterThan(60)
    // back in the stance, unarmed, the gait in charge
    expect(combat.active).toBe(false)
    expect(weapon.visible).toBe(false)
    expect(c.model.overlay).toBeNull()
  })

  it('a single click plays move 1 and recovers', () => {
    const c = make()
    let seenWeapon = false
    const weapon = c.model.node('bone:hand.R').children.find((o) => o.name.startsWith('weapon:'))!
    const combat = runFight(c, [0], 3, () => { seenWeapon ||= weapon.visible })
    expect(seenWeapon).toBe(false)
    expect(combat.active).toBe(false)
  })

  it('settles the finisher hands without a fast joint unwind', () => {
    const c = make()
    const bones = ['upperarm.R', 'hand.R', 'upperarm.L', 'hand.L']
    const previous = bones.map(() => new Quaternion())
    const q = new Quaternion()
    let peak = 0
    let where = ''
    const exit = clicks[3] + moveset.moves[3].chain[0]
    runFight(c, clicks, 9, (t) => {
      bones.forEach((bone, i) => {
        c.model.node(`bone:${bone}`).getWorldQuaternion(q)
        const speed = previous[i].angleTo(q) / DT * 180 / Math.PI
        if (t > exit && speed > peak) { peak = speed; where = `${bone} at ${t.toFixed(3)}` }
        previous[i].copy(q)
      })
    })
    expect(peak, where).toBeLessThan(480)
  })

  it.each([
    { dt: 1 / 30, pause: 0.08 }, { dt: 1 / 120, pause: 0.08 },
    { dt: 1 / 30, pause: 0.38 }, { dt: 1 / 120, pause: 0.38 },
  ])('walks between attacks and resumes with its weapon at dt=$dt, pause=$pause', ({ dt, pause }) => {
    const c = make()
    const strikes: number[] = []
    let released = false
    let resumeAt = Infinity
    let exits = 0
    let walked = 0
    const chest = bodyCore(c, 'bone:chest', 0.15)
    const head = bodyCore(c, 'bone:head', 0.1)
    const inverse = new Matrix4(), p = new Vector3()
    const combat = runFight(c, [0], 12, (t) => {
      // Include the movement fade and re-entry, which stationary combo tests miss.
      for (const bone of ['hand.L', 'hand.R']) {
        const hand = new Vector3().setFromMatrixPosition(c.model.node(`bone:${bone}`).matrixWorld)
        for (const [box, node] of [[chest, 'bone:chest'], [head, 'bone:head']] as const) {
          p.copy(hand).applyMatrix4(inverse.copy(c.model.node(node).matrixWorld).invert())
          expect(box.containsPoint(p), `${bone} in ${node} while repositioning at ${t.toFixed(3)}`).toBe(false)
        }
      }
    }, dt, [], (t, fight, state) => {
      fight.onStrike = (index) => {
        strikes.push(index)
        if (index >= 2) expect(c.combat.effects.weapon!.presence).toBeGreaterThan(0.95)
      }
      fight.setSteer({ x: exits % 2 === 0 ? 1 : -1, z: 0 })
      if (!released && strikes.length > exits && fight.releasable) {
        fight.release()
        expect(fight.active).toBe(false)
        released = true
        exits++
        resumeAt = strikes.length < 5 ? t + pause : Infinity
      }
      if (released && t < resumeAt) {
        state.pos.x += dt * 2
        walked += dt * 2
      }
      if (t >= resumeAt) {
        fight.press()
        released = false
        resumeAt = Infinity
      }
    })
    expect(strikes).toEqual([0, 1, 2, 3, 0])
    expect(walked).toBeGreaterThan(2)
    expect(combat.active).toBe(false)
  })

  it('encloses the handle in the curled fingers instead of hanging it below the fist', () => {
    const c = make()
    const overlay = c.combat.overlay
    c.model.overlay = overlay
    overlay.weight = 1
    overlay.pose.v.set(overlay.neutral)
    overlay.pose.v[CH['R.grip']] = 1
    overlay.pose.v[CH['w.wield']] = 1
    overlay.pose.v[CH['w.y']] = 0.6
    c.model.pose(1, c.gait.update(0, 0, 0, false, true, null))
    const hand = c.model.node('bone:hand.R')
    const inverse = hand.matrixWorld.clone().invert()
    const points = [1, 2, 3].map((j) => new Vector3().setFromMatrixPosition(c.model.node(`bone:middle${j}.R`).matrixWorld).applyMatrix4(inverse))
    // Terminal phalanx is 85 mm on both rigs; test its pad centre.
    points.push(new Vector3(0, 0, -0.075).applyMatrix4(c.model.node('bone:middle3.R').matrixWorld).applyMatrix4(inverse))
    const [x, , z] = overlay.build.grip
    // Winding in the curl plane: the handle axis must be inside the finger loop.
    let enclosed = false
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i], b = points[j]
      if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) enclosed = !enclosed
    }
    expect(enclosed).toBe(true)
    const thumb = new Vector3().setFromMatrixPosition(c.model.node('bone:thumb3.R').matrixWorld).applyMatrix4(inverse)
    expect(Math.hypot(thumb.x - x, thumb.z - z)).toBeLessThan(0.14)
  })

  it.each([1 / 30, 1 / 120])('advances on every move and keeps the gained ground through recovery at dt=%s', (dt) => {
    const c = make()
    const forward = new Vector3(Math.sin(0.3), 0, Math.cos(0.3))
    let previous = 0
    let began = false
    const advances = [0, 0, 0, 0]
    runFight(c, clicks, 7, (t) => {
      const position = c.model.root.position.dot(forward)
      if (!began) { previous = position; began = true }
      const delta = position - previous
      expect(delta, `backwards at ${t.toFixed(2)}`).toBeGreaterThanOrEqual(-1e-5)
      const index = clicks.findLastIndex((click) => click <= t)
      advances[index] += delta
      previous = position
    }, dt)
    advances.forEach((distance, i) => expect(distance, `move ${i + 1} travel`).toBeGreaterThan([0.4, 0.5, 0.85, 8][i]))
  })
})

describe('truck finisher continuity', () => {
  for (const count of [1, 2, 3]) {
    it(`recovers without joint snaps when stopped after move ${count}`, () => {
      const c = FIGHTERS[0].make()
      const clicks = FIGHTERS[0].clicks.slice(0, count)
      const move = c.combat.moveset.moves[count - 1]
      const recovery = clicks.at(-1)! + Math.max(move.duration, move.chain[1])
      const bones = ['upperarm.R', 'hand.R', 'upperarm.L', 'hand.L']
      const previous = bones.map(() => new Quaternion())
      const q = new Quaternion()
      let peak = 0
      let where = ''
      runFight(c, clicks, 7, (t) => {
        bones.forEach((bone, i) => {
          c.model.node(`bone:${bone}`).getWorldQuaternion(q)
          const speed = previous[i].angleTo(q) / DT * 180 / Math.PI
          if (t > recovery && speed > peak) { peak = speed; where = `${bone} at ${t.toFixed(3)}` }
          previous[i].copy(q)
        })
      })
      expect(peak, where).toBeLessThan(480)
    })
  }

  it.each([1 / 30, 1 / 60, 1 / 120])('does not snap arm joints during the follow-through and return to stance at dt=%s', (dt) => {
    const c = FIGHTERS[0].make()
    const bones = ['upperarm.R', 'forearm.R', 'hand.R', 'upperarm.L', 'forearm.L', 'hand.L', 'chest']
    const previous = bones.map(() => new Quaternion())
    const q = new Quaternion()
    let peak = 0
    let where = ''
    let settledPeak = 0
    let settledWhere = ''
    runFight(c, FIGHTERS[0].clicks, 9, (t) => {
      bones.forEach((bone, i) => {
        c.model.node(`bone:${bone}`).getWorldQuaternion(q)
        const speed = previous[i].angleTo(q) / dt * 180 / Math.PI
        if (t > 4.15 && speed > peak) { peak = speed; where = `${bone} at ${t.toFixed(3)}` }
        if (t > 4.8 && speed > settledPeak) { settledPeak = speed; settledWhere = `${bone} at ${t.toFixed(3)}` }
        previous[i].copy(q)
      })
    }, dt)
    // At 60 Hz: no more than 8 degrees per frame while absorbing the slam,
    // and 6 degrees while lowering the hands and returning to the gait.
    expect(peak, where).toBeLessThan(480)
    expect(settledPeak, settledWhere).toBeLessThan(360)
  })
})
