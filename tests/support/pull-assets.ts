import { pull } from '../../tools/assets.mjs'

/** Before any test: the asset mirror holds every catalogued file (downloads only what is missing or stale). */
export default async function setup(): Promise<void> {
  await pull({ log: () => undefined })
}
