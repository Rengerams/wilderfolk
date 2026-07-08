import { useMemo } from 'react';
import type { GameEventLog } from '../game/gameTypes';
import { summarizeCombatEvents } from '../game/eventLog';
import {
  downloadChronicleCSV,
  downloadChronicleJSON,
  downloadChronicleLog,
  type ChronicleExportMeta,
} from '../game/eventLogExport';

interface Props {
  events: GameEventLog[];
  meta: ChronicleExportMeta;
}

const IN_GAME_LIMIT = 500;

function formatLine(evt: GameEventLog): string {
  return `Year ${evt.year}, Day ${evt.day} — ${evt.message}`;
}

export default function CombatLogPanel({ events, meta }: Props) {
  const combatEvents = useMemo(
    () => events.filter((e) => e.type === 'combat'),
    [events],
  );
  const shown = useMemo(
    () => combatEvents.slice(0, IN_GAME_LIMIT),
    [combatEvents],
  );

  const stats = useMemo(() => summarizeCombatEvents(combatEvents), [combatEvents]);

  const exportCombat = () => {
    downloadChronicleLog(combatEvents, { ...meta, villageName: `${meta.villageName} — Combat` });
  };

  if (combatEvents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-stone-600 bg-stone-800/50 p-3 text-center">
        <p className="text-[10px] text-stone-400">No combat entries yet.</p>
        <p className="mt-1 text-[10px] text-stone-500">
          Raid outcomes after your preparation choices — no battle screen. Entries appear once raids resolve.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-rose-900/40 bg-rose-950/20 p-2">
        <div className="text-center">
          <p className="text-[8px] uppercase tracking-wider text-stone-500">Entries</p>
          <p className="text-sm font-bold text-rose-300">{stats.total}</p>
        </div>
        <div className="text-center">
          <p className="text-[8px] uppercase tracking-wider text-stone-500">Raid-related</p>
          <p className="text-sm font-bold text-amber-300">{stats.raids}</p>
        </div>
        <div className="text-center">
          <p className="text-[8px] uppercase tracking-wider text-stone-500">Defenses</p>
          <p className="text-sm font-bold text-emerald-300">{stats.defended}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={exportCombat}
          className="rounded border border-stone-600 px-2 py-0.5 text-[9px] text-stone-300 hover:bg-stone-700"
        >
          Download combat .txt
        </button>
        <button
          type="button"
          onClick={() => downloadChronicleJSON(combatEvents, meta)}
          className="rounded border border-stone-600 px-2 py-0.5 text-[9px] text-stone-300 hover:bg-stone-700"
        >
          .json
        </button>
        <button
          type="button"
          onClick={() => downloadChronicleCSV(combatEvents, meta)}
          className="rounded border border-stone-600 px-2 py-0.5 text-[9px] text-stone-300 hover:bg-stone-700"
        >
          .csv
        </button>
      </div>

      <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-stone-700 bg-stone-900/60 p-2">
        {shown.map((evt) => (
          <p key={evt.id} className="text-[10px] leading-relaxed text-rose-200/90">
            {formatLine(evt)}
          </p>
        ))}
      </div>
      {combatEvents.length > IN_GAME_LIMIT && (
        <p className="text-center text-[8px] text-stone-500">
          Showing latest {IN_GAME_LIMIT} of {combatEvents.length} combat entries (full log in save).
        </p>
      )}
    </div>
  );
}