import type { ContextualTutorialTip } from '../game/contextualTutorial';
import type { FocusHintAction } from '../game/focusHints';

interface Props {
  tip: ContextualTutorialTip;
  onDismiss: () => void;
  onDisableAll?: () => void;
  onAction?: (action: FocusHintAction) => void;
}

export default function ContextualTutorialCard({ tip, onDismiss, onDisableAll, onAction }: Props) {
  const action = tip.action;

  return (
    <div className="pointer-events-auto absolute bottom-20 left-4 z-30 w-full max-w-xs animate-in fade-in slide-in-from-left-2">
      <div className="rounded-xl border border-amber-500/35 bg-stone-900/95 p-3 shadow-2xl backdrop-blur-sm">
        <div className="mb-1 flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <span className="text-lg leading-none">{tip.icon}</span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-400">New</p>
              <h3 className="text-sm font-bold text-white">{tip.title}</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-stone-500 hover:bg-stone-800 hover:text-stone-200"
            aria-label="Dismiss tip"
          >
            ✕
          </button>
        </div>
        <p className="mb-2 text-[11px] leading-relaxed text-stone-300">{tip.detail}</p>
        <div className="flex gap-2">
          {action && onAction && (
            <button
              type="button"
              onClick={() => onAction(action)}
              className="flex-1 rounded-lg bg-amber-700/80 px-2 py-1.5 text-[10px] font-bold text-amber-50 hover:bg-amber-600/90"
            >
              {action.label} →
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className={`rounded-lg bg-stone-700 px-2 py-1.5 text-[10px] font-semibold text-stone-200 hover:bg-stone-600 ${action ? '' : 'w-full'}`}
          >
            Got it
          </button>
        </div>
        {onDisableAll && (
          <button
            type="button"
            onClick={onDisableAll}
            className="mt-2 w-full text-center text-[9px] font-semibold text-stone-500 hover:text-stone-300"
          >
            Turn off all tutorials
          </button>
        )}
      </div>
    </div>
  );
}