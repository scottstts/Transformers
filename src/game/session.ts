import { Euler, Matrix4, PerspectiveCamera, RenderPipeline, Scene, Timer, Vector3, WebGPURenderer } from 'three/webgpu'
import { bakeEnvironment, configureRenderer, createPostPipeline } from '../rendering/look'
import { createDesertWorld } from '../worlds/desert'
import { AudioMix } from '../audio/mix'
import { loadRosterAsset, type RosterEntry } from '../content/roster'
import type { PlayableTransformerAsset } from '../content/transformer/asset/loader'
import type { Character } from '../content/transformer/character'
import { FollowCamera } from './follow-camera'
import { GameInput } from './input'
import { advanceTransformation, isTransforming, requestTransformation, resolveCircleCollisions, updateRobot } from './movement'
import { updateCar } from './car-dynamics'
import { createMotionState, type Form } from './types'
import { RobotJump } from './jump'
import { RobotCombat } from './combat/robot-combat'
import { CameraFx } from './combat/camera-fx'
import { Director, type DirectorSubject } from './combat/director'
import { Energy } from './combat/energy'
import { Lens } from '../rendering/lens'
import { disableCulling } from '../rendering/warm'
import type { SoldierAsset } from '../content/soldier/asset'
import { Horde, type EnemyTarget } from './enemies/horde'
import { CarBarrier } from './enemies/barrier'
import type { FortHold } from '../ui/fort-hint'

/** Frames rendered behind the switch cover before the new car is revealed. */
const SWITCH_SETTLE_FRAMES = 3

export class GameSession {
  readonly scene = new Scene()
  readonly camera: PerspectiveCamera
  readonly environment = createDesertWorld(this.scene)
  readonly world = this.environment.world
  readonly state = createMotionState()
  readonly audio = new AudioMix()
  readonly cameraRig: FollowCamera
  readonly input: GameInput
  readonly pipeline: RenderPipeline
  /** the car being played; swapped by `switchCharacter` */
  character: Character
  private readonly renderer: WebGPURenderer
  /** characters built so far (their GPU resources stay warm for switching back) */
  private readonly built = new Map<string, Character>()
  private switching: string | null = null
  /** a switch is waiting for a transformation, jump or special to end (the world runs on) */
  private waiting = false
  private standing = false
  private carActions = true
  /** the robot stands: it can walk, jump and fight */
  get standingRobot(): boolean {
    return this.standing
  }
  /** called when the robot comes to stand or leaves it (car form, transforming); for UI such as the touch jump button */
  onStandingChange: ((standing: boolean) => void) | null = null
  /** the car is fully settled and not switching: the mobile drift button may be held */
  get carActionsAvailable(): boolean { return this.carActions }
  /** called when car-only touch actions become available or unavailable */
  onCarActionsChange: ((available: boolean) => void) | null = null
  /** the special's energy, charged by combo blows (it stays with the player across cars) */
  readonly energy = new Energy()
  /** called when a special's cutscene starts or ends (UI hides and shows the HUD) */
  onCinematicChange: ((on: boolean) => void) | null = null
  private readonly timer = new Timer()
  private readonly jump = new RobotJump()
  /** the lens reactions the post pipeline reads (blast waves, flashes, the drained zone) */
  private readonly lens = new Lens()
  /** camera reactions and the fight's clock rate (hit-stop) */
  private readonly cameraFx = new CameraFx(this.lens)
  /** films the special; the follow camera takes back over at its end */
  private readonly director = new Director()
  private readonly subjects = new Map<string, DirectorSubject>()
  private cinematic = false
  private handback = false
  /** each built character's fight (kept with the character) */
  private readonly fights = new Map<string, RobotCombat>()
  private fight: RobotCombat
  private readonly up = new Vector3(0, 1, 0)
  private readonly suspensionRotation = new Matrix4()
  private readonly suspensionInverse = new Matrix4()
  private readonly suspensionEuler = new Euler()
  private readonly onFrameError: (error: Error) => void
  /** the forts' soldiers, and the ring that keeps the car out of the forts */
  readonly horde: Horde
  private readonly barrier = new CarBarrier()
  private readonly target: EnemyTarget = { x: 0, z: 0, radius: 1, vx: 0, vz: 0, height: 4, heading: 0, guard: 0, present: true }
  private holding: FortHold = null
  private wallTime = 0
  /** how long the refusal of the car form inside a fort stays up (s) */
  private lockedTime = 0
  /** called when the player is held at a fort (the car at its perimeter, the robot against its walls, the car form refused inside), or no longer (UI hint) */
  onFortHold: ((hold: FortHold) => void) | null = null

