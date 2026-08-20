import Emoji from './Emoji';
import type { TutorialCampaignStep } from '../game/tutorialCampaign';

export interface TutorialCampaignBannerProps {
  step: TutorialCampaignStep;
  stepIndex: number;
  total: number;
  onSkip: () => void;
}

/** Non-modal first-spring guide card — bottom center, skippable anytime. */
export default function TutorialCampaignBanner({
  step,
  stepIndex,
  total,
  onSkip,
}: TutorialCampaignBannerProps) {
  return (
    <div
      className="pointer-events-auto absolute bottom-3 left-1/2 z-20 w-[min(94%,27rem)] -translate-x-1/2 rounded-xl border border-emerald-500/40 bg-stone-900/95 p-3 shadow-2xl backdrop-blur"
      role="status"
      aria-label="First-spring guide"
    >
      <div className="flex items-start gap-2.5">
        <Emoji className="text-2xl">{step.icon}</Emoji>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-emerald-300">{step.title}</h3>
            <span className="shrink-0 text-[11px] font-semibold text-stone-400">
              Guide {stepIndex + 1}/{total}
            </span>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-stone-300">{step.detail}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex gap-1">
              {Array.from({ length: total }, (_, i) => (
                <span
                  key={i}
                  className={`h-1 rounded-full transition-all ${
                    i === stepIndex ? 'w-4 bg-emerald-500' : i < stepIndex ? 'w-1.5 bg-emerald-700' : 'w-1.5 bg-stone-600'
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={onSkip}
              className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-stone-400 hover:bg-stone-800 hover:text-stone-200"
            >
              Skip guide
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
