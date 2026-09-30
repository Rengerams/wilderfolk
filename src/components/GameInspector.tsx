import type { ReactNode } from 'react';

export interface GameInspectorProps {
  hasSelection: boolean;
  collapsed: boolean;
  selectedLabel: string;
  onClear: () => void;
  onToggleCollapsed: () => void;
  children: ReactNode;
  diagnostics?: ReactNode;
}

/** Presentation shell for the selected-object inspector. Selection and commands remain App-owned. */
export default function GameInspector({
  hasSelection,
  collapsed,
  selectedLabel,
  onClear,
  onToggleCollapsed,
  children,
  diagnostics,
}: GameInspectorProps) {
  // Collapsing used to hide the panel body while the column kept its
  // 18.5rem width, so the player who collapsed it to see more map gained nothing — measured in the
  // browser tier: the map canvas stayed 1304 px wide expanded *and* collapsed. The aside narrows
  // with this state (App sizes it), so the collapsed inspector is a compact control strip — and the
  // diagnostics drawer, which needs the column's width to lay out, is not rendered while collapsed.
  // Expanding brings it straight back; its own open state is remembered in localStorage.
  if (hasSelection && collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 px-1 py-1.5" aria-label="Inspector (collapsed)">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="rounded px-1.5 py-1 text-xs text-stone-400 hover:bg-stone-700 hover:text-stone-200 transition-colors"
          title={`Expand inspector — ${selectedLabel}`}
          aria-label={`Expand inspector (${selectedLabel})`}
          aria-expanded={false}
        >
          ▸
        </button>
        <button
          type="button"
          onClick={onClear}
          className="rounded px-1.5 py-1 text-xs text-stone-400 hover:bg-stone-700 hover:text-stone-200 transition-colors"
          title="Clear selection (ESC)"
          aria-label="Clear selection"
        >
          ✕
        </button>
      </div>
    );
  }

  // Nothing selected: the column is a narrow rail (App sizes it) and the diagnostics drawer is not
  // rendered, for the same reason the collapsed branch below does not render it — the drawer needs the
  // column's width to lay out, and an empty 18.5rem column was the owner's report *"now the right panel
  // no need to be that big anymore"*. The drawer is back the moment anything is selected, which is the
  // only time this column has something to show.
  if (!hasSelection) {
    return <div className="flex flex-col items-center gap-1 px-1 py-1.5" aria-label="Inspector (nothing selected)" />;
  }

  return (
    <div className="flex flex-col" aria-label="Inspector">
      {diagnostics}
      {hasSelection && (
        <section
          className="shrink-0 border-b border-stone-700 bg-stone-900/50"
          aria-labelledby="inspector-heading"
        >
          <div className="flex items-center justify-between px-3 py-1.5">
            <h2 id="inspector-heading" className="text-xs font-bold uppercase tracking-wider text-stone-400">
              Selected
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onClear}
                className="rounded px-1.5 py-0.5 text-xs text-stone-400 hover:bg-stone-700 hover:text-stone-200 transition-colors"
                title="Clear selection (ESC)"
                aria-label="Clear selection"
              >
                ✕
              </button>
              <button
                type="button"
                onClick={onToggleCollapsed}
                className="rounded px-1.5 py-0.5 text-xs text-stone-400 hover:bg-stone-700 hover:text-stone-200 transition-colors"
                title={collapsed ? 'Expand' : 'Collapse'}
                aria-label={collapsed ? 'Expand inspector' : 'Collapse inspector'}
                aria-expanded={!collapsed}
                aria-controls="inspector-content-panel"
              >
                {collapsed ? '▾' : '▴'}
              </button>
            </div>
          </div>
          {!collapsed && (
            <div id="inspector-content-panel" className="inspector-panel px-3 pb-3">
              {children}
            </div>
          )}
          {collapsed && (
            <p className="truncate px-3 pb-2 text-[11px] text-stone-300 font-medium">
              {selectedLabel}
            </p>
          )}
        </section>
      )}
    </div>
  );
}