import { Suspense, lazy } from 'react';
import type { WorldState } from '../../game/gameEngine';
import type { ChronicleExportMeta } from '../../game/eventLogExport';
// `LogSubTab` is owned by `useGameShellState`; declaring a second same-named union here would
// make added members unreachable.
import type { LogFilter, LogSubTab } from '../../hooks/useGameShellState';

const EventLogPanel = lazy(() => import('../../game/EventLogPanel'));
const CombatLogPanel = lazy(() => import('../CombatLogPanel'));

export interface LogTabPanelProps {
  state: WorldState;
  logSubTab: LogSubTab;
  setLogSubTab: (tab: LogSubTab) => void;
  /** Category the Log door was opened on; `'all'` is the unfiltered chronicle. */
  logFilter: LogFilter;
  setLogFilter: (filter: LogFilter) => void;
}

export default function LogTabPanel({
  state,
  logSubTab,
  setLogSubTab,
  logFilter,
  setLogFilter,
}: LogTabPanelProps) {
  /** One export header for both logs, so a new field cannot make the two exports disagree. */
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
            /* Selection is conveyed by `aria-pressed`, matching the `ProgressTabPanel` strip. */
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
              initialFilter={logFilter}
              onFilterChange={setLogFilter}
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