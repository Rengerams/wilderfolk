/**
 * Full-screen People overview — citizen health first, then world & chronicle.
 * Presentation only; all simulation changes go through typed command callbacks.
 */
import { Suspense, lazy, useEffect, useRef } from 'react';
import type { Entity, WorldState } from '../game/gameTypes';
import { computeCitizenOverview } from '../game/citizenOverview';
import type { VillageStatsSummary } from '../game/uiSimSummary';
import type { FocusHintAction } from '../game/focusHints';
import type {
  OverviewNavId,
  OverviewSection,
  OverviewWorldFocus,
  ProgressSubTab,
  LogSubTab,
  MoreSubTab,
} from '../hooks/useGameShellState';
import { overviewNavFromState } from '../hooks/useGameShellState';
import WorkSchedulePanel from './WorkSchedulePanel';
import VenueSchedulePanel from './VenueSchedulePanel';

const VillageTabPanel = lazy(() => import('./tabPanels/VillageTabPanel'));
const FrontierTabPanel = lazy(() => import('./tabPanels/FrontierTabPanel'));
const NatureTabPanel = lazy(() => import('./tabPanels/NatureTabPanel'));
const ProgressTabPanel = lazy(() => import('./tabPanels/ProgressTabPanel'));
const LogTabPanel = lazy(() => import('./tabPanels/LogTabPanel'));
const MoreTabPanel = lazy(() => import('./tabPanels/MoreTabPanel'));

export type { OverviewSection, OverviewWorldFocus };

export interface CitizenOverviewScreenProps {
  state: WorldState;
  villageStats: VillageStatsSummary;
  favoriteEntityId?: number | null;
  pendingRaidCount: number;
  pendingOutgoingRaidCount: number;
  pendingDiplomacyCount: number;
  tradeReadyCount: number;
  /** Controlled section from the Overview button / hotkeys. */
  section: OverviewSection;
  /** When World is open, which panel to show. */
  worldFocus?: OverviewWorldFocus | null;
  /** In-overlay tab strip — choose Village / Nature / … from here. */
  onNavChange: (id: OverviewNavId) => void;
  progressSubTab: ProgressSubTab;
  setProgressSubTab: (tab: ProgressSubTab) => void;
  logSubTab: LogSubTab;
  setLogSubTab: (tab: LogSubTab) => void;
  moreSubTab: MoreSubTab;
  setMoreSubTab: (tab: MoreSubTab) => void;
  tutorialsEnabled: boolean;
  onClose: () => void;
  onRecruitSettler: () => void;
  onFocusBuilding: (buildingId: number, cx: number, cy: number) => void;
  onFocusCitizen: (entity: Entity) => void;
  onToggleFavoriteCitizen?: (entityId: number) => void;
  onHintAction: (action: FocusHintAction) => void;
  onApplyWorkSchedule: (startHour: number, endHour: number) => void;
  onApplyVenueSchedule: (venue: import('../game/venueSchedule').VenueScheduleKind, startHour: number, endHour: number) => void;
  onFocusVisitor: (id: string, x: number, y: number) => void;
  onFocusRival: (id: string, x: number, y: number, buildingId?: number) => void;
  onLaunchRaid: (rivalId: string) => void;
  onStartResearch: (researchId: string) => void;
  onEstablishTradeRoute: (routeId: string) => void;
  onReplayTutorial: () => void;
  onToggleTutorials: () => void;
  onSpawnMoonHowlerDebug: () => void;
  onStartGuidedCampaign: () => void;
  suppressHintIds?: string[];
}

