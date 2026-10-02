import { mirrorCitadel, readMirror } from '../mirror.ts'
import { Box3, Matrix4, PerspectiveCamera, Scene, Vector3, type Mesh } from 'three/webgpu'
import { createDesertWorld } from '../../src/worlds/desert'
import { rosterEntry } from '../../src/content/roster'
import { decodeTransformerAsset } from '../../src/content/transformer/asset/loader'
import { decodeWeaponAsset, type WeaponManifest } from '../../src/content/transformer/asset/weapon'
import type { TransformerManifest } from '../../src/content/transformer/asset/format'
import { AudioMix } from '../../src/audio/mix'
import { createMotionState } from '../../src/game/types'
import { RobotCombat } from '../../src/game/combat/robot-combat'
import { CameraFx } from '../../src/game/combat/camera-fx'
import { CH, type Channel } from '../../src/content/transformer/combat/pose'
import { surfaces } from '../../tests/support/clash'

/**
 * Prints the fight's pose numbers over time (robot frame: x left, y up, z
 * forward of its standing point). A click token `F<t>` plays the special at t.
 * PROBE_CORES=1 instead reports every frame where a wrist or the weapon's haft
 * or edge is inside the chest, pelvis or head core the combat tests check,
 * with the point in that bone's frame and the core's bounds.
 * PROBE_PARTS=<regex> also prints, at each sample, the posed bounds of every
 * body node whose name matches (robot frame, relative to the pelvis).
 * PROBE_CH=<channel,...> appends those pose channels' values to each sample.
 * PROBE_PROFILE=<x> prints the body's top outline (arms excepted) in the
 * fore-aft plane at that lateral offset: its highest surface in 0.2 m steps
 * forward of the pelvis, which a raised weapon or hand must clear.
 */
