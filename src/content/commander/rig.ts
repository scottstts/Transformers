import { Matrix4, Quaternion, Vector3 } from 'three/webgpu'
import type { SoldierManifest } from '../soldier/asset'
import { SoldierRig } from '../soldier/rig'

/** The legs' rest splay (deg): the skirt opens only past it. */
const SPLAY = 12
/**
 * How far each skirt plate follows its thigh: the side plates (`mantle`) swing
 * with a knee coming forward and open with a leg going out; the rear plates
 * (`tail`) swing with a knee going back. A plate that stayed put would cut
 * into a thigh swinging under it.
 */
const MANTLE_FWD = 0.75
const MANTLE_BACK = 0.25
const MANTLE_OUT = 0.9
const TAIL_BACK = 0.9
const TAIL_FWD = 0.15
const TAIL_OUT = 0.5

/**
 * The commander's skeleton: the soldier's rig (the same 20 bones, wheels and
 * IK) plus the lance on `weapon` and four skirt hinges.
 *
 * The export's rest pose is the parade carry: the right arm bent to hold the
 * lance upright. The arm channels (poses.ts) are angles from a hanging arm,
 * so the right arm's rest is redefined as the left's mirror; the lance keeps
 * its grip in the fist (its bone is the hand's child), so it goes wherever
 * the fist takes it. The skirt plates hinge on the pelvis and follow the
 * thighs (afterLegs).
 */
export class CommanderRig extends SoldierRig {
  private readonly skirt: Array<{ bone: number; thigh: number; side: number; tail: boolean }>
  private readonly pelvis: number

  constructor(manifest: SoldierManifest) {
    super(manifest)
    for (const part of ['upperarm', 'forearm', 'hand']) {
      const l = this.restQ[this.index[`${part}.L`]]
      // mirrored across the body's mid plane (x -> -x)
      this.restQ[this.index[`${part}.R`]].set(l.x, -l.y, -l.z, l.w)
    }
    this.pelvis = this.index.pelvis
    this.skirt = []
    for (const [s, side] of [['L', 1], ['R', -1]] as const) {
      const thigh = this.index[`thigh.${s}`]
      for (const tail of [false, true]) {
        const bone = this.index[`${tail ? 'tail' : 'mantle'}.${s}`]
        if (bone === undefined) throw new Error(`Commander asset lacks its skirt hinge ${tail ? 'tail' : 'mantle'}.${s}`)
        this.skirt.push({ bone, thigh, side, tail })
      }
    }
  }

  /** The skirt plates swing with the thighs under them. */
  protected afterLegs(): void {
    const W = this.auth
    _inv.copy(W[this.pelvis]).invert()
    for (const s of this.skirt) {
      // the thigh's line (hip to knee) in the pelvis frame: its swing forward and out
      const k = _k.set(0, 0, -1).transformDirection(W[s.thigh]).transformDirection(_inv)
      const fwd = Math.atan2(-k.y, -k.z)
      const out = Math.max(0, Math.atan2(s.side * k.x, -k.z) - SPLAY * DEG)
      const swing = s.tail
        ? (fwd < 0 ? -fwd * TAIL_BACK : -fwd * TAIL_FWD)
        : -(fwd > 0 ? fwd * MANTLE_FWD : fwd * MANTLE_BACK)
      _qa.setFromAxisAngle(X, swing)
      _qb.setFromAxisAngle(Y, -s.side * out * (s.tail ? TAIL_OUT : MANTLE_OUT))
      _q.copy(this.restQ[s.bone]).multiply(_qb).multiply(_qa)
      W[s.bone].multiplyMatrices(W[this.parent[s.bone]], _m.compose(this.restT[s.bone], _q, ONE))
    }
  }
}

const DEG = Math.PI / 180
const X = new Vector3(1, 0, 0)
const Y = new Vector3(0, 1, 0)
const ONE = new Vector3(1, 1, 1)
const _inv = new Matrix4()
const _m = new Matrix4()
const _k = new Vector3()
const _q = new Quaternion()
const _qa = new Quaternion()
const _qb = new Quaternion()
