import { memo } from 'react';
import { getActiveChallengeId, getChallengeProgress } from '../game/challengeProgress';
import type { WorldState } from '../game/gameTypes';

function ChallengesPanel({ state }: { state: WorldState }) {
  const activeId = getActiveChallengeId(state.challenges);

  return (
    <div className="space-y-1.5">
      {state.challenges.map((c) => {
        const isActive = !c.completed && c.id === activeId;
        const progress = getChallengeProgress(c, state);
        const pct = progress
          ? Math.min(100, Math.round((progress.current / Math.max(1, progress.target)) * 100))
          : 0;
        return (
          <div
            key={c.id}
            className={`flex items-start gap-2 rounded-lg p-1.5 text-[10px] ${
              c.completed
                ? 'bg-emerald-500/10 text-emerald-400'
                : isActive
                  ? 'border border-amber-500/40 bg-amber-500/10 text-stone-200'
                  : 'bg-stone-600/30 text-stone-400'
            }`}
          >
            <span className="mt-0.5">{c.completed ? '✅' : isActive ? '🎯' : '⬜'}</span>
            <div className="flex-1 min-w-0">
              <div className="font-bold">
                {c.title}
                {isActive && (
                  <span className="ml-1 text-[8px] font-semibold uppercase text-amber-400">Active</span>
                )}
              </div>
              <div className="opacity-70">{c.description}</div>
              {progress && (
                <div className="mt-1.5">
                  <div className="mb-0.5 flex justify-between text-[8px] text-stone-500">
                    <span>{progress.current} / {progress.target} {progress.unit}</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-stone-700">
                    <div
                      className={`h-full rounded-full transition-all ${progress.tone === 'eco' ? 'bg-emerald-500' : 'bg-amber-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )}
              {c.rewardText && (
                <div className={`mt-0.5 text-[9px] font-semibold ${c.completed ? 'text-emerald-300' : 'text-amber-400'}`}>
                  🎁 {c.rewardText}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default memo(ChallengesPanel);