import { writeFileSync } from 'node:fs'
import { BufferAttribute, BufferGeometry, DoubleSide, FloatType, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, RenderTarget, Scene } from 'three/webgpu'
import { attribute, float, frontFacing, select, uniform, vec4 } from 'three/tsl'
import { createHeadlessRenderer } from './headless'
import { mirrorCitadel } from '../mirror'
import { citadelPlan } from '../../src/worlds/desert/citadel/plan'
import { CitadelFloor } from '../../src/worlds/desert/citadel/floor'
import { pushOut, type Contact } from '../../src/game/collide'

/**
 * Faces seen from behind: the citadel drawn double-sided from eye height at
 * points over the whole walkable floor (where a soldier could stand), each
 * visible back-facing pixel traced to its triangle. The game's materials are
 * single-sided, so these are the faces that vanish in play: built inside
 * out, or open sheets. Prints the worst by bucket, slot and class, and with
 * `out` writes every flagged triangle (fort frame) as JSON.
 */
export async function auditBackfaces(spacing = 16, out = ''): Promise<void> {
  const W = 240, H = 136
  const { renderer } = await createHeadlessRenderer(W, H)
  const asset = await mirrorCitadel()
  const plan = citadelPlan(asset.plan)
  const floor = new CitadelFloor(plan)
  const site = plan.site, c = Math.cos(site.yaw), s = Math.sin(site.yaw)
  const scene = new Scene()
  const material = new MeshBasicNodeMaterial({ side: DoubleSide })
  const part = uniform(0).onObjectUpdate(({ object }) => (object?.userData.part as number | undefined) ?? 0)
  const id = part.add(1)
  material.fragmentNode = vec4(select(frontFacing, id, float(0).sub(id)), attribute('tri', 'float'), 0, 1)
  // unindexed, so every vertex can carry its triangle's index
  const flat = asset.parts.map((p, i) => {
    const g = p.geometry.toNonIndexed()
    const n = g.getAttribute('position').count
    const tri = new Float32Array(n)
    for (let v = 0; v < n; v++) tri[v] = Math.floor(v / 3)
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', g.getAttribute('position'))
    geometry.setAttribute('tri', new BufferAttribute(tri, 1))
    const mesh = new Mesh(geometry, material)
    mesh.userData.part = i
    scene.add(mesh)
    return g.getAttribute('position')
  })
  const target = new RenderTarget(W, H, { type: FloatType })
  const camera = new PerspectiveCamera(75, W / H, 0.2, 2000)
  const seen = new Map<number, { pixels: number; views: Map<number, number> }>()
  const eyes: number[][] = []
  let views = 0, back = 0, front = 0
  const { x0, z0, x1, z1 } = plan.bounds
  const contact: Contact = { nx: 0, nz: 0, depth: 0 }
  renderer.setRenderTarget(target)
  renderer.setClearColor(0x000000, 0)
  for (let z = z0 + spacing / 2; z < z1; z += spacing) for (let x = x0 + spacing / 2; x < x1; x += spacing) {
    const h = floor.height(site.x + x * c + z * s, site.z - x * s + z * c)
    // a soldier could stand here: not inside a building
    if (Number.isNaN(h) || pushOut({ x, z }, 1, plan.segments, plan.circles, contact)) continue
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2
      camera.position.set(x, h + 3, z)
      camera.lookAt(x + Math.sin(a), h + 3.6, z + Math.cos(a))
      camera.updateMatrixWorld()
      renderer.render(scene, camera)
      const px = await renderer.readRenderTargetPixelsAsync(target, 0, 0, W, H) as Float32Array
      const view = views++
      eyes.push([x, h + 3, z])
      for (let i = 0; i < W * H; i++) {
        const w = px[i * 4]
        if (w > 0) { front++; continue }
        if (w === 0) continue
        back++
        const key = (Math.round(-w) - 1) * 4_000_000 + Math.round(px[i * 4 + 1])
        let e = seen.get(key)
        if (!e) seen.set(key, e = { pixels: 0, views: new Map() })
        e.pixels++
        e.views.set(view, (e.views.get(view) ?? 0) + 1)
      }
    }
  }
  console.log(`${views} views from ${views / 6} floor points; back-facing ${(100 * back / (back + front)).toFixed(3)} % of covered pixels`)
  const flagged: Array<{ part: string; pixels: number; views: number; eye: number[]; a: number[]; b: number[]; c: number[] }> = []
  const byPart = new Map<string, number>()
  for (const [key, e] of seen) {
    if (e.views.size < 2) continue
    const pi = Math.floor(key / 4_000_000), t = key % 4_000_000
    const p = asset.parts[pi], pos = flat[pi]
    const name = `${p.bucket}:${p.slot}:${p.lod}`
    byPart.set(name, (byPart.get(name) ?? 0) + e.pixels)
    const v = (k: number) => [pos.getX(t * 3 + k), pos.getY(t * 3 + k), pos.getZ(t * 3 + k)]
    flagged.push({ part: name, pixels: e.pixels, views: e.views.size, eye: eyes[[...e.views].sort((p, q) => q[1] - p[1])[0][0]], a: v(0), b: v(1), c: v(2) })
  }
  for (const [name, px] of [...byPart].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`${String(px).padStart(8)} px  ${name}`)
  if (out) writeFileSync(out, JSON.stringify(flagged))
}

/** Draw flagged triangles (indices into the audit's JSON) from the view that saw most of each, back faces red. */
export async function shootBackfaces(json: string, indices: number[], directory: string): Promise<void> {
  const { readFileSync, mkdirSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { Vector3 } = await import('three/webgpu')
  const { normalWorld, vec3 } = await import('three/tsl')
  const flagged = JSON.parse(readFileSync(json, 'utf8')) as Array<{ eye: number[]; a: number[]; b: number[]; c: number[] }>
  mkdirSync(directory, { recursive: true })
  const { renderer, capture } = await createHeadlessRenderer(640, 360)
  const asset = await mirrorCitadel()
  const scene = new Scene()
  const look = new MeshBasicNodeMaterial({ side: DoubleSide })
  const shade = normalWorld.dot(vec3(0.4, 0.8, 0.45).normalize()).abs().mul(0.6).add(0.3)
  look.colorNode = select(frontFacing, vec3(shade), vec3(1, 0.05, 0.05))
  for (const p of asset.parts) scene.add(new Mesh(p.geometry, look))
  const camera = new PerspectiveCamera(75, 640 / 360, 0.2, 2000)
  for (const i of indices) {
    const t = flagged[i]
    camera.position.fromArray(t.eye)
    camera.lookAt(new Vector3().fromArray(t.a).add(new Vector3().fromArray(t.b)).add(new Vector3().fromArray(t.c)).divideScalar(3))
    camera.updateMatrixWorld()
    renderer.render(scene, camera)
    await capture(join(directory, `${i}.png`))
  }
}
