/**
 * `GameWindow` — the one window shell every subject renders into: title bar, one close control and
 * one scrollable body. It owns no subject logic; a caller passes a title and body.
 */
import { createPortal } from 'react-dom';
import { useId } from 'react';
import type { ReactNode } from 'react';
import { useModalFocus } from '../hooks/useModalFocus';

export interface GameWindowProps {
  /** The subject's own name, shown in the title bar and used as the dialog's accessible name. */
  title: string;
  /** Optional one-line detail under the title (a settler's generation, a venue's hours). */
  subtitle?: string;
  /** Small leading glyph, so a window is identifiable at a glance. */
  icon?: string;
  onClose: () => void;
  /** Cap the body's height so a long subject scrolls instead of growing off-screen. */
  maxBodyClassName?: string;
  /**
   * Replace both the window's `w-*` and the `max-w-*` that goes with it: Tailwind orders by
   * stylesheet, so a later `w-*` in the class attribute does not reliably win. The caller owns both.
   */
  widthClassName?: string;
  /**
   * Where the window sits when it is an anchored panel. Defaults to the top-right corner, which suits
   * the work-hours window. Ignored when `centered` is set.
   */
  positionClassName?: string;
  /**
   * Centre the window in the viewport over a dimming backdrop, which is what makes it a modal.
   * Ignored by the anchored variant, which sits beside the panel that opened it.
   */
  centered?: boolean;
  children: ReactNode;
}

export default function GameWindow({
  title,
  subtitle,
  icon,
  onClose,
  maxBodyClassName = 'max-h-[60vh]',
  positionClassName = 'right-4 top-4',
  widthClassName,
  centered = false,
  children,
}: GameWindowProps) {
  // The focus half of the overlay contract, owned here: `centered` is what makes a window a modal,
  // and `useModalFocus` is the repository's one trap. Inert for anchored windows.
  const dialogRef = useModalFocus<HTMLDivElement>(centered);
  const width = widthClassName ?? (centered ? 'w-[26rem] max-w-[92vw]' : 'w-72');
  // The dialog's accessible name *is* the visible title, not a second copy of it, so a window
  // announces its subject once.
  const titleId = useId();
  const panel = (
    <div
      ref={dialogRef}
      role="dialog"
      aria-labelledby={titleId}
      // Only the centred variant is a modal: the anchored one sits beside the panel that opened it and
      // leaves the rest of the game reachable.
      aria-modal={centered || undefined}
      className={
        centered
          ? `pointer-events-auto relative ${width} rounded-xl border border-amber-600/40 bg-stone-900/95 text-xs text-amber-100 shadow-2xl backdrop-blur`
          : `pointer-events-auto absolute z-40 ${width} rounded-xl border border-amber-600/40 bg-stone-900/95 text-xs text-amber-100 shadow-2xl backdrop-blur ${positionClassName}`
      }
    >
      <div className="flex items-start justify-between gap-2 border-b border-amber-600/20 p-3 pb-2">
        <div className="min-w-0">
          <h2
            id={titleId}
            className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-400"
          >
            {icon && <span aria-hidden>{icon}</span>}
            <span className="truncate">{title}</span>
          </h2>
          {subtitle && <p className="truncate text-[10px] text-stone-400">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="rounded px-1.5 py-0.5 text-stone-400 hover:bg-stone-700/60 hover:text-amber-200"
        >
          ✕
        </button>
      </div>

      <div className={`overflow-y-auto p-3 ${maxBodyClassName}`}>{children}</div>
    </div>
  );

  if (!centered) return panel;

  // Ported to `document.body`: this renders inside the inspector column, where any transformed
  // ancestor would become the containing block for `fixed`. A portal makes `inset-0` the viewport.
  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center p-4"
      // Above every panel: the inspector column and the overlays both sit in the 40s, and a modal that
      // renders under them is not a modal. `z-50` clears them.
    >
      <div className="absolute inset-0 bg-black/50">
        <button
          type="button"
          aria-label={`Close ${title}`}
          onClick={onClose}
          className="h-full w-full cursor-default"
        />
      </div>
      <div className="relative">{panel}</div>
    </div>,
    document.body,
  );
}
