import { describe, expect, it } from 'vitest'
import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three/webgpu'
import { RobotRig } from '../src/content/transformer/model/rig.ts'
import { buildCues } from '../src/content/transformer/cues.ts'
import { ROADSTER_PROFILE, createRoadster } from '../src/content/roadster/index.ts'
import { createRoadsterMaterials } from '../src/content/roadster/materials.ts'
import { AirJets } from '../src/content/roadster/fx/air-jets.ts'
import { roadsterLoop, roadsterTake } from '../src/content/roadster/audio/sound-bank.ts'
import { SHOT_SECONDS } from '../src/content/roadster/audio/sound-models.ts'
import { AudioMix } from '../src/audio/mix.ts'
import { createMotionState } from '../src/game/types.ts'
import { updateCar } from '../src/game/car-dynamics.ts'
import { RobotJump } from '../src/game/jump.ts'
import { NO_CONTACT, REST_GAIT, readAsset } from './support/assets.ts'
import { WHITEOUT, WHITEOUT_HITS } from '../src/content/roadster/combat/special.ts'
import { shockFront } from '../src/content/transformer/combat/fx/shock-front.ts'
import { lastHitTime } from '../src/content/transformer/combat/hits.ts'

const asset = { ...readAsset('roadster'), weapon: null }
const manifest = asset.manifest
const roadster = createRoadster(asset, NO_CONTACT, new AudioMix())
const model = roadster.model
const FPS = 30

const nodes = (): Array<{ name: string; matrixWorld: Matrix4 }> => model.root.children[0].children
const worldMatrices = (): number[][] => nodes().map((node) => [...node.matrixWorld.elements])
const centre = (name: string): Vector3 => new Box3().setFromObject(model.node(name)).getCenter(new Vector3())
const position = (name: string): Vector3 => new Vector3().setFromMatrixPosition(model.node(name).matrixWorld)

describe('roadster asset', () => {
  it('has a game material for every slot the Blender build exports', () => {
    const materials = createRoadsterMaterials()
    const slots = new Set(manifest.nodes.flatMap((n) => n.meshes.map((m) => m.material)))
    for (const slot of slots) expect(materials[slot], slot).toBeDefined()
  })

  it('merges mirrored strokes into shared cues', () => {
    const cues = buildCues(manifest.events)
    expect(cues.length).toBeGreaterThan(20)
    expect(cues.length).toBeLessThan(manifest.events.length)
  })
})

describe('roadster transformation playback', () => {
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

  it('faces +z as a car, nose ahead, and stands the Cybertruck robot\'s height', () => {
    model.pose(0, null)
    expect(centre('asm:nose').z).toBeGreaterThan(1)
    expect(centre('asm:tail').z).toBeLessThan(-1)
    model.pose(1, null)
    expect(position('bone:head').y).toBeGreaterThan(5)
    expect(model.robotHeight).toBeGreaterThan(5.7)
    expect(model.robotHeight).toBeLessThan(6.3)
    expect(centre('part:foot.L').y).toBeLessThan(0.7)
    model.pose(0, null)
  })

  it('flies: the body climbs some eighteen metres over the ground on the baked arc and lands back on it', () => {
    let top = 0
    for (let f = 0; f < manifest.frames; f++) {
      model.pose(f / (manifest.frames - 1), null)
      top = Math.max(top, roadster.altitude!())
    }
    expect(top).toBeGreaterThan(16)
    expect(top).toBeLessThan(21)
    model.pose(0, null)
    expect(roadster.altitude!()).toBe(0)
    model.pose(1, null)
    expect(roadster.altitude!()).toBe(0)
    // on the ground before lift-off and after the touchdown (rdb/flight.py: 0.8 s, 6.6 s)
    for (const s of [0.5, 7.5]) {
      model.pose(s / model.duration, null)
      expect(roadster.altitude!(), `${s} s`).toBeLessThan(0.05)
    }
    model.pose(0, null)
  })

  it('keeps the tyres on the ground and tilts the body on the suspension', () => {
    const pivot = ROADSTER_PROFILE.drive.pivotHeight
    model.suspension.makeTranslation(0, pivot, 0).multiply(new Matrix4().makeRotationFromEuler(new Euler(0.02, 0, -0.03))).multiply(new Matrix4().makeTranslation(0, -pivot, 0))
    model.steer = 0.4
    model.spin = 1.3
    model.pose(0, null)
    const wheels = model.contacts().wheels
    expect(wheels.length).toBe(4)
    expect(wheels.filter((w) => w.front).length).toBe(2)
    for (const wheel of wheels) expect(Math.abs(wheel.p.y), `${wheel.front}`).toBeLessThan(0.03)
    const front = wheels.filter((w) => w.front)[0].p.z, rear = wheels.filter((w) => !w.front)[0].p.z
    expect(Math.abs(front - rear - ROADSTER_PROFILE.drive.wheelbase)).toBeLessThan(0.05)
    expect(Math.abs(front - ROADSTER_PROFILE.drive.frontAxle)).toBeLessThan(0.05)
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
    expect(Math.abs(model.lift - baked)).toBeLessThan(0.02)
    for (let T = 0.9; T <= 1.0001; T += 0.01) {
      model.pose(Math.min(T, 1), REST_GAIT)
      expect(Math.min(model.footClearance('L'), model.footClearance('R'))).toBeLessThan(0.04)
    }
    model.pose(0, null)
  })
})

