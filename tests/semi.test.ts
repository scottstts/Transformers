import { describe, expect, it } from 'vitest'
import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three/webgpu'
import { RobotRig } from '../src/content/transformer/model/rig.ts'
import { buildCues } from '../src/content/transformer/cues.ts'
import { createSemi, SEMI_PROFILE } from '../src/content/semi/index.ts'
import { createSemiMaterials } from '../src/content/semi/materials.ts'
import { AudioMix } from '../src/audio/mix.ts'
import { createMotionState } from '../src/game/types.ts'
import { updateCar } from '../src/game/car-dynamics.ts'
import { resolveCircleCollisions } from '../src/game/movement.ts'
import { RobotJump } from '../src/game/jump.ts'
import { NO_CONTACT, REST_GAIT, readAsset, readWeapon } from './support/assets.ts'

const asset = { ...readAsset('semi'), weapon: readWeapon('semi-gun') }
const manifest = asset.manifest
const semi = createSemi(asset, NO_CONTACT, new AudioMix())
const model = semi.model

const nodes = (): Array<{ name: string; matrixWorld: Matrix4 }> => model.root.children[0].children
const worldMatrices = (): number[][] => nodes().map((node) => [...node.matrixWorld.elements])
const centre = (name: string): Vector3 => new Box3().setFromObject(model.node(name)).getCenter(new Vector3())
const position = (name: string): Vector3 => new Vector3().setFromMatrixPosition(model.node(name).matrixWorld)

describe('semi asset', () => {
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

  it('has a game material for every slot the Blender builds export, the gun included', () => {
    const materials = createSemiMaterials()
    const slots = new Set(manifest.nodes.flatMap((n) => n.meshes.map((m) => m.material)))
    for (const slot of slots) expect(materials[slot], slot).toBeDefined()
    const gun = semi.combat.effects.weapon!
    for (const { material } of gun.asset.meshes) expect(material === 'glow' || materials[material] !== undefined, material).toBe(true)
  })

  it('decodes the tailored panels: a second shape per morphed mesh, and its weight from the truck (0) to the robot (1)', () => {
    let morphed = 0
    for (const nodeMeshes of asset.meshes) {
      for (const { geometry } of nodeMeshes) {
        if (!geometry.hasAttribute('morphPosition')) continue
        morphed++
        expect(geometry.getAttribute('morphPosition').count).toBe(geometry.getAttribute('position').count)
        expect(geometry.getAttribute('morphNormal').count).toBe(geometry.getAttribute('position').count)
        // the bounds hold both shapes
        const box = geometry.boundingBox!
        const p = new Vector3()
        const morph = geometry.getAttribute('morphPosition')
        for (let i = 0; i < morph.count; i += 97) expect(box.containsPoint(p.fromBufferAttribute(morph, i))).toBe(true)
      }
    }
    expect(morphed).toBeGreaterThan(40)
    expect(asset.morph).toBeDefined()
    expect(asset.morph![0]).toBeCloseTo(0, 5)
    expect(asset.morph![asset.morph!.length - 1]).toBeCloseTo(1, 5)
    for (let f = 1; f < asset.morph!.length; f++) expect(asset.morph![f]).toBeGreaterThanOrEqual(asset.morph![f - 1] - 1e-6)
  })

  it('merges mirrored strokes into shared cues', () => {
    const cues = buildCues(manifest.events)
    expect(cues.length).toBeGreaterThan(20)
    expect(cues.length).toBeLessThan(manifest.events.length)
  })
})

