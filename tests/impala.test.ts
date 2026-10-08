import { describe, expect, it } from 'vitest'
import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three/webgpu'
import { RobotRig } from '../src/content/transformer/model/rig.ts'
import { buildCues } from '../src/content/transformer/cues.ts'
import { IMPALA_PROFILE, createImpala } from '../src/content/impala/index.ts'
import { createCutlassMaterials, createImpalaMaterials } from '../src/content/impala/materials.ts'
import { Hydramatic, firingChew } from '../src/content/impala/audio/big-block.ts'
import { ENGINE_BANDS, ENGINE_TIMBRE } from '../src/content/impala/audio/engine-model.ts'
import { Lightning } from '../src/content/impala/combat/fx/lightning.ts'
import { BladeArcs } from '../src/content/impala/combat/fx/blade-arcs.ts'
import { THROWS, THUNDER } from '../src/content/impala/combat/special.ts'
import { shapedNoise } from '../src/audio/spectral.ts'
import { AudioMix } from '../src/audio/mix.ts'
import { createMotionState } from '../src/game/types.ts'
import { updateCar } from '../src/game/car-dynamics.ts'
import { RobotJump } from '../src/game/jump.ts'
import { NO_CONTACT, REST_GAIT, readAsset, readWeapon } from './support/assets.ts'
import { runFight } from './support/fight.ts'
import { crossings, surfaces } from './support/clash.ts'

const asset = { ...readAsset('impala'), weapon: readWeapon('impala-cutlass') }
const manifest = asset.manifest
const impala = createImpala(asset, NO_CONTACT, new AudioMix())
const model = impala.model

const nodes = (): Array<{ name: string; matrixWorld: Matrix4 }> => model.root.children[0].children
const worldMatrices = (): number[][] => nodes().map((node) => [...node.matrixWorld.elements])
const centre = (name: string): Vector3 => new Box3().setFromObject(model.node(name)).getCenter(new Vector3())
const position = (name: string): Vector3 => new Vector3().setFromMatrixPosition(model.node(name).matrixWorld)

describe('impala asset', () => {
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
    expect(asset.scales!.every(Number.isFinite)).toBe(true)
    for (const e of manifest.events) {
      expect(e.t1).toBeGreaterThan(e.t0)
      expect(e.t0).toBeGreaterThanOrEqual(0)
      expect(e.t1).toBeLessThanOrEqual(1)
    }
  })

  it('never scales the head or the neck, and stands at unit scale', () => {
    const count = manifest.nodes.length
    manifest.nodes.forEach((node, i) => {
      for (let f = 0; f < manifest.frames; f++) {
        const o = (f * count + i) * 3
        const unit = Math.max(Math.abs(asset.scales![o] - 1), Math.abs(asset.scales![o + 1] - 1), Math.abs(asset.scales![o + 2] - 1))
        if (/(head|neck)/.test(node.name) && !node.name.startsWith('asm:link')) expect(unit, `${node.name} frame ${f}`).toBeLessThan(1e-4)
        if (f === manifest.frames - 1) expect(unit, `${node.name} in the stand`).toBeLessThan(1e-3)
      }
    })
  })

  it('has a game material for every slot the Blender builds export, the cutlass included', () => {
    const materials = createImpalaMaterials()
    const slots = new Set(manifest.nodes.flatMap((n) => n.meshes.map((m) => m.material)))
    for (const slot of slots) expect(materials[slot], slot).toBeDefined()
    const cutlass = createCutlassMaterials()
    for (const { material } of impala.combat.effects.weapon!.asset.meshes) expect(cutlass[material], material).toBeDefined()
  })

  it('merges mirrored strokes into shared cues', () => {
    const cues = buildCues(manifest.events)
    expect(cues.length).toBeGreaterThan(20)
    expect(cues.length).toBeLessThan(manifest.events.length)
  })
})

