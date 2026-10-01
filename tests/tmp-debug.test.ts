import { it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { Scene } from 'three/webgpu'
import { Citadel } from '../src/worlds/desert/citadel'
import { CitadelDistricts } from '../src/worlds/desert/citadel/districts'
import { CitadelNav } from '../src/game/enemies/navigation'
import { pushOut } from '../src/game/collide'
import { mirrorCitadel } from '../tools/mirror.ts'

it('debug', async () => {
  const citadel = new Citadel(new Scene(), await mirrorCitadel())
  const plan = citadel.plan
  const districts = new CitadelDistricts(plan)
  const nav = new CitadelNav(plan, 0.62)
  const seen: string[] = []
  const pairs = [[5, 1]]
  for (const [from, to] of pairs) {
  const a = plan.sectors[from]
  const p = { x: a.yard.at[0], z: a.yard.at[1] }, next = { x: 0, z: 0 }
  const contact = { nx: 0, nz: 0, depth: 0 }
  const yard = plan.sectors[to].yard.at
  let lastLog = -1e9, lastHere = -1
  for (let step = 0; step < 24000; step++) {
    const here = districts.at(p.x, p.z)
    const gate = plan.nav[here]?.[to]
    if (!nav.next(p.x, p.z, here, to, next)) nav.approach(p.x, p.z, yard[0], yard[1], here, next)
    const d = Math.hypot(next.x - p.x, next.z - p.z)
    if (here === to && Math.hypot(yard[0] - p.x, yard[1] - p.z) < 1) { seen.push('arrived ' + step); break }
    p.x += ((next.x - p.x) / Math.max(d, 1e-6)) * Math.min(0.2, d)
    p.z += ((next.z - p.z) / Math.max(d, 1e-6)) * Math.min(0.2, d)
    pushOut(p, 0.62, plan.segments, plan.circles, contact)
    if (step - lastLog > 600 || here !== lastHere) { lastLog = step; lastHere = here; seen.push(step + ': (' + p.x.toFixed(1) + ', ' + p.z.toFixed(1) + ') here ' + here + ' gate ' + gate + ' ' + plan.gates[gate]?.id + ' ' + JSON.stringify(plan.gates[gate]?.inside) + JSON.stringify(plan.gates[gate]?.outside) + ' next (' + next.x.toFixed(1) + ',' + next.z.toFixed(1) + ') walk ' + nav.walkable(p.x, p.z)) }
  }
  }
  writeFileSync('/private/tmp/claude-501/-Users-scott-Documents-Projects-Node-Transformers/64245d75-3bb9-4764-9826-01be1d437287/scratchpad/debug.txt', seen.slice(0, 40).join('\n'))
})
