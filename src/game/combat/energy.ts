/**
 * Energy each combo move's blow adds, by its place in the combo (share of a
 * full meter). Heavier blows charge more; one full combo adds 0.34, so about
 * three full combos fill the meter.
 */
export const ENERGY_PER_MOVE: readonly number[] = [0.06, 0.075, 0.09, 0.115]

/**
 * The special's energy: charged by landed combo blows, spent whole on the
 * special. It belongs to the player (it survives a car switch).
 */
export class Energy {
  private value = 0
  /** the level changed: `gained` for a blow, not for the special spending it */
  onChange: ((level: number, gained: boolean) => void) | null = null

  /** 0..1 */
  get level(): number {
    return this.value
  }

  get full(): boolean {
    return this.value >= 1
  }

  /** A combo move's blow landed (`move` its place in the combo). */
  strike(move: number): void {
    if (this.full) return
    const gain = ENERGY_PER_MOVE[Math.min(move, ENERGY_PER_MOVE.length - 1)] ?? 0
    // a sliver short of full after the twelfth blow reads as a bug: snap within 2 %
    const next = this.value + gain
    this.value = next >= 0.98 ? 1 : next
    this.onChange?.(this.value, true)
  }

  /** Spend the whole meter; false if it was not full. */
  spend(): boolean {
    if (!this.full) return false
    this.value = 0
    this.onChange?.(0, false)
    return true
  }
}
