import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three/webgpu'
import { createMotionState, type MotionState } from '../src/game/types'
import { placeCar, updateCar, type CarControls } from '../src/game/car-dynamics'
import { groundRay, type Ground } from '../src/game/ground'
import { DesertTerrain } from '../src/worlds/desert/terrain'
import { CYBERTRUCK_PROFILE } from '../src/content/cybertruck'
import { F1_PROFILE } from '../src/content/ferrari-f1'
import { SEMI_PROFILE } from '../src/content/semi'
import { BAT_PROFILE } from '../src/content/bat'
import { IMPALA_PROFILE } from '../src/content/impala'
import type { DriveProfile } from '../src/content/transformer/character'

const CARS: Array<[string, DriveProfile]> = [['cybertruck', CYBERTRUCK_PROFILE.drive], ['ferrari-f1', F1_PROFILE.drive], ['semi', SEMI_PROFILE.drive], ['bat', BAT_PROFILE.drive], ['impala', IMPALA_PROFILE.drive]]
const PAD = { x: 0, z: 330, r0: 208, r1: 293 }
const controls = (driveThrottle: number, driveSteering = 0): CarControls => ({ driveThrottle, driveSteering, driftHeld: false })

/** A smooth crest across the z axis: 3 m high, 6 m wide at its half height. */
const CREST: Ground = { height: (_x, z) => 3 * Math.exp(-(((z - 60) / 6) ** 2)) }
/** A low swell: 1 m high, 10 m wide. */
const SWELL: Ground = { height: (_x, z) => Math.exp(-(((z - 60) / 10) ** 2)) }
const SLOPE: Ground = { height: (x) => x * 0.2 }

function run(car: DriveProfile, ground: Ground, seconds: number, input: (s: MotionState) => CarControls, setup: (s: MotionState) => void, probe?: (s: MotionState) => void): MotionState {
  const state = createMotionState()
  state.yaw = 0
  setup(state)
  placeCar(state, car, ground)
  const dt = 1 / 60
  for (let f = 0; f < seconds * 60; f++) {
    updateCar(state, input(state), dt, false, car, ground)
    probe?.(state)
  }
  return state
}

describe('desert landform', () => {
  const terrain = new DesertTerrain([PAD])

  it('is exactly level on the fortress pad and continuous beyond it', () => {
    for (let k = 0; k < 200; k++) {
      const a = k * 2.39996, r = (k / 200) * PAD.r0
      expect(Math.abs(terrain.height(PAD.x + Math.cos(a) * r, PAD.z + Math.sin(a) * r))).toBe(0)
    }
    let worst = 0
    for (let k = 0; k < 5000; k++) {
      const x = (k * 7.31) % 4000 - 2000, z = (k * 3.77) % 4000 - 2000
      const h = terrain.height(x, z)
      expect(Number.isFinite(h)).toBe(true)
      worst = Math.max(worst, Math.abs(terrain.height(x + 0.05, z) - h) / 0.05)
    }
    // no cliff anywhere: the steepest ground stays drivable
    expect(worst).toBeLessThan(0.5)
  })

  it('finds where a ray meets the ground', () => {
    const from = new Vector3(0, 10, 0)
    const dir = new Vector3(1, -1, 0).normalize()
    expect(groundRay({ height: () => 2 }, from, dir, 100)).toBeCloseTo(8 * Math.SQRT2, 3)
    expect(groundRay({ height: () => 2 }, from, new Vector3(0, 1, 0), 100)).toBe(Infinity)
    const d = groundRay(terrain, new Vector3(1200, 40, -900), new Vector3(0.6, -0.2, 0.3).normalize(), 400)
    expect(Number.isFinite(d)).toBe(true)
  })
})

describe.each(CARS)('%s on the relief', (_, car) => {
  it('stands still on level ground, its springs at rest', () => {
    const s = run(car, { height: () => 1.5 }, 2, () => controls(0), () => undefined)
    expect(s.airborne).toBe(false)
    expect(s.pos.y).toBeCloseTo(1.5, 3)
    expect(s.load).toBeCloseTo(1, 2)
    expect(Math.abs(s.lift)).toBeLessThan(1e-3)
    expect(Math.hypot(s.speed, s.lateral)).toBeLessThan(0.05)
  })

  it('is slowed climbing a slope and sped descending it', () => {
    const flat = run(car, { height: () => 0 }, 2, () => controls(0), (s) => { s.yaw = Math.PI / 2; s.speed = 20 })
    const up = run(car, SLOPE, 2, () => controls(0), (s) => { s.yaw = Math.PI / 2; s.speed = 20 })
    const down = run(car, SLOPE, 2, () => controls(0), (s) => { s.yaw = -Math.PI / 2; s.speed = 20 })
    expect(up.speed).toBeLessThan(flat.speed - 2)
    expect(down.speed).toBeGreaterThan(flat.speed + 2)
    // it stays planted on its tilted ground, nose up the hill
    expect(up.airborne).toBe(false)
    expect(up.tiltPitch).toBeLessThan(-0.15)
  })

  it('flies off a crest at speed, keeps its yaw rate in the air and lands into its springs', () => {
    let flew = 0, impact = 0, yawInAir = NaN, yawDrift = 0
    run(car, CREST, 6, () => controls(1, 1), (s) => { s.speed = 30 }, (s) => {
      if (!s.airborne) yawInAir = NaN
      else {
        flew += 1 / 60
        if (Number.isNaN(yawInAir)) yawInAir = s.yawRate
        yawDrift = Math.max(yawDrift, Math.abs(s.yawRate - yawInAir))
        // nothing grips: steering held hard over does nothing
        expect(s.load).toBe(0)
      }
      impact = Math.max(impact, s.impact)
    })
    expect(flew).toBeGreaterThan(0.2)
    expect(yawDrift).toBeLessThan(1e-5)
    expect(impact).toBeGreaterThan(1)
  })

  it('rolls over a swell without leaving the ground', () => {
    let flew = false
    const s = run(car, SWELL, 4, () => controls(0), (s) => { s.speed = 14; s.pos.z = 35 }, (s) => { flew ||= s.airborne })
    expect(flew).toBe(false)
    expect(s.pos.z).toBeGreaterThan(70)
  })
})

describe('terrain mesh', () => {
  it('draws a bounded number of patches from anywhere, seamless levels only', async () => {
    const { PerspectiveCamera, Scene, MeshBasicNodeMaterial } = await import('three/webgpu')
    const { TerrainMesh } = await import('../src/worlds/desert/terrain-mesh')
    const mesh = new TerrainMesh(new Scene(), new DesertTerrain([PAD]), () => new MeshBasicNodeMaterial())
    const camera = new PerspectiveCamera(48, 16 / 9, 0.1, 6000)
    for (const [x, y, z, tx, tz] of [[0, 2, 0, 0, 100], [500, 30, -800, 900, -400], [-3000, 5, 2000, -3000, 2100]]) {
      camera.position.set(x, y, z)
      camera.lookAt(tx, 0, tz)
      camera.updateMatrixWorld()
      mesh.update(camera)
      const triangles = mesh.full.count * 32 * 32 * 2 + mesh.quarter.count * 16 * 16 * 2
      expect(mesh.full.count + mesh.quarter.count).toBeGreaterThan(8)
      expect(triangles).toBeLessThan(160000)
    }
  })
})
