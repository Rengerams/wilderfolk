import { useEffect, useRef, type RefObject } from 'react';

/**
 * The one focusable-element query for full-screen overlays, exported so traps not built on
 * `useModalFocus` read the same list instead of keeping private copies.
 */
export const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Every element inside `container` that Tab can reach, in document order. */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/**
 * Makes a full-screen overlay modal: focus enters on mount (`data-autofocus` first), Tab stays
 * inside, and closing restores focus. `active` defers the trap; it binds on `document`, not the box.
 */
export function useModalFocus<T extends HTMLElement>(active = true): RefObject<T | null> {
  const containerRef = useRef<T | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const focusable = () => getFocusableElements(container);

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const initial = container.querySelector<HTMLElement>('[data-autofocus]') ?? focusable()[0];
    if (initial) initial.focus();
    else if (container.hasAttribute('tabindex')) container.focus();

    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      // Focus outside the dialog (typically `<body>` after a click on its text) is the caller's
      // to recover; wrapping from there would move focus into a dialog the player is not in.
      if (!container.contains(document.activeElement)) return;
      const items = focusable();
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleTab);
    return () => {
      document.removeEventListener('keydown', handleTab);
      previouslyFocused?.focus();
    };
  }, [active]);

  return containerRef;
}
