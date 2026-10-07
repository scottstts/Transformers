import { mirrorCitadel, readMirror } from '../mirror.ts'
import { PerspectiveCamera, Scene, Vector3, type Object3D } from 'three/webgpu'
import { createDesertWorld } from '../../src/worlds/desert'
import { rosterEntry } from '../../src/content/roster'
import { decodeTransformerAsset } from '../../src/content/transformer/asset/loader'
import { decodeWeaponAsset, type WeaponManifest } from '../../src/content/transformer/asset/weapon'
import type { TransformerManifest } from '../../src/content/transformer/asset/format'
import { AudioMix } from '../../src/audio/mix'
import { createMotionState } from '../../src/game/types'
import { RobotCombat } from '../../src/game/combat/robot-combat'
import { CameraFx } from '../../src/game/combat/camera-fx'
import { crossings, surfaces, type Surface } from '../../tests/support/clash'

/**
 * Where the weapon's haft or an arm passes through the robot's own surface
 * during a fight: segments (the haft's axis, as far as it has formed; each
 * forearm and hand) tested against the triangles of every body node, not the
 * shrunken core boxes of the combat tests. Spans of consecutive frames are
 * merged: `t 0.30-0.46 haft -1.4..-0.9 x bone:thigh.R` is the haft between
 * 1.4 and 0.9 m behind the grip crossing the right thigh's surface. The weapon
 * wrist is reported where it bends more than WRIST_BEND off its forearm.
 */
/** A wrist bent further than this off its forearm's line reads as broken (deg). */
const WRIST_BEND = 70
/** CLASH_FRAMES=1 prints every frame on its own instead of merged spans. */
const FRAMES = process.env.CLASH_FRAMES === '1'

