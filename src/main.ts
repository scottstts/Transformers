import './style.css'
import { showBootError, setBootStage, showGame } from './platform/boot-ui'

async function boot(): Promise<void> {
  setBootStage('Loading game modules')
  try {
    const { startGame } = await import('./game/start')
    await startGame(setBootStage)
    showGame()
  } catch (error) {
    showBootError(error)
  }
}

void boot()
