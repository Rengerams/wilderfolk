import { Suspense, lazy, useState } from 'react';
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
} from '../game/gameEngine';
import { getBuildingUpgradeCost, estimateWorkshopGold } from '../game/buildingActions';
// The upgrade owner itself, not its façade: `buildingActions` re-exports the price but not the gate.
import { getBuildingUpgradeEligibility } from '../game/buildingMaintenanceActions';
import {
  getRivalGiftEligibility,
  getRivalTradePactEligibility,
  getShowStrengthEligibility,
  getPeaceTreatyEligibility,
  getDiplomacyExpiresAtTick,
  RIVAL_GIFT_FOOD_COST,
  RIVAL_TRADE_PACT_GOLD_COST,
  PEACE_TREATY_GOLD_COST,
  PEACE_TREATY_FOOD_COST,
} from '../game/groupEvents';
import { moonHowlerRiteWeights, countStaffedPriests } from '../game/moonHowler';
import { ensureEntityByIdMap } from '../game/entityIndex';
import {
  isResidenceBuildingType, getResidenceCapacity, getResidenceUpgradeSlotGain, daysUntilTick, getHourOfDay,
} from '../game/dayCycle';
import { formatEducationLabel, getSchoolRoster, describeSchoolRoster } from '../game/education';
import { citizenFullName, formatCitizenName, SETTLER_NAME_FALLBACK } from '../game/citizenId';
import { isProductionBuildingType } from '../game/buildCatalog';
import { MINE_ORES, mineOreForMode, type MineMode } from '../game/buildings';
import { canHostTownFestival, describeTownHallPerks, TOWN_HALL_FESTIVAL_COST, TOWN_HALL_FESTIVAL_DAYS } from '../game/townHall';
import { offDutyPrisonGuards, prisonRoster, prisonShiftsAtHour, vacantPrisonShifts } from '../game/prisonShifts';
import { prisonGuardIds } from '../game/prisonGuardDuty';
import { describeHotelStatus } from '../game/hotelStay';
import { isResidenceOccupantEntity } from '../game/residencyReconciliation';
import { describeHospitalReputation } from '../game/hospitalCare';
import { displayedConstructionProgress } from '../game/buildingProgressDisplay';
import { HOTEL_GUEST_CAPACITY } from '../game/gameTypes';
import { HUNTING_SPOT_PREY_OPTIONS } from '../game/gameTypes';
import type { HuntingSpotPrey } from '../game/gameTypes';
import { getBuildingConfig } from '../game/buildingConfig';
import { getWorkSchedule, getWorkScheduleLabel } from '../game/workSchedule';
import { formatRaidDeadline } from '../game/frontierCombat';
import { isManualStaffingBuilding, SMITH_BONUS_PER_WORKER, SMITH_BONUS_CAP } from '../game/workforce';
import { getWorkerSkillMultiplier } from '../game/skills';
import { WALL_SEGMENT_BASE_BONUS, WATCHTOWER_BASE_BONUS, MILITIA_BALANCE, getWallSegmentCap } from '../game/defenseStructures';
import { FORGE_BONUSES } from '../game/forge';
import { MILL_FOOD_PRODUCTION_MULT } from '../game/dailyBuildingEconomy';
import { PRESERVE_HEALTH_BONUS } from '../game/dailyEcology';
import { BARN_ADJACENCY_BONUS } from '../game/adjacencyIndex';
import { SILO_FOOD_STORAGE, WOOD_STOREHOUSE_STORAGE } from '../game/economy';
import type { Building, WorldState, Entity } from '../game/gameEngine';
import type { ForgeOrderId, RaidChoice } from '../game/gameTypes';
import type { RivalSettlement } from '../game/gameTypes';
import type { WorkerCommand } from '../game/simWorker/commands';

const CombatPreviewPanel = lazy(() => import('../game/CombatPreviewPanel'));
const BlacksmithForgePanel = lazy(() => import('./BlacksmithForgePanel'));

/**
 * The raid-card choice buttons. The incoming and outgoing cards render the same control, differing
 * only by the command op and the colour, so the block is written once: a change to raid-choice
 * rendering — showing the owner's block reason as text, for instance — used to have to be made
 * twice, in the pair of cards that most needs it.
 */
