import { GpuHost } from '../platform/webgpu'
import { GameSession } from './session'
import { ROSTER, loadRosterAsset, rosterEntry, saveVehicle, savedVehicle } from '../content/roster'
import { VehicleMenu } from '../ui/vehicle-menu'
import { PerspectiveCamera } from 'three/webgpu'

export async function startGame(setStage: (stage: string) => void): Promise<GameSession> {
  const mount = document.querySelector<HTMLElement>('#app')
  if (!mount) throw new Error('Missing game mount')
  const sizingCamera = new PerspectiveCamera(42, 1, 0.1, 6000)
  const host = new GpuHost(sizingCamera, mount)
  // the last car the player chose; the model downloads while the GPU initializes and its
  // failure surfaces when awaited below
  const entry = rosterEntry(savedVehicle())
  const assetLoad = loadRosterAsset(entry)
  assetLoad.catch(() => undefined)
  try {
    await host.initialize()
    setStage(`Loading ${entry.label} model`)
    const asset = await host.observe(assetLoad)
    setStage('Building game world')
    const session = new GameSession(host.renderer, sizingCamera, entry, asset, (error) => host.fail(error))
    setStage('Compiling shaders')
    await host.observe(host.renderer.compileAsync(session.scene, session.camera))
    setStage('Rendering first frame')
    session.frame()
    await host.waitForGpu()
    host.ready()
    setStage('Running')
    host.renderer.setAnimationLoop(() => session.frame())
    return session
  } catch (error) {
    host.dispose()
    throw error
  }
}

/** The vehicle menu wired to a running session; switching remembers the choice. */
export function attachVehicleMenu(session: GameSession): VehicleMenu {
  return new VehicleMenu({
    roster: ROSTER,
    current: () => session.character.id,
    get canSwitch() { return session.canSwitch },
    get playing() { return session.cameraRig.locked },
    switchTo: async (entry) => {
      const switched = await session.switchCharacter(entry)
      if (switched) saveVehicle(entry.id)
      return switched
    },
    resume: () => session.cameraRig.activate(),
    suspend: () => session.cameraRig.suspendInput(),
  })
}
