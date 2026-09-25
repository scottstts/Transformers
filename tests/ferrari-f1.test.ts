import { describe, expect, it } from 'vitest'
import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three/webgpu'
import { RobotRig } from '../src/content/transformer/model/rig.ts'
import { buildCues } from '../src/content/transformer/cues.ts'
import { createF1, F1_PROFILE } from '../src/content/ferrari-f1/index.ts'
import { createF1Materials } from '../src/content/ferrari-f1/materials.ts'
import { Gearbox, GEAR_TOP, IDLE, REDLINE } from '../src/content/ferrari-f1/audio/power-unit.ts'
import { AudioMix } from '../src/audio/mix.ts'
import { createMotionState } from '../src/game/types.ts'
import { updateCar } from '../src/game/car-dynamics.ts'
import { RobotJump } from '../src/game/jump.ts'
import { NO_CONTACT, REST_GAIT, readAsset } from './support/assets.ts'

const asset = readAsset('ferrari-f1')
const manifest = asset.manifest
const f1 = createF1(asset, NO_CONTACT, new AudioMix())
const model = f1.model

const nodes = (): Array<{ name: string; matrixWorld: Matrix4 }> => model.root.children[0].children
const worldMatrices = (): number[][] => nodes().map((node) => [...node.matrixWorld.elements])
const centre = (name: string): Vector3 => {
  // assembly nodes sit at the car origin with their geometry in car coordinates: use the parts' centre
  const node = model.root.children[0].children.find((n) => n.name === name)!
  return new Box3().setFromObject(node).getCenter(new Vector3())
}

describe('ferrari f1 asset', () => {
  it('is well formed: parents first, indices in range, unit quaternions, events inside the playback', () => {
    manifest.nodes.forEach((node, i) => expect(node.parent).toBeLessThan(i))
    for (const nodeMeshes of asset.meshes) {
      for (const { geometry } of nodeMeshes) {
        const count = geometry.getAttribute('position').count
        const index = geometry.getIndex()!.array
        let max = 0
        for (let k = 0; k < index.length; k++) max = Math.max(max, index[k])
        expect(max).toBeLessThan(count)
      }
    }
    for (let k = 0; k < asset.tracks.length; k += 7) {
      const q = Math.hypot(asset.tracks[k + 3], asset.tracks[k + 4], asset.tracks[k + 5], asset.tracks[k + 6])
      expect(Math.abs(q - 1)).toBeLessThan(1e-3)
    }
    expect(asset.lift.every(Number.isFinite)).toBe(true)
    for (const e of manifest.events) {
      expect(e.t1).toBeGreaterThan(e.t0)
      expect(e.t0).toBeGreaterThanOrEqual(0)
      expect(e.t1).toBeLessThanOrEqual(1)
    }
  })

  it('has a game material for every slot the Blender build exports', () => {
    const materials = createF1Materials()
    const slots = new Set(manifest.nodes.flatMap((n) => n.meshes.map((m) => m.material)))
    for (const slot of slots) expect(materials[slot], slot).toBeDefined()
  })

  it('merges mirrored strokes into shared cues', () => {
    const cues = buildCues(manifest.events)
    expect(cues.length).toBeGreaterThan(20)
    expect(cues.length).toBeLessThan(manifest.events.length)
    expect(cues.every((c, i) => i === 0 || cues[i - 1].event.t0 <= c.event.t0)).toBe(true)
  })
})

