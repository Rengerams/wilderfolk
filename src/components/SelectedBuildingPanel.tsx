import { Suspense, lazy } from 'react';
import CollapsibleSection from './CollapsibleSection';
import {
  BuildingType, EntityType, BUILDING_JOB_TYPES, WORKSHOP_RECIPES, getWorkshopRecipe, formatRecipeInputs,
  getTerrainEfficiencyMultiplier, getAdjacencyMultiplier,
  isRivalAtPeace,
  getDiplomacyChoiceEligibility,
  getRivalRaidStrength, getCombatPreview,
  canLaunchRaidOnRival,
  getOutgoingRaidActionLabel,
  getOutgoingRaidFoodCostForRival, formatCampDistance, getCampDistancePixels,
  formatRaidLootSummary, raidEventLoot,
  formatRivalPopulationLabel,
  hasIronSpears, hasStoneSpears,
} from '../game/gameEngine';
import { getBuildingUpgradeCost, estimateWorkshopGold } from '../game/buildingActions';
import { moonHowlerRiteWeights, moonHowlerCureChanceForPriests } from '../game/moonHowler';
import {
  isResidenceBuildingType, getResidenceCapacity, getResidenceUpgradeSlotGain, TICKS_PER_DAY,
} from '../game/dayCycle';
import { isProductionBuildingType } from '../game/buildCatalog';
import { canHostTownFestival, describeTownHallPerks, TOWN_HALL_FESTIVAL_COST, TOWN_HALL_FESTIVAL_DAYS } from '../game/townHall';
import { describeHotelStatus } from '../game/hotelStay';
import { HOTEL_GUEST_CAPACITY } from '../game/gameTypes';
import { HUNTING_SPOT_PREY_OPTIONS } from '../game/gameTypes';
import type { HuntingSpotPrey } from '../game/gameTypes';
import { getBuildingConfig } from '../game/buildingConfig';
import { formatRaidDeadlineSafe } from '../game/raidUtils';
import type { Building, WorldState, Entity } from '../game/gameEngine';
import type { ForgeOrderId } from '../game/gameTypes';
import type { RivalSettlement } from '../game/gameTypes';
import type { WorkerCommand } from '../game/simWorker/commands';

const CombatPreviewPanel = lazy(() => import('../game/CombatPreviewPanel'));
const BlacksmithForgePanel = lazy(() => import('./BlacksmithForgePanel'));

const BUILDING_OUTPUT_HINTS: Partial<Record<BuildingType, string>> = {
  [BuildingType.Farm]: 'Produces food — more workers harvest more (up to 3). Watch Food in the header.',
  [BuildingType.HuntingSpot]: 'Hunters produce meat from nearby wildlife — check Food counter.',
  [BuildingType.FishingSpot]: 'Riverside fishers harvest food from the water — must touch water; safer than hunting (no wolves).',
  [BuildingType.WildlifePreserve]: 'Passive — restores ecosystem health +4 and helps wildlife recover; no workers.',
  [BuildingType.Greenhouse]: 'Produces food year-round — watch Food in the header.',
  [BuildingType.Silo]: 'Passive food every 2 days, +600 food storage, less spoilage — no workers.',
  [BuildingType.WoodStorehouse]: 'Passive — +800 wood storage for winter fuel, no workers needed.',
  [BuildingType.Mill]: 'Passive — standing mill boosts all food production +25%. No workers needed.',
  [BuildingType.Barn]: 'Boosts nearby Farms/Greenhouses +35% — place next to fields, not a farm itself.',
  [BuildingType.LumberMill]: 'Produces wood — watch Wood in the header.',
  [BuildingType.Quarry]: 'Produces stone — watch Stone in the header.',
  [BuildingType.Mine]: 'Produces stone or iron — set the mode below; iron feeds the Blacksmith forge.',
  [BuildingType.Store]: 'Generates passive gold income.',
  [BuildingType.Market]: 'Trades goods for gold with assigned workers.',
  [BuildingType.Workshop]: 'Pick a recipe below — crafts every 2 days when staffed and stocked.',
  [BuildingType.Church]: 'Staffed church boosts courtship/morals. Full-moon nights: more priests = higher cure chance vs a Moon Howler; no priest = howler unopposed.',
  [BuildingType.School]: 'Assign a teacher — children walk here by day; schooling speeds growth and grants graduation perks.',
  [BuildingType.Blacksmith]: 'Forge spears, shields, swords, scale mail & tower gear after Defense research. Staffed smith boosts lumber, quarry & mine (+25% per worker).',
  [BuildingType.Hospital]: 'Staffed hospital adds reputation every 5 days; any hospital lowers energy drain.',
  [BuildingType.TownHall]: 'Staff officials — taxes, trade & immigration boost, elections, scandal buffer, host festivals.',
  [BuildingType.Well]: 'Lowers settler energy drain for the whole village.',
  [BuildingType.Prison]: 'Staffed by a Guard. Caught adulterers may be sentenced here for a few days.',
  [BuildingType.Wall]: '+8 barricade strength per segment (max +72 from all wall pieces).',
  [BuildingType.WallCorner]: 'Counts as a wall segment for raid barricade bonus.',
  [BuildingType.WallGate]: 'Gated wall segment — same defense bonus as straight walls.',
  [BuildingType.Watchtower]: '+15 barricade strength. Pairs well with walls around your core.',
  [BuildingType.Barracks]: 'Assign Guards — each patrols the village (+12 militia strength).',
};

