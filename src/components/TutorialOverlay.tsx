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
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-stone-600 bg-stone-800 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
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
          <div className="mb-2 flex items-center gap-2">
            <Emoji className="text-2xl">{QUICK_START_STEPS[tutorialStep].icon}</Emoji>
            <h3 className="text-base font-bold text-emerald-300">{QUICK_START_STEPS[tutorialStep].title}</h3>
          </div>
          <p className="text-sm leading-relaxed text-stone-300">{QUICK_START_STEPS[tutorialStep].detail}</p>
        </div>

        <div className="mb-4 flex justify-center gap-1.5">
          {QUICK_START_STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === tutorialStep ? 'w-6 bg-emerald-500' : 'w-1.5 bg-stone-600'}`}
            />
          ))}
        </div>

        <div className="flex gap-2">
          {tutorialStep > 0 && (
            <button
              onClick={() => onSetTutorialStep((s) => s - 1)}
              className="flex-1 rounded-lg border border-stone-600 py-2.5 text-sm font-semibold text-stone-300 hover:border-stone-500"
            >
              Back
            </button>
          )}
          {tutorialStep < QUICK_START_STEPS.length - 1 ? (
            <button
              onClick={() => onSetTutorialStep((s) => s + 1)}
              className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={onFinish}
              className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"
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
