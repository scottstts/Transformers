import { readFileSync } from 'node:fs'
import { decodeTransformerAsset, type TransformerAsset } from '../../src/content/transformer/asset/loader.ts'
import type { TransformerManifest } from '../../src/content/transformer/asset/format.ts'
import type { ContactEffects } from '../../src/game/contact-effects.ts'
import type { GaitPose } from '../../src/content/transformer/model/rig.ts'
import { decodeWeaponAsset, type WeaponAsset, type WeaponManifest } from '../../src/content/transformer/asset/weapon.ts'
import { decodeSoldierAsset, type SoldierAsset, type SoldierManifest } from '../../src/content/soldier/asset.ts'

/** An exported model from public/models, decoded as the game does. */
export function readAsset(name: string): TransformerAsset {
  const manifest = JSON.parse(readFileSync(`public/models/${name}.json`, 'utf8')) as TransformerManifest
  const binary = readFileSync(`public/models/${name}.bin`)
  return decodeTransformerAsset(manifest, binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength), name)
}

/** A surface that ignores every contact. */
export const NO_CONTACT: ContactEffects = {
  tyre: () => undefined,
  footprint: () => undefined,
  burst: () => undefined,
  blast: () => undefined,
  crater: () => undefined,
  furrow: () => 0,
  reignite: () => undefined,
  surge: () => undefined,
  eject: () => undefined,
  warm: () => undefined,
  update: () => undefined,
}

/** The gait's channels at rest: the pose the live rig hands over to at T = 1. */
export const REST_GAIT: GaitPose = {
  legs: { R: { step: 0, up: 0, pitch: 0 }, L: { step: 0, up: 0, pitch: 0 } },
  crouch: 0.1, sway: 0, arms: { R: 0, L: 0 }, elbow: { R: 0, L: 0 },
  lean: 0, roll: 0, twist: 0, breath: 0, headYaw: 0, headPitch: 0, curl: 0.45,
}

/** An exported combat weapon from public/models, decoded as the game does. */
export function readWeapon(name: string): WeaponAsset {
  const manifest = JSON.parse(readFileSync(`public/models/${name}.json`, 'utf8')) as WeaponManifest
  const binary = readFileSync(`public/models/${name}.bin`)
  return decodeWeaponAsset(manifest, binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength), name)
}

/** The enemy soldier from public/models, decoded as the game does. */
export function readSoldier(): SoldierAsset {
  const manifest = JSON.parse(readFileSync('public/models/soldier.json', 'utf8')) as SoldierManifest
  const binary = readFileSync('public/models/soldier.bin')
  return decodeSoldierAsset(manifest, binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength))
}