  constructor(renderer: WebGPURenderer, camera: PerspectiveCamera, entry: RosterEntry, asset: PlayableTransformerAsset, soldiers: SoldierAsset, onFrameError: (error: Error) => void) {
    this.renderer = renderer
    this.camera = camera
    this.onFrameError = onFrameError
    this.character = entry.create(asset, this.environment.contactEffects, this.audio)
    this.built.set(entry.id, this.character)
    configureRenderer(renderer)
    this.scene.add(this.character.model.root, this.character.effects.object)
    this.character.model.pose(0, null)
    this.horde = new Horde(soldiers, this.world.forts, this.environment.contactEffects, this.audio)
    this.horde.onStruck = (at, from, strength) => this.character.combat.effects.struck(at, from, strength, this.fight.guarded)
    this.scene.add(this.horde.object)

    bakeEnvironment(renderer, this.scene, this.environment.environmentScene())

    this.fight = this.fightFor(this.character)
    this.cameraRig = new FollowCamera(this.camera, renderer.domElement, this.state.yaw, this.character.robotOffset, this.character.profile.camera)
    this.cameraRig.showSide(this.state.yaw)
    this.input = new GameInput(renderer.domElement, () => this.toggleForm(), () => this.audio.resume())
    this.pipeline = createPostPipeline(renderer, this.scene, this.camera, this.lens)
    this.cameraRig.update(1 / 60, this.state, this.character.model.root)
    this.world.update(this.camera, this.cameraRig.focusPoint(this.state, this.character.model.root))
    this.cameraRig.setObstacles(this.world.cameraObstacles)
  }

  selectForm(form: Form): void {
    if (this.jump.active || this.fight.active || this.switching) return
    // inside a fort's perimeter the robot stays a robot: the car could never have driven in
    if (form === 'car' && this.state.mode === 'robot' && this.world.forts.within(this.state.pos.x, this.state.pos.z)) {
      this.lockedTime = 2.4
      return
    }
    requestTransformation(this.state, form)
  }

  toggleForm(): void {
    this.selectForm(this.state.mode === 'car' ? 'robot' : 'car')
  }

  /** A special's cutscene is playing: the game takes no input. */
  get inCutscene(): boolean {
    return this.cinematic
  }

  /** The special can be played now: the meter is full (the robot must also stand). */
  get specialReady(): boolean {
    return this.energy.full
  }

  /**
   * A car can be swapped in at once whenever no transformation, jump or
   * special is playing (either form, fighting or not, inside a fortress or
   * out): a combo or a raised guard is simply dropped by the swap.
   */
  get canSwitch(): boolean {
    return !isTransforming(this.state) && !this.jump.active && !this.fight.cinematic
  }

  /** The car being loaded by `switchCharacter`, if any. */
  get pending(): string | null {
    return this.switching
  }

  /**
   * Swap in another car where the current one stands, in the same form. Its
   * asset downloads once; its shaders compile against this scene's lighting.
   * While it loads, controls are locked and the audio output is held silent
   * (the UI covers the screen). The swap then happens behind that cover, and
   * the promise resolves only once the GPU has finished the new car's first
   * frames (first-use uploads and pipelines), so picture and sound return
   * together. Asked mid-transformation, mid-jump or mid-special it waits for
   * that to finish (the world runs on meanwhile) rather than refusing:
   * refusing made the menu look broken until the right moment was hit.
   */
  async switchCharacter(entry: RosterEntry): Promise<boolean> {
    if (entry.id === this.character.id) return true
    if (this.switching) return false
    this.switching = entry.id
    // (the world is frozen while a switch loads, so what it waits for must end first)
    this.waiting = true
    try {
      while (!this.canSwitch) await nextFrame()
    } finally {
      this.waiting = false
    }
    this.audio.hold(true)
    try {
      let next = this.built.get(entry.id)
      if (!next) {
        const asset = await loadRosterAsset(entry)
        next = entry.create(asset, this.environment.contactEffects, this.audio)
        this.stage(next)
        next.combat.effects.warm(true)
        try {
          await this.renderer.compileAsync(next.model.root, this.camera, this.scene)
          await this.renderer.compileAsync(next.effects.object, this.camera, this.scene)
          this.built.set(entry.id, next)
          this.swap(next)
          // Keep combat warm during the hidden first frames: this forces the
          // weapon geometry and its cast-shadow path through real GPU draws.
          await this.settleFrames(SWITCH_SETTLE_FRAMES)
          return true
        } finally {
          next.combat.effects.warm(false)
        }
      }
      this.swap(next)
      await this.settleFrames(SWITCH_SETTLE_FRAMES)
      return true
    } finally {
      this.switching = null
      this.audio.hold(false)
    }
  }

