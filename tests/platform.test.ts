import { describe, expect, it } from 'vitest'
import { isDesktopChromium } from '../src/platform/device'

const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36'
const edge = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0'
const safari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15'
const firefox = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0'

describe('desktop Chromium gate', () => {
  it('accepts desktop Chromium browsers with mouse input', () => {
    expect(isDesktopChromium(chrome, 0, false)).toBe(true)
    expect(isDesktopChromium(edge, 0, false)).toBe(true)
    expect(isDesktopChromium('Mozilla/5.0 (X11; Linux x86_64) Chromium/154.0.0.0', 0, false)).toBe(true)
  })

  it('rejects other browser engines', () => {
    expect(isDesktopChromium(safari, 0, false)).toBe(false)
    expect(isDesktopChromium(firefox, 0, false)).toBe(false)
  })

  it('rejects mobile browsers, iPad desktop mode, and touch-only devices', () => {
    expect(isDesktopChromium(chrome.replace('Windows NT 10.0; Win64; x64', 'Linux; Android 16; Mobile'), 5, true)).toBe(false)
    expect(isDesktopChromium(chrome.replace('Chrome/', 'CriOS/').replace('Windows NT 10.0; Win64; x64', 'iPhone; CPU iPhone OS 27_0'), 5, true)).toBe(false)
    expect(isDesktopChromium(chrome.replace('Windows NT 10.0; Win64; x64', 'Macintosh; Intel Mac OS X 10_15_7'), 5, false)).toBe(false)
    expect(isDesktopChromium(chrome, 5, true)).toBe(false)
  })
})
