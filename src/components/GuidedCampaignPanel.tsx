import {
  getGuidedCampaignProgress,
  GUIDED_CAMPAIGN_CHAPTERS,
} from '../game/guidedCampaign';
import type { WorldState } from '../game/gameTypes';

export interface GuidedCampaignPanelProps {
  state: WorldState;
  onStart: () => void;
}

export default function GuidedCampaignPanel({ state, onStart }: GuidedCampaignPanelProps) {
  const campaign = state.guidedCampaign;
  const progress = getGuidedCampaignProgress(state);
  const active = campaign?.active === true;

  return (
    <div className="space-y-3 text-[13px] text-stone-300">
      <div className="rounded-xl border border-amber-700/40 bg-amber-950/25 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-500/90">Guided Campaign</p>
        <h3 className="mt-1 text-lg font-bold text-amber-100">The Valley Remembers</h3>
        <p className="mt-1 leading-relaxed text-stone-300">
          A separate authored journey through five choices. Sandbox stories and random events continue normally beside it.
        </p>
        {!active && !campaign?.completed && (
          <button
            type="button"
            onClick={onStart}
            className="mt-3 w-full rounded-lg bg-amber-700 px-3 py-2 font-bold text-white hover:bg-amber-600"
          >
            Begin the guided campaign
          </button>
        )}
        {campaign?.completed && (
          <p className="mt-3 rounded-lg bg-emerald-950/50 p-2 font-semibold text-emerald-200">
            The valley has remembered all five chapters.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-stone-600/40 bg-stone-800/40 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-bold text-stone-200">Chapter progress</h3>
          <span className="text-xs tabular-nums text-stone-400">{progress.completed}/{progress.total}</span>
        </div>
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-stone-700">
          <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${(progress.completed / progress.total) * 100}%` }} />
        </div>
        <div className="space-y-2">
          {GUIDED_CAMPAIGN_CHAPTERS.map((chapter, index) => {
            const completed = campaign?.completedChapterIds.includes(chapter.id) ?? false;
            const unlocked = campaign?.unlockedChapterIds.includes(chapter.id) ?? false;
            const current = progress.current?.id === chapter.id;
            return (
              <div key={chapter.id} className={`rounded-lg border p-2 ${completed ? 'border-emerald-700/40 bg-emerald-950/20' : current ? 'border-amber-600/50 bg-amber-950/20' : 'border-stone-700/50 bg-stone-900/30'}`}>
                <div className="flex items-center gap-2">
                  <span className="w-5 text-center font-bold text-stone-400">{completed ? '✓' : unlocked ? index + 1 : '·'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-stone-200">{chapter.title}</p>
                    <p className="text-xs text-stone-400">{completed ? 'Remembered' : unlocked ? chapter.subtitle : 'Locked until the previous chapter resolves'}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {(campaign?.memoryTags.length ?? 0) > 0 && (
        <div className="rounded-xl border border-violet-700/30 bg-violet-950/20 p-3">
          <h3 className="mb-2 font-bold text-violet-200">Memory tags</h3>
          <div className="flex flex-wrap gap-1.5">
            {campaign?.memoryTags.map((tag) => (
              <span key={tag} className="rounded-full bg-violet-900/50 px-2 py-1 text-xs text-violet-200">{tag}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