  /**
   * Compile and draw every path the scene can use, including the hidden
   * combat weapon and its shadow, the soldiers' every tier and the forts
   * wherever they stand (culling is off for this draw, so the parts of the
   * world outside the start view, and their shadow casters, are ready before
   * they first come into sight).
   */
  async compile(): Promise<void> {
    const effects = this.character.combat.effects
    effects.warm(true)
    this.environment.contactEffects.warm(true)
    this.horde.warm(true)
    const restoreCulling = disableCulling(this.scene)
    try {
      await this.renderer.compileAsync(this.scene, this.camera)
      // compileAsync prepares pipelines, but a real hidden draw also forces
      // first-use geometry uploads before the entry screen can report ready.
      this.pipeline.render()
      await this.waitForGpu()
    } finally {
      restoreCulling()
      effects.warm(false)
      this.environment.contactEffects.warm(false)
      this.horde.warm(false)
    }
  }

  /** Let the render loop draw `frames` frames, then wait until the GPU has finished them. */
  private async settleFrames(frames: number): Promise<void> {
    for (let i = 0; i < frames; i++) await nextFrame()
    await this.waitForGpu()
  }

  private async waitForGpu(): Promise<void> {
    const device = (this.renderer.backend as { device?: GPUDevice }).device
    if (device) await device.queue.onSubmittedWorkDone()
  }

  frame(): void {
    try {
      this.updateAndRender()
    } catch (error) {
      this.onFrameError(error instanceof Error ? error : new Error(String(error)))
    }
  }

  private fightFor(character: Character): RobotCombat {
    let fight = this.fights.get(character.id)
    if (!fight) {
      fight = new RobotCombat(character.combat, character.model, character.robotOffset, this.state, this.cameraFx)
      fight.onStrike = (move) => this.energy.strike(move)
      // a blow that catches soldiers bites: a moment of hit-stop on a landed strike
      fight.aimAssist = (x, z, heading, range, cone) => this.horde.assist(x, z, heading, range, cone)
      fight.onHit = (hit) => {
        const caught = this.horde.hit(hit)
        if (caught > 0 && hit.shape === 'sector') this.cameraFx.hitStop(0.05, 0.18)
      }
      this.fights.set(character.id, fight)
    }
    return fight
  }

  /** What the director frames of a character: its pelvis, its head and its weapon's head end. */
  private subjectFor(character: Character): DirectorSubject {
    let subject = this.subjects.get(character.id)
    if (!subject) {
      const weapon = character.combat.effects.weapon
      const tip = new Vector3(0, 0, weapon ? weapon.asset.manifest.extent[1] * 0.8 : 0)
      subject = {
        body: character.model.node('bone:pelvis'),
        head: character.model.node('bone:head'),
        weapon: (out) => {
          if (!weapon || weapon.presence < 0.5) return false
          out.copy(tip).applyMatrix4(weapon.object.matrixWorld)
          return true
        },
      }
      this.subjects.set(character.id, subject)
    }
    return subject
  }

  private setCinematic(on: boolean): void {
    if (on === this.cinematic) return
    this.cinematic = on
    this.handback = false
    this.cameraRig.cinematic = on
    if (!on) {
      this.director.stop()
      // whatever the special emptied and its last blow missed breaks apart as it ends
      this.horde.settle()
    }
    this.onCinematicChange?.(on)
  }

  /** Place a character's model where the current one stands (at the current pose). */
  private stage(next: Character): void {
    const root = next.model.root
    root.position.copy(this.state.pos)
    root.quaternion.setFromAxisAngle(this.up, this.state.yaw)
    next.model.pose(this.state.progress, null)
  }

