import { Euler, Matrix4, PerspectiveCamera, RenderPipeline, Scene, Timer, Vector3, WebGPURenderer } from 'three/webgpu'
import { bakeEnvironment, configureRenderer, createPostPipeline } from '../rendering/look'
import { createDesertWorld } from '../worlds/desert'
import { AudioMix } from '../audio/mix'
import { loadRosterAsset, type RosterEntry } from '../content/roster'
import type { TransformerAsset } from '../content/transformer/asset/loader'
import type { Character } from '../content/transformer/character'
import { FollowCamera } from './follow-camera'
import { GameInput } from './input'
import { advanceTransformation, isTransforming, requestTransformation, resolveCircleCollisions, updateCar, updateRobot } from './movement'
import { createMotionState, type Form } from './types'
import { RobotJump } from './jump'

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
  private readonly timer = new Timer()
  private readonly jump = new RobotJump()
  private readonly up = new Vector3(0, 1, 0)
  private readonly suspensionRotation = new Matrix4()
  private readonly suspensionInverse = new Matrix4()
  private readonly suspensionEuler = new Euler()
  private readonly onFrameError: (error: Error) => void

  constructor(renderer: WebGPURenderer, camera: PerspectiveCamera, entry: RosterEntry, asset: TransformerAsset, onFrameError: (error: Error) => void) {
    this.renderer = renderer
    this.camera = camera
    this.onFrameError = onFrameError
    this.character = entry.create(asset, this.environment.contactEffects, this.audio)
    this.built.set(entry.id, this.character)
    configureRenderer(renderer)
    this.scene.add(this.character.model.root, this.character.effects.object)
    this.character.model.pose(0, null)

    bakeEnvironment(renderer, this.scene, this.environment.environmentScene())

    this.cameraRig = new FollowCamera(this.camera, renderer.domElement, this.state.yaw, this.character.robotOffset, this.character.profile.camera)
    this.input = new GameInput(renderer.domElement, () => this.toggleForm(), () => this.audio.resume())
    this.pipeline = createPostPipeline(renderer, this.scene, this.camera)
    this.cameraRig.update(1 / 60, this.state, this.character.model.root)
    this.world.update(this.camera, this.cameraRig.focusPoint(this.state, this.character.model.root))
  }

  selectForm(form: Form): void {
    if (this.jump.active) return
    requestTransformation(this.state, form)
  }

  toggleForm(): void {
    this.selectForm(this.state.mode === 'car' ? 'robot' : 'car')
  }

  /** A car can be swapped in whenever no transformation or jump is running (either form). */
  get canSwitch(): boolean {
    return !isTransforming(this.state) && !this.jump.active
  }

  /** The car being loaded by `switchCharacter`, if any. */
  get pending(): string | null {
    return this.switching
  }

  /**
   * Swap in another car where the current one stands, in the same form. Its
   * asset downloads once; its shaders compile against this scene's lighting
   * before it appears, so the swap itself does not hitch. Resolves false if
   * the swap was no longer possible once the car was ready.
   */
  async switchCharacter(entry: RosterEntry): Promise<boolean> {
    if (entry.id === this.character.id) return true
    if (this.switching) return false
    this.switching = entry.id
    try {
      let next = this.built.get(entry.id)
      if (!next) {
        const asset = await loadRosterAsset(entry)
        next = entry.create(asset, this.environment.contactEffects, this.audio)
        this.stage(next)
        await this.renderer.compileAsync(next.model.root, this.camera, this.scene)
        this.built.set(entry.id, next)
      }
      if (!this.canSwitch) return false
      this.swap(next)
      return true
    } finally {
      this.switching = null
    }
  }

  frame(): void {
    try {
      this.updateAndRender()
    } catch (error) {
      this.onFrameError(error instanceof Error ? error : new Error(String(error)))
    }
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
    // a standing robot stays where it stands: the car origin moves by the difference in stations
    if (state.progress >= 1) {
      const shift = previous.robotOffset - next.robotOffset
      state.pos.x += Math.sin(state.yaw) * shift
      state.pos.z += Math.cos(state.yaw) * shift
    }
    state.speed = Math.min(state.speed, next.profile.drive.maxSpeed)
    this.character = next
    this.stage(next)
    this.scene.add(next.model.root, next.effects.object)
    this.cameraRig.setCharacter(next.robotOffset, next.profile.camera)
    // a frame without tyre contact ends the old car's ribbons: the new tyres start their own
    this.environment.contactEffects.update(0)
  }

  private updateAndRender(): void {
    this.timer.update()
    const dt = Math.max(1 / 240, Math.min(this.timer.getDelta(), 1 / 30))
    const state = this.state
    const { model, gait, effects, profile } = this.character
    const previous = advanceTransformation(state, dt, this.character.transformationDuration)
    const busy = isTransforming(state)
    if (this.input.consumeJump() && !busy && state.mode === 'robot' && state.progress >= 1) this.jump.start()
    const jump = this.jump.update(dt)
    if (state.progress < 0.5) updateCar(state, this.input, dt, busy || state.mode === 'robot', profile.drive)
    else updateRobot(state, this.input, this.camera, dt, busy || state.mode === 'car', this.character.robotOffset, profile.robot, jump.airborne)
    resolveCircleCollisions(state, this.world.colliders, this.character.robotOffset, profile)

    const pose = gait.update(dt, state.speed, state.yawRate, this.input.running, state.progress >= 1, jump)
    if (jump.tookOff) effects.takeoff()
    if (jump.landed) effects.land()
    while (gait.events.length) effects.addFootstep(gait.events.pop() as 'R' | 'L', gait.run)

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

    this.cameraRig.update(dt, state, model.root, this.input.driving && !busy && state.mode === 'car')
    this.world.update(this.camera, this.cameraRig.focusPoint(state, model.root))
    effects.shakeCamera(this.camera, dt)
    this.pipeline.render()
  }

  dispose(): void {
    this.input.dispose()
    this.cameraRig.dispose()
  }
}