describe('semi transformation playback', () => {
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

  it('faces +z as a truck with the van behind, and stands a head taller than the pickup at the robot station', () => {
    model.pose(0, null)
    // the cab ahead of the origin, the van's rear section well behind it
    expect(centre('asm:clip').z).toBeGreaterThan(1.5)
    expect(centre('asm:van4').z).toBeLessThan(-6)
    expect(centre('asm:van4').y).toBeGreaterThan(1.5)
    model.pose(1, null)
    const head = position('bone:head')
    expect(head.y).toBeGreaterThan(6.3)
    expect(Math.abs(head.z - manifest.rig.dims.robotF)).toBeLessThan(0.8)
    expect(centre('bone:foot.L').y).toBeLessThan(0.7)
    expect(centre('bone:foot.L').x).toBeGreaterThan(0.5)
    model.pose(0, null)
  })

  it('keeps the tyres on the ground (the van\'s too) and tilts the body on the suspension', () => {
    const pivot = SEMI_PROFILE.drive.pivotHeight
    model.suspension.makeTranslation(0, pivot, 0).multiply(new Matrix4().makeRotationFromEuler(new Euler(0.02, 0, -0.03))).multiply(new Matrix4().makeTranslation(0, -pivot, 0))
    model.steer = 0.4
    model.spin = 1.3
    model.pose(0, null)
    const wheels = model.contacts().wheels
    expect(wheels.length).toBe(8)
    expect(wheels.filter((w) => w.front).length).toBe(2)
    expect(wheels.filter((w) => w.trailer).length).toBe(2)
    for (const wheel of wheels) expect(Math.abs(wheel.p.y), `${wheel.front} ${wheel.trailer}`).toBeLessThan(0.03)
    model.suspension.identity()
    model.steer = 0
    model.spin = 0
  })

  it('swings the van about the kingpin in car form, and not once it transforms', () => {
    model.pose(0, null)
    const rear = centre('asm:van4')
    const cab = centre('asm:clip')
    model.articulation = 0.19
    model.pose(0, null)
    const swung = centre('asm:van4')
    // yawed to the left about the kingpin: its tail swings out to the right (-x), the cab untouched
    expect(swung.x - rear.x).toBeLessThan(-0.6)
    expect(centre('asm:clip').distanceTo(cab)).toBeLessThan(1e-6)
    // the van's wheels stay on the ground as it swings
    for (const wheel of model.contacts().wheels) expect(Math.abs(wheel.p.y)).toBeLessThan(0.03)
    model.pose(0.2, null)
    const held = worldMatrices()
    model.articulation = 0
    model.pose(0.2, null)
    const straight = worldMatrices()
    let worst = 0
    held.forEach((m, i) => m.forEach((v, j) => { worst = Math.max(worst, Math.abs(v - straight[i][j])) }))
    expect(worst).toBeLessThan(1e-6)
    model.pose(0, null)
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

  it('carries the van on the chest once the gait moves the robot', () => {
    // at the stand the live pose puts the van exactly where the bake does
    model.pose(1, null)
    const baked = new Matrix4().copy(model.node('asm:van0').matrixWorld)
    model.pose(1, REST_GAIT)
    let worst = 0
    model.node('asm:van0').matrixWorld.elements.forEach((v, j) => { worst = Math.max(worst, Math.abs(v - baked.elements[j])) })
    expect(worst).toBeLessThan(0.02)
    // walking: the van keeps its place on the chest
    const gait = semi.gait
    const relative = new Matrix4()
    let first: Matrix4 | null = null
    let drift = 0
    for (let frame = 0; frame < 90; frame++) {
      model.pose(1, gait.update(1 / 60, SEMI_PROFILE.robot.walkSpeed, 0, false, true))
      relative.copy(model.node('bone:chest').matrixWorld).invert().multiply(model.node('asm:van0').matrixWorld)
      if (!first) first = relative.clone()
      else relative.elements.forEach((v, j) => { drift = Math.max(drift, Math.abs(v - first!.elements[j])) })
    }
    expect(drift).toBeLessThan(1e-4)
    model.pose(0, null)
  })

  it('keeps the robot on the ground through the handover to the gait', () => {
    model.pose(1, null)
    const baked = model.lift
    model.pose(1, REST_GAIT)
    expect(Math.abs(model.lift - baked)).toBeLessThan(0.02)
    for (let T = 0.9; T <= 1.0001; T += 0.01) {
      model.pose(Math.min(T, 1), REST_GAIT)
      expect(Math.min(model.footClearance('L'), model.footClearance('R'))).toBeLessThan(0.04)
    }
    model.pose(0, null)
  })
})

describe('semi locomotion', () => {
  it('walks and runs on finite poses with footfalls and grounded feet', () => {
    const gait = semi.gait
    let footfalls = 0
    let groundedFrames = 0
    for (const [speed, running] of [[SEMI_PROFILE.robot.walkSpeed, false], [SEMI_PROFILE.robot.runSpeed, true]] as const) {
      for (let frame = 0; frame < 180; frame++) {
        model.pose(1, gait.update(1 / 60, speed, 0, running, true))
        expect(Number.isFinite(model.lift)).toBe(true)
        const clearance = Math.min(model.footClearance('L'), model.footClearance('R'))
        expect(clearance).toBeGreaterThan(-0.001)
        if (clearance < 0.03) groundedFrames++
        footfalls += gait.events.length
        gait.events.length = 0
      }
    }
    expect(footfalls).toBeGreaterThanOrEqual(2)
    expect(groundedFrames).toBeGreaterThan(180)
  })

  it('jumps: the whole robot leaves the ground and lands back on its feet', () => {
    const gait = semi.gait
    const jump = new RobotJump()
    jump.start()
    let highest = 0
    for (let frame = 0; frame < 150; frame++) {
      model.pose(1, gait.update(1 / 60, 0, 0, false, true, jump.update(1 / 60)))
      highest = Math.max(highest, Math.min(model.footClearance('L'), model.footClearance('R')))
    }
    expect(highest).toBeGreaterThan(0.9)
    for (let frame = 0; frame < 60; frame++) model.pose(1, gait.update(1 / 60, 0, 0, false, true))
    expect(Math.min(model.footClearance('L'), model.footClearance('R'))).toBeLessThan(0.03)
    model.pose(0, null)
  })
})

describe('semi truck', () => {
  it('pulls away and reaches its top speeds, boosted faster', () => {
    const top = (boost: boolean): number => {
      const state = createMotionState()
      const controls = { driveThrottle: 1, driveSteering: 0, driftHeld: boost }
      for (let i = 0; i < 60 * 40; i++) updateCar(state, controls, 1 / 60, false, SEMI_PROFILE.drive)
      return state.speed
    }
    const normal = top(false)
    const boosted = top(true)
    expect(normal).toBeGreaterThan(SEMI_PROFILE.drive.maxSpeed * 0.9)
    expect(normal).toBeLessThanOrEqual(SEMI_PROFILE.drive.maxSpeed)
    expect(boosted).toBeGreaterThan(normal)
  })

  it('swings its trailer out behind a turn, within its stop, and straightens it after', () => {
    const state = createMotionState()
    const drive = { driveThrottle: 1, driveSteering: 0, driftHeld: false }
    for (let i = 0; i < 60 * 4; i++) updateCar(state, drive, 1 / 60, false, SEMI_PROFILE.drive)
    const turn = { driveThrottle: 0.6, driveSteering: -0.4, driftHeld: false }
    let peak = 0
    for (let i = 0; i < 60 * 3; i++) {
      updateCar(state, turn, 1 / 60, false, SEMI_PROFILE.drive)
      peak = Math.max(peak, Math.abs(state.articulation))
      expect(Math.abs(state.articulation)).toBeLessThanOrEqual(SEMI_PROFILE.drive.trailer!.limit + 1e-9)
    }
    expect(peak).toBeGreaterThan(0.05)
    for (let i = 0; i < 60 * 6; i++) updateCar(state, drive, 1 / 60, false, SEMI_PROFILE.drive)
    expect(Math.abs(state.articulation)).toBeLessThan(0.01)
  })

  it('keeps the whole rig out of a boulder, the van included', () => {
    const state = createMotionState()
    state.yaw = 0
    // a boulder beside the van's rear, 8 m behind the origin
    const rock = { x: 1.9, z: -8, r: 1 }
    resolveCircleCollisions(state, [rock], semi.robotOffset, SEMI_PROFILE)
    expect(state.pos.x).toBeLessThan(-0.3)
  })
})
