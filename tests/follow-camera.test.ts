import { afterEach, describe, expect, it, vi } from 'vitest'
import { Object3D, PerspectiveCamera, Vector3 } from 'three/webgpu'
import { FollowCamera } from '../src/game/follow-camera'
import { createMotionState } from '../src/game/types'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('follow camera', () => {
  it('keeps a constant orbit radius and returns behind the car after mouse input stops', () => {
    const canvasListeners = new Map<string, EventListener>()
    const documentListeners = new Map<string, EventListener>()
    const canvas = {
      addEventListener: (type: string, listener: EventListener) => { canvasListeners.set(type, listener) },
      removeEventListener: (type: string) => { canvasListeners.delete(type) },
    } as unknown as HTMLCanvasElement
    const fakeDocument = {
      pointerLockElement: canvas,
      addEventListener: (type: string, listener: EventListener) => { documentListeners.set(type, listener) },
      removeEventListener: (type: string) => { documentListeners.delete(type) },
      exitPointerLock: () => {},
    }
    vi.stubGlobal('document', fakeDocument)
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0)
    const camera = new PerspectiveCamera(42, 1, 0.1, 100)
    const root = new Object3D()
    root.updateMatrixWorld(true)
    const state = createMotionState()
    state.yaw = 0
    const rig = new FollowCamera(camera, canvas, state.yaw, 0)
    const focus = new Vector3(0, 1.1, 0)

    rig.update(1 / 60, state, root)
    expect(camera.position.distanceTo(focus)).toBeCloseTo(7.875, 5)

    documentListeners.get('mousemove')?.({ movementX: 300, movementY: -25 } as MouseEvent)
    rig.update(1 / 60, state, root, true)
    const pannedX = camera.position.x
    expect(pannedX).toBeGreaterThan(0)
    expect(camera.position.distanceTo(focus)).toBeCloseTo(7.875, 5)

    clock.mockReturnValue(1000)
    for (let i = 0; i < 60; i++) rig.update(1 / 60, state, root, false)
    expect(camera.position.x).toBeCloseTo(pannedX, 5)
    for (let i = 0; i < 120; i++) rig.update(1 / 60, state, root, true)
    expect(Math.abs(camera.position.x)).toBeLessThan(Math.abs(pannedX) * 0.02)
    expect(camera.position.distanceTo(focus)).toBeCloseTo(7.875, 5)

    state.progress = 1
    for (let i = 0; i < 120; i++) rig.update(1 / 60, state, root)
    expect(camera.position.distanceTo(new Vector3(0, 3.9, 0))).toBeCloseTo(12.75, 4)
    rig.dispose()
  })

  it('keeps the orbit when the pointer re-locks and ignores the spurious movement that follows', () => {
    const documentListeners = new Map<string, EventListener>()
    const canvas = {
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as HTMLCanvasElement
    const fakeDocument = {
      pointerLockElement: canvas as unknown,
      addEventListener: (type: string, listener: EventListener) => { documentListeners.set(type, listener) },
      removeEventListener: (type: string) => { documentListeners.delete(type) },
      exitPointerLock: () => {},
    }
    vi.stubGlobal('document', fakeDocument)
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0)
    const camera = new PerspectiveCamera(42, 1, 0.1, 100)
    const root = new Object3D()
    root.updateMatrixWorld(true)
    const state = createMotionState()
    const rig = new FollowCamera(camera, canvas, state.yaw, 0)
    const move = (x: number, y: number): void => documentListeners.get('mousemove')?.({ movementX: x, movementY: y } as MouseEvent)
    rig.update(1 / 60, state, root)
    move(180, 40)
    for (let i = 0; i < 30; i++) rig.update(1 / 60, state, root)
    const before = camera.position.clone()
    // shake displaces the camera between frames; a re-lock must not bake that into the orbit
    camera.position.y += 0.2

    // menu: mouse look held before the pointer is released (a cursor-restore movement is ignored)
    rig.holdLook(true)
    move(300, 120)
    rig.update(1 / 60, state, root)
    camera.position.y += 0.2
    fakeDocument.pointerLockElement = null
    documentListeners.get('pointerlockchange')?.(new Event('pointerlockchange'))
    clock.mockReturnValue(5000)
    fakeDocument.pointerLockElement = canvas
    documentListeners.get('pointerlockchange')?.(new Event('pointerlockchange'))
    rig.holdLook(false)
    // the first movement after the lock carries the unlocked cursor travel, however late it comes
    clock.mockReturnValue(9000)
    move(260, -90)
    rig.update(1 / 60, state, root)
    expect(camera.position.distanceTo(before)).toBeLessThan(1e-6)

    // after settling, real movement orbits again, but a single absurd jump is dropped
    move(2400, 900)
    rig.update(1 / 60, state, root)
    expect(camera.position.distanceTo(before)).toBeLessThan(1e-6)
    move(40, 0)
    rig.update(1 / 60, state, root)
    expect(camera.position.distanceTo(before)).toBeGreaterThan(0.1)
    rig.dispose()
  })
})

describe('follow camera across a car switch', () => {
  it('keeps the orbit and eases into the new framing without a jump', () => {
    const canvas = { addEventListener: () => {}, removeEventListener: () => {} } as unknown as HTMLCanvasElement
    vi.stubGlobal('document', { pointerLockElement: null, addEventListener: () => {}, removeEventListener: () => {}, exitPointerLock: () => {} })
    vi.spyOn(performance, 'now').mockReturnValue(0)
    const camera = new PerspectiveCamera(42, 1, 0.1, 100)
    const root = new Object3D()
    root.updateMatrixWorld(true)
    const state = createMotionState()
    const rig = new FollowCamera(camera, canvas, state.yaw, 2.1)
    for (let i = 0; i < 120; i++) rig.update(1 / 60, state, root)
    const heading = (): number => Math.atan2(camera.position.x, camera.position.z)
    const yaw = heading()
    rig.setCharacter(1.25, { carDistance: 7.2, robotDistance: 10.2, carFocus: 0.85, robotFocus: 2.9 })
    let previous = camera.position.clone()
    let largestStep = 0
    for (let i = 0; i < 180; i++) {
      rig.update(1 / 60, state, root)
      largestStep = Math.max(largestStep, camera.position.distanceTo(previous))
      previous = camera.position.clone()
      expect(heading()).toBeCloseTo(yaw, 6)
    }
    expect(largestStep).toBeLessThan(0.02)
    expect(camera.position.distanceTo(new Vector3(0, 0.85, 0))).toBeCloseTo(7.2, 3)
    rig.dispose()
  })
})
