import { describe, expect, it } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three/webgpu'
import { Shield } from '../src/content/transformer/combat/fx/shield.ts'

function fixture(height = 0): { root: Group; shield: Shield } {
  const root = new Group()
  root.position.set(12, height, -7)
  const anchor = new Group()
  anchor.position.y = 2
  anchor.add(new Mesh(new BoxGeometry(2, 4, 2), new MeshBasicMaterial()))
  root.add(anchor)
  root.updateMatrixWorld(true)
  const shield = new Shield([0.2, 0.6, 1], anchor, root)
  shield.set(true)
  shield.update(0.4, 0.3)
  return { root, shield }
}

describe('defense shield on raised ground', () => {
  it.each([8, 16, 20, 24])('preserves the original ground-level size on a %s m floor', (height) => {
    const original = fixture().shield
    const elevated = fixture(height).shield
    // Ground-level radius produced by the shield in 416aaa0 for this body.
    expect(original.mesh.scale.x).toBeCloseTo(3.1170572316386713, 10)
    expect(elevated.mesh.scale.toArray()).toEqual(original.mesh.scale.toArray())
    expect(elevated.mesh.position.y - height).toBeCloseTo(original.mesh.position.y, 10)
    expect(elevated.reach(1.6)).toBeCloseTo(original.reach(1.6), 10)

    const from = new Vector3(18, 2, -7)
    const hit = original.surfacePoint(from, new Vector3())
    const raisedHit = elevated.surfacePoint(from.clone().add(new Vector3(0, height, 0)), new Vector3())
    expect(raisedHit.sub(new Vector3(0, height, 0)).distanceTo(hit)).toBeLessThan(1e-10)
  })

  it('follows the floor while raised without changing its radius', () => {
    const { root, shield } = fixture()
    const radius = shield.mesh.scale.x
    const centre = shield.mesh.position.y
    root.position.y = 24
    root.updateMatrixWorld(true)
    shield.update(0.1, 0.3)
    expect(shield.mesh.scale.x).toBe(radius)
    expect(shield.mesh.position.y).toBeCloseTo(centre + 24, 10)
    shield.set(false)
    shield.update(0.1, 0.3)
    expect(shield.mesh.position.y).toBeCloseTo(centre + 24, 10)
    shield.update(0.2, 0.3)
    expect(shield.mesh.visible).toBe(false)
    expect(shield.reach(1.6)).toBe(0)
  })

  it('does not count changes in floor elevation as growth while forming', () => {
    const { root, shield } = fixture()
    const radius = shield.mesh.scale.x
    const centre = shield.mesh.position.y
    shield.set(false)
    shield.update(0.3, 0.3)
    shield.set(true)
    shield.update(0.1, 0.3)
    root.position.y = 8
    root.updateMatrixWorld(true)
    shield.update(0.1, 0.3)
    expect(shield.mesh.scale.x).toBe(radius)
    expect(shield.mesh.position.y).toBeCloseTo(centre + 8, 10)
  })
})
