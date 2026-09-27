import { Group, PointLight, type Object3D } from 'three/webgpu'

/** Point lights a character may carry at most (the Semi: its weapon's, a blast's and the muzzle's; the Cybertruck: weapon, blast and jets). */
export const POINT_LIGHT_SLOTS = 3

/**
 * The scene's point lights: a fixed set, always in the scene, driven by the
 * playing character's own lights.
 *
 * three keys every lit material's shader on the ids of the scene's lights, so
 * a car switch that brought its own PointLight objects invalidated every lit
 * shader in the world, and each rebuilt (a hitch) the next time it was drawn:
 * the fortress, the sand drifts, whatever next came into view. A character's
 * lights are therefore only descriptions: `adopt` takes them out of the scene
 * graph when the character is built, and `update` copies the playing one's
 * colour, intensity, range and position onto the slots each frame.
 */
export class LightSlots {
  readonly object = new Group()
  private readonly slots: PointLight[] = []
  private sources: readonly PointLight[] = []

  constructor() {
    this.object.name = 'point-light-slots'
    for (let i = 0; i < POINT_LIGHT_SLOTS; i++) {
      const light = new PointLight(0xffffff, 0, 0, 2)
      this.slots.push(light)
      this.object.add(light)
    }
  }

  /**
   * Take the point lights under `roots` out of the scene graph and return
   * them. Their positions must be world positions (every parent at the
   * origin, as effect groups are), since they no longer have a parent.
   */
  static adopt(...roots: Object3D[]): PointLight[] {
    const lights: PointLight[] = []
    for (const root of roots) {
      root.traverse((o) => {
        if ((o as PointLight).isPointLight) lights.push(o as PointLight)
      })
    }
    if (lights.length > POINT_LIGHT_SLOTS) throw new Error(`a character carries ${lights.length} point lights; the scene has ${POINT_LIGHT_SLOTS} slots`)
    for (const light of lights) {
      if (light.castShadow) throw new Error('light slots cast no shadows')
      for (let p = light.parent; p; p = p.parent) {
        if (p.position.lengthSq() > 0 || p.quaternion.w !== 1 || p.scale.x !== 1 || p.scale.y !== 1 || p.scale.z !== 1) {
          throw new Error(`point light under a transformed parent (${p.name || p.type}): its position would not be a world position`)
        }
      }
      light.removeFromParent()
    }
    return lights
  }

  /** The lights that drive the slots from now on (a character's, from `adopt`). */
  use(lights: readonly PointLight[]): void {
    this.sources = lights
  }

  /** Per frame, before the draw: the slots take on their sources; a slot without one stays dark. */
  update(): void {
    for (let i = 0; i < POINT_LIGHT_SLOTS; i++) {
      const slot = this.slots[i]
      const source = this.sources[i]
      if (!source) {
        slot.intensity = 0
        continue
      }
      slot.color.copy(source.color)
      slot.intensity = source.intensity
      slot.distance = source.distance
      slot.decay = source.decay
      slot.position.copy(source.position)
    }
  }
}
