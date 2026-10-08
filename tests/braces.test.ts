import { describe, expect, it } from 'vitest'
import { Matrix4, Quaternion, Vector3 } from 'three/webgpu'
import { createImpala } from '../src/content/impala/index.ts'
import { Braces } from '../src/content/transformer/model/braces.ts'
import { AudioMix } from '../src/audio/mix.ts'
import { NO_CONTACT, readAsset, readWeapon } from './support/assets.ts'
import { runFight } from './support/fight.ts'

describe('telescopic braces on the live skeleton', () => {
  const impala = createImpala({ ...readAsset('impala'), weapon: readWeapon('impala-cutlass') }, NO_CONTACT, new AudioMix())
  const model = impala.model as unknown as { world: Matrix4[]; braces: Braces; pose: (T: number, g: null) => void; node: (n: string) => { name: string } }
  const names = (impala.model.root.children[0].children as Array<{ name: string }>).map((n) => n.name)

  it('lays every brace as the bake has it where nothing has turned: pins, stages and their turn', () => {
    model.pose(1, null)
    const baked = model.world.map((m) => m.clone())
    const solved = model.world.map((m) => m.clone())
    model.braces.solve(solved, 1)
    const p = new Vector3(), r = new Vector3(), q = new Quaternion(), s = new Quaternion(), scale = new Vector3()
    let worst = 0, turn = 0
    names.forEach((name, i) => {
      if (!name.startsWith('asm:link.')) return
      baked[i].decompose(p, q, scale)
      solved[i].decompose(r, s, scale)
      worst = Math.max(worst, p.distanceTo(r))
      turn = Math.max(turn, 2 * Math.acos(Math.min(1, Math.abs(q.dot(s)))) * 180 / Math.PI)
    })
    expect(worst).toBeLessThan(1e-3)
    expect(turn).toBeLessThan(0.5)
  })

  it('keeps every brace within its stroke through the special: no brace held short of the carriers it joins', () => {
    let strain = 0
    runFight(impala, [], 14, () => { strain = Math.max(strain, model.braces.strain) }, 1 / 60, [0])
    expect(strain).toBeLessThan(0.01)
  })
})
