/**
 * One overview subject, in its own window.
 *
 * Presentation only; all simulation changes go through typed command callbacks. The owner's ruling
 * governs the shape — *"each subject should just have its own window not stacking up"* — so this is
 * **one subject per window**, opened from its own icon in the game header (`GameHeader` reads the same
 * `OVERVIEW_SUBJECTS` table), and the nav strip that used to switch sections inside a full-screen
 * overlay is gone.
 *
 * Read a subject's own panel for its rules; nothing here restates one.
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
  /** Opens the work & venue hours window, which this screen no longer hosts (owner: one window per subject). */
  onOpenWorkHours: () => void;
  onFocusVisitor: (id: string, x: number, y: number) => void;
  onFocusRival: (id: string, x: number, y: number, buildingId?: number) => void;
  onLaunchRaid: (rivalId: string) => void;
  onStartResearch: (researchId: string) => void;
  onEstablishTradeRoute: (routeId: string) => void;
  onReplayTutorial: () => void;
  onToggleTutorials: () => void;
  onSpawnMoonHowlerDebug: () => void;
  /** `?debug=1`, owned by the shell — forwarded so the Guide can gate its debug card. */
  debugMode: boolean;
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
  onAutoStaffAll,
  onFocusBuilding,
  onFocusCitizen,
  onToggleFavoriteCitizen,
  onHintAction,
  onOpenWorkHours,
  onFocusVisitor,
  onFocusRival,
  onLaunchRaid,
  onStartResearch,
  onEstablishTradeRoute,
  onReplayTutorial,
  onToggleTutorials,
  onSpawnMoonHowlerDebug,
  debugMode,
  onStartGuidedCampaign,
  suppressHintIds = [],
}: CitizenOverviewScreenProps) {
  const overview = computeCitizenOverview(state);
  const worldFocusRef = useRef<HTMLDivElement | null>(null);
  // The window owns the keyboard and handles Escape itself, in one place shared with the other
  // overlays. The *focus* half is `GameWindow`'s now — the trap must be attached to the element that
  // carries `role="dialog"`, which is the shell's, not this component's.
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
       * A window, not the screen. This used to be a `fixed inset-0` dialog whose own header, nav strip
       * and six panels filled the viewport; the owner's ruling is *"each subject should just have its
       * own window not stacking up"*, and their report of this screen was *"the 6 panel stacked now
       * that opens full screen should be each subject a own icon the header and open a window for that
       * subject not full screen"*. The six doors are now header icons (`GameHeader`), each opening this
       * window on its own subject — so the nav strip that used to switch between them is gone: the way
       * to another subject is its own icon, not a chip inside a panel.
       */
      centered
      widthClassName="w-[min(58rem,calc(100vw-3rem))] max-w-[calc(100vw-3rem)]"
      maxBodyClassName="max-h-[70vh]"
    >
        <div>
          {/* The citizen summary belongs to the *Village* subject: it counts people, work, homes, life,
              food and mood, which is exactly what that window is about. It used to sit above every
              section, which made one summary read as part of Frontier, Nature and the rest. */}
          {activeNav === 'people' && (
            <>
              {/* The mood *explanation*, which the old full-screen header carried. It must stay visible
                  even though the mood *label* now appears only on its own stat card: audit R37 removed
                  the duplicate label, not the sentence, and `tests/uiRefinement.residuals.test.ts`
                  guards exactly this pair. */}
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
            {/* The threshold is the food owner's, not a second `max(20, pop × 2)` here: the
                hand-written copy turned the card red at 35 food / 20 settlers beside a green
                "Thriving" mood, which the owner's own rule does not (audit R6, residual of F20). */}
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
                    {/* Its own window, not an inline stack (owner: "each subject should just have
                        its own window not stacking up"). The editors themselves are unchanged. */}
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
                debugMode={debugMode}
                state={state}
                onStartGuidedCampaign={onStartGuidedCampaign}
              />
            )}
          </Suspense>
        </div>
    </GameWindow>
  );
}