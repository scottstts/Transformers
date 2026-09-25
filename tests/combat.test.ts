import { describe, expect, it } from 'vitest'
import { Box3, Matrix4, PerspectiveCamera, Vector3, type Mesh } from 'three/webgpu'
import { createCybertruck } from '../src/content/cybertruck/index.ts'
import { createF1 } from '../src/content/ferrari-f1/index.ts'
import { AudioMix } from '../src/audio/mix.ts'
import { createMotionState } from '../src/game/types.ts'
import { RobotCombat } from '../src/game/combat/robot-combat.ts'
import { CameraFx } from '../src/game/combat/camera-fx.ts'
import { CHANNEL_NAMES } from '../src/content/transformer/combat/pose.ts'
import type { Character } from '../src/content/transformer/character.ts'
import { NO_CONTACT, readAsset, readWeapon } from './support/assets.ts'

const DT = 1 / 60

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

/** A fight run headlessly in the session's order; `each` sees every frame. */
function fight(c: Character, clicks: number[], until: number, each: (t: number, combat: RobotCombat) => void): RobotCombat {
  const state = createMotionState()
  state.mode = 'robot'
  state.target = 1
  state.progress = 1
  state.yaw = 0.3
  const combat = new RobotCombat(c.combat, c.model, c.robotOffset, state, new CameraFx())
  const aim = new PerspectiveCamera()
  const pending = [...clicks]
  for (let t = -0.5; t <= until; t += DT) {
    while (pending.length && pending[0] <= t) {
      pending.shift()
      combat.press()
    }
    aim.position.set(state.pos.x, 3, state.pos.z)
    aim.lookAt(state.pos.x + Math.sin(state.yaw), 3, state.pos.z + Math.cos(state.yaw))
    aim.updateMatrixWorld()
    combat.update(DT, state, aim)
    const pose = c.gait.update(DT, state.speed, state.yawRate, false, true, null)
    if (combat.poseWeight > 0) pose.air = (pose.air ?? 0) + (combat.air - (pose.air ?? 0)) * combat.poseWeight
    c.model.root.position.copy(state.pos)
    c.model.root.rotation.set(0, state.yaw, 0)
    c.model.pose(1, pose)
    c.effects.update(DT, state)
    if (t >= 0) each(t, combat)
  }
  return combat
}

/** A node's own geometry bounds, shrunk toward their centre (a conservative solid to keep out of). */
function core(c: Character, node: string, shrink: number): Box3 {
  const box = new Box3()
  for (const child of c.model.node(node).children) {
    const g = (child as Mesh).geometry
    if (!g) continue
    g.computeBoundingBox()
    box.union(g.boundingBox!)
  }
  const size = box.getSize(new Vector3()).multiplyScalar(shrink / 2)
  return box.expandByVector(size.negate())
}

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

  it('plays the whole combo without floating feet, limbs through the body or a weapon left behind', () => {
    const c = make()
    const chest = core(c, 'bone:chest', 0.3)
    const pelvis = core(c, 'bone:pelvis', 0.3)
    const head = core(c, 'bone:head', 0.2)
    const inv = new Matrix4()
    const p = new Vector3()
    const weapon = c.model.node('bone:hand.R').children.find((o) => o.name.startsWith('weapon:'))!
    expect(weapon).toBeDefined()
    expect(weapon.children.length).toBeGreaterThan(0)
    let frames = 0
    let armed = 0
    const inside = (box: Box3, node: string, world: Vector3): boolean => box.containsPoint(p.copy(world).applyMatrix4(inv.copy(c.model.node(node).matrixWorld).invert()))
    const combat = fight(c, clicks, 7, (t, fight) => {
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
        // only what has formed of it: out to its presence along the haft
        const m = formed.asset.manifest
        const reach = formed.presence * Math.max(-m.extent[0], m.extent[1])
        for (let z = 0.3; z <= Math.min(reach, m.extent[1]); z += 0.2) {
          const w = new Vector3(0, 0, z).applyMatrix4(weapon.matrixWorld)
          for (const [box, node] of [[chest, 'bone:chest'], [head, 'bone:head']] as const) {
            expect(inside(box, node, w), `weapon inside ${node} at ${t.toFixed(2)}`).toBe(false)
          }
        }
      }
    })
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
    const combat = fight(c, [0], 3, () => { seenWeapon ||= weapon.visible })
    expect(seenWeapon).toBe(false)
    expect(combat.active).toBe(false)
  })
})
