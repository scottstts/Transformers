import { describe, expect, it } from 'vitest'
import { Box3, Euler, Matrix4, Quaternion, Vector3, type Mesh } from 'three/webgpu'
import { RobotRig } from '../src/content/transformer/model/rig.ts'
import { RobotGait } from '../src/content/transformer/animation/gait.ts'
import { buildCues } from '../src/content/transformer/cues.ts'
import { createCybertruck } from '../src/content/cybertruck/index.ts'
import { AudioMix } from '../src/audio/mix.ts'
import { NO_CONTACT, REST_GAIT, readAsset } from './support/assets.ts'
import { Thrusters } from '../src/content/cybertruck/fx/thrusters.ts'
import { RobotJump } from '../src/game/jump.ts'

const asset = readAsset('cybertruck')
const manifest = asset.manifest
const model = createCybertruck(asset, NO_CONTACT, new AudioMix()).model

const worldMatrices = (): number[][] => model.root.children[0].children.map((node) => [...node.matrixWorld.elements])

describe('cybertruck asset', () => {
  it('is well formed: parents first, indices in range, unit quaternions', () => {
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
    for (const e of manifest.events) expect(e.t1).toBeGreaterThan(e.t0)
  })

  it('merges mirrored strokes into shared cues', () => {
    const cues = buildCues(manifest.events)
    expect(cues.length).toBeGreaterThan(10)
    expect(cues.length).toBeLessThan(manifest.events.length)
    expect(cues.every((c, i) => i === 0 || cues[i - 1].event.t0 <= c.event.t0)).toBe(true)
  })
})

describe('cybertruck transformation playback', () => {
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

  it('faces +z as a truck and stands upright at the robot station', () => {
    const at = (name: string): Vector3 => {
      // assembly nodes sit at the car origin with their geometry in car coordinates: use the parts' centre
      const node = model.root.children[0].children.find((n) => n.name === name)!
      return new Box3().setFromObject(node).getCenter(new Vector3())
    }
    model.pose(0, null)
    expect(at('asm:toecap.L').z).toBeGreaterThan(2.3)
    expect(at('asm:tailgate').z).toBeLessThan(-2.3)
    expect(at('asm:toecap.L').x).toBeGreaterThan(0)
    model.pose(1, null)
    const head = at('bone:head')
    expect(head.y).toBeGreaterThan(4.3)
    expect(Math.abs(head.z - manifest.rig.dims.robotF)).toBeLessThan(0.5)
    expect(at('bone:foot.L').y).toBeLessThan(0.45)
    model.pose(0, null)
  })

  it('keeps the wheels on the ground and tilts the body on the suspension', () => {
    model.suspension.makeTranslation(0, 0.7, 0).multiply(new Matrix4().makeRotationFromEuler(new Euler(0.04, 0, -0.05))).multiply(new Matrix4().makeTranslation(0, -0.7, 0))
    model.steer = 0.4
    model.spin = 1.3
    model.pose(0, null)
    for (const wheel of model.contacts().wheels) expect(Math.abs(wheel.p.y)).toBeLessThan(0.01)
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
      worstT = Math.max(worstT, t.distanceTo(live.t))
      worstQ = Math.max(worstQ, 1 - Math.abs(q.dot(live.q)))
    })
    expect(worstT).toBeLessThan(2e-3)
    expect(worstQ).toBeLessThan(1e-4)
  })
})

