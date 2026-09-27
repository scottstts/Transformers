import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PauseMenu, type PauseHost } from '../src/ui/pause-menu'

type Listener = (event: never) => void

/** Just enough DOM for the menu: elements that hold classes and listeners, and window/document listener tables. */
class FakeElement {
  readonly classes = new Set<string>()
  readonly listeners = new Map<string, Listener>()
  readonly classList = {
    add: (...names: string[]) => { names.forEach((name) => this.classes.add(name)) },
    remove: (...names: string[]) => { names.forEach((name) => this.classes.delete(name)) },
    contains: (name: string) => this.classes.has(name),
  }
  className = ''
  id = ''
  type = ''
  innerHTML = ''
  inert = false
  offsetWidth = 0
  setAttribute(): void {}
  append(): void {}
  remove(): void {}
  focus(): void {}
  blur(): void {}
  addEventListener(type: string, listener: Listener): void { this.listeners.set(type, listener) }
  click(): void { this.listeners.get('click')?.({} as never) }
}

const table = (): { listeners: Map<string, Listener>; addEventListener(type: string, l: Listener): void; removeEventListener(type: string): void } => {
  const listeners = new Map<string, Listener>()
  return {
    listeners,
    addEventListener: (type, l) => { listeners.set(type, l) },
    removeEventListener: (type) => { listeners.delete(type) },
  }
}

let win: ReturnType<typeof table>
let doc: ReturnType<typeof table> & { body: FakeElement; exitPointerLock: () => void; createElement: () => FakeElement }
let buttons: FakeElement[]

beforeEach(() => {
  win = table()
  buttons = []
  const body = new FakeElement()
  body.classes.add('ready')
  doc = {
    ...table(),
    body,
    exitPointerLock: vi.fn(),
    createElement: () => {
      const element = new FakeElement()
      buttons.push(element)
      return element
    },
  }
  vi.stubGlobal('window', win)
  vi.stubGlobal('document', doc)
})
afterEach(() => { vi.unstubAllGlobals() })

interface Harness {
  menu: PauseMenu
  host: PauseHost & { locked: boolean; blocked: boolean }
  paused: boolean[]
  resume: FakeElement
  key(code: string): { prevented: boolean }
  lockChange(): void
}

function harness(grant = true): Harness {
  const paused: boolean[] = []
  const host = {
    locked: true,
    blocked: false,
    lock: vi.fn(async () => {
      if (grant) {
        host.locked = true
        doc.listeners.get('pointerlockchange')?.({} as never)
      }
      return grant
    }),
    pausedChanged: (value: boolean) => { paused.push(value) },
  }
  const menu = new PauseMenu(host)
  const resume = buttons.find((b) => b.className === 'pause-resume') as FakeElement
  const key = (code: string): { prevented: boolean } => {
    const event = { code, repeat: false, prevented: false, preventDefault() { this.prevented = true } }
    win.listeners.get('keydown')?.(event as never)
    return event
  }
  const lockChange = (): void => { doc.listeners.get('pointerlockchange')?.({} as never) }
  return { menu, host, paused, resume, key, lockChange }
}

describe('pause menu (mouse and keyboard)', () => {
  it('pauses when play loses the pointer, and resumes once a gesture takes it back', async () => {
    const h = harness()
    h.host.locked = false
    h.lockChange()
    expect(h.menu.isPaused).toBe(true)
    expect(doc.body.classes.has('paused')).toBe(true)
    expect(h.paused).toEqual([true])
    h.resume.click()
    await Promise.resolve()
    expect(h.host.lock).toHaveBeenCalledTimes(1)
    expect(h.menu.isPaused).toBe(false)
    expect(doc.body.classes.has('paused')).toBe(false)
    expect(h.paused).toEqual([true, false])
  })

  it('leaves a released pointer to the vehicle menu while it is open', () => {
    const h = harness()
    h.host.blocked = true
    h.host.locked = false
    h.lockChange()
    expect(h.menu.isPaused).toBe(false)
    // the menu closed without taking the pointer back: the game pauses
    h.host.blocked = false
    h.menu.settle()
    expect(h.menu.isPaused).toBe(true)
  })

  it('does not pause before play starts', () => {
    const h = harness()
    doc.body.classes.delete('ready')
    h.host.locked = false
    h.lockChange()
    h.key('Escape')
    expect(h.menu.isPaused).toBe(false)
  })

  it('resumes from Enter, but cannot from Escape (no gesture)', async () => {
    const h = harness()
    h.host.locked = false
    h.lockChange()
    h.key('Escape')
    expect(h.host.lock).not.toHaveBeenCalled()
    expect(h.menu.isPaused).toBe(true)
    expect(h.key('Enter').prevented).toBe(true)
    await Promise.resolve()
    expect(h.menu.isPaused).toBe(false)
  })

  it('stays paused and shakes the button when the browser refuses the lock', async () => {
    const h = harness(false)
    h.host.locked = false
    h.lockChange()
    h.resume.click()
    await Promise.resolve()
    await Promise.resolve()
    expect(h.menu.isPaused).toBe(true)
    expect(h.resume.classes.has('nudge')).toBe(true)
  })

  it('releases the pointer itself when Escape reaches the page under the lock', () => {
    const h = harness()
    h.key('Escape')
    expect(h.menu.isPaused).toBe(true)
    expect(doc.exitPointerLock).toHaveBeenCalledTimes(1)
  })
})
