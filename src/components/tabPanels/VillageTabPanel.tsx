import { memo, Suspense, lazy } from 'react';
import { BuildingType } from '../../game/gameTypes';
import { getForgeOrder } from '../../game/forge';
import { getHumanArmamentLabel, getArmamentSteps, hasTech } from '../../game/gameEngine';
import type { WorldState, Entity } from '../../game/gameEngine';
import type { VillageStatsSummary } from '../../game/uiSimSummary';
import type { FocusHintAction } from '../../game/focusHints';
import CollapsibleSection from '../CollapsibleSection';
import { collectHousingDiagnostics, isHousingDiagnosticsHealthy } from '../../game/housingDiagnostics';
import { getBuildingCenter } from '../../game/placementUtils';
import { getRecruitSettlerEligibility, RECRUITMENT_COST } from '../../game/settlerInteractionActions';
import { resourceFillPercent } from '../../game/dashboardData';
import { resolvePopulationCap } from '../../game/populationGrowth';
import { summarizeFoodLedger, ECONOMY_SOURCE_LABELS } from '../../game/economyLedger';
import { REPUTATION_FRIENDLY_MIN, REPUTATION_HARSH_MAX } from '../../game/simHelpers';

const FocusPanel = lazy(() => import('../../game/FocusPanel'));
const VillageLeadershipPanel = lazy(() => import('../../game/VillageLeadershipPanel'));
const PopulationPanel = lazy(() => import('../../game/PopulationPanel'));

interface StatBadgeProps {
  label: string;
  value: number;
  icon: string;
  title?: string;
}

const StatBadge = memo(function StatBadge({ label, value, icon, title }: StatBadgeProps) {
  return (
    <div title={title} className="flex items-center justify-between rounded bg-stone-600/30 px-2 py-1 text-[13px]">
      <span className="text-stone-400">{icon} {label}</span>
      <span className="font-bold text-stone-200">{value}</span>
    </div>
  );
});

const HousingDiagnostics = memo(function HousingDiagnostics({ state }: { state: WorldState }) {
  const housing = collectHousingDiagnostics(state);
  const healthy = isHousingDiagnosticsHealthy(housing);
  return (
    <CollapsibleSection
      icon="🏠"
      title="Housing diagnostics"
      subtitle={`${housing.openBeds} open beds · ${housing.housingPressure} pressure`}
      accent={healthy ? 'cyan' : 'orange'}
      defaultOpen={false}
    >
      <div className="grid grid-cols-2 gap-1.5 text-[13px]">
        <StatBadge label="Beds" value={housing.totalBeds} icon="🛏️" />
        <StatBadge label="Occupied" value={housing.occupiedBeds} icon="👥" />
        <StatBadge label="Residences" value={housing.residences} icon="🏘️" />
        <StatBadge
          label="Homeless"
          value={housing.homelessPlayerHumans}
          icon="⚠️"
          title="Settlers with no bed — prisoners excluded (residencyOccupancy.countHomelessSettlers)"
        />
      </div>
      <div className="mt-2 space-y-1 text-[12px]">
        <div className="flex justify-between rounded bg-stone-600/30 px-2 py-1">
          <span className="text-stone-400">Player-house beds</span><span className="font-bold text-sky-300">{housing.playerHouseBeds}</span>
        </div>
        <div className="flex justify-between rounded bg-stone-600/30 px-2 py-1">
          <span className="text-stone-400">Leader-house reserved</span><span className="font-bold text-amber-300">{housing.reservedLeaderHouseBeds}/{housing.leaderHouseBeds}</span>
        </div>
        <div className={`flex justify-between rounded px-2 py-1 ${healthy ? 'bg-emerald-950/30 text-emerald-300' : 'bg-rose-950/30 text-rose-300'}`}>
          <span>{healthy ? '✓ Residence references healthy' : '⚠ Residence references need review'}</span>
          <span>{housing.overCapacityResidences + housing.orphanedResidenceReferences + housing.occupantListMismatches}</span>
        </div>
      </div>
    </CollapsibleSection>
  );
});

