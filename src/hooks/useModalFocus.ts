import { useEffect, useRef, type RefObject } from 'react';

/**
 * The one focusable-element query for full-screen overlays.
 *
 * Exported so the traps that are *not* built on `useModalFocus` read the same list instead of
 * keeping private copies. `ShortcutsOverlay`'s copy admitted **disabled** buttons, so its wrap test
 * could pick an element whose `.focus()` no-ops and the trap silently failed; `GameMenu`'s omitted
 * `[href]`, `select` and `textarea`. Three selectors, three traps.
 */
export const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Every element inside `container` that Tab can reach, in document order. */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/**
 * Makes a full-screen overlay behave like a modal for keyboard and screen-reader players:
 * focus moves into the dialog on mount (the element marked `data-autofocus` first, otherwise the
 * first focusable child), Tab cannot leave it, and closing the dialog returns focus to the control
 * that opened it.
 *
 * Attach the returned ref to the element that carries `role="dialog"`. Pass `active` for overlays
 * that stay mounted and only *render* their dialog while visible (`TutorialOverlay`): the effect
 * runs when `active` turns true, so the trap is installed when the dialog actually exists.
 *
 * The trap listens on `document` and applies only while focus is inside the container. Binding it
 * to the container instead let Tab escape behind an open dialog: clicking non-focusable dialog text
 * moves focus to `<body>`, where the container's own listener never sees the key and the wrap test
 * (`document.activeElement === last`) cannot match. Focus restore and the document binding are the
 * residual halves of the modal contract.
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
