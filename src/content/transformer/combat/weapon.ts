import { Group, Mesh, Vector3, type Material, type Matrix4, type Node, type Object3D } from 'three/webgpu'
import { abs, color, exp, max, positionLocal, smoothstep, uniform, vec2, vec3 } from 'three/tsl'
import type { WeaponAsset } from '../asset/weapon'
import { N } from '../../../rendering/noise.ts'

/** How a weapon forms and fades: the colour of its forming front and of the heat it leaves behind (linear HDR). */
export interface ForgeStyle {
  /** the front, where the metal is forming */
  front: [number, number, number]
  /** the glow the metal keeps behind the front while it cools */
  after: [number, number, number]
  /** width of the forming front (share of the weapon's reach from the grip) */
  band: number
  /** how far behind the front the afterglow reaches (share) */
  cool: number
}

/** Seconds the afterglow takes to die once the weapon has fully formed. */
const COOL_TIME = 0.7

/**
 * A weapon in the main hand. Its meshes hang off the hand node at the grip
 * (weapon frame -> hand frame, from the combat overlay), so it follows the
 * posed hand exactly, and it is drawn with its character's own material slots.
 *
 * It exists only while the fight wants it: `presence` 0..1 runs a forming
 * front out from the grip toward both ends (the head and the pommel), ragged
 * with noise; the metal behind it glows and cools. Taking `presence` back to
 * 0 runs the front back into the hand (the tip goes first). The materials
 * discard beyond the front, so nothing is blended or sorted; at 0 the weapon
 * is not drawn at all.
 */
export class Weapon {
  readonly object = new Group()
  readonly asset: WeaponAsset
  /** 0 absent .. 1 whole: where the forming front stands */
  presence = 0
  /** cutting edge ends in the weapon frame */
  readonly edge: [Vector3, Vector3]
  private readonly front = uniform(0)
  private readonly glow = uniform(0)
  private readonly meshes: Mesh[] = []
  private glowLevel = 0
  private formed = false

  constructor(asset: WeaponAsset, materials: Record<string, Material>, style: ForgeStyle, grip: Matrix4) {
    this.asset = asset
    const m = asset.manifest
    this.edge = [new Vector3(...m.edge[0]), new Vector3(...m.edge[1])]
    this.object.name = `weapon:${m.name}`
    this.object.matrixAutoUpdate = false
    this.object.matrix.copy(grip)
    const reach = Math.max(-m.extent[0], m.extent[1])
    const forged = new Map<Material, Material>()
    for (const { material, geometry } of asset.meshes) {
      const base = materials[material]
      if (!base) throw new Error(`${m.name}: no material for slot ${material}`)
      let mat = forged.get(base)
      if (!mat) {
        mat = forge(base, this.front, this.glow, reach, style)
        forged.set(base, mat)
      }
      const mesh = new Mesh(geometry, mat)
      mesh.matrixAutoUpdate = false
      mesh.receiveShadow = true
      this.meshes.push(mesh)
      this.object.add(mesh)
    }
    this.object.visible = false
  }

  /** Hang the weapon on its hand node. */
  attach(hand: Object3D): void {
    hand.add(this.object)
  }

  /** Per frame: follow `presence`, run the afterglow down once formed. */
  update(dt: number): void {
    const p = Math.max(0, Math.min(1, this.presence))
    this.front.value = p
    const visible = p > 0.001
    this.object.visible = visible
    if (!visible) {
      this.glowLevel = 0
      this.formed = false
      return
    }
    const whole = p >= 0.999
    // forming (either way) glows at full; a formed weapon cools
    if (!whole) this.glowLevel = 1
    else this.glowLevel = Math.max(0, this.glowLevel - dt / COOL_TIME)
    this.glow.value = this.glowLevel
    if (whole !== this.formed) {
      this.formed = whole
      for (const mesh of this.meshes) mesh.castShadow = whole
    }
  }

  /** The cutting edge's ends in world space (after the model is posed). */
  worldEdge(base: Vector3, tip: Vector3): void {
    const W = this.object.matrixWorld
    base.copy(this.edge[0]).applyMatrix4(W)
    tip.copy(this.edge[1]).applyMatrix4(W)
  }
}

/**
 * A weapon copy of a character material: discarded beyond the forming front,
 * glowing at the front and cooling behind it. `reach` normalises the distance
 * from the grip along the haft.
 */
function forge(base: Material, front: Node<'float'>, glow: Node<'float'>, reach: number, style: ForgeStyle): Material {
  const m = base.clone() as Material & { maskNode: unknown; emissiveNode: any; colorNode: any; isMeshBasicNodeMaterial?: boolean }
  const p = positionLocal
  const n = N(vec2(p.x.mul(3.1).add(p.z.mul(0.37)), p.y.mul(3.3).add(p.z.mul(1.7)))).r
  // ragged: the front leads and lags by noise; its far end must clear the tips when whole
  const s = abs(p.z).div(reach).add(n.sub(0.5).mul(0.16))
  const f = front.mul(1 + style.band + 0.1)
  m.maskNode = s.lessThan(f)
  const behind = max(f.sub(s), 0)
  const band = smoothstep(f.sub(style.band), f, s)
  const heat = exp(behind.div(style.cool).negate())
  const emission = vec3(...style.front).mul(band.mul(band)).add(vec3(...style.after).mul(heat)).mul(glow)
  if (m.isMeshBasicNodeMaterial) m.colorNode = (m.colorNode ?? color(0xffffff)).add(emission)
  else m.emissiveNode = m.emissiveNode ? m.emissiveNode.add(emission) : emission
  return m
}
