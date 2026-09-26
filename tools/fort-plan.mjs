// Prints the fortress plan's diagnostics: districts (role, garrison, posts, spawns, yard), gates and the
// districts they join, navigation reachability, module counts by kind, triangles and meshes per bucket,
// and how long planning and building take.
// Usage: node tools/fort-plan.mjs
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
try {
  const { planFort, FORT_SITES, outsideSector } = await server.ssrLoadModule('/src/worlds/desert/fort/plan.ts')
  const { buildFort } = await server.ssrLoadModule('/src/worlds/desert/fort/build.ts')
  const { createFortMaterials } = await server.ssrLoadModule('/src/worlds/desert/fort/materials.ts')
  for (const site of FORT_SITES) {
    let t0 = performance.now()
    const plan = planFort(site)
    const planMs = performance.now() - t0
    console.log(`fort ${site.id}: planned in ${planMs.toFixed(0)} ms, outer ${plan.outer.toFixed(1)} m, barrier ${plan.barrier.toFixed(1)} m`)
    for (const s of plan.sectors) {
      const posts = plan.posts.filter((p) => p.sector === s.index).length
      const spawns = plan.spawns.filter((p) => p.sector === s.index).length
      console.log(`  sector ${s.index} ${s.role.padEnd(9)} garrison ${s.garrison} posts ${posts} spawns ${spawns} yard (${s.yard.at.map((v) => v.toFixed(0))}) r${s.yard.r} bounds r${s.bounds.r.toFixed(0)}`)
    }
    for (const g of plan.gates) console.log(`  gate ${g.kind.padEnd(7)} at (${g.at.map((v) => v.toFixed(0))}) joins ${g.sectors.join(' <-> ')}`)
    const out = outsideSector(plan)
    let unreachable = 0
    for (let a = 0; a <= out; a++) for (let b = 0; b <= out; b++) if (a !== b && plan.nav[a][b] < 0) unreachable++
    console.log(`  nav: ${unreachable} unreachable pairs`)
    const kinds = {}
    for (const m of plan.modules) kinds[m.kind] = (kinds[m.kind] ?? 0) + 1
    console.log('  modules', JSON.stringify(kinds))
    console.log(`  colliders: ${plan.segments.length} segments, ${plan.circles.length} circles, hangars ${plan.hangars.length}`)
    t0 = performance.now()
    const built = buildFort(plan, createFortMaterials())
    const buildMs = performance.now() - t0
    const buckets = {}
    for (const mesh of built.group.children) {
      const b = mesh.name.split(':')[1]
      const tris = (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count) / 3
      buckets[b] ??= { meshes: 0, tris: 0 }
      buckets[b].meshes++
      buckets[b].tris += tris
    }
    console.log(`  built in ${buildMs.toFixed(0)} ms: ${built.triangles} triangles, ${built.group.children.length} meshes (${built.detail.length} detail)`)
    for (const [b, v] of Object.entries(buckets)) console.log(`    ${b.padEnd(4)} ${String(v.meshes).padStart(3)} meshes ${String(v.tris).padStart(8)} tris`)
  }
} finally {
  await server.close()
}
process.exit(0)
