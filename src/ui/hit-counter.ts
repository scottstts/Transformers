/** How long a streak lives after its last hit (s); must match the rail's CSS animation. */
const STREAK_S = 3
/** Counts at which the readout runs hotter. */
const HOT = 10
const BLAZE = 30

/**
 * The robot's hit streak on the right of the screen: a heavy slanted "x12"
 * that punches up with every hit and a rail under it that drains over the
 * streak's three seconds. It appears with a streak's first hit and leaves
 * when the rail runs out; between streaks there is nothing on screen.
 *
 * A hit restarts the punch and the rail by flipping between two identical
 * keyframe names (no forced reflow). The streak's clock runs on the played
 * frames, so a pause holds it, and the rail's animation pauses with it. A
 * special holds it too: its blows keep counting however far apart they fall,
 * the rail stays full, and the three seconds start again when it ends.
 */
export class HitCounter {
  private readonly root: HTMLDivElement
  private readonly value: HTMLElement
  private count = 0
  private left = 0
  private flip = false
  private held = false

  constructor() {
    this.root = document.createElement('div')
    this.root.className = 'hits'
    this.root.setAttribute('aria-hidden', 'true')
    const x = document.createElement('span')
    x.className = 'hits-x'
    x.textContent = 'x'
    this.value = document.createElement('b')
    this.value.className = 'hits-n'
    const rail = document.createElement('i')
    rail.className = 'hits-rail'
    this.root.append(x, this.value, rail)
    document.body.append(this.root)
  }

  /** A blow caught `count` enemies. */
  hit(count: number): void {
    this.count += count
    this.left = STREAK_S
    this.value.textContent = String(this.count)
    this.flip = !this.flip
    const c = this.root.classList
    c.toggle('flip', this.flip)
    c.toggle('hot', this.count >= HOT)
    c.toggle('blaze', this.count >= BLAZE)
    c.add('live')
  }

  /** Hold the streak open (a special is playing); released, it has its full three seconds again. */
  hold(on: boolean): void {
    if (on === this.held) return
    this.held = on
    this.root.classList.toggle('held', on)
    if (!on && this.left > 0) this.left = STREAK_S
  }

  /** Advance the streak's clock (real seconds of played frames). */
  update(dt: number): void {
    if (this.held || this.left <= 0) return
    this.left -= dt
    if (this.left > 0) return
    this.count = 0
    this.root.classList.remove('live')
  }

  /** The special's colour (CSS), from the character playing. */
  tint(color: string): void {
    this.root.style.setProperty('--charge', color)
  }

  dispose(): void {
    this.root.remove()
  }
}