  private swap(next: Character): void {
    const previous = this.character
    const state = this.state
    this.scene.remove(previous.model.root, previous.effects.object)
    previous.effects.audio.dispose()
    this.fight.cancel()
    this.setCinematic(false)
    previous.combat.effects.dispose()
    this.cameraFx.reset()
    // a standing robot stays where it stands: the car origin moves by the difference in stations
    if (state.progress >= 1) {
      const shift = previous.robotOffset - next.robotOffset
      state.pos.x += Math.sin(state.yaw) * shift
      state.pos.z += Math.cos(state.yaw) * shift
    }
    state.speed = Math.min(state.speed, next.profile.drive.maxSpeed)
    this.character = next
    this.fight = this.fightFor(next)
    this.stage(next)
    this.scene.add(next.model.root, next.effects.object)
    this.cameraRig.setCharacter(next.robotOffset, next.profile.camera)
    // a frame without tyre contact ends the old car's ribbons: the new tyres start their own
    this.environment.contactEffects.update(0)
  }

  private updateAndRender(): void {
    this.timer.update()
    const frameDt = Math.max(1 / 240, Math.min(this.timer.getDelta(), 1 / 30))
    // while a car switch loads the world stands still (the fight, the soldiers, their debris): nothing
    // happens behind the cover that the player could not answer
    const frozen = this.switching !== null && !this.waiting
    // the fight's hit-stop slows the world's clock for a moment; the camera keeps real time
    this.cameraFx.update(frozen ? 0 : frameDt)
    const state = this.state
    const { model, gait, effects, profile } = this.character
    const fight = this.fight
    // hit-stop and the special's slow motion slow the world's clock; the camera keeps real time
    const dt = frozen ? 0 : frameDt * this.cameraFx.timeScale * fight.tempo
    this.cameraFx.updateWorld(dt)
    const previous = advanceTransformation(state, dt, this.character.transformationDuration)
    // a car switch in progress locks the controls, as a transformation does; so does a special's cutscene
    const busy = isTransforming(state) || this.switching !== null || fight.cinematic
    const stance = !busy && state.mode === 'robot' && state.progress >= 1
    const special = this.input.consumeSpecial() && stance && !this.jump.active && this.energy.spend()
    if (special) {
      fight.startSpecial(state, this.camera)
      this.director.start(this.character.combat.special, fight.groundOrigin, fight.groundHeading)
      this.setCinematic(true)
    }
    const attack = this.input.consumeAttack() && stance && !this.jump.active && !special
    if (attack) fight.press()
    fight.setGuard(this.input.guarding && stance && !this.jump.active && !special)
    // the movement keys aim each move of the fight, and take the robot back from it once the combo allows
    const steer = stance ? this.input.movementDirection(this.camera) : null
    fight.setSteer(steer)
    if (steer && !attack && fight.releasable) fight.release()
    if (this.input.consumeJump() && stance && !attack && !fight.active) this.jump.start(Math.abs(state.speed) / profile.robot.runSpeed)
    const jump = this.jump.update(dt)
    fight.update(dt, state, this.camera)
    if (this.cinematic && !fight.cinematic) this.setCinematic(false)
    const standing = state.mode === 'robot' && state.progress >= 1
    if (standing !== this.standing) {
      this.standing = standing
      this.onStandingChange?.(standing)
    }
    const carActions = !busy && state.mode === 'car' && state.progress <= 0
    if (carActions !== this.carActions) {
      this.carActions = carActions
      this.onCarActionsChange?.(carActions)
    }
    if (state.progress < 0.5) updateCar(state, this.input, dt, busy || state.mode === 'robot', profile.drive)
    else if (!fight.active) updateRobot(state, this.input, this.camera, dt, busy || state.mode === 'car', this.character.robotOffset, profile.robot, jump.airborne)
    // the forts' ring holds the car back; the robot walks through it
    this.barrier.apply(state, this.world.forts, profile.drive.maxSpeed, state.progress < 1)
    const walled = resolveCircleCollisions(state, this.world.colliders, this.character.robotOffset, profile, this.world.segments)
    // a robot pushing against a fort's walls for a moment is told where the way in is
    this.wallTime = walled && state.mode === 'robot' && !fight.active ? this.wallTime + frameDt : 0
    this.lockedTime = Math.max(0, this.lockedTime - frameDt)
    const hold: FortHold = this.barrier.holding ? 'car'
      : this.lockedTime > 0 ? 'locked'
        : this.wallTime > 0.6 && this.outsideWalls(state.pos.x, state.pos.z) ? 'wall' : null
    if (hold !== this.holding) {
      this.holding = hold
      this.onFortHold?.(hold)
    }
    fight.afterCollisions(state)

    const pose = gait.update(dt, state.speed, state.yawRate, this.input.running, state.progress >= 1, jump)
    if (jump.tookOff) effects.takeoff()
    if (jump.landed) effects.land(gait.jumpLead)
    // the fight places its own feet: the stride's footfalls fall silent under it
    if (fight.poseWeight > 0.5) gait.events.length = 0
    while (gait.events.length) effects.addFootstep(gait.events.pop() as 'R' | 'L', gait.run)
    if (fight.poseWeight > 0) pose.air = (pose.air ?? 0) + (fight.air - (pose.air ?? 0)) * fight.poseWeight

    model.steer = state.steer
    model.spin = state.spin
    const pivot = profile.drive.pivotHeight
    const vibration = Math.sin(performance.now() * 0.013) * 0.004 * Math.min(Math.abs(state.speed) / 20, 1)
    this.suspensionEuler.set(state.pitch, 0, state.roll)
    this.suspensionRotation.makeRotationFromEuler(this.suspensionEuler)
    model.suspension.makeTranslation(0, pivot + vibration, 0)
      .multiply(this.suspensionRotation)
      .multiply(this.suspensionInverse.makeTranslation(0, -pivot, 0))
    model.root.position.copy(state.pos)
    model.root.quaternion.setFromAxisAngle(this.up, state.yaw)
    model.pose(state.progress, pose)
    effects.timeline(previous, state.progress)
    effects.update(dt, state)

    this.cameraRig.update(frameDt, state, model.root, this.input.driving && !busy && state.mode === 'car')
    if (this.cinematic) {
      const t = fight.specialTime
      // the follow camera swings in behind the robot underneath the last shot, which eases into it
      if (!this.handback && this.director.handingBack(t)) {
        this.handback = true
        const view = this.character.combat.special.handbackView
        this.cameraRig.orbitTo(state.yaw + view.yaw, view.pitch)
      }
      this.director.apply(this.camera, t, frameDt, this.subjectFor(this.character))
    }
    this.cameraFx.apply(this.camera)
    effects.shakeCamera(this.camera, dt)
    this.cameraRig.clearObstruction()
    this.updateTarget(dt)
    this.horde.special = fight.cinematic
    if (frozen) this.horde.drawFor(this.camera)
    else this.horde.update(dt, this.target, this.camera)
    this.world.update(this.camera, this.cameraRig.focusPoint(state, model.root))
    this.pipeline.render()
  }

