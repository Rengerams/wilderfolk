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

/**
 * Claim order, oldest first. The last entry is the overlay **on top**, and the only one that answers
 * Escape.
 *
 * Added 2026-09-30 with the first windows that open *from* a panel: a subject window over the panel
 * that opened it meant two overlays held the keyboard at once, and both handled Escape on `window`, so
 * one press closed **both** — the probe caught it as "clicking a subject works, the second subject
 * cannot be clicked" because the panel behind had gone too. Paint order here is interaction order
 * (an overlay opened later is on top), which is what the order records. The one case it does not
 * describe is two overlays mounting in the *same* commit, where React runs the child's effects first.
 */
const claimOrder: string[] = [];

/** Take the keyboard for `owner` (an overlay). Idempotent; re-claiming moves the owner to the top. */
export function claimKeyboard(owner: string): void {
  owners.add(owner);
  const at = claimOrder.indexOf(owner);
  if (at >= 0) claimOrder.splice(at, 1);
  claimOrder.push(owner);
}

/** Release `owner`'s claim. Safe to call when it holds none. */
export function releaseKeyboard(owner: string): void {
  owners.delete(owner);
  const at = claimOrder.indexOf(owner);
  if (at >= 0) claimOrder.splice(at, 1);
}

/** True while any overlay holds the keyboard. */
export function isKeyboardClaimed(): boolean {
  return owners.size > 0;
}

/**
 * True when `owner` is the overlay on top of the claim stack — the one that should act on Escape.
 *
 * An overlay that is not on top still *holds* a claim (so the game's own keys stay suppressed); it
 * simply leaves the key for the overlay above it.
 */
export function isTopKeyboardClaim(owner: string): boolean {
  return claimOrder.length > 0 && claimOrder[claimOrder.length - 1] === owner;
}
