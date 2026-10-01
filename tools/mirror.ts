import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodeCitadel, type CitadelAsset } from '../src/worlds/desert/citadel/asset.ts'
import type { CitadelPlanData } from '../src/worlds/desert/citadel/plan.ts'

/**
 * The local mirror of the asset CDN (assets/, filled by `node tools/assets.mjs
 * pull`, written by the Blender exports): what tests and tools read in place
 * of the game's downloads.
 */
export const MIRROR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')

/** A mirror file's bytes as an ArrayBuffer of its own. */
export function mirrorBytes(file: string): ArrayBuffer {
  const path = join(MIRROR, file)
  if (!existsSync(path)) throw new Error(`${file} is not in the asset mirror: run node tools/assets.mjs pull`)
  const bytes = readFileSync(path)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

export function mirrorJson<T>(file: string): T {
  return JSON.parse(new TextDecoder().decode(mirrorBytes(file))) as T
}

/** A model's manifest (`<name>.json`) and buffers (`<name>.bin`) from the mirror. */
export function mirrorModel<T>(name: string): { manifest: T; buffer: ArrayBuffer } {
  return { manifest: mirrorJson<T>(`${name}.json`), buffer: mirrorBytes(`${name}.bin`) }
}

/** A mirror file as `readFileSync` gives it: its Buffer, or its text. */
export function readMirror(file: string): Buffer
export function readMirror(file: string, encoding: 'utf8'): string
export function readMirror(file: string, encoding?: 'utf8'): Buffer | string {
  const path = join(MIRROR, file)
  if (!existsSync(path)) throw new Error(`${file} is not in the asset mirror: run node tools/assets.mjs pull`)
  return encoding ? readFileSync(path, encoding) : readFileSync(path)
}

let citadel: Promise<CitadelAsset> | null = null

/** The citadel's plan and geometry from the mirror, decoded as the game does (once per process). */
export function mirrorCitadel(): Promise<CitadelAsset> {
  citadel ??= decodeCitadel(mirrorJson<CitadelPlanData>('citadel.plan.json'), mirrorBytes('citadel.glb'))
  return citadel
}
