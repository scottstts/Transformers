import { readMirror } from '../mirror.ts'
import { Quaternion, Vector3 } from 'three/webgpu'
import { decodeSoldierAsset, type SoldierAsset, type SoldierManifest } from '../../src/content/soldier/asset'
import { createSoldierPose } from '../../src/content/soldier/rig'
import { SC, SOLDIER_CHANNEL_COUNT, writePose, type SoldierChannel } from '../../src/content/soldier/poses'
import { CommanderRig } from '../../src/content/commander/rig'
import { crossings, triangles } from '../../tests/support/commander-clash'
import { COMMANDER_POSES } from '../../src/content/commander/poses'
import { CommanderMovePlayer } from '../../src/content/commander/moves'
import { COMMANDER_MOVES } from '../../src/content/commander/combo'

/** The lance along its bone (m, weapon frame): butt and tip. */
const BUTT = -4.23
const TIP = 2.68

/**
 * Pose numbers for authoring the commander (commander frame: x left, y up,
 * z forward of its ground point): the fist, the lance's tip and butt, its
 * elevation and bearing, the free hand; and every frame where the lance's
 * axis or a forearm crosses another part's triangles (LOD2), or the lance
 * passes within 0.1 m of a vertex of the body.
 *
 *   node tools/commander-probe.mjs pose <name|json channels>
 *   node tools/commander-probe.mjs move <1-4> [every]
 */
