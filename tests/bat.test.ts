import { describe, expect, it } from 'vitest'
import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three/webgpu'
import { RobotRig } from '../src/content/transformer/model/rig.ts'
import { buildCues } from '../src/content/transformer/cues.ts'
import { BAT_PROFILE, createBat } from '../src/content/bat/index.ts'
import { createBatMaterials, createSpearMaterials } from '../src/content/bat/materials.ts'
import { Automatic } from '../src/content/bat/audio/v8.ts'
import { AudioMix } from '../src/audio/mix.ts'
import { createMotionState } from '../src/game/types.ts'
import { updateCar } from '../src/game/car-dynamics.ts'
import { RobotJump } from '../src/game/jump.ts'
import { NO_CONTACT, REST_GAIT, readAsset, readWeapon } from './support/assets.ts'
import { runFight } from './support/fight.ts'
import { crossings, surfaces } from './support/clash.ts'
import { Vortex } from '../src/content/bat/combat/fx/vortex.ts'

const asset = { ...readAsset('bat'), weapon: readWeapon('bat-spear') }
const manifest = asset.manifest
const bat = createBat(asset, NO_CONTACT, new AudioMix())
const model = bat.model

const nodes = (): Array<{ name: string; matrixWorld: Matrix4 }> => model.root.children[0].children
const worldMatrices = (): number[][] => nodes().map((node) => [...node.matrixWorld.elements])
const centre = (name: string): Vector3 => new Box3().setFromObject(model.node(name)).getCenter(new Vector3())
const position = (name: string): Vector3 => new Vector3().setFromMatrixPosition(model.node(name).matrixWorld)
/** The world-hosted wheel groups and the bones that carry them in robot form. */
const CARRIED: Array<[string, string]> = [['asm:frontWheel.L', 'bone:clav.L'], ['asm:frontWheel.R', 'bone:clav.R'], ['asm:corner.L', 'bone:shin.L'], ['asm:corner.R', 'bone:shin.R']]

describe('bat asset', () => {
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

  it('has a game material for every slot the Blender builds export, the spear included', () => {
    const materials = createBatMaterials()
    const slots = new Set(manifest.nodes.flatMap((n) => n.meshes.map((m) => m.material)))
    for (const slot of slots) expect(materials[slot], slot).toBeDefined()
    const spear = createSpearMaterials()
    for (const { material } of bat.combat.effects.weapon!.asset.meshes) expect(spear[material], material).toBeDefined()
  })

  it('merges mirrored strokes into shared cues', () => {
    const cues = buildCues(manifest.events)
    expect(cues.length).toBeGreaterThan(20)
    expect(cues.length).toBeLessThan(manifest.events.length)
  })
})

