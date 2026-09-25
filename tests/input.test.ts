import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three/webgpu'
import { GameInput } from '../src/game/input'

const target = { addEventListener: () => undefined, removeEventListener: () => undefined }

beforeEach(() => {
  vi.stubGlobal('window', target)
  vi.stubGlobal('document', { ...target, pointerLockElement: null })
})
afterEach(() => { vi.unstubAllGlobals() })

const input = (): GameInput => new GameInput({} as HTMLCanvasElement, () => undefined, () => undefined)

describe('touch stick', () => {
  it('drives the car like the keys without implicitly holding Shift at the rim', () => {
    const controls = input()
    controls.setStick(0.05, 0.2, false)
    expect(controls.driveThrottle).toBe(0)
    expect(controls.driveSteering).toBe(0)
    expect(controls.driving).toBe(true)
    controls.setStick(0.5, 0.6, false)
    expect(controls.driveThrottle).toBe(1)
    expect(controls.driveSteering).toBe(0.5)
    expect(controls.running).toBe(false)
    controls.setStick(-0.1, -0.99, true)
    expect(controls.driveThrottle).toBe(-1)
    expect(controls.running).toBe(true)
    expect(controls.driftHeld).toBe(false)
    controls.setStick(0, 0, false)
    expect(controls.driving).toBe(false)
  })

  it('holds Shift from the mobile drift button until release', () => {
    const controls = input()
    expect(controls.driftHeld).toBe(false)
    controls.setShift(true)
    expect(controls.driftHeld).toBe(true)
    controls.setShift(false)
    expect(controls.driftHeld).toBe(false)
  })

  it('walks the robot in the camera-relative stick direction', () => {
    const controls = input()
    const camera = new PerspectiveCamera()
    camera.lookAt(new Vector3(0, 0, -1))
    camera.updateMatrixWorld()
    expect(controls.movementDirection(camera)).toBeNull()
    controls.setStick(0.6, 0.6, false)
    const dir = controls.movementDirection(camera)!
    // camera looks down -z, so its right is +x: the stick's up-right is forward-right
    expect(dir.x).toBeCloseTo(Math.SQRT1_2)
    expect(dir.z).toBeCloseTo(-Math.SQRT1_2)
  })

  it('jumps from the touch button once, like Space', () => {
    const controls = input()
    controls.pressJump()
    expect(controls.consumeJump()).toBe(true)
    expect(controls.consumeJump()).toBe(false)
  })
})