export function probeCommander(kind: string, what: string, every: number): void {
  const bin = readMirror('commander.bin')
  const asset = decodeSoldierAsset(JSON.parse(readMirror('commander.json', 'utf8')) as SoldierManifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength))
  const rig = new CommanderRig(asset.manifest)
  const tris = triangles(asset)
  const pose = createSoldierPose()
  const place = { x: 0, z: 0, y: 0, yaw: 0, tilt: new Quaternion() }
  const v = new Float32Array(SOLDIER_CHANNEL_COUNT)
  const report = (label: string, values: Float32Array, yaw = 0, ahead = 0): void => {
    writePose(values, pose)
    place.yaw = yaw
    place.z = ahead
    rig.pose(place, pose)
    const W = rig.world
    const at = (p: Vector3): string => `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`
    const weapon = W[rig.index.weapon]
    const grip = new Vector3().setFromMatrixPosition(weapon)
    const tip = new Vector3(0, 0, TIP).applyMatrix4(weapon)
    const butt = new Vector3(0, 0, BUTT).applyMatrix4(weapon)
    const d = tip.clone().sub(butt).normalize()
    const elev = Math.asin(d.y) * 180 / Math.PI
    const bearing = Math.atan2(d.x, d.z) * 180 / Math.PI
    const handL = new Vector3().setFromMatrixPosition(W[rig.index['hand.L']])
    const clash = crossings(rig, tris, butt, tip, ['hand.R', 'weapon', 'blade'])
    const near = nearest(rig, asset, butt, tip, ['hand.R', 'weapon', 'blade', 'forearm.R'])
    const arms: string[] = []
    for (const s of ['L', 'R']) {
      const e = new Vector3().setFromMatrixPosition(W[rig.index[`forearm.${s}`]])
      const w = new Vector3().setFromMatrixPosition(W[rig.index[`hand.${s}`]])
      const f = new Vector3(0, 0, -0.42).applyMatrix4(W[rig.index[`hand.${s}`]])
      const own = [`upperarm.${s}`, `forearm.${s}`, `hand.${s}`, 'weapon', 'blade']
      const c = [...crossings(rig, tris, e, w, own), ...crossings(rig, tris, w, f, own)]
      if (c.length) arms.push(`${s}arm x ${[...new Set(c)].join('/')}`)
    }
    console.log(`${label.padEnd(10)} grip ${at(grip)}  tip ${at(tip)}  butt ${at(butt)}  elev ${elev.toFixed(0)} bear ${bearing.toFixed(0)}  handL ${at(handL)}  ` +
      `${clash.length ? `LANCE x ${[...new Set(clash)].join('/')}` : ''}${near.d < 0.1 ? ` near ${near.bone} ${near.d.toFixed(2)}` : ''} ${arms.join(' ')}`)
  }
  if (kind === 'solve') {
    // {"pose": {channels}, "grip": [x, y, z] (optional), "elev": deg, "bear": deg}: the right arm's channels for it
    const goal = JSON.parse(what) as { pose: Record<string, number>; grip?: [number, number, number]; elev: number; bear: number; arm?: Record<string, number> }
    const base = new Float32Array(SOLDIER_CHANNEL_COUNT)
    for (const [k, x] of Object.entries(goal.pose)) base[SC[k as SoldierChannel]] = x
    const names: SoldierChannel[] = ['R.pitch', 'R.out', 'R.twist', 'R.elbow', 'R.wrist', 'R.wristYaw', 'R.wristRoll']
    const cost = (x: number[]): number => {
      v.set(base)
      names.forEach((n, i) => { v[SC[n]] = x[i] })
      writePose(v, pose)
      rig.pose(place, pose)
      const weapon = rig.world[rig.index.weapon]
      const grip = new Vector3().setFromMatrixPosition(weapon)
      const tip = new Vector3(0, 0, TIP).applyMatrix4(weapon)
      const butt = new Vector3(0, 0, BUTT).applyMatrix4(weapon)
      const d = tip.clone().sub(butt).normalize()
      const elev = Math.asin(d.y) * 180 / Math.PI
      const bear = Math.atan2(d.x, d.z) * 180 / Math.PI
      let c = ((elev - goal.elev) / 3) ** 2 + ((((bear - goal.bear + 540) % 360) - 180) / 3) ** 2
      if (goal.grip) c += grip.distanceToSquared(new Vector3(...goal.grip)) / 0.01
      // joints within reach of a gauntleted arm, and small wrist angles
      c += (Math.max(0, x[3] - 125) / 5) ** 2 + (Math.max(0, -x[3]) / 2) ** 2 + (x[4] / 60) ** 2 + (Math.max(0, Math.abs(x[4]) - 50) / 4) ** 2 + (x[5] / 40) ** 2 + (Math.max(0, Math.abs(x[5]) - 40) / 4) ** 2 + (x[6] / 30) ** 2 + (Math.max(0, Math.abs(x[6]) - 45) / 4) ** 2 + (x[2] / 50) ** 2 + (Math.max(0, Math.abs(x[2]) - 60) / 4) ** 2 + (Math.max(0, x[1] - 50) / 5) ** 2
      c += 25 * crossings(rig, tris, butt, tip, ['hand.R', 'weapon', 'blade']).length
      const e = new Vector3().setFromMatrixPosition(rig.world[rig.index['forearm.R']])
      const w = new Vector3().setFromMatrixPosition(rig.world[rig.index['hand.R']])
      c += 25 * crossings(rig, tris, e, w, ['upperarm.R', 'forearm.R', 'hand.R', 'weapon', 'blade']).length
      return c
    }
    const start = names.map((n) => goal.arm?.[n] ?? base[SC[n]])
    const best = nelderMead(cost, start, 12, 900)
    const out: Record<string, number> = { ...goal.pose }
    names.forEach((n, i) => { out[n] = Math.round(best[i]) })
    console.log(`cost ${cost(names.map((n) => out[n])).toFixed(2)}`)
    console.log(JSON.stringify(out))
    v.fill(0)
    for (const [k, x] of Object.entries(out)) v[SC[k as SoldierChannel]] = x
    report('solved', v)
    return
  }
  if (kind === 'blend') {
    // a,b: the pose eased from one key pose to the other
    const [a, b] = what.split(',').map((n) => COMMANDER_POSES[n as keyof typeof COMMANDER_POSES])
    for (let u = 0; u <= 1.0001; u += every) report(`u ${u.toFixed(2)}`, v.map((_, i) => a[i] + (b[i] - a[i]) * u))
    return
  }
  if (kind === 'pose') {
    if (what.startsWith('{')) {
      v.fill(0)
      for (const [k, x] of Object.entries(JSON.parse(what) as Record<string, number>)) v[SC[k as SoldierChannel]] = x
      report('json', v)
    } else for (const name of what === 'all' ? Object.keys(COMMANDER_POSES) : what.split(',')) report(name, COMMANDER_POSES[name as keyof typeof COMMANDER_POSES])
    return
  }
  // a move from the ready stance, or (`combo`) moves 1 to 4 chained at their chain times, from `what` (a pose name)
  const player = new CommanderMovePlayer()
  const list = kind === 'combo' ? COMMANDER_MOVES : [COMMANDER_MOVES[Number(what) - 1]]
  player.reset(kind === 'combo' ? COMMANDER_POSES[what as keyof typeof COMMANDER_POSES] : COMMANDER_POSES.ready)
  const dt = 1 / 120
  let clock = 0, next = 0, turn = 0, ahead = 0
  list.forEach((move, k) => {
    player.start(move, COMMANDER_POSES.ready)
    const end = k < list.length - 1 ? move.chain : move.duration
    for (let t = 0; t < end - 1e-9; t += dt) {
      player.update(dt)
      clock += dt
      if (clock + 1e-9 < next) continue
      next += every
      report(`${k + 1} ${player.time.toFixed(2)}`, player.values, turn + player.turn * Math.PI / 180, ahead + player.advance)
    }
    turn += player.turn * Math.PI / 180
    ahead += player.advance
  })
}