describe('roadster air jets', () => {
  it('fires the lift jets for the launch and the pack for the landing, and plays the same backward', () => {
    const lift = (s: number): number => AirJets.liftThrottle(s)
    const pack = (s: number): number => AirJets.packThrottle(s)
    expect(lift(0)).toBe(0)
    expect(lift(1.2)).toBeGreaterThan(0.95)
    expect(lift(2.6)).toBe(0)
    expect(pack(4)).toBe(0)
    expect(pack(6.3)).toBeGreaterThan(0.95)
    expect(pack(7.5)).toBe(0)
    // the lift jets point down through the boost, the pack's outlets through its burn
    const down = (name: string, local: Vector3, axis: Vector3, s: number): number => {
      model.pose(s / model.duration, null)
      const W = model.node(name).matrixWorld
      void local
      return new Vector3().copy(axis).transformDirection(W).y
    }
    for (const s of [0.6, 1.2, 1.8]) expect(down('asm:jet.FL.stage', new Vector3(0, 0, -0.2), new Vector3(0, 0, -1), s), `${s} s`).toBeLessThan(-0.95)
    for (const s of [5.9, 6.3, 6.55]) expect(down('asm:tail', new Vector3(0.114, 0.892, -0.055), new Vector3(0, 0.979, -0.204), s), `${s} s`).toBeLessThan(-0.9)
    model.pose(0, null)
  })

  it('updates without allocating a draw: a full burn keeps every column and the cloud within their pools', () => {
    const jets = roadster.effects.jets
    for (let f = 0; f <= manifest.frames * 2; f++) {
      const s = (f / 2) / FPS
      model.pose(Math.min(1, s / model.duration), null)
      jets.update(s, true, 1 / 60)
    }
    expect(jets.object.children.length).toBe(3)
    jets.reset()
  })
})

