/**
 * `GameWindow` — the one window shell every subject renders into.
 *
 * Owner ruling, 2026-09-29: *"each subject should just have its own window not stacking up"*. Before
 * this, every subject was a section of one long inspector stack: the family tree was a flat list
 * inside `SelectedEntityPanel`, and the work/venue schedule editors were buried at
 * `CitizenOverviewScreen` (reachable only through Overview → Village). This shell is the primitive
 * that replaces stacking — a title bar, one close control, and one scrollable body.
 *
 * It deliberately owns **no** subject logic. A caller passes a title and body; the shell never reads
 * `WorldState`, never decides what a subject is, and never restates a rule that belongs to an owner
 * (AGENTS.md §5.7). That is what keeps adding a window a small change instead of a new layout.
 *
 * **Not draggable yet, on purpose.** The plan in `docs/plans/ux-redesign-2026-09-29.md` lists
 * draggable/resizable as part of the full shell. There is no drag or resize helper anywhere in this
 * repository (checked 2026-09-29), so that is new interaction work rather than a refactor, and it is
 * deliberately left for its own change so this one stays reviewable. Every window is anchored
 * top-right; when dragging lands it becomes a wrapper around this same element and no caller changes.
 *
 * Accessibility: `role="dialog"` with an accessible name, matching the other overlays in this tree
 * (`CitizenOverviewScreen`, `GameMenu`, `ShortcutsOverlay`). Panels cannot be asserted from `vitest`
 * — this repo has no DOM tier — so the real check for any window is `npm run build` plus looking at
 * it running.
 */
import { createPortal } from 'react-dom';
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
   * Replace the window's own width — **both** its `w-*` and the `max-w-*` that goes with it, since a
   * later `w-*` in the class attribute does not reliably win over an earlier one (Tailwind orders by
   * stylesheet, not by markup). The caller that passes this owns both numbers.
   *
   * It exists because the two built-in widths are a settled shape: a chat-sized centred window
   * (`26rem`) and a narrow anchored one (`18rem`). A subject that is genuinely wider than that — the
   * Village overview carries a five-column resource row, two SVG charts and a settler table — had no
   * way to fit the shell, so it hand-rolled a full-screen dialog of its own instead. Sizing is part of
   * the shell's job; bypassing it is what this prop removes. Omitted, nothing changes for any caller.
   */
  widthClassName?: string;
  /**
   * Where the window sits when it is an anchored panel. Defaults to the top-right corner, which suits
   * the work-hours window. Ignored when `centered` is set.
   */
  positionClassName?: string;
  /**
   * Centre the window in the viewport over a dimming backdrop (owner: *"just do it in the middel of
   * screen"*).
   *
   * Needed because the right edge already holds the Selected inspector, and a window opened *from*
   * that inspector landed on top of it and read as a stray floating box (*"its a bit of weird
   * place"*). Centring is the honest fix for a window that is opened from a panel rather than living
   * beside one: it is a modal, and the backdrop says so. Still one primitive — a caller chooses a
   * placement, it does not get its own chrome.
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
  // The focus half of the overlay contract, owned here rather than repeated by every centred caller.
  // `useModalFocus` is the repository's one trap and `centered` is what makes a window a modal (it has
  // a dimming backdrop whose click closes it), so the two belong to the same owner — the shell — for
  // the same reason the title bar and the close control do. It stays inert for anchored windows, which
  // are not modals. Without this a caller would have to re-attach the trap to an element the shell
  // owns, which is not reachable from outside a portal.
  const dialogRef = useModalFocus<HTMLDivElement>(centered);
  const width = widthClassName ?? (centered ? 'w-[26rem] max-w-[92vw]' : 'w-72');
  const panel = (
    <div
      ref={dialogRef}
      role="dialog"
      aria-label={title}
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
          <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-400">
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

  /**
   * A real modal, **ported to `document.body`** so nothing can move it.
   *
   * Two earlier attempts failed for the same underlying reason and neither was a CSS bug to tweak:
   * this component renders inside the inspector column, and any ancestor with a `transform`, `filter`
   * or `backdrop-filter` becomes the containing block for a `fixed` element. So `fixed inset-0`
   * resolved against the panel and the window appeared stacked under the Selected panel (owner:
   * *"stil not in the middle of screen"*), and switching to `absolute inset-0` only helped if that
   * particular ancestor happened to be viewport-sized — which it was not.
   *
   * A portal escapes the subtree entirely, so `fixed inset-0` means the real viewport again and the
   * centring cannot be broken by whatever a parent does with transforms. That is the actual fix; the
   * earlier two were workarounds around a problem the portal removes.
   */
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
