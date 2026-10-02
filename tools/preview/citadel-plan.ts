import { Scene } from 'three/webgpu'
import { mirrorCitadel } from '../mirror'
import { Citadel } from '../../src/worlds/desert/citadel'
import { citadelPlan, outsideSector } from '../../src/worlds/desert/citadel/plan'
import { CitadelFloor } from '../../src/worlds/desert/citadel/floor'
import { CitadelDistricts } from '../../src/worlds/desert/citadel/districts'
import { CitadelNav } from '../../src/game/enemies/navigation'
import { SOLDIER } from '../../src/game/enemies/soldier'
import { COMMANDER } from '../../src/game/enemies/commander'

export async function inspectCitadel(): Promise<void> {
  const timed = <T>(label: string, build: () => T): T => {
    const start = performance.now()
    const value = build()
    console.log(`${label}: ${(performance.now() - start).toFixed(1)} ms`)
    return value
  }
  const start = performance.now()
  const asset = await mirrorCitadel()
  console.log(`mirror decode: ${(performance.now() - start).toFixed(1)} ms`)
  const plan = timed('plan and posts', () => citadelPlan(asset.plan))
  const floor = timed('floor bins and raster', () => new CitadelFloor(plan))
  timed('district raster', () => new CitadelDistricts(plan))
  console.log(`floor map: ${floor.map.nx} x ${floor.map.nz}, ${(floor.cells.byteLength / 1048576).toFixed(1)} MiB`)
  const citadel = timed('complete citadel CPU construction (includes camera chunks and AO raster)', () => new Citadel(new Scene(), asset))
  timed('soldier navigation', () => new CitadelNav(plan, SOLDIER.radius))
  timed('commander navigation', () => new CitadelNav(plan, COMMANDER.radius))
  console.log(`site (${plan.site.x}, ${plan.site.z}), curtain ${plan.outer.toFixed(1)} m, car ring ${plan.barrier.toFixed(1)} m`)
  for (const s of plan.sectors) {
    console.log(`D${s.index} ${s.role.padEnd(13)} T${s.tier} garrison ${s.garrison} posts ${plan.posts.filter((p) => p.sector === s.index).length} bays ${plan.spawns.filter((p) => p.sector === s.index).length}`)
  }
  for (const g of plan.gates) console.log(`${g.id.padEnd(9)} ${g.kind.padEnd(5)} D${g.sectors.join(' <-> D')} width ${g.width}`)
  const outside = outsideSector(plan)
  let unreachable = 0
  for (let a = 0; a <= outside; a++) for (let b = 0; b <= outside; b++) if (a !== b && plan.nav[a][b] < 0) unreachable++
  console.log(`routes: ${unreachable} unreachable pairs; colliders: ${plan.segments.length} segments, ${plan.circles.length} circles`)
  const lods = { mass: 0, artic: 0, detail: 0 }
  const buckets = new Map<string, number>()
  for (const p of asset.parts) {
    const triangles = p.geometry.getIndex()!.count / 3
    lods[p.lod] += triangles
    buckets.set(p.bucket, (buckets.get(p.bucket) ?? 0) + triangles)
  }
  console.log(`${citadel.triangles} triangles, ${asset.parts.length} meshes`, lods)
  for (const [bucket, triangles] of buckets) console.log(`${bucket.padEnd(8)} ${triangles} triangles`)
  const point = citadel.toWorld(0, 263)
  let sum = 0
  const queryStart = performance.now()
  for (let i = 0; i < 100000; i++) sum += floor.height(point.x + (i % 20), point.z)
  console.log(`floor height query: ${((performance.now() - queryStart) * 10).toFixed(2)} ns; checksum ${sum.toFixed(1)}`)
}
