import Emoji from './Emoji';

const QUICK_START_STEPS = [
  { icon: '🏠', title: 'Build a House before night', detail: `Press B to open Build, pick Housing → House (or press 1), click the map, then assign workers. Night starts at 20:00 on day one.` },
  { icon: '👆', title: 'Click the map to manage', detail: 'Select people, buildings, or visitor camps — actions appear in the right panel. Assign workers with + Worker on finished buildings.' },
  { icon: '💡', title: 'Tips appear as you play', detail: 'When something new happens — traders, rivals, winter, raids — a tip card appears on the map. Alerts under the header jump to urgent issues. Press ? for shortcuts.' },
];

export interface TutorialOverlayProps {
  showTutorial: boolean;
  tutorialStep: number;
  onSetTutorialStep: (fn: (s: number) => number) => void;
  onFinish: () => void;
  onDisableAll: () => void;
}

export default function TutorialOverlay({
  showTutorial,
  tutorialStep,
  onSetTutorialStep,
  onFinish,
  onDisableAll,
}: TutorialOverlayProps) {
  if (!showTutorial) return null;

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/65 backdrop-blur-sm"
      onClick={onFinish}
    >
      <div className="mx-4 relative w-full max-w-sm overflow-hidden rounded-2xl border border-stone-600 bg-stone-800 p-5 shadow-[0_0_0_1px_rgba(52,211,153,0.12),0_24px_60px_rgba(0,0,0,0.6)]" onClick={(e) => e.stopPropagation()}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-600 via-emerald-400 to-amber-500" aria-hidden />
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-white">Quick start</h2>
            <p className="text-[11px] text-stone-400">Step {tutorialStep + 1} of {QUICK_START_STEPS.length}</p>
          </div>
          <button
            type="button"
            onClick={onFinish}
            className="shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold text-stone-400 hover:bg-stone-700 hover:text-stone-200"
          >
            Skip →
          </button>
        </div>

        <div className="mb-4 rounded-xl bg-stone-900/60 p-4">
          <div className="mb-2 flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-2xl ring-1 ring-emerald-500/25">
              <Emoji>{QUICK_START_STEPS[tutorialStep].icon}</Emoji>
            </span>
            <h3 className="text-base font-bold text-emerald-300">{QUICK_START_STEPS[tutorialStep].title}</h3>
          </div>
          <p className="text-sm leading-relaxed text-stone-300">{QUICK_START_STEPS[tutorialStep].detail}</p>
        </div>

        <div className="mb-4 flex justify-center gap-1.5">
          {QUICK_START_STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${i === tutorialStep ? 'w-7 bg-emerald-500' : 'w-2 bg-stone-600'}`}
            />
          ))}
        </div>

        <div className="flex gap-2">
          {tutorialStep > 0 && (
            <button
              onClick={() => onSetTutorialStep((s) => s - 1)}
              className="ui-btn ui-btn-ghost min-h-[2.75rem] flex-1 py-2.5 text-sm"
            >
              Back
            </button>
          )}
          {tutorialStep < QUICK_START_STEPS.length - 1 ? (
            <button
              onClick={() => onSetTutorialStep((s) => s + 1)}
              className="ui-btn ui-btn-primary min-h-[2.75rem] flex-1 py-2.5 text-sm"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={onFinish}
              className="ui-btn ui-btn-primary min-h-[2.75rem] flex-1 py-2.5 text-sm"
            >
              Start playing
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onDisableAll}
          className="mt-3 w-full text-center text-[10px] font-semibold text-stone-500 hover:text-stone-300"
        >
          Don&apos;t show tutorials again
        </button>
      </div>
    </div>
  );
}
