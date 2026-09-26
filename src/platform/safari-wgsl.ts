import type { WebGPURenderer } from 'three/webgpu'

type WgslVariable = {
  type: string
  name: string
  count?: number | null
}

type WgslStageData = {
  flow: string
  [key: string]: unknown
}

type WgslBuilder = {
  vars: Record<string, WgslVariable[] | undefined>
  getCodes(shaderStage: string): string
  getVar(type: string, name: string, count?: number | null, qualifier?: string): string
  getVars(shaderStage: string, global?: boolean): string
  _getWGSLVertexCode(shaderData: WgslStageData): string
  _getWGSLFragmentCode(shaderData: WgslStageData): string
}

type BackendWithNodeBuilder = {
  createNodeBuilder(object: unknown, renderer: unknown): unknown
}

type LocalVarsByStage = Record<string, string>

const SAFARI_VARIABLE_BUDGET_BYTES = 7_680

/**
 * Safari/Metal enforces an 8 KiB limit both on module-private shader storage
 * and on the variables owned by a single function. Three r186 normally puts
 * every TSL flow temporary in module-scope `var<private>` storage. Moving all
 * main-only temporaries into `main()` merely trades one Safari limit for the
 * other, so Safari needs the temporary set split across both storage classes.
 *
 * Helper-visible variables must remain private. Main-only variables are then
 * moved to `main()` only until both sides fit under a conservative 7.5 KiB
 * budget. Shader math and generated expressions are unchanged; Chromium keeps
 * Three's stock code generator.
 */
export function installSafariWgslPrivateMemoryWorkaround(renderer: WebGPURenderer): void {
  if (!isSafariBrowser()) return

  const backend = renderer.backend as unknown as BackendWithNodeBuilder
  if (typeof backend.createNodeBuilder !== 'function') return

  const createNodeBuilder = backend.createNodeBuilder.bind(backend)
  backend.createNodeBuilder = (object, rendererForBuilder) => {
    const builder = createNodeBuilder(object, rendererForBuilder) as WgslBuilder
    patchBuilder(builder)
    return builder
  }
}

export function isSafariBrowser(
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
  vendor = typeof navigator === 'undefined' ? '' : navigator.vendor,
): boolean {
  if (vendor !== 'Apple Computer, Inc.') return false
  return /Safari\//.test(userAgent) && !/(?:CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Chromium|Edg\/|OPR\/)/.test(userAgent)
}

export function splitWgslFlowVariables(
  variables: readonly WgslVariable[],
  helperCode: string,
  budgetBytes = SAFARI_VARIABLE_BUDGET_BYTES,
): { global: WgslVariable[]; local: WgslVariable[] } {
  const global: WgslVariable[] = []
  const movable: WgslVariable[] = []

  for (const variable of variables) {
    const target = containsIdentifier(helperCode, variable.name) ? global : movable
    target.push(variable)
  }

  let globalBytes = totalVariableBytes(global)
  let localBytes = totalVariableBytes(movable)

  if (localBytes > budgetBytes) {
    const candidates = movable
      .map((variable, index) => ({ variable, index, bytes: estimateVariableBytes(variable) }))
      .sort((a, b) => b.bytes - a.bytes || a.index - b.index)

    const moveToGlobal = new Set<WgslVariable>()

    for (const candidate of candidates) {
      if (localBytes <= budgetBytes) break
      if (globalBytes + candidate.bytes > budgetBytes) continue

      moveToGlobal.add(candidate.variable)
      globalBytes += candidate.bytes
      localBytes -= candidate.bytes
    }

    if (moveToGlobal.size > 0) {
      const local: WgslVariable[] = []
      for (const variable of movable) {
        if (moveToGlobal.has(variable)) global.push(variable)
        else local.push(variable)
      }
      return { global, local }
    }
  }

  return { global, local: movable }
}

