import { PerspectiveCamera, Vector3 } from 'three/webgpu'
import { AudioMix } from '../../src/audio/mix'
import { createRoadster } from '../../src/content/roadster'
import { createMotionState } from '../../src/game/types'
import { RobotCombat } from '../../src/game/combat/robot-combat'
import { CameraFx } from '../../src/game/combat/camera-fx'
import type { CombatMove } from '../../src/content/transformer/combat/moves'
import type { Channel } from '../../src/content/transformer/combat/pose'
import { NO_CONTACT, readAsset } from '../../tests/support/assets'

/**
 * Where a held pose puts the Roadster's palms (scratch for authoring its
 * palm cannons): channels given as JSON, held from 0.3 s; prints each hand's
 * palm normal, finger direction and centre in the robot's frame (x left, y up, z forward).
 */
export function palmProbe(channels: Partial<Record<Channel, number>>): void {
  const c = createRoadster({ ...readAsset('roadster'), weapon: null }, NO_CONTACT, new AudioMix())
  const keys: CombatMove['keys'] = {}
  for (const [k, v] of Object.entries(channels)) (keys as Record<string, [number, number][]>)[k] = [[0.3, v as number]]
  const move: CombatMove = { name: 'probe', duration: 1, chain: [1, 1], keys }
  ;(c.combat.moveset.moves as CombatMove[])[0] = move
  const state = createMotionState()
  state.mode = 'robot'; state.target = 1; state.progress = 1; state.yaw = 0
  const fight = new RobotCombat(c.combat, c.model, c.robotOffset, state, new CameraFx())
  const aim = new PerspectiveCamera()
  fight.press()
  for (let t = 0; t < 0.6; t += 1 / 60) {
    fight.update(1 / 60, state, aim)
    const pose = c.gait.update(1 / 60, 0, 0, false, true, null)
    c.model.root.position.copy(state.pos)
    c.model.root.rotation.set(0, state.yaw, 0)
    c.model.pose(1, pose)
  }
  for (const side of ['L', 'R'] as const) {
    const hand = c.model.node(`bone:hand.${side}`).matrixWorld
    const thumb = c.model.node(`bone:thumb1.${side}`)
    const tip = new Vector3().setFromMatrixPosition(c.model.node(`bone:middle3.${side}`).matrixWorld)
    const root = new Vector3().setFromMatrixPosition(hand)
    const finger = tip.clone().sub(root).normalize()
    // palm: the side the fingers curl to (they flex about the hand's Y: the left hand's toward its -X, the right's +X)
    const palm = new Vector3().setFromMatrixColumn(hand, 0).multiplyScalar(side === 'L' ? -1 : 1).normalize()
    void thumb
    const f = (v: Vector3): string => `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`
    console.log(`${side}: palm ${f(palm)} fingers ${f(finger)} at ${f(root)}`)
  }
}
