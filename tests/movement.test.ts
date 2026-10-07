import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three/webgpu'
import { createMotionState } from '../src/game/types'
import { advanceTransformation, isTransforming, requestTransformation, resolveCircleCollisions, updateRobot } from '../src/game/movement'
import { updateCar } from '../src/game/car-dynamics'
import { RobotJump } from '../src/game/jump'
import { CYBERTRUCK_PROFILE } from '../src/content/cybertruck'
import { F1_PROFILE, RACER_GAIT } from '../src/content/ferrari-f1'
import { SEMI_PROFILE, SEMI_GAIT } from '../src/content/semi'
import { BAT_PROFILE, BAT_GAIT } from '../src/content/bat'
import { HEAVY_GAIT, RobotGait } from '../src/content/transformer/animation/gait'

const CAR = CYBERTRUCK_PROFILE.drive

describe('transformation motion', () => {
  it('waits for the vehicle to stop before unfolding', () => {
    const state = createMotionState()
    state.target = 1
    state.speed = 8
    advanceTransformation(state, 1 / 60, 8)
    expect(state.progress).toBe(0)
    expect(isTransforming(state)).toBe(true)
    state.speed = 0.2
    advanceTransformation(state, 1 / 60, 8)
    expect(state.progress).toBeGreaterThan(0)
  })

  it('ignores repeated requests during braking and playback in both directions, without queuing them', () => {
    const state = createMotionState()
    for (const form of ['robot', 'car'] as const) {
      const target = form === 'robot' ? 1 : 0
      const reverse = form === 'robot' ? 'car' : 'robot'
      state.speed = 8
      requestTransformation(state, form)
      requestTransformation(state, reverse)
      advanceTransformation(state, 1 / 60, 8)
      expect(state.mode).toBe(form)
      expect(state.target).toBe(target)
      expect(state.progress).toBe(1 - target)

      state.speed = 0
      for (let frame = 0; frame < 481; frame++) {
        if (isTransforming(state)) requestTransformation(state, reverse)
        advanceTransformation(state, 1 / 60, 8)
        expect(state.mode).toBe(form)
        expect(state.target).toBe(target)
      }
      expect(state.progress).toBe(target)
      expect(isTransforming(state)).toBe(false)
      for (let frame = 0; frame < 60; frame++) advanceTransformation(state, 1 / 60, 8)
      expect(state.progress).toBe(target)
    }
  })
})

describe('world collisions', () => {
  it('separates the vehicle from a large rock', () => {
    const state = createMotionState()
    state.pos.set(1, 0, 0)
    state.speed = 10
    resolveCircleCollisions(state, [{ x: 0, z: 0, r: 1 }], 0.3, CYBERTRUCK_PROFILE)
    // every circle of the body now clears the rock
    const fx = Math.sin(state.yaw), fz = Math.cos(state.yaw)
    for (const [station, radius] of CYBERTRUCK_PROFILE.carBody!) {
      expect(Math.hypot(state.pos.x + fx * station, state.pos.z + fz * station)).toBeGreaterThanOrEqual(1 + radius - 1e-6)
    }
    expect(state.speed).toBe(5)
  })

  it('lets the car pass a rock close along its flank', () => {
    const state = createMotionState()
    state.yaw = 0
    // a 1 m rock beside the car's middle, its edge 1.4 m off the centre line: 0.26 m clear of the side (the old 2.4 m circle struck it)
    state.speed = 10
    resolveCircleCollisions(state, [{ x: 2.4, z: 0, r: 1 }], 0.3, CYBERTRUCK_PROFILE)
    expect(state.pos.x).toBe(0)
    expect(state.speed).toBe(10)
  })

  it.each([0, 0.5, 0.9])('still slows collisions before the robot finishes forming (progress %s)', (progress) => {
    const state = createMotionState()
    state.progress = progress
    state.yaw = 0
    state.speed = 10
    const profile = { carRadius: 1.2, robotRadius: 1.5 }
    const wall = [{ ax: -10, az: 2, bx: 10, bz: 2, r: 1 }]
    expect(resolveCircleCollisions(state, [], 0, profile, wall)).toBe(true)
    expect(state.speed).toBeCloseTo(1)

    state.pos.set(0, 0, 0)
    state.speed = 10
    resolveCircleCollisions(state, [{ x: 0, z: 2, r: 1 }], 0, profile)
    expect(state.speed).toBe(5)
  })
})

