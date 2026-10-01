import { GpuHost } from '../platform/webgpu'
import { GameSession } from './session'
import { ROSTER, loadRosterAsset, rosterEntry, saveVehicle, savedVehicle } from '../content/roster'
import { VehicleMenu } from '../ui/vehicle-menu'
import { CinemaBars, EnergyMeter } from '../ui/energy-meter'
import { FortHint } from '../ui/fort-hint'
import { HitCounter } from '../ui/hit-counter'
import { Speedometer } from '../ui/speedometer'
import { PauseMenu } from '../ui/pause-menu'
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
  // the forts' soldiers and their commander download alongside
  const soldierLoad = loadSoldierAsset()
  soldierLoad.catch(() => undefined)
  const commanderLoad = loadSoldierAsset('commander')
  commanderLoad.catch(() => undefined)
  try {
    await host.initialize()
    setStage(`Loading ${entry.label} model`)
    const asset = await host.observe(assetLoad)
    setStage('Loading soldier model')
    const soldiers = await host.observe(soldierLoad)
    setStage('Loading commander model')
    const commander = await host.observe(commanderLoad)
    setStage('Building game world')
    const session = new GameSession(host.renderer, sizingCamera, entry, asset, soldiers, commander, (error) => host.fail(error))
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
  readonly energy: EnergyMeter
  readonly pause: PauseMenu
}

/**
 * The vehicle menu (switching remembers the choice), the pause menu, the
 * special's energy meter, the car's speedometer, the robot's hit streak and
 * cutscene bars.
 */
export function attachControls(session: GameSession): GameControls {
  const energy = new EnergyMeter()
  new CinemaBars()
  const fortHint = new FortHint()
  const speedo = new Speedometer()
  const hits = new HitCounter()
  session.onHits = (count) => hits.hit(count)
  session.onFrame = (dt) => {
    speedo.update(session.carSpeed)
    hits.update(dt)
  }
  session.onFortHold = (hold) => fortHint.set(hold)
  const menu = new VehicleMenu({
    roster: ROSTER,
    current: () => session.character.id,
    canSwitchInstantly: (entry) => session.canSwitchInstantly(entry),
    get playing() { return session.cameraRig.locked },
    get standing() { return session.standingRobot },
    get specialReady() { return session.specialReady },
    get cinematic() { return session.inCutscene },
    get paused() { return pause.isPaused },
    switchTo: async (entry) => {
      const switched = await session.switchCharacter(entry)
      if (switched) {
        saveVehicle(entry.id)
        showCharacter()
      }
      return switched
    },
    // closed from Escape or after a load (no gesture), the pointer stays free: the game pauses
    resume: () => { void session.cameraRig.activate().then(() => pause.settle()) },
    holdLook: (held) => session.cameraRig.holdLook(held),
    holdGame: (held) => session.hold('menu', held),
    openChanged: (open) => {
      document.body.classList.toggle('menu-open', open)
    },
  })
  const pause = new PauseMenu({
    get locked() { return session.cameraRig.locked },
    get blocked() { return menu.isOpen },
    lock: () => session.cameraRig.activate(),
    pausedChanged: (paused) => {
      session.hold('pause', paused)
    },
  })
  // The meter, the dial and the streak take the playing robot's special colour; the dial its car's speeds.
  const showCharacter = (): void => {
    const color = rosterEntry(session.character.id).special
    energy.tint(color)
    speedo.tint(color)
    hits.tint(color)
    const drive = session.character.profile.drive
    speedo.range(drive.maxSpeed, drive.boostSpeed)
    showEnergy(false)
  }
  const showEnergy = (gained: boolean): void => {
    energy.set(session.energy.level, gained)
  }
  showCharacter()
  energy.setActive(session.standingRobot)
  session.energy.onChange = (_level, gained) => {
    showEnergy(gained)
    menu.refreshHint()
  }
  session.onStandingChange = (standing) => {
    energy.setActive(standing)
    menu.refreshHint()
  }
  session.onCinematicChange = (on) => {
    document.body.classList.toggle('cinematic', on)
    hits.hold(on)
  }
  return { menu, energy, pause }
}