describe('impala transformation playback', () => {
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

  it('faces +z as a car, nose ahead, and stands about the pickup robot\'s height', () => {
    model.pose(0, null)
    expect(centre('asm:nose').z).toBeGreaterThan(2)
    expect(centre('asm:tail').z).toBeLessThan(-2)
    model.pose(1, null)
    const head = position('bone:head')
    expect(head.y).toBeGreaterThan(4.5)
    expect(Math.abs(head.z - manifest.rig.dims.robotF)).toBeLessThan(0.8)
    expect(model.robotHeight).toBeGreaterThan(5.2)
    expect(model.robotHeight).toBeLessThan(5.8)
    expect(centre('part:foot.L').y).toBeLessThan(0.7)
    model.pose(0, null)
  })

  it('keeps the tyres on the ground and tilts the body on the suspension', () => {
    const pivot = IMPALA_PROFILE.drive.pivotHeight
    model.suspension.makeTranslation(0, pivot, 0).multiply(new Matrix4().makeRotationFromEuler(new Euler(0.02, 0, -0.03))).multiply(new Matrix4().makeTranslation(0, -pivot, 0))
    model.steer = 0.4
    model.spin = 1.3
    model.pose(0, null)
    const wheels = model.contacts().wheels
    expect(wheels.length).toBe(4)
    expect(wheels.filter((w) => w.front).length).toBe(2)
    for (const wheel of wheels) expect(Math.abs(wheel.p.y), `${wheel.front}`).toBeLessThan(0.03)
    // the axles the profile drives on
    const front = wheels.filter((w) => w.front)[0].p.z, rear = wheels.filter((w) => !w.front)[0].p.z
    expect(Math.abs(front - rear - IMPALA_PROFILE.drive.wheelbase)).toBeLessThan(0.05)
    expect(Math.abs(front - IMPALA_PROFILE.drive.frontAxle)).toBeLessThan(0.05)
    model.suspension.identity()
    model.steer = 0
    model.spin = 0
  })

  it('hands over to the live rig without a jump: the TypeScript rig reproduces the Blender stand, its turned forearms and fingers flexing about X included', () => {
    const rig = new RobotRig(manifest.rig.bones, manifest.rig.stand, manifest.rig.dims)
    expect(rig.hand.flex).toBe('x')
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

describe('impala locomotion', () => {
  it('walks and runs on finite poses with footfalls and grounded feet', () => {
    const gait = impala.gait
    let footfalls = 0
    let groundedFrames = 0
    for (const [speed, running] of [[IMPALA_PROFILE.robot.walkSpeed, false], [IMPALA_PROFILE.robot.runSpeed, true]] as const) {
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
    const gait = impala.gait
    const dt = 1 / 240
    for (let frame = 0; frame < 2400; frame++) model.pose(1, gait.update(dt, IMPALA_PROFILE.robot.walkSpeed, 0, false, true))
    const heights: number[] = []
    for (let frame = 0; frame < 480; frame++) {
      model.pose(1, gait.update(dt, IMPALA_PROFILE.robot.walkSpeed, 0, false, true))
      heights.push(position('bone:pelvis').y)
    }
    let peak = 0
    const k = 4, T = k * dt
    for (let i = k; i < heights.length - k; i++) peak = Math.max(peak, Math.abs(heights[i + k] - 2 * heights[i] + heights[i - k]) / (T * T))
    expect(peak / 9.81).toBeLessThan(3)
    model.pose(0, null)
  })

  it('runs with its feet drawn in under its hips, not straddling', () => {
    const gait = impala.gait
    let widest = 0
    for (let frame = 0; frame < 240; frame++) {
      model.pose(1, gait.update(1 / 120, IMPALA_PROFILE.robot.runSpeed, 0, true, true))
      if (frame < 120) continue
      for (const side of ['L', 'R'] as const) {
        const hip = position(`bone:thigh.${side}`)
        const ankle = position(`bone:foot.${side}`)
        widest = Math.max(widest, Math.abs(ankle.x) - Math.abs(hip.x))
      }
    }
    // the stand's feet are 0.47 m outside the hips; at a run they come in under them
    expect(widest).toBeLessThan(0.2)
    model.pose(0, null)
  })

  it('jumps: the whole robot leaves the ground and lands back on its feet', () => {
    const gait = impala.gait
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

describe('impala car', () => {
  it('pulls away and reaches its top speeds, faster with full power', () => {
    const top = (full: boolean): number => {
      const state = createMotionState()
      const controls = { driveThrottle: 1, driveSteering: 0, driftHeld: full }
      for (let i = 0; i < 60 * 40; i++) updateCar(state, controls, 1 / 60, false, IMPALA_PROFILE.drive)
      return state.speed
    }
    const normal = top(false)
    const boosted = top(true)
    expect(normal).toBeGreaterThan(IMPALA_PROFILE.drive.maxSpeed * 0.9)
    expect(normal).toBeLessThanOrEqual(IMPALA_PROFILE.drive.maxSpeed)
    expect(boosted).toBeGreaterThan(normal)
  })

  it('shifts its three-speed automatic up and back inside the rev range, later under a full throttle', () => {
    const shiftsAt = (load: number): number[] => {
      const box = new Hydramatic()
      const at: number[] = []
      let gear = 0
      for (let v = 0; v <= 54; v += 0.1) {
        box.update(v, load)
        expect(box.rpm).toBeLessThanOrEqual(5720)
        if (box.gear !== gear) { expect(box.gear).toBe(gear + 1); gear = box.gear; at.push(v) }
      }
      expect(gear).toBe(2)
      for (let v = 54; v >= 0; v -= 0.1) box.update(v, 0)
      expect(box.gear).toBe(0)
      return at
    }
    const light = shiftsAt(0.2), full = shiftsAt(1)
    expect(full[0]).toBeGreaterThan(light[0])
    expect(full[1]).toBeGreaterThan(light[1])
  })

  it('carries a fitted engine timbre: the firing order leads, the noise loops seamlessly at unit level', () => {
    for (const timbre of [ENGINE_TIMBRE.low, ENGINE_TIMBRE.high]) {
      expect(timbre.orders.length).toBe(40)
      expect(timbre.orders[7]).toBe(1)
      for (const [k, a] of timbre.orders.entries()) if (k !== 7) expect(a, `order ${k + 1}`).toBeLessThan(1)
      expect(timbre.noise.length).toBe(ENGINE_BANDS.length)
      expect(timbre.noise.every(Number.isFinite)).toBe(true)
      expect(timbre.noiseToTone).toBeGreaterThan(0)
      expect(timbre.pulse).toBeGreaterThanOrEqual(0)
      expect(timbre.pulse).toBeLessThanOrEqual(1)
    }
    const n = 1 << 12
    const loop = shapedNoise(n, 48000, ENGINE_BANDS, ENGINE_TIMBRE.high.noise, 7)
    let sum = 0
    for (const v of loop) sum += v * v
    expect(Math.sqrt(sum / n)).toBeCloseTo(1, 3)
    // periodic: the seam is no bigger a step than a typical neighbour difference
    let step = 0
    for (let i = 1; i < n; i++) step += Math.abs(loop[i] - loop[i - 1])
    expect(Math.abs(loop[0] - loop[n - 1])).toBeLessThan(4 * step / (n - 1))
  })

  it('chews: a seamless, mean-free firing-by-firing gain wander that never drives the engine below silence', () => {
    const rate = 48000
    const chew = firingChew(rate, 0x427)
    // 64 cycles of 8 firings at 20 Hz
    expect(chew.length).toBe(Math.round(64 * 8 * rate / 20 / 8))
    let mean = 0, lo = Infinity, step = 0
    for (let i = 0; i < chew.length; i++) {
      mean += chew[i] / chew.length
      lo = Math.min(lo, chew[i])
      if (i) step = Math.max(step, Math.abs(chew[i] - chew[i - 1]))
    }
    expect(Math.abs(mean)).toBeLessThan(1e-3)
    // the widest depth (0.3) keeps the gain positive
    expect(1 + 0.3 * lo).toBeGreaterThan(0)
    // eased, never stepped, and the loop's seam is no bigger a step than inside it
    expect(step).toBeLessThan(0.1)
    expect(Math.abs(chew[0] - chew[chew.length - 1])).toBeLessThanOrEqual(step)
  })
})

describe('impala lightning', () => {
  it('writes each bolt as one run of the ring, uploaded in at most two ranges, and forks within the pool', () => {
    const bolts = new Lightning()
    const attribute = (bolts as unknown as { a0: { updateRanges: Array<{ start: number; count: number }>; clearUpdateRanges(): void } }).a0
    for (let k = 0; k < 400; k++) {
      attribute.clearUpdateRanges()
      bolts.strike(new Vector3(0, 0, 0), new Vector3(8 + Math.random() * 6, 0.2, 3), { width: 0.1, life: 0.1, brightness: 1, roughness: 0.16, forks: 0.3, forkLength: 0.35 })
      expect(attribute.updateRanges.length).toBeGreaterThan(0)
      expect(attribute.updateRanges.length).toBeLessThanOrEqual(2)
    }
    bolts.update(0.016)
    expect(bolts.mesh.visible).toBe(true)
    bolts.update(1)
    expect(bolts.mesh.visible).toBe(false)
  })
})

describe('impala blade arcs', () => {
  it('rebuilds a fast cut along the blade\'s turn, not the frame\'s chord, and uploads each arc once a frame', () => {
    const arcs = new BladeArcs()
    const position = (arcs as unknown as { position: { array: Float32Array; updateRanges: unknown[]; clearUpdateRanges(): void } }).position
    const base = new Vector3(0, 2, 0), length = 4
    const at = (angle: number): Vector3 => new Vector3(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(length).add(base)
    arcs.begin(1)
    arcs.update(1 / 60)
    arcs.add(base, at(0))
    // half a turn in one frame: the tip travels 8 m across its chord
    position.clearUpdateRanges()
    arcs.update(1 / 60)
    arcs.add(base, at(Math.PI))
    expect(position.updateRanges.length).toBe(1)
    const count = (arcs as unknown as { count: number }).count
    expect(count).toBeGreaterThan(12)
    // every sample's outer end on the circle the point swept (out past it by the band's reach), none cut across the chord
    for (let k = 0; k < count; k++) {
      const tip = new Vector3().fromArray(position.array, (k * 2 + 1) * 3)
      expect(tip.distanceTo(base)).toBeCloseTo(length * 1.05, 3)
    }
  })
})

describe('impala fighting', () => {
  /** The cutlass hand's own chain: the blade's root and the pommel may brush its gauntlet (the rear door folded on the forearm), which the clash probe watches. */
  const CUTLASS_ARM = /(clav|shoulder|upperarm|forearm|hand|index\d|middle\d|ring\d|pinky\d|thumb\d)\.L($|\.)|asm:(rear_door|front_door|fold\.gauntlet\.lower|fold\.door\.lower|rear_fender|link\.gauntlet)\.L|asm:window\.front\.L|wheel:wheelR\.L|asm:wheel\.rear\.L/
  /** What an arm or the blade must never pass through: the torso, the head and the legs, and the car's body on the chest. */
  const TRUNK = /part:(pelvis|spine|chest|neck|head|hip|thigh|shin|foot|toe)|asm:(nose|hood|front_bumper|windshield|dashboard|tail|trunk|rear_bumper|rear_screen|front_fender|robot\.armour\.(hip|calf)|fold\.(fender\.nose|quarter\.tail))/

  const check = (clicks: number[], specials: number[], until: number): string[] => {
    const c = createImpala({ ...readAsset('impala'), weapon: readWeapon('impala-cutlass') }, NO_CONTACT, new AudioMix())
    const bodies = surfaces(c.model.root.children[0].children)
    const weapon = c.model.node('bone:hand.L').children.find((o) => o.name.startsWith('weapon:'))!
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
            if (CUTLASS_ARM.test(body.name) || !TRUNK.test(body.name)) continue
            hits.length = 0
            crossings(body, a, b, hits)
            if (hits.length) found.add(`blade ${z.toFixed(1)} through ${body.name} at ${t.toFixed(2)}`)
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

  it('keeps the cutlass and the forearms out of its body through the whole combo', () => {
    expect(check([0, 0.38, 0.84, 1.45], [], 4.5)).toEqual([])
  })

  it('keeps the cutlass and the forearms out of its body through the special', () => {
    expect(check([], [0], 13)).toEqual([])
  })

  /**
   * The cutlass hand's turn on its forearm from the stand's (deg, about the
   * hand's own axis) and the elbow's ride up off the shoulder-hand line while
   * the hand is low (deg): the arm held as a person holds a blade.
   */
  const arm = (clicks: number[], specials: number[], until: number): { twist: number; wing: number } => {
    const c = createImpala({ ...readAsset('impala'), weapon: readWeapon('impala-cutlass') }, NO_CONTACT, new AudioMix())
    const node = (n: string) => c.model.node(n)
    const qf = new Quaternion(), qh = new Quaternion(), rel = new Quaternion()
    let rest: Quaternion | null = null
    const axis = new Vector3()
    const S = new Vector3(), E = new Vector3(), W = new Vector3(), M = new Vector3()
    let twist = 0, wing = 0
    runFight(c, clicks, until, (t) => {
      node('bone:forearm.L').getWorldQuaternion(qf)
      node('bone:hand.L').getWorldQuaternion(qh)
      rel.copy(qf).invert().multiply(qh)
      W.setFromMatrixPosition(node('bone:hand.L').matrixWorld)
      if (!rest) {
        rest = rel.clone()
        axis.copy(M.setFromMatrixPosition(node('bone:middle1.L').matrixWorld)).sub(W).applyQuaternion(qh.clone().invert()).normalize()
      }
      if (t < 0 || !c.combat.effects.weapon?.presence) return
      const q = rel.clone().premultiply(rest.clone().invert())
      let a = 2 * Math.atan2(q.x * axis.x + q.y * axis.y + q.z * axis.z, q.w) * 180 / Math.PI
      a = ((a + 540) % 360) - 180
      twist = Math.max(twist, Math.abs(a))
      S.setFromMatrixPosition(node('bone:upperarm.L').matrixWorld)
      E.setFromMatrixPosition(node('bone:forearm.L').matrixWorld)
      // the model's world is y up
      if (W.y < S.y - 0.3) {
        const line = W.clone().sub(S).normalize()
        const off = E.clone().sub(S)
        off.addScaledVector(line, -off.dot(line))
        if (off.lengthSq() > 1e-6) wing = Math.max(wing, Math.asin(Math.min(1, off.normalize().y)) * 180 / Math.PI)
      }
    }, 1 / 60, specials)
    return { twist, wing }
  }

  it('holds the cutlass with a natural arm through the combo: the hand never wrung, the elbow never winged', () => {
    const { twist, wing } = arm([0, 0.38, 0.84, 1.45], [], 4.5)
    expect(twist).toBeLessThan(100)
    expect(wing).toBeLessThan(35)
  })

  it('keeps the cutlass arm still through the slow-motion held moment: the natural hold never snaps the elbow', () => {
    const c = createImpala({ ...readAsset('impala'), weapon: readWeapon('impala-cutlass') }, NO_CONTACT, new AudioMix())
    const elbow = c.model.node('bone:forearm.L'), pelvis = c.model.node('bone:pelvis')
    const a = new Vector3(), b = new Vector3(), at = new Vector3(), prev = new Vector3()
    let worst = 0, frames = 0
    runFight(c, [], 10, (t, combat) => {
      const time = (combat as unknown as { player: { time: number } }).player.time
      at.setFromMatrixPosition(elbow.matrixWorld).sub(b.setFromMatrixPosition(pelvis.matrixWorld))
      // the elbow's change of velocity from frame to frame, over the held moment (tempo 0.22: anything here is plain)
      if (combat.special && time > THUNDER.hold[0] + 0.02 && time < THUNDER.hold[1] - 0.02) {
        worst = Math.max(worst, at.clone().sub(a).sub(a.clone().sub(prev)).length())
        frames++
      }
      prev.copy(a)
      a.copy(at)
    }, 1 / 120, [0])
    expect(frames).toBeGreaterThan(100)
    // rolls snapping between grid steps or between near-equal holds jerked it by 56 mm; held, it moves well under a millimetre
    expect(worst).toBeLessThan(0.002)
  })

  it('moves the cutlass arm and the blade through the special without a snap: no frame turns them far past the frames about it', () => {
    const c = createImpala({ ...readAsset('impala'), weapon: readWeapon('impala-cutlass') }, NO_CONTACT, new AudioMix())
    const bones = ['upperarm', 'forearm', 'hand'].map((b) => c.model.node(`bone:${b}.L`))
    const weapon = c.model.node('bone:hand.L').children.find((o) => o.name.startsWith('weapon:'))!
    const steps: number[][] = [[], [], [], []], times: number[] = []
    const last = [0, 1, 2, 3].map(() => new Quaternion()), q = new Quaternion()
    let started = false
    runFight(c, [], 14, (_t, combat) => {
      if (!combat.special) return
      const objects = [...bones, weapon]
      objects.forEach((o, k) => {
        o.getWorldQuaternion(q)
        steps[k].push(started ? 2 * Math.acos(Math.min(1, Math.abs(q.dot(last[k])))) * 180 / Math.PI : 0)
        last[k].copy(q)
      })
      times.push((combat as unknown as { player: { time: number } }).player.time)
      started = true
    }, 1 / 60, [0])
    const snaps: string[] = []
    steps.forEach((list, k) => {
      for (let i = 2; i < list.length - 2; i++) {
        // a snap stands far out of the motion about it (the swing's own peak, slowed into the blow's slow motion, stays within 3 times)
        if (list[i] > 20 && list[i] > 3 * Math.max(list[i - 2], list[i + 2], 0.5)) snaps.push(`${['upper arm', 'forearm', 'hand', 'blade'][k]} ${list[i].toFixed(0)} deg at ${times[i].toFixed(2)}`)
      }
    })
    expect(snaps).toEqual([])
  })

  it('throws the cutlass from where the hand holds it to where the hand takes it again', () => {
    const c = createImpala({ ...readAsset('impala'), weapon: readWeapon('impala-cutlass') }, NO_CONTACT, new AudioMix())
    const overlay = c.combat.overlay
    const marks = THROWS.flatMap((w) => [[w.release, w.from], [w.catch, w.to]] as const)
    const seen: string[] = marks.map(() => 'never reached'), nearest = marks.map(() => Infinity)
    const p = new Vector3()
    runFight(c, [], 14, (_t, combat) => {
      const time = (combat as unknown as { player: { time: number } }).player.time
      for (const [k, [at, place]] of marks.entries()) {
        if (!combat.special || Math.abs(time - at) >= nearest[k]) continue
        nearest[k] = Math.abs(time - at)
        // the hand's hold there (the throw hands over from it and back to it), against the placement the flight is authored between
        const e = overlay.weapon.elements
        p.setFromMatrixPosition(overlay.weapon).sub(overlay.restPelvis)
        const grip = Math.hypot(p.x - place.grip[0], -p.y - place.grip[1], p.z - place.grip[2])
        const blade = Math.acos(Math.min(1, e[8] * place.blade[0] - e[9] * place.blade[1] + e[10] * place.blade[2])) * 180 / Math.PI
        const edge = Math.acos(Math.min(1, e[0] * place.edge[0] - e[1] * place.edge[1] + e[2] * place.edge[2])) * 180 / Math.PI
        // (the edge's turn about the blade settles a few degrees differently with the frame rate; the hand-over ramp takes it up)
        seen[k] = grip > 0.03 || blade > 3 || edge > 10 ? `at ${at}: grip off ${grip.toFixed(3)} m, blade ${blade.toFixed(1)} deg, edge ${edge.toFixed(1)} deg` : `at ${at}: held`
      }
    }, 1 / 120, [0])
    expect(seen).toEqual(marks.map(([at]) => `at ${at}: held`))
  })

  it('holds the cutlass with a natural arm through the special', () => {
    const { twist, wing } = arm([], [0], 14)
    expect(twist).toBeLessThan(100)
    expect(wing).toBeLessThan(48)
  })
})