export async function probeClash(car: string, tokens: string[], until: number): Promise<void> {
  // `walk` or `run`: the gait alone at that pace, no fight
  const pace = tokens.find((c) => c === 'walk' || c === 'run')
  // `G`: the guard held throughout
  const guard = tokens.includes('G')
  const clicks = tokens.filter((c) => !/^[FE]/.test(c) && c !== pace && c !== 'G').map(Number)
  const specials = tokens.filter((c) => c.startsWith('F')).map((c) => Number(c.slice(1)))
  const flashes = tokens.filter((c) => c.startsWith('E')).map((c) => Number(c.slice(1)))
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
  const DT = 1 / 120
  const model = player.model
  const node = (name: string): Object3D => model.node(name)
  const weapon = node('bone:hand.R').children.find((c) => c.name.startsWith('weapon:'))
  const extent = asset.weapon.manifest.extent

  const has = (name: string): boolean => { try { node(name); return true } catch { return false } }
  // the leg chain as far as this robot has it (not every foot carries a toe bone)
  const chain = ['thigh', 'shin', 'foot', 'toe'].filter((b) => has(`bone:${b}.R`) && has(`bone:${b}.L`))
  const bodies = surfaces(model.root.children[0].children)
  const armOf = (side: 'R' | 'L'): RegExp => new RegExp(`(clav|upperarm|forearm|hand|index|middle|ring|pinky|thumb)\\d?\\.${side}|wheelArm\\.${side}|frontWheel\\.${side}|wheel:wheelF\\.${side}`)
  const hand = /(hand|index\d|middle\d|ring\d|pinky\d|thumb\d)\.R$/

  // spans are reported in move time (m<move> <time>, s<time> the special's) where a move is playing
  const frame = (fight as unknown as { frame: { move: number; time: number } }).frame
  const moveAt = (): string => frame.move < 0 ? '' : `${frame.move === player.combat.moveset.moves.length ? 's' : `m${frame.move + 1} `}${frame.time.toFixed(2)}`
  const spans = new Map<string, { t0: number; t1: number; lo: number; hi: number; m0: string; m1: string }>()
  const report = (key: string, t: number, at: number): void => {
    const s = spans.get(key)
    if (s && t - s.t1 < DT * 1.5 && !FRAMES) { s.t1 = t; s.m1 = moveAt(); s.lo = Math.min(s.lo, at); s.hi = Math.max(s.hi, at) } else {
      if (s) print(key, s)
      spans.set(key, { t0: t, t1: t, lo: at, hi: at, m0: moveAt(), m1: moveAt() })
    }
  }
  const print = (key: string, s: { t0: number; t1: number; lo: number; hi: number; m0: string; m1: string }): void => {
    const [what, into] = key.split('|')
    console.log(`t ${s.t0.toFixed(2)}-${s.t1.toFixed(2)} (${s.m0} .. ${s.m1}) ${what} ${s.lo.toFixed(2)}..${s.hi.toFixed(2)} x ${into}`)
  }
  const a = new Vector3(), b = new Vector3()
  const cross = (body: Surface, out: number[]): void => crossings(body, a, b, out)
  const hits: number[] = []
  const pos = (name: string, v: Vector3): Vector3 => v.setFromMatrixPosition(node(name).matrixWorld)
  const e0 = new Vector3(), e1 = new Vector3(), e2 = new Vector3(), e3 = new Vector3()

  fight.setGuard(guard)
  const q = [...clicks]
  for (let t = -1; t <= until; t += DT) {
    while (q.length && q[0] <= t) { q.shift(); fight.press() }
    while (specials.length && specials[0] <= t) { specials.shift(); fight.startSpecial(state, aim) }
    while (flashes.length && flashes[0] <= t) { flashes.shift(); fight.startFlash(state, aim) }
    aim.position.set(state.pos.x, 3, state.pos.z)
    aim.lookAt(state.pos.x + Math.sin(state.yaw), 3, state.pos.z + Math.cos(state.yaw))
    aim.updateMatrixWorld()
    const step = DT * fight.tempo
    fight.update(step, state, aim)
    const pose = pace
      ? player.gait.update(step, pace === 'run' ? player.profile.robot.runSpeed : player.profile.robot.walkSpeed, 0, pace === 'run', true, null)
      : player.gait.update(step, state.speed, state.yawRate, false, true, null)
    if (fight.poseWeight > 0) pose.air = (pose.air ?? 0) + (fight.air - (pose.air ?? 0)) * fight.poseWeight
    model.root.position.copy(state.pos)
    model.root.rotation.set(0, state.yaw, 0)
    model.pose(1, pose)
    player.combat.effects.afterPose()
    player.effects.update(step, state)
    if (t < 0) continue

    // the haft, as far as it has formed, in 0.1 m pieces so each crossing is placed along it
    const formed = player.combat.effects.weapon
    if (weapon?.visible && formed) {
      const reach = formed.presence * Math.max(-extent[0], extent[1])
      const z0 = Math.max(-reach, extent[0]), z1 = Math.min(reach, extent[1])
      for (let z = z0; z < z1; z += 0.1) {
        a.set(0, 0, z).applyMatrix4(weapon.matrixWorld)
        b.set(0, 0, Math.min(z + 0.1, z1)).applyMatrix4(weapon.matrixWorld)
        for (const body of bodies) {
          if (hand.test(body.name)) continue
          hits.length = 0
          cross(body, hits)
          if (hits.length) report(`haft|${body.name}`, t, z)
        }
      }
    }
    // the weapon wrist bent past WRIST_BEND off the forearm's line (deg)
    if (weapon?.visible) {
      pos('bone:forearm.R', e0)
      pos('bone:hand.R', e1)
      pos('bone:middle1.R', e2)
      const bend = e2.sub(e1).angleTo(e1.clone().sub(e0)) * 180 / Math.PI
      if (bend > WRIST_BEND) report('wrist.R bend|deg', t, bend)
    }
    // each leg's bones (thigh, shin, foot) against the other leg's parts
    for (const side of ['R', 'L'] as const) {
      const other = new RegExp(`(hip|thigh|shin|foot|toe)\\.${side === 'R' ? 'L' : 'R'}|(shinPlate|thighPlate|corner|cornerArm)\\.${side === 'R' ? 'L' : 'R'}|wheelR[io]\\.${side === 'R' ? 'L' : 'R'}`)
      for (let j = 0; j < chain.length - 1; j++) {
        pos(`bone:${chain[j]}.${side}`, a)
        pos(`bone:${chain[j + 1]}.${side}`, b)
        for (const body of bodies) {
          if (!other.test(body.name)) continue
          hits.length = 0
          cross(body, hits)
          if (hits.length) report(`${chain[j]}.${side}|${body.name}`, t, hits[0])
        }
      }
    }
    // each arm: the upper arm's lower half, the forearm and the hand, against everything but its own chain
    for (const side of ['R', 'L'] as const) {
      pos(`bone:upperarm.${side}`, e0)
      pos(`bone:forearm.${side}`, e1)
      pos(`bone:hand.${side}`, e2)
      pos(`bone:middle1.${side}`, e3)
      e0.lerp(e1, 0.5)
      const own = armOf(side)
      const parts: Array<[string, Vector3, Vector3]> = [[`upper.${side}`, e0, e1], [`fore.${side}`, e1, e2], [`hand.${side}`, e2, e3]]
      for (const [what, p0, p1] of parts) {
        a.copy(p0); b.copy(p1)
        for (const body of bodies) {
          if (own.test(body.name)) continue
          hits.length = 0
          cross(body, hits)
          if (hits.length) report(`${what}|${body.name}`, t, hits[0])
        }
      }
    }
  }
  for (const [key, s] of spans) print(key, s)
}
