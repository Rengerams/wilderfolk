import { Suspense, lazy } from 'react';
import type { WorldState } from '../../game/gameEngine';
import type { ChronicleExportMeta } from '../../game/eventLogExport';
// `LogSubTab` is owned by `useGameShellState` (audit C2 "the sub-tab unions"). This file used to
// declare a second, same-named union: the copies were contravariant-compatible, so a member added to
// the owner compiled here and was simply unreachable — the identical drift `hotkeys.ts` documents
// for `SidebarTab` (2026-09-20 audit, A8).
import type { LogSubTab } from '../../hooks/useGameShellState';

const EventLogPanel = lazy(() => import('../../game/EventLogPanel'));
const CombatLogPanel = lazy(() => import('../CombatLogPanel'));

export interface LogTabPanelProps {
  state: WorldState;
  logSubTab: LogSubTab;
  setLogSubTab: (tab: LogSubTab) => void;
}

export default function LogTabPanel({ state, logSubTab, setLogSubTab }: LogTabPanelProps) {
  /**
   * One export header for both logs. The identical object used to be built inline in each branch,
   * so adding a field meant two edits and a chance the two logs exported different headers
   * (audit C1 clone 7).
   */
  const logMeta: ChronicleExportMeta = {
    villageName: state.villageName,
    year: state.year,
    day: state.dayInYear,
    tick: state.tick,
    population: state.humanPopulation,
  };
  return (
    <div>
      <div className="progress-subnav mb-2">
        {(['chronicle', 'combat'] as LogSubTab[]).map((id) => (
          <button
            key={id}
            type="button"
            data-active={logSubTab === id}
            /* The selected sub-tab was conveyed by colour alone (`data-active` + CSS); the same
               `aria-pressed` pattern `ProgressTabPanel` uses for its strip (2026-09-20 audit, A6). */
            aria-pressed={logSubTab === id}
            onClick={() => setLogSubTab(id)}
          >
            {id === 'chronicle' ? '📜 Chronicle' : '⚔️ Combat'}
          </button>
        ))}
      </div>
      {logSubTab === 'chronicle' ? (
        <>
          <h3 className="mb-2 text-sm font-bold text-amber-300">Village Chronicle</h3>
          <p className="mb-2 text-[13px] leading-relaxed text-stone-300">
            Full history of your settlement — births, marriages, scandals, research, disasters, and more.
            Scroll to read older entries, filter by type, or <strong className="text-stone-400">Copy</strong> to save it in a note. Saved with your game.
          </p>
          <Suspense fallback={<p className="text-[13px] text-stone-300">Loading chronicle…</p>}>
            <EventLogPanel
              events={state.eventLog}
              meta={logMeta}
            />
          </Suspense>
        </>
      ) : (
        <>
          <h3 className="mb-2 text-sm font-bold text-rose-300">Combat Chronicle</h3>
          <p className="mb-2 text-[13px] leading-relaxed text-stone-300">
            Incoming raids, proactive strikes, counter-raids, militia battles, and barricades — dedicated combat log with export.
          </p>
          <Suspense fallback={<p className="text-[13px] text-stone-300">Loading combat log…</p>}>
            <CombatLogPanel
              events={state.eventLog}
              meta={logMeta}
            />
          </Suspense>
        </>
      )}
    </div>
  );
}