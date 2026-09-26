import { GpuHost } from '../platform/webgpu'
import { GameSession } from './session'
import { ROSTER, loadRosterAsset, rosterEntry, saveVehicle, savedVehicle } from '../content/roster'
import { VehicleMenu } from '../ui/vehicle-menu'
import { TouchControls } from '../ui/touch-controls'
import { CinemaBars, EnergyMeter } from '../ui/energy-meter'
import { FortHint } from '../ui/fort-hint'
import { PerspectiveCamera } from 'three/webgpu'
import { loadSoldierAsset } from '../content/soldier/asset'

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
  // the forts' soldiers download alongside
  const soldierLoad = loadSoldierAsset()
  soldierLoad.catch(() => undefined)
  try {
    await host.initialize()
    setStage(`Loading ${entry.label} model`)
    const asset = await host.observe(assetLoad)
    setStage('Loading soldier model')
    const soldiers = await host.observe(soldierLoad)
    setStage('Building game world')
    const session = new GameSession(host.renderer, sizingCamera, entry, asset, soldiers, (error) => host.fail(error))
    setStage('Preparing audio')
    session.prepareAudio()
    setStage('Compiling shaders')
    await host.observe(session.compile())
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
  readonly energy: EnergyMeter
}

/**
 * The vehicle menu (switching remembers the choice), the special's energy
 * meter and cutscene bars and, on touch screens, the on-screen stick and
 * buttons in place of pointer lock, mouse look and keys.
 */
export function attachControls(session: GameSession, touch: boolean): GameControls {
  session.cameraRig.pointerLock = !touch
  const pad = touch
    ? new TouchControls({
      stick: (x, y, run) => session.input.setStick(x, y, run),
      look: (dx, dy) => session.cameraRig.look(dx, dy),
      transform: () => session.toggleForm(),
      jump: () => session.input.pressJump(),
      drift: (held) => session.input.setShift(held),
      attack: () => session.input.pressAttack(),
      guard: (held) => session.input.setGuard(held),
      special: () => session.input.pressSpecial(),
    })
    : null
  const energy = new EnergyMeter()
  new CinemaBars()
  const fortHint = new FortHint(touch)
  session.onFortHold = (hold) => fortHint.set(hold)
  const menu = new VehicleMenu({
    touch,
    roster: ROSTER,
    current: () => session.character.id,
    canSwitchInstantly: (entry) => session.canSwitchInstantly(entry),
    get playing() { return touch || session.cameraRig.locked },
    get standing() { return session.standingRobot },
    get specialReady() { return session.specialReady },
    get cinematic() { return session.inCutscene },
    switchTo: async (entry) => {
      const switched = await session.switchCharacter(entry)
      if (switched) {
        saveVehicle(entry.id)
        showEnergy(false)
      }
      return switched
    },
    resume: () => session.cameraRig.activate(),
    holdLook: (held) => session.cameraRig.holdLook(held),
    openChanged: (open) => {
      document.body.classList.toggle('menu-open', open)
      if (open) pad?.release()
    },
  })
  pad?.setCarAction(session.carActionsAvailable)
  // the meter and the touch button take the playing robot's special colour
  const showEnergy = (gained: boolean): void => {
    const color = rosterEntry(session.character.id).special
    energy.tint(color)
    energy.set(session.energy.level, gained)
    pad?.setSpecial(session.energy.level, color)
  }
  showEnergy(false)
  energy.setActive(session.standingRobot)
  session.energy.onChange = (_level, gained) => {
    showEnergy(gained)
    menu.refreshHint()
  }
  session.onStandingChange = (standing) => {
    pad?.setRobotActions(standing)
    energy.setActive(standing)
    menu.refreshHint()
  }
  session.onCarActionsChange = (available) => {
    pad?.setCarAction(available)
  }
  session.onCinematicChange = (on) => {
    document.body.classList.toggle('cinematic', on)
    if (on) pad?.release()
  }
  return { menu, touch: pad, energy }
}
