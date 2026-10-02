import { pushOut, type Contact } from '../../../game/collide'
import { districtAt, type CitadelPlan, type Xz } from './plan'
import { insidePolygon } from './polygon'

/**
 * Where each district's garrison stands at peace and the beats it walks
 * (plan.ts `Post`): patrols circling the yard (alternate ones the other way
 * round), sentries pacing beside each of the district's gates, guards pacing
 * before each spawn door. Every beat point stands clear of every collider
 * on the exported walkable floor and inside its own district: a point that
 * lands in something is pushed clear, or dropped if that leaves the floor
 * or takes it out of the district.
 *
 * The export carries no posts: these are the fortress's rules, applied to
 * the citadel's gates, yards and doors. Deterministic: no randomness.
 */

/** A soldier's radius against the scenery (m): the beat points keep it clear (game/enemies/soldier.ts). */
const BODY = 0.62

export function planPosts(plan: CitadelPlan): void {
  const contact: Contact = { nx: 0, nz: 0, depth: 0 }
  const outer = plan.gates.filter((g) => g.kind === 'outer')
  const settle = (p: Xz, sector: number): Xz | null => {
    const q = { x: p[0], z: p[1] }
    for (let i = 0; i < 4 && pushOut(q, BODY + 0.05, plan.segments, plan.circles, contact); i++) { /* pushed clear */ }
    if (pushOut({ x: q.x, z: q.z }, BODY, plan.segments, plan.circles, contact)) return null
    if (!plan.floor.some((f) => insidePolygon(f.polygon, q.x, q.z))) return null
    return districtAt(plan, outer, q.x, q.z) === sector ? [q.x, q.z] : null
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
    // sentries either side of every gate on this side, pacing across its mouth's flanks, looking out through it
    for (const g of plan.gates) {
      const k = g.sectors.indexOf(s.index)
      if (k < 0) continue
      const side = k === 0 ? -1 : 1
      const way: Xz = side < 0 ? g.inside : g.outside
      const facing = Math.atan2(-side * g.out[0], -side * g.out[1])
      const along: Xz = [-g.out[1], g.out[0]]
      const off = g.width / 2 - 3
      for (const e of [-1, 1]) {
        const p: Xz = [way[0] + along[0] * e * off, way[1] + along[1] * e * off]
        if (post(s.index, facing, [p, [p[0] + along[0] * e * 4, p[1] + along[1] * e * 4]])) count++
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
      const a0 = (i / 7) * Math.PI * 2 + ((i * 0.618) % 1) * 0.3
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
