import { Suspense, lazy, useMemo, useState } from 'react';
import { ResearchType } from '../../game/gameTypes';
import type { WorldState } from '../../game/gameEngine';
import { canEstablishTradeRoute, hasCompletedMarket } from '../../game/tradeCaravans';
import { canStartResearch } from '../../game/research';
import { computeVillagePortrait } from '../../game/villagePortrait';
import { formatResourceAmounts } from '../../game/resourceTypes';
import SubjectWindow from '../SubjectWindow';
// A-8: the sub-tab union is owned by the shell hook. A member added there compiled fine against this
// file's private copy and was then unreachable, because nothing here could name it.
import type { ProgressSubTab } from '../../hooks/useGameShellState';

const ChallengesPanel = lazy(() => import('../ChallengesPanel'));
const StatisticsPanel = lazy(() => import('../../game/StatisticsPanel'));
const ValleyChroniclePanel = lazy(() => import('./ValleyChroniclePanel'));
const DynastyPanel = lazy(() => import('./DynastyPanel'));

/**
 * The six subjects of the Goals sub-tab — one owner for the index buttons and for the windows they
 * open, so a subject cannot be listed without a window behind it.
 */
type ProgressSubjectId = 'portrait' | 'path' | 'challenges' | 'statistics' | 'chronicle' | 'dynasty';

const PROGRESS_SUBJECTS: ReadonlyArray<{ id: ProgressSubjectId; icon: string; label: string; hint: string }> = [
  { id: 'portrait', icon: '🏛️', label: 'How history sees you', hint: 'The village portrait and what shapes it' },
  { id: 'path', icon: '🧭', label: 'Your path (live)', hint: 'Every trait, scored as you play' },
  { id: 'challenges', icon: '🏆', label: 'Challenges', hint: 'Optional goals with resource rewards' },
  { id: 'statistics', icon: '📊', label: 'Valley statistics', hint: "Lifetime totals and this year's figures" },
  { id: 'chronicle', icon: '📜', label: 'Valley chronicle', hint: 'What has happened in the valley so far' },
  { id: 'dynasty', icon: '🌳', label: 'Dynasties', hint: 'Family lines and succession' },
];

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

