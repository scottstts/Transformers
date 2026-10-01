// Packs the citadel's raw Blender GLB into the shipped GLB: each primitive is reordered for the GPU
// vertex cache and fetch, then its float attributes and indices are compressed losslessly with
// EXT_meshopt_compression (no quantisation, no filters). three decodes it with GLTFLoader's
// MeshoptDecoder. Nodes, extras and geometry are otherwise unchanged.
// Usage: node tools/citadel-pack.mjs <raw.glb> <out.glb>
import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import { MeshoptEncoder } from 'meshoptimizer'

const EXT = 'EXT_meshopt_compression'
const GLB_MAGIC = 0x46546c67
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942
const FLOAT = 5126
const ARRAY_BUFFER = 34962
const ELEMENT_ARRAY_BUFFER = 34963

const [input, output] = process.argv.slice(2)
if (!input || !output) throw new Error('usage: node tools/citadel-pack.mjs <raw.glb> <out.glb>')

function readGlb(path) {
  const file = fs.readFileSync(path)
  if (file.readUInt32LE(0) !== GLB_MAGIC) throw new Error(`${path} is not a GLB`)
  let offset = 12
  let json
  let bin
  while (offset < file.length) {
    const length = file.readUInt32LE(offset)
    const type = file.readUInt32LE(offset + 4)
    const data = file.subarray(offset + 8, offset + 8 + length)
    if (type === CHUNK_JSON) json = JSON.parse(data.toString('utf8'))
    else if (type === CHUNK_BIN) bin = data
    offset += 8 + length
  }
  return { json, bin }
}

function writeGlb(path, json, bin) {
  const pad = (buffer, fill) => Buffer.concat([buffer, Buffer.alloc((4 - (buffer.length % 4)) % 4, fill)])
  const jsonChunk = pad(Buffer.from(JSON.stringify(json), 'utf8'), 0x20)
  const binChunk = pad(bin, 0)
  const header = Buffer.alloc(12)
  header.writeUInt32LE(GLB_MAGIC, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8)
  const chunk = (type, data) => {
    const head = Buffer.alloc(8)
    head.writeUInt32LE(data.length, 0)
    head.writeUInt32LE(type, 4)
    return Buffer.concat([head, data])
  }
  fs.writeFileSync(path, Buffer.concat([header, chunk(CHUNK_JSON, jsonChunk), chunk(CHUNK_BIN, binChunk)]))
}

function accessorBytes(json, bin, index, elementSize) {
  const accessor = json.accessors[index]
  const view = json.bufferViews[accessor.bufferView]
  if (view.byteStride && view.byteStride !== elementSize) throw new Error(`accessor ${index} is interleaved`)
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  return new Uint8Array(bin.buffer, bin.byteOffset + start, accessor.count * elementSize).slice()
}

await MeshoptEncoder.ready
const { json, bin } = readGlb(input)
if (json.buffers.length !== 1 || json.extensionsUsed?.length) throw new Error('expected one plain buffer and no extensions')

const accessors = []
const bufferViews = []
const pieces = []
let packedLength = 0
let fallbackLength = 0

function addView(raw, count, byteStride, mode, target) {
  const encoded = MeshoptEncoder.encodeGltfBuffer(raw, count, byteStride, mode)
  const view = {
    buffer: 1, byteOffset: fallbackLength, byteLength: raw.byteLength, target,
    extensions: { [EXT]: { buffer: 0, byteOffset: packedLength, byteLength: encoded.byteLength, byteStride, mode, count } },
  }
  if (target === ARRAY_BUFFER) view.byteStride = byteStride
  pieces.push(Buffer.from(encoded.buffer, encoded.byteOffset, encoded.byteLength))
  const padding = (4 - (encoded.byteLength % 4)) % 4
  if (padding) pieces.push(Buffer.alloc(padding))
  packedLength += encoded.byteLength + padding
  fallbackLength += raw.byteLength + ((4 - (raw.byteLength % 4)) % 4)
  bufferViews.push(view)
  return bufferViews.length - 1
}

let triangles = 0
for (const mesh of json.meshes) {
  for (const primitive of mesh.primitives) {
    if ((primitive.mode ?? 4) !== 4 || primitive.indices === undefined) throw new Error(`${mesh.name}: not indexed triangles`)
    const names = Object.keys(primitive.attributes)
    for (const name of names) {
      const accessor = json.accessors[primitive.attributes[name]]
      if (accessor.componentType !== FLOAT || accessor.type !== 'VEC3') throw new Error(`${mesh.name}.${name}: expected float VEC3`)
    }
    const indexAccessor = json.accessors[primitive.indices]
    const indexSize = indexAccessor.componentType === 5125 ? 4 : 2
    const indexRaw = accessorBytes(json, bin, primitive.indices, indexSize)
    const indices = indexSize === 4
      ? new Uint32Array(indexRaw.buffer)
      : Uint32Array.from(new Uint16Array(indexRaw.buffer))
    triangles += indices.length / 3
    // Vertex cache order, then vertex fetch order; drops vertices no triangle references.
    const [remap, unique] = MeshoptEncoder.reorderMesh(indices, true, false)
    const vertexCount = json.accessors[primitive.attributes[names[0]]].count
    const attributes = {}
    for (const name of names) {
      const source = new Float32Array(accessorBytes(json, bin, primitive.attributes[name], 12).buffer)
      const target = new Float32Array(unique * 3)
      for (let i = 0; i < vertexCount; i++) {
        const to = remap[i]
        if (to === 0xffffffff) continue
        target[to * 3] = source[i * 3]
        target[to * 3 + 1] = source[i * 3 + 1]
        target[to * 3 + 2] = source[i * 3 + 2]
      }
      const accessor = { bufferView: addView(new Uint8Array(target.buffer), unique, 12, 'ATTRIBUTES', ARRAY_BUFFER), componentType: FLOAT, count: unique, type: 'VEC3' }
      if (name === 'POSITION') {
        accessor.min = [Infinity, Infinity, Infinity]
        accessor.max = [-Infinity, -Infinity, -Infinity]
        for (let i = 0; i < target.length; i++) {
          accessor.min[i % 3] = Math.min(accessor.min[i % 3], target[i])
          accessor.max[i % 3] = Math.max(accessor.max[i % 3], target[i])
        }
      }
      accessors.push(accessor)
      attributes[name] = accessors.length - 1
    }
    const wide = unique > 0xffff
    const packedIndices = wide ? indices : Uint16Array.from(indices)
    accessors.push({
      bufferView: addView(new Uint8Array(packedIndices.buffer), indices.length, wide ? 4 : 2, 'TRIANGLES', ELEMENT_ARRAY_BUFFER),
      componentType: wide ? 5125 : 5123, count: indices.length, type: 'SCALAR',
    })
    primitive.attributes = attributes
    primitive.indices = accessors.length - 1
  }
}

json.accessors = accessors
json.bufferViews = bufferViews
json.buffers = [{ byteLength: packedLength }, { byteLength: fallbackLength, extensions: { [EXT]: { fallback: true } } }]
json.extensionsUsed = [EXT]
json.extensionsRequired = [EXT]
writeGlb(output, json, Buffer.concat(pieces))
console.log(JSON.stringify({ output, meshes: json.meshes.length, triangles, raw: bin.length, packed: fs.statSync(output).size }))
