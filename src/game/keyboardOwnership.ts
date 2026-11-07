/**
 * Which overlay currently owns the keyboard: the shared claim that stops one Escape closing the menu
 * and also clearing the map selection, since `useKeyboardControls` listens in the capture phase.
 */
const owners = new Set<string>();

/**
 * Claim order, oldest first: the last entry is the overlay on top, the only one that answers Escape.
 * Paint order is interaction order, except two overlays mounting in one commit (child effects run first).
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
 * True when `owner` is the overlay on top of the claim stack — the one that should act on Escape. An
 * overlay not on top still holds a claim (suppressing game keys) and leaves the key to the one above.
 */
export function isTopKeyboardClaim(owner: string): boolean {
  return claimOrder.length > 0 && claimOrder[claimOrder.length - 1] === owner;
}