/** How you play — not a win screen. Its four subjects render as windows, opened from the Goals index. */
function GoalsPortraitPanel({
  state,
  openSubject,
  onClose,
}: {
  state: WorldState;
  openSubject: ProgressSubjectId | null;
  onClose: () => void;
}) {
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
  const primaryTrait = portrait.traits.find((t) => t.id === portrait.primary);

  return (
    <div className="space-y-3">
      <SubjectWindow
        windowKey="progress-portrait"
        open={openSubject === 'portrait'}
        onClose={onClose}
        icon={portrait.emoji}
        title="How history sees you"
        subtitle={portrait.title}
      >
        <h3 className="text-sm font-bold text-amber-100">{portrait.title}</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-stone-300">{portrait.summary}</p>
        <p className="mt-2 text-xs text-stone-300">
          No single win screen — raid like barbarians, tend the wild, trade, build, or make peace. This portrait shifts as you play.
        </p>
      </SubjectWindow>

      <SubjectWindow
        windowKey="progress-path"
        open={openSubject === 'path'}
        onClose={onClose}
        icon="🧭"
        title="Your path (live)"
        subtitle={primaryTrait ? `Strongest: ${primaryTrait.label}${primaryTrait.score != null ? ` (${primaryTrait.score})` : ''}` : 'Every trait, scored as you play'}
      >
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
      </SubjectWindow>

      <SubjectWindow
        windowKey="progress-challenges"
        open={openSubject === 'challenges'}
        onClose={onClose}
        icon="🏆"
        title="Challenges"
        subtitle="Optional goals with resource rewards"
      >
        <Suspense fallback={<p className="text-[13px] text-stone-300">Loading challenges…</p>}>
          <ChallengesPanel state={state} />
        </Suspense>
      </SubjectWindow>

      <SubjectWindow
        windowKey="progress-statistics"
        open={openSubject === 'statistics'}
        onClose={onClose}
        icon="📊"
        title="Valley statistics"
        subtitle="Lifetime totals and this year's figures"
      >
        <Suspense fallback={<p className="text-[13px] text-stone-300">Loading statistics…</p>}>
          <StatisticsPanel state={state} />
        </Suspense>
      </SubjectWindow>
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
  /**
   * Which goals subject's window is open, if any.
   *
   * The owner's ruling reaches this panel too — *"each subject should just have its own window not
   * stacking up"* — so the six `CollapsibleSection`s that used to scroll here (four inside
   * `GoalsPortraitPanel`, two in the goals branch) are one **index** and one window each. The
   * Research/Trade branches keep their existing inline lists: they were never the measured stack, and
   * the sub-nav above still selects between the three groups.
   */
  const [openSubject, setOpenSubject] = useState<ProgressSubjectId | null>(null);
  return (
    <div className="space-y-3">
      <div className="progress-subnav">
        {(['research', 'trade', 'goals'] as ProgressSubTab[]).map((id) => (
          <button
            key={id}
            type="button"
            className="relative"
            data-active={progressSubTab === id}
            /* The selected sub-tab was conveyed by colour alone (`data-active` + CSS); R32. */
            aria-pressed={progressSubTab === id}
            onClick={() => setProgressSubTab(id)}
          >
            {id === 'research' ? '🔬 Research' : id === 'trade' ? '🤝 Trade' : '🎯 Goals'}
            {id === 'research' && state.activeResearch && (
              <span className="progress-subnav-dot" title="Research in progress" />
            )}
            {id === 'trade' && tradeReadyCount > 0 && (
              <span className="progress-subnav-badge" title={`${tradeReadyCount} ready to establish`}>
                {tradeReadyCount}
              </span>
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
                    /**
                     * The research owner's gate, not a second copy of it: the local test dropped
                     * `node.prerequisites`, so the panel offered a Research button for a node whose
 * prerequisites were unmet and the command refused it.
                     */
                    const canResearch = canStartResearch(state, node.id);

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
                                /**
                                 * U-8: `canStartResearch` returns a bare boolean, so this view has no
                                 * reason to print — but the disabled button must still say *which* node
                                 * it belongs to and that it is unavailable, rather than looking like a
                                 * live "Research" button that is merely greyed out. A real reason needs
                                 * the research owner to return a gate object.
                                 */
                                aria-label={canResearch
                                  ? `Research ${node.name}`
                                  : `Research ${node.name} — not available yet`}
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
                Build a completed Market before establishing long-range trade routes — the coin→materials
                routes below are exempt, so a colony with gold can still buy wood, stone or food.
              </p>
            )}

            <div className="space-y-2">
              {state.tradeRoutes.map(route => {
                // Eligibility comes from the trade owner, never from a copy of its rule: the
                // owner exempts the coin→materials rescue routes from the Market requirement, and
                // a locally restated Market-and-reputation check used to disable exactly those
                // three (`BUG_REPORTS/2026-09-16-material-purchase-trade-routes-unreachable.md`).
                const eligibility = canEstablishTradeRoute(state, route.id);
                const canEstablish = eligibility.ok;
                return (
                <div key={route.id} className={`rounded-lg border p-2 text-[13px] ${
                  route.active ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-stone-600 bg-stone-600/20'
                }`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-stone-200">{route.targetName}</span>
                    <span className={`text-right ${route.active ? 'text-emerald-400' : 'text-stone-400'}`}>
                      {/* An establishable inactive route must not read "Unavailable" above its own
                          enabled button (2026-09-17 UI audit, R4). */}
                      {route.active
                        ? 'Active'
                        : eligibility.ok
                          ? 'Ready to establish'
                          : eligibility.blockReason ?? 'Unavailable'}
                    </span>
                  </div>
                  <p className="text-stone-300">
                    Receive: +{formatResourceAmounts(route.resourcesReceived)} per round-trip
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
          {/* The index: one button per subject, nothing stacked behind it. */}
          <div className="grid gap-1 sm:grid-cols-2">
            {PROGRESS_SUBJECTS.map((subject) => (
              <button
                key={subject.id}
                type="button"
                onClick={() => setOpenSubject(subject.id)}
                aria-current={openSubject === subject.id}
                className={`block w-full rounded-lg px-2 py-1.5 text-left ring-1 transition-colors ${
                  openSubject === subject.id
                    ? 'bg-amber-900/50 ring-amber-500/50'
                    : 'bg-stone-800/60 ring-stone-600/40 hover:bg-stone-700/60'
                }`}
              >
                <span className="flex items-center gap-1 text-[12px] font-bold text-stone-100">
                  <span aria-hidden>{subject.icon}</span>
                  {subject.label}
                  <span aria-hidden className="ml-auto text-stone-400">↗</span>
                </span>
                <span className="block text-[10px] leading-snug text-stone-400">{subject.hint}</span>
              </button>
            ))}
          </div>

          <SubjectWindow
            windowKey="progress-chronicle"
            open={openSubject === 'chronicle'}
            onClose={() => setOpenSubject(null)}
            icon="📜"
            title="Valley chronicle"
            subtitle="What has happened in the valley so far"
          >
            <Suspense fallback={<p className="text-[13px] text-stone-300">Loading chronicle…</p>}>
              <ValleyChroniclePanel state={state} />
            </Suspense>
          </SubjectWindow>

          <SubjectWindow
            windowKey="progress-dynasty"
            open={openSubject === 'dynasty'}
            onClose={() => setOpenSubject(null)}
            icon="🌳"
            title="Dynasties"
            subtitle="Family lines and succession"
          >
            <Suspense fallback={<p className="text-[13px] text-stone-300">Loading dynasties…</p>}>
              <DynastyPanel state={state} />
            </Suspense>
          </SubjectWindow>

          {/* Its four subjects are windows too; the buttons for them are in the index above, so this
              component owns only the bodies and the portrait computation they share. */}
          <GoalsPortraitPanel
            state={state}
            openSubject={openSubject}
            onClose={() => setOpenSubject(null)}
          />
        </>
      )}
    </div>
  );
}