function canAffordRecipe(resources: WorldState['resources'], recipe: ReturnType<typeof getWorkshopRecipe>): boolean {
  for (const key of Object.keys(recipe.inputs) as (keyof WorldState['resources'])[]) {
    const needed = recipe.inputs[key] ?? 0;
    if (needed > 0 && resources[key] < needed) return false;
  }
  return true;
}

export interface SelectedBuildingPanelProps {
  building: Building;
  state: WorldState;
  onAssign: () => void;
  onAutoStaffAll: () => void;
  onAssignWorker: (humanId: number) => void;
  assignableWorkers: Entity[];
  onRemove: (id: number) => void;
  onRepair: () => void;
  onUpgrade: () => void;
  onDemolish: () => void;
  onSetWorkshopRecipe?: (recipeId: string) => void;
  onSetHuntingPrey?: (prey: HuntingSpotPrey) => void;
  onSetMineMode?: (mode: 'stone' | 'iron') => void;
  onQueueForge?: (orderId: ForgeOrderId) => void;
  idleWorkers: number;
  canAssignWorker: boolean;
  onDiplomacyAction?: (cmd: WorkerCommand) => void;
  onTownHallAction?: (cmd: WorkerCommand) => void;
  onFocusCamp?: (rival: RivalSettlement) => void;
}

