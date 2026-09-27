import './style.css'
import { showBootError, setBootStage, showEntry, showGame, showUnsupportedPlatform } from './platform/boot-ui'
import { isDesktopChromium } from './platform/device'

async function boot(): Promise<void> {
  if (!isDesktopChromium()) {
    showUnsupportedPlatform()
    return
  }
  setBootStage('Loading game modules')
  try {
    const { startGame, attachControls } = await import('./game/start')
    const session = await startGame(setBootStage)
    const controls = attachControls(session)
    // Play starts once the pointer locks.
    const enter = (): void => {
      if (!session.cameraRig.locked) return
      document.removeEventListener('pointerlockchange', enter)
      showGame()
      controls.menu.refreshHint()
    }
    document.addEventListener('pointerlockchange', enter)
    showEntry(() => { void session.cameraRig.activate() })
  } catch (error) {
    showBootError(error)
  }
}

void boot()
