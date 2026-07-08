import { useState } from 'react';
import { getFocusHints, type FocusHintAction } from './focusHints';
import type { Building, WorldState } from './gameTypes';

interface Props {
  state: WorldState;
  buildings?: Building[];
  onOpenGoals?: () => void;
  onHintAction?: (action: FocusHintAction) => void;
}

export default function FocusPanel({ state, buildings, onOpenGoals, onHintAction }: Props) {
  const hints = getFocusHints(state, buildings ?? state.buildings);
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? hints.slice(0, 3) : hints.slice(0, 1);

  if (hints.length === 0) return null;

  return (
    <div className="rounded-xl border border-emerald-700/35 bg-gradient-to-br from-emerald-950/40 to-stone-800/50 p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wide text-emerald-400">Next step</h3>
        {onOpenGoals && (
          <button
            type="button"
            onClick={onOpenGoals}
            className="text-[9px] font-semibold text-stone-500 hover:text-emerald-300"
          >
            Goals →
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        {visible.map((hint) => (
          <div key={hint.title} className="rounded-lg bg-stone-900/50 px-2 py-1.5 text-[10px]">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0">{hint.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-stone-200">{hint.title}</p>
                <p className="mt-0.5 leading-relaxed text-stone-400">{hint.detail}</p>
              </div>
            </div>
            {hint.action && onHintAction && (
              <button
                type="button"
                onClick={() => onHintAction(hint.action!)}
                className="mt-1.5 w-full rounded-md bg-emerald-800/50 py-1 text-[9px] font-bold text-emerald-200 hover:bg-emerald-700/50"
              >
                {hint.action.label} →
              </button>
            )}
          </div>
        ))}
      </div>
      {hints.length > 1 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 w-full text-[9px] font-semibold text-stone-500 hover:text-stone-300"
        >
          {expanded ? 'Show less' : `+${Math.min(hints.length, 3) - 1} more tips`}
        </button>
      )}
    </div>
  );
}