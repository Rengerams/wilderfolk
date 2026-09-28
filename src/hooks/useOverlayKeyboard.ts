import { useEffect } from 'react';
import { claimKeyboard, releaseKeyboard } from '../game/keyboardOwnership';

/**
 * The two halves of the overlay keyboard contract, in one place: while `active`, the overlay **owns**
 * the keyboard and **handles Escape** itself.
 *
 * Both halves are load-bearing *together*, which is why they belong in one hook rather than two
 * effects beside each other:
 *
 *  - `useKeyboardControls` listens on `window` in the **capture** phase, so it sees every key before
 *    any overlay's own handler, and it returns immediately while any claim is held. An overlay that
 *    handles Escape but does not claim lets the same keypress fall through and clear the map selection
 *    behind it (`BUG_REPORTS/2026-09-17-keyboard-ignores-open-overlays.md`).
 *  - The mirror case shipped: the Valley overview claimed the keyboard and had **no** Escape handler,
 *    so the claim made the game handler's own Escape branch unreachable and the overlay's "Close (Esc)"
 *    button was a promise the code did not keep (2026-09-20 audit, A-1).
 *
 * Four overlays wrote these two effects by hand (the dashboard, the Valley overview, the game menu and
 * the quick-start), which is how the halves drifted apart; `docs/private/audits/2026-09-20` records the
 * pair as a mechanical clone (2026-09-20 audit, clone 3). `useModalFocus` owns the *focus* half of the
 * same contract; this hook owns the keyboard half.
 *
 * Pass `active` for overlays that stay mounted and only render their dialog while visible
 * (`GameMenu`, `TutorialOverlay`); the effects run when it turns true.
 */
export function useOverlayKeyboard(owner: string, onEscape: () => void, active = true): void {
  useEffect(() => {
    if (!active) return;
    claimKeyboard(owner);
    return () => releaseKeyboard(owner);
  }, [owner, active]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEscape, active]);
}
