import { Suspense, lazy, useMemo } from 'react';
import { ResearchType } from '../../game/gameTypes';
import type { WorldState } from '../../game/gameEngine';
import { hasCompletedMarket } from '../../game/tradeCaravans';
import { computeVillagePortrait } from '../../game/villagePortrait';

type ProgressSubTab = 'research' | 'trade' | 'goals';

const ChallengesPanel = lazy(() => import('../ChallengesPanel'));
const StatisticsPanel = lazy(() => import('../../game/StatisticsPanel'));
const ValleyChroniclePanel = lazy(() => import('./ValleyChroniclePanel'));
const DynastyPanel = lazy(() => import('./DynastyPanel'));

const RESEARCH_COLORS: Record<ResearchType, string> = {
  [ResearchType.Agriculture]: '#22c55e',
  [ResearchType.Mining]: '#6b7280',
  [ResearchType.Forestry]: '#92400e',
  [ResearchType.Architecture]: '#3b82f6',
  [ResearchType.Medicine]: '#ec4899',
  [ResearchType.Trade]: '#f59e0b',
  [ResearchType.Education]: '#8b5cf6',
  [ResearchType.Defense]: '#ef4444',
};

export interface ProgressTabPanelProps {
  state: WorldState;
  progressSubTab: ProgressSubTab;
  setProgressSubTab: (tab: ProgressSubTab) => void;
  tradeReadyCount: number;
  onStartResearch: (researchId: string) => void;
  onEstablishTradeRoute: (routeId: string) => void;
}