describe('bat transformation playback', () => {
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

  it('faces +z as a car with the nozzle at the tail, and stands about the pickup robot\'s height with the nozzle down its back', () => {
    model.pose(0, null)
    expect(centre('asm:keel').z).toBeGreaterThan(1)
    const jet = bat.effects.afterburner
    jet.update(0)
    expect(jet.lip.z).toBeLessThan(-2)
    expect(jet.axis.z).toBeLessThan(-0.95)
    model.pose(1, null)
    jet.update(0)
    const head = position('bone:head')
    expect(head.y).toBeGreaterThan(4.4)
    expect(Math.abs(head.z - manifest.rig.dims.robotF)).toBeLessThan(0.8)
    // on the back, behind the robot, pointing at the ground
    expect(jet.lip.z).toBeLessThan(manifest.rig.dims.robotF - 0.6)
    expect(jet.lip.y).toBeGreaterThan(2.5)
    expect(jet.axis.y).toBeLessThan(-0.95)
    expect(centre('bone:foot.L').y).toBeLessThan(0.7)
    model.pose(0, null)
  })

  it('keeps the tyres on the ground and tilts the body on the suspension', () => {
    const pivot = BAT_PROFILE.drive.pivotHeight
    model.suspension.makeTranslation(0, pivot, 0).multiply(new Matrix4().makeRotationFromEuler(new Euler(0.02, 0, -0.03))).multiply(new Matrix4().makeTranslation(0, -pivot, 0))
    model.steer = 0.4
    model.spin = 1.3
    model.pose(0, null)
    const wheels = model.contacts().wheels
    expect(wheels.length).toBe(6)
    expect(wheels.filter((w) => w.front).length).toBe(2)
    for (const wheel of wheels) expect(Math.abs(wheel.p.y), `${wheel.front}`).toBeLessThan(0.03)
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

  it('carries the wheel groups on the shoulders and calves once the gait moves the robot', () => {
    model.pose(1, null)
    const baked = CARRIED.map(([group]) => new Matrix4().copy(model.node(group).matrixWorld))
    model.pose(1, REST_GAIT)
    CARRIED.forEach(([group], k) => {
      let worst = 0
      model.node(group).matrixWorld.elements.forEach((v, j) => { worst = Math.max(worst, Math.abs(v - baked[k].elements[j])) })
      expect(worst, group).toBeLessThan(0.02)
    })
    const gait = bat.gait
    const relative = new Matrix4()
    const first: Array<Matrix4 | null> = CARRIED.map(() => null)
    let drift = 0
    for (let frame = 0; frame < 90; frame++) {
      model.pose(1, gait.update(1 / 60, BAT_PROFILE.robot.walkSpeed, 0, false, true))
      CARRIED.forEach(([group, bone], k) => {
        relative.copy(model.node(bone).matrixWorld).invert().multiply(model.node(group).matrixWorld)
        if (!first[k]) first[k] = relative.clone()
        else relative.elements.forEach((v, j) => { drift = Math.max(drift, Math.abs(v - first[k]!.elements[j])) })
      })
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

describe('bat locomotion', () => {
  it('walks and runs on finite poses with footfalls and grounded feet', () => {
    const gait = bat.gait
    let footfalls = 0
    let groundedFrames = 0
    for (const [speed, running] of [[BAT_PROFILE.robot.walkSpeed, false], [BAT_PROFILE.robot.runSpeed, true]] as const) {
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

  it('runs with its feet drawn in under its hips, not straddling', () => {
    const gait = bat.gait
    let widest = 0
    for (let frame = 0; frame < 240; frame++) {
      model.pose(1, gait.update(1 / 120, BAT_PROFILE.robot.runSpeed, 0, true, true))
      if (frame < 120) continue
      for (const side of ['L', 'R'] as const) {
        const hip = position(`bone:thigh.${side}`)
        const ankle = position(`bone:foot.${side}`)
        widest = Math.max(widest, Math.abs(ankle.x) - Math.abs(hip.x))
      }
    }
    // the stand's feet are 0.46 m outside the hips; at a run they come in under them
    expect(widest).toBeLessThan(0.2)
    model.pose(0, null)
  })

  it('jumps: the whole robot leaves the ground and lands back on its feet', () => {
    const gait = bat.gait
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

describe('bat car', () => {
  it('pulls away and reaches its top speeds, boosted faster', () => {
    const top = (boost: boolean): number => {
      const state = createMotionState()
      const controls = { driveThrottle: 1, driveSteering: 0, driftHeld: boost }
      for (let i = 0; i < 60 * 40; i++) updateCar(state, controls, 1 / 60, false, BAT_PROFILE.drive)
      return state.speed
    }
    const normal = top(false)
    const boosted = top(true)
    expect(normal).toBeGreaterThan(BAT_PROFILE.drive.maxSpeed * 0.9)
    expect(normal).toBeLessThanOrEqual(BAT_PROFILE.drive.maxSpeed)
    expect(boosted).toBeGreaterThan(normal)
  })

  it('lights the afterburner on the boost and spools it down after, in car form only', () => {
    const effects = bat.effects
    const state = createMotionState()
    model.pose(0, null)
    state.boost = true
    state.throttle = 1
    for (let i = 0; i < 60; i++) effects.update(1 / 60, state)
    expect(effects.afterburner.power).toBeGreaterThan(0.9)
    state.boost = false
    for (let i = 0; i < 180; i++) effects.update(1 / 60, state)
    expect(effects.afterburner.power).toBe(0)
    // standing in robot form, the boost is not the jet's: only the fight burns it
    state.progress = 1
    state.boost = true
    for (let i = 0; i < 60; i++) effects.update(1 / 60, state)
    expect(effects.afterburner.power).toBe(0)
  })

  it('shifts its automatic up through all four gears and back, inside the rev range', () => {
    const box = new Automatic()
    const gears: number[] = []
    for (let v = 0; v <= 46; v += 0.25) {
      box.update(v, 1)
      gears.push(box.gear)
      expect(box.rpm).toBeLessThanOrEqual(6150)
    }
    expect(Math.max(...gears)).toBe(3)
    for (let i = 1; i < gears.length; i++) expect(gears[i]).toBeGreaterThanOrEqual(gears[i - 1])
    for (let v = 46; v >= 0; v -= 0.25) box.update(v, 0)
    expect(box.gear).toBe(0)
  })
})

describe('bat fighting', () => {
  /** The spear hand's own chain: the butt cap may brush its gauntlet, which the clash probe watches (tools/clash-probe.mjs). */
  const SPEAR_ARM = /(clav|upperarm|forearm|hand|index\d|middle\d|ring\d|pinky\d|thumb\d)\.R($|\.)/
  /** What an arm must never pass through: the torso, the head and the legs. */
  const TRUNK = /bone:(pelvis|spine|chest|neck|hip|thigh|shin|foot|toe)\.?|part:R\.(chest|head|thigh|shin)|asm:(keel|grille|chev|collar|cape|pod|scapula|wing|thighPlate|shinPlate|tail)/

  const check = (clicks: number[], specials: number[], until: number): string[] => {
    const c = createBat({ ...readAsset('bat'), weapon: readWeapon('bat-spear') }, NO_CONTACT, new AudioMix())
    const bodies = surfaces(c.model.root.children[0].children)
    const weapon = c.model.node('bone:hand.R').children.find((o) => o.name.startsWith('weapon:'))!
    const extent = c.combat.effects.weapon!.asset.manifest.extent
    const found = new Set<string>()
    const a = new Vector3(), b = new Vector3(), hits: number[] = []
    runFight(c, clicks, until, (t) => {
      const formed = c.combat.effects.weapon!
      if (weapon.visible) {
        const reach = formed.presence * Math.max(-extent[0], extent[1])
        const z0 = Math.max(-reach, extent[0]), z1 = Math.min(reach, extent[1])
        for (let z = z0; z < z1; z += 0.2) {
          a.set(0, 0, z).applyMatrix4(weapon.matrixWorld)
          b.set(0, 0, Math.min(z + 0.2, z1)).applyMatrix4(weapon.matrixWorld)
          for (const body of bodies) {
            if (SPEAR_ARM.test(body.name)) continue
            hits.length = 0
            crossings(body, a, b, hits)
            if (hits.length) found.add(`spear ${z.toFixed(1)} through ${body.name} at ${t.toFixed(2)}`)
          }
        }
      }
      for (const side of ['R', 'L']) {
        a.setFromMatrixPosition(c.model.node(`bone:forearm.${side}`).matrixWorld)
        b.setFromMatrixPosition(c.model.node(`bone:middle1.${side}`).matrixWorld)
        for (const body of bodies) {
          if (!TRUNK.test(body.name)) continue
          hits.length = 0
          crossings(body, a, b, hits)
          if (hits.length) found.add(`${side} forearm through ${body.name} at ${t.toFixed(2)}`)
        }
      }
    }, 1 / 60, specials)
    return [...found]
  }

  it('keeps the spear and the forearms out of its body through the whole combo', () => {
    expect(check([0, 0.6, 1.4, 3.3], [], 7)).toEqual([])
  })

  it('keeps the spear and the forearms out of its body through the special', () => {
    expect(check([], [0], 10.5)).toEqual([])
  })

  it('lets the vortex dust go: no mote outlives its cap, and a released vortex clears within 0.6 s', () => {
    const vortex = new Vortex()
    const center = new Vector3()
    for (let i = 0; i < 60; i++) {
      vortex.emit(center, 17, 150, 1 / 60, 1, 6, 4.5, 3.2)
      vortex.update(1 / 60)
    }
    for (let i = 0; i < 36; i++) vortex.update(1 / 60)
    expect(vortex.mesh.visible).toBe(true)
    vortex.release()
    for (let i = 0; i < 37; i++) vortex.update(1 / 60)
    expect(vortex.mesh.visible).toBe(false)
    // left alone, the far motes are drawn in within the cap
    for (let i = 0; i < 30; i++) {
      vortex.emit(center, 17, 150, 1 / 60, 1, 6, 4.5, 3.2)
      vortex.update(1 / 60)
    }
    for (let i = 0; i < 60 * 2.65; i++) vortex.update(1 / 60)
    expect(vortex.mesh.visible).toBe(false)
  })
})
