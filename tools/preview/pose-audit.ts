import { mirrorCitadel, readMirror } from '../mirror.ts'
import { PerspectiveCamera, Quaternion, Scene, Vector3, type Matrix4, type BufferGeometry, type Mesh, type Object3D } from 'three/webgpu'
import { createDesertWorld } from '../../src/worlds/desert'
import { rosterEntry } from '../../src/content/roster'
import { decodeTransformerAsset } from '../../src/content/transformer/asset/loader'
import { decodeWeaponAsset, type WeaponManifest } from '../../src/content/transformer/asset/weapon'
import type { TransformerManifest } from '../../src/content/transformer/asset/format'
import { AudioMix } from '../../src/audio/mix'
import { createMotionState } from '../../src/game/types'
import { RobotCombat } from '../../src/game/combat/robot-combat'
import { CameraFx } from '../../src/game/combat/camera-fx'

/**
 * A fight's pose defects that the clash probe does not see, played at the
 * game's own frame rate (wall time, the special's slow motion included):
 *
 *  - `gap`: two parts on different bones that touch at the stand (within
 *    TOUCH) and come apart by more than GAP during the fight: a part left
 *    floating off the body (a brace whose ends ride different bones, a panel
 *    hung off a joint);
 *  - `snap`: a bone (the main arm's chain, the head, the chest) or the blade
 *    turning in one frame far more than in the frames either side of it: a
 *    pose that jumps instead of moving (worst frames listed);
 *  - `twist`: the main hand turned about its forearm from the stand's past
 *    TWIST (deg), the wrung-arm look.
 *
 * node tools/pose-audit.mjs [car] [clicks, F<t> the special, G<t> the guard held from t] [until]
 */
const TOUCH = 0.025
const GAP = Number(process.env.AUDIT_GAP ?? 0.06)
const TWIST = Number(process.env.AUDIT_TWIST ?? 85)
/** A frame's turn counts as a snap past this many times its neighbours' (and past SNAP_MIN deg). */
const SNAP_RATIO = 2.5
const SNAP_MIN = Number(process.env.AUDIT_SNAP ?? 6)
const DT = 1 / 60
const SAMPLE = 3500
/** AUDIT_TRACE=t0,t1: every frame of the move's time t0..t1 */
const TRACE = process.env.AUDIT_TRACE?.split(',').map(Number)
/** AUDIT_WALL=1: AUDIT_TRACE in wall time (s from the start), through anything that is not a move (the guard) */
const WALL = process.env.AUDIT_WALL === '1'
/** AUDIT_PLACE=t,t..: the held weapon's placement at those move times, as a free flight is authored (grip from the pelvis at rest; blade, edge) */
const PLACE = process.env.AUDIT_PLACE?.split(',').map(Number) ?? []

const _s0 = new Vector3(), _s1 = new Vector3(), _s2 = new Vector3(), _s3 = new Vector3(), _s4 = new Vector3(), _s5 = new Vector3(), _s6 = new Vector3()

interface Part { name: string; object: Object3D; bone: string; local: Float32Array; world: Float32Array }

