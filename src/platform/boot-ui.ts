let stage = 'Loading'

const status = (): HTMLElement => {
  const element = document.getElementById('boot-status')
  if (!element) throw new Error('Missing boot status element')
  return element
}

export function setBootStage(next: string): void {
  stage = next
  status().textContent = next
}

export function showGame(): void {
  document.body.classList.add('ready')
}

export function showBootError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  const width = window.innerWidth
  const height = window.innerHeight
  const baseDpr = Math.min(window.devicePixelRatio, 1.7, Math.sqrt(4_000_000 / (Math.max(1, width) * Math.max(1, height))))
  const platform = navigator.platform || 'unknown'
  document.body.classList.remove('ready')
  document.body.classList.add('failed')
  const element = status()
  element.replaceChildren()
  const heading = document.createElement('strong')
  heading.textContent = 'Unable to start Transformer'
  const detail = document.createElement('span')
  detail.textContent = `${stage}: ${message}`
  const diagnostics = document.createElement('small')
  diagnostics.textContent = `${width}×${height} · DPR ${baseDpr.toFixed(2)} · ${platform}`
  element.append(heading, detail, diagnostics)
  console.error('Transformer failure', { stage, width, height, dpr: baseDpr, platform, error })
}