function RaidChoiceButtons({
  choices,
  colorClass,
  onChoose,
}: {
  choices: RaidChoice[];
  colorClass: string;
  onChoose: (choiceId: string) => void;
}) {
  return (
    <div className="mt-1.5 grid grid-cols-1 gap-1">
      {choices.map((choice) => (
        <button
          key={choice.id}
          type="button"
          title={choice.hint}
          onClick={() => onChoose(choice.id)}
          className={`rounded px-2 py-1 text-[10px] font-bold ${colorClass}`}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Hints whose numbers are owned by a rule module. They are built from the owner at render time
 * instead of being typed as prose ("Building output/tuning copy"): the wall cap moves with
 * the Wall Plates forge order, the watchtower bonus moves with Tower Ballistae, the Blacksmith
 * boost stops at `SMITH_BONUS_CAP`, the guard bonus is `MILITIA_BALANCE.guardBonusPerGuard`, and the
 * Mill/Barn/preserve/storage bonuses and the Farm's worker cap are tunable constants — the Farm's
 * is the build catalogue's `maxOccupants`, which is also the cap the staffing command enforces.
 * Returns null for buildings with no tuning numbers — those keep the plain table below.
 */
function ownerOutputHint(type: BuildingType, state: WorldState): string | null {
  switch (type) {
    case BuildingType.Farm:
      return `Produces food — more workers harvest more (up to ${getBuildingConfig(type).maxOccupants}). Watch Food in the header.`;
    case BuildingType.Wall:
      return `+${WALL_SEGMENT_BASE_BONUS} barricade strength per segment (max +${getWallSegmentCap(state)} from all wall pieces).`;
    case BuildingType.Watchtower:
      return `+${WATCHTOWER_BASE_BONUS} barricade strength (up to +${FORGE_BONUSES.towerBallistaTotalPerTower} with tower ballistae). Pairs well with walls around your core.`;
    case BuildingType.Blacksmith:
      return `Forge spears, shields, swords, scale mail & tower gear after Defense research. Staffed smith boosts lumber, quarry & mine (+${Math.round(SMITH_BONUS_PER_WORKER * 100)}% per worker, up to +${Math.round((SMITH_BONUS_CAP - 1) * 100)}%).`;
    case BuildingType.Mill:
      return `Passive — standing mill boosts all food production +${Math.round((MILL_FOOD_PRODUCTION_MULT - 1) * 100)}%. No workers needed.`;
    case BuildingType.Barn:
      return `Boosts nearby Farms/Greenhouses +${Math.round(BARN_ADJACENCY_BONUS * 100)}% — place next to fields, not a farm itself.`;
    case BuildingType.Silo:
      return `Passive food every 2 days, +${SILO_FOOD_STORAGE} food storage, less spoilage — no workers.`;
    case BuildingType.WoodStorehouse:
      return `Passive — +${WOOD_STOREHOUSE_STORAGE} wood storage for winter fuel, no workers needed.`;
    case BuildingType.Barracks:
      return `Assign Soldiers — each patrols the village (+${MILITIA_BALANCE.guardBonusPerGuard} militia strength).`;
    case BuildingType.WildlifePreserve:
      return `Passive — restores ecosystem health +${PRESERVE_HEALTH_BONUS} and helps wildlife recover; no workers.`;
    default:
      return null;
  }
}

/** Hints with no tuning number to own — pure description, kept as copy. */
const BUILDING_OUTPUT_HINTS: Partial<Record<BuildingType, string>> = {
  [BuildingType.HuntingSpot]: 'Hunters produce meat from nearby wildlife — check Food counter.',
  [BuildingType.FishingSpot]: 'Riverside fishers harvest food from the water — must touch water; safer than hunting (no wolves).',
  [BuildingType.Greenhouse]: 'Produces food year-round — watch Food in the header.',
  [BuildingType.LumberMill]: 'Produces wood — watch Wood in the header.',
  [BuildingType.Quarry]: 'Produces stone — watch Stone in the header.',
  [BuildingType.Mine]: 'Produces iron ore or gold — set the ore below. Stone comes from the Quarry.',
  [BuildingType.Store]: 'Generates passive gold income.',
  [BuildingType.Market]: 'Trades goods for gold with assigned workers.',
  [BuildingType.Workshop]: 'Pick a recipe below — crafts every 2 days when staffed and stocked.',
  [BuildingType.Church]: 'Staffed church boosts courtship/morals. Full-moon nights: more priests = higher cure chance vs a Moon Howler; no priest = howler unopposed.',
  [BuildingType.School]: 'Assign a teacher — children walk here by day; schooling speeds growth and grants graduation perks.',
  [BuildingType.Hospital]: describeHospitalReputation(),
  [BuildingType.TownHall]: 'Staff officials — taxes, trade & immigration boost, elections, scandal buffer, host festivals.',
  [BuildingType.Well]: 'Lowers settler energy drain for the whole village.',
  [BuildingType.Prison]: 'Three guards cover the day in shifts. Caught adulterers may be sentenced here for a few days.',
  [BuildingType.WallGate]: 'Gated wall segment — same defense bonus as straight walls.',
};

/** Mine ore picker presentation — one label and tooltip per extractable ore. */
const MINE_ORE_LABELS: Record<MineMode, string> = { iron: '🔩 Iron', gold: '🪙 Gold' };
const MINE_ORE_TITLES: Record<MineMode, string> = {
  iron: 'Mine extracts iron ore for the Blacksmith forge',
  gold: 'Mine extracts gold for the treasury',
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
  onSetMineMode?: (mode: MineMode) => void;
  onSetStaffingMode?: (mode: 'auto' | 'manual') => void;
  onQueueForge?: (orderId: ForgeOrderId) => void;
  canAssignWorker: boolean;
  onDiplomacyAction?: (cmd: WorkerCommand) => void;
  onTownHallAction?: (cmd: WorkerCommand) => void;
  onFocusCamp?: (rival: RivalSettlement) => void;
}

export default function SelectedBuildingPanel({
  building, state, onAssign, onAutoStaffAll, onAssignWorker, assignableWorkers, onRemove, onRepair, onUpgrade, onDemolish, onSetWorkshopRecipe, onSetHuntingPrey, onSetMineMode, onSetStaffingMode, onQueueForge, canAssignWorker, onDiplomacyAction, onTownHallAction, onFocusCamp,
}: SelectedBuildingPanelProps) {
  // Demolish confirmation is armed for the current building only, so switching
  // to another building automatically resets it (no effect required).
  const [demolishArmId, setDemolishArmId] = useState<number | null>(null);
  const confirmDemolish = demolishArmId === building.id;
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
    // The four rival-action gates are the *owners'* verdicts, plus the refusal text they carry. The
    // hand-written booleans that used to sit here drifted from the commands they guard: stricter on
    // relations (`!atPeace`, extra `relationship` tests) and looser on armament (`hasIronSpears ||
    // hasStoneSpears` against the owner's `hasWeapons`, which also accepts iron swords), so a button
    // could disagree with the command it guarded.
    const giftGate = rival ? getRivalGiftEligibility(state, rival.id) : null;
    const pactGate = rival ? getRivalTradePactEligibility(state, rival.id) : null;
    const showForceGate = rival ? getShowStrengthEligibility(state, rival.id) : null;
    const peaceGate = rival ? getPeaceTreatyEligibility(state, rival.id) : null;
    const refusal = (gate: { ok: boolean; blockReason?: string } | null) =>
      gate && !gate.ok ? ` — ${gate.blockReason ?? 'unavailable'}` : '';
    return (
      <div className="rounded-xl border border-indigo-600/40 bg-indigo-950/30 p-3">
        <div className="mb-2 flex items-center gap-2">
          {config.sprite ? (
            <img src={config.sprite} alt={config.label} className="h-8 w-8 object-contain opacity-90" />
          ) : (
            <span className="text-xl leading-none opacity-90">{config.emoji}</span>
          )}
          <div>
            <h3 className="text-sm font-bold text-indigo-200">{rival?.name ?? building.campLabel ?? 'Rival Camp'}</h3>
            <p className="text-[11px] text-indigo-300/80">
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
            className="mb-2 w-full rounded bg-amber-900/50 px-2 py-1 text-[11px] font-bold text-amber-100 hover:bg-amber-800/50"
          >
            📍 Ping camp on map
          </button>
        )}
        {rival && (
          <div className="mb-2">
            <Suspense fallback={<p className="text-[11px] text-stone-300">Loading preview…</p>}>
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
            <p className="text-xs font-bold text-rose-200">{evt.emoji} {evt.title}</p>
            <p className="text-[11px] text-stone-300">{evt.description}</p>
            <RaidChoiceButtons
              choices={evt.choices}
              colorClass="bg-rose-950 text-rose-100 hover:bg-rose-900"
              onChoose={(choiceId) => onDiplomacyAction?.({ proto: 1, op: 'respondToRaidEvent', eventId: evt.id, choiceId })}
            />
          </div>
        ))}
        {outgoingRaidsForRival.map((evt) => (
          <div key={evt.id} className="mb-2 rounded-lg border border-orange-600/40 bg-orange-950/40 p-2">
            <p className="text-xs font-bold text-orange-200">{evt.emoji} {evt.title}</p>
            <p className="text-[11px] text-stone-300">{evt.description}</p>
            <p className="mt-1 text-[10px] text-orange-300/90">
              {formatRaidDeadline(evt, state.tick)}
              {evt.rivalResponse === 'payoff_offer' && (
                <span> · offer {formatRaidLootSummary(raidEventLoot(evt))}</span>
              )}
            </p>
            <RaidChoiceButtons
              choices={evt.choices}
              colorClass="bg-orange-950 text-orange-100 hover:bg-orange-900"
              onChoose={(choiceId) => onDiplomacyAction?.({
                proto: 1,
                op: 'respondToOutgoingRaidEvent',
                eventId: evt.id,
                choiceId,
              })}
            />
          </div>
        ))}
        {pendingForRival.map((evt) => {
          const daysRemaining = daysUntilTick(state.tick, getDiplomacyExpiresAtTick(evt));
          return (
          <div key={evt.id} className="mb-2 rounded-lg border border-amber-600/30 bg-amber-950/30 p-2">
            <p className="text-xs font-bold text-amber-200">{evt.emoji} {evt.title}</p>
            <p className="text-[11px] text-stone-300">{evt.description}</p>
            <p className="text-[10px] text-amber-300/80">Expires in {daysRemaining} day{daysRemaining === 1 ? '' : 's'} · choose a response to apply the shown cost and consequence.</p>
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
                  className="rounded bg-stone-800 px-2 py-1 text-[10px] font-bold text-stone-200 hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {choice.label}{refusal(eligibility)}
                </button>
                );
              })}
            </div>
          </div>
          );
        })}
        {rival && onDiplomacyAction && (
          <div className="grid grid-cols-1 gap-1">
            <button
              type="button"
              disabled={!giftGate?.ok}
              onClick={() => onDiplomacyAction({ proto: 1, op: 'sendRivalGift', rivalId: rival.id })}
              className="rounded bg-stone-700 px-2 py-1 text-[10px] font-bold text-stone-200 hover:bg-stone-600 disabled:opacity-40"
            >
              🎁 Send food gift ({RIVAL_GIFT_FOOD_COST}🍖){refusal(giftGate)}
            </button>
            <button
              type="button"
              disabled={!pactGate?.ok}
              onClick={() => onDiplomacyAction({ proto: 1, op: 'establishRivalTradePact', rivalId: rival.id })}
              className="rounded bg-cyan-900 px-2 py-1 text-[10px] font-bold text-cyan-100 hover:bg-cyan-800 disabled:opacity-40"
            >
              🤝 Trade pact ({RIVAL_TRADE_PACT_GOLD_COST}💰){refusal(pactGate)}
            </button>
            <button
              type="button"
              disabled={!showForceGate?.ok}
              onClick={() => onDiplomacyAction({ proto: 1, op: 'showStrengthToRival', rivalId: rival.id })}
              className="rounded bg-rose-900 px-2 py-1 text-[10px] font-bold text-rose-100 hover:bg-rose-800 disabled:opacity-40"
            >
              ⚔️ Show militia (parade){refusal(showForceGate)}
            </button>
            <button
              type="button"
              disabled={!peaceGate?.ok}
              onClick={() => onDiplomacyAction({ proto: 1, op: 'signPeaceTreaty', rivalId: rival.id })}
              className="rounded bg-cyan-900 px-2 py-1 text-[10px] font-bold text-cyan-100 hover:bg-cyan-800 disabled:opacity-40"
              title="60 days without raids · needs neutral+ relations (not tense)"
            >
              🕊️ Sign peace ({PEACE_TREATY_GOLD_COST}💰 + {PEACE_TREATY_FOOD_COST}🍖){refusal(peaceGate)}
            </button>
            <button
              type="button"
              disabled={!canLaunchRaid}
              onClick={() => onDiplomacyAction({ proto: 1, op: 'launchRaidOnRival', rivalId: rival.id })}
              className="rounded bg-orange-950 px-2 py-1 text-[10px] font-bold text-orange-100 hover:bg-orange-900 disabled:opacity-40"
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
  /**
   * Whether this building staffs by hand. The rule (including the per-type default for a building that
   * has never been set) is `workforce.isManualStaffingBuilding` — the panel used to restate it in two
   * places, which is how the toggle and the worker list could disagree (audit C2).
   */
  const isManualStaffing = isManualStaffingBuilding(building);
  /** The mode the buttons highlight: the owner's verdict, not a second reading of `staffingMode`. */
  const effectiveStaffingMode: 'auto' | 'manual' = isManualStaffing ? 'manual' : 'auto';
  const residenceCap = isHousing ? getResidenceCapacity(building) : config.maxOccupants;
  /** The upgrade owner's verdict for this building — its price, its ceiling, its exceptions. */
  const upgradeEligibility = getBuildingUpgradeEligibility(state, building.id);
  /**
   * Whether the upgrade owner would allow another level at all, as opposed to merely refusing the
   * price: the same gate asked with resources the colony always has, so only the structural
   * refusals (`MAX_BUILDING_LEVEL`, the Leader's House) are left. `MAX_BUILDING_LEVEL` is
   * module-private to `buildingMaintenanceActions`, so the ceiling is asked of the owner instead of
   * being retyped here as a local level comparison — which made a raised ceiling unreachable from the
   * UI and a lowered one offer a button whose command is refused (U-3).
   */
  const upgradePossible = getBuildingUpgradeEligibility(
    { ...state, resources: { ...state.resources, wood: Infinity, stone: Infinity, gold: Infinity } },
    building.id,
  ).ok;
  const upgradeCost = building.completed && upgradePossible ? getBuildingUpgradeCost(building) : null;
  // The residence rule is the owner's, not a local copy: `isResidenceOccupantEntity` also excludes
  // foreign-faction entities and *includes* a cursed settler in werewolf form, so the local
  // `alive && residenceBuildingId === id` test counted a visitor with a residence id as a resident and
  // dropped a cursed one during a full moon — the same "view restates the owner" defect as bug 40/41.
  // This is the exact predicate + id test `syncResidenceOccupants` uses to build `building.occupants`.
  const residents = isHousing
    ? state.entities.filter((e) => isResidenceOccupantEntity(e) && e.residenceBuildingId === building.id)
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
        {config.sprite ? (
          <img src={config.sprite} alt={config.label} className="h-8 w-8 object-contain" />
        ) : (
          <span className="text-2xl leading-none">{config.emoji}</span>
        )}
        <div>
          <h3 className="text-base font-bold text-amber-200">{config.label} {building.level > 1 && `(Lv.${building.level})`}</h3>
          <p className="text-[11px] text-amber-400">{config.description}</p>
        </div>
      </div>

      <CollapsibleSection title="Overview" defaultOpen storageKey={`building-overview-${building.id}`}>
        <div className="space-y-0.5 text-xs text-amber-200">
          <p>Health: {Math.round(building.health)} / {building.maxHealth}</p>
        {isHousing && building.completed ? (
          <p>Residents: {residents.length} / {residenceCap}</p>
        ) : (
          <p>{!building.completed ? 'Builders' : 'Workers'}: {building.occupants.length} / {config.maxOccupants}</p>
        )}
        {!building.completed && (
          <p>Progress: {Math.floor(displayedConstructionProgress(building, state.tick))}% · ~{config.buildTime} work-day{config.buildTime === 1 ? '' : 's'}</p>
        )}
        {isHousing && building.completed && (
          <p className="text-[11px] text-sky-300">
            Families live here automatically.
            {upgradePossible
              ? ` Upgrade below for +${getResidenceUpgradeSlotGain(building.type)} slots per level.`
              : ' Fully expanded.'}
          </p>
        )}
        {!building.completed && isHousing && (
          <p className="text-[11px] text-stone-300">Assign builders to speed up construction.</p>
        )}
        {building.completed && isProductionBuildingType(building.type) && (
          <>
            <p>Placement bonus: <span className={totalEff >= 130 ? 'text-emerald-400' : totalEff >= 100 ? 'text-amber-400' : 'text-rose-400'}>{totalEff}%</span></p>
            <p className="text-[10px] text-stone-300">Terrain + nearby buildings (not worker skill)</p>
          </>
        )}
        {building.completed && BUILDING_JOB_TYPES[building.type] && building.type !== BuildingType.Church && building.type !== BuildingType.Prison && building.type !== BuildingType.Barracks && (
          <p className="text-[11px] text-sky-300">Workers are assigned here automatically ({getWorkScheduleLabel(getWorkSchedule(state))}).</p>
        )}
        {building.completed && building.type === BuildingType.Mine && (
          <div className="mt-2 space-y-1.5 rounded-lg border border-zinc-700/40 bg-zinc-950/30 p-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-300">Extract</p>
            <div className="grid grid-cols-2 gap-1">
              {MINE_ORES.map((mode) => {
                const active = mineOreForMode(building.mineMode) === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={!onSetMineMode}
                    onClick={() => onSetMineMode?.(mode)}
                    title={MINE_ORE_TITLES[mode]}
                    className={`rounded px-1.5 py-1 text-left text-[10px] transition-all ${
                      active
                        ? 'bg-zinc-600 text-white ring-1 ring-zinc-300'
                        : 'bg-stone-800/80 text-stone-200 hover:bg-stone-700'
                    }`}
                  >
                    <span className="font-bold">{MINE_ORE_LABELS[mode]}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-stone-300">
              Iron feeds the Blacksmith forge orders; gold feeds the treasury. Switch freely — production follows the ore. Stone is quarried, not mined.
            </p>
          </div>
        )}
        {building.completed && building.type === BuildingType.Church && (
          <p className="text-[11px] text-violet-300">Priest is manual only — pick below, or leave empty (no curse cures).</p>
        )}
        {building.completed && building.type === BuildingType.Prison && (() => {
          const byId = ensureEntityByIdMap(state);
          const guardIds = prisonGuardIds(state, building.occupants ?? []);
          const roster = prisonRoster(guardIds, state.tick);
          const resting = offDutyPrisonGuards(guardIds, state.tick);
          const vacant = vacantPrisonShifts(roster);
          const onPostNow = prisonShiftsAtHour(getHourOfDay(state.tick));
          return (
            <div className="mt-2 space-y-1.5 rounded-lg border border-violet-700/40 bg-violet-950/30 p-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-300">
                Shifts — rotate weekly, days off in turn
              </p>
              {roster.map(({ shift, guardId }) => {
                const guard = guardId != null ? byId.get(guardId) : undefined;
                const onDuty = onPostNow.some((s) => s.key === shift.key);
                return (
                  <p key={shift.key} className="text-[11px] text-stone-300">
                    <span className="font-bold text-stone-100">{shift.label}</span>
                    <span className="text-stone-400">
                      {' '}{shift.startHour}:00–{shift.endHour % 24}:00 ·{' '}
                    </span>
                    <span className={guard ? 'text-emerald-300' : 'text-amber-400'}>
                      {guard ? (guard.name ?? SETTLER_NAME_FALLBACK) : 'no guard'}
                    </span>
                    {onDuty && <span className="text-[10px] text-sky-300"> · on post now</span>}
                  </p>
                );
              })}
              {resting.length > 0 && (
                <p className="text-[10px] text-stone-400">
                  Off duty today:{' '}
                  {resting.map((id) => byId.get(id)?.name ?? SETTLER_NAME_FALLBACK).join(' · ')}
                </p>
              )}
              <p className="text-[10px] text-stone-300">
                {vacant.length === 0
                  ? 'Three guards cover all 24 hours — nobody slips out.'
                  : `${vacant.length === 1 ? 'One shift is' : `${vacant.length} shifts are`} unstaffed — prisoners can slip out in those hours.`}
              </p>
            </div>
          );
        })()}
        {building.completed && building.type === BuildingType.Barracks && (
          <p className="text-[11px] text-violet-300">Soldiers are manual only — assign below; each patrols the village (+{MILITIA_BALANCE.guardBonusPerGuard} militia strength).</p>
        )}
        {!building.completed && (
          <p className="text-[11px] text-sky-300">Builders work {getWorkScheduleLabel(getWorkSchedule(state))} only — auto-assigned each morning.</p>
        )}
        {building.completed && (ownerOutputHint(building.type, state) ?? BUILDING_OUTPUT_HINTS[building.type]) && (
          <p className="text-[11px] text-stone-300">
            {ownerOutputHint(building.type, state) ?? BUILDING_OUTPUT_HINTS[building.type]}
          </p>
        )}
        {building.completed && building.type === BuildingType.HuntingSpot && (
          <div className="mt-2 space-y-1.5 rounded-lg border border-orange-700/40 bg-orange-950/30 p-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-orange-300">Hunt target</p>
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
                    className={`rounded px-1.5 py-1 text-left text-[10px] transition-all ${
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
            <p className="text-[10px] text-stone-300">
              Hunters take the nearest selected prey within ~320 units each day. Auto hunts deer/rabbit first and only wolves as a risky last resort.
            </p>
          </div>
        )}
        {building.completed && building.type === BuildingType.Church && building.occupants.length === 0 && (
          <p className="text-[11px] text-amber-400">⚠️ No priest — nothing stops Moon Howlers on full-moon nights; courtship/morals bonuses reduced.</p>
        )}
        {building.completed && building.type === BuildingType.Church && (() => {
          const totalCursed = state.entities.filter((e) => e.alive && e.moonHowlerCursed).length;
          const huntingTonight = state.entities.filter(
            (e) => e.alive && e.type === EntityType.Werewolf && e.moonHowlerCursed,
          ).length;
          // The count that feeds the rite is the moonHowler owner's (`countStaffedPriests` is what
          // `tickMoonHowlerCycle` itself uses), not a second reduce over churches here.
          const priestCount = countStaffedPriests(state.buildings, ensureEntityByIdMap(state));
          const w = moonHowlerRiteWeights(priestCount);
          const curePct = Math.round(w.cure * 100);
          const killPct = Math.round(w.killPriest * 100);
          const fleePct = Math.round(w.flee * 100);
          if (totalCursed === 0) {
            return (
              <p className="text-[11px] text-emerald-400">✓ No active Moon Howler curses in the village.</p>
            );
          }
          if (building.occupants.length === 0) return null;
          // With no eligible priest the owner's rite never fires (`no_priest`), so the panel must not
          // print the one-priest odds: it used to clamp an empty count up to one before asking the
          // weights, promising a ~cure chance the simulation cannot produce (2026-09-20 audit, O-6).
          if (priestCount === 0) {
            return (
              <p className="text-[11px] text-amber-400">
                ⚠️ No priest on duty — the rite cannot be attempted, so a curse holds until a priest
                takes this Church (full moons are every ~14 days).
              </p>
            );
          }
          return (
            <p className="text-[11px] text-violet-300">
              {huntingTonight > 0
                ? `🌝 ${huntingTonight} outside (20:00–06:00) · ${priestCount} priest${priestCount === 1 ? '' : 's'} on duty → ~${curePct}% cure / ~${killPct}% priest dies / ~${fleePct}% flees (more priests = higher cure). No church staff = howler hunts freely.`
                : `🌝 ${totalCursed} curse${totalCursed === 1 ? '' : 's'} · ${priestCount} priest${priestCount === 1 ? '' : 's'} → ~${curePct}% cure chance on the next full-moon night (stacks with more priests).`}
            </p>
          );
        })()}
        {building.completed && (building.type === BuildingType.School || building.type === BuildingType.Blacksmith || building.type === BuildingType.Hospital || building.type === BuildingType.TownHall || building.type === BuildingType.Hotel) && building.occupants.length === 0 && (
          <p className="text-[11px] text-amber-400">⚠️ Unstaffed — bonuses are reduced or inactive until a worker is assigned.</p>
        )}
        {building.completed && building.type === BuildingType.School && (() => {
          // The tick does not store attendance: children walk to the nearest staffed
          // school with a free seat, so the roster is computed by that same rule.
          const roster = getSchoolRoster(
            building,
            state.buildings,
            state.entities,
            state.tick,
            getHourOfDay(state.tick),
          );
          const summary = describeSchoolRoster(roster, building.occupants.length > 0);
          return (
            <div className="mt-2 space-y-1 rounded-lg border border-emerald-700/40 bg-emerald-950/30 p-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                {summary.headline}
              </p>
              {summary.emptyHint && <p className="text-[11px] text-stone-300">{summary.emptyHint}</p>}
              {roster.pupils.length > 0 && (
                <ul className="space-y-0.5">
                  {roster.pupils.map((pupil) => {
                    const education = formatEducationLabel(pupil);
                    const inClass = roster.inClassNow.some((attending) => attending.id === pupil.id);
                    return (
                      <li key={pupil.id} className="flex items-baseline justify-between gap-2 text-[11px]">
                        <span className="truncate text-stone-200">{formatCitizenName(pupil)}</span>
                        <span className={`shrink-0 ${inClass ? 'text-emerald-300' : 'text-stone-400'}`}>
                          {inClass ? 'in class' : 'enrolled'}
                          {education ? ` · ${education}` : ''}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {summary.classroomFull && (
                <p className="text-[11px] text-amber-400">⚠️ Classroom full — a second school takes the overflow.</p>
              )}
            </div>
          );
        })()}
        {building.completed && building.type === BuildingType.Hotel && (
          <div className="mt-2 space-y-1 rounded-lg border border-cyan-700/40 bg-cyan-950/30 p-2">
            <p className="text-[11px] text-cyan-100">{describeHotelStatus(building, state.entities)}</p>
            <p className="text-[11px] text-stone-300">
              Guests: up to {HOTEL_GUEST_CAPACITY} visitors rest free while the hotel is staffed.
            </p>
          </div>
        )}
        {building.completed && building.type === BuildingType.TownHall && (
          <div className="mt-2 space-y-1.5 rounded-lg border border-blue-700/40 bg-blue-950/30 p-2">
            <p className="text-[11px] text-blue-200">{describeTownHallPerks(building)}</p>
            {onTownHallAction && (() => {
              const fest = canHostTownFestival(state, building);
              const cooldownLeft = daysUntilTick(state.tick, state.townHallFestivalCooldownUntilTick ?? 0);
              return (
                <button
                  type="button"
                  disabled={!fest.ok}
                  title={fest.reason ?? `Costs ${TOWN_HALL_FESTIVAL_COST.food} food & ${TOWN_HALL_FESTIVAL_COST.gold} gold`}
                  onClick={() => onTownHallAction({ proto: 1, op: 'hostTownFestival', buildingId: building.id })}
                  className="w-full rounded bg-blue-900 px-2 py-1.5 text-[11px] font-bold text-blue-100 hover:bg-blue-800 disabled:opacity-40"
                >
                  🎉 Host town festival ({TOWN_HALL_FESTIVAL_DAYS}d)
                  {!fest.ok && cooldownLeft > 0 ? ` — ${cooldownLeft}d cooldown` : ''}
                </button>
              );
            })()}
          </div>
        )}
        {building.completed && building.type === BuildingType.Barracks && building.occupants.length === 0 && (
          <p className="text-[11px] text-amber-400">⚠️ No guards assigned — militia bonus inactive until you staff the barracks.</p>
        )}
        {building.completed && building.type === BuildingType.Blacksmith && onQueueForge && state.villageForge && (
          <Suspense fallback={<p className="text-[11px] text-stone-300">Loading forge…</p>}>
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
              <p className="text-[11px] font-semibold uppercase tracking-wider text-orange-300">Crafting recipe</p>
              <p className="text-xs text-amber-100">
                {recipe.emoji} <strong>{recipe.label}</strong> — {recipe.description}
              </p>
              <p className="text-[11px] text-stone-300">
                Uses: {formatRecipeInputs(recipe.inputs)} → ~{estGold} gold / 2 days
                {workers > 0 && <span className="text-stone-400"> (with {workers} worker{workers === 1 ? '' : 's'})</span>}
              </p>
              {!stocked && (
                <p className="text-[11px] text-rose-400">Not enough materials in storage — craft pauses until stocked.</p>
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
                        className={`rounded px-1.5 py-1 text-left text-[10px] transition-all ${
                          active
                            ? 'bg-orange-600 text-white ring-1 ring-amber-300'
                            : affordable
                              ? 'bg-stone-800/80 text-stone-200 hover:bg-stone-700'
                              : 'bg-stone-900/60 text-stone-400 hover:bg-stone-800'
                        }`}
                      >
                        <span className="font-bold">{r.emoji} {r.label}</span>
                        <span className="block text-[10px] opacity-90">{formatRecipeInputs(r.inputs)} → {r.baseGold}g</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
        {terrainMult !== 1 && <p className="text-[11px] text-stone-300">Terrain: {Math.round(terrainMult * 100)}%</p>}
        {adjacencyMult !== 1 && <p className="text-[11px] text-stone-300">Adjacency: {Math.round(adjacencyMult * 100)}%</p>}
        {building.occupants.length > 0 && BUILDING_JOB_TYPES[building.type] && (() => {
          const job = BUILDING_JOB_TYPES[building.type];
          if (!job) return null;
          const workers = state.entities.filter(e => building.occupants.includes(e.id));
          const avgSkill = workers.reduce((s, w) => s + (w.skills?.[job] ?? 0), 0) / Math.max(1, workers.length);
          // The output bonus is the skills owner's, so `resourcefulMult` is included; reading it as
          // `avgSkill * 2` was a second definition that omitted it (audit C2).
          const skillBonusPercent = Math.round((getWorkerSkillMultiplier(state, building) - 1) * 100);
          return (
            <p className="text-[11px] text-emerald-400">
              Worker skill: {Math.round(avgSkill)}/100 (+{skillBonusPercent}% output)
              {avgSkill < 1 && <span className="text-stone-400"> · gains XP each production tick</span>}
            </p>
          );
        })()}
        {isHousing && building.completed && residents.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {residents.map((r) => (
              <p key={r.id} className="text-[11px] text-amber-100">🏠 {citizenFullName(r)}</p>
            ))}
          </div>
        )}
        {!building.completed && builders.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {builders.map((b) => (
              <p key={b.id} className="text-[11px] text-amber-100">🔨 {citizenFullName(b)}</p>
            ))}
          </div>
        )}
        {building.type === BuildingType.Prison && prisoners.length > 0 && (
          <div className="mt-2 space-y-0.5 rounded border border-slate-600/40 bg-slate-900/40 p-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Prisoners</p>
            {prisoners.map((p) => {
              const daysLeft = p.prisonerUntilTick ? daysUntilTick(state.tick, p.prisonerUntilTick) : 0;
              return (
                <p key={p.id} className="text-[11px] text-slate-300">
                  ⛓️ {citizenFullName(p)} · {daysLeft} day{daysLeft === 1 ? '' : 's'} left
                </p>
              );
            })}
          </div>
        )}
        {building.completed && BUILDING_JOB_TYPES[building.type] && building.occupants.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {state.entities.filter((e) => building.occupants.includes(e.id)).map((w) => (
              <p key={w.id} className="text-[11px] text-emerald-200">
                👷 {citizenFullName(w)}
                {w.job ? ` · ${w.job}` : ''}
                {w.apprenticeId != null && (
                  <span className="text-cyan-300">
                    {' '}🎓 {(() => {
                      const ap = state.entities.find((e) => e.id === w.apprenticeId);
                      return ap ? `teaching ${ap.name ?? 'an apprentice'}` : '';
                    })()}
                  </span>
                )}
              </p>
            ))}
          </div>
        )}
      </div>
      </CollapsibleSection>

      {((!building.completed && config.maxOccupants > 0) || (building.completed && BUILDING_JOB_TYPES[building.type])) && (
        <CollapsibleSection title={!building.completed ? 'Construction' : 'Workers'} defaultOpen storageKey={`building-workers-${building.id}`}>
          {building.completed && BUILDING_JOB_TYPES[building.type] && isManualStaffing && assignableWorkers.length > 0 && building.occupants.length < config.maxOccupants && (
            <div className="mb-1 max-h-28 space-y-1 overflow-y-auto">
              <p className="text-[10px] text-stone-300">
                {building.type === BuildingType.Church ? 'Choose priest:' : 'Choose worker:'}
              </p>
              {assignableWorkers.map((h) => (
                <button
                  key={h.id}
                  onClick={() => onAssignWorker(h.id)}
                  className={`block w-full rounded px-2 py-1 text-left text-[11px] font-semibold text-white ${
                    building.type === BuildingType.Church
                      ? 'bg-violet-700/80 hover:bg-violet-600'
                      : 'bg-emerald-700/80 hover:bg-emerald-600'
                  }`}
                >
                  {building.type === BuildingType.Church ? '⛪ ' : '👷 '}
                  {citizenFullName(h)}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-1">
          {canAssignWorker && building.occupants.length < config.maxOccupants && assignableWorkers.length === 0 && (
            <button onClick={onAssign} className="rounded bg-emerald-600 px-2 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-500 transition-all">
              + {!building.completed ? 'Fill builders' : 'Fill workers'}
            </button>
          )}
          {building.completed && BUILDING_JOB_TYPES[building.type] && (
            <>
            <div className="col-span-2 rounded border border-sky-700/40 bg-sky-950/30 p-1.5">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-sky-300">Staffing</p>
              <div className="grid grid-cols-2 gap-1">
                {(['auto', 'manual'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onSetStaffingMode?.(mode)}
                    className={`rounded px-1.5 py-1 text-[10px] font-semibold ${
                      effectiveStaffingMode === mode
                        ? 'bg-sky-600 text-white ring-1 ring-sky-300'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >{mode === 'auto' ? 'Auto-fill' : 'Manual'}</button>
                ))}
              </div>
            </div>
            {building.type !== BuildingType.Church
            && building.type !== BuildingType.Prison
            && building.type !== BuildingType.Barracks && (
            <button
              type="button"
              onClick={onAutoStaffAll}
              className="col-span-2 rounded border border-sky-600/50 bg-sky-900/40 px-2 py-1 text-[11px] font-semibold text-sky-200 hover:bg-sky-800/50"
            >
              Auto-staff all job buildings
            </button>
            )}
            </>
          )}
          {!canAssignWorker && building.occupants.length < config.maxOccupants && (
            <p className="col-span-2 text-[11px] text-stone-300">
              No idle settlers — recruit or free up workers.
            </p>
          )}
          {!isHousing && isManualStaffing && (() => {
            // A Prison's occupant list is guards ∪ prisoners (`workforce.syncJobBuildingOccupants`), so
            // listing it here announced prisoners as its "Current workers" — the owner's eight-row
            // roster of seven guards and a cellmate. Only the posts are staff.
            const staffedIds = building.type === BuildingType.Prison
              ? prisonGuardIds(state, building.occupants ?? [])
              : building.occupants;
            if (staffedIds.length === 0) return null;
            return (
            <div className="col-span-2 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Current workers</p>
              {staffedIds.map((occupantId) => {
                const worker = state.entities.find((e) => e.id === occupantId);
                return (
                  <div key={occupantId} className="flex items-center justify-between gap-2 rounded bg-stone-700/40 px-2 py-1">
                    <span className="truncate text-[11px] font-semibold text-white">
                      {worker ? citizenFullName(worker) : SETTLER_NAME_FALLBACK}
                    </span>
                    <button
                      onClick={() => onRemove(occupantId)}
                      className="shrink-0 rounded bg-amber-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-amber-500"
                    >
                      − Remove
                    </button>
                  </div>
                );
              })}
            </div>
            );
          })()}
          </div>
        </CollapsibleSection>
      )}
      <CollapsibleSection title="Building actions" defaultOpen storageKey={`building-actions-${building.id}`}>
        <div className="grid grid-cols-2 gap-1">
          {building.health < building.maxHealth && (
            <button onClick={onRepair} className="rounded bg-amber-700 px-2 py-1 text-[11px] font-bold text-white hover:bg-amber-600">
              🔧 Repair
            </button>
          )}
          {building.completed && upgradeCost && (
            <button onClick={onUpgrade} className="rounded bg-purple-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-purple-500"
              title={`${upgradeCost.wood}w ${upgradeCost.stone}s ${upgradeCost.gold}g`}>
              {isHousing
                ? `⬆ Expand (+${getResidenceUpgradeSlotGain(building.type)})`
                : '⬆ Upgrade'}
            </button>
          )}
          {/* The owner's own refusal, as text: the button stays clickable (the command answers with a
              floating message), but the reason must not live only in a hover tooltip. */}
          {building.completed && upgradeCost && !upgradeEligibility.ok && (
            <p className="col-span-2 text-[11px] text-amber-400">
              ⚠️ Cannot upgrade yet — {upgradeEligibility.blockReason ?? 'unavailable'}.
            </p>
          )}
        </div>
      </CollapsibleSection>
      <CollapsibleSection title="Advanced actions" defaultOpen={false} storageKey={`building-advanced-${building.id}`}>
        {confirmDemolish ? (
          <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 p-2">
            <p className="text-[11px] font-semibold text-rose-200">
              Demolish{' '}
              {isHousing && residents.length > 0
                ? `evicts ${residents.length} resident${residents.length === 1 ? '' : 's'}`
                : 'this building'}{' '}
              permanently. This cannot be undone.
            </p>
            <div className="mt-1.5 grid grid-cols-2 gap-1">
              <button
                onClick={onDemolish}
                className="rounded bg-rose-600 px-2 py-1.5 text-[11px] font-bold text-white hover:bg-rose-500"
              >
                🗑 Confirm demolish
              </button>
              <button
                onClick={() => setDemolishArmId(null)}
                className="rounded bg-stone-700 px-2 py-1.5 text-[11px] font-bold text-stone-200 hover:bg-stone-600"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setDemolishArmId(building.id)}
            className="w-full rounded bg-rose-700 px-2 py-1.5 text-[11px] font-bold text-white hover:bg-rose-600"
          >
            🗑 Demolish{isHousing && residents.length > 0 ? ` (evicts ${residents.length})` : ''}
          </button>
        )}
      </CollapsibleSection>
    </div>
  );
}
