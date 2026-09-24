import type { MechanismEvent } from './asset/format'

export interface Cue {
  event: MechanismEvent
}

/**
 * Transformation cues from the exported mechanism events: each stroke starts
 * its sound when T crosses its start (its end, running backwards). Mirrored
 * L/R strokes merge into one wider voice and lifter strokes that start
 * together share one hydraulic voice.
 */
export function buildCues(events: MechanismEvent[]): Cue[] {
  const merged = new Map<string, Cue>()
  for (const e of events) {
    const lifter = e.name.startsWith('lift:')
    const base = lifter ? 'lift' : e.name.replace(/\.(L|R)$/, '')
    const key = lifter ? `lift@${Math.round(e.t0 * 50)}` : `${base}|${e.kind}|${e.t0}|${e.t1}`
    const found = merged.get(key)
    if (found) {
      found.event = { ...found.event, side: 0, size: found.event.size * (lifter ? 1 : 1.3), t1: Math.max(found.event.t1, e.t1) }
    } else {
      merged.set(key, { event: { ...e, name: base } })
    }
  }
  return [...merged.values()].sort((a, b) => a.event.t0 - b.event.t0)
}

/** Cues whose start (end, running backwards) T crossed between two frames. */
export function crossedCues(cues: Cue[], previous: number, current: number, visit: (event: MechanismEvent) => void): void {
  const forward = current > previous
  for (const { event } of cues) {
    const at = forward ? event.t0 : event.t1
    if (forward ? previous < at && current >= at : previous > at && current <= at) visit(event)
  }
}
