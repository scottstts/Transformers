import { describe, expect, it } from 'vitest'
import { PointLight, Scene, Vector3, type Light } from 'three/webgpu'
import { ROSTER } from '../src/content/roster.ts'
import { AudioMix } from '../src/audio/mix.ts'
import { LightSlots, POINT_LIGHT_SLOTS } from '../src/rendering/light-slots.ts'
import { NO_CONTACT, readAsset, readWeapon } from './support/assets.ts'

/** The ids of the lights three would collect from the scene (its lighting shaders are keyed on them). */
function lightIds(scene: Scene): number[] {
  const ids: number[] = []
  scene.traverse((o) => {
    if ((o as Light).isLight) ids.push(o.id)
  })
  return ids
}

describe('light slots', () => {
  const cars = ROSTER.map((entry) => entry.create({ ...readAsset(entry.id), weapon: readWeapon(entry.weapon) }, NO_CONTACT, new AudioMix()))

  it('keeps the scene lights the same whichever car plays', () => {
    const scene = new Scene()
    const slots = new LightSlots()
    scene.add(slots.object)
    const before = lightIds(scene)
    expect(before).toHaveLength(POINT_LIGHT_SLOTS)
    for (const car of cars) {
      const lights = LightSlots.adopt(car.model.root, car.effects.object)
      expect(lights.length, car.id).toBeGreaterThan(0)
      scene.add(car.model.root, car.effects.object)
      slots.use(lights)
      slots.update()
      expect(lightIds(scene), car.id).toEqual(before)
      scene.remove(car.model.root, car.effects.object)
    }
  })

  it('mirrors the playing car and darkens slots it does not use', () => {
    const slots = new LightSlots()
    const source = new PointLight(0xff8800, 12, 35, 2)
    source.position.set(1, 2, 3)
    slots.use([source])
    slots.update()
    const [first, ...rest] = slots.object.children as PointLight[]
    expect(first.intensity).toBe(12)
    expect(first.distance).toBe(35)
    expect(first.color.getHex()).toBe(0xff8800)
    expect(first.position).toEqual(new Vector3(1, 2, 3))
    for (const slot of rest) expect(slot.intensity).toBe(0)
  })
})
