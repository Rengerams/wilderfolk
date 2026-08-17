import type { WorldState } from '../../game/gameTypes';
import { VALLEY_CHAPTERS } from '../../game/valleyChronicle';

/** Valley Chronicle — the sandbox's story spine, shown as a progress list. */
export default function ValleyChroniclePanel({ state }: { state: WorldState }) {
  const done = new Set(state.chronicleChapters ?? []);
  const total = VALLEY_CHAPTERS.length;
  const completed = VALLEY_CHAPTERS.filter((c) => done.has(c.id)).length;

  return (
    <div className="rounded-xl border border-amber-600/40 bg-gradient-to-br from-amber-950/40 to-stone-800/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-amber-300">📜 Valley Chronicle</h3>
        <span className="font-mono text-[11px] text-stone-500">{completed}/{total}</span>
      </div>
      <p className="mb-2 text-[10px] leading-relaxed text-stone-500">
        Your valley's story — chapters unlock as history happens. No win or loss; the valley just keeps living.
      </p>
      <div className="space-y-1">
        {VALLEY_CHAPTERS.map((ch) => {
          const isDone = done.has(ch.id);
          return (
            <div
              key={ch.id}
              className={`flex items-start gap-2 rounded-lg px-2 py-1.5 ${
                isDone ? 'bg-amber-900/25' : 'bg-stone-900/40 opacity-70'
              }`}
            >
              <span className={`mt-0.5 text-base ${isDone ? '' : 'grayscale'}`}>{ch.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-[11px] font-bold ${isDone ? 'text-amber-200' : 'text-stone-400'}`}>
                    {ch.title}
                  </p>
                  <span className={`text-[9px] font-semibold ${isDone ? 'text-amber-400' : 'text-stone-600'}`}>
                    {isDone ? '✓' : '…'}
                  </span>
                </div>
                <p className="text-[10px] leading-relaxed text-stone-500">{ch.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
