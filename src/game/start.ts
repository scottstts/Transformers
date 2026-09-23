import { GpuHost } from '../platform/webgpu'
import { GameSession } from './session'
import { PerspectiveCamera } from 'three/webgpu'

export async function startGame(setStage: (stage: string) => void): Promise<void> {
  const mount = document.querySelector<HTMLElement>('#app')
  if (!mount) throw new Error('Missing game mount')
  const sizingCamera = new PerspectiveCamera(42, 1, 0.1, 6000)
  const host = new GpuHost(sizingCamera, mount)
  try {
    await host.initialize()
    setStage('Building game world')
    const session = new GameSession(host.renderer, sizingCamera, (error) => host.fail(error))
    setStage('Compiling shaders')
    await host.observe(host.renderer.compileAsync(session.scene, session.camera))
    setStage('Rendering first frame')
    session.frame()
    await host.waitForGpu()
    host.ready()
    setStage('Running')
    host.renderer.setAnimationLoop(() => session.frame())
  } catch (error) {
    host.dispose()
    throw error
  }
}
