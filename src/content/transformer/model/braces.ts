import { Matrix4, Quaternion, Vector3 } from 'three/webgpu'

/**
 * Telescopic braces kept whole on the live skeleton.
 *
 * A brace (`link.<name>`: `pin.A`, `pin.B` and `stage.0..n`) runs from a
 * point on one carrier to a point on another: the Blender build lays its
 * nested stages of constant length along the line between the two pins,
 * spaced evenly (linkage.py). The bake hangs each piece off one bone, which
 * holds only while the skeleton keeps the transformation's last pose: once
 * the gait or a fighting pose turns the two carriers against each other, the
 * pins part from what they are pinned to and the stages hang in the air.
 * Live, each brace is laid again between its two carriers every frame, as
 * the build lays it: the pins on their carriers' points, the stages along the
 * line between them at an even spacing, the whole turned by the least
 * rotation from its baked line (which keeps the pins' hinge axes where the
 * bake has them while the carriers stand still).
 */
export class Braces {
  /** how far (m) the last solve held a brace short of its carriers' span or past its closed length (0: every brace fits its stroke) */
  strain = 0
  /** the brace that strained most in the last solve */
  strained = ''
  private readonly list: Array<{
    name: string
    carriers: [number, number]
    /** each pin's point in its carrier's frame */
    ends: [Vector3, Vector3]
    pins: [number, number]
    stages: number[]
    /** the baked line's direction and the pieces' baked rotation (all alike) */
    axis: Vector3
    rest: Quaternion
    /** one stage's length (m): the brace spans (stages - 1) spacings and one length */
    length: number
  }> = []

  /**
   * `world`: every node's matrix at the transformation's end (the skeleton's
   * stand), in the model's authoring frame; `specs`: brace name -> the nodes
   * carrying its pin A and pin B.
   */
  constructor(specs: Record<string, readonly [string, string]>, index: (name: string) => number, world: readonly Matrix4[]) {
    for (const [name, [a, b]] of Object.entries(specs)) {
      const pins: [number, number] = [index(`asm:link.${name}.pin.A`), index(`asm:link.${name}.pin.B`)]
      const stages: number[] = []
      for (let k = 0; ; k++) {
        let i: number
        try { i = index(`asm:link.${name}.stage.${k}`) } catch { break }
        stages.push(i)
      }
      if (stages.length < 2) throw new Error(`brace ${name} has ${stages.length} stages`)
      const carriers: [number, number] = [index(a), index(b)]
      const A = new Vector3().setFromMatrixPosition(world[pins[0]])
      const B = new Vector3().setFromMatrixPosition(world[pins[1]])
      const ends: [Vector3, Vector3] = [
        A.clone().applyMatrix4(_m.copy(world[carriers[0]]).invert()),
        B.clone().applyMatrix4(_m.copy(world[carriers[1]]).invert()),
      ]
      const span = B.distanceTo(A)
      const step = new Vector3().setFromMatrixPosition(world[stages[1]]).distanceTo(_v.setFromMatrixPosition(world[stages[0]]))
      this.list.push({
        name, carriers, ends, pins, stages,
        axis: B.clone().sub(A).normalize(),
        rest: new Quaternion().setFromRotationMatrix(world[pins[0]]),
        length: span - (stages.length - 1) * step,
      })
    }
  }

  /** Lay every brace between its carriers in `world`, blended over what is there by `weight` (0..1). */
  solve(world: Matrix4[], weight: number): void {
    this.strain = 0
    for (const b of this.list) {
      const A = _a.copy(b.ends[0]).applyMatrix4(world[b.carriers[0]])
      const B = _b.copy(b.ends[1]).applyMatrix4(world[b.carriers[1]])
      const axis = _axis.subVectors(B, A)
      const span = axis.length()
      axis.multiplyScalar(1 / Math.max(span, 1e-6))
      _turn.setFromUnitVectors(b.axis, axis).multiply(b.rest)
      // the stages spread evenly between the pins, never past their own overlap or apart
      const n = b.stages.length - 1
      const free = (span - b.length) / n
      const spacing = Math.min(Math.max(free, 0), b.length)
      const off = Math.abs(free - spacing) * n
      if (off > this.strain) { this.strain = off; this.strained = b.name }
      place(world[b.pins[0]], A, weight)
      place(world[b.pins[1]], B, weight)
      for (let k = 0; k <= n; k++) place(world[b.stages[k]], _p.copy(A).addScaledVector(axis, k * spacing), weight)
    }
  }
}

/** A piece at `at`, turned by `_turn`, blended over its matrix by `weight`. */
function place(m: Matrix4, at: Vector3, weight: number): void {
  if (weight >= 1) {
    m.compose(at, _turn, ONE)
    return
  }
  m.decompose(_t, _q, _s)
  m.compose(_t.lerp(at, weight), _q.slerp(_turn, weight), ONE)
}

const ONE = new Vector3(1, 1, 1)
const _m = new Matrix4()
const _v = new Vector3()
const _a = new Vector3()
const _b = new Vector3()
const _p = new Vector3()
const _axis = new Vector3()
const _t = new Vector3()
const _s = new Vector3()
const _q = new Quaternion()
const _turn = new Quaternion()
