import { Suspense, lazy } from 'react';
import { ResearchType } from '../../game/gameTypes';
import type { WorldState } from '../../game/gameEngine';
import { ACTIVE_VICTORY_PATHS, COMING_SOON_VICTORY_PATHS } from '../../game/victory';
import { hasCompletedMarket } from '../../game/tradeCaravans';

type ProgressSubTab = 'research' | 'trade' | 'goals';

const ChallengesPanel = lazy(() => import('../ChallengesPanel'));
const StatisticsPanel = lazy(() => import('../../game/StatisticsPanel'));

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
                    <div className="mt-1 text-[11px] text-amber-300">{Math.round(state.researchProgress)}% complete</div>
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
                  <h3 className="text-xs font-bold capitalize" style={{ color }}>{rType}</h3>
                </div>
                <div className="space-y-1.5">
                  {nodes.map(node => {
                    const canResearch = node.unlocked && !node.researched && !state.activeResearch &&
                      state.resources.wood >= node.cost.wood &&
                      state.resources.stone >= node.cost.stone &&
                      state.resources.gold >= node.cost.gold;

                    return (
                      <div key={node.id} className={`rounded-lg border p-2 text-[11px] ${
                        node.researched ? 'border-emerald-500/30 bg-emerald-500/10' :
                        node.unlocked ? 'border-stone-600 bg-stone-600/20' :
                        'border-stone-700 bg-stone-800 opacity-50'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-stone-200">{node.name}</span>
                          <span className="text-[8px] text-stone-500">T{node.tier}</span>
                        </div>
                        <p className="mt-0.5 text-stone-400">{node.description}</p>
                        {!node.researched && (
                          <>
                            <div className="mt-1 text-stone-500">
                              Cost: {node.cost.wood > 0 && `${node.cost.wood}w `}
                              {node.cost.stone > 0 && `${node.cost.stone}s `}
                              {node.cost.gold > 0 && `${node.cost.gold}g`}
                            </div>
                            {node.unlocked && (
                              <button onClick={() => onStartResearch(node.id)}
                                disabled={!canResearch}
                                className={`mt-1 w-full rounded py-1 text-[11px] font-bold transition-all ${
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
            <p className="mb-2 text-[11px] text-stone-400">Reputation: <strong className="text-emerald-400">{state.villageReputation}</strong> / 100</p>
            {!hasCompletedMarket(state) && (
              <p className="mb-2 text-[11px] text-amber-400">
                Build a completed Market before establishing long-range trade routes.
              </p>
            )}

            <div className="space-y-2">
              {state.tradeRoutes.map(route => {
                const marketOk = hasCompletedMarket(state);
                const repOk = state.villageReputation >= route.reputationRequired;
                const canEstablish = marketOk && repOk;
                return (
                <div key={route.id} className={`rounded-lg border p-2 text-[11px] ${
                  route.active ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-stone-600 bg-stone-600/20'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-stone-200">{route.targetName}</span>
                    <span className={route.active ? 'text-emerald-400' : 'text-stone-500'}>
                      {route.active
                        ? 'Active'
                        : !marketOk
                          ? 'Need Market'
                          : `Need ${route.reputationRequired} rep`}
                    </span>
                  </div>
                  <p className="text-stone-400">
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
                      className={`mt-1 w-full rounded py-1 text-[11px] font-bold transition-all ${
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
        <div className="space-y-3">
          {state.victoryAchieved && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-center">
              <span className="text-2xl">🏆</span>
              <h3 className="text-sm font-bold text-amber-300">Victory Achieved!</h3>
              <p className="text-[11px] text-amber-200/80">
                {state.victories.find(v => v.path === state.victoryAchieved)?.label}
              </p>
            </div>
          )}
          <div className="rounded-xl bg-stone-700/50 p-3">
            <h3 className="mb-2 text-sm font-bold text-stone-300">Victory Paths</h3>
            <p className="mb-2 text-[11px] text-stone-400 leading-relaxed">
              Pursue any of four victory legacies — eco, city, trade, or harmony with the wild.
            </p>
            <details className="mb-3 rounded-lg border border-stone-600/60 bg-stone-800/40">
              <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-semibold text-stone-300 hover:text-stone-200">
                How each path works
              </summary>
              <ul className="space-y-1.5 border-t border-stone-600/40 px-2 py-2 text-[11px] leading-relaxed text-stone-400">
                <li><strong className="text-stone-300">🌿 Eco-Utopia</strong> — 250 people and a healthy ecosystem for 20 years.</li>
                <li><strong className="text-stone-300">🏰 Great City</strong> — 400 people and 60 finished buildings.</li>
                <li><strong className="text-stone-300">💰 Trade Empire</strong> — open all 7 trade routes; merchants <em>walk</em> each route (hub → partner → back). Complete 40 round-trips and earn 50,000 gold from caravan trade. Watch the map **🚚** line and Progress → Trade for status.</li>
                <li><strong className="text-stone-300">🐺 Harmony</strong> — 8 <em>wild</em> wolves in the valley (untamed — Taming Post does not count) plus 15 wildkin.</li>
                <li className="text-stone-500 pt-1 border-t border-stone-700/50">
                  <strong className="text-stone-400">Raids & elections</strong> — raid fighters earn Guard XP; the village head gets extra XP and reputation on wins, which feeds merit elections (all skills ×2) and the incumbent record score.
                </li>
              </ul>
            </details>
            <div className="space-y-2">
              {state.victories.filter((v) => ACTIVE_VICTORY_PATHS.includes(v.path as typeof ACTIVE_VICTORY_PATHS[number])).map(v => (
                <div key={v.path} className={`rounded-lg border p-2 ${
                  v.achieved ? 'border-amber-500/40 bg-amber-500/10' : 'border-stone-600 bg-stone-600/20'
                }`}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-stone-200">{v.label}</span>
                    <span className={`text-[11px] font-bold ${v.achieved ? 'text-amber-400' : 'text-stone-500'}`}>
                      {v.achieved ? '✓ Won' : `${v.progress}%`}
                    </span>
                  </div>
                  <p className="mb-1.5 text-[11px] text-stone-400">{v.description}</p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-stone-700">
                    <div
                      className={`h-full rounded-full transition-all ${v.achieved ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${v.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {COMING_SOON_VICTORY_PATHS.length > 0 && (
              <details className="mt-3 rounded-lg border border-stone-600/60 bg-stone-800/40">
                <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-semibold text-stone-400 hover:text-stone-300">
                  Coming later
                </summary>
                <div className="space-y-2 border-t border-stone-600/40 p-2">
                  {state.victories.filter((v) => COMING_SOON_VICTORY_PATHS.includes(v.path as typeof COMING_SOON_VICTORY_PATHS[number])).map(v => (
                    <div key={v.path} className="rounded-lg border border-stone-700 bg-stone-700/20 p-2 opacity-70">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-stone-300">{v.label}</span>
                        <span className="text-[11px] font-bold text-stone-500">Soon</span>
                      </div>
                      <p className="text-[11px] text-stone-500">{v.description}</p>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
          <div className="rounded-xl border border-stone-600/40 bg-stone-700/30 p-3">
            <h3 className="mb-2 text-sm font-bold text-amber-300">🏆 Challenges</h3>
            <Suspense fallback={<p className="text-[11px] text-stone-500">Loading challenges…</p>}>
              <ChallengesPanel state={state} />
            </Suspense>
          </div>
          <Suspense fallback={<p className="text-[11px] text-stone-500">Loading statistics…</p>}>
            <StatisticsPanel state={state} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