export function estimateVariableBytes(variable: WgslVariable): number {
  const elementBytes = estimateTypeBytes(variable.type)
  if (variable.count == null) return elementBytes

  // WGSL array elements use a stride rounded up to the element alignment. The
  // conservative 16-byte floor covers the vector-heavy TSL temporaries Three
  // emits and avoids underestimating Safari's validator accounting.
  const stride = roundUp(elementBytes, Math.min(16, Math.max(4, elementAlignment(variable.type))))
  return stride * variable.count
}

function patchBuilder(builder: WgslBuilder): void {
  const localVars: LocalVarsByStage = {}
  const originalGetVars = builder.getVars.bind(builder)
  const originalVertexCode = builder._getWGSLVertexCode.bind(builder)
  const originalFragmentCode = builder._getWGSLFragmentCode.bind(builder)

  builder.getVars = (shaderStage, global = false) => {
    if (!global) return originalGetVars(shaderStage, false)

    const variables = builder.vars[shaderStage] ?? []
    const { global: globalVars, local } = splitWgslFlowVariables(variables, builder.getCodes(shaderStage))

    localVars[shaderStage] = declarations(builder, local, '')
    return declarations(builder, globalVars, '<private>')
  }

  builder._getWGSLVertexCode = (shaderData) => originalVertexCode(withLocalVars(shaderData, localVars.vertex))
  builder._getWGSLFragmentCode = (shaderData) => originalFragmentCode(withLocalVars(shaderData, localVars.fragment))
}

function declarations(builder: WgslBuilder, variables: readonly WgslVariable[], qualifier: string): string {
  return variables
    .map((variable) => `${builder.getVar(variable.type, variable.name, variable.count ?? null, qualifier)};`)
    .join('\n')
}

function withLocalVars(shaderData: WgslStageData, localDeclarations = ''): WgslStageData {
  if (!localDeclarations) return shaderData

  const indented = localDeclarations.replaceAll('\n', '\n\t')
  return {
    ...shaderData,
    flow: `// Safari-local TSL vars\n\t${indented}\n\n\t${shaderData.flow}`,
  }
}

function containsIdentifier(code: string, identifier: string): boolean {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^A-Za-z0-9_])${escaped}(?=$|[^A-Za-z0-9_])`).test(code)
}

function totalVariableBytes(variables: readonly WgslVariable[]): number {
  return variables.reduce((sum, variable) => sum + estimateVariableBytes(variable), 0)
}

function estimateTypeBytes(type: string): number {
  const normalized = type.toLowerCase().replaceAll(' ', '')

  if (/^(?:bool|int|uint|float|i32|u32|f32)$/.test(normalized)) return 4
  if (/^(?:vec2|ivec2|uvec2|bvec2|vec2<.*>)$/.test(normalized)) return 8
  if (/^(?:vec3|ivec3|uvec3|bvec3|color|vec3<.*>)$/.test(normalized)) return 16
  if (/^(?:vec4|ivec4|uvec4|bvec4|vec4<.*>)$/.test(normalized)) return 16
  if (/^(?:mat2|mat2x2|mat2x2<.*>)$/.test(normalized)) return 16
  if (/^(?:mat3|mat3x3|mat3x3<.*>)$/.test(normalized)) return 48
  if (/^(?:mat4|mat4x4|mat4x4<.*>)$/.test(normalized)) return 64

  const matrix = normalized.match(/^mat([2-4])x([2-4])(?:<.*>)?$/)
  if (matrix) {
    const columns = Number(matrix[1])
    const rows = Number(matrix[2])
    const columnBytes = rows === 2 ? 8 : 16
    return columns * columnBytes
  }

  // Unknown node types are uncommon in Three's flow-variable list. Counting
  // them as a vec4 is safer than underestimating a scalar-sized temporary.
  return 16
}

function elementAlignment(type: string): number {
  const normalized = type.toLowerCase().replaceAll(' ', '')
  if (/^(?:bool|int|uint|float|i32|u32|f32)$/.test(normalized)) return 4
  if (/^(?:vec2|ivec2|uvec2|bvec2|vec2<.*>)$/.test(normalized)) return 8
  return 16
}

function roundUp(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment
}
