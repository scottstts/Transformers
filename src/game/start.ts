import { GpuHost } from '../platform/webgpu'
import { GameSession } from './session'
import { ROSTER, loadRosterAsset, rosterEntry, saveVehicle, savedVehicle } from '../content/roster'
import { VehicleMenu } from '../ui/vehicle-menu'
import { TouchControls } from '../ui/touch-controls'
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

/** The in-game UI wired to a running session. */
export interface GameControls {
  readonly menu: VehicleMenu
  readonly touch: TouchControls | null
}

/**
 * The vehicle menu (switching remembers the choice) and, on touch screens, the
 * on-screen stick and buttons in place of pointer lock, mouse look and keys.
 */
export function attachControls(session: GameSession, touch: boolean): GameControls {
  session.cameraRig.pointerLock = !touch
  const pad = touch
    ? new TouchControls({
      stick: (x, y, run) => session.input.setStick(x, y, run),
      look: (dx, dy) => session.cameraRig.look(dx, dy),
      transform: () => session.toggleForm(),
      jump: () => session.input.pressJump(),
    })
    : null
  if (pad) session.onStandingChange = (standing) => pad.setJumpAvailable(standing)
  const menu = new VehicleMenu({
    touch,
    roster: ROSTER,
    current: () => session.character.id,
    get canSwitch() { return session.canSwitch },
    get playing() { return touch || session.cameraRig.locked },
    switchTo: async (entry) => {
      const switched = await session.switchCharacter(entry)
      if (switched) saveVehicle(entry.id)
      return switched
    },
    resume: () => session.cameraRig.activate(),
    holdLook: (held) => session.cameraRig.holdLook(held),
    openChanged: (open) => {
      document.body.classList.toggle('menu-open', open)
      if (open) pad?.release()
    },
  })
  return { menu, touch: pad }
}