function StatusCard({
  label,
  value,
  detail,
  tone = 'neutral',
  icon,
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: 'good' | 'warn' | 'bad' | 'neutral' | 'life';
  icon: string;
}) {
  const toneClass =
    tone === 'good'
      ? 'border-emerald-500/35 bg-emerald-950/40'
      : tone === 'warn'
        ? 'border-amber-500/35 bg-amber-950/35'
        : tone === 'bad'
          ? 'border-rose-500/40 bg-rose-950/40'
          : tone === 'life'
            ? 'border-pink-500/35 bg-pink-950/30'
            : 'border-stone-600/40 bg-stone-900/50';
  const valueClass =
    tone === 'good'
      ? 'text-emerald-200'
      : tone === 'warn'
        ? 'text-amber-200'
        : tone === 'bad'
          ? 'text-rose-200'
          : tone === 'life'
            ? 'text-pink-200'
            : 'text-stone-50';

  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-lg ${toneClass}`}>
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-stone-400">
        <span aria-hidden>{icon}</span>
        <span>{label}</span>
      </div>
      <p className={`mt-1 text-2xl font-black tabular-nums sm:text-3xl ${valueClass}`}>{value}</p>
      {detail ? <p className="mt-1 text-[13px] leading-snug text-stone-300">{detail}</p> : null}
    </div>
  );
}

export default function CitizenOverviewScreen({
  state,
  villageStats,
  favoriteEntityId,
  pendingRaidCount,
  pendingOutgoingRaidCount,
  pendingDiplomacyCount,
  tradeReadyCount,
  section,
  worldFocus = null,
  onNavChange,
  progressSubTab,
  setProgressSubTab,
  logSubTab,
  setLogSubTab,
  moreSubTab,
  setMoreSubTab,
  tutorialsEnabled,
  onClose,
  onRecruitSettler,
  onFocusBuilding,
  onFocusCitizen,
  onToggleFavoriteCitizen,
  onHintAction,
  onApplyWorkSchedule,
  onApplyVenueSchedule,
  onFocusVisitor,
  onFocusRival,
  onLaunchRaid,
  onStartResearch,
  onEstablishTradeRoute,
  onReplayTutorial,
  onToggleTutorials,
  onSpawnMoonHowlerDebug,
  onStartGuidedCampaign,
  suppressHintIds = [],
}: CitizenOverviewScreenProps) {
  const overview = computeCitizenOverview(state);
  const worldFocusRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (section !== 'world' || !worldFocus || !worldFocusRef.current) return;
    worldFocusRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [section, worldFocus]);

  const moodTone =
    overview.mood === 'thriving' || overview.mood === 'stable'
      ? 'good'
      : overview.mood === 'strained' || overview.mood === 'scandal'
        ? 'warn'
        : 'bad';

  const activeNav = overviewNavFromState(section, worldFocus ?? null);

  const navTabs: { id: OverviewNavId; label: string; hint: string }[] = [
    { id: 'people', label: 'Village', hint: 'Citizens, housing, work hours' },
    { id: 'frontier', label: 'Frontier', hint: 'Visitors, rivals, raids' },
    { id: 'nature', label: 'Nature', hint: 'Ecosystem and wildlife' },
    { id: 'progress', label: 'Progress', hint: 'Research, trade, goals' },
    { id: 'chronicle', label: 'Log', hint: 'Births, deaths, scandals' },
    { id: 'help', label: 'More', hint: 'Guide and roadmap' },
  ];

  const titleByNav: Record<OverviewNavId, { eyebrow: string; title: string }> = {
    people: { eyebrow: 'Valley overview', title: 'How are your citizens doing?' },
    frontier: { eyebrow: 'Valley overview', title: 'Visitors, rivals, and raids' },
    nature: { eyebrow: 'Valley overview', title: 'Wildlife and the valley' },
    progress: { eyebrow: 'Valley overview', title: 'Research, trade, and goals' },
    chronicle: { eyebrow: 'Valley overview', title: 'What happened in the valley' },
    help: { eyebrow: 'Valley overview', title: 'Guide and campaign help' },
  };

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[60] flex items-stretch justify-center bg-stone-950/80 p-2 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Valley overview"
    >
      <div className="flex h-full w-full max-w-[min(72rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-stone-600/50 bg-stone-950 shadow-2xl shadow-black/50">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-stone-700/80 bg-stone-900/90 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-400">
              {titleByNav[activeNav].eyebrow}
            </p>
            <h2 className="truncate text-xl font-black text-stone-50 sm:text-2xl">
              {titleByNav[activeNav].title}
            </h2>
            <p className="mt-0.5 text-[13px] text-stone-300">
              {overview.moodLabel} — {overview.moodDetail}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-stone-800 px-3 py-2 text-sm font-bold text-stone-200 ring-1 ring-stone-600 hover:bg-stone-700"
            title="Close (Esc)"
          >
            Close ✕
          </button>
        </header>

        <div className="shrink-0 border-b border-stone-800 bg-stone-950/80 px-4 py-3 sm:px-5">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <StatusCard
              icon="👥"
              label="People"
              value={overview.total}
              detail={`${overview.adults} adults · ${overview.children} children`}
              tone="neutral"
            />
            <StatusCard
              icon="⚒️"
              label="Work"
              value={`${overview.working}/${overview.adults || 0}`}
              detail={`${overview.idle} idle`}
              tone={overview.idle > Math.max(2, overview.adults * 0.35) ? 'warn' : 'good'}
            />
            <StatusCard
              icon="🛏️"
              label="Home"
              value={overview.openBeds}
              detail={`${overview.beds} beds${overview.homeless > 0 ? ` · ${overview.homeless} without home` : ''}`}
              tone={overview.openBeds <= 0 || overview.homeless > 0 ? 'bad' : 'good'}
            />
            <StatusCard
              icon="💗"
              label="Life"
              value={overview.pregnant}
              detail={`${overview.married} married · ${overview.affairs} affairs · ${overview.imprisoned} jailed`}
              tone={overview.affairs > 0 || overview.imprisoned > 0 ? 'warn' : 'life'}
            />
            <StatusCard
              icon="🍖"
              label="Food"
              value={overview.food}
              detail={`Today ${overview.foodNetToday >= 0 ? '+' : ''}${overview.foodNetToday}`}
              tone={overview.food < Math.max(20, overview.total * 2) ? 'bad' : overview.foodNetToday < 0 ? 'warn' : 'good'}
            />
            <StatusCard
              icon="⭐"
              label="Village mood"
              value={overview.moodLabel}
              detail={`Rep ${overview.reputation}${overview.isWinter ? (overview.canHeat ? ' · heated' : ' · no heat') : ''}`}
              tone={moodTone}
            />
          </div>
        </div>

        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-stone-800 bg-stone-900/60 px-3 py-2 sm:px-4">
          {navTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              title={tab.hint}
              onClick={() => onNavChange(tab.id)}
              className={`rounded-xl px-3 py-2 text-sm font-bold whitespace-nowrap transition-colors ${
                activeNav === tab.id
                  ? 'bg-emerald-700/80 text-emerald-50 ring-1 ring-emerald-400/40'
                  : 'bg-stone-800/60 text-stone-300 hover:bg-stone-700/70'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <Suspense fallback={<p className="text-sm text-stone-300">Loading…</p>}>
            {section === 'people' && (
              <div className="space-y-4">
                <VillageTabPanel
                  state={state}
                  villageStats={villageStats}
                  favoriteEntityId={favoriteEntityId}
                  onRecruitSettler={onRecruitSettler}
                  onFocusBuilding={onFocusBuilding}
                  onFocusCitizen={(entity) => {
                    onFocusCitizen(entity);
                    onClose();
                  }}
                  onToggleFavoriteCitizen={onToggleFavoriteCitizen}
                  onOpenGoals={() => {
                    setProgressSubTab('goals');
                    onNavChange('progress');
                  }}
                  onHintAction={onHintAction}
                  suppressHintIds={suppressHintIds}
                />
                <section className="rounded-xl border border-stone-600/40 bg-stone-900/40 p-3">
                  <h3 className="mb-2 text-sm font-bold text-stone-200">🕰️ Work & venue hours</h3>
                  <WorkSchedulePanel state={state} onApply={onApplyWorkSchedule} />
                  <div className="my-4 border-t border-stone-700/60 pt-4">
                    <VenueSchedulePanel state={state} onApply={onApplyVenueSchedule} />
                  </div>
                </section>
              </div>
            )}

            {section === 'world' && (
              <div className="space-y-4">
                {(() => {
                  const frontierPanel = (
                    <section
                      key="frontier"
                      ref={worldFocus === 'frontier' ? worldFocusRef : undefined}
                      className="rounded-xl border border-stone-600/40 bg-stone-900/35 p-3"
                    >
                      <h3 className="mb-2 text-sm font-bold text-stone-200">🏕️ Frontier</h3>
                      <FrontierTabPanel
                        state={state}
                        pendingRaidCount={pendingRaidCount}
                        pendingOutgoingRaidCount={pendingOutgoingRaidCount}
                        pendingDiplomacyCount={pendingDiplomacyCount}
                        onFocusVisitor={(id, x, y) => {
                          onFocusVisitor(id, x, y);
                          onClose();
                        }}
                        onFocusRival={(id, x, y, buildingId) => {
                          onFocusRival(id, x, y, buildingId);
                          onClose();
                        }}
                        onLaunchRaid={onLaunchRaid}
                      />
                    </section>
                  );
                  const naturePanel = (
                    <section
                      key="nature"
                      ref={worldFocus === 'nature' ? worldFocusRef : undefined}
                      className="rounded-xl border border-stone-600/40 bg-stone-900/35 p-3"
                    >
                      <h3 className="mb-2 text-sm font-bold text-stone-200">🌿 Nature</h3>
                      <NatureTabPanel state={state} />
                    </section>
                  );
                  const progressPanel = (
                    <section
                      key="progress"
                      ref={worldFocus === 'progress' ? worldFocusRef : undefined}
                      className="rounded-xl border border-stone-600/40 bg-stone-900/35 p-3"
                    >
                      <h3 className="mb-2 text-sm font-bold text-stone-200">📊 Progress</h3>
                      <ProgressTabPanel
                        state={state}
                        progressSubTab={progressSubTab}
                        setProgressSubTab={setProgressSubTab}
                        tradeReadyCount={tradeReadyCount}
                        onStartResearch={onStartResearch}
                        onEstablishTradeRoute={onEstablishTradeRoute}
                      />
                    </section>
                  );
                  // Rail tabs open one focused panel; the World nav button shows all three.
                  if (worldFocus === 'frontier') return frontierPanel;
                  if (worldFocus === 'nature') return naturePanel;
                  if (worldFocus === 'progress') return progressPanel;
                  return (
                    <>
                      {frontierPanel}
                      {naturePanel}
                      {progressPanel}
                    </>
                  );
                })()}
              </div>
            )}

            {section === 'chronicle' && (
              <LogTabPanel
                state={state}
                logSubTab={logSubTab}
                setLogSubTab={setLogSubTab}
              />
            )}

            {section === 'help' && (
              <MoreTabPanel
                moreSubTab={moreSubTab}
                setMoreSubTab={setMoreSubTab}
                tutorialsEnabled={tutorialsEnabled}
                onReplayTutorial={onReplayTutorial}
                onToggleTutorials={onToggleTutorials}
                onSpawnMoonHowlerDebug={onSpawnMoonHowlerDebug}
                state={state}
                onStartGuidedCampaign={onStartGuidedCampaign}
              />
            )}
          </Suspense>
        </div>
      </div>
    </div>
  );
}