describe.each([
  { name: 'cybertruck', profile: CYBERTRUCK_PROFILE, style: HEAVY_GAIT },
  { name: 'ferrari-f1', profile: F1_PROFILE, style: RACER_GAIT },
  { name: 'semi', profile: SEMI_PROFILE, style: SEMI_GAIT },
  { name: 'bat', profile: BAT_PROFILE, style: BAT_GAIT },
])('$name obstructed robot movement', ({ profile, style }) => {
  describe.each(['wall', 'rock'])('%s', (obstacle) => {
    it.each([false, true])('keeps its gait while blocked, resumes freely and stops on key release (running %s)', (running) => {
      for (const fps of [30, 60, 120]) {
        const dt = 1 / fps
        const state = createMotionState()
        state.mode = 'robot'
        state.progress = state.target = 1
        state.yaw = 0
        const speed = running ? profile.robot.runSpeed : profile.robot.walkSpeed
        state.speed = speed
        const robotOffset = 0.3
        const radius = obstacle === 'rock' ? 2 : 0.25
        const limit = 8 - radius - profile.robotRadius
        state.pos.z = limit - robotOffset
        const circles = obstacle === 'rock' ? [{ x: 0, z: 8, r: radius }] : []
        const segments = obstacle === 'wall' ? [{ ax: -20, az: 8, bx: 20, bz: 8, r: radius }] : []
        let direction: Vector3 | null = new Vector3(0, 0, 1)
        const controls = { running, movementDirection: () => direction }
        const camera = new PerspectiveCamera()
        const gait = new RobotGait(style)
        const freeGait = new RobotGait(style)

        for (let frame = 0; frame < fps * 2; frame++) {
          updateRobot(state, controls, camera, dt, false, robotOffset, profile.robot)
          expect(resolveCircleCollisions(state, circles, robotOffset, profile, segments)).toBe(obstacle === 'wall')
          expect(state.pos.x).toBeCloseTo(0, 8)
          expect(state.pos.z + robotOffset).toBeCloseTo(limit, 8)
          expect(state.speed).toBeCloseTo(speed, 8)
          gait.update(dt, state.speed, state.yawRate, running, true)
          freeGait.update(dt, speed, 0, running, true)
        }
        expect(gait.phase).toBeCloseTo(freeGait.phase, 8)
        expect(gait.amp).toBeGreaterThan(0.99)
        expect(gait.run).toBeCloseTo(freeGait.run, 8)
        if (running) expect(gait.run).toBeGreaterThan(0.99)

        // Clearing the obstruction keeps the stride and restores full travel immediately.
        const previousZ = state.pos.z
        const phase = gait.phase
        updateRobot(state, controls, camera, dt, false, robotOffset, profile.robot)
        resolveCircleCollisions(state, [], robotOffset, profile)
        gait.update(dt, state.speed, state.yawRate, running, true)
        expect(state.pos.z - previousZ).toBeCloseTo(speed * dt, 8)
        expect(gait.phase).toBeGreaterThan(phase)

        // Releasing movement settles the gait even if Shift remains held at the obstacle.
        direction = null
        for (let frame = 0; frame < fps * 2; frame++) {
          updateRobot(state, controls, camera, dt, false, robotOffset, profile.robot)
          resolveCircleCollisions(state, circles, robotOffset, profile, segments)
          gait.update(dt, state.speed, state.yawRate, running, true)
        }
        expect(state.speed).toBe(0)
        expect(gait.amp).toBeLessThan(0.01)
        expect(gait.run).toBeLessThan(0.01)
      }
    })
  })
})

describe('car controls', () => {
  it('does not apply throttle from steering alone', () => {
    const state = createMotionState()
    const controls = { driveThrottle: 0, driveSteering: 1, driftHeld: false }
    for (let i = 0; i < 60; i++) updateCar(state, controls, 1 / 60, false, CAR)
    expect(state.speed).toBe(0)
    expect(state.pos.length()).toBe(0)
    expect(state.steer).toBeLessThan(0)
  })

  it('turns right for D and left for A in the chase view', () => {
    const right = createMotionState()
    const left = createMotionState()
    right.yaw = 0
    left.yaw = 0
    right.speed = 8
    left.speed = 8
    const rightControls = { driveThrottle: 0, driveSteering: 1, driftHeld: false }
    const leftControls = { driveThrottle: 0, driveSteering: -1, driftHeld: false }
    for (let i = 0; i < 30; i++) {
      updateCar(right, rightControls, 1 / 60, false, CAR)
      updateCar(left, leftControls, 1 / 60, false, CAR)
    }
    expect(right.yaw).toBeLessThan(0)
    expect(right.pos.x).toBeLessThan(0)
    expect(left.yaw).toBeGreaterThan(0)
    expect(left.pos.x).toBeGreaterThan(0)
  })

  it('brakes before changing from forward to reverse', () => {
    const state = createMotionState()
    const controls = { driveThrottle: 1, driveSteering: 0, driftHeld: false }
    for (let i = 0; i < 120; i++) updateCar(state, controls, 1 / 60, false, CAR)
    expect(state.speed).toBeGreaterThan(0)
    controls.driveThrottle = -1
    updateCar(state, controls, 1 / 60, false, CAR)
    expect(state.speed).toBeGreaterThan(0)
    for (let i = 0; i < 120; i++) updateCar(state, controls, 1 / 60, false, CAR)
    expect(state.speed).toBeLessThan(0)
  })
})

describe('robot jump', () => {
  it('crouches, flies a ballistic arc of about a metre and lands once', () => {
    const jump = new RobotJump()
    jump.start()
    let apex = 0
    let tookOff = 0
    let landed = 0
    let airTime = 0
    for (let i = 0; i < 120; i++) {
      const p = jump.update(1 / 60)
      apex = Math.max(apex, p.air)
      if (p.tookOff) tookOff++
      if (p.landed) landed++
      if (p.airborne) airTime += 1 / 60
      expect(p.air).toBeGreaterThanOrEqual(0)
    }
    expect(tookOff).toBe(1)
    expect(landed).toBe(1)
    expect(apex).toBeGreaterThan(0.9)
    expect(apex).toBeLessThan(1.4)
    expect(airTime).toBeGreaterThan(0.7)
    expect(jump.active).toBe(false)
  })

  it('ignores a new jump until the last one has settled', () => {
    const jump = new RobotJump()
    jump.start()
    jump.update(0.3)
    jump.start()
    expect(jump.active).toBe(true)
    for (let i = 0; i < 120; i++) jump.update(1 / 60)
    expect(jump.active).toBe(false)
  })
})
