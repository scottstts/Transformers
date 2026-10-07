import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameInput } from '../src/game/input'

type Listener = (event: never) => void
const surface = () => {
  const listeners = new Map<string, Listener>()
  return {
    listeners,
    addEventListener: (name: string, listener: Listener) => { listeners.set(name, listener) },
    removeEventListener: (name: string) => { listeners.delete(name) },
  }
}
let win: ReturnType<typeof surface>
let doc: ReturnType<typeof surface> & { pointerLockElement: HTMLCanvasElement | null }
const canvas = {} as HTMLCanvasElement

beforeEach(() => {
  win = surface()
  doc = { ...surface(), pointerLockElement: canvas }
  vi.stubGlobal('window', win)
  vi.stubGlobal('document', doc)
})
afterEach(() => vi.unstubAllGlobals())

function click(): void { win.listeners.get('pointerdown')!({ button: 0 } as never) }
function key(code: string, repeat = false): void {
  win.listeners.get('keydown')!({ code, repeat, preventDefault: () => undefined } as never)
}

describe('combat input event ownership', () => {
  it('never rechecks a rejected click after the next combo window opens', () => {
    let ready = false
    const attack = vi.fn(() => ready)
    const input = new GameInput(canvas, () => undefined, () => undefined, attack, () => undefined)
    click(); click(); click()
    ready = true
    expect(input.consumeAttack()).toBe(false)
    expect(attack).toHaveBeenCalledTimes(3)
    click()
    expect(input.consumeAttack()).toBe(true)
    expect(input.consumeAttack()).toBe(false)
    input.dispose()
  })

  it('E fires at the key event, ignores repeat, and leaves no signal for later', () => {
    const flash = vi.fn()
    const input = new GameInput(canvas, () => undefined, () => undefined, () => true, flash)
    key('KeyE')
    expect(flash).toHaveBeenCalledTimes(1)
    key('KeyE', true)
    expect(flash).toHaveBeenCalledTimes(1)
    key('KeyE')
    expect(flash).toHaveBeenCalledTimes(2)
    doc.pointerLockElement = null
    key('KeyE')
    click()
    expect(flash).toHaveBeenCalledTimes(2)
    expect(input.consumeAttack()).toBe(false)
    input.dispose()
  })

  it('losing pointer lock drops one-shot signals and the held guard', () => {
    const input = new GameInput(canvas, () => undefined, () => undefined, () => true, () => undefined)
    click()
    key('KeyF')
    key('Space')
    win.listeners.get('pointerdown')!({ button: 2 } as never)
    doc.pointerLockElement = null
    doc.listeners.get('pointerlockchange')!({} as never)
    expect(input.consumeAttack() || input.consumeSpecial() || input.consumeJump() || input.guarding).toBe(false)
    input.dispose()
  })
})
