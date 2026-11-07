import { useEffect } from 'react';
import { claimKeyboard, isTopKeyboardClaim, releaseKeyboard } from '../game/keyboardOwnership';

/**
 * The two halves of the overlay keyboard contract: while `active`, the overlay owns the keyboard
 * and handles Escape itself. `useModalFocus` owns the focus half; this hook owns the keyboard half.
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
      if (event.key !== 'Escape') return;
      /**
       * Only the overlay **on top** answers Escape — two overlays can be open at once and both
       * handlers listen on `window`, so one press must not close both.
       */
      if (!isTopKeyboardClaim(owner)) return;
      onEscape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEscape, owner, active]);
}
