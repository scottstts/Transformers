import { mirrorCitadel, readMirror } from '../mirror.ts'
import { PerspectiveCamera, Scene, type InstancedBufferAttribute, type Mesh } from 'three/webgpu'
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
 * The Impala special's lightning as numbers: at each sample, how many bolt
 * segments are alive, how far they reach from the robot and how high, and
 * whether the mesh is drawn. A discharge that never shows reads as 0 alive.
 */
export async function probeLightning(until: number, every: number): Promise<void> {
  const entry = rosterEntry('impala')
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
  const effects = player.combat.effects as unknown as { lightning: { mesh: Mesh; clock: number } }
  const bolts = effects.lightning
  const geometry = bolts.mesh.geometry
  void geometry
  const material = bolts.mesh.material as unknown as { positionNode: unknown }
  void material
  const attrs = (bolts as unknown as { a0: InstancedBufferAttribute; a1: InstancedBufferAttribute }).a0
  const ends = (bolts as unknown as { a1: InstancedBufferAttribute }).a1
  const DT = 1 / 60
  let next = 0
  let started = false
  for (let t = -0.5; t <= until; t += DT) {
    if (!started && t >= 0) { started = true; fight.startSpecial(state, aim) }
    aim.position.set(state.pos.x, 3, state.pos.z)
    aim.updateMatrixWorld()
    fight.update(DT, state, aim)
    const pose = player.gait.update(DT, state.speed, state.yawRate, false, true, null)
    player.model.root.position.copy(state.pos)
    player.model.root.rotation.set(0, state.yaw, 0)
    player.model.pose(1, pose)
    player.combat.effects.afterPose()
    if (t >= next - 1e-6 && t >= 0) {
      next += every
      const clock = bolts.clock
      const a = attrs.array as Float32Array, b = ends.array as Float32Array
      let alive = 0, far = 0, high = 0
      for (let i = 0; i < a.length / 4; i++) {
        const age = clock - a[i * 4 + 3]
        if (age < 0 || age >= b[i * 4 + 3]) continue
        alive++
        const dx = a[i * 4] - state.pos.x, dz = a[i * 4 + 2] - state.pos.z
        far = Math.max(far, Math.hypot(dx, dz))
        high = Math.max(high, a[i * 4 + 1] - state.pos.y)
      }
      console.log(`pos ${state.pos.x.toFixed(1)},${state.pos.y.toFixed(1)},${state.pos.z.toFixed(1)} t ${t.toFixed(2)} clock ${clock.toFixed(2)} visible ${bolts.mesh.visible} alive ${alive} far ${far.toFixed(1)} high ${high.toFixed(1)} parent ${bolts.mesh.parent?.type}`)
    }
  }
}
