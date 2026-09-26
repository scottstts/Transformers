import { pushOut, type Contact } from '../../../game/collide'
import { sectorAt, type FortPlan, type Xz } from './plan'
import { gatesOf } from './districts'

/**
 * Where each district's garrison stands at peace and the beats it walks
 * (plan.ts `Post`): patrols circling the yard (alternate ones the other way
 * round), sentries pacing along the wall beside each of the district's
 * gates, pairs walking in from the gates toward the yard, guards pacing
 * before each spawn door. Every beat point stands clear of every collider
 * and inside its own district: a point that lands in something is pushed
 * clear, or dropped if that takes it out of the district.
 */

/** A soldier's radius against the scenery (m): the beat points keep it clear (game/enemies/soldier.ts). */
const BODY = 0.62

export function planPosts(plan: FortPlan, rand: () => number): void {
  const contact: Contact = { nx: 0, nz: 0, depth: 0 }
  const settle = (p: Xz, sector: number): Xz | null => {
    const q = { x: p[0], z: p[1] }
    for (let i = 0; i < 4 && pushOut(q, BODY + 0.05, plan.segments, plan.circles, contact); i++) { /* pushed clear */ }
    if (pushOut({ x: q.x, z: q.z }, BODY, plan.segments, plan.circles, contact)) return null
    return sectorAt(plan, q.x, q.z) === sector ? [q.x, q.z] : null
  }
  const post = (sector: number, yaw: number, beat: Xz[]): boolean => {
    const clear = beat.map((p) => settle(p, sector)).filter((p): p is Xz => p !== null)
    if (clear.length < 2) return false
    plan.posts.push({ at: clear[0], yaw, beat: clear, sector })
    return true
  }
  for (const s of plan.sectors) {
    let count = 0
    const { at: y, r: yr } = s.yard
    // sentries either side of every gate on this side, pacing along the wall
    for (const g of gatesOf(plan, s.index)) {
      const side = g.sectors[0] === s.index ? -1 : 1
      const way: Xz = side < 0 ? g.inside : g.outside
      // looking out through the gate
      const facing = Math.atan2(-side * g.out[0], -side * g.out[1])
      const along: Xz = [-g.out[1], g.out[0]]
      for (const k of [-1, 1]) {
        const p: Xz = [way[0] + along[0] * k * 3.4, way[1] + along[1] * k * 3.4]
        if (post(s.index, facing, [p, [p[0] + along[0] * k * 4, p[1] + along[1] * k * 4]])) count++
      }
    }
    // a guard before each spawn door, pacing across it
    plan.spawns.filter((sp) => sp.sector === s.index).forEach((d, i) => {
      const out: Xz = [d.exit[0] - d.at[0], d.exit[1] - d.at[1]]
      const l = Math.hypot(out[0], out[1])
      const across: Xz = [-out[1] / l, out[0] / l]
      const k = i % 2 ? 1 : -1
      const p: Xz = [d.exit[0] - (out[0] / l) * 2 + across[0] * k * 4.2, d.exit[1] - (out[1] / l) * 2 + across[1] * k * 4.2]
      if (post(s.index, Math.atan2(out[0], out[1]), [p, [p[0] + across[0] * k * 3.5 + (out[0] / l) * 1.5, p[1] + across[1] * k * 3.5 + (out[1] / l) * 1.5]])) count++
    })
    // patrols round the yard: at least 45 % of the garrison, and until it has a post each
    const loops = Math.ceil(s.garrison * 0.45)
    for (let i = 0, made = 0; (made < loops || count < s.garrison) && i < s.garrison * 3; i++) {
      const a0 = (i / 7) * Math.PI * 2 + rand() * 0.3
      const r = yr * (0.45 + ((i * 0.37) % 1) * 0.45)
      const dir = i % 2 ? 1 : -1
      const beat: Xz[] = []
      for (let k = 0; k < 10; k++) {
        const a = a0 + (dir * k * Math.PI) / 5
        beat.push([y[0] + Math.sin(a) * r, y[1] + Math.cos(a) * r])
      }
      if (post(s.index, Math.atan2(beat[0][0] - y[0], beat[0][1] - y[1]), beat)) { count++; made++ }
    }
  }
}
