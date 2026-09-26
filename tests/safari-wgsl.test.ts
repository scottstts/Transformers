import { describe, expect, it } from 'vitest'
import { estimateVariableBytes, isSafariBrowser, splitWgslFlowVariables } from '../src/platform/safari-wgsl'

describe('Safari WGSL private-memory workaround', () => {
  it('targets desktop and iOS Safari without changing desktop Chrome', () => {
    const macSafari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15'
    const iosSafari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1'
    const macChrome = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36'

    expect(isSafariBrowser(macSafari, 'Apple Computer, Inc.')).toBe(true)
    expect(isSafariBrowser(iosSafari, 'Apple Computer, Inc.')).toBe(true)
    expect(isSafariBrowser(macChrome, 'Google Inc.')).toBe(false)
  })

  it('keeps helper-referenced variables private', () => {
    const variables = [
      { type: 'vec3', name: 'nodeVar1' },
      { type: 'vec3', name: 'nodeVar10' },
      { type: 'float', name: 'nodeVar22' },
    ]
    const result = splitWgslFlowVariables(variables, 'fn lighting() { nodeVar10 = vec3<f32>( 1.0 ); }')

    expect(result.global.map((variable) => variable.name)).toEqual(['nodeVar10'])
    expect(result.local.map((variable) => variable.name)).toEqual(['nodeVar1', 'nodeVar22'])
  })

  it('balances main-only temporaries between private and function storage', () => {
    const variables = Array.from({ length: 10 }, (_, index) => ({
      type: 'mat4',
      name: `nodeVar${index}`,
    }))

    const result = splitWgslFlowVariables(variables, '', 384)
    const globalBytes = result.global.reduce((sum, variable) => sum + estimateVariableBytes(variable), 0)
    const localBytes = result.local.reduce((sum, variable) => sum + estimateVariableBytes(variable), 0)

    expect(globalBytes).toBeLessThanOrEqual(384)
    expect(localBytes).toBeLessThanOrEqual(384)
    expect(result.global.length).toBeGreaterThan(0)
    expect(result.local.length).toBeGreaterThan(0)
  })

  it('accounts conservatively for common TSL scalar, vector, matrix and array types', () => {
    expect(estimateVariableBytes({ type: 'float', name: 'a' })).toBe(4)
    expect(estimateVariableBytes({ type: 'vec2', name: 'b' })).toBe(8)
    expect(estimateVariableBytes({ type: 'vec3', name: 'c' })).toBe(16)
    expect(estimateVariableBytes({ type: 'mat3', name: 'd' })).toBe(48)
    expect(estimateVariableBytes({ type: 'mat4', name: 'e' })).toBe(64)
    expect(estimateVariableBytes({ type: 'vec3', name: 'f', count: 3 })).toBe(48)
  })
})