describe('roadster locomotion', () => {
  it('walks and runs on finite poses with footfalls and grounded feet', () => {
    const gait = roadster.gait
    let footfalls = 0
    let groundedFrames = 0
    for (const [speed, running] of [[ROADSTER_PROFILE.robot.walkSpeed, false], [ROADSTER_PROFILE.robot.runSpeed, true]] as const) {
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

  it('walks without a jolt at foot-flat: the body\'s height accelerates under 3 g at 60 Hz', () => {
    const gait = roadster.gait
    const dt = 1 / 240
    for (let frame = 0; frame < 2400; frame++) model.pose(1, gait.update(dt, ROADSTER_PROFILE.robot.walkSpeed, 0, false, true))
    const heights: number[] = []
    for (let frame = 0; frame < 480; frame++) {
      model.pose(1, gait.update(dt, ROADSTER_PROFILE.robot.walkSpeed, 0, false, true))
      heights.push(position('bone:pelvis').y)
    }
    let peak = 0
    const k = 4, T = k * dt
    for (let i = k; i < heights.length - k; i++) peak = Math.max(peak, Math.abs(heights[i + k] - 2 * heights[i] + heights[i - k]) / (T * T))
    expect(peak / 9.81).toBeLessThan(3)
    model.pose(0, null)
  })

  it('runs with its feet drawn in under its hips, not straddling', () => {
    const gait = roadster.gait
    let widest = 0
    for (let frame = 0; frame < 240; frame++) {
      model.pose(1, gait.update(1 / 120, ROADSTER_PROFILE.robot.runSpeed, 0, true, true))
      if (frame < 120) continue
      for (const side of ['L', 'R'] as const) {
        const hip = position(`bone:thigh.${side}`)
        const ankle = position(`bone:foot.${side}`)
        widest = Math.max(widest, Math.abs(ankle.x) - Math.abs(hip.x))
      }
    }
    expect(widest).toBeLessThan(0.2)
    model.pose(0, null)
  })

  it('jumps: the whole robot leaves the ground and lands back on its feet', () => {
    const gait = roadster.gait
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

describe('roadster car', () => {
  it('pulls away and reaches its top speeds, faster with full power', () => {
    const top = (full: boolean): number => {
      const state = createMotionState()
      const controls = { driveThrottle: 1, driveSteering: 0, driftHeld: full }
      for (let i = 0; i < 60 * 40; i++) updateCar(state, controls, 1 / 60, false, ROADSTER_PROFILE.drive)
      return state.speed
    }
    const normal = top(false)
    const boosted = top(true)
    expect(normal).toBeGreaterThan(ROADSTER_PROFILE.drive.maxSpeed * 0.9)
    expect(normal).toBeLessThanOrEqual(ROADSTER_PROFILE.drive.maxSpeed)
    expect(boosted).toBeGreaterThan(normal)
  })
})

describe('roadster sounds', () => {
  it('synthesises finite, normalised takes and seamless loops', () => {
    for (const name of ['shock', 'energy', 'explosion', 'landing', 'pass'] as const) {
      const take = roadsterTake(name, 1, 48000)
      expect(take.length).toBe(Math.round(SHOT_SECONDS[name] * 48000))
      let peak = 0
      for (const v of take) { expect(Number.isFinite(v)).toBe(true); peak = Math.max(peak, Math.abs(v)) }
      expect(peak).toBeGreaterThan(0.8)
      expect(peak).toBeLessThanOrEqual(0.96)
    }
    for (const name of ['distortion', 'propeller'] as const) {
      const n = 1 << 14
      const loop = roadsterLoop(name, n, 48000)
      let step = 0
      for (let i = 1; i < n; i++) step += Math.abs(loop[i] - loop[i - 1])
      expect(Math.abs(loop[0] - loop[n - 1])).toBeLessThan(4 * step / (n - 1))
    }
  })
})

describe('roadster whiteout', () => {
  it('sends the impact\'s blast wave out through the crowd: bands from the core out to 26 m, each struck as the ring\'s front gets there', () => {
    const blasts = WHITEOUT_HITS.blasts!
    const core = blasts.find((b) => b.t === WHITEOUT.impact && b.inner === undefined)!
    const bands = blasts.filter((b) => b.inner !== undefined)
    const { from, reach, life } = WHITEOUT.blastWave
    expect(bands.length).toBeGreaterThan(5)
    // the impact stays the special's last blow; the wave shares its finality
    expect(lastHitTime(WHITEOUT_HITS)).toBe(WHITEOUT.impact)
    bands.forEach((b, k) => {
      expect(b.inner).toBeCloseTo(k ? bands[k - 1].radius : core.radius, 6)
      expect(b.radius).toBeGreaterThan(b.inner!)
      if (k < bands.length - 1) expect(shockFront(from, reach, (b.t - WHITEOUT.impact) / life)).toBeCloseTo(b.radius, 6)
      // it breaks what it reaches, thrown out from the impact
      expect(b.at).toEqual(core.at)
      expect(b.damage).toBe(core.damage)
      expect(b.lift).toBeGreaterThan(5)
    })
    expect(bands[bands.length - 1].radius).toBe(26)
  })
})
