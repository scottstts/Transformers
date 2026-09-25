import { describe, expect, it } from 'vitest'
import { Group, PerspectiveCamera, Vector3 } from 'three/webgpu'
import { Director, type DirectorSubject } from '../src/game/combat/director'
import type { SpecialMove } from '../src/content/transformer/combat/special'

/** A subject standing at the origin, its pelvis 3 m up and head 5 m. */
function subject(): DirectorSubject {
  const body = new Group()
  body.position.set(0, 3, 0)
  body.updateMatrixWorld()
  const head = new Group()
  head.position.set(0, 5, 0)
  head.updateMatrixWorld()
  return { body, head, weapon: () => false }
}

/** A special with the given shots, 4 s long, handing back from 3 s. */
function special(shots: SpecialMove['shots']): SpecialMove {
  return {
    name: 'test',
    handback: 3,
    handbackView: { yaw: Math.PI, pitch: 0.16 },
    move: { name: 'test', duration: 4, chain: [4, 4], keys: {} },
    shots,
  }
}

/** The follow camera's pose this frame: behind the subject (heading +z), looking at it. */
function follow(camera: PerspectiveCamera): void {
  camera.position.set(0, 6, -12)
  camera.lookAt(0, 3.9, 0)
  camera.fov = 42
  camera.updateMatrixWorld()
}

describe('special director', () => {
  it('places a ground-framed shot in the special frame: lateral is to the left of its heading', () => {
    const d = new Director()
    const camera = new PerspectiveCamera()
    // heading +x: its left is -z
    d.start(special([{ at: 0, eye: [[0, 2, 5, 1.5]], look: [[0, 0, 0, 1.5]] }]), new Vector3(10, 0, 0), Math.PI / 2)
    follow(camera)
    d.apply(camera, 0.5, 1 / 60, subject())
    expect(camera.position.x).toBeCloseTo(15, 5)
    expect(camera.position.z).toBeCloseTo(-2, 5)
    expect(camera.position.y).toBeCloseTo(1.5, 5)
  })

  it('cuts hard between shots and eases into the follow camera by the end', () => {
    const d = new Director()
    const camera = new PerspectiveCamera()
    const s = subject()
    d.start(special([
      { at: 0, eye: [[0, 0, 8, 2]], look: [[0, 0, 0, 2]], fov: [[0, 30]] },
      { at: 1, eye: [[1, 8, 0, 2]], look: [[1, 0, 0, 2]] },
    ]), new Vector3(), 0)
    follow(camera)
    d.apply(camera, 0.99, 1 / 60, s)
    expect(camera.position.z).toBeCloseTo(8, 5)
    expect(camera.fov).toBeCloseTo(30, 5)
    follow(camera)
    d.apply(camera, 1, 1 / 60, s)
    expect(camera.position.x).toBeCloseTo(8, 5)
    expect(camera.fov).toBeCloseTo(42, 5)
    follow(camera)
    d.apply(camera, 4, 1 / 60, s)
    expect(camera.position.distanceTo(new Vector3(0, 6, -12))).toBeLessThan(1e-4)
  })

  it('never passes through the subject when it hands back from its front to its back', () => {
    const d = new Director()
    const camera = new PerspectiveCamera()
    const s = subject()
    d.start(special([{ at: 0, eye: [[0, 0, 10, 3]], look: [[0, 0, 0, 3]] }]), new Vector3(), 0)
    let nearest = Infinity
    for (let t = 3; t <= 4; t += 0.01) {
      follow(camera)
      d.apply(camera, t, 1 / 60, s)
      expect(Number.isFinite(camera.quaternion.w)).toBe(true)
      nearest = Math.min(nearest, Math.hypot(camera.position.x, camera.position.z))
    }
    expect(nearest).toBeGreaterThan(9.9)
  })

  it('keeps the lens above the ground', () => {
    const d = new Director()
    const camera = new PerspectiveCamera()
    d.start(special([{ at: 0, eye: [[0, 0, 6, -3]], look: [[0, 0, 0, 1]] }]), new Vector3(), 0)
    follow(camera)
    d.apply(camera, 0.2, 1 / 60, subject())
    expect(camera.position.y).toBeGreaterThanOrEqual(0.3)
  })
})
