import {
  ACESFilmicToneMapping, PCFShadowMap, Euler, Matrix4, PerspectiveCamera, PMREMGenerator,
  RenderPipeline, Scene, Timer, Vector3, WebGPURenderer,
} from 'three/webgpu'
import { pass, uv, float, smoothstep } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { createCybertruck } from '../content/cybertruck'
import { createDesertWorld } from '../worlds/desert'
import { FollowCamera } from './follow-camera'
import { GameInput } from './input'
import { advanceTransformation, isTransforming, resolveCircleCollisions, updateCar, updateRobot } from './movement'
import { createMotionState, type Form } from './types'

export class GameSession {
  readonly scene = new Scene()
  readonly camera: PerspectiveCamera
  readonly environment = createDesertWorld(this.scene)
  readonly player = createCybertruck(this.environment.contactEffects)
  readonly bot = this.player.model
  readonly world = this.environment.world
  readonly gait = this.player.gait
  readonly state = createMotionState()
  readonly effects = this.player.effects
  readonly cameraRig: FollowCamera
  readonly input: GameInput
  readonly pipeline: RenderPipeline
  private readonly timer = new Timer()
  private readonly up = new Vector3(0, 1, 0)
  private readonly suspensionRotation = new Matrix4()
  private readonly suspensionInverse = new Matrix4().makeTranslation(0, -0.7, 0)
  private readonly suspensionEuler = new Euler()
  private readonly onFrameError: (error: Error) => void

  constructor(renderer: WebGPURenderer, camera: PerspectiveCamera, onFrameError: (error: Error) => void) {
    this.camera = camera
    this.onFrameError = onFrameError
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.92
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = PCFShadowMap
    this.scene.add(this.bot.root)
    this.bot.pose(0, null)

    const pmrem = new PMREMGenerator(renderer)
    this.scene.environment = pmrem.fromScene(this.environment.environmentScene(), 0, 0.1, 200).texture
    this.scene.environmentIntensity = 0.95
    pmrem.dispose()

    this.cameraRig = new FollowCamera(this.camera, renderer.domElement, this.state.yaw, this.player.robotOffset)
    this.input = new GameInput(renderer.domElement, () => this.toggleForm(), () => this.effects.audio.resume())
    const color = pass(this.scene, this.camera).getTextureNode('output')
    const vignette = float(1).sub(smoothstep(0.45, 0.95, uv().sub(0.5).length()).mul(0.35))
    this.pipeline = new RenderPipeline(renderer)
    this.pipeline.outputNode = color.add(bloom(color, 0.32, 0.45, 0.92)).mul(vignette)
    this.cameraRig.update(1 / 60, this.state, this.bot.root)
    this.world.update(this.camera, this.cameraRig.focusPoint(this.state, this.bot.root))
  }

  selectForm(form: Form): void {
    if (form === this.state.mode) return
    this.state.mode = form
    this.state.target = form === 'robot' ? 1 : 0
  }

  toggleForm(): void { this.selectForm(this.state.mode === 'car' ? 'robot' : 'car') }

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
    if (state.progress < 0.5) updateCar(state, this.input, dt, busy || state.mode === 'robot')
    else updateRobot(state, this.input, this.camera, dt, busy || state.mode === 'car', this.player.robotOffset)
    resolveCircleCollisions(state, this.world.colliders, this.player.robotOffset)

    const pose = this.gait.update(dt, state.speed, state.yawRate, this.input.running, state.progress >= 1)
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
