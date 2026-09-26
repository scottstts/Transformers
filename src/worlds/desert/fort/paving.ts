import type { Matrix4 } from 'three/webgpu'
import { MeshWriter, chamferBox } from './mesh'
import type { FortPlan, Module, Xz } from './plan'
import { GATEHOUSE } from './gatehouse'
import { KEEP } from './keep'
import { GARAGE } from './garage'
import { KEEP_BAY, KEEP_BAY_DEPTH } from './layout'

/**
 * Paving: concrete slabs cast in bays (at most 6 m), laid a few centimetres
 * proud of the sand. The bays' top edges are chamfered, so a joint between
 * two reads as a groove in raking light rather than as a painted line. The
 * markings are worn road paint a few millimetres over the slab (their
 * material is biased toward the camera):
 *
 *   0  none (a threshold through a gate)
 *   1  a road: edge lines and a dashed centre line along z
 *   2  an apron before a door: a yellow lead-in line to the door and a stop bar
 *   3  the parade ground: a border and a centre circle's worth of dashes
 *
 * Frame: centred, `m.size` = width (x), -, length (z).
 */
export const PAVING_TOP = 0.03

export function apron(w: MeshWriter, M: Matrix4, m: Module): void {
  const [W, , D] = m.size
  const nx = Math.max(1, Math.ceil(W / 6)), nz = Math.max(1, Math.ceil(D / 6))
  w.place(M)
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x0 = -W / 2 + (i * W) / nx, x1 = -W / 2 + ((i + 1) * W) / nx
      const z0 = -D / 2 + (j * D) / nz, z1 = -D / 2 + ((j + 1) * D) / nz
      w.shade(hash(m.at[0] * 0.7 + m.at[1] * 1.3 + i * 5.1 + j * 2.3) * 0.5 + 0.25)
      chamferBox(w, 'pavement', [x0 + 0.004, -0.12, z0 + 0.004], [x1 - 0.004, PAVING_TOP, z1 - 0.004], 0.012)
    }
  }
  w.shade(0.5)
  const y = PAVING_TOP + 0.002
  const quad = (slot: string, x0: number, z0: number, x1: number, z1: number): void => w.poly(slot, [[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]])
  if (m.variant === 1) {
    for (const s of [-1, 1]) quad('paint', s * (W / 2 - 0.55) - 0.07, -D / 2 + 0.3, s * (W / 2 - 0.55) + 0.07, D / 2 - 0.3)
    for (let z = -D / 2 + 1.5; z + 3 < D / 2 - 1; z += 6) quad('paint', -0.08, z, 0.08, z + 3)
  } else if (m.variant === 2) {
    quad('lineYellow', -0.08, -D / 2 + 0.6, 0.08, D / 2 - 0.4)
    quad('lineYellow', -W / 2 + 1.2, -D / 2 + 0.4, W / 2 - 1.2, -D / 2 + 0.6)
  } else if (m.variant === 3) {
    const b = 0.9
    quad('paint', -W / 2 + b, -D / 2 + b, W / 2 - b, -D / 2 + b + 0.14)
    quad('paint', -W / 2 + b, D / 2 - b - 0.14, W / 2 - b, D / 2 - b)
    quad('paint', -W / 2 + b, -D / 2 + b + 0.14, -W / 2 + b + 0.14, D / 2 - b - 0.14)
    quad('paint', W / 2 - b - 0.14, -D / 2 + b + 0.14, W / 2 - b, D / 2 - b - 0.14)
    // the saluting base's ring: dashes round a circle
    const r = Math.min(W, D) * 0.28, n = 24
    for (let k = 0; k < n; k += 1) {
      const a0 = (k / n) * Math.PI * 2, a1 = a0 + (Math.PI * 2) / n * 0.55
      const p = (a: number, rr: number): [number, number, number] => [Math.cos(a) * rr, y, -Math.sin(a) * rr]
      w.poly('paint', [p(a0, r + 0.08), p(a1, r + 0.08), p(a1, r - 0.08), p(a0, r - 0.08)])
    }
  }
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** A paved patch in the fort frame: an oriented rectangle (or a disc of radius `hx`) and its top's height. */
export interface PavedPatch {
  at: Xz
  yaw: number
  hx: number
  hz: number
  top: number
  round: boolean
}

/**
 * Every paved patch of a plan: the aprons and roads, the gatehouses'
 * passages, the keep's vehicle bay, the garages' and hangars' floors and the
 * helipads. What lands on them (a blast's marks, its thrown crust) is
 * concrete's, not sand's.
 */
export function pavedPatches(plan: FortPlan): PavedPatch[] {
  const out: PavedPatch[] = []
  const at = (m: { at: Xz; yaw: number }, x: number, z: number): Xz => {
    const c = Math.cos(m.yaw), s = Math.sin(m.yaw)
    return [m.at[0] + x * c + z * s, m.at[1] - x * s + z * c]
  }
  for (const m of plan.modules) {
    switch (m.kind) {
      case 'apron': out.push({ at: m.at, yaw: m.yaw, hx: m.size[0] / 2, hz: m.size[2] / 2, top: PAVING_TOP, round: false }); break
      case 'gatehouse': out.push({ at: at(m, 0, GATEHOUSE.front - GATEHOUSE.depth / 2), yaw: m.yaw, hx: m.size[0] / 2, hz: GATEHOUSE.depth / 2, top: PAVING_TOP, round: false }); break
      case 'keep': out.push({ at: at(m, 0, KEEP.depth / 2 - (KEEP_BAY_DEPTH - 0.3) / 2), yaw: m.yaw, hx: KEEP_BAY / 2, hz: (KEEP_BAY_DEPTH + 0.3) / 2, top: PAVING_TOP, round: false }); break
      case 'garage': out.push({ at: m.at, yaw: m.yaw, hx: GARAGE.width / 2 - 0.26, hz: GARAGE.depth / 2 - 0.26, top: PAVING_TOP, round: false }); break
      case 'helipad': out.push({ at: m.at, yaw: m.yaw, hx: (m.size[0] / 2) * 0.96, hz: 0, top: 0.2, round: true }); break
    }
  }
  for (const h of plan.hangars) out.push({ at: h.at, yaw: h.yaw, hx: h.width / 2 - 0.2, hz: h.length / 2 - 0.2, top: 0.12, round: false })
  return out
}