/** The body vertex nearest the segment p-q, skipping `skip`. */
function nearest(rig: CommanderRig, asset: SoldierAsset, p: Vector3, q: Vector3, skip: string[]): { bone: string; d: number } {
  const skipped = new Set(skip.map((n) => rig.index[n]))
  const names = Object.keys(rig.index)
  let best = { bone: '-', d: Infinity }
  const x = new Vector3(), dir = q.clone().sub(p), len2 = dir.lengthSq()
  for (const { geometry } of asset.lods[2]) {
    const pos = geometry.getAttribute('position'), bones = geometry.getAttribute('boneIndex')
    for (let i = 0; i < pos.count; i++) {
      const bone = bones.getX(i)
      if (skipped.has(bone)) continue
      x.fromBufferAttribute(pos, i).applyMatrix4(rig.world[bone])
      const u = Math.max(0, Math.min(1, x.clone().sub(p).dot(dir) / len2))
      const d = x.distanceTo(p.clone().addScaledVector(dir, u))
      if (d < best.d) best = { bone: names.find((n) => rig.index[n] === bone)!, d }
    }
  }
  return best
}

/** Nelder-Mead minimisation from `x0` with a simplex of `step`, at most `iterations` steps. */
function nelderMead(f: (x: number[]) => number, x0: number[], step: number, iterations: number): number[] {
  const n = x0.length
  let pts = [x0, ...x0.map((_, i) => x0.map((x, j) => x + (i === j ? step : 0)))].map((x) => ({ x, f: f(x) }))
  for (let k = 0; k < iterations; k++) {
    pts.sort((a, b) => a.f - b.f)
    const c = new Array<number>(n).fill(0)
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += pts[i].x[j] / n
    const worst = pts[n]
    const at = (t: number): number[] => c.map((cj, j) => cj + t * (worst.x[j] - cj))
    const r = at(-1), fr = f(r)
    if (fr < pts[0].f) {
      const e = at(-2), fe = f(e)
      pts[n] = fe < fr ? { x: e, f: fe } : { x: r, f: fr }
    } else if (fr < pts[n - 1].f) pts[n] = { x: r, f: fr }
    else {
      const ct = at(0.5), fc = f(ct)
      if (fc < worst.f) pts[n] = { x: ct, f: fc }
      else pts = pts.map((p, i) => i === 0 ? p : { x: p.x.map((xj, j) => pts[0].x[j] + 0.5 * (xj - pts[0].x[j])), f: 0 }).map((p, i) => i === 0 ? p : { x: p.x, f: f(p.x) })
    }
  }
  pts.sort((a, b) => a.f - b.f)
  return pts[0].x
}
