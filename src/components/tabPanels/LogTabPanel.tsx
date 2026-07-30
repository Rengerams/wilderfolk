import { Suspense, lazy } from 'react';
import type { WorldState } from '../../game/gameEngine';

type LogSubTab = 'chronicle' | 'combat';

const EventLogPanel = lazy(() => import('../../game/EventLogPanel'));
const CombatLogPanel = lazy(() => import('../CombatLogPanel'));

export interface LogTabPanelProps {
  state: WorldState;
  logSubTab: LogSubTab;
  setLogSubTab: (tab: LogSubTab) => void;
}

export default function LogTabPanel({ state, logSubTab, setLogSubTab }: LogTabPanelProps) {
  return (
    <div>
      <div className="progress-subnav mb-2">
        {(['chronicle', 'combat'] as LogSubTab[]).map((id) => (
          <button
            key={id}
            type="button"
            data-active={logSubTab === id}
            onClick={() => setLogSubTab(id)}
          >
            {id === 'chronicle' ? '📜 Chronicle' : '⚔️ Combat'}
          </button>
        ))}
      </div>
      {logSubTab === 'chronicle' ? (
        <>
          <h3 className="mb-2 text-sm font-bold text-amber-300">Village Chronicle</h3>
          <p className="mb-2 text-[11px] leading-relaxed text-stone-500">
            Full history of your settlement — births, marriages, scandals, research, disasters, and more.
            Scroll to read older entries, filter by type, or <strong className="text-stone-400">Copy log</strong> to save it in a note. Saved with your game.
          </p>
          <Suspense fallback={<p className="text-[11px] text-stone-500">Loading chronicle…</p>}>
            <EventLogPanel
              events={state.eventLog}
              meta={{
                villageName: state.villageName,
                year: state.year,
                day: state.dayInYear,
                tick: state.tick,
                population: state.humanPopulation,
              }}
            />
          </Suspense>
        </>
      ) : (
        <>
          <h3 className="mb-2 text-sm font-bold text-rose-300">Combat Chronicle</h3>
          <p className="mb-2 text-[11px] leading-relaxed text-stone-500">
            Incoming raids, proactive strikes, counter-raids, militia battles, and barricades — dedicated combat log with export.
          </p>
          <Suspense fallback={<p className="text-[11px] text-stone-500">Loading combat log…</p>}>
            <CombatLogPanel
              events={state.eventLog}
              meta={{
                villageName: state.villageName,
                year: state.year,
                day: state.dayInYear,
                tick: state.tick,
                population: state.humanPopulation,
              }}
            />
          </Suspense>
        </>
      )}
    </div>
  );
}