/** How you play — not a win screen. */
function GoalsPortraitPanel({ state }: { state: WorldState }) {
  // Field-level deps on purpose — recompute only when a portrait input changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const portrait = useMemo(() => computeVillagePortrait(state), [
    state.tick,
    state.year,
    state.humanPopulation,
    state.ecosystemHealth,
    state.valleyStage,
    state.villageReputation,
    state.rivalSettlements,
    state.tradeRoutes,
    state.eventLog.length,
    state.lifetimeStats,
    state.buildings.length,
  ]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-600/35 bg-gradient-to-b from-amber-950/40 to-stone-800/40 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-500/90">How history sees you</p>
        <h3 className="mt-1 text-sm font-bold text-amber-100">
          <span className="mr-1.5" aria-hidden>{portrait.emoji}</span>
          {portrait.title}
        </h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-stone-300">{portrait.summary}</p>
        <p className="mt-2 text-xs text-stone-300">
          No single win screen — raid like barbarians, tend the wild, trade, build, or make peace. This portrait shifts as you play.
        </p>
      </div>

      <div className="rounded-xl bg-stone-700/50 p-3">
        <h3 className="mb-2 text-sm font-bold text-stone-300">Your path (live)</h3>
        <div className="space-y-2">
          {portrait.traits.map((t) => (
            <div key={t.id} className="rounded-lg border border-stone-600/50 bg-stone-800/40 p-2">
              <div className="mb-0.5 flex items-center justify-between gap-2">
                <span className="text-[13px] font-bold text-stone-200">
                  {t.emoji} {t.label}
                </span>
                <span className="text-xs font-semibold tabular-nums text-stone-400">{t.score}</span>
              </div>
              <div className="mb-1 h-1 overflow-hidden rounded-full bg-stone-700">
                <div
                  className={`h-full rounded-full transition-all ${
                    t.id === portrait.primary ? 'bg-amber-500' : 'bg-stone-500'
                  }`}
                  style={{ width: `${t.score}%` }}
                />
              </div>
              <p className="text-xs leading-relaxed text-stone-300">{t.blurb}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-stone-600/40 bg-stone-700/30 p-3">
        <h3 className="mb-2 text-sm font-bold text-amber-300">🏆 Challenges</h3>
        <p className="mb-2 text-xs text-stone-300">Optional goals with resource rewards — not required to “finish” the game.</p>
        <Suspense fallback={<p className="text-[13px] text-stone-300">Loading challenges…</p>}>
          <ChallengesPanel state={state} />
        </Suspense>
      </div>
      <Suspense fallback={<p className="text-[13px] text-stone-300">Loading statistics…</p>}>
        <StatisticsPanel state={state} />
      </Suspense>
    </div>
  );
}

export default function ProgressTabPanel({
  state,
  progressSubTab,
  setProgressSubTab,
  tradeReadyCount,
  onStartResearch,
  onEstablishTradeRoute,
}: ProgressTabPanelProps) {
  return (
    <div className="space-y-3">
      <div className="progress-subnav">
        {(['research', 'trade', 'goals'] as ProgressSubTab[]).map((id) => (
          <button
            key={id}
            type="button"
            className="relative"
            data-active={progressSubTab === id}
            onClick={() => setProgressSubTab(id)}
          >
            {id === 'research' ? '🔬 Research' : id === 'trade' ? '🤝 Trade' : '🎯 Goals'}
            {id === 'research' && state.activeResearch && (
              <span className="progress-subnav-dot" title="Research in progress" />
            )}
            {id === 'trade' && tradeReadyCount > 0 && (
              <span className="progress-subnav-badge">{tradeReadyCount}</span>
            )}
          </button>
        ))}
      </div>

      {progressSubTab === 'research' && (
        <div className="space-y-3">
          {state.activeResearch && (
            <div className="rounded-xl border border-amber-600/30 bg-amber-900/30 p-3">
              <h3 className="mb-1 text-sm font-bold text-amber-400">Researching</h3>
              {(() => {
                const node = state.researchNodes.find(n => n.id === state.activeResearch);
                return node ? (
                  <div>
                    <div className="text-sm font-bold text-white">{node.name}</div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-600">
                      <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${state.researchProgress}%` }} />
                    </div>
                    <div className="mt-1 text-[13px] text-amber-300">{Math.round(state.researchProgress)}% complete</div>
                  </div>
                ) : null;
              })()}
            </div>
          )}

          {Object.values(ResearchType).map(rType => {
            const nodes = state.researchNodes.filter(n => n.type === rType);
            if (nodes.length === 0) return null;
            const color = RESEARCH_COLORS[rType as ResearchType];

            return (
              <div key={rType} className="rounded-xl bg-stone-700/50 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                  <h3 className="text-sm font-bold capitalize" style={{ color }}>{rType}</h3>
                </div>
                <div className="space-y-1.5">
                  {nodes.map(node => {
                    const canResearch = node.unlocked && !node.researched && !state.activeResearch &&
                      state.resources.wood >= node.cost.wood &&
                      state.resources.stone >= node.cost.stone &&
                      state.resources.gold >= node.cost.gold;

                    return (
                      <div key={node.id} className={`rounded-lg border p-2 text-[13px] ${
                        node.researched ? 'border-emerald-500/30 bg-emerald-500/10' :
                        node.unlocked ? 'border-stone-600 bg-stone-600/20' :
                        'border-stone-700 bg-stone-800 opacity-50'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-stone-200">{node.name}</span>
                          <span className="text-[10px] text-stone-400">T{node.tier}</span>
                        </div>
                        <p className="mt-0.5 text-stone-300">{node.description}</p>
                        {!node.researched && (
                          <>
                            <div className="mt-1 text-stone-400">
                              Cost: {node.cost.wood > 0 && `${node.cost.wood}w `}
                              {node.cost.stone > 0 && `${node.cost.stone}s `}
                              {node.cost.gold > 0 && `${node.cost.gold}g`}
                            </div>
                            {node.unlocked && (
                              <button onClick={() => onStartResearch(node.id)}
                                disabled={!canResearch}
                                className={`mt-1 w-full rounded py-1 text-[13px] font-bold transition-all ${
                                  canResearch ? 'bg-amber-600 text-white hover:bg-amber-500' : 'bg-stone-600 text-stone-400 cursor-not-allowed'
                                }`}>
                                {state.activeResearch === node.id ? 'Researching...' : 'Research'}
                              </button>
                            )}
                          </>
                        )}
                        {node.researched && <span className="text-emerald-400">✓ Researched</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {progressSubTab === 'trade' && (
        <div className="space-y-3">
          <div className="rounded-xl bg-stone-700/50 p-3">
            <h3 className="mb-2 text-sm font-bold text-stone-300">Trade Routes</h3>
            <p className="mb-2 text-[13px] text-stone-300">Reputation: <strong className="text-emerald-400">{state.villageReputation}</strong> / 100</p>
            {!hasCompletedMarket(state) && (
              <p className="mb-2 text-[13px] text-amber-400">
                Build a completed Market before establishing long-range trade routes.
              </p>
            )}

            <div className="space-y-2">
              {state.tradeRoutes.map(route => {
                const marketOk = hasCompletedMarket(state);
                const repOk = state.villageReputation >= route.reputationRequired;
                const canEstablish = marketOk && repOk;
                return (
                <div key={route.id} className={`rounded-lg border p-2 text-[13px] ${
                  route.active ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-stone-600 bg-stone-600/20'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-stone-200">{route.targetName}</span>
                    <span className={route.active ? 'text-emerald-400' : 'text-stone-400'}>
                      {route.active
                        ? 'Active'
                        : !marketOk
                          ? 'Need Market'
                          : `Need ${route.reputationRequired} rep`}
                    </span>
                  </div>
                  <p className="text-stone-300">
                    Receive: +{route.resourcesReceived.gold > 0 ? `${route.resourcesReceived.gold}g` : `${route.resourcesReceived.stone}s`} per round-trip
                  </p>
                  {route.active && (
                    <p className="text-emerald-300/80">
                      {route.caravanCarrierId != null
                        ? `🚚 Merchant en route (${route.caravanLeg === 'inbound' ? 'returning' : route.caravanLeg === 'at_partner' ? 'at partner' : 'outbound'})`
                        : `Trips completed: ${route.caravansCompleted ?? 0}`}
                    </p>
                  )}
                  {!route.active && (
                    <button onClick={() => onEstablishTradeRoute(route.id)}
                      disabled={!canEstablish}
                      className={`mt-1 w-full rounded py-1 text-[13px] font-bold transition-all ${
                        canEstablish ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-stone-600 text-stone-400 cursor-not-allowed'
                      }`}>
                      Establish Route
                    </button>
                  )}
                </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {progressSubTab === 'goals' && (
        <>
          <Suspense fallback={<p className="text-[13px] text-stone-300">Loading chronicle…</p>}>
            <ValleyChroniclePanel state={state} />
          </Suspense>
          <Suspense fallback={<p className="text-[13px] text-stone-300">Loading dynasties…</p>}>
            <DynastyPanel state={state} />
          </Suspense>
          <GoalsPortraitPanel state={state} />
        </>
      )}
    </div>
  );
}