/** Today's food production vs consumption — "why is my food low?" at a glance. */
const FoodLedger = memo(function FoodLedger({ state }: { state: WorldState }) {
  // Summed by the ledger owner, not here: the view renders numbers, it does not calculate them
  // (`LIVE-FINDINGS-STATUS.md`, F2 — "food can't be calculated at the UX").
  const summary = summarizeFoodLedger(state);
  if (summary.produced.length === 0 && summary.consumed.length === 0) {
    return (
      <p className="text-[13px] text-stone-300">
        No food produced or eaten yet today — build farms or a hunting spot and staff them.
      </p>
    );
  }
  return (
    <div className="space-y-1 text-[13px]">
      {summary.produced.map((row) => (
        <div key={`p-${row.source}`} className="flex items-center justify-between rounded bg-stone-600/30 px-2 py-1">
          <span className="text-stone-400">{ECONOMY_SOURCE_LABELS[row.source] ?? row.source}</span>
          <span className="font-bold text-emerald-300">+{row.amount}</span>
        </div>
      ))}
      {summary.consumed.map((row) => (
        <div key={`c-${row.source}`} className="flex items-center justify-between rounded bg-stone-600/30 px-2 py-1">
          <span className="text-stone-400">{ECONOMY_SOURCE_LABELS[row.source] ?? row.source}</span>
          <span className="font-bold text-rose-300">−{row.amount}</span>
        </div>
      ))}
      <div className="flex items-center justify-between rounded bg-stone-700/40 px-2 py-1 font-bold">
        <span className="text-stone-300">Net</span>
        <span className={summary.net >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
          {summary.net >= 0 ? '+' : ''}{summary.net}
        </span>
      </div>
    </div>
  );
});

export interface VillageTabPanelProps {
  state: WorldState;
  villageStats: VillageStatsSummary;
  favoriteEntityId?: number | null;
  onRecruitSettler: () => void;
  /** Village-wide staffing action. Deliberately here rather than in the building panel: the
   *  per-building fill/auto-fill belongs on that building, and "assign all" is a village decision. */
  onAutoStaffAll: () => void;
  onFocusBuilding: (buildingId: number, cx: number, cy: number) => void;
  onFocusCitizen: (entity: Entity) => void;
  onToggleFavoriteCitizen?: (entityId: number) => void;
  onOpenGoals: () => void;
  onHintAction: (action: FocusHintAction) => void;
  /** Hint action ids the first-spring guide suppresses as duplicates. */
  suppressHintIds?: string[];
}

export default function VillageTabPanel({
  state,
  villageStats,
  favoriteEntityId,
  onRecruitSettler,
  onAutoStaffAll,
  onFocusBuilding,
  onFocusCitizen,
  onToggleFavoriteCitizen,
  onOpenGoals,
  onHintAction,
  suppressHintIds = [],
}: VillageTabPanelProps) {
  // The price and the gate come from the recruitment owner (`settlerInteractionActions`), the same
  // rule the command and the auto-play bot obey. The view used to restate that price threshold and
  // print the price a second time, and its only explanation for a disabled button was a `title`
  // on a disabled control — inert in the browsers where the label is the only affordance
  // (2026-09-17 UI audit, R25; open since `ui-logic.md` §5.3).
  const recruitEligibility = getRecruitSettlerEligibility(state);
  const canRecruit = recruitEligibility.ok;
  // The immigration cap's owner — six sites used to read the raw `maxHumanPopulation` field while the
  // owner derived a fallback for a save without it (2026-09-22 stats-panel audit, F7).
  const popCap = resolvePopulationCap(state);

  return (
    <div className="space-y-4">
      {/* The "Village overview" block that used to sit here restated the People screen's own stat
          cards (people / work / home / life / food / mood) and the Population disclosure below it, so
          one screen carried the same population, work, bed and reputation figures three times. The
          cards above are the survivor: always visible, zero clicks, and composed from the owners
          (2026-09-22 stats-panel audit, P1). */}

      <Suspense fallback={<p className="text-[13px] text-stone-300">Loading focus…</p>}>
        <FocusPanel
          state={state}
          buildings={state.buildings}
          onOpenGoals={onOpenGoals}
          onHintAction={onHintAction}
          suppressHintIds={suppressHintIds}
        />
      </Suspense>
      <CollapsibleSection
        icon="👥"
        title="Population"
        subtitle={`${villageStats.total}/${state.maxHumanPopulation} cap · 🛏️ ${villageStats.beds} beds · ${villageStats.working} working · ⭐${state.villageReputation}`}
        accent="emerald"
        defaultOpen={false}
        storageKey="village-population"
      >
        <div className="mb-2 grid grid-cols-2 gap-2">
          <div>
            <div className="flex items-end justify-between gap-1">
              <p className="text-2xl font-black leading-none text-emerald-300">
                {villageStats.total}
                <span className="text-sm font-bold text-stone-400"> / {popCap}</span>
              </p>
              <p className="text-[13px] text-stone-300">immigration cap</p>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-600">
              <div className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${resourceFillPercent({ amount: villageStats.total, cap: popCap })}%` }} />
            </div>
          </div>
          <div>
            <div className="flex items-end justify-between gap-1">
              <p className="text-2xl font-black leading-none text-sky-300">
                {villageStats.beds}
                <span className="text-sm font-bold text-stone-400"> beds</span>
              </p>
              <p className="text-[13px] text-stone-300" title="Empty housing slots for assignment">
                {villageStats.openBeds} open
              </p>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-600">
              <div className="h-full rounded-full bg-sky-500 transition-all"
                style={{ width: `${resourceFillPercent({ amount: villageStats.total, cap: villageStats.beds })}%` }} />
            </div>
          </div>
        </div>
        {/* The working / idle / jailed / children tiles that used to sit here are the People screen's
            Work and Life cards, four lines above this disclosure (2026-09-22 audit, P1). */}
        {/* No count in the label on purpose: the staffing owner decides who is assignable, and a
            locally recomputed "idle" total contradicted it before (F7). */}
        <button
          type="button"
          onClick={onAutoStaffAll}
          className="mb-2 w-full rounded bg-sky-800/60 px-2 py-1.5 text-[13px] font-bold text-sky-100 transition-colors hover:bg-sky-700/70"
        >
          ⚒️ Auto-assign all workers
        </button>
        <CollapsibleSection
          title="Details"
          defaultOpen={false}
          storageKey="village-population-details"
          accent="stone"
        >
          <div className="grid grid-cols-2 gap-1.5 text-[13px]">
            <StatBadge label="Adults" value={villageStats.adults} icon="👤" />
            <StatBadge label="Buildings" value={state.totalBuildingsCompleted} icon="🏗️" />
            <StatBadge label="Techs" value={state.unlockedTechs.length} icon="🔬" />
          </div>
        </CollapsibleSection>
        <button
          onClick={onRecruitSettler}
          disabled={!canRecruit}
          title={recruitEligibility.blockReason}
          className="mt-2 w-full rounded-lg bg-emerald-600 py-1.5 text-[13px] font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-stone-600 transition-all"
        >
          📯 Recruit Settler ({RECRUITMENT_COST.food}🍖 {RECRUITMENT_COST.gold}💰)
          {recruitEligibility.ok ? '' : ` — ${recruitEligibility.blockReason ?? 'unavailable'}`}
        </button>
      </CollapsibleSection>

      <HousingDiagnostics state={state} />

      <CollapsibleSection
        icon="🍖"
        title="Food this day"
        subtitle="Produced vs eaten today"
        accent="amber"
        defaultOpen={false}
      >
        <FoodLedger state={state} />
      </CollapsibleSection>

      <CollapsibleSection icon="👑" title="Village leadership" accent="amber" defaultOpen={false}>
        <Suspense fallback={<p className="text-[13px] text-stone-300">Loading leadership…</p>}>
          <VillageLeadershipPanel state={state} />
        </Suspense>
      </CollapsibleSection>

      {/* The "Family tree" section that stood here is **removed**, on the owner's report:
          *"family three is not a family thee"*. It rendered `FamiliesTreePanel`, which is a flat
          alphabetical list of surnames with 1-2 adults under each (Musson, Mace, Wing, Andersen...),
          was `defaultOpen`, and therefore dominated the Village tab — so it was both mislabelled and
          part of the stacking the owner rejected ("i dont want any thing stacked").

          A real tree lives in its own window (`FamilyTreeWindow`), opened from a selected settler:
          parents above, the settler and spouse in the middle, children below. Nothing here should be
          called a family tree until it draws one. */}

      <CollapsibleSection
        icon="👨‍👩‍👧"
        title="Household roster"
        subtitle="Everyone by home"
        accent="stone"
        defaultOpen={false}
        storageKey="village-household-roster"
      >
        <Suspense fallback={<p className="text-[13px] text-stone-300">Loading households…</p>}>
          <PopulationPanel
            state={state}
            favoriteEntityId={favoriteEntityId}
            onFocusCitizen={onFocusCitizen}
            onToggleFavorite={onToggleFavoriteCitizen}
          />
        </Suspense>
      </CollapsibleSection>

      <CollapsibleSection
        icon="⚔️"
        title="Armament"
        subtitle={getHumanArmamentLabel(state) ?? 'Research Defense tech'}
        accent="orange"
        defaultOpen={false}
      >
        <p className="mb-2 text-[13px] leading-relaxed text-stone-300">
          Stone/wood from Defense research. Iron spears & shields, then swords, scale mail & tower ballistae need research <strong className="text-stone-400">and</strong> a staffed Blacksmith forge run. Finish toast is a normal village alert.
        </p>
        {state.villageForge?.activeOrder && (
          <p className="mb-2 rounded bg-orange-950/40 px-2 py-1 text-[13px] text-orange-200">
            🔨 Forging {getForgeOrder(state.villageForge.activeOrder)?.label ?? 'gear'} — {Math.round(state.villageForge.progress)}%
          </p>
        )}
        <div className="space-y-1">
          {getArmamentSteps(state).map((step) => {
            const smith = state.buildings.find(
              (b) => b.completed && b.type === BuildingType.Blacksmith,
            );
            const showForgeGo = !step.done
              && [
                'iron_spears', 'iron_shields', 'iron_pickaxes',
                'guard_halberds', 'wall_plates',
                'iron_swords', 'scale_mail', 'tower_ballistae',
              ].includes(step.id)
              && smith;
            return (
              <div key={step.id} className={`rounded px-2 py-1 text-[13px] ${step.done ? 'bg-emerald-900/30 text-emerald-300' : 'bg-stone-800/50 text-stone-400'}`}>
                <span>{step.done ? '✓' : '○'} {step.label}</span>
                {!step.done && <p className="mt-0.5 text-[10px] text-stone-300">{step.detail}</p>}
                {showForgeGo && (
                  <button
                    type="button"
                    onClick={() => {
                      const center = getBuildingCenter(smith);
                      onFocusBuilding(smith.id, center.x, center.y);
                    }}
                    className="mt-1 rounded bg-orange-900/50 px-1.5 py-0.5 text-[10px] font-bold text-orange-200 hover:bg-orange-800/60"
                  >
                    Open Blacksmith →
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </CollapsibleSection>

      <details className="rounded-xl border border-stone-600/40 bg-stone-800/30 px-3 py-2">
        <summary className="cursor-pointer text-[13px] font-semibold text-stone-400 hover:text-stone-300">
          ⭐ How reputation grows
        </summary>
        <p className="mt-2 text-[13px] leading-relaxed text-stone-300">
          Buildings (+2), festivals (+10), research (+3), staffed Hospital (+2) &amp; Town Hall (+3),
          {' '}
          {hasTech(state, 'architecture_2')
            ? 'completed roads (+rep with Urban Planning)'
            : 'roads (+rep after Urban Planning research)'}
          .
        </p>
        {/* The band names, not the numbers: `simHelpers` owns both thresholds — visitor caravans
            price their trade by band (`getVisitorTradePriceMult`), so the panel asks the owner
            rather than restating them. */}
        <p className="mt-1 text-[13px] leading-relaxed text-stone-300">
          It also sets what caravans charge: at{' '}
          <strong className="text-emerald-300">{REPUTATION_FRIENDLY_MIN}+</strong> they offer friendly prices,
          and at <strong className="text-rose-300">{REPUTATION_HARSH_MAX} or less</strong> they demand harsher terms.
        </p>
      </details>
    </div>
  );
}