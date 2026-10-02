import type { WebGPURenderer } from 'three/webgpu'

export interface FrameTiming {
  gpu: number | null
  gpu95: number | null
  submit: number
  complete: number
  /** Mean per frame with CPU submissions and GPU execution allowed to overlap. */
  throughput: number
  gpuThroughput: number | null
}

/**
 * Timestamp one whole queue interval. Three's per-pass totals can overlap on
 * Metal and must not be presented as a frame duration. This interval includes
 * queue idle time while JS submits, alongside separate CPU and wall timings.
 */
export async function frameTiming(renderer: WebGPURenderer, draw: () => void, frames = 40): Promise<FrameTiming> {
  const backend = renderer.backend as unknown as { device: GPUDevice; trackTimestamp: boolean }
  const { device } = backend
  const gpu: number[] = [], submit: number[] = [], complete: number[] = []
  const timestamp = device.features.has('timestamp-query')
  const queries = timestamp ? device.createQuerySet({ type: 'timestamp', count: 4 }) : null
  const resolve = timestamp ? device.createBuffer({ size: 32, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }) : null
  const read = timestamp ? device.createBuffer({ size: 32, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }) : null
  // Empty passes are elided by Metal/Dawn, including their timestamp writes.
  const marker = timestamp ? device.createBuffer({ size: 4, usage: GPUBufferUsage.STORAGE }) : null
  const pipeline = timestamp ? device.createComputePipeline({
    layout: 'auto', compute: { module: device.createShaderModule({ code: '@group(0) @binding(0) var<storage, read_write> mark: atomic<u32>; @compute @workgroup_size(1) fn main() { atomicAdd(&mark, 1u); }' }), entryPoint: 'main' },
  }) : null
  const bind = pipeline ? device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: marker! } }] }) : null
  let throughput: number, gpuThroughput: number | null = null
  const boundary = (index: number): void => {
    const encoder = device.createCommandEncoder()
    const pass = encoder.beginComputePass({ timestampWrites: { querySet: queries!, beginningOfPassWriteIndex: index, endOfPassWriteIndex: index + 1 } })
    pass.setPipeline(pipeline!); pass.setBindGroup(0, bind!); pass.dispatchWorkgroups(1); pass.end()
    if (index === 2) {
      encoder.resolveQuerySet(queries!, 0, 4, resolve!, 0)
      encoder.copyBufferToBuffer(resolve!, 0, read!, 0, 32)
    }
    device.queue.submit([encoder.finish()])
  }
  if (backend.trackTimestamp) await renderer.resolveTimestampsAsync('render')
  try {
    for (let i = 0; i < frames + 5; i++) {
      const start = performance.now()
      if (timestamp) boundary(0)
      draw()
      if (timestamp) boundary(2)
      const queued = performance.now()
      await device.queue.onSubmittedWorkDone()
      const done = performance.now()
      let elapsed: number | null = null
      if (read) {
        await read.mapAsync(GPUMapMode.READ)
        const ticks = new BigUint64Array(read.getMappedRange())
        elapsed = Number(ticks[2] - ticks[1]) / 1e6
        read.unmap()
      }
      // Drain Three's diagnostic pool, but never sum its overlapping passes.
      if (backend.trackTimestamp) await renderer.resolveTimestampsAsync('render')
      if (i < 5) continue
      submit.push(queued - start)
      complete.push(done - start)
      if (elapsed !== null && Number.isFinite(elapsed) && elapsed > 0) gpu.push(elapsed)
    }
    // Per-frame fences expose latency but serialize the CPU and GPU. Also
    // measure steady throughput with ordinary queued submission; do not
    // mistake the serialized interval for the render loop's frame rate.
    const batchStart = performance.now()
    if (timestamp) boundary(0)
    for (let i = 0; i < frames; i++) draw()
    if (timestamp) boundary(2)
    await device.queue.onSubmittedWorkDone()
    throughput = (performance.now() - batchStart) / frames
    if (read) {
      await read.mapAsync(GPUMapMode.READ)
      const ticks = new BigUint64Array(read.getMappedRange())
      const span = Number(ticks[2] - ticks[1]) / 1e6 / frames
      if (Number.isFinite(span) && span > 0) gpuThroughput = span
      read.unmap()
    }
    if (backend.trackTimestamp) await renderer.resolveTimestampsAsync('render')
  } finally {
    queries?.destroy(); resolve?.destroy(); read?.destroy(); marker?.destroy()
  }
  const quantile = (values: number[], q: number): number => values.sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * q))]
  return { gpu: gpu.length ? quantile(gpu, 0.5) : null, gpu95: gpu.length ? quantile(gpu, 0.95) : null, submit: quantile(submit, 0.5), complete: quantile(complete, 0.5), throughput, gpuThroughput }
}

export function printTiming(label: string, timing: FrameTiming): void {
  const gpu = timing.gpu === null ? 'unavailable' : `${timing.gpu.toFixed(2)} ms (p95 ${timing.gpu95!.toFixed(2)})`
  console.log(`${label}: GPU queue span ${gpu}; CPU submit ${timing.submit.toFixed(2)} ms; queue-complete ${timing.complete.toFixed(2)} ms`)
  console.log(`  queued average: ${timing.throughput.toFixed(2)} ms/frame wall; GPU queue ${timing.gpuThroughput?.toFixed(2) ?? 'unavailable'} ms/frame`)
}

/** Reproducible tools' particle placement and garrison clocks; restore Math.random on return. */
export function seedRandom(seed: number): () => void {
  const original = Math.random
  let state = seed >>> 0
  Math.random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
  return () => { Math.random = original }
}
