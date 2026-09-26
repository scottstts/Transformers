import { Box3, PerspectiveCamera, Vector3, type Mesh } from 'three/webgpu'
import { createMotionState } from '../../src/game/types.ts'
import { RobotCombat } from '../../src/game/combat/robot-combat.ts'
import { CameraFx } from '../../src/game/combat/camera-fx.ts'
import type { Character } from '../../src/content/transformer/character.ts'
import type { MotionState } from '../../src/game/types.ts'

export const DT = 1 / 60

/**
 * A fight run headlessly in the session's order; `each` sees every frame.
 * `clicks` are attack presses and `specials` special presses (s). The
 * world's clock runs at the special's tempo, as the session's does.
 */
export function runFight(c: Character, clicks: number[], until: number, each: (t: number, combat: RobotCombat) => void, dt = DT, specials: number[] = [], control?: (t: number, combat: RobotCombat, state: MotionState) => void): RobotCombat {
  const state = createMotionState()
  state.mode = 'robot'
  state.target = 1
  state.progress = 1
  state.yaw = 0.3
  const combat = new RobotCombat(c.combat, c.model, c.robotOffset, state, new CameraFx())
  const aim = new PerspectiveCamera()
  const pending = [...clicks]
  const pendingSpecials = [...specials]
  for (let t = -0.5; t <= until; t += dt) {
    while (pending.length && pending[0] <= t) {
      pending.shift()
      combat.press()
    }
    aim.position.set(state.pos.x, 3, state.pos.z)
    aim.lookAt(state.pos.x + Math.sin(state.yaw), 3, state.pos.z + Math.cos(state.yaw))
    aim.updateMatrixWorld()
    while (pendingSpecials.length && pendingSpecials[0] <= t) {
      pendingSpecials.shift()
      combat.startSpecial(state, aim)
    }
    const step = dt * combat.tempo
    control?.(t, combat, state)
    combat.update(step, state, aim)
    const pose = c.gait.update(step, state.speed, state.yawRate, false, true, null)
    if (combat.poseWeight > 0) pose.air = (pose.air ?? 0) + (combat.air - (pose.air ?? 0)) * combat.poseWeight
    c.model.root.position.copy(state.pos)
    c.model.root.rotation.set(0, state.yaw, 0)
    c.model.pose(1, pose)
    c.effects.update(step, state)
    if (t >= 0) each(t, combat)
  }
  return combat
}

/** A node's own geometry bounds, shrunk toward their centre (a conservative solid to keep out of). */
export function bodyCore(c: Character, node: string, shrink: number): Box3 {
  const box = new Box3()
  for (const child of c.model.node(node).children) {
    const g = (child as Mesh).geometry
    if (!g) continue
    g.computeBoundingBox()
    box.union(g.boundingBox!)
  }
  const size = box.getSize(new Vector3()).multiplyScalar(shrink / 2)
  return box.expandByVector(size.negate())
}
