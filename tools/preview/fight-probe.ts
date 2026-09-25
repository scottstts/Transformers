import { readFileSync } from 'node:fs'
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

/**
 * Prints the fight's pose numbers over time (robot frame: x left, y up, z
 * forward of its standing point). A click token `F<t>` plays the special at t.
 * PROBE_CORES=1 instead reports every frame where a wrist or the weapon's haft
 * or edge is inside the chest, pelvis or head core the combat tests check,
 * with the point in that bone's frame and the core's bounds.
 */
export function probeFight(car: string, tokens: string[], until: number, every: number): void {
  const clicks = tokens.filter((c) => !c.startsWith('F')).map(Number)
  const specials = tokens.filter((c) => c.startsWith('F')).map((c) => Number(c.slice(1)))
  const entry = rosterEntry(car)
  const read = (name: string): [unknown, ArrayBuffer] => {
    const bin = readFileSync(`public/models/${name}.bin`)
    return [JSON.parse(readFileSync(`public/models/${name}.json`, 'utf8')), bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)]
  }
  const [manifest, bin] = read(entry.id)
  const asset = decodeTransformerAsset(manifest as TransformerManifest, bin, entry.label)
  const [wm, wb] = read(entry.weapon)
  asset.weapon = decodeWeaponAsset(wm as WeaponManifest, wb, entry.label)
  const scene = new Scene()
  const world = createDesertWorld(scene)
  const player = entry.create(asset, world.contactEffects, new AudioMix())
  const state = createMotionState()
  state.mode = 'robot'; state.target = 1; state.progress = 1; state.yaw = 0
  const fight = new RobotCombat(player.combat, player.model, player.robotOffset, state, new CameraFx())
  const aim = new PerspectiveCamera()
  const DT = 1 / 60
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
      console.log(`t ${t.toFixed(2)} w ${fight.poseWeight.toFixed(2)} air ${fight.air.toFixed(2)} yaw ${(state.yaw * 57.3).toFixed(1)} pel ${rel('bone:pelvis')} hR ${rel('bone:hand.R')} hL ${rel('bone:hand.L')} fR ${rel('bone:foot.R')} fL ${rel('bone:foot.L')} kR ${rel('bone:shin.R')} kL ${rel('bone:shin.L')} lift ${player.model.lift.toFixed(2)} edge ${tip(0)} ${tip(1)}`)
    }
  }
}
