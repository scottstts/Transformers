/**
 * A touch-first device (phone, tablet without a mouse): the game uses on-screen
 * controls and no pointer lock. Decided once at boot; a hybrid laptop with a
 * touch screen and a trackpad keeps the mouse and keyboard scheme.
 */
export function isTouchDevice(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches
}
