import type { WorldState } from '../../game/gameTypes';
import { computeDynasties } from '../../game/familyLegacy';

/** Family legacy — living dynasties: surnames with multiple generations. */
export default function DynastyPanel({ state }: { state: WorldState }) {
  const dynasties = computeDynasties(state);
  const meaningful = dynasties.filter((d) => d.generationsAlive >= 2);

  return (
    <div className="rounded-xl border border-violet-600/40 bg-gradient-to-br from-violet-950/40 to-stone-800/50 p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-violet-300">👑 Dynasties</h3>
        <span className="font-mono text-[11px] text-stone-500">{meaningful.length}</span>
      </div>
      <p className="mb-2 text-[10px] leading-relaxed text-stone-500">
        Families that live across generations — founders, children, grandchildren. Three generations alive is a true dynasty.
      </p>
      {meaningful.length === 0 ? (
        <p className="text-[11px] text-stone-600">No multi-generation families yet — let the valley live a while.</p>
      ) : (
        <div className="space-y-1">
          {meaningful.map((d) => (
            <div key={d.surname} className="flex items-center justify-between gap-2 rounded-lg bg-stone-900/40 px-2 py-1.5">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-stone-200">{d.surname}</p>
                <p className="text-[9px] text-stone-500">{d.members} living family members</p>
              </div>
              <span className="shrink-0 text-[10px] font-semibold text-violet-300">
                {d.generationsAlive} {d.generationsAlive === 1 ? 'generation' : 'generations'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