  /** Near a fortress but outside its perimeter (the walls' hint is about the way in, not the buildings inside). */
  private outsideWalls(x: number, z: number): boolean {
    const fort = this.world.forts.near(x, z)
    return fort !== null && !fort.inside(x, z)
  }

  /** Where the player's body stands for the soldiers: the robot's standing point, or the car. */
  private updateTarget(dt: number): void {
    const state = this.state
    const robot = state.progress >= 1
    const offset = robot ? this.character.robotOffset : 0
    const x = state.pos.x + Math.sin(state.yaw) * offset
    const z = state.pos.z + Math.cos(state.yaw) * offset
    const t = this.target
    if (dt > 0) {
      t.vx = (x - t.x) / dt
      t.vz = (z - t.z) / dt
      // a teleport (a car switch) is not a shove
      if (Math.hypot(t.vx, t.vz) > 60) t.vx = t.vz = 0
    }
    t.x = x
    t.z = z
    t.radius = robot ? this.character.profile.robotRadius : this.character.profile.carRadius
    t.height = robot ? this.character.model.dims.hipZ * 1.8 : 1.6
    t.heading = state.yaw
    t.guard = this.fight.guarded ? this.character.combat.effects.guardReach() : 0
    // out of reach while the special carries it off or it is in the air
    t.present = !this.fight.cinematic && this.fight.air < 1 && !this.jump.active
  }

  dispose(): void {
    this.input.dispose()
    this.cameraRig.dispose()
  }
}

function nextFrame(): Promise<void> {
  return new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()) })
}
