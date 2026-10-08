import { describe, expect, it } from 'vitest'
import { Group, type Vector3 } from 'three/webgpu'
import { AuraFx } from '../src/content/transformer/combat/fx/aura.ts'
import type { TransformerModel } from '../src/content/transformer/model/transformer.ts'

const DT = 1 / 60
const HIP = 2

function fixture(ground = 0): { pelvis: Group; aura: AuraFx } {
  const pelvis = new Group()
  pelvis.position.set(5, ground + HIP, -3)
  pelvis.updateMatrixWorld(true)
  const model = { robotHeight: 4.5, dims: { hipZ: HIP }, node: () => pelvis } as unknown as TransformerModel
  const aura = new AuraFx(model, [0.62, 0.035, 0.05])
  aura.ground = { height: () => ground } as unknown as AuraFx['ground']
  return { pelvis, aura }
}

function internal(aura: AuraFx): { center: { value: Vector3 }; gain: { value: number }; groundGain: { value: number }; a0: { array: Float32Array } } {
  return aura as unknown as ReturnType<typeof internal>
}

function shown(aura: AuraFx): boolean {
  return aura.object.children.some((mesh) => mesh.visible)
}

describe('special aura', () => {
  it('stands on the ground under the pelvis', () => {
    const { aura } = fixture(7)
    for (let i = 0; i < 30; i++) aura.update(true, DT, false)
    expect(internal(aura).center.value.toArray()).toEqual([5, 7, -3])
    expect(shown(aura)).toBe(true)
  })

  it('rises with a jump and its glow on the ground dies away', () => {
    const { pelvis, aura } = fixture()
    for (let i = 0; i < 40; i++) aura.update(true, DT, false)
    expect(internal(aura).groundGain.value).toBeGreaterThan(0.5)
    pelvis.position.y += 3
    pelvis.updateMatrixWorld(true)
    aura.update(true, DT, false)
    expect(internal(aura).center.value.y).toBeCloseTo(3, 6)
    expect(internal(aura).groundGain.value).toBe(0)
  })

  it('births rays and stars inside the field', () => {
    const { aura } = fixture()
    for (let i = 0; i < 30; i++) aura.update(true, DT, false)
    const p = internal(aura).a0.array
    let n = 0
    for (; n * 4 < p.length && p[n * 4 + 3] < 1e8; n++) {
      expect(Math.hypot(p[n * 4] - 5, p[n * 4 + 2] + 3)).toBeLessThan(4.5 * 0.5)
      expect(p[n * 4 + 1]).toBeGreaterThan(0)
      expect(p[n * 4 + 1]).toBeLessThan(4.5)
    }
    expect(n).toBeGreaterThan(10)
  })

  it('fades out when the meter leaves full, and a special cuts it at once', () => {
    const { aura } = fixture()
    for (let i = 0; i < 40; i++) aura.update(true, DT, false)
    aura.update(false, DT, false)
    expect(shown(aura)).toBe(true)
    for (let i = 0; i < 30; i++) aura.update(false, DT, false)
    expect(shown(aura)).toBe(false)

    for (let i = 0; i < 40; i++) aura.update(true, DT, false)
    expect(shown(aura)).toBe(true)
    aura.update(false, DT, true)
    expect(shown(aura)).toBe(false)
    expect(internal(aura).gain.value).toBe(0)
  })

  it('holds still while the world is paused', () => {
    const { aura } = fixture()
    for (let i = 0; i < 40; i++) aura.update(true, DT, false)
    const gain = internal(aura).gain.value
    for (let i = 0; i < 10; i++) aura.update(true, 0, false)
    expect(internal(aura).gain.value).toBe(gain)
    expect(shown(aura)).toBe(true)
  })
})