describe('ferrari f1 transformation playback', () => {
  it('runs forward and back through finite poses and returns to the fold', () => {
    model.pose(0, null)
    const folded = worldMatrices()
    for (let i = 1; i <= 100; i++) {
      model.pose(i / 100, null)
      expect(Number.isFinite(model.lift)).toBe(true)
    }
    for (let i = 99; i >= 0; i--) model.pose(i / 100, null)
    const back = worldMatrices()
    let worst = 0
    back.forEach((m, i) => m.forEach((v, j) => { worst = Math.max(worst, Math.abs(v - folded[i][j])) }))
    expect(worst).toBeLessThan(1e-5)
  })

  it('faces +z as a car and stands upright at the robot station', () => {
    model.pose(0, null)
    expect(centre('asm:toecap.L').z).toBeGreaterThan(2.3)
    expect(centre('asm:toecap.L').x).toBeGreaterThan(0)
    expect(centre('asm:tail').z).toBeLessThan(-1.5)
    expect(centre('asm:chest').y).toBeLessThan(1.2)
    model.pose(1, null)
    const head = centre('part:R.head.helmet')
    expect(head.y).toBeGreaterThan(3.1)
    expect(head.y).toBeLessThan(4.2)
    expect(Math.abs(head.z - manifest.rig.dims.robotF)).toBeLessThan(0.5)
    expect(centre('bone:foot.L').y).toBeLessThan(0.45)
    model.pose(0, null)
  })

  it('keeps the wheels on the ground and tilts the body on the suspension', () => {
    const pivot = F1_PROFILE.drive.pivotHeight
    model.suspension.makeTranslation(0, pivot, 0).multiply(new Matrix4().makeRotationFromEuler(new Euler(0.015, 0, -0.018))).multiply(new Matrix4().makeTranslation(0, -pivot, 0))
    model.steer = 0.4
    model.spin = 1.3
    model.pose(0, null)
    const wheels = model.contacts().wheels
    expect(wheels.length).toBe(4)
    expect(wheels.filter((w) => w.front).length).toBe(2)
    // the rear tyres carry the car; the Blender car's front hubs sit ~1 cm high (the tyres just clear)
    for (const wheel of wheels) expect(Math.abs(wheel.p.y)).toBeLessThan(wheel.front ? 0.012 : 0.006)
    model.suspension.identity()
    model.steer = 0
    model.spin = 0
  })

  it('hands over to the live rig without a jump: the TypeScript rig reproduces the Blender stand', () => {
    const rig = new RobotRig(manifest.rig.bones, manifest.rig.stand, manifest.rig.dims)
    rig.poseLive(REST_GAIT)
    const last = (manifest.frames - 1) * manifest.nodes.length * 7
    let worstT = 0
    let worstQ = 0
    let where = ''
    manifest.nodes.forEach((node, i) => {
      if (node.kind !== 'bone') return
      const b = rig.index[node.name.slice(5)]
      const o = last + i * 7
      const t = new Vector3(asset.tracks[o], asset.tracks[o + 1], asset.tracks[o + 2])
      const q = new Quaternion(asset.tracks[o + 3], asset.tracks[o + 4], asset.tracks[o + 5], asset.tracks[o + 6])
      let live: { t: Vector3; q: Quaternion }
      if (node.parent < 0) {
        const lt = new Vector3(); const lq = new Quaternion(); const ls = new Vector3()
        rig.world[b].decompose(lt, lq, ls)
        live = { t: lt, q: lq }
      } else {
        live = { t: rig.local[b].t.clone().add(rig.offset[b]), q: rig.local[b].q }
      }
      const dq = 1 - Math.abs(q.dot(live.q))
      if (dq > worstQ) where = node.name
      worstT = Math.max(worstT, t.distanceTo(live.t))
      worstQ = Math.max(worstQ, dq)
    })
    expect(worstT).toBeLessThan(2e-3)
    expect(worstQ, where).toBeLessThan(1e-4)
  })

  it('keeps the robot on the ground through the handover to the gait', () => {
    model.pose(1, null)
    const baked = model.lift
    model.pose(1, REST_GAIT)
    expect(Math.abs(model.lift - baked)).toBeLessThan(0.01)
    // blending into the live pose over the last stretch of the timeline: soles stay down
    for (let T = 0.9; T <= 1.0001; T += 0.01) {
      model.pose(Math.min(T, 1), REST_GAIT)
      expect(Math.min(model.footClearance('L'), model.footClearance('R'))).toBeLessThan(0.03)
    }
    model.pose(0, null)
  })
})

