import './style.css'
import { showBootError, setBootStage, showGame } from './platform/boot-ui'

async function boot(): Promise<void> {
  setBootStage('Loading game modules')
  try {
    const { startGame, attachVehicleMenu } = await import('./game/start')
    const session = await startGame(setBootStage)
    attachVehicleMenu(session)
    const veil = document.querySelector<HTMLElement>('.veil')
    if (!veil) throw new Error('Missing entry veil')
    setBootStage('Click to enter')
    const requestEntry = (): void => { session.cameraRig.activate() }
    const enter = (): void => {
      if (!session.cameraRig.locked) return
      veil.removeEventListener('pointerdown', requestEntry)
      document.removeEventListener('pointerlockchange', enter)
      showGame()
    }
    veil.addEventListener('pointerdown', requestEntry)
    document.addEventListener('pointerlockchange', enter)
    session.cameraRig.activate()
  } catch (error) {
    showBootError(error)
  }
}

void boot()