describe('cybertruck locomotion', () => {
  it('walks and runs on finite poses with footfalls and grounded feet', () => {
    const gait = new RobotGait()
    let footfalls = 0
    let lowest = Infinity
    for (const [speed, running] of [[3.4, false], [7.5, true]] as const) {
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
    expect(Math.abs(lowest)).toBeLessThan(0.05)
  })

  it('runs with a flight phase: both feet leave the ground between steps', () => {
    const gait = new RobotGait()
    let flights = 0
    for (let frame = 0; frame < 300; frame++) {
      const pose = gait.update(1 / 60, 7.5, 0, true, true)
      if (frame < 120) continue
      model.pose(1, pose)
      const feet = model.contacts().feet
      if (Math.min(feet.L.y, feet.R.y) > 0.02) flights++
    }
    expect(flights).toBeGreaterThan(10)
  })

  it('jumps: the whole robot leaves the ground and lands back on its feet', () => {
    const gait = new RobotGait()
    const jump = new RobotJump()
    jump.start()
    let highest = 0
    const armNodes = ['bone:upperarm.R', 'bone:upperarm.L', 'bone:forearm.R', 'bone:forearm.L'].map((name) => model.node(name))
    model.pose(1, gait.update(0, 0, 0, false, true))
    const previous = armNodes.map((node) => new Quaternion().setFromRotationMatrix(node.matrixWorld))
    for (let frame = 0; frame < 150; frame++) {
      const pose = gait.update(1 / 60, 0, 0, false, true, jump.update(1 / 60))
      model.pose(1, pose)
      expect(Number.isFinite(model.lift)).toBe(true)
      armNodes.forEach((node, i) => {
        const rotation = new Quaternion().setFromRotationMatrix(node.matrixWorld)
        expect(previous[i].angleTo(rotation)).toBeLessThan(0.2)
        previous[i].copy(rotation)
      })
      const feet = model.contacts().feet
      highest = Math.max(highest, Math.min(feet.L.y, feet.R.y))
    }
    expect(highest).toBeGreaterThan(0.9)
    const feet = model.contacts().feet
    expect(Math.abs(Math.min(feet.L.y, feet.R.y))).toBeLessThan(0.05)
    model.pose(0, null)
  })

  it('measures a planted sole for footprints: foot-sized, under the foot, heading forward', () => {
    model.pose(1, null)
    const sole = model.sole('L', { center: new Vector3(), forward: new Vector3(), length: 0, width: 0 })
    expect(sole.length).toBeGreaterThan(0.5)
    expect(sole.length).toBeLessThan(2)
    expect(sole.width).toBeGreaterThan(0.25)
    expect(sole.width).toBeLessThan(1)
    expect(sole.forward.z).toBeGreaterThan(0.9)
    const ankle = model.contacts().feet.L
    expect(Math.hypot(sole.center.x - ankle.x, sole.center.z - ankle.z)).toBeLessThan(sole.length)
    model.pose(0, null)
  })
})

describe('cybertruck lift thrusters', () => {
  it('burn only through the rise, hardest at lift-off', () => {
    expect(Thrusters.throttle(0.2, 0)).toBe(0)
    expect(Thrusters.throttle(0.31, 0)).toBeGreaterThan(0.95)
    expect(Thrusters.throttle(0.6, Math.sin(1.2))).toBeLessThan(Thrusters.throttle(0.4, Math.sin(0.3)))
    expect(Thrusters.throttle(0.85, 1)).toBe(0)
    expect(Thrusters.throttle(1, 1)).toBe(0)
  })

  it('keep the exhaust clear of the machine for the whole burn', { timeout: 30000 }, () => {
    const thrusters = new Thrusters(model)
    const jets = (thrusters as unknown as { jets: Array<{ mesh: { visible: boolean } }> }).jets
    const nodes = model.root.children[0].children
    const v = new Vector3()
    const d = new Vector3()
    let burns = 0
    let worst = Infinity
    let where = ''
    for (let T = 0.28; T <= 0.8; T += 0.02) {
      model.pose(T, null)
      thrusters.update(T, 0)
      if (!jets[0].mesh.visible) continue
      burns++
      const exhaust = jets.map((jet) => {
        const u = (jet as unknown as Record<string, { value: Vector3 | number }>)
        return { o: u.origin.value as Vector3, a: u.axis.value as Vector3, L: u.length.value as number }
      })
      for (const node of nodes) {
        for (const mesh of node.children as Mesh[]) {
          const p = mesh.geometry.getAttribute('position')
          for (let i = 0; i < p.count; i += 2) {
            v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld)
            for (const { o, a, L } of exhaust) {
              const s = d.subVectors(v, o).dot(a)
              if (s < 0.03 || s > L) continue
              // clearance outside the mixing layer radius (EXIT 0.11 m, spreading): negative = in the flame
              const margin = d.addScaledVector(a, -s).length() - (0.11 + 0.1 * s + 0.018 * s * s)
              if (margin < worst) { worst = margin; where = `${node.name} at T=${T.toFixed(2)}` }
            }
          }
        }
      }
    }
    expect(burns).toBeGreaterThan(20)
    expect(worst, where).toBeGreaterThan(0)
    model.pose(0, null)
  })
})
