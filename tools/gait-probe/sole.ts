import { Matrix4, Vector3 } from 'three/webgpu'
import { probeRobot } from './robot.ts'
import type { GaitStyle } from '../../src/content/transformer/animation/gait.ts'
import type { Character } from '../../src/content/transformer/character.ts'
import { supportPoints } from '../../src/content/transformer/asset/loader.ts'
import { edgeDepth } from '../../src/content/transformer/animation/sole.ts'
import { readAsset, REST_GAIT } from '../../tests/support/assets.ts'

/**
 * A robot's sole in the ankle frame: its lowest point against the gait's foot pitch
 * (the levelling tilt added), from the full mesh and from the 26-point support set
 * the ground projection uses, beside the heel/toe edge model the gait rolls on.
 */

export function sole(name: string): void {
  const asset = readAsset(name)
  const robot: Character = probeRobot(name, asset)
  const style = (robot.gait as unknown as { style: GaitStyle }).style
  if (process.env.GAIT) Object.assign(style, JSON.parse(process.env.GAIT))
  robot.model.pose(1, REST_GAIT)
  const rig = robot.model.rig
  const ankle = rig.world[rig.index['foot.L']]
  const inv = new Matrix4().copy(ankle).invert()
  const all: Vector3[] = [], hull: Vector3[] = []
  const v = new Vector3()
  const feet = (robot.model as unknown as { footSupport: Array<{ node: number; side: string }> }).footSupport.filter((s) => s.side === 'L')
  for (const { node: i } of feet) {
    const W = new Matrix4().multiplyMatrices(inv, robot.model.world[i])
    for (const { geometry } of asset.meshes[i]) {
      const p = geometry.getAttribute('position')
      for (let k = 0; k < p.count; k++) all.push(v.fromBufferAttribute(p, k).applyMatrix4(W).clone())
    }
    for (const p of supportPoints(asset.meshes[i].map((m) => m.geometry))) hull.push(p.clone().applyMatrix4(W))
  }
  // ankle frame: +y is backward (forward is -y), z up; pitch + is toe down
  const { soleTilt = 0 } = style
  for (let deg = -30; deg <= 45; deg += 5) {
    const g = deg * Math.PI / 180, a = g + soleTilt * Math.PI / 180, c = Math.cos(a), s = Math.sin(a)
    const low = (pts: Vector3[]) => {
      let z = Infinity, y = 0
      for (const p of pts) {
        // rotate about the ankle's x axis; toe-down pitch lowers the front (-y)
        const zz = p.z * c + p.y * s
        if (zz < z) { z = zz; y = -(p.y * c - p.z * s) }
      }
      return [z, y]
    }
    const [zm, ym] = low(all), [zh, yh] = low(hull)
    // the gait's assumed contact: heel edge when toe up, toe edge when toe down
    const model = -edgeDepth(style, g)
    console.log(`pitch ${String(deg).padStart(4)}  mesh low ${zm.toFixed(3)} at fwd ${ym.toFixed(2)}   hull low ${zh.toFixed(3)} at ${yh.toFixed(2)}   gait assumes ${model.toFixed(3)}`)
  }
}