export async function auditPose(car: string, tokens: string[], until: number): Promise<void> {
  const clicks = tokens.filter((c) => !/^[FG]/.test(c)).map(Number)
  const specials = tokens.filter((c) => c.startsWith('F')).map((c) => Number(c.slice(1)))
  const guards = tokens.filter((c) => c.startsWith('G')).map((c) => Number(c.slice(1)))
  const entry = rosterEntry(car)
  const read = (name: string): [unknown, ArrayBuffer] => {
    const bin = readMirror(`${name}.bin`)
    return [JSON.parse(readMirror(`${name}.json`, 'utf8')), bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)]
  }
  const [manifest, bin] = read(entry.id)
  const asset = decodeTransformerAsset(manifest as TransformerManifest, bin, entry.label)
  const [wm, wb] = read(entry.weapon)
  asset.weapon = decodeWeaponAsset(wm as WeaponManifest, wb, entry.label)
  const world = createDesertWorld(new Scene(), await mirrorCitadel())
  const player = entry.create(asset, world.contactEffects, new AudioMix())
  const state = createMotionState()
  state.mode = 'robot'; state.target = 1; state.progress = 1; state.yaw = 0
  state.pos.y = world.world.ground.height(state.pos.x, state.pos.z + player.robotOffset)
  const fight = new RobotCombat(player.combat, player.model, player.robotOffset, state, new CameraFx())
  const aim = new PerspectiveCamera()
  const model = player.model
  const main = player.combat.overlay.build.main
  const node = (name: string): Object3D => model.node(name)
  const weapon = node(`bone:hand.${main}`).children.find((c) => c.name.startsWith('weapon:'))
  const frame = (fight as unknown as { frame: { move: number; time: number } }).frame
  const moveAt = (): string => frame.move < 0 ? '-' : `${frame.move === player.combat.moveset.moves.length ? 's' : `m${frame.move + 1} `}${frame.time.toFixed(2)}`

  // the parts: each geometry node's vertices (sampled) and the bone that carries it
  const parts: Part[] = []
  // the model's nodes are flat: the bone that carries each is read from the manifest's hierarchy
  const records = (manifest as TransformerManifest).nodes
  const byName = new Map(records.map((r, i) => [r.name, i]))
  const boneOf = (o: Object3D): string => {
    for (let i = byName.get(o.name) ?? -1; i >= 0; i = records[i].parent) if (records[i].kind === 'bone') return records[i].name
    return '-'
  }
  for (const n of model.root.children[0].children) {
    const meshes = n.children.filter((c) => (c as Mesh).isMesh && !c.name.startsWith('weapon:')) as Mesh[]
    if (!meshes.length) continue
    const all: number[] = []
    for (const m of meshes) {
      const p = (m.geometry as BufferGeometry).getAttribute('position')
      const stride = Math.max(1, Math.floor(p.count / SAMPLE))
      for (let i = 0; i < p.count; i += stride) all.push(p.getX(i), p.getY(i), p.getZ(i))
    }
    const local = new Float32Array(all)
    parts.push({ name: n.name, object: n, bone: boneOf(n), local, world: new Float32Array(local.length) })
  }
  const v = new Vector3()
  const place = (p: Part): void => {
    const e = p.object.matrixWorld.elements
    const l = p.local, w = p.world
    for (let i = 0; i < l.length; i += 3) {
      const x = l[i], y = l[i + 1], z = l[i + 2]
      w[i] = e[0] * x + e[4] * y + e[8] * z + e[12]
      w[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]
      w[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]
    }
  }
  /** each part's vertices hashed into CELL cubes, rebuilt when the part has been placed again */
  const CELL = 0.08
  const grids = new Map<Part, Map<number, number[]>>()
  const cell = (x: number): number => Math.floor(x / CELL) + 512
  const grid = (p: Part): Map<number, number[]> => {
    let g = grids.get(p)
    if (g) return g
    grids.set(p, g = new Map())
    const w = p.world
    for (let i = 0; i < w.length; i += 3) {
      const k = (cell(w[i]) * 1024 + cell(w[i + 1])) * 1024 + cell(w[i + 2])
      let c = g.get(k)
      if (!c) g.set(k, c = [])
      c.push(i)
    }
    return g
  }
  /** nearest distance (capped) from the point at a.world[i] to b's vertices */
  const nearPoint = (a: Part, i: number, b: Part, cap: number): number => {
    const g = grid(b), w = b.world, aw = a.world
    let best = cap * cap
    const r = Math.ceil(cap / CELL)
    const cx = cell(aw[i]), cy = cell(aw[i + 1]), cz = cell(aw[i + 2])
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
      const c = g.get(((cx + dx) * 1024 + cy + dy) * 1024 + cz + dz)
      if (!c) continue
      for (const j of c) {
        const d = (aw[i] - w[j]) ** 2 + (aw[i + 1] - w[j + 1]) ** 2 + (aw[i + 2] - w[j + 2]) ** 2
        if (d < best) best = d
      }
    }
    return Math.sqrt(best)
  }
  /** nearest distance (capped) between two parts' sampled vertices */
  const near = (a: Part, b: Part, cap: number): number => {
    let best = cap
    for (let i = 0; i < a.world.length; i += 3) best = Math.min(best, nearPoint(a, i, b, best))
    return best
  }

  const pose = (step: number): void => {
    aim.position.set(state.pos.x, 3, state.pos.z)
    aim.lookAt(state.pos.x + Math.sin(state.yaw), 3, state.pos.z + Math.cos(state.yaw))
    aim.updateMatrixWorld()
    fight.update(step, state, aim)
    const g = player.gait.update(step, state.speed, state.yawRate, false, true, null)
    if (fight.poseWeight > 0) g.air = (g.air ?? 0) + (fight.air - (g.air ?? 0)) * fight.poseWeight
    model.root.position.copy(state.pos)
    model.root.rotation.set(0, state.yaw, 0)
    model.pose(1, g)
    player.combat.effects.afterPose()
  }

  // settle into the stand, then find which parts touch across bones
  for (let k = 0; k < 60; k++) pose(DT)
  for (const p of parts) place(p)
  /** a contact: the two parts and the vertex patches (indices into world) that touch at the stand */
  const contacts: Array<{ a: Part; b: Part; rest: number; pa: number[]; pb: number[] }> = []
  /** the vertices of a within d of b's (indices, at most 64, spread) */
  const patch = (a: Part, b: Part, d: number): number[] => {
    const out: number[] = []
    for (let i = 0; i < a.world.length; i += 3) if (nearPoint(a, i, b, d) < d) out.push(i)
    const step = Math.max(1, Math.floor(out.length / 64))
    return out.filter((_, k) => k % step === 0)
  }
  /** nearest distance between two patches */
  const between = (a: Part, pa: number[], b: Part, pb: number[]): number => {
    let best = Infinity
    for (const i of pa) for (const j of pb) {
      const d = (a.world[i] - b.world[j]) ** 2 + (a.world[i + 1] - b.world[j + 1]) ** 2 + (a.world[i + 2] - b.world[j + 2]) ** 2
      if (d < best) best = d
    }
    return Math.sqrt(best)
  }
  const boxes = parts.map((p) => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < p.world.length; i += 3) for (let j = 0; j < 3; j++) { lo[j] = Math.min(lo[j], p.world[i + j]); hi[j] = Math.max(hi[j], p.world[i + j]) }
    return [lo, hi]
  })
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    if (parts[i].bone === parts[j].bone) continue
    const [la, ha] = boxes[i], [lb, hb] = boxes[j]
    if ([0, 1, 2].some((k) => la[k] > hb[k] + TOUCH || lb[k] > ha[k] + TOUCH)) continue
    const d = near(parts[i], parts[j], TOUCH)
    if (d < TOUCH) {
      const pa = patch(parts[i], parts[j], TOUCH * 1.5), pb = patch(parts[j], parts[i], TOUCH * 1.5)
      contacts.push({ a: parts[i], b: parts[j], rest: between(parts[i], pa, parts[j], pb), pa, pb })
    }
  }
  console.log(`${parts.length} parts, ${contacts.length} contacts across bones at the stand`)
  // hosts: a part touching nothing carried by its own bone but resting on another's is carried by the wrong bone
  for (const p of parts) {
    const own = parts.filter((o) => o !== p && o.bone === p.bone)
    const ownNear = own.length ? Math.min(...own.map((o) => near(p, o, 0.3))) : Infinity
    const across = contacts.filter((c) => c.a === p || c.b === p).map((c) => (c.a === p ? c.b : c.a))
    if (ownNear > TOUCH && across.length) {
      const bones = [...new Set(across.map((o) => o.bone))]
      console.log(`host ${p.name} on ${p.bone}: nearest own-bone part ${ownNear.toFixed(3)} m; rests on ${bones.join(', ')} (${across.map((o) => o.name).join(', ')})`)
    }
  }
  if (process.env.AUDIT_HOSTS === '1') return
  // joints: each bone's parts against its parent bone's, their nearest approach at the stand and how far it opens in the fight
  const parentBone = (b: string): string => {
    const i = byName.get(b)
    for (let p = i === undefined ? -1 : records[i].parent; p >= 0; p = records[p].parent) if (records[p].kind === 'bone') return records[p].name
    return '-'
  }
  const groups = new Map<string, Part[]>()
  for (const p of parts) (groups.get(p.bone) ?? groups.set(p.bone, []).get(p.bone)!).push(p)
  const joints = [...groups.keys()].filter((b) => groups.has(parentBone(b)) && !/index|middle|ring|pinky|thumb/.test(b))
  /** the nearest approach of a bone's parts to its parent's, searched to `cap` (m) */
  const jointGap = (b: string, cap: number): number => {
    let best = cap
    for (const a of groups.get(b)!) for (const c of groups.get(parentBone(b))!) best = Math.min(best, near(a, c, best))
    return best
  }
  const jointRest = new Map(joints.map((b) => [b, jointGap(b, 0.5)]))
  const jointMax = new Map(joints.map((b) => [b, [0, ''] as [number, string]]))
  if (TRACE) contacts.length = 0

  // the bones watched for snaps, and the blade
  const watched = [`upperarm.${main}`, `forearm.${main}`, `hand.${main}`, 'chest', 'head'].map((b) => ({ name: b, object: node(`bone:${b}`), last: new Quaternion(), steps: [] as number[] }))
  const blade = { last: new Vector3(), steps: [] as number[], tip: [] as number[], grip: new Vector3() }
  const times: string[] = []
  const twists: number[] = []
  const qa = new Quaternion(), qb = new Quaternion()
  const restTwist = new Quaternion()
  const handAxis = new Vector3()
  {
    node(`bone:forearm.${main}`).getWorldQuaternion(qa)
    node(`bone:hand.${main}`).getWorldQuaternion(qb)
    restTwist.copy(qa).invert().multiply(qb)
    handAxis.subVectors(node(`bone:middle1.${main}`).getWorldPosition(new Vector3()), node(`bone:hand.${main}`).getWorldPosition(new Vector3())).applyQuaternion(qb.clone().invert()).normalize()
  }

  /** the blade's direction in the heading frame (x its left, y ahead, z up) */
  const bladeHeading = (): string => {
    const d = blade.last, yaw = state.yaw
    return [d.x * Math.cos(yaw) - d.z * Math.sin(yaw), d.x * Math.sin(yaw) + d.z * Math.cos(yaw), d.y].map((x) => x.toFixed(2)).join(' ')
  }
  /** the blade the arm would hold with the hand unturned on its forearm (the held blade turned back about the forearm by the hand's turn) */
  const natural = (turn: number): string => {
    const f = node(`bone:hand.${main}`).getWorldPosition(_s0).sub(node(`bone:forearm.${main}`).getWorldPosition(_s1)).normalize()
    const d = _s2.copy(blade.last).applyAxisAngle(f, -turn * Math.PI / 180), yaw = state.yaw
    return [d.x * Math.cos(yaw) - d.z * Math.sin(yaw), d.x * Math.sin(yaw) + d.z * Math.cos(yaw), d.y].map((x) => x.toFixed(2)).join(' ')
  }
  const foreHeading = (): string => {
    const f = node(`bone:hand.${main}`).getWorldPosition(_s0).sub(node(`bone:forearm.${main}`).getWorldPosition(_s1)).normalize(), yaw = state.yaw
    return [f.x * Math.cos(yaw) - f.z * Math.sin(yaw), f.x * Math.sin(yaw) + f.z * Math.cos(yaw), f.y].map((x) => x.toFixed(2)).join(' ')
  }
  const gaps = new Map<string, { t0: string; t1: string; max: number; at: string; last: number }>()
  const spans: string[] = []
  let frameNo = 0
  const q = [...clicks]
  for (let t = 0; t <= until; t += DT, frameNo++) {
    while (q.length && q[0] <= t) { q.shift(); fight.press() }
    while (specials.length && specials[0] <= t) { specials.shift(); fight.startSpecial(state, aim) }
    while (guards.length && guards[0] <= t) { guards.shift(); fight.setGuard(true) }
    pose(DT * fight.tempo)
    times.push(moveAt())
    const strain = model.braces?.strain ?? 0
    if (strain > 0.005) console.log(`brace ${moveAt()} ${model.braces!.strained} held ${strain.toFixed(3)} m off its stroke`)
    for (const w of watched) {
      w.object.getWorldQuaternion(qa)
      w.steps.push(frameNo ? 2 * Math.acos(Math.min(1, Math.abs(qa.dot(w.last)))) * 180 / Math.PI : 0)
      w.last.copy(qa)
    }
    if (weapon) {
      weapon.getWorldQuaternion(qa)
      v.set(0, 0, 1).applyQuaternion(qa)
      blade.steps.push(frameNo ? v.angleTo(blade.last) * 180 / Math.PI : 0)
      blade.last.copy(v)
      // the grip's travel in the frame (cm), the whole body's root motion taken out
      const g = weapon.getWorldPosition(_s3).sub(model.root.position)
      blade.tip.push(frameNo ? g.distanceTo(blade.grip) * 100 : 0)
      blade.grip.copy(g)
    }
    node(`bone:forearm.${main}`).getWorldQuaternion(qa)
    node(`bone:hand.${main}`).getWorldQuaternion(qb)
    const rel = qa.invert().multiply(qb).premultiply(qb.copy(restTwist).invert())
    let turn = 2 * Math.atan2(rel.x * handAxis.x + rel.y * handAxis.y + rel.z * handAxis.z, rel.w) * 180 / Math.PI
    if (turn > 180) turn -= 360
    if (turn < -180) turn += 360
    twists.push(turn)
    for (const at of PLACE) if (frame.move >= 0 && Math.abs(frame.time - at) < DT * fight.tempo * 0.5 + 1e-6) {
      const o = player.combat.overlay as unknown as { weapon: Matrix4; restPelvis: Vector3 }
      const e = o.weapon.elements
      const p = new Vector3().setFromMatrixPosition(o.weapon).sub(o.restPelvis)
      const f = (x: number, y: number, z: number): string => `[${x.toFixed(3)}, ${(-y).toFixed(3)}, ${z.toFixed(3)}]`
      console.log(`place ${moveAt()} grip ${f(p.x, p.y, p.z)} blade ${f(e[8], e[9], e[10])} edge ${f(e[0], e[1], e[2])}`)
    }
    if (TRACE && (WALL ? t >= TRACE[0] && t <= TRACE[1] : frame.move >= 0 && frame.time >= TRACE[0] && frame.time <= TRACE[1])) {
      const o = player.combat.overlay as unknown as { naturalRoll: Record<string, number>; pivot: Quaternion }
      const step = (k: number): string => watched[k].steps[watched[k].steps.length - 1].toFixed(1).padStart(5)
      // the elbow's side off the shoulder-fist line in the robot's heading frame (x its left, y ahead, z up), and its bend
      const S = node(`bone:upperarm.${main}`).getWorldPosition(_s0), E = node(`bone:forearm.${main}`).getWorldPosition(_s1), W = node(`bone:hand.${main}`).getWorldPosition(_s2)
      const line = _s3.subVectors(W, S).normalize()
      const off = E.sub(S); off.addScaledVector(line, -off.dot(line)).normalize()
      const yaw = state.yaw
      const ex = off.x * Math.cos(yaw) - off.z * Math.sin(yaw), ey = off.x * Math.sin(yaw) + off.z * Math.cos(yaw), ez = off.y
      const bend = 180 - node(`bone:forearm.${main}`).getWorldPosition(_s4).sub(S).angleTo(_s5.subVectors(W, node(`bone:forearm.${main}`).getWorldPosition(_s6))) * 180 / Math.PI
      console.log(`trace ${moveAt()} elbow [${ex.toFixed(2)} ${ey.toFixed(2)} ${ez.toFixed(2)}] bend ${bend.toFixed(0).padStart(4)} tempo ${fight.tempo.toFixed(2)} upper ${step(0)} fore ${step(1)} hand ${step(2)} blade ${blade.steps[blade.steps.length - 1].toFixed(1).padStart(5)} twist ${turn.toFixed(0).padStart(4)} roll ${o.naturalRoll[main].toFixed(1)} held [${bladeHeading()}] nat [${natural(turn)}] fore [${foreHeading()}] pivot ${(2 * Math.acos(Math.min(1, Math.abs(o.pivot.w))) * 180 / Math.PI).toFixed(0)}`)
    }

    // contacts and joints, every other frame
    if (frameNo % 2) continue
    if (frame.move >= 0 && process.env.AUDIT_JOINTS === '1' && frameNo % 6 === 0) {
      for (const p of parts) { place(p); grids.delete(p) }
      for (const b of joints) {
        const open = jointGap(b, jointRest.get(b)! + 0.12) - jointRest.get(b)!
        if (open > jointMax.get(b)![0]) jointMax.set(b, [open, moveAt()])
      }
    }
    const placed = new Set<Part>()
    for (const c of contacts) {
      for (const p of [c.a, c.b]) if (!placed.has(p)) { place(p); grids.delete(p); placed.add(p) }
      // the stand's touching patches parted: still touching anywhere else (a slide) is not a gap
      let d = between(c.a, c.pa, c.b, c.pb)
      if (d - c.rest > GAP && near(c.a, c.b, GAP + c.rest) < GAP + c.rest) d = 0
      const key = `${c.a.name} (${c.a.bone}) | ${c.b.name} (${c.b.bone})`
      const s = gaps.get(key)
      if (d - c.rest > GAP) {
        if (s && frameNo - s.last <= 2) { s.t1 = moveAt(); s.last = frameNo; if (d > s.max) { s.max = d; s.at = moveAt() } }
        else {
          if (s) spans.push(`gap ${s.t0} .. ${s.t1} max ${s.max.toFixed(2)} m at ${s.at}: ${key}`)
          gaps.set(key, { t0: moveAt(), t1: moveAt(), max: d, at: moveAt(), last: frameNo })
        }
      }
    }
  }
  for (const [b, [open, at]] of jointMax) if (open > 0.03) console.log(`joint ${b} (on ${parentBone(b)}) opens ${open.toFixed(2)} m at ${at} (stand ${jointRest.get(b)!.toFixed(3)})`)
  for (const [key, s] of gaps) spans.push(`gap ${s.t0} .. ${s.t1} max ${s.max.toFixed(2)} m at ${s.at}: ${key}`)
  spans.sort()
  for (const s of spans) console.log(s)

  // snaps: a frame turning far more than both its neighbours (the second either side, so a two-frame snap counts too)
  const snaps = (label: string, steps: number[]): void => {
    for (let i = 2; i < steps.length - 2; i++) {
      const s = steps[i]
      const around = Math.max(steps[i - 2], steps[i + 2], 0.5)
      if (s > SNAP_MIN && s > SNAP_RATIO * around && s >= steps[i - 1] && s >= steps[i + 1]) {
        console.log(`snap ${times[i]} ${label} ${s.toFixed(1)} deg in a frame (around ${steps[i - 2].toFixed(1)} / ${steps[i + 2].toFixed(1)})`)
      }
    }
  }
  for (const w of watched) snaps(w.name, w.steps)
  snaps('blade', blade.steps)
  snaps('grip cm', blade.tip)
  let span: [string, string, number] | null = null
  for (let i = 0; i < twists.length; i++) {
    const over = Math.abs(twists[i]) > TWIST
    if (over) span = span ? [span[0], times[i], Math.max(span[2], Math.abs(twists[i]))] : [times[i], times[i], Math.abs(twists[i])]
    else if (span) { console.log(`twist ${span[0]} .. ${span[1]} max ${span[2].toFixed(0)} deg`); span = null }
  }
  if (span) console.log(`twist ${span[0]} .. ${span[1]} max ${span[2].toFixed(0)} deg`)
}
