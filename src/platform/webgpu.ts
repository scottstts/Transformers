import { WebGPURenderer, type PerspectiveCamera } from 'three/webgpu'
import { showBootError, setBootStage } from './boot-ui'

type BackendWithDevice = { isWebGPUBackend?: boolean; device?: GPUDevice }

export class GpuHost {
  private readonly camera: PerspectiveCamera
  private readonly mount: HTMLElement
  readonly renderer: WebGPURenderer
  private readonly fatal: Promise<never>
  private rejectFatal!: (error: Error) => void
  private booting = true
  private stopped = false
  private resizeFrame = 0
  private readonly resize = (): void => {
    if (this.resizeFrame) return
    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = 0
      this.commitSize()
    })
  }

  constructor(camera: PerspectiveCamera, mount: HTMLElement) {
    this.camera = camera
    this.mount = mount
    if (!navigator.gpu) throw new Error('WebGPU is not supported by this browser')
    const renderer = new WebGPURenderer({ antialias: true })
    // Three's default WebGPURenderer installs a WebGL fallback. This game is WebGPU only.
    Object.assign(renderer, { _getFallback: null })
    const originalLost = renderer.onDeviceLost.bind(renderer)
    const originalError = renderer.onError.bind(renderer)
    renderer.onDeviceLost = (info) => {
      originalLost(info)
      this.fail(new Error(`WebGPU device lost: ${info.message} (${info.reason ?? 'unknown'})`))
    }
    renderer.onError = (info) => {
      originalError(info)
      const fault = info as unknown as { type?: string; message?: string }
      this.fail(new Error(`WebGPU ${fault.type ?? 'error'}: ${fault.message ?? String(info)}`))
    }
    this.renderer = renderer
    this.fatal = new Promise<never>((_resolve, reject) => { this.rejectFatal = reject })
    this.mount.appendChild(renderer.domElement)
    window.addEventListener('resize', this.resize)
    this.commitSize()
  }

  async observe<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([promise, this.fatal])
  }

  async initialize(): Promise<void> {
    setBootStage('Initializing WebGPU')
    await this.observe(this.renderer.init())
    const backend = this.renderer.backend as BackendWithDevice
    if (!backend.isWebGPUBackend || !backend.device) throw new Error('A WebGPU device could not be initialized')
    // r186 forwards uncaptured GPU errors through renderer.onError.
  }

  async waitForGpu(): Promise<void> {
    const device = (this.renderer.backend as BackendWithDevice).device
    if (!device) throw new Error('WebGPU device is unavailable')
    await this.observe(device.queue.onSubmittedWorkDone())
    await this.observe(new Promise<void>((resolve) => setTimeout(resolve, 0)))
  }

  ready(): void { this.booting = false }

  fail(error: Error): void {
    if (this.stopped) return
    this.stopped = true
    this.renderer.setAnimationLoop(null)
    if (this.booting) this.rejectFatal(error)
    else showBootError(error)
  }

  private commitSize(): void {
    const width = window.innerWidth
    const height = window.innerHeight
    if (width <= 0 || height <= 0) return
    const maxPixels = 4_000_000
    const dpr = Math.min(window.devicePixelRatio, 1.7, Math.sqrt(maxPixels / (width * height)))
    this.renderer.setDrawingBufferSize(width, height, Number.isFinite(dpr) && dpr > 0 ? dpr : 1)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize)
    if (this.resizeFrame) cancelAnimationFrame(this.resizeFrame)
    this.renderer.setAnimationLoop(null)
    this.renderer.dispose()
  }
}
