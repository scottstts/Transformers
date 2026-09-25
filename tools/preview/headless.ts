import { create, globals } from 'webgpu'
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { WebGPURenderer } from 'three/webgpu'

/**
 * A WebGPURenderer on Dawn with a stand-in canvas: the "swap chain" texture is
 * an ordinary GPU texture that can be read back after a frame.
 */
export async function createHeadlessRenderer(width: number, height: number) {
  Object.assign(globalThis, globals)
  const gpu = create([])
  Object.defineProperty(globalThis.navigator, 'gpu', { value: gpu, configurable: true })
  let device: GPUDevice
  let format: GPUTextureFormat = 'rgba8unorm'
  let target: GPUTexture | null = null
  const context = {
    configure(config: GPUCanvasConfiguration) { device = config.device; format = config.format },
    unconfigure() {},
    getCurrentTexture() {
      target ??= device.createTexture({
        size: [width, height], format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING,
      })
      return target
    },
  }
  const canvas = {
    width, height, style: {},
    getContext: () => context,
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
  }
  ;(gpu as unknown as { getPreferredCanvasFormat: () => string }).getPreferredCanvasFormat ??= () => 'rgba8unorm'
  const renderer = new WebGPURenderer({ canvas: canvas as unknown as HTMLCanvasElement, antialias: true })
  Object.assign(renderer, { _getFallback: null })
  renderer.onError = (info) => { throw new Error(`GPU error: ${(info as unknown as { message?: string }).message ?? String(info)}`) }
  await renderer.init()
  renderer.setSize(width, height, false)

  /** The last frame as tightly packed RGBA rows. */
  async function grab(): Promise<Uint8Array> {
    const dev = device
    const tex = target!
    const bytesPerRow = Math.ceil(width * 4 / 256) * 256
    const buffer = dev.createBuffer({ size: bytesPerRow * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
    const enc = dev.createCommandEncoder()
    enc.copyTextureToBuffer({ texture: tex }, { buffer, bytesPerRow }, [width, height])
    dev.queue.submit([enc.finish()])
    await buffer.mapAsync(GPUMapMode.READ)
    const src = new Uint8Array(buffer.getMappedRange())
    const out = new Uint8Array(width * height * 4)
    const bgra = format.startsWith('bgra')
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const s = y * bytesPerRow + x * 4
        const d = (y * width + x) * 4
        out[d] = src[s + (bgra ? 2 : 0)]
        out[d + 1] = src[s + 1]
        out[d + 2] = src[s + (bgra ? 0 : 2)]
        out[d + 3] = 255
      }
    }
    buffer.unmap()
    buffer.destroy()
    return out
  }

  async function capture(path: string): Promise<void> {
    const dev = device
    const tex = target!
    const bytesPerRow = Math.ceil(width * 4 / 256) * 256
    const buffer = dev.createBuffer({ size: bytesPerRow * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
    const enc = dev.createCommandEncoder()
    enc.copyTextureToBuffer({ texture: tex }, { buffer, bytesPerRow }, [width, height])
    dev.queue.submit([enc.finish()])
    await buffer.mapAsync(GPUMapMode.READ)
    const src = new Uint8Array(buffer.getMappedRange())
    const rows = Buffer.alloc((width * 4 + 1) * height)
    const bgra = format.startsWith('bgra')
    for (let y = 0; y < height; y++) {
      rows[y * (width * 4 + 1)] = 0
      for (let x = 0; x < width; x++) {
        const s = y * bytesPerRow + x * 4
        const d = y * (width * 4 + 1) + 1 + x * 4
        rows[d] = src[s + (bgra ? 2 : 0)]
        rows[d + 1] = src[s + 1]
        rows[d + 2] = src[s + (bgra ? 0 : 2)]
        rows[d + 3] = 255
      }
    }
    buffer.unmap()
    writeFileSync(path, png(width, height, rows))
  }

  return { renderer, capture, grab }
}

/** Write tightly packed RGBA rows as a PNG. */
export function writePng(path: string, width: number, height: number, rgba: Uint8Array): void {
  const rows = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    rows[y * (width * 4 + 1)] = 0
    rows.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1)
  }
  writeFileSync(path, png(width, height, rows))
}

function png(width: number, height: number, rows: Buffer): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td) >>> 0)
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})

function crc32(buf: Buffer): number {
  let c = -1
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8)
  return c ^ -1
}
