/**
 * The entry screen: boot progress (a sun rising over a drawn ridge line, a
 * stage readout), then the Enter button, and on failure the diagnostic view.
 */

/** Stages reported before the game is ready (see `main.ts`, `game/start.ts`, `platform/webgpu.ts`). */
const BOOT_STEPS = 7

let stage = 'Loading'
let step = 0

const element = (id: string): HTMLElement => {
  const found = document.getElementById(id)
  if (!found) throw new Error(`Missing entry element #${id}`)
  return found
}

const veil = (): HTMLElement => {
  const found = document.querySelector<HTMLElement>('.veil')
  if (!found) throw new Error('Missing entry veil')
  return found
}

const counter = (n: number): string => String(n).padStart(2, '0')

export function setBootStage(next: string): void {
  stage = next
  step = Math.min(BOOT_STEPS, step + 1)
  element('boot-status').textContent = next
  element('boot-count').textContent = `${counter(step)}/${counter(BOOT_STEPS)}`
  veil().style.setProperty('--progress', String(step / BOOT_STEPS))
}

/**
 * Loading is done: the gauge opens into the Enter button and the drawing
 * fades to show the live scene behind. `enter` runs on each press (pointer
 * lock may need another try); the caller calls `showGame` once play starts.
 */
export function showEntry(enter: () => void): void {
  const button = element('entry-button') as HTMLButtonElement
  button.hidden = false
  button.addEventListener('click', enter)
  veil().style.setProperty('--progress', '1')
  element('boot-status').textContent = 'Ready'
  document.body.classList.add('entry')
  button.focus({ preventScroll: true })
}

export function showGame(): void {
  document.body.classList.add('ready')
  ;(element('entry-button') as HTMLButtonElement).blur()
}

export function showBootError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  const width = window.innerWidth
  const height = window.innerHeight
  const baseDpr = Math.min(window.devicePixelRatio, 1.7, Math.sqrt(4_000_000 / (Math.max(1, width) * Math.max(1, height))))
  const platform = navigator.platform || 'unknown'
  document.body.classList.remove('ready', 'entry')
  document.body.classList.add('failed')
  const report = element('boot-error')
  report.replaceChildren()
  const heading = document.createElement('strong')
  heading.textContent = 'Unable to start Transformer'
  const detail = document.createElement('span')
  detail.textContent = `${stage}: ${message}`
  const diagnostics = document.createElement('small')
  diagnostics.textContent = `${width}×${height} · DPR ${baseDpr.toFixed(2)} · ${platform}`
  report.append(heading, detail, diagnostics)
  report.hidden = false
  console.error('Transformer failure', { stage, width, height, dpr: baseDpr, platform, error })
}
