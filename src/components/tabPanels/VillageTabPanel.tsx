import { memo, Suspense, lazy } from 'react';
import { BuildingType } from '../../game/gameTypes';
import { getForgeOrder } from '../../game/forge';
import { getHumanArmamentLabel, getArmamentSteps } from '../../game/gameEngine';
import { getEconomyLedger, ECONOMY_SOURCE_LABELS } from '../../game/economyLedger';
import type { WorldState, Entity } from '../../game/gameEngine';
import type { VillageStatsSummary } from '../../game/uiSimSummary';
import type { FocusHintAction } from '../../game/focusHints';
import CollapsibleSection from '../CollapsibleSection';

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
    <div title={title} className="flex items-center justify-between rounded bg-stone-600/30 px-2 py-1 text-[11px]">
      <span className="text-stone-400">{icon} {label}</span>
      <span className="font-bold text-stone-200">{value}</span>
    </div>
  );
});

/** Today's food production vs consumption — "why is my food low?" at a glance. */
const FoodLedger = memo(function FoodLedger({ state }: { state: WorldState }) {
  const ledger = getEconomyLedger(state);
  const producedEntries = ledger ? Object.entries(ledger.produced) : [];
  const consumedEntries = ledger ? Object.entries(ledger.consumed) : [];
  if (producedEntries.length === 0 && consumedEntries.length === 0) {
    return (
      <p className="text-[11px] text-stone-500">
        No food produced or eaten yet today — build farms or a hunting spot and staff them.
      </p>
    );
  }
  const produced = producedEntries.reduce((sum, [, v]) => sum + v, 0);
  const consumed = consumedEntries.reduce((sum, [, v]) => sum + v, 0);
  const net = produced - consumed;
  return (
    <div className="space-y-1 text-[11px]">
      {producedEntries.map(([src, v]) => (
        <div key={`p-${src}`} className="flex items-center justify-between rounded bg-stone-600/30 px-2 py-1">
          <span className="text-stone-400">{ECONOMY_SOURCE_LABELS[src] ?? src}</span>
          <span className="font-bold text-emerald-300">+{v}</span>
        </div>
      ))}
      {consumedEntries.map(([src, v]) => (
        <div key={`c-${src}`} className="flex items-center justify-between rounded bg-stone-600/30 px-2 py-1">
          <span className="text-stone-400">{ECONOMY_SOURCE_LABELS[src] ?? src}</span>
          <span className="font-bold text-rose-300">−{v}</span>
        </div>
      ))}
      <div className="flex items-center justify-between rounded bg-stone-700/40 px-2 py-1 font-bold">
        <span className="text-stone-300">Net</span>
        <span className={net >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
          {net >= 0 ? '+' : ''}{net}
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
  onFocusBuilding,
  onFocusCitizen,
  onToggleFavoriteCitizen,
  onOpenGoals,
  onHintAction,
  suppressHintIds = [],
}: VillageTabPanelProps) {
  const canRecruit = villageStats.total < state.maxHumanPopulation && state.resources.food >= 30 && state.resources.gold >= 20;
  const recruitTitle = villageStats.total >= state.maxHumanPopulation
    ? 'Build more houses to increase population cap'
    : state.resources.food < 30 || state.resources.gold < 20
      ? 'Need 30 food and 20 gold'
      : 'Recruit a new settler';

  return (
    <div className="space-y-2.5">
      <Suspense fallback={<p className="text-[11px] text-stone-500">Loading focus…</p>}>
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
      >
        <div className="mb-2 grid grid-cols-2 gap-2">
          <div>
            <div className="flex items-end justify-between gap-1">
              <p className="text-2xl font-black leading-none text-emerald-300">
                {villageStats.total}
                <span className="text-sm font-bold text-stone-500"> / {state.maxHumanPopulation}</span>
              </p>
              <p className="text-[11px] text-stone-500">immigration cap</p>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-600">
              <div className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(100, (villageStats.total / Math.max(1, state.maxHumanPopulation)) * 100)}%` }} />
            </div>
          </div>
          <div>
            <div className="flex items-end justify-between gap-1">
              <p className="text-2xl font-black leading-none text-sky-300">
                {villageStats.beds}
                <span className="text-sm font-bold text-stone-500"> beds</span>
              </p>
              <p className="text-[11px] text-stone-500" title="Empty housing slots for assignment">
                {villageStats.openBeds} open
              </p>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-600">
              <div className="h-full rounded-full bg-sky-500 transition-all"
                style={{ width: `${Math.min(100, (villageStats.total / Math.max(1, villageStats.beds)) * 100)}%` }} />
            </div>
          </div>
        </div>
        <div className="mb-2 grid grid-cols-4 gap-1 text-[11px]">
          <div className="rounded bg-stone-600/30 px-2 py-1 text-center">
            <div className="font-bold text-sky-300">{villageStats.working}</div>
            <div className="text-stone-500">working</div>
          </div>
          <div className="rounded bg-stone-600/30 px-2 py-1 text-center">
            <div className="font-bold text-amber-300">{villageStats.idle}</div>
            <div className="text-stone-500">idle</div>
          </div>
          <div className="rounded bg-stone-600/30 px-2 py-1 text-center">
            <div className="font-bold text-slate-300">{villageStats.imprisoned}</div>
            <div className="text-stone-500">jailed</div>
          </div>
          <div className="rounded bg-stone-600/30 px-2 py-1 text-center">
            <div className="font-bold text-pink-300">{villageStats.children}</div>
            <div className="text-stone-500">children</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          <StatBadge label="Adults" value={villageStats.adults} icon="👤" />
          <StatBadge label="Reputation" value={state.villageReputation} icon="⭐" title="80+: cheaper visitor trade & fewer raids · 30 or less: harsher prices & more raids" />
          <StatBadge label="Buildings" value={state.buildings.filter(b => b.completed && b.faction !== 'rival').length} icon="🏗️" />
          <StatBadge label="Techs" value={state.unlockedTechs.length} icon="🔬" />
        </div>
        <button
          onClick={onRecruitSettler}
          disabled={!canRecruit}
          title={recruitTitle}
          className="mt-2 w-full rounded-lg bg-emerald-600 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-stone-600 transition-all"
        >
          📯 Recruit Settler (30🍖 20💰)
        </button>
      </CollapsibleSection>

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
        <Suspense fallback={<p className="text-[11px] text-stone-500">Loading leadership…</p>}>
          <VillageLeadershipPanel state={state} />
        </Suspense>
      </CollapsibleSection>

      <CollapsibleSection
        icon="👨‍👩‍👧"
        title="Families"
        subtitle="Household units"
        accent="stone"
        defaultOpen={false}
      >
        <Suspense fallback={<p className="text-[11px] text-stone-500">Loading families…</p>}>
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
        <p className="mb-2 text-[11px] leading-relaxed text-stone-500">
          Stone/wood from Defense research. Iron spears & shields, then swords, scale mail & tower ballistae need research <strong className="text-stone-400">and</strong> a staffed Blacksmith forge run. Finish toast is a normal village alert.
        </p>
        {state.villageForge?.activeOrder && (
          <p className="mb-2 rounded bg-orange-950/40 px-2 py-1 text-[11px] text-orange-200">
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
              <div key={step.id} className={`rounded px-2 py-1 text-[11px] ${step.done ? 'bg-emerald-900/30 text-emerald-300' : 'bg-stone-800/50 text-stone-400'}`}>
                <span>{step.done ? '✓' : '○'} {step.label}</span>
                {!step.done && <p className="mt-0.5 text-[8px] text-stone-500">{step.detail}</p>}
                {showForgeGo && (
                  <button
                    type="button"
                    onClick={() => onFocusBuilding(
                      smith.id,
                      smith.x + smith.width / 2,
                      smith.y + smith.height / 2,
                    )}
                    className="mt-1 rounded bg-orange-900/50 px-1.5 py-0.5 text-[8px] font-bold text-orange-200 hover:bg-orange-800/60"
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
        <summary className="cursor-pointer text-[11px] font-semibold text-stone-400 hover:text-stone-300">
          ⭐ How reputation grows
        </summary>
        <p className="mt-2 text-[11px] leading-relaxed text-stone-500">
          Buildings (+2), festivals (+10), research (+3), staffed Hospital (+2) &amp; Town Hall (+3),
          {' '}
          {state.unlockedTechs.includes('architecture_2') || state.researchNodes.some((n) => n.id === 'architecture_2' && n.researched)
            ? 'completed roads (+rep with Urban Planning)'
            : 'roads (+rep after Urban Planning research)'}
          .
        </p>
      </details>
    </div>
  );
}
