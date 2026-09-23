import { Euler, Matrix4, PerspectiveCamera, RenderPipeline, Scene, Timer, Vector3, WebGPURenderer } from 'three/webgpu'
import { bakeEnvironment, configureRenderer, createPostPipeline } from '../rendering/look'
import { createCybertruck, type CybertruckAsset } from '../content/cybertruck'
import { createDesertWorld } from '../worlds/desert'
import { FollowCamera } from './follow-camera'
import { GameInput } from './input'
import { advanceTransformation, isTransforming, requestTransformation, resolveCircleCollisions, updateCar, updateRobot } from './movement'
import { createMotionState, type Form } from './types'
import { RobotJump } from './jump'

export class GameSession {
  readonly scene = new Scene()
  readonly camera: PerspectiveCamera
  readonly environment = createDesertWorld(this.scene)
  readonly player: ReturnType<typeof createCybertruck>
  readonly bot: ReturnType<typeof createCybertruck>['model']
  readonly world = this.environment.world
  readonly gait: ReturnType<typeof createCybertruck>['gait']
  readonly state = createMotionState()
  readonly effects: ReturnType<typeof createCybertruck>['effects']
  readonly cameraRig: FollowCamera
  readonly input: GameInput
  readonly pipeline: RenderPipeline
  private readonly timer = new Timer()
  private readonly jump = new RobotJump()
  private readonly up = new Vector3(0, 1, 0)
  private readonly suspensionRotation = new Matrix4()
  private readonly suspensionInverse = new Matrix4().makeTranslation(0, -0.7, 0)
  private readonly suspensionEuler = new Euler()
  private readonly onFrameError: (error: Error) => void

  constructor(renderer: WebGPURenderer, camera: PerspectiveCamera, asset: CybertruckAsset, onFrameError: (error: Error) => void) {
    this.player = createCybertruck(asset, this.environment.contactEffects)
    this.bot = this.player.model
    this.gait = this.player.gait
    this.effects = this.player.effects
    this.camera = camera
    this.onFrameError = onFrameError
    configureRenderer(renderer)
    this.scene.add(this.bot.root, this.effects.thrusters.object)
    this.bot.pose(0, null)

    bakeEnvironment(renderer, this.scene, this.environment.environmentScene())

    this.cameraRig = new FollowCamera(this.camera, renderer.domElement, this.state.yaw, this.player.robotOffset)
    this.input = new GameInput(renderer.domElement, () => this.toggleForm(), () => this.effects.audio.resume())
    this.pipeline = createPostPipeline(renderer, this.scene, this.camera)
    this.cameraRig.update(1 / 60, this.state, this.bot.root)
    this.world.update(this.camera, this.cameraRig.focusPoint(this.state, this.bot.root))
  }

  selectForm(form: Form): void {
    if (this.jump.active) return
    requestTransformation(this.state, form)
  }

  toggleForm(): void {
    this.selectForm(this.state.mode === 'car' ? 'robot' : 'car')
  }

  frame(): void {
    try {
      this.updateAndRender()
    } catch (error) {
      this.onFrameError(error instanceof Error ? error : new Error(String(error)))
    }
  }

  private updateAndRender(): void {
    this.timer.update()
    const dt = Math.max(1 / 240, Math.min(this.timer.getDelta(), 1 / 30))
    const state = this.state
    const previous = advanceTransformation(state, dt, this.player.transformationDuration)
    const busy = isTransforming(state)
    if (this.input.consumeJump() && !busy && state.mode === 'robot' && state.progress >= 1) this.jump.start()
    const jump = this.jump.update(dt)
    if (state.progress < 0.5) updateCar(state, this.input, dt, busy || state.mode === 'robot')
    else updateRobot(state, this.input, this.camera, dt, busy || state.mode === 'car', this.player.robotOffset, jump.airborne)
    resolveCircleCollisions(state, this.world.colliders, this.player.robotOffset)

    const pose = this.gait.update(dt, state.speed, state.yawRate, this.input.running, state.progress >= 1, jump)
    if (jump.tookOff) this.effects.takeoff()
    if (jump.landed) this.effects.land()
    while (this.gait.events.length) this.effects.addFootstep(this.gait.events.pop() as 'R' | 'L', this.gait.run)

    this.bot.steer = state.steer
    this.bot.spin = state.spin
    const vibration = Math.sin(performance.now() * 0.013) * 0.004 * Math.min(Math.abs(state.speed) / 20, 1)
    this.suspensionEuler.set(state.pitch, 0, state.roll)
    this.suspensionRotation.makeRotationFromEuler(this.suspensionEuler)
    this.bot.suspension.makeTranslation(0, 0.7 + vibration, 0)
      .multiply(this.suspensionRotation)
      .multiply(this.suspensionInverse)
    this.bot.root.position.copy(state.pos)
    this.bot.root.quaternion.setFromAxisAngle(this.up, state.yaw)
    this.bot.pose(state.progress, pose)
    this.effects.timeline(previous, state.progress)
    this.effects.update(dt, state)

    this.cameraRig.update(dt, state, this.bot.root, this.input.driving && !busy && state.mode === 'car')
    this.world.update(this.camera, this.cameraRig.focusPoint(state, this.bot.root))
    this.effects.shakeCamera(this.camera, dt)
    this.pipeline.render()
  }

  dispose(): void {
    this.input.dispose()
    this.cameraRig.dispose()
  }
}
