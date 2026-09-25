import type { ContactEffects } from '../game/contact-effects'
import type { AudioMix } from '../audio/mix'
import type { PlayableTransformerAsset } from './transformer/asset/loader'
import type { Character } from './transformer/character'
import { CYBERTRUCK_LABEL, CYBERTRUCK_WEAPON, createCybertruck, loadCybertruckAsset } from './cybertruck'
import { F1_LABEL, F1_WEAPON, createF1, loadF1Asset } from './ferrari-f1'

/** A playable car: how to fetch its asset and build it, and how the vehicle menu presents it. */
export interface RosterEntry {
  id: string
  label: string
  /** accent colour under its name in the vehicle menu (CSS) */
  accent: string
  /** the robot's weapon asset (public/models/<weapon>.*), loaded with the car */
  weapon: string
  load(): Promise<PlayableTransformerAsset>
  create(asset: PlayableTransformerAsset, contactEffects: ContactEffects, mix: AudioMix): Character
}

export const ROSTER: readonly RosterEntry[] = [
  {
    id: 'cybertruck',
    label: CYBERTRUCK_LABEL,
    accent: '#b8bcc0',
    weapon: CYBERTRUCK_WEAPON,
    load: loadCybertruckAsset,
    create: createCybertruck,
  },
  {
    id: 'ferrari-f1',
    label: F1_LABEL,
    accent: '#c8102e',
    weapon: F1_WEAPON,
    load: loadF1Asset,
    create: createF1,
  },
]

export function rosterEntry(id: string | null): RosterEntry {
  return ROSTER.find((entry) => entry.id === id) ?? ROSTER[0]
}

const assets = new Map<string, Promise<PlayableTransformerAsset>>()

/** One download per car: concurrent requests share it, a failed one can be retried. */
export function loadRosterAsset(entry: RosterEntry): Promise<PlayableTransformerAsset> {
  let pending = assets.get(entry.id)
  if (!pending) {
    pending = entry.load()
    assets.set(entry.id, pending)
    pending.catch(() => assets.delete(entry.id))
  }
  return pending
}

const STORAGE_KEY = 'transformer.vehicle'

/** The last car the player chose (a per-browser convenience; storage may be unavailable). */
export function savedVehicle(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function saveVehicle(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // storage blocked: the choice simply isn't remembered
  }
}