export default function SelectedBuildingPanel({
  building, state, onAssign, onAutoStaffAll, onAssignWorker, assignableWorkers, onRemove, onRepair, onUpgrade, onDemolish, onSetWorkshopRecipe, onSetHuntingPrey, onSetMineMode, onQueueForge, idleWorkers, canAssignWorker, onDiplomacyAction, onTownHallAction, onFocusCamp,
}: SelectedBuildingPanelProps) {
  if (building.faction === 'rival') {
    const rival = state.rivalSettlements.find((r) => r.id === building.groupId);
    const config = getBuildingConfig(building.type);
    const pendingForRival = (state.pendingDiplomacyEvents ?? []).filter((e) => e.rivalId === rival?.id);
    const raidsForRival = (state.pendingRaidEvents ?? []).filter((e) => e.rivalId === rival?.id);
    const outgoingRaidsForRival = (state.pendingOutgoingRaidEvents ?? []).filter((e) => e.rivalId === rival?.id);
    const rivalStr = rival ? getRivalRaidStrength(rival) : 0;
    const raidFoodCost = rival ? getOutgoingRaidFoodCostForRival(state, rival) : 0;
    const atPeace = rival ? isRivalAtPeace(rival) : false;
    const raidEligibility = rival ? canLaunchRaidOnRival(state, rival) : { ok: false, foodCost: 0, blockReason: 'Unknown rival' };
    const canLaunchRaid = raidEligibility.ok;
    const outgoingRaidAction = rival ? getOutgoingRaidActionLabel(state, rival.id) : null;
    const isCounterRaid = raidsForRival.length > 0;
    const canSignPeace = rival && !atPeace && rival.relationship !== 'tense'
      && state.resources.gold >= 30 && state.resources.food >= 20;
    const canGift = rival && state.resources.food >= 25 && rival.relationship !== 'friendly';
    const canPact = rival && state.resources.gold >= 40 && rival.relationship !== 'tense' && rival.relationship !== 'friendly';
    const canShowForce = rival && (hasIronSpears(state) || hasStoneSpears(state))
      && state.humanPopulation >= 6
      && rival.relationship !== 'friendly';
    return (
      <div className="rounded-xl border border-indigo-600/40 bg-indigo-950/30 p-3">
        <div className="mb-2 flex items-center gap-2">
          <img src={config.sprite} alt={config.label} className="h-8 w-8 object-contain opacity-90" />
          <div>
            <h3 className="text-xs font-bold text-indigo-200">{rival?.name ?? building.campLabel ?? 'Rival Camp'}</h3>
            <p className="text-[9px] text-indigo-300/80">
              {config.label} · {rival ? formatRivalPopulationLabel(rival) : '?'} · <span className="capitalize">{rival?.relationship ?? 'unknown'}</span>
              {rival && (
                <>
                  {' '}· {formatCampDistance(getCampDistancePixels(state, state.buildings, rival))} away
                  {atPeace && <span className="text-cyan-300"> · 🕊️ peace {rival.peaceTreatyDays}d</span>}
                </>
              )}
            </p>
          </div>
        </div>
        {rival && onFocusCamp && (
          <button
            type="button"
            onClick={() => onFocusCamp(rival)}
            className="mb-2 w-full rounded bg-amber-900/50 px-2 py-1 text-[9px] font-bold text-amber-100 hover:bg-amber-800/50"
          >
            📍 Ping camp on map
          </button>
        )}
        {rival && (
          <div className="mb-2">
            <Suspense fallback={<p className="text-[9px] text-stone-500">Loading preview…</p>}>
              <CombatPreviewPanel
                compact
                showOutgoingRaid
                outgoingRaidIsCounter={isCounterRaid}
                preview={getCombatPreview(state, {
                  rival,
                  attackerStrength: raidsForRival[0]?.attackerStrength ?? rivalStr,
                  incomingPayoffFood: raidsForRival[0]?.lootFood,
                })}
                title={`vs ${rival.name} — ${formatCampDistance(getCampDistancePixels(state, state.buildings, rival))} · raid ${raidFoodCost}🍖`}
              />
            </Suspense>
          </div>
        )}
        {raidsForRival.map((evt) => (
          <div key={evt.id} className="mb-2 rounded-lg border border-rose-600/40 bg-rose-950/40 p-2">
            <p className="text-[10px] font-bold text-rose-200">{evt.emoji} {evt.title}</p>
            <p className="text-[9px] text-stone-400">{evt.description}</p>
            <div className="mt-1.5 grid grid-cols-1 gap-1">
              {evt.choices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  title={choice.hint}
                  onClick={() => onDiplomacyAction?.({ proto: 1, op: 'respondToRaidEvent', eventId: evt.id, choiceId: choice.id })}
                  className="rounded bg-rose-950 px-2 py-1 text-[8px] font-bold text-rose-100 hover:bg-rose-900"
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        {outgoingRaidsForRival.map((evt) => (
          <div key={evt.id} className="mb-2 rounded-lg border border-orange-600/40 bg-orange-950/40 p-2">
            <p className="text-[10px] font-bold text-orange-200">{evt.emoji} {evt.title}</p>
            <p className="text-[9px] text-stone-400">{evt.description}</p>
            <p className="mt-1 text-[8px] text-orange-300/90">
              {formatRaidDeadlineSafe(evt, state.tick)}
              {evt.rivalResponse === 'payoff_offer' && (
                <span> · offer {formatRaidLootSummary(raidEventLoot(evt))}</span>
              )}
            </p>
            <div className="mt-1.5 grid grid-cols-1 gap-1">
              {evt.choices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  title={choice.hint}
                  onClick={() => onDiplomacyAction?.({
                    proto: 1,
                    op: 'respondToOutgoingRaidEvent',
                    eventId: evt.id,
                    choiceId: choice.id,
                  })}
                  className="rounded bg-orange-950 px-2 py-1 text-[8px] font-bold text-orange-100 hover:bg-orange-900"
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        {pendingForRival.map((evt) => (
          <div key={evt.id} className="mb-2 rounded-lg border border-amber-600/30 bg-amber-950/30 p-2">
            <p className="text-[10px] font-bold text-amber-200">{evt.emoji} {evt.title}</p>
            <p className="text-[9px] text-stone-400">{evt.description}</p>
            <div className="mt-1.5 grid grid-cols-1 gap-1">
              {evt.choices.map((choice) => {
                const eligibility = getDiplomacyChoiceEligibility(state, evt, choice.id);
                return (
                <button
                  key={choice.id}
                  type="button"
                  disabled={!eligibility.ok}
                  title={eligibility.blockReason ?? choice.hint}
                  onClick={() => {
                    if (!eligibility.ok) return;
                    onDiplomacyAction?.({ proto: 1, op: 'respondToDiplomacyEvent', eventId: evt.id, choiceId: choice.id });
                  }}
                  className="rounded bg-stone-800 px-2 py-1 text-[8px] font-bold text-stone-200 hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {choice.label}
                </button>
                );
              })}
            </div>
          </div>
        ))}
        {rival && onDiplomacyAction && (
          <div className="grid grid-cols-1 gap-1">
            <button
              type="button"
              disabled={!canGift}
              onClick={() => onDiplomacyAction({ proto: 1, op: 'sendRivalGift', rivalId: rival.id })}
              className="rounded bg-stone-700 px-2 py-1 text-[8px] font-bold text-stone-200 hover:bg-stone-600 disabled:opacity-40"
            >
              🎁 Send food gift (25🍖)
            </button>
            <button
              type="button"
              disabled={!canPact}
              onClick={() => onDiplomacyAction({ proto: 1, op: 'establishRivalTradePact', rivalId: rival.id })}
              className="rounded bg-cyan-900 px-2 py-1 text-[8px] font-bold text-cyan-100 hover:bg-cyan-800 disabled:opacity-40"
            >
              🤝 Trade pact (40💰)
            </button>
            <button
              type="button"
              disabled={!canShowForce}
              onClick={() => onDiplomacyAction({ proto: 1, op: 'showStrengthToRival', rivalId: rival.id })}
              className="rounded bg-rose-900 px-2 py-1 text-[8px] font-bold text-rose-100 hover:bg-rose-800 disabled:opacity-40"
            >
              ⚔️ Show militia (parade)
            </button>
            <button
              type="button"
              disabled={!canSignPeace}
              onClick={() => onDiplomacyAction({ proto: 1, op: 'signPeaceTreaty', rivalId: rival.id })}
              className="rounded bg-cyan-900 px-2 py-1 text-[8px] font-bold text-cyan-100 hover:bg-cyan-800 disabled:opacity-40"
              title="60 days without raids · needs neutral+ relations (not tense)"
            >
              🕊️ Sign peace (30💰 + 20🍖)
            </button>
            <button
              type="button"
              disabled={!canLaunchRaid}
              onClick={() => onDiplomacyAction({ proto: 1, op: 'launchRaidOnRival', rivalId: rival.id })}
              className="rounded bg-orange-950 px-2 py-1 text-[8px] font-bold text-orange-100 hover:bg-orange-900 disabled:opacity-40"
              title={canLaunchRaid
                ? `Costs ${raidFoodCost} food (march rations) · worsens relations`
                : (raidEligibility.blockReason ?? 'Cannot raid')}
            >
              🏹 {outgoingRaidAction?.buttonLabel ?? 'Raid their camp'} ({raidFoodCost}🍖)
            </button>
          </div>
        )}
      </div>
    );
  }

  const config = getBuildingConfig(building.type);
  const isHousing = isResidenceBuildingType(building.type);
  const residenceCap = isHousing ? getResidenceCapacity(building) : config.maxOccupants;
  const upgradeCost = building.completed && building.level < 3 ? getBuildingUpgradeCost(building) : null;
  const residents = isHousing
    ? state.entities.filter((e) => e.alive && e.residenceBuildingId === building.id)
    : [];
  const prisoners = building.type === BuildingType.Prison
    ? state.entities.filter((e) => e.alive && e.type === EntityType.Human && e.prisonBuildingId === building.id)
    : [];
  const builders = !building.completed
    ? state.entities.filter((e) => building.occupants.includes(e.id))
    : [];
  const terrainMult = getTerrainEfficiencyMultiplier(state, building);
  const adjacencyMult = getAdjacencyMultiplier(state, building);
  const totalEff = Math.round(terrainMult * adjacencyMult * 100);
  return (
    <div className="rounded-xl border border-amber-600/30 bg-amber-900/20 p-3">
      <div className="mb-2 flex items-center gap-2">
        <img src={config.sprite} alt={config.label} className="h-8 w-8 object-contain" />
        <div>
          <h3 className="text-xs font-bold text-amber-200">{config.label} {building.level > 1 && `(Lv.${building.level})`}</h3>
          <p className="text-[9px] text-amber-400">{config.description}</p>
        </div>
      </div>

      <CollapsibleSection title="Overview" defaultOpen>
        <div className="space-y-0.5 text-[10px] text-amber-200">
          <p>Health: {Math.round(building.health)} / {building.maxHealth}</p>
        {isHousing && building.completed ? (
          <p>Residents: {residents.length} / {residenceCap}</p>
        ) : building.completed && !BUILDING_JOB_TYPES[building.type] && building.type === BuildingType.Mill ? (
          <p className="text-emerald-300">Passive — boosts all food +25% (no workers)</p>
        ) : (
          <p>{!building.completed ? 'Builders' : 'Workers'}: {building.occupants.length} / {config.maxOccupants}</p>
        )}
        {!building.completed && (
          <p>Progress: {Math.round(building.constructionProgress)}% · ~{config.buildTime} work-day{config.buildTime === 1 ? '' : 's'}</p>
        )}
        {isHousing && building.completed && (
          <p className="text-[9px] text-sky-300">
            Families live here automatically.
            {building.level < 3
              ? ` Upgrade below for +${getResidenceUpgradeSlotGain(building.type)} slots (max ${config.maxOccupants + getResidenceUpgradeSlotGain(building.type) * 2} at Lv.3).`
              : ' Fully expanded.'}
          </p>
        )}
        {!building.completed && isHousing && (
          <p className="text-[9px] text-stone-400">Assign builders to speed up construction.</p>
        )}
        {building.completed && isProductionBuildingType(building.type) && (
          <>
            <p>Placement bonus: <span className={totalEff >= 130 ? 'text-emerald-400' : totalEff >= 100 ? 'text-amber-400' : 'text-rose-400'}>{totalEff}%</span></p>
            <p className="text-[8px] text-stone-500">Terrain + nearby buildings (not worker skill)</p>
          </>
        )}
        {building.completed && BUILDING_JOB_TYPES[building.type] && building.type !== BuildingType.Church && building.type !== BuildingType.Prison && building.type !== BuildingType.Barracks && (
          <p className="text-[9px] text-sky-300">Workers are assigned here automatically (7am–7pm).</p>
        )}
        {building.completed && building.type === BuildingType.Mine && (
          <div className="mt-2 space-y-1.5 rounded-lg border border-zinc-700/40 bg-zinc-950/30 p-2">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-300">Extract</p>
            <div className="grid grid-cols-2 gap-1">
              {([['stone', '🪨 Stone'], ['iron', '🔩 Iron']] as const).map(([mode, label]) => {
                const active = (building.mineMode ?? 'stone') === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={!onSetMineMode}
                    onClick={() => onSetMineMode?.(mode)}
                    title={mode === 'iron' ? 'Mine extracts iron ore for the Blacksmith forge' : 'Mine extracts stone for building'}
                    className={`rounded px-1.5 py-1 text-left text-[8px] transition-all ${
                      active
                        ? 'bg-zinc-600 text-white ring-1 ring-zinc-300'
                        : 'bg-stone-800/80 text-stone-200 hover:bg-stone-700'
                    }`}
                  >
                    <span className="font-bold">{label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[8px] text-stone-400">
              Iron mode feeds the Blacksmith forge orders; stone mode feeds construction and walls. Switch freely — production follows the mode.
            </p>
          </div>
        )}
        {building.completed && building.type === BuildingType.Church && (
          <p className="text-[9px] text-violet-300">Priest is manual only — pick below, or leave empty (no curse cures).</p>
        )}
        {building.completed && building.type === BuildingType.Prison && (
          <p className="text-[9px] text-violet-300">Guard is manual only — assign one below, or the cells stay empty.</p>
        )}
        {building.completed && building.type === BuildingType.Barracks && (
          <p className="text-[9px] text-violet-300">Guards are manual only — assign below; each patrols the village (+12 militia strength).</p>
        )}
        {!building.completed && (
          <p className="text-[9px] text-sky-300">Builders work 7am–7pm only — auto-assigned each morning.</p>
        )}
        {building.completed && BUILDING_OUTPUT_HINTS[building.type] && (
          <p className="text-[9px] text-stone-400">{BUILDING_OUTPUT_HINTS[building.type]}</p>
        )}
        {building.completed && building.type === BuildingType.HuntingSpot && (
          <div className="mt-2 space-y-1.5 rounded-lg border border-orange-700/40 bg-orange-950/30 p-2">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-orange-300">Hunt target</p>
            <div className="grid grid-cols-2 gap-1">
              {HUNTING_SPOT_PREY_OPTIONS.map((opt) => {
                const active = (building.huntingSpotPrey ?? 'auto') === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={!onSetHuntingPrey}
                    onClick={() => onSetHuntingPrey?.(opt.id)}
                    title={opt.hint}
                    className={`rounded px-1.5 py-1 text-left text-[8px] transition-all ${
                      active
                        ? 'bg-orange-600 text-white ring-1 ring-amber-300'
                        : 'bg-stone-800/80 text-stone-200 hover:bg-stone-700'
                    }`}
                  >
                    <span className="font-bold">{opt.emoji} {opt.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[8px] text-stone-400">
              Hunters take the nearest selected prey within ~320 units each day. Auto hunts deer/rabbit first and only wolves as a risky last resort.
            </p>
          </div>
        )}
        {building.completed && building.type === BuildingType.Church && building.occupants.length === 0 && (
          <p className="text-[9px] text-amber-400">⚠️ No priest — nothing stops Moon Howlers on full-moon nights; courtship/morals bonuses reduced.</p>
        )}
        {building.completed && building.type === BuildingType.Church && (() => {
          const totalCursed = state.entities.filter((e) => e.alive && e.moonHowlerCursed).length;
          const huntingTonight = state.entities.filter(
            (e) => e.alive && e.type === EntityType.Werewolf && e.moonHowlerCursed,
          ).length;
          const priestCount = state.buildings
            .filter((b) => b.completed && b.type === BuildingType.Church && b.faction !== 'rival')
            .reduce((n, b) => {
              for (const id of b.occupants) {
                const e = state.entities.find((x) => x.id === id);
                if (e?.alive && e.type === EntityType.Human && !e.faction && !e.moonHowlerCursed) n++;
              }
              return n;
            }, 0);
          const w = moonHowlerRiteWeights(Math.max(1, priestCount));
          const curePct = Math.round(moonHowlerCureChanceForPriests(Math.max(1, priestCount)) * 100);
          const killPct = Math.round(w.killPriest * 100);
          const fleePct = Math.round(w.flee * 100);
          if (totalCursed === 0) {
            return (
              <p className="text-[9px] text-emerald-400">✓ No active Moon Howler curses in the village.</p>
            );
          }
          if (building.occupants.length === 0) return null;
          return (
            <p className="text-[9px] text-violet-300">
              {huntingTonight > 0
                ? `🌝 ${huntingTonight} outside (20:00–06:00) · ${priestCount} priest${priestCount === 1 ? '' : 's'} on duty → ~${curePct}% cure / ~${killPct}% priest dies / ~${fleePct}% flees (more priests = higher cure). No church staff = howler hunts freely.`
                : `🌝 ${totalCursed} curse${totalCursed === 1 ? '' : 's'} · ${priestCount} priest${priestCount === 1 ? '' : 's'} → ~${curePct}% cure chance on the next full-moon night (stacks with more priests).`}
            </p>
          );
        })()}
        {building.completed && (building.type === BuildingType.School || building.type === BuildingType.Blacksmith || building.type === BuildingType.Hospital || building.type === BuildingType.TownHall || building.type === BuildingType.Hotel) && building.occupants.length === 0 && (
          <p className="text-[9px] text-amber-400">⚠️ Unstaffed — bonuses are reduced or inactive until a worker is assigned.</p>
        )}
        {building.completed && building.type === BuildingType.Hotel && (
          <div className="mt-2 space-y-1 rounded-lg border border-cyan-700/40 bg-cyan-950/30 p-2">
            <p className="text-[9px] text-cyan-100">{describeHotelStatus(building, state.entities)}</p>
            <p className="text-[9px] text-stone-400">
              Guests: up to {HOTEL_GUEST_CAPACITY} visitors rest free while the hotel is staffed.
            </p>
          </div>
        )}
        {building.completed && building.type === BuildingType.TownHall && (
          <div className="mt-2 space-y-1.5 rounded-lg border border-blue-700/40 bg-blue-950/30 p-2">
            <p className="text-[9px] text-blue-200">{describeTownHallPerks(building)}</p>
            {onTownHallAction && (() => {
              const fest = canHostTownFestival(state, building);
              const cooldownLeft = Math.max(
                0,
                Math.ceil(((state.townHallFestivalCooldownUntilTick ?? 0) - state.tick) / TICKS_PER_DAY),
              );
              return (
                <button
                  type="button"
                  disabled={!fest.ok}
                  title={fest.reason ?? `Costs ${TOWN_HALL_FESTIVAL_COST.food} food & ${TOWN_HALL_FESTIVAL_COST.gold} gold`}
                  onClick={() => onTownHallAction({ proto: 1, op: 'hostTownFestival', buildingId: building.id })}
                  className="w-full rounded bg-blue-900 px-2 py-1.5 text-[9px] font-bold text-blue-100 hover:bg-blue-800 disabled:opacity-40"
                >
                  🎉 Host town festival ({TOWN_HALL_FESTIVAL_DAYS}d)
                  {!fest.ok && cooldownLeft > 0 ? ` — ${cooldownLeft}d cooldown` : ''}
                </button>
              );
            })()}
          </div>
        )}
        {building.completed && building.type === BuildingType.Barracks && building.occupants.length === 0 && (
          <p className="text-[9px] text-amber-400">⚠️ No guards assigned — militia bonus inactive until you staff the barracks.</p>
        )}
        {building.completed && building.type === BuildingType.Blacksmith && onQueueForge && state.villageForge && (
          <Suspense fallback={<p className="text-[9px] text-stone-500">Loading forge…</p>}>
            <BlacksmithForgePanel
              state={state}
              buildingId={building.id}
              onQueueForge={onQueueForge}
            />
          </Suspense>
        )}
        {building.completed && building.type === BuildingType.Workshop && (() => {
          const recipe = getWorkshopRecipe(building.workshopRecipeId);
          if (!recipe) return null;
          const workers = building.occupants.length;
          const estGold = estimateWorkshopGold(state, building);
          const stocked = canAffordRecipe(state.resources, recipe);
          return (
            <div className="mt-2 space-y-1.5 rounded-lg border border-orange-700/40 bg-orange-950/30 p-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-orange-300">Crafting recipe</p>
              <p className="text-[10px] text-amber-100">
                {recipe.emoji} <strong>{recipe.label}</strong> — {recipe.description}
              </p>
              <p className="text-[9px] text-stone-300">
                Uses: {formatRecipeInputs(recipe.inputs)} → ~{estGold} gold / 2 days
                {workers > 0 && <span className="text-stone-500"> (with {workers} worker{workers === 1 ? '' : 's'})</span>}
              </p>
              {!stocked && (
                <p className="text-[9px] text-rose-400">Not enough materials in storage — craft pauses until stocked.</p>
              )}
              {onSetWorkshopRecipe && (
                <div className="grid grid-cols-2 gap-1">
                  {WORKSHOP_RECIPES.map((r) => {
                    const active = r.id === recipe.id;
                    const affordable = canAffordRecipe(state.resources, r);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => onSetWorkshopRecipe(r.id)}
                        className={`rounded px-1.5 py-1 text-left text-[8px] transition-all ${
                          active
                            ? 'bg-orange-600 text-white ring-1 ring-amber-300'
                            : affordable
                              ? 'bg-stone-800/80 text-stone-200 hover:bg-stone-700'
                              : 'bg-stone-900/60 text-stone-500 hover:bg-stone-800'
                        }`}
                      >
                        <span className="font-bold">{r.emoji} {r.label}</span>
                        <span className="block text-[7px] opacity-80">{formatRecipeInputs(r.inputs)} → {r.baseGold}g</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
        {terrainMult !== 1 && <p className="text-[9px] text-stone-400">Terrain: {Math.round(terrainMult * 100)}%</p>}
        {adjacencyMult !== 1 && <p className="text-[9px] text-stone-400">Adjacency: {Math.round(adjacencyMult * 100)}%</p>}
        {building.occupants.length > 0 && BUILDING_JOB_TYPES[building.type] && (() => {
          const job = BUILDING_JOB_TYPES[building.type];
          if (!job) return null;
          const workers = state.entities.filter(e => building.occupants.includes(e.id));
          const avgSkill = workers.reduce((s, w) => s + (w.skills?.[job] ?? 0), 0) / Math.max(1, workers.length);
          return (
            <p className="text-[9px] text-emerald-400">
              Worker skill: {Math.round(avgSkill)}/100 (+{Math.round(avgSkill * 2)}% output)
              {avgSkill < 1 && <span className="text-stone-500"> · gains XP each production tick</span>}
            </p>
          );
        })()}
        {isHousing && building.completed && residents.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {residents.map((r) => (
              <p key={r.id} className="text-[9px] text-amber-100">🏠 {r.name || 'Settler'}{r.surname ? ` ${r.surname}` : ''}</p>
            ))}
          </div>
        )}
        {!building.completed && builders.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {builders.map((b) => (
              <p key={b.id} className="text-[9px] text-amber-100">🔨 {b.name || 'Settler'}{b.surname ? ` ${b.surname}` : ''}</p>
            ))}
          </div>
        )}
        {building.type === BuildingType.Prison && prisoners.length > 0 && (
          <div className="mt-2 space-y-0.5 rounded border border-slate-600/40 bg-slate-900/40 p-2">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Prisoners</p>
            {prisoners.map((p) => {
              const daysLeft = p.prisonerUntilTick ? Math.max(0, Math.ceil((p.prisonerUntilTick - state.tick) / TICKS_PER_DAY)) : 0;
              return (
                <p key={p.id} className="text-[9px] text-slate-300">
                  ⛓️ {p.name || 'Settler'}{p.surname ? ` ${p.surname}` : ''} · {daysLeft} day{daysLeft === 1 ? '' : 's'} left
                </p>
              );
            })}
          </div>
        )}
        {building.completed && BUILDING_JOB_TYPES[building.type] && building.occupants.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {state.entities.filter((e) => building.occupants.includes(e.id)).map((w) => (
              <p key={w.id} className="text-[9px] text-emerald-200">
                👷 {w.name || 'Settler'}{w.surname ? ` ${w.surname}` : ''}
                {w.job ? ` · ${w.job}` : ''}
              </p>
            ))}
          </div>
        )}
      </div>
      </CollapsibleSection>

      {((!building.completed && config.maxOccupants > 0) || (building.completed && BUILDING_JOB_TYPES[building.type])) && (
        <CollapsibleSection title={!building.completed ? 'Construction' : 'Workers'} defaultOpen>
          {building.completed && BUILDING_JOB_TYPES[building.type] && assignableWorkers.length > 0 && building.occupants.length < config.maxOccupants && (
            <div className="mb-1 max-h-28 space-y-1 overflow-y-auto">
              <p className="text-[8px] text-stone-500">
                {building.type === BuildingType.Church ? 'Choose priest:' : 'Choose worker:'}
              </p>
              {assignableWorkers.map((h) => (
                <button
                  key={h.id}
                  onClick={() => onAssignWorker(h.id)}
                  className={`block w-full rounded px-2 py-1 text-left text-[9px] font-semibold text-white ${
                    building.type === BuildingType.Church
                      ? 'bg-violet-700/80 hover:bg-violet-600'
                      : 'bg-emerald-700/80 hover:bg-emerald-600'
                  }`}
                >
                  {building.type === BuildingType.Church ? '⛪ ' : '👷 '}
                  {h.name || 'Settler'}{h.surname ? ` ${h.surname}` : ''}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-1">
          {canAssignWorker && building.occupants.length < config.maxOccupants && assignableWorkers.length === 0 && (
            <button onClick={onAssign} className="rounded bg-emerald-600 px-2 py-1.5 text-[9px] font-bold text-white hover:bg-emerald-500 transition-all">
              + {!building.completed ? 'Fill builders' : idleWorkers > 0 ? `Fill workers (${idleWorkers})` : 'Fill workers'}
            </button>
          )}
          {building.completed && BUILDING_JOB_TYPES[building.type]
            && building.type !== BuildingType.Church
            && building.type !== BuildingType.Prison
            && building.type !== BuildingType.Barracks && (
            <button
              type="button"
              onClick={onAutoStaffAll}
              className="col-span-2 rounded border border-sky-600/50 bg-sky-900/40 px-2 py-1 text-[9px] font-semibold text-sky-200 hover:bg-sky-800/50"
            >
              Auto-staff all job buildings
            </button>
          )}
          {!canAssignWorker && building.occupants.length < config.maxOccupants && (
            <p className="col-span-2 text-[9px] text-stone-500">
              No idle settlers — recruit or free up workers.
            </p>
          )}
          {!isHousing && building.occupants.length > 0 && (
            <button onClick={() => onRemove(building.occupants[building.occupants.length - 1])} className="rounded bg-amber-600 px-2 py-1.5 text-[9px] font-bold text-white hover:bg-amber-500">
              − Remove {!building.completed ? 'builder' : 'worker'}
            </button>
          )}
          </div>
        </CollapsibleSection>
      )}
      <CollapsibleSection title="Building actions" defaultOpen>
        <div className="grid grid-cols-2 gap-1">
          {building.health < building.maxHealth && (
            <button onClick={onRepair} className="rounded bg-amber-700 px-2 py-1 text-[9px] font-bold text-white hover:bg-amber-600">
              🔧 Repair
            </button>
          )}
          {building.completed && building.level < 3 && upgradeCost && (
            <button onClick={onUpgrade} className="rounded bg-purple-600 px-2 py-1 text-[9px] font-bold text-white hover:bg-purple-500"
              title={`${upgradeCost.wood}w ${upgradeCost.stone}s ${upgradeCost.gold}g`}>
              {isHousing
                ? `⬆ Expand (+${getResidenceUpgradeSlotGain(building.type)})`
                : '⬆ Upgrade'}
            </button>
          )}
          <button onClick={onDemolish} className="col-span-full rounded bg-rose-700 px-2 py-1.5 text-[9px] font-bold text-white hover:bg-rose-600">
            🗑 Demolish{isHousing && residents.length > 0 ? ' (evicts residents)' : ''}
          </button>
        </div>
      </CollapsibleSection>
    </div>
  );
}
