/** The game needs a desktop Chromium browser with mouse and keyboard input. */
export function isDesktopChromium(
  userAgent = navigator.userAgent,
  maxTouchPoints = navigator.maxTouchPoints,
  touchOnly = typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches,
): boolean {
  if (!/(?:Chrome|Chromium|Edg|OPR)\/\d+/.test(userAgent)) return false
  if (/(?:Android|iPhone|iPad|iPod|Mobile|Tablet|CriOS|EdgiOS|OPiOS)/i.test(userAgent)) return false
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return false // iPadOS desktop user agent
  return !touchOnly
}
