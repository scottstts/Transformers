import './style.css'
import { showBootError, setBootStage, showEntry, showGame } from './platform/boot-ui'
import { isTouchDevice } from './platform/device'

async function boot(): Promise<void> {
  const touch = isTouchDevice()
  document.body.classList.toggle('touch', touch)
  setBootStage('Loading game modules')
  try {
    const { startGame, attachControls } = await import('./game/start')
    const session = await startGame(setBootStage)
    const controls = attachControls(session, touch)
    // play starts once the pointer locks (mouse and keyboard) or at once (touch)
    const enter = (): void => {
      if (!touch && !session.cameraRig.locked) return
      document.removeEventListener('pointerlockchange', enter)
      showGame()
      controls.menu.refreshHint()
    }
    document.addEventListener('pointerlockchange', enter)
    showEntry(() => {
      if (touch) enter()
      else session.cameraRig.activate()
    })
  } catch (error) {
    showBootError(error)
  }
}

void boot()
