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
    expect(camera.position.distanceTo(focus)).toBeCloseTo(10.5, 5)

    documentListeners.get('mousemove')?.({ movementX: 300, movementY: -25 } as MouseEvent)
    rig.update(1 / 60, state, root, true)
    const pannedX = camera.position.x
    expect(pannedX).toBeGreaterThan(0)
    expect(camera.position.distanceTo(focus)).toBeCloseTo(10.5, 5)

    clock.mockReturnValue(1000)
    for (let i = 0; i < 60; i++) rig.update(1 / 60, state, root, false)
    expect(camera.position.x).toBeCloseTo(pannedX, 5)
    for (let i = 0; i < 120; i++) rig.update(1 / 60, state, root, true)
    expect(Math.abs(camera.position.x)).toBeLessThan(Math.abs(pannedX) * 0.02)
    expect(camera.position.distanceTo(focus)).toBeCloseTo(10.5, 5)
    rig.dispose()
  })
})