export async function probeFight(car: string, tokens: string[], until: number, every: number): Promise<void> {
  const clicks = tokens.filter((c) => !c.startsWith('F')).map(Number)
  const specials = tokens.filter((c) => c.startsWith('F')).map((c) => Number(c.slice(1)))
  const entry = rosterEntry(car)
  const read = (name: string): [unknown, ArrayBuffer] => {
    const bin = readMirror(`${name}.bin`)
    return [JSON.parse(readMirror(`${name}.json`, 'utf8')), bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)]
  }
  const [manifest, bin] = read(entry.id)
  const asset = decodeTransformerAsset(manifest as TransformerManifest, bin, entry.label)
  const [wm, wb] = read(entry.weapon)
  asset.weapon = decodeWeaponAsset(wm as WeaponManifest, wb, entry.label)
  const scene = new Scene()
  const world = createDesertWorld(scene, await mirrorCitadel())
  const player = entry.create(asset, world.contactEffects, new AudioMix())
  const state = createMotionState()
  state.mode = 'robot'; state.target = 1; state.progress = 1; state.yaw = 0
  state.pos.y = world.world.ground.height(state.pos.x, state.pos.z + player.robotOffset)
  const fight = new RobotCombat(player.combat, player.model, player.robotOffset, state, new CameraFx())
  const aim = new PerspectiveCamera()
  // PROBE_DT=<s> steps the fight finer (the combat tests run at 1/120)
  const DT = Number(process.env.PROBE_DT ?? 1 / 60)
  const q = [...clicks]
  const weapon = player.model.node('bone:hand.R').children.find((c) => c.name.startsWith('weapon:'))
  const edge = asset.weapon.manifest.edge
  const tip = (k: 0 | 1): string => {
    if (!weapon?.visible) return '-'
    return relPoint(new Vector3(...edge[k]).applyMatrix4(weapon.matrixWorld))
  }
  const relPoint = (p: Vector3): string => {
    const px = state.pos.x + Math.sin(state.yaw) * player.robotOffset, pz = state.pos.z + Math.cos(state.yaw) * player.robotOffset
    const dx = p.x - px, dz = p.z - pz
    const f = dx * Math.sin(state.yaw) + dz * Math.cos(state.yaw)
    const l = dx * Math.cos(state.yaw) - dz * Math.sin(state.yaw)
    return `${l.toFixed(2)},${p.y.toFixed(2)},${f.toFixed(2)}`
  }
  // the weapon's head end and its off grip (where a second hand holds it)
  const along = (z: number): string => weapon?.visible ? relPoint(new Vector3(0, 0, z).applyMatrix4(weapon.matrixWorld)) : '-'
  const offGrip = asset.weapon.manifest.grips.off
  // how far the off hand's grip centre sits from the weapon's off grip (m): a two-handed hold that falls short
  const g = player.combat.overlay.build.grip
  // which way the cutting edge faces (weapon +x, robot frame: left, up, forward)
  const blade = (): string => {
    if (!weapon?.visible) return '-'
    const d = new Vector3(1, 0, 0).transformDirection(weapon.matrixWorld)
    const l = d.x * Math.cos(state.yaw) - d.z * Math.sin(state.yaw), f = d.x * Math.sin(state.yaw) + d.z * Math.cos(state.yaw)
    return `${l.toFixed(2)},${d.y.toFixed(2)},${f.toFixed(2)}`
  }
  const offGap = (): string => {
    if (!weapon?.visible) return '-'
    const hand = new Vector3(-g[0], g[1], g[2]).applyMatrix4(player.model.node('bone:hand.L').matrixWorld)
    return hand.distanceTo(new Vector3(...offGrip).applyMatrix4(weapon.matrixWorld)).toFixed(2)
  }
  const rel = (name: string): string => relPoint(new Vector3().setFromMatrixPosition(player.model.node(name).matrixWorld))
  const cores = (['chest', 'pelvis', 'head'] as const).map((b) => {
    const box = new Box3()
    for (const child of player.model.node(`bone:${b}`).children) {
      const g = (child as Mesh).geometry
      if (!g) continue
      g.computeBoundingBox()
      box.union(g.boundingBox!)
    }
    return { name: b, box: box.expandByVector(box.getSize(new Vector3()).multiplyScalar(-(b === 'head' ? 0.1 : 0.15) / 2)) }
  })
  const inv = new Matrix4()
  const checkCores = (t: number): void => {
    const points: Array<[string, Vector3]> = [['hand.R', new Vector3().setFromMatrixPosition(player.model.node('bone:hand.R').matrixWorld)], ['hand.L', new Vector3().setFromMatrixPosition(player.model.node('bone:hand.L').matrixWorld)]]
    if (weapon?.visible) {
      for (let z = asset.weapon!.manifest.extent[0]; z <= asset.weapon!.manifest.extent[1]; z += 0.2) points.push([`haft ${z.toFixed(1)}`, new Vector3(0, 0, z).applyMatrix4(weapon.matrixWorld)])
    }
    for (const { name, box } of cores) {
      inv.copy(player.model.node(`bone:${name}`).matrixWorld).invert()
      for (const [what, w] of points) {
        const l = w.clone().applyMatrix4(inv)
        if (box.containsPoint(l)) console.log(`t ${t.toFixed(2)} ${what} in ${name} at ${l.toArray().map((x) => x.toFixed(2))} core ${box.min.toArray().map((x) => x.toFixed(2))} .. ${box.max.toArray().map((x) => x.toFixed(2))}`)
      }
    }
  }
  const probeCores = process.env.PROBE_CORES === '1'
  const channels = (process.env.PROBE_CH ?? '').split(',').filter(Boolean) as Channel[]
  const channelValues = (): string => channels.map((c) => ` ${c} ${player.combat.overlay.pose.v[CH[c]].toFixed(3)}`).join('')
  const partMatch = process.env.PROBE_PARTS ? new RegExp(process.env.PROBE_PARTS) : null
  const parts = partMatch ? surfaces(player.model.root.children[0].children).filter((b) => partMatch.test(b.name)) : []
  const profileX = process.env.PROBE_PROFILE === undefined ? null : Number(process.env.PROBE_PROFILE)
  const body = profileX === null ? [] : surfaces(player.model.root.children[0].children).filter((b) => !/(clav|upperarm|forearm|hand|index|middle|ring|pinky|thumb)\d?\.[RL]$/.test(b.name))
  const profile = (): void => {
    const pelvis = new Vector3().setFromMatrixPosition(player.model.node('bone:pelvis').matrixWorld)
    const top = new Map<number, [number, string]>()
    const a = new Vector3(), b = new Vector3(), c = new Vector3()
    const yawX = Math.cos(state.yaw), yawZ = -Math.sin(state.yaw)
    const side = (p: Vector3): number => (p.x - pelvis.x) * yawX + (p.z - pelvis.z) * yawZ - profileX!
    const fwd = (p: Vector3): number => (p.x - pelvis.x) * Math.sin(state.yaw) + (p.z - pelvis.z) * Math.cos(state.yaw)
    for (const part of body) {
      const W = part.object.matrixWorld
      for (let k = 0; k < part.tris.length; k += 9) {
        a.fromArray(part.tris, k).applyMatrix4(W); b.fromArray(part.tris, k + 3).applyMatrix4(W); c.fromArray(part.tris, k + 6).applyMatrix4(W)
        const pts = [a, b, c]
        for (let e = 0; e < 3; e++) {
          const p = pts[e], q = pts[(e + 1) % 3]
          const sp = side(p), sq = side(q)
          if (sp * sq > 0 || sp === sq) continue
          const u = sp / (sp - sq)
          const y = p.y + (q.y - p.y) * u - pelvis.y
          const bin = Math.round((fwd(p) + (fwd(q) - fwd(p)) * u) / 0.2)
          const was = top.get(bin)
          if (!was || y > was[0]) top.set(bin, [y, part.name])
        }
      }
    }
    for (const bin of [...top.keys()].sort((x, y) => x - y)) console.log(`    z ${(bin * 0.2).toFixed(1)} top ${top.get(bin)![0].toFixed(2)} ${top.get(bin)![1]}`)
  }
  const partBounds = (): void => {
    const pelvis = new Vector3().setFromMatrixPosition(player.model.node('bone:pelvis').matrixWorld)
    const box = new Box3()
    for (const part of parts) {
      box.copy(part.box).applyMatrix4(part.object.matrixWorld)
      const lo = box.min.sub(pelvis), hi = box.max.sub(pelvis)
      console.log(`    ${part.name} x ${lo.x.toFixed(2)}..${hi.x.toFixed(2)} y ${lo.y.toFixed(2)}..${hi.y.toFixed(2)} z ${lo.z.toFixed(2)}..${hi.z.toFixed(2)}`)
    }
  }
  let next = 0
  for (let t = -1; t <= until; t += DT) {
    while (q.length && q[0] <= t) { q.shift(); fight.press() }
    while (specials.length && specials[0] <= t) { specials.shift(); fight.startSpecial(state, aim) }
    aim.position.set(state.pos.x, 3, state.pos.z)
    aim.lookAt(state.pos.x + Math.sin(state.yaw), 3, state.pos.z + Math.cos(state.yaw))
    aim.updateMatrixWorld()
    fight.update(DT, state, aim)
    const pose = player.gait.update(DT, state.speed, state.yawRate, false, true, null)
    if (fight.poseWeight > 0) pose.air = (pose.air ?? 0) + (fight.air - (pose.air ?? 0)) * fight.poseWeight
    player.model.root.position.copy(state.pos)
    player.model.root.rotation.set(0, state.yaw, 0)
    player.model.pose(1, pose)
    if (probeCores) {
      if (t >= 0) checkCores(t)
    } else if (t >= next - 1e-6 && t >= 0) {
      next += every
      console.log(`t ${t.toFixed(2)} w ${fight.poseWeight.toFixed(2)} air ${fight.air.toFixed(2)} yaw ${(state.yaw * 57.3).toFixed(1)} pel ${rel('bone:pelvis')} sR ${rel('bone:upperarm.R')} sL ${rel('bone:upperarm.L')} eR ${rel('bone:forearm.R')} eL ${rel('bone:forearm.L')} hR ${rel('bone:hand.R')} mR ${rel('bone:middle1.R')} hL ${rel('bone:hand.L')} fR ${rel('bone:foot.R')} fL ${rel('bone:foot.L')} kR ${rel('bone:shin.R')} kL ${rel('bone:shin.L')} lift ${player.model.lift.toFixed(2)} edge ${tip(0)} ${tip(1)} head ${rel('bone:head')} wHead ${along(asset.weapon!.manifest.extent[1])} off ${weapon?.visible ? relPoint(new Vector3(...offGrip).applyMatrix4(weapon.matrixWorld)) : '-'} gapL ${offGap()} blade ${blade()}${channelValues()}`)
      if (parts.length) partBounds()
      if (profileX !== null) profile()
    }
  }
}
