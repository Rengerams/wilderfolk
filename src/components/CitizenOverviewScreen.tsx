/**
 * One overview subject, in its own window: presentation only, all simulation changes go through
 * typed command callbacks. Read a subject's own panel for its rules; nothing here restates one.
 */
import { Suspense, lazy, useEffect, useRef } from 'react';
import type { Entity, WorldState } from '../game/gameTypes';
import { computeCitizenOverview, hasManyAdultsIdle } from '../game/citizenOverview';
import type { VillageStatsSummary } from '../game/uiSimSummary';
import type { FocusHintAction } from '../game/focusHints';
import type {
  OverviewNavId,
  OverviewSection,
  OverviewWorldFocus,
  ProgressSubTab,
  LogSubTab,
  LogFilter,
  MoreSubTab,
} from '../hooks/useGameShellState';
import { OVERVIEW_SUBJECTS, overviewNavFromState } from '../hooks/useGameShellState';
import { useOverlayKeyboard } from '../hooks/useOverlayKeyboard';
import { isFoodAlertAmount } from '../game/resourceUtils';
import GameWindow from './GameWindow';

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
  /** Category the Log window was opened on, so a concern can hand over its own history. */
  logFilter: LogFilter;
  setLogFilter: (filter: LogFilter) => void;
  moreSubTab: MoreSubTab;
  setMoreSubTab: (tab: MoreSubTab) => void;
  tutorialsEnabled: boolean;
  onClose: () => void;
  onRecruitSettler: () => void;
  onAutoStaffAll: () => void;
  onFocusBuilding: (buildingId: number, cx: number, cy: number) => void;
  onFocusCitizen: (entity: Entity) => void;
  onToggleFavoriteCitizen?: (entityId: number) => void;
  onHintAction: (action: FocusHintAction) => void;
  /** Opens the work & venue hours window; the hours editors live in their own window. */
  onOpenWorkHours: () => void;
  onFocusVisitor: (id: string, x: number, y: number) => void;
  onFocusRival: (id: string, x: number, y: number, buildingId?: number) => void;
  onLaunchRaid: (rivalId: string) => void;
  onProvokeRival: (rivalId: string) => void;
  onRecallRaid: (eventId: string) => void;
  onStartResearch: (researchId: string) => void;
  onEstablishTradeRoute: (routeId: string) => void;
  onReplayTutorial: () => void;
  onToggleTutorials: () => void;
  onSpawnMoonHowlerDebug: () => void;
  onStartSpotlightDebug: () => void;
  /** `?debug=1`, owned by the shell — forwarded so the Guide can gate its debug card. */
  debugMode: boolean;
  onStartGuidedCampaign: () => void;
  /** Opens the shortcut sheet from the Guide's own Controls card. */
  onOpenShortcuts?: () => void;
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
  logFilter,
  setLogFilter,
  moreSubTab,
  setMoreSubTab,
  tutorialsEnabled,
  onClose,
  onRecruitSettler,
  onAutoStaffAll,
  onFocusBuilding,
  onFocusCitizen,
  onToggleFavoriteCitizen,
  onHintAction,
  onOpenWorkHours,
  onFocusVisitor,
  onFocusRival,
  onLaunchRaid,
  onProvokeRival,
  onRecallRaid,
  onStartResearch,
  onEstablishTradeRoute,
  onReplayTutorial,
  onToggleTutorials,
  onSpawnMoonHowlerDebug,
  onStartSpotlightDebug,
  debugMode,
  onStartGuidedCampaign,
  onOpenShortcuts,
  suppressHintIds = [],
}: CitizenOverviewScreenProps) {
  const overview = computeCitizenOverview(state);
  const worldFocusRef = useRef<HTMLDivElement | null>(null);
  // Escape handling is shared with the other overlays; focus trapping lives in `GameWindow`,
  // which owns the element carrying `role="dialog"`.
  useOverlayKeyboard('overview-subject', onClose);

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
  /** The subject this window is about — its name, glyph and one-line hint come from the one owner. */
  const subject = OVERVIEW_SUBJECTS[activeNav];

  return (
    <GameWindow
      icon={subject.icon}
      title={subject.label}
      subtitle={subject.hint}
      onClose={onClose}
      /*
       * A window, not the screen: one subject per window, opened from that subject's header icon.
       */
      centered
      widthClassName={activeNav === 'frontier'
        ? 'w-[calc(100vw-2rem)] max-w-3xl'
        : 'w-[min(58rem,calc(100vw-3rem))] max-w-[calc(100vw-3rem)]'}
      maxBodyClassName={activeNav === 'frontier' ? 'max-h-[calc(92vh-4rem)]' : 'max-h-[70vh]'}
    >
        <div>
          {/* The citizen summary belongs to the *Village* subject: people, work, homes, life, food, mood. */}
          {activeNav === 'people' && (
            <>
              {/* Mood explanation stays visible; the mood label appears only on its own stat card. */}
              <p className="mb-3 text-[13px] leading-snug text-stone-300">{overview.moodDetail}</p>
              <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-3">
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
              tone={hasManyAdultsIdle(overview) ? 'warn' : 'good'}
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
              detail={`${overview.married} married · ${overview.youthLove} sweethearts · ${overview.affairsThisYear} affairs this year · ${overview.imprisoned} jailed`}
              tone={overview.affairs > 0 || overview.imprisoned > 0 ? 'warn' : 'life'}
            />
            {/* Food alert threshold comes from the food owner (`isFoodAlertAmount`), never a local copy. */}
            <StatusCard
              icon="🍖"
              label="Food"
              value={overview.food}
              detail={`Today ${overview.foodNetToday >= 0 ? '+' : ''}${overview.foodNetToday}`}
              tone={isFoodAlertAmount(overview.food, overview.total) ? 'bad' : overview.foodNetToday < 0 ? 'warn' : 'good'}
            />
            <StatusCard
              icon="⭐"
              label="Village mood"
              value={overview.moodLabel}
              detail={`Rep ${overview.reputation}${overview.isWinter ? (overview.canHeat ? ' · heated' : ' · no heat') : ''}`}
              tone={moodTone}
            />
              </div>
            </>
          )}

          <Suspense fallback={<p className="text-sm text-stone-300">Loading…</p>}>
            {section === 'people' && (
              <div className="space-y-4">
                <VillageTabPanel
                  state={state}
                  villageStats={villageStats}
                  favoriteEntityId={favoriteEntityId}
                  onRecruitSettler={onRecruitSettler}
                  onAutoStaffAll={onAutoStaffAll}
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
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-stone-200">🕰️ Work & venue hours</h3>
                    {/* The hours editors open in their own window; this card only links to them. */}
                    <button
                      type="button"
                      onClick={onOpenWorkHours}
                      className="rounded bg-stone-700/70 px-2.5 py-1.5 text-xs font-semibold text-stone-100 hover:bg-stone-600/80"
                    >
                      Edit hours ↗
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-stone-400">
                    Ordinary weekday work, Tavern and Hotel service windows, and the workforce preset open in
                    their own window.
                  </p>
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
                        onProvokeRival={onProvokeRival}
                        onRecallRaid={onRecallRaid}
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
                  // Rail tabs open one focused panel; every door that reaches the World section
                  // sets a focus, so the unfocused case is the frontier.
                  if (worldFocus === 'frontier') return frontierPanel;
                  if (worldFocus === 'nature') return naturePanel;
                  if (worldFocus === 'progress') return progressPanel;
                  return frontierPanel;
                })()}
              </div>
            )}

            {section === 'chronicle' && (
              <LogTabPanel
                state={state}
                logSubTab={logSubTab}
                setLogSubTab={setLogSubTab}
                logFilter={logFilter}
                setLogFilter={setLogFilter}
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
                onStartSpotlightDebug={onStartSpotlightDebug}
                debugMode={debugMode}
                state={state}
                onStartGuidedCampaign={onStartGuidedCampaign}
                onOpenShortcuts={onOpenShortcuts}
              />
            )}
          </Suspense>
        </div>
    </GameWindow>
  );
}