import { AudioMix } from '../../src/audio/mix.ts'
import { rosterEntry } from '../../src/content/roster.ts'
import type { TransformerAsset } from '../../src/content/transformer/asset/loader.ts'
import type { Character } from '../../src/content/transformer/character.ts'
import { NO_CONTACT, readAsset, readWeapon } from '../../tests/support/assets.ts'

/** A roster robot by its id, built from the asset mirror (`asset`: an already decoded one) with no world under it. */
export function probeRobot(id: string, asset: TransformerAsset = readAsset(id)): Character {
  const entry = rosterEntry(id)
  if (entry.id !== id) throw new Error(`no robot ${id} in the roster`)
  return entry.create({ ...asset, weapon: readWeapon(entry.weapon) }, NO_CONTACT, new AudioMix())
}