describe('ferrari f1 locomotion', () => {
  it('walks and runs on finite poses with footfalls and grounded feet', () => {
    const gait = f1.gait
    let footfalls = 0
    let lowest = Infinity
    for (const [speed, running] of [[F1_PROFILE.robot.walkSpeed, false], [F1_PROFILE.robot.runSpeed, true]] as const) {
      for (let frame = 0; frame < 180; frame++) {
        model.pose(1, gait.update(1 / 60, speed, 0, running, true))
        expect(Number.isFinite(model.lift)).toBe(true)
        const feet = model.contacts().feet
        lowest = Math.min(lowest, feet.L.y, feet.R.y)
        footfalls += gait.events.length
        gait.events.length = 0
      }
    }
    expect(footfalls).toBeGreaterThanOrEqual(2)
    expect(Math.min(model.footClearance('L'), model.footClearance('R'))).toBeLessThan(0.1)
    expect(Number.isFinite(lowest)).toBe(true)
  })

  it('jumps: the whole robot leaves the ground and lands back on its feet', () => {
    const gait = f1.gait
    const jump = new RobotJump()
    jump.start()
    let highest = 0
    for (let frame = 0; frame < 150; frame++) {
      model.pose(1, gait.update(1 / 60, 0, 0, false, true, jump.update(1 / 60)))
      expect(Number.isFinite(model.lift)).toBe(true)
      highest = Math.max(highest, Math.min(model.footClearance('L'), model.footClearance('R')))
    }
    expect(highest).toBeGreaterThan(0.9)
    for (let frame = 0; frame < 60; frame++) model.pose(1, gait.update(1 / 60, 0, 0, false, true))
    expect(Math.min(model.footClearance('L'), model.footClearance('R'))).toBeLessThan(0.02)
    model.pose(0, null)
  })

  it('measures a planted sole for footprints: foot-sized, under the foot, heading forward', () => {
    model.pose(1, null)
    const sole = model.sole('L', { center: new Vector3(), forward: new Vector3(), length: 0, width: 0 })
    expect(sole.length).toBeGreaterThan(0.3)
    expect(sole.length).toBeLessThan(1.5)
    expect(sole.width).toBeGreaterThan(0.2)
    expect(sole.width).toBeLessThan(0.9)
    expect(sole.forward.z).toBeGreaterThan(0.9)
    const ankle = model.contacts().feet.L
    expect(Math.hypot(sole.center.x - ankle.x, sole.center.z - ankle.z)).toBeLessThan(sole.length)
    model.pose(0, null)
  })
})

describe('ferrari f1 car', () => {
  it('pulls away and reaches its top speeds, boosted faster', () => {
    const top = (boost: boolean): number => {
      const state = createMotionState()
      const controls = { driveThrottle: 1, driveSteering: 0, driftHeld: boost }
      for (let i = 0; i < 60 * 30; i++) updateCar(state, controls, 1 / 60, false, F1_PROFILE.drive)
      return state.speed
    }
    const normal = top(false)
    const boosted = top(true)
    expect(normal).toBeGreaterThan(F1_PROFILE.drive.maxSpeed * 0.9)
    expect(normal).toBeLessThanOrEqual(F1_PROFILE.drive.maxSpeed)
    expect(boosted).toBeGreaterThan(normal)
    expect(boosted).toBeLessThanOrEqual(F1_PROFILE.drive.boostSpeed)
  })

  it('shifts up through all eight gears and back down, the engine inside its rev range', () => {
    const box = new Gearbox()
    const gears: number[] = []
    for (let v = 0; v <= F1_PROFILE.drive.boostSpeed; v += 0.05) {
      box.update(v, 1)
      gears.push(box.gear)
      expect(box.rpm).toBeGreaterThanOrEqual(IDLE)
      expect(box.rpm).toBeLessThanOrEqual(REDLINE + 200)
    }
    expect(gears.every((g, i) => i === 0 || g >= gears[i - 1])).toBe(true)
    expect(box.gear).toBe(GEAR_TOP.length - 1)
    for (let v = F1_PROFILE.drive.boostSpeed; v >= 0; v -= 0.05) box.update(v, 0)
    expect(box.gear).toBe(0)
    expect(box.rpm).toBe(IDLE)
  })
})
