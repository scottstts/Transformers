/** Why the player is held at a fort: the car at its perimeter, or the robot against its walls. */
export type FortHold = 'car' | 'wall' | null

/**
 * A quiet line at the top of the screen when the player is held at a fort:
 * the car at the perimeter (only the robot can go in), or the robot against
 * the walls (it goes in through a gate). It fades in after a moment of being
 * held (brushing past doesn't flash it) and out when released.
 */
export class FortHint {
  private readonly el: HTMLDivElement
  private readonly car: string
  private readonly wall = '<span>Fort walls</span><i></i><span>go in through a gate</span>'
  private timer = 0
  private shown: FortHold = null

  constructor(touch: boolean) {
    this.el = document.createElement('div')
    this.el.className = 'fort-hint'
    this.car = touch
      ? '<span>Fort perimeter</span><i></i><span>transform to go in</span>'
      : '<span>Fort perimeter</span><i></i><kbd>R</kbd><span>transform to go in</span>'
    document.body.append(this.el)
  }

  set(hold: FortHold): void {
    if (hold === this.shown) return
    this.shown = hold
    window.clearTimeout(this.timer)
    if (!hold) {
      this.el.classList.remove('shown')
      return
    }
    this.timer = window.setTimeout(() => {
      this.el.innerHTML = hold === 'car' ? this.car : this.wall
      this.el.classList.add('shown')
    }, 450)
  }
}
