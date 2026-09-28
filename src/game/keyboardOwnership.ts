/**
 * Which overlay currently owns the keyboard.
 *
 * `useKeyboardControls` listens on `window` in the **capture** phase, so it sees every
 * key before any overlay's own handler — an overlay that mounts and registers later still
 * runs *after* it. Without a shared claim, a single Escape closes the game menu **and**
 * falls through the game handler's chain to clear the map selection, and gameplay hotkeys
 * act on the game behind an open dashboard or shortcuts sheet
 * (`BUG_REPORTS/2026-09-17-keyboard-ignores-open-overlays.md`).
 *
 * Overlays claim on open and release on close; the game handler ignores every key while
 * any claim is held.
 */
const owners = new Set<string>();

/** Take the keyboard for `owner` (an overlay). Idempotent. */
export function claimKeyboard(owner: string): void {
  owners.add(owner);
}

/** Release `owner`'s claim. Safe to call when it holds none. */
export function releaseKeyboard(owner: string): void {
  owners.delete(owner);
}

/** True while any overlay holds the keyboard. */
export function isKeyboardClaimed(): boolean {
  return owners.size > 0;
}
