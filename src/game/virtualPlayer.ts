/**
 * Virtual player ("auto-play") — a PURE, stateless decision engine.
 *
 * The engine only *proposes*. It never mutates `WorldState`, holds no history,
 * and reads no UI state: given the same world it always returns the same answer.
 * Every proposal is a real `WorkerCommand` that the driver hook hands to the
 * player's own dispatch door (`GameLoop.applyCommand`), so the bot is subject to
 * the same command validation, worker authority, save boundary, and optimistic
 * display rules as a human click (AGENTS.md §5/§6). There is no second mutation
 * path and no new tick layer (§7).
 *
 * Priorities — a human answers their cards first, then fixes the colony:
 *   1. an open player card (raid / outgoing raid / diplomacy / Village Request / story)
 *   2. the Leader's House (free and unique)   3. staffing   4. housing   5. food
 *   6. civic            7. research            8. festival  9. industry
 *  10. repairs  11. forge orders  12. building tuning  13. recruitment
 *  14. visitors 15. manual staffing  16. staffing mode  17. work day
 *  18. venue hours  19. surplus crew  20. roads  21. demolition
 *  22. upkeep & agency (housing, taming)  23. rival relations
 *  24. community services  25. building upgrades
 *  (24 and 25 are last on purpose: they may only spend an hour nothing else wanted)
 *
 * Costs, affordability, placement validity, staffing eligibility, research
 * gating, festival readiness, repair/upgrade rules, recruitment, forging, taming,
 * visitor trade, refugee offers, peace, pacts and raid eligibility are all
 * delegated to their existing owner modules (`canAfford`, `canPlaceBuilding`,
 * `canAssignWorkerToBuilding`, `listAssignableWorkersForBuilding`, `canStartResearch`,
 * `canHostTownFestival`,
 * `getOpenPlayerBeds`, `getDiplomacyChoiceEligibility`, `getRaidChoiceEligibility`,
 * `getStoryChoiceEligibility`, `getRepairBuildingEligibility`,
 * `getBuildingUpgradeEligibility`, `getForgeBlockReason`,
 * `getRecruitSettlerEligibility`, `getTameEntityEligibility`,
 * `getVisitorTradeEligibility`, `getRefugeeChoiceEligibility`,
 * `getRivalGiftEligibility`, `getShowStrengthEligibility`,
 * `getRivalTradePactEligibility`, `getPeaceTreatyEligibility`,
 * `getVillageRequestEligibility`,
 * `canEstablishTradeRoute`, `canLaunchRaidOnRival`, `validateWorkSchedule`,
 * `validateVenueSchedule`, `buildStripPreview`).
 * This file adds no new game rule, and it never proposes a card answer an owner
 * would refuse: a refused command still claims its in-game hour, so it would
 * repeat every hour until the card expired while nothing else got done.
 */
import type { Building, HuntingSpotPrey, Resources, StaffingMode, VisitorGroup, WorldState } from './gameTypes';
import { BUILDING_CONFIGS, BUILDING_JOB_TYPES, BuildingType, EntityType, GRID_SIZE, PATH_CELL } from './gameTypes';
import type { ForgeOrderId } from './gameTypes';
import { WORKER_CMD_PROTO, type WorkerCommand } from './simWorker/commands';
import { buildStripPreview, canPlaceBuilding } from './buildingPlacementActions';
import {
  getBuildingFootprintForType,
  snapBuildingCenter,
  type BuildingRotation,
} from './buildingRotation';
import { canAfford } from './resourceUtils';
import { formatResourceCostNeed } from './resourceCost';
import { isBuildingTechUnlocked } from './placementUtils';
import { PLACEMENT_FAILURE_LABELS, getPlaceBuildingFailureLabel } from './buildingPlacementLabels';
import { countHomelessSettlers, isResidenceBuilding } from './residencyOccupancy';
import { isPlayerHuman, playerHumanCount } from './playerHuman';
import { getEcosystemHealth } from './dailyEcology';
import { computeVillageStats } from './uiSimSummary';
import { getPlayerCampCenter, getRaidChoiceEligibility, canLaunchRaidOnRival } from './frontierCombat';
import { HUNTING_SPOT_SEARCH_RADIUS_PX, huntingSpotPreyTypes } from './huntingSpot';
import { canAssignWorkerToBuilding, listAssignableWorkersForBuilding } from './buildingStaffingActions';
import {
  completedJobBuildings,
  countWorkersAtBuilding,
  findOverstaffedDonorBuilding,
  isManualStaffBuilding,
  isManualStaffingBuilding,
} from './workforce';
import { readSkill } from './skills';
import { getOpenPlayerBeds } from './populationGrowth';
import { canHostTownFestival } from './townHall';
import { findPlayerTownHall } from './playerTownHall';
import { canStartResearch } from './research';
import {
  getDiplomacyChoiceEligibility,
  getPeaceTreatyEligibility,
  getRefugeeChoiceEligibility,
  getRivalGiftEligibility,
  getRivalTradePactEligibility,
  getShowStrengthEligibility,
  getVisitorLeaderTalkMeta,
  getVisitorTradeEligibility,
  getVillageRequestEligibility,
  type RefugeeChoice,
  type VisitorTradeAction,
} from './groupEvents';
import { Human, VirtualPlayer } from './gameConstants';
import { getStoryChoiceEligibility } from './storyEvents';
import type { DiplomacyEvent, RaidEvent, StoryEvent } from './gameTypes';
import {
  buildingTypeHasLevelBenefit,
  getBuildingUpgradeCost,
  getBuildingUpgradeEligibility,
  getRepairBuildingEligibility,
  REPAIR_COST,
} from './buildingMaintenanceActions';
import { collectHousingDiagnostics } from './housingDiagnostics';
import { getForgeBlockReason, getForgeOrder } from './forge';
import { mineOreForMode, type MineMode } from './buildings';
import { getWorkshopRecipe, canAffordWorkshopRecipe, WORKSHOP_RECIPES, type WorkshopRecipe } from './workshops';
import {
  getRecruitSettlerEligibility,
  getTameEntityEligibility,
} from './settlerInteractionActions';
import { getVisitorQuest } from './visitorQuest';
import { canEstablishTradeRoute } from './tradeCaravans';
import { getHourOfDay } from './dayCycle';
import {
  DEFAULT_WORK_SCHEDULE,
  getWorkSchedule,
  getWorkScheduleLabel,
  validateWorkSchedule,
} from './workSchedule';
import {
  DEFAULT_HOTEL_SCHEDULE,
  DEFAULT_TAVERN_SCHEDULE,
  getVenueSchedule,
  getVenueScheduleLabel,
  validateVenueSchedule,
  type VenueScheduleKind,
} from './venueSchedule';
import { findPath, getPathGrid, pathWaypoints } from './pathfinding';
import { inferStripRotation, type StripSegment } from './stripBuild';

/** One proposed auto-play action plus the short player-facing reason for it. */
export interface VirtualPlayerDecision {
  command: WorkerCommand;
  reason: string;
}

const FOOD_PRODUCER_TYPES: readonly BuildingType[] = [
  BuildingType.Farm,
  BuildingType.Greenhouse,
  BuildingType.FishingSpot,
  BuildingType.HuntingSpot,
];

/** Card choices all share this shape (raid, diplomacy, story, request). */
interface CardChoice {
  id: string;
  label?: string;
}

const PREFERRED_CHOICE_PATTERN =
  /defend|defence|defense|fight|resist|barricade|stand firm|sign peace|accept|agree|help/i;

function pickChoice(choices: readonly CardChoice[] | undefined): CardChoice | null {
  if (!choices || choices.length === 0) return null;
  for (const choice of choices) {
    if (PREFERRED_CHOICE_PATTERN.test(`${choice.id} ${choice.label ?? ''}`)) return choice;
  }
  return choices[0];
}

/** Prefer a firm answer, but only if the real diplomacy owner would allow it. */
function pickAffordableDiplomacyChoice(
  state: WorldState,
  event: DiplomacyEvent,
): CardChoice | null {
  const choices = event.choices;
  if (!choices || choices.length === 0) return null;

  const preferred = pickChoice(choices);
  if (preferred && getDiplomacyChoiceEligibility(state, event, preferred.id).ok) {
    return preferred;
  }

  for (const choice of choices) {
    if (getDiplomacyChoiceEligibility(state, event, choice.id).ok) return choice;
  }
  return null;
}

function pickEligibleRaidChoice(state: WorldState, event: RaidEvent): CardChoice | null {
  const choices = event.choices;
  if (!choices || choices.length === 0) return null;

  const preferred = pickChoice(choices);
  if (preferred && getRaidChoiceEligibility(state, event, preferred.id).ok) {
    return preferred;
  }

  for (const choice of choices) {
    if (getRaidChoiceEligibility(state, event, choice.id).ok) return choice;
  }
  return null;
}

function pickEligibleStoryChoice(state: WorldState, event: StoryEvent): CardChoice | null {
  const choices = event.choices;
  if (!choices || choices.length === 0) return null;

  const preferred = pickChoice(choices);
  if (preferred && getStoryChoiceEligibility(state, event, preferred.id).ok) {
    return preferred;
  }

  for (const choice of choices) {
    if (getStoryChoiceEligibility(state, event, choice.id).ok) return choice;
  }
  return null;
}


/** Days of settler need currently in the larder. */
function foodNeedPerDay(settlers: number): number {
  return settlers * Human.DAILY_FOOD_CONSUMPTION;
}

/**
 * True when the larder covers at least `days` of the colony's daily food need.
 * One definition of the bot's "there is food to spare" policy, used by every
 * optional step (recruiting, taming, visitor trades, rival gifts and truces).
 */
function hasFoodMargin(state: WorldState, days: number): boolean {
  const settlers = playerHumanCount(state.entities);
  if (settlers <= 0) return false;
  return (state.resources.food ?? 0) >= foodNeedPerDay(settlers) * days;
}

/** Spare assignable beds the village keeps ahead of need (`VirtualPlayer.SPARE_BED_*`). */
function spareBedReserve(state: WorldState): number {
  return Math.max(
    VirtualPlayer.SPARE_BED_FLOOR,
    Math.ceil(adultSettlerCount(state) * VirtualPlayer.SPARE_BED_RATIO),
  );
}

/** Producers the village wants as it grows: one per `perProducer` adults, never fewer than one. */
function wantedProducerCount(state: WorldState, perProducer: number): number {
  return Math.max(1, Math.ceil(adultSettlerCount(state) / perProducer));
}

/** Completed, player-owned producers of `type`. */
function completedProducerCount(state: WorldState, type: BuildingType): number {
  return state.buildings.filter(
    (building) => building.type === type && building.faction !== 'rival' && building.completed,
  ).length;
}

/**
 * Leave the repair owner's own materials in store, whatever else is spent — the floor under every
 * build the bot proposes.
 */
function canAffordKeepingRepair(state: WorldState, cost: Partial<Resources>): boolean {
  return canAfford(state, {
    ...cost,
    wood: (cost.wood ?? 0) + REPAIR_COST.wood,
    stone: (cost.stone ?? 0) + REPAIR_COST.stone,
  });
}

/**
 * The floor every *optional* build leaves behind: the repair owner's materials (`REPAIR_COST`) and
 * the food buffer, so building ahead can never leave a damaged building unrepairable.
 */
function canSpendKeepingReserve(state: WorldState, cost: Partial<Resources>): boolean {
  if (!hasFoodMargin(state, VirtualPlayer.FOOD_BUFFER_DAYS)) return false;
  return canAffordKeepingRepair(state, cost);
}

/**
 * The spot the placement owner accepts, with an optional extra condition the caller owns (a
 * hunting spot's prey reach). The placement owner decides legality; the caller adds nothing else.
 */
function findPlacementSpot(
  state: WorldState,
  type: BuildingType,
  rotation: BuildingRotation,
  accept?: (spot: { x: number; y: number }) => boolean,
): { x: number; y: number } | null {
  const camp = getPlayerCampCenter(state, state.buildings);
  const { width, height } = getBuildingFootprintForType(type, rotation);
  const stepX = width + GRID_SIZE;
  const stepY = height + GRID_SIZE;
  const rings = VirtualPlayer.PLACEMENT_SEARCH_RINGS;

  for (let ring = 0; ring <= rings; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const spot = snapBuildingCenter(type, camp.x + dx * stepX, camp.y + dy * stepY, rotation);
        if (!canPlaceBuilding(state, type, spot.x, spot.y, rotation)) continue;
        if (accept && !accept(spot)) continue;
        return spot;
      }
    }
  }
  return null;
}

/**
 * Whether a spot could take safe quarry — deer or rabbits, never a wolf. The hunting owner's own
 * rule says why: a wolf is only chosen over safer game when nothing else is near, *"walking up to a
 * wolf is how hunters get bitten"*, and a hunter can die. So a site that can only reach wolves is a
 * site the bot does not raise. It reads the same prey list and the same sight radius as the hunt.
 */
function huntingSpotHasSafePrey(state: WorldState, spot: { x: number; y: number }): boolean {
  const safePrey = new Set<EntityType>(
    huntingSpotPreyTypes('auto').filter((type) => type !== EntityType.Wolf),
  );
  return state.entities.some(
    (entity) =>
      entity.alive
      && entity.tamedBy == null
      && safePrey.has(entity.type)
      && Math.hypot(entity.x - spot.x, entity.y - spot.y) < HUNTING_SPOT_SEARCH_RADIUS_PX,
  );
}

/** The extra site condition a type must satisfy beyond the placement owner's own rules. */
function siteCondition(
  state: WorldState,
  type: BuildingType,
): ((spot: { x: number; y: number }) => boolean) | undefined {
  if (type === BuildingType.HuntingSpot) return (spot) => huntingSpotHasSafePrey(state, spot);
  return undefined;
}

function isUnderConstruction(state: WorldState, type: BuildingType): boolean {
  return state.buildings.some(
    (building) => building.faction !== 'rival' && building.type === type && !building.completed,
  );
}

/**
 * True when the player already has a food producer, built or under construction.
 *
 * **Known gap, measured 2026-09-29 and NOT yet fixed.** This counts a building by `type` alone — it
 * does not require `completed`, and it does not require anyone to be working it. So an unfinished or
 * **unstaffed** farm satisfies "the colony has a food producer", `decideFood` then returns null every
 * hour, and the bot's status line can read *"no action needed — colony looks healthy"* while that
 * farm produces nothing. That is the owner's report *"there is no food"* next to a healthy status.
 *
 * It is the same assignment-versus-reality distinction as `countWorkersAtBuilding` (which counts
 * `homeBuildingId`, an assignment, not attendance) and as the daily-production fix.
 *
 * **Why it is not fixed here.** Narrowing the predicate to "completed AND staffed" was tried and
 * measured: it broke **22 of the 68** cases in `tests/virtualPlayer.test.ts`, because those fixtures
 * give a food producer `occupants` but never set `homeBuildingId`, so `countWorkersAtBuilding`
 * reports 0 for a farm the fixture considers staffed. Fixing this properly therefore means deciding
 * the basis (assignment vs. presence) *and* migrating the fixtures to model it — a deliberate change,
 * not a drive-by. The guard was also tried without the predicate change and broke 1 case by letting
 * the ladder fall through to the Mine during a shortage.
 */
function hasFoodProducer(state: WorldState): boolean {
  return state.buildings.some(
    (building) => building.faction !== 'rival' && FOOD_PRODUCER_TYPES.includes(building.type),
  );
}

/** 1 — answer the oldest open player card, if any. */
function answerOpenCard(state: WorldState): VirtualPlayerDecision | null {
  const raid = state.pendingRaidEvents?.[0];
  if (raid) {
    const choice = pickEligibleRaidChoice(state, raid);
    if (choice) {
      return {
        command: {
          proto: WORKER_CMD_PROTO,
          op: 'respondToRaidEvent',
          eventId: raid.id,
          choiceId: choice.id,
        },
        reason: `answer the raid — ${raid.rivalName} is on the march`,
      };
    }
  }

  const outgoing = state.pendingOutgoingRaidEvents?.[0];
  if (outgoing) {
    // A war-band report only offers the answer that matches its `rivalResponse`,
    // so the preferred choice is the one the owner accepts.
    const choice = pickChoice(outgoing.choices);
    if (choice) {
      return {
        command: {
          proto: WORKER_CMD_PROTO,
          op: 'respondToOutgoingRaidEvent',
          eventId: outgoing.id,
          choiceId: choice.id,
        },
        reason: `answer the war-band report — ${outgoing.rivalName} replied`,
      };
    }
  }

  const diplomacy = state.pendingDiplomacyEvents?.[0];
  if (diplomacy) {
    const choice = pickAffordableDiplomacyChoice(state, diplomacy);
    if (choice) {
      return {
        command: {
          proto: WORKER_CMD_PROTO,
          op: 'respondToDiplomacyEvent',
          eventId: diplomacy.id,
          choiceId: choice.id,
        },
        reason: `answer ${diplomacy.rivalName} — ${diplomacy.kind.replace(/_/g, ' ')}`,
      };
    }
  }

  const request = state.activeVillageRequest;
  if (request && request.choices.length > 0) {
    // The request owner's eligibility gate decides accept vs decline — a failed
    // accept leaves the request open and would burn every auto-play hour.
    const accept = getVillageRequestEligibility(state, request, 'accept').ok;
    return {
      command: {
        proto: WORKER_CMD_PROTO,
        op: 'resolveVillageRequest',
        requestId: request.id,
        choice: accept ? 'accept' : 'decline',
      },
      reason: accept
        ? `accept ${request.sourceName}'s provisions — gold and stores allow it`
        : `decline ${request.sourceName}'s provisions — the colony cannot take them`,
    };
  }

  const story = state.pendingStoryEvents?.[0];
  if (story) {
    const choice = pickEligibleStoryChoice(state, story);
    if (choice) {
      return {
        command: {
          proto: WORKER_CMD_PROTO,
          op: 'respondToStoryEvent',
          eventId: story.id,
          choiceId: choice.id,
        },
        reason: `answer the story card — ${story.title}`,
      };
    }
  }

  return null;
}

function decideLeaderHouse(state: WorldState): VirtualPlayerDecision | null {
  const type = BuildingType.LeaderHouse;
  // One may already stand, or be on the way: `unique` means only ever one, so a
  // second proposal would be refused every hour. Rival-owned copies do not count.
  if (state.buildings.some((building) => building.type === type && building.faction !== 'rival')) {
    return null;
  }
  if (!canAfford(state, BUILDING_CONFIGS[type].cost)) return null;
  const spot = findPlacementSpot(state, type, 0);
  if (!spot) return null;

  return {
    command: { proto: WORKER_CMD_PROTO, op: 'startBuilding', type, x: spot.x, y: spot.y, rotation: 0 },
    reason: "build the Leader's House — free, and the office has no residence yet",
  };
}

/** 3 — an idle adult plus a completed, auto-staffable workplace with a free slot. */
function decideStaffing(state: WorldState): VirtualPlayerDecision | null {
  // The labour counters' owner, not a second scan: a prisoner is not idle here and a settler on a
  // construction crew counts as working, which is the rule the HUD and the People screen state
  const idleAdults = computeVillageStats(state).idle;
  if (idleAdults === 0) return null;

  for (const building of state.buildings) {
    if (!building.completed || building.faction === 'rival') continue;
    // Generic auto-staffing deliberately never fills manual workplaces
    // (Church, Prison, Barracks, School, Town Hall) — those stay the player's call.
    if (isManualStaffingBuilding(building)) continue;
    // Ask the question this *command* answers. `autoStaffWorkers` places idle
    // settlers (`assignWorkerInPlace`) and only ever rebalances into an *empty*
    // building. `canAssignWorkerToBuilding` answers for the manual path instead —
    // it also counts a worker a transfer could free up — so pairing it with the
    // generic command requested a reassignment the command never performs: the
    // check stayed true while nothing changed, and the bot re-proposed the same
    // no-op every in-game hour, starving every later step. This is the owner's own
    // list of the idle settlers that command would actually place.
    if (listAssignableWorkersForBuilding(state, building.id).length === 0) continue;
    return {
      command: { proto: WORKER_CMD_PROTO, op: 'autoStaffWorkers' },
      reason: `staff the open slots at ${BUILDING_CONFIGS[building.type].label} — ${idleAdults} idle settler${idleAdults === 1 ? '' : 's'}`,
    };
  }

  return null;
}

/**
 * 4 — housing: a settler with nowhere to sleep, or a village close enough to its bed line that the
 * next birth would make one.
 *
 * The ahead-of-need half reads the housing owner's own pressure band
 * (`collectHousingDiagnostics` calls it `tight` past 80% of every bed) and a spare-bed reserve over
 * the *assignable* beds (`VirtualPlayer.SPARE_BED_*`). Waiting for the homeless symptom is what
 * left measured runs sitting on a handful of buildings.
 */
function decideHousing(state: WorldState): VirtualPlayerDecision | null {
  const homeless = countHomelessSettlers(state);
  const openBeds = getOpenPlayerBeds(state);

  if (homeless > 0) {
    // Spare beds mean an assignment was missed, not that beds are short — but the
    // Leader's House beds belong to the leader's household, so they are not spare
    // housing for anyone else (`getOpenPlayerBeds` excludes them).
    if (openBeds > 0) return null;
  } else {
    if (openBeds >= spareBedReserve(state)) return null;
    if (collectHousingDiagnostics(state).housingPressure === 'comfortable') return null;
    // Housing is survival, so the reserve applies to the *ahead-of-need* half only: a homeless
    // village still raises a House on its last 40 wood.
    if (!canSpendKeepingReserve(state, BUILDING_CONFIGS[BuildingType.House].cost)) return null;
  }

  // One residence at a time — a new house only helps once it stands, and a
  // Mansion is a residence too (`residencyOccupancy.isResidenceBuildingType`).
  if (
    isUnderConstruction(state, BuildingType.House)
    || isUnderConstruction(state, BuildingType.Mansion)
  ) {
    return null;
  }

  const type = BuildingType.House;
  if (!canAfford(state, BUILDING_CONFIGS[type].cost)) return null;
  const spot = findPlacementSpot(state, type, 0);
  if (!spot) return null;

  return {
    command: { proto: WORKER_CMD_PROTO, op: 'startBuilding', type, x: spot.x, y: spot.y, rotation: 0 },
    reason: homeless > 0
      ? `build a House — ${homeless} settler${homeless === 1 ? '' : 's'} homeless`
      : `build a House — ${openBeds} spare bed${openBeds === 1 ? '' : 's'} left for ${adultSettlerCount(state)} settlers`,
  };
}

/**
 * 5 — food production.
 *
 * Two triggers: stores below the buffer of days of settler need, or a colony that
 * owns no food producer at all. The second one is not a nicety: a fresh settlement
 * starts with a large larder and no producer, so a buffer-only rule let the bot
 * spend that stock elsewhere — including on "Advanced Farming" (`farm_yield ×1.2`,
 * unlocks the Greenhouse) — while owning no farm for the research to improve, and
 * then only reacting at the buffer, i.e. after a 3-day build.
 */
function decideFood(state: WorldState): VirtualPlayerDecision | null {
  const settlers = playerHumanCount(state.entities);
  if (settlers <= 0) return null;

  const needPerDay = foodNeedPerDay(settlers);
  const food = state.resources.food ?? 0;
  const shortOnFood = food < needPerDay * VirtualPlayer.FOOD_BUFFER_DAYS;
  const built = FOOD_PRODUCER_TYPES.reduce(
    (total, type) => total + completedProducerCount(state, type),
    0,
  );
  // A standing producer only answers the village it was built for: past the first, the step keeps
  // adding one until the colony holds `SETTLERS_PER_FOOD_PRODUCER` settlers' worth, so food scales
  // with population. The first producer stays the shortage rule's business, exactly as before.
  const wantMore = built >= 1 && built < wantedProducerCount(state, VirtualPlayer.SETTLERS_PER_FOOD_PRODUCER);
  if (!shortOnFood && hasFoodProducer(state) && !wantMore) return null;
  // One producer at a time, so a food shortage cannot drain the treasury in a day.
  //
  // Deliberately only *under construction*, not "a producer already stands". A completed-but-unstaffed
  // food building must not suppress the response to a shortage: that is the one case where the colony
  // genuinely needs a producer, and `hasFoodProducer` above already stops the healthy-but-unstaffed
  // case from being mistaken for being fed. Adding a broader guard here was tried and was wrong — it
  // blocked the shortage build and the ladder fell through to the Mine (`virtualPlayer.test.ts`,
  // "proposes a food producer when stores fall below the buffer").
  if (FOOD_PRODUCER_TYPES.some((type) => isUnderConstruction(state, type))) return null;

  const daysLeft = Math.max(0, Math.floor(food / needPerDay));
  for (const type of FOOD_PRODUCER_TYPES) {
    // The ahead-of-need half is optional spending, so it leaves the repair materials and the food
    // buffer behind; a genuine shortage never does — a starving colony buys food with its last wood.
    if (!shortOnFood && wantMore && !canSpendKeepingReserve(state, BUILDING_CONFIGS[type].cost)) continue;
    // A locked producer simply finds no legal spot: the placement owner owns the
    // unlock rule (`getPlaceBuildingFailureReason` → 'research'), so the bot does
    // not restate it and cannot disagree with a human click.
    if (!canAfford(state, BUILDING_CONFIGS[type].cost)) continue;
    const spot = findPlacementSpot(state, type, 0, siteCondition(state, type));
    if (!spot) continue;
    return {
      command: { proto: WORKER_CMD_PROTO, op: 'startBuilding', type, x: spot.x, y: spot.y, rotation: 0 },
      reason: shortOnFood
        ? `build a ${BUILDING_CONFIGS[type].label} — ${daysLeft} day${daysLeft === 1 ? '' : 's'} of food left`
        : !hasFoodProducer(state)
          ? `build a ${BUILDING_CONFIGS[type].label} — the colony has no food producer`
          : `build a ${BUILDING_CONFIGS[type].label} — ${built} producer${built === 1 ? '' : 's'} for ${adultSettlerCount(state)} settlers`,
    };
  }

  return null;
}

/**
 * The buildings the bot wants, in the ladder's own order of wants. Only each building's
 * *research gate* is read from this list (`BUILDING_CONFIGS[type].unlockRequirement`), so it
 * is a preference among the colony's goals, not a restatement of any owner rule.
 */
const RESEARCH_NEED_ORDER: readonly BuildingType[] = [
  BuildingType.Blacksmith, // civic, and what makes a researched forge (and iron) usable
  BuildingType.Greenhouse, // food, once the farm stands
  BuildingType.Market, // gold income, and the trade routes
  BuildingType.TownHall, // taxes, elections, festivals
  BuildingType.School,
  BuildingType.Hospital,
  BuildingType.Mansion,
  BuildingType.Prison,
];

/**
 * The research the colony actually needs: the gate behind the first building it wants and
 * does not have. Without this the step took the first node in the game's own array order,
 * which opens with the Agriculture chain — so the bot ground `agriculture_1 → _2 → …` and
 * never reached `forestry_1`, the Blacksmith's gate, while the civic step kept asking for a
 * Blacksmith it could not place. The gate is the building owner's data, so an ungated
 * building contributes nothing and a newly gated building is picked up automatically.
 */
function neededResearch(state: WorldState): { nodeId: string; forType: BuildingType } | null {
  for (const type of RESEARCH_NEED_ORDER) {
    if (state.buildings.some((building) => building.type === type && building.faction !== 'rival')) {
      continue;
    }
    const requirement = BUILDING_CONFIGS[type].unlockRequirement;
    if (!requirement) continue;
    const node = state.researchNodes.find((candidate) => candidate.id === requirement);
    if (node && !node.researched) return { nodeId: requirement, forType: type };
  }
  return null;
}

/**
 * 7 — the research the colony needs, or else the first one the owner would accept.
 *
 * A needed node the owner refuses (unaffordable, prerequisites missing) falls through to
 * the next acceptable node, so the hour is never wasted on a refused command.
 */
function decideResearch(state: WorldState): VirtualPlayerDecision | null {
  if (state.activeResearch) return null;

  const need = neededResearch(state);
  if (need && canStartResearch(state, need.nodeId)) {
    const node = state.researchNodes.find((candidate) => candidate.id === need.nodeId)!;
    return {
      command: { proto: WORKER_CMD_PROTO, op: 'startResearch', researchId: need.nodeId },
      reason: `research ${node.name} — it unlocks the ${BUILDING_CONFIGS[need.forType].label}`,
    };
  }

  for (const node of state.researchNodes) {
    if (!canStartResearch(state, node.id)) continue;
    return {
      command: { proto: WORKER_CMD_PROTO, op: 'startResearch', researchId: node.id },
      reason: `research ${node.name} — nothing in progress`,
    };
  }
  return null;
}

/** 8 — a staffed, stocked Town Hall whose festival cooldown has elapsed. */
function decideFestival(state: WorldState): VirtualPlayerDecision | null {
  const hall = findPlayerTownHall(state.buildings);
  if (!hall) return null;
  // The festival owner also requires an assigned official, stores, and no
  // running festival; checking first avoids an hourly rejected command.
  if (!canHostTownFestival(state, hall).ok) return null;
  return {
    command: { proto: WORKER_CMD_PROTO, op: 'hostTownFestival', buildingId: hall.id },
    reason: 'host a festival — the town hall is ready',
  };
}

/**
 * 6 — civic infrastructure: the Town Hall, then a Blacksmith.
 *
 * The Town Hall is what makes step 8 (festival) reachable at all — it also carries
 * taxes, trade, elections, and the scandal buffer. The Blacksmith is what gives the
 * research ladder something to forge. Both are research-gated, and that gate is not
 * restated here: `canPlaceBuilding` refuses a locked building, so
 * `findPlacementSpot` simply returns no spot and the step waits until the owner
 * research lands.
 *
 * A Church is deliberately **not** in this ladder, because this step runs before roads, militia,
 * diplomacy and refugee screening: a church the colony can afford (45 wood / 35 stone / 20 gold —
 * cheap) would shadow every later decision, and adding it here was tried on 2026-09-29 and broke
 * 36 of the 68 cases in `tests/virtualPlayer.test.ts`. It lives in `COMMUNITY_BUILD_ORDER` at the
 * **end** of the ladder instead, where it can only spend an hour nothing else wanted. That closes
 * the recorded coverage gap (`BUG_REPORTS/2026-09-29-automated-runs-never-build-a-church.md`: no
 * automated run ever reached `churchStrength > 0`) without demoting food, defence or diplomacy.
 */
const CIVIC_BUILD_ORDER: readonly BuildingType[] = [
  BuildingType.TownHall,
  BuildingType.Blacksmith,
  /**
   * A School, added because nothing in the ladder ever proposed one — owner: *"the bot is not building
   * schools"*. It was listed only in `RESEARCH_NEED_ORDER` as a building whose *prerequisite research*
   * the bot would chase, never as something to build, and `CIVIC_BUILD_ORDER` stopped at two. So the
   * bot would research toward a School and then never raise it.
   *
   * Positioned last in this step on purpose. The Town Hall unlocks festivals, taxes and elections and
   * the Blacksmith makes the forge reachable, so both outrank it; a School only pays off once there
   * are children to educate. Its own research gate is not restated — `canPlaceBuilding` refuses a
   * locked building and `findPlacementSpot` then returns no spot, so the step simply waits.
   */
  BuildingType.School,
];

function decideCivic(state: WorldState): VirtualPlayerDecision | null {
  if (CIVIC_BUILD_ORDER.some((type) => isUnderConstruction(state, type))) return null;

  for (const type of CIVIC_BUILD_ORDER) {
    if (state.buildings.some((building) => building.type === type && building.faction !== 'rival')) continue;
    if (!canAfford(state, BUILDING_CONFIGS[type].cost)) continue;
    const spot = findPlacementSpot(state, type, 0);
    if (!spot) continue;

    return {
      command: { proto: WORKER_CMD_PROTO, op: 'startBuilding', type, x: spot.x, y: spot.y, rotation: 0 },
      reason: `build a ${BUILDING_CONFIGS[type].label} — the colony can afford it`,
    };
  }

  return null;
}

const LOW_WOOD_STOCK = 120;
/** 20 = iron in store below which the colony is short of it (industry step and mine seam). */
const LOW_IRON_STOCK = 20;
/**
 * 60 = stone in store below which the colony is short of it. Named because it now has two readers:
 * the Quarry step below and the visitor-trade shortage list, which buys stone from a caravan when no
 * quarry has been raised yet. It was an inline `60` at the Quarry entry only.
 */
const LOW_STONE_STOCK = 60;

const INDUSTRY_BUILD_ORDER: readonly {
  type: BuildingType;
  stock: keyof WorldState['resources'];
  minimumStock: number;
}[] = [
  { type: BuildingType.LumberMill, stock: 'wood', minimumStock: LOW_WOOD_STOCK },
  { type: BuildingType.Quarry, stock: 'stone', minimumStock: LOW_STONE_STOCK },
  { type: BuildingType.Mine, stock: 'iron', minimumStock: LOW_IRON_STOCK },
  { type: BuildingType.Store, stock: 'gold', minimumStock: 80 },
];

/**
 * Whether the staffing owner would really put a hand on a producer nobody works: an idle settler
 * who can take the post, or an over-crewed workplace the auto-staff command rebalances out of.
 * Both are the owner's own doors, so a proposal here is never the no-op the staffing step warns of.
 */
function canStaffUnmannedProducer(state: WorldState, building: Building): boolean {
  if (listAssignableWorkersForBuilding(state, building.id).length > 0) return true;
  return findOverstaffedDonorBuilding(
    completedJobBuildings(state.buildings),
    state.entities,
    building.id,
  ) !== undefined;
}

/**
 * 9 — the economy answer to a resource the colony is running out of, and to a village that has
 * outgrown the producers it has.
 *
 * One economy build at a time, and every owner still decides: `canAfford` prices it and
 * `canPlaceBuilding` refuses a locked or illegal spot, so a research-gated building simply waits its
 * turn. Nothing else is gated here — in particular the Mine is not: the game gives it no research
 * requirement, and what it digs is the ore-mode owner's call (step 12 points it at gold whenever the
 * treasury is low), so a Blacksmith precondition would be a bot rule the game does not have.
 *
 * A producer the colony already owns is not automatically an answer. Production is keyed on the
 * assignment (`countWorkersAtBuilding` reads `homeBuildingId`), so an unmanned Quarry yields no
 * stone however long the colony waits; and one mill only serves the village it was built for, so a
 * colony past `SETTLERS_PER_INDUSTRY_PRODUCER` adults gets another. Both halves leave the repair
 * materials and the food buffer behind (`canSpendKeepingReserve`).
 */
function decideIndustry(state: WorldState): VirtualPlayerDecision | null {
  const underConstruction = INDUSTRY_BUILD_ORDER.some((entry) => isUnderConstruction(state, entry.type));
  const wanted = wantedProducerCount(state, VirtualPlayer.SETTLERS_PER_INDUSTRY_PRODUCER);

  for (const entry of INDUSTRY_BUILD_ORDER) {
    const stock = state.resources[entry.stock] ?? 0;
    const short = stock < entry.minimumStock;
    // The Store is storage rather than a producer, so it stays a first-copy answer. Past the first
    // copy the step adds one per `SETTLERS_PER_INDUSTRY_PRODUCER` adults, so the shelves scale with
    // the village instead of stopping at the shortfall that first demanded them.
    const built = completedProducerCount(state, entry.type);
    const scaling = entry.type !== BuildingType.Store && built >= 1 && built < wanted;
    if (!short && !scaling) continue;

    const owned = state.buildings.filter(
      (building) => building.type === entry.type && building.faction !== 'rival',
    );
    if (owned.length > 0) {
      const unmanned = owned.find(
        (building) => building.completed && countWorkersAtBuilding(state.entities, building.id) === 0,
      );
      if (unmanned && canStaffUnmannedProducer(state, unmanned)) {
        return {
          command: { proto: WORKER_CMD_PROTO, op: 'autoStaffWorkers' },
          reason: `staff the ${BUILDING_CONFIGS[unmanned.type].label} — nobody works it, so no ${entry.stock} is made`,
        };
      }
      // A wanted extra copy falls through to the build; a stand-in for an existing producer does not.
      if (!scaling) continue;
    }

    if (underConstruction) continue;
    if (!canAfford(state, BUILDING_CONFIGS[entry.type].cost)) continue;
    if (scaling && !canSpendKeepingReserve(state, BUILDING_CONFIGS[entry.type].cost)) continue;
    const spot = findPlacementSpot(state, entry.type, 0);
    if (!spot) continue;

    return {
      command: { proto: WORKER_CMD_PROTO, op: 'startBuilding', type: entry.type, x: spot.x, y: spot.y, rotation: 0 },
      reason: short
        ? `build a ${BUILDING_CONFIGS[entry.type].label} — only ${Math.floor(stock)} ${entry.stock} left`
        : `build a ${BUILDING_CONFIGS[entry.type].label} — ${owned.length} for ${adultSettlerCount(state)} settlers`,
    };
  }

  return null;
}


/**
 * 10 — a damaged player building (raids damage buildings). Only the worst damage
 * below the repair threshold is worth an hour, and only when the repair owner
 * would actually spend the wood and stone: a refused repair would be re-proposed
 * every hour while the colony's real work waited.
 */
function decideRepairs(state: WorldState): VirtualPlayerDecision | null {
  let worst: Building | null = null;
  let worstRatio = 1;

  for (const building of state.buildings) {
    if (!building.completed || building.faction === 'rival' || building.maxHealth <= 0) continue;
    const ratio = building.health / building.maxHealth;
    if (ratio >= VirtualPlayer.REPAIR_HEALTH_RATIO) continue;
    if (ratio >= worstRatio) continue;
    if (!getRepairBuildingEligibility(state, building.id).ok) continue;
    worst = building;
    worstRatio = ratio;
  }

  if (!worst) return null;
  const damagePercent = Math.round((1 - worstRatio) * 100);
  return {
    command: { proto: WORKER_CMD_PROTO, op: 'repairBuilding', buildingId: worst.id },
    reason: `repair the ${BUILDING_CONFIGS[worst.type].label} — ${damagePercent}% damaged`,
  };
}

/**
 * Bot policy: the forge orders the bot will spend iron on, in preference order.
 * Straight combat and quarry gear first — the tier-5 orders need their own
 * research and an earlier forge orders anyway.
 */
const FORGE_ORDER_PRIORITY: readonly ForgeOrderId[] = ['iron_spears', 'iron_shields', 'iron_pickaxes'];

/**
 * 11 — queue the most valuable forge order a staffed Blacksmith can start.
 *
 * `getForgeBlockReason` is the whole eligibility test: research, the forge
 * prerequisite chain, a busy smith, a completed order, an unstaffed Blacksmith,
 * and the input cost all live there, so the bot cannot disagree with the panel.
 * An order already active or already forged simply has no acceptable target left.
 */
function decideForgeOrders(state: WorldState): VirtualPlayerDecision | null {
  if (state.villageForge?.activeOrder) return null;

  const smith = state.buildings.find(
    (building) =>
      building.completed && building.faction !== 'rival' && building.type === BuildingType.Blacksmith,
  );
  if (!smith) return null;

  for (const orderId of FORGE_ORDER_PRIORITY) {
    if (getForgeBlockReason(state, orderId) !== null) continue;
    const order = getForgeOrder(orderId);
    return {
      command: { proto: WORKER_CMD_PROTO, op: 'queueForgeOrder', buildingId: smith.id, orderId },
      reason: `forge ${order?.label ?? orderId} — the smith can start the work`,
    };
  }

  return null;
}

/** The prey a Hunting Spot should target: `auto`, unless food is genuinely short. */
function huntingSpotPreyFor(state: WorldState): HuntingSpotPrey {
  const settlers = playerHumanCount(state.entities);
  if (settlers > 0 && !hasFoodMargin(state, VirtualPlayer.FOOD_BUFFER_DAYS)) return 'deer';
  return 'auto';
}

/** The workshop recipe worth the most gold among those the colony can supply. */
function bestAffordableWorkshopRecipe(state: WorldState): WorkshopRecipe | null {
  let best: WorkshopRecipe | null = null;
  for (const recipe of WORKSHOP_RECIPES) {
    if (!canAffordWorkshopRecipe(state.resources, recipe)) continue;
    if (!best || recipe.baseGold > best.baseGold) best = recipe;
  }
  return best;
}

/**
 * 12 — building tuning: what the Mine digs, what the Hunting Spot hunts, which
 * recipe the Workshop runs.
 *
 * Each change is proposed only when it differs from what the building is already
 * set to, so an accepted command retires its own step. The owners do the
 * validating (`setMineMode`, `setHuntingSpotPrey`, `setWorkshopRecipe` accept
 * only a player-owned building of their own type with a known setting), and the
 * recipe price is priced by `canAffordWorkshopRecipe`.
 */
function decideBuildingTuning(state: WorldState): VirtualPlayerDecision | null {
  for (const building of state.buildings) {
    if (!building.completed || building.faction === 'rival') continue;

    if (building.type === BuildingType.Mine) {
      const iron = state.resources.iron ?? 0;
      const gold = state.resources.gold ?? 0;
      // Iron is the one resource only the Mine produces, so an iron shortage outranks
      // the treasury rule: the previous "dig gold whenever the treasury is low" policy
      // left a colony with 0 iron digging gold indefinitely. Both thresholds are the
      // colony's own shortage lines, shared with the industry step above.
      let desired: MineMode;
      let reason: string;
      if (iron < LOW_IRON_STOCK) {
        desired = 'iron';
        reason = `mine iron — only ${Math.floor(iron)} iron in store`;
      } else if (gold < VirtualPlayer.MINE_GOLD_TREASURY_GOLD) {
        desired = 'gold';
        reason = `mine gold — only ${Math.floor(gold)} gold in the treasury`;
      } else {
        desired = 'iron';
        reason = 'mine iron — the treasury can spare the gold seam';
      }
      if (mineOreForMode(building.mineMode) === desired) continue;
      return {
        command: { proto: WORKER_CMD_PROTO, op: 'setMineMode', buildingId: building.id, mode: desired },
        reason,
      };
    }

    if (building.type === BuildingType.HuntingSpot) {
      const desired = huntingSpotPreyFor(state);
      if ((building.huntingSpotPrey ?? 'auto') === desired) continue;
      return {
        command: { proto: WORKER_CMD_PROTO, op: 'setHuntingSpotPrey', buildingId: building.id, prey: desired },
        reason: desired === 'deer'
          ? 'hunt deer — food stores are running low'
          : 'hunt on auto — food stores recovered',
      };
    }

    if (building.type === BuildingType.Workshop) {
      const recipe = bestAffordableWorkshopRecipe(state);
      if (!recipe) continue;
      if (getWorkshopRecipe(building.workshopRecipeId).id === recipe.id) continue;
      return {
        command: { proto: WORKER_CMD_PROTO, op: 'setWorkshopRecipe', buildingId: building.id, recipeId: recipe.id },
        reason: `make ${recipe.label} — the best goods the colony can supply`,
      };
    }
  }

  return null;
}

/**
 * 13 — recruit a settler, but only in one morning window a day and only from a
 * real surplus: a spare bed (not the Leader's House beds), nobody homeless, and
 * food well past the buffer. A world at any other hour proposes nothing, so the
 * colony cannot buy settlers every hour; the owner still has the last word on the
 * population cap and the price (`getRecruitSettlerEligibility`).
 */
function decideRecruitment(state: WorldState): VirtualPlayerDecision | null {
  if (getHourOfDay(state.tick) !== VirtualPlayer.RECRUIT_SETTLER_HOUR) return null;
  if (playerHumanCount(state.entities) <= 0) return null;
  if (countHomelessSettlers(state) > 0) return null;
  if (!hasFoodMargin(state, VirtualPlayer.RECRUIT_FOOD_RESERVE_DAYS)) return null;

  const openBeds = getOpenPlayerBeds(state);
  if (openBeds < VirtualPlayer.RECRUIT_MIN_OPEN_BEDS) return null;
  if (!getRecruitSettlerEligibility(state).ok) return null;

  return {
    command: { proto: WORKER_CMD_PROTO, op: 'recruitSettler' },
    reason: `recruit a settler — ${openBeds} spare beds and a deep larder`,
  };
}

/**
 * Bot policy: what the bot wants from a visitor trade, in order. Feed a real
 * shortage, then top up any industry resource below its shelf — wood, then stone
 * (which the caravan only began offering once `buy_stone`/`sell_stone` were added),
 * then iron — and only then sell food the colony has far more of than it can eat.
 */
function chooseVisitorTrade(state: WorldState, group: VisitorGroup): VisitorTradeAction | null {
  const wanted: VisitorTradeAction[] = [];
  if (!hasFoodMargin(state, VirtualPlayer.FOOD_BUFFER_DAYS)) wanted.push('buy_food');
  if ((state.resources.wood ?? 0) < LOW_WOOD_STOCK) wanted.push('buy_wood');
  if ((state.resources.stone ?? 0) < LOW_STONE_STOCK) wanted.push('buy_stone');
  if ((state.resources.iron ?? 0) < LOW_IRON_STOCK) wanted.push('buy_iron');
  if (hasFoodMargin(state, VirtualPlayer.FOOD_SURPLUS_DAYS)) wanted.push('sell_food');

  for (const action of wanted) {
    if (getVisitorTradeEligibility(state, group.id, action).ok) return action;
  }
  return null;
}

/**
 * 14 — visitors: speak with the leader, finish the smith's quest, then trade.
 *
 * Every branch is owner-gated: `talkToVisitorLeader` takes one audience per visit
 * (`getVisitorLeaderTalkMeta` reports whether one is still on offer),
 * `deliverVisitorQuest` needs the goods actually in store,
 * `getVisitorTradeEligibility` prices the whole deal, and
 * `getRefugeeChoiceEligibility` prices a refugee offer — the bot never spends an
 * hour on a visitor action the owner would refuse. A refugee camp is never
 * *talked* to (that only opens the negotiation) and its families are never turned
 * away on the bot's initiative: it welcomes them from a deep larder with beds
 * free, screens them from a shallower one, and otherwise leaves them be.
 */
function decideVisitorRelations(state: WorldState): VirtualPlayerDecision | null {
  const group = state.visitorGroups?.[0];
  if (!group) return null;

  if (
    group.kind !== 'refugees'
    && !group.leaderTalked
    && !getVisitorLeaderTalkMeta(group).unavailableReason
  ) {
    return {
      command: { proto: WORKER_CMD_PROTO, op: 'talkToVisitorLeader', groupId: group.id },
      reason: `hear out ${group.name} — one audience per visit`,
    };
  }

  if (group.kind === 'refugees') {
    const choice = chooseRefugeeChoice(state, group);
    if (!choice) return null;
    return {
      command: { proto: WORKER_CMD_PROTO, op: 'negotiateRefugees', groupId: group.id, choice },
      reason: choice === 'welcome'
        ? `welcome ${group.name} — the larder is deep and beds stand free`
        : `screen ${group.name} — take in the settlers the colony can feed`,
    };
  }

  const quest = getVisitorQuest(state);
  if (quest) {
    const have = state.resources[quest.goalResource] ?? 0;
    // Food is the colony's survival store: keep the same buffer the food step uses.
    const reserve = quest.goalResource === 'food'
      ? foodNeedPerDay(playerHumanCount(state.entities)) * VirtualPlayer.FOOD_BUFFER_DAYS
      : 0;
    if (have >= quest.goalAmount + reserve) {
      return {
        command: { proto: WORKER_CMD_PROTO, op: 'deliverVisitorQuest' },
        reason: `finish ${quest.title} — the goods are in store`,
      };
    }
  }

  const action = chooseVisitorTrade(state, group);
  if (!action) return null;
  return {
    command: { proto: WORKER_CMD_PROTO, op: 'tradeWithVisitors', groupId: group.id, action },
    reason: `trade with ${group.name} — ${action.replace(/_/g, ' ')}`,
  };
}

/**
 * 15 — manual staffing leftovers.
 *
 * Generic auto-staffing deliberately never fills a manual workplace (Church,
 * Prison, Barracks, School, Town Hall) because that is the player's choice. The
 * bot *is* the player, so when such a workplace stands with a free slot and an
 * idle adult exists it makes the choice explicitly, with one `assignWorker` for
 * that building — never a blanket `autoStaffWorkers`.
 */
function decideManualStaffing(state: WorldState): VirtualPlayerDecision | null {
  if (computeVillageStats(state).idle === 0) return null;

  for (const building of state.buildings) {
    if (!building.completed || building.faction === 'rival') continue;
    if (!isManualStaffingBuilding(building)) continue;
    // The staffing owner owns the whole test: a full workplace, a residence, or a
    // building with no job is refused, so the first one it accepts really has a
    // slot to fill.
    if (!canAssignWorkerToBuilding(state, building.id)) continue;
    return {
      command: { proto: WORKER_CMD_PROTO, op: 'assignWorker', buildingId: building.id },
      reason: `staff the ${BUILDING_CONFIGS[building.type].label} — the slot is the player's to fill`,
    };
  }

  return null;
}

/**
 * What the bot would ask a refugee camp for: welcome a group the colony can feed
 * and bed, screen one it can merely afford, and never turn families away on its
 * own initiative. `getRefugeeChoiceEligibility` still prices each offer.
 */
function chooseRefugeeChoice(state: WorldState, group: VisitorGroup): RefugeeChoice | null {
  if (
    hasFoodMargin(state, VirtualPlayer.REFUGEE_FOOD_RESERVE_DAYS)
    && getOpenPlayerBeds(state) >= VirtualPlayer.REFUGEE_MIN_OPEN_BEDS
    && getRefugeeChoiceEligibility(state, group.id, 'welcome').ok
  ) {
    return 'welcome';
  }
  if (
    hasFoodMargin(state, VirtualPlayer.FOOD_BUFFER_DAYS)
    && getRefugeeChoiceEligibility(state, group.id, 'screen').ok
  ) {
    return 'screen';
  }
  return null;
}

/**
 * 16 — make the staffing mode explicit where it protects a real crew, and release
 * an empty workplace that a stale `manual` flag is holding back.
 *
 * A manual workplace with settlers at their posts is marked `manual`, so generic
 * auto-staffing can never quietly rearrange the crew the player chose. A
 * non-manual workplace that still says `manual` with nobody in it is returned to
 * `auto`, so the colony can fill it again. Anything else — including a working
 * workplace the player deliberately set to `auto` — is left exactly as it is, so
 * the step retires instead of fighting the player.
 */
function decideStaffingMode(state: WorldState): VirtualPlayerDecision | null {
  for (const building of state.buildings) {
    if (!building.completed || building.faction === 'rival') continue;
    if (!BUILDING_JOB_TYPES[building.type]) continue;

    let desired: StaffingMode | null = null;
    if (isManualStaffBuilding(building.type)) {
      if (building.occupants.length > 0 && building.staffingMode !== 'manual') desired = 'manual';
    } else if (building.staffingMode === 'manual' && building.occupants.length === 0) {
      desired = 'auto';
    }
    if (!desired) continue;

    return {
      command: { proto: WORKER_CMD_PROTO, op: 'setBuildingStaffingMode', buildingId: building.id, mode: desired },
      reason: desired === 'manual'
        ? `mark the ${BUILDING_CONFIGS[building.type].label} manual — its crew is the player's own`
        : `return the empty ${BUILDING_CONFIGS[building.type].label} to auto staffing`,
    };
  }

  return null;
}

/**
 * 17 — keep the colony work day on the owner's standard window.
 *
 * `getWorkSchedule` falls back to `DEFAULT_WORK_SCHEDULE` (07:00–16:00), so a
 * fresh game already matches and nothing is proposed; the step fires only when the
 * schedule differs from that window, and the owner's own `validateWorkSchedule`
 * still has the last word. No season rule is invented here — the owner models no
 * season-dependent hours.
 */
function decideWorkSchedule(state: WorldState): VirtualPlayerDecision | null {
  const current = getWorkSchedule(state);
  if (
    current.startHour === DEFAULT_WORK_SCHEDULE.startHour
    && current.endHour === DEFAULT_WORK_SCHEDULE.endHour
  ) {
    return null;
  }
  if (!validateWorkSchedule(DEFAULT_WORK_SCHEDULE.startHour, DEFAULT_WORK_SCHEDULE.endHour, current).ok) {
    return null;
  }
  return {
    command: {
      proto: WORKER_CMD_PROTO,
      op: 'setWorkSchedule',
      startHour: DEFAULT_WORK_SCHEDULE.startHour,
      endHour: DEFAULT_WORK_SCHEDULE.endHour,
    },
    reason: `set the work day to ${getWorkScheduleLabel(DEFAULT_WORK_SCHEDULE)} — the colony standard`,
  };
}

/**
 * 18 — venues keep the owner's default service windows (tavern in the evening,
 * hotel through the day), and only a venue that actually stands is scheduled.
 * Like the work day, the owner's defaults mean a fresh game already matches.
 */
const VENUE_SCHEDULE_ORDER: readonly {
  kind: VenueScheduleKind;
  type: BuildingType;
  schedule: { startHour: number; endHour: number };
}[] = [
  { kind: 'tavern', type: BuildingType.Tavern, schedule: DEFAULT_TAVERN_SCHEDULE },
  { kind: 'hotel', type: BuildingType.Hotel, schedule: DEFAULT_HOTEL_SCHEDULE },
];

function decideVenueSchedules(state: WorldState): VirtualPlayerDecision | null {
  for (const entry of VENUE_SCHEDULE_ORDER) {
    const stands = state.buildings.some(
      (building) => building.completed && building.faction !== 'rival' && building.type === entry.type,
    );
    if (!stands) continue;

    const current = getVenueSchedule(state, entry.kind);
    if (current.startHour === entry.schedule.startHour && current.endHour === entry.schedule.endHour) continue;
    if (!validateVenueSchedule(entry.schedule.startHour, entry.schedule.endHour).ok) continue;

    return {
      command: {
        proto: WORKER_CMD_PROTO,
        op: 'setVenueSchedule',
        venue: entry.kind,
        startHour: entry.schedule.startHour,
        endHour: entry.schedule.endHour,
      },
      reason: `open the ${entry.kind} ${getVenueScheduleLabel(entry.schedule)} — the owner's standard hours`,
    };
  }

  return null;
}

/**
 * 19 — trim a genuine overstaffing surplus down to the building's crew cap.
 *
 * Only a workplace holding more settlers than `BUILDING_CONFIGS[type].maxOccupants`
 * is touched (a state auto-staffing never creates but a player or a demotion can),
 * and the least skilled of them is released, so the crew keeps its best hands.
 * One release per act leaves the building exactly at its cap, retiring the step.
 */
function decideSurplusWorkers(state: WorldState): VirtualPlayerDecision | null {
  const humans = state.entities.filter(isPlayerHuman);

  for (const building of state.buildings) {
    if (!building.completed || building.faction === 'rival') continue;
    const job = BUILDING_JOB_TYPES[building.type];
    if (!job) continue;
    const cap = BUILDING_CONFIGS[building.type].maxOccupants;

    const crew = humans.filter(
      (human) => human.alive && !human.isJuvenile && human.homeBuildingId === building.id,
    );
    if (crew.length <= cap) continue;

    let surplus = crew[0];
    let lowestSkill = readSkill(surplus, job);
    for (const worker of crew) {
      const skill = readSkill(worker, job);
      if (skill < lowestSkill || (skill === lowestSkill && worker.id < surplus.id)) {
        surplus = worker;
        lowestSkill = skill;
      }
    }

    return {
      command: { proto: WORKER_CMD_PROTO, op: 'removeWorker', buildingId: building.id, humanId: surplus.id },
      reason: `release ${surplus.name} from the ${BUILDING_CONFIGS[building.type].label} — ${crew.length} hands for ${cap} posts`,
    };
  }

  return null;
}

/** True when a road already serves this building. */
function hasRoadNearby(state: WorldState, building: Building): boolean {
  const cx = building.x + building.width / 2;
  const cy = building.y + building.height / 2;
  return state.buildings.some((other) => {
    if (other.type !== BuildingType.Road || other.faction === 'rival') return false;
    return Math.hypot(other.x + other.width / 2 - cx, other.y + other.height / 2 - cy)
      <= VirtualPlayer.ROAD_LINK_MAX_DISTANCE;
  });
}

/**
 * The production building that most deserves a road: the nearest one that stands
 * a real walk from the village centre and has no road serving it yet.
 */
function findRoadTarget(state: WorldState, camp: { x: number; y: number }): Building | null {
  let best: Building | null = null;
  let bestDistance = Infinity;

  for (const building of state.buildings) {
    if (!building.completed || building.faction === 'rival') continue;
    if (!BUILDING_JOB_TYPES[building.type]) continue;
    if (hasRoadNearby(state, building)) continue;

    const distance = Math.hypot(
      building.x + building.width / 2 - camp.x,
      building.y + building.height / 2 - camp.y,
    );
    if (distance < VirtualPlayer.ROAD_MIN_LINK_DISTANCE) continue;
    if (distance >= bestDistance) continue;
    best = building;
    bestDistance = distance;
  }

  return best;
}

/** Tile coords → world coords, for the road corridor's corners. */
function corridorCorners(path: readonly { x: number; y: number }[]): { x: number; y: number }[] {
  const corners: { x: number; y: number }[] = [];
  for (let i = 0; i < path.length; i++) {
    if (i === 0 || i === path.length - 1) {
      corners.push(path[i]);
      continue;
    }
    const previous = path[i - 1];
    const current = path[i];
    const next = path[i + 1];
    const turned =
      Math.sign(current.x - previous.x) !== Math.sign(next.x - current.x)
      || Math.sign(current.y - previous.y) !== Math.sign(next.y - current.y);
    if (turned) corners.push(current);
  }
  return corners;
}

/**
 * Walk the corridor from the camp to the target with the game's own pathfinding
 * (which already treats buildings as blocked), then let the placement owner build
 * and validate each straight leg of the route. Only segments the owner marks
 * `valid` are kept, so a road can never be routed through a building, and a full
 * chain that would be too long is cut to `ROAD_MAX_SEGMENTS_PER_ACT`.
 */
function buildRoadChain(
  state: WorldState,
  camp: { x: number; y: number },
  target: Building,
): StripSegment[] {
  if (!state.worldMap) return [];

  const path = findPath(
    getPathGrid(state.worldMap, state.buildings),
    Math.floor(camp.x / PATH_CELL),
    Math.floor(camp.y / PATH_CELL),
    Math.floor((target.x + target.width / 2) / PATH_CELL),
    Math.floor((target.y + target.height / 2) / PATH_CELL),
    VirtualPlayer.ROAD_PATH_MAX_NODES,
  );
  if (!path) return [];

  const corners = pathWaypoints(corridorCorners(path));
  const segments: StripSegment[] = [];
  for (let i = 0; i + 1 < corners.length; i++) {
    const from = corners[i];
    const to = corners[i + 1];
    const preview = buildStripPreview(
      state,
      BuildingType.Road,
      from.x,
      from.y,
      to.x,
      to.y,
      inferStripRotation(from.x, from.y, to.x, to.y),
    );
    for (const segment of preview.segments) {
      if (!segment.valid) continue;
      segments.push(segment);
      if (segments.length >= VirtualPlayer.ROAD_MAX_SEGMENTS_PER_ACT) return segments;
    }
  }

  return segments;
}

/**
 * 20 — lay one short road chain from the village centre to a production building
 * that stands a real walk away and has no road yet.
 *
 * The route is the game's own A* corridor (`getPathGrid`/`findPath`, which treats
 * buildings as blocked) and every tile is validated by the placement owner's
 * `buildStripPreview`; invalid segments are dropped rather than forced. One chain
 * per act, capped at `ROAD_MAX_SEGMENTS_PER_ACT`, and the wood shelf is left above
 * `ROAD_MIN_WOOD` so paving never outranks the colony's real needs.
 */
function decideRoads(state: WorldState): VirtualPlayerDecision | null {
  if ((state.resources.wood ?? 0) < VirtualPlayer.ROAD_MIN_WOOD) return null;

  const camp = getPlayerCampCenter(state, state.buildings);
  const target = findRoadTarget(state, camp);
  if (!target) return null;

  const segments = buildRoadChain(state, camp, target);
  if (segments.length === 0) return null;

  return {
    command: { proto: WORKER_CMD_PROTO, op: 'placeStripChain', type: BuildingType.Road, segments, rotation: 0 },
    reason: `lay a road to the ${BUILDING_CONFIGS[target.type].label} — nothing links it to the village yet`,
  };
}

/**
 * 22 — upkeep and agency, only where the owner accepts and the gain is real.
 *
 *  - `upgradeBuilding` only as a last resort: settlers are homeless, no bed is
 *    free, and there is no legal plot left to build another house on.
 *  - `tameEntity` only from a deep larder, for a creature a Taming Post can
 *    actually reach.
 *
 * Moving a grown child into their own home is not a step: housing is fully
 * automatic. `assignMissingResidences` (the residency owner, run every day)
 * already rebalances adult children out of the family home whenever an empty
 * house is free, so the bot proposes nothing here.
 */
function decideUpkeep(state: WorldState): VirtualPlayerDecision | null {
  const homeless = countHomelessSettlers(state);
  if (
    homeless > 0
    && getOpenPlayerBeds(state) === 0
    && !findPlacementSpot(state, BuildingType.House, 0)
    && !isUnderConstruction(state, BuildingType.House)
    && !isUnderConstruction(state, BuildingType.Mansion)
  ) {
    for (const building of state.buildings) {
      if (building.faction === 'rival' || building.type === BuildingType.LeaderHouse) continue;
      if (!isResidenceBuilding(building)) continue;
      if (!getBuildingUpgradeEligibility(state, building.id).ok) continue;
      return {
        command: { proto: WORKER_CMD_PROTO, op: 'upgradeBuilding', buildingId: building.id },
        reason: `expand the ${BUILDING_CONFIGS[building.type].label} — ${homeless} homeless and no room left to build`,
      };
    }
  }

  if (hasFoodMargin(state, VirtualPlayer.TAME_FOOD_RESERVE_DAYS)) {
    const humans = state.entities.filter(isPlayerHuman);
    const tamer = humans.find((human) => !human.isJuvenile);
    if (tamer) {
      for (const entity of state.entities) {
        if (!getTameEntityEligibility(state, entity.id, tamer.id).ok) continue;
        return {
          command: { proto: WORKER_CMD_PROTO, op: 'tameEntity', entityId: entity.id, humanId: tamer.id },
          reason: `tame the ${entity.type} — a Taming Post is in reach and the larder is deep`,
        };
      }
    }
  }

  // A general upgrade is *not* proposed here: like a community building it is the most
  // postponable thing the bot spends on, so it lives at the end of the ladder
  // (`decideUpgrades`) where it cannot shadow defence, diplomacy or expansion. The housing
  // expansion above stays, because a homeless colony has no more urgent building to raise.
  return null;
}

/**
 * 25 — the last hour of the ladder: raise a completed building a level.
 *
 * The whole test is the owner's (`getBuildingUpgradeEligibility`) plus the reserve policy
 * (`canAffordUpgradeWithReserve`), so the bot can never spend an hour on an upgrade the owner
 * would refuse. `buildingTypeHasLevelBenefit` keeps it off the 16 types whose level nothing
 * reads, where the upgrade is offered to nobody — the same derivation the panel uses to hide
 * the button.
 *
 * Last on purpose, beside `decideCommunity`: an upgrade competes with nothing, so it takes the
 * hour only when food, housing, repair, defence and services all have nothing to do.
 */
function decideUpgrades(state: WorldState): VirtualPlayerDecision | null {
  // An idle settler is work the colony has not placed yet, and placing one is worth more than a
  // level — so while anybody is idle, the ladder's other steps get the hour.
  if (computeVillageStats(state).idle > 0) return null;

  for (const building of state.buildings) {
    if (!building.completed || building.faction === 'rival') continue;
    if (!buildingTypeHasLevelBenefit(building.type)) continue;
    // The Leader's House is free and belongs to the office, not the colony's budget: raising its
    // level would spend real resources on the one building nobody paid to raise. The UI hides the
    // button for it (`upgradeBuilding` treats it as structural); the bot must skip it too.
    if (building.type === BuildingType.LeaderHouse) continue;
    if (!getBuildingUpgradeEligibility(state, building.id).ok) continue;
    if (!canAffordUpgradeWithReserve(state, building)) continue;
    return {
      command: { proto: WORKER_CMD_PROTO, op: 'upgradeBuilding', buildingId: building.id },
      reason: `upgrade the ${BUILDING_CONFIGS[building.type].label} — the stores can spare it`,
    };
  }

  return null;
}

/**
 * An outbuilding the colony can afford to lose: complete, empty, not a home and
 * not unique, and a type the colony already has a second completed copy of.
 */
function findRedundantOutbuilding(state: WorldState): Building | null {
  for (const building of state.buildings) {
    if (!building.completed || building.faction === 'rival') continue;
    if (building.occupants.length > 0) continue;
    if (isResidenceBuilding(building)) continue;
    if (BUILDING_CONFIGS[building.type].unique) continue;

    const completedCopies = state.buildings.filter(
      (other) => other.completed && other.faction !== 'rival' && other.type === building.type,
    ).length;
    if (completedCopies < 2) continue;
    return building;
  }
  return null;
}

/**
 * 21 — clear room by demolishing a redundant outbuilding, but only at a genuine
 * housing dead end: settlers are homeless, not one bed is free, no plot is left
 * for another home, and none is already on the way. Even then only a complete,
 * empty, non-residence, non-unique building that duplicates a type the colony
 * already has twice over is touched, and one act removes one building — so the
 * step retires as the duplicates run out. Clearing space this way outranks
 * expanding a home (step 22), because a freed plot fits a whole house.
 */
function decideDemolish(state: WorldState): VirtualPlayerDecision | null {
  if (countHomelessSettlers(state) === 0) return null;
  if (getOpenPlayerBeds(state) > 0) return null;
  if (findPlacementSpot(state, BuildingType.House, 0)) return null;
  if (isUnderConstruction(state, BuildingType.House) || isUnderConstruction(state, BuildingType.Mansion)) {
    return null;
  }

  const redundant = findRedundantOutbuilding(state);
  if (!redundant) return null;
  return {
    command: { proto: WORKER_CMD_PROTO, op: 'demolishBuilding', buildingId: redundant.id },
    reason: `clear the empty ${BUILDING_CONFIGS[redundant.type].label} — the village has no room left to build`,
  };
}

/**
 * One community building the bot will raise, with the condition that makes it worth its hour.
 * `needed` is a *want* only: whether the colony may actually build it is still decided by
 * `canPlaceBuilding` (research gate, cost, terrain), so no rule is restated here.
 */
interface ServiceBuildOption {
  type: BuildingType;
  needed: (state: WorldState) => boolean;
  /** Days of food need this entry must leave in the larder; defaults to the community reserve. */
  foodReserveDays?: number;
}

/** The colony already has this type, built or on the way — `decideCivic`'s own rule. */
function ownsBuildingOfType(state: WorldState, type: BuildingType): boolean {
  return state.buildings.some((building) => building.type === type && building.faction !== 'rival');
}

function hasCompletedBuildingOfType(state: WorldState, type: BuildingType): boolean {
  return state.buildings.some(
    (building) => building.type === type && building.faction !== 'rival' && building.completed,
  );
}

/** Adult settlers — the population a service has to be worth building for. */
function adultSettlerCount(state: WorldState): number {
  let adults = 0;
  for (const entity of state.entities) {
    if (!entity.alive || !isPlayerHuman(entity) || entity.isJuvenile) continue;
    adults++;
  }
  return adults;
}

function hasJuvenileSettler(state: WorldState): boolean {
  return state.entities.some((entity) => entity.alive && isPlayerHuman(entity) && entity.isJuvenile);
}

/** The `state.resources.storageMax` key a storage building extends. */
type StorageResourceKey = 'wood' | 'stone' | 'gold' | 'food';

/** Two thirds full: the shelf is nearly full, so extra capacity is the next useful build. */
const STORAGE_PRESSURE_RATIO = 2 / 3;

function storageNearlyFull(state: WorldState, key: StorageResourceKey): boolean {
  const cap = state.storageMax?.[key];
  if (!cap || cap <= 0) return false;
  return (state.resources[key] ?? 0) >= cap * STORAGE_PRESSURE_RATIO;
}

/**
 * 22 — the community services: the buildings a settlement raises once it is a
 * settlement, and the ones no earlier step ever proposed.
 *
 * Order is the order of need. Each entry's `needed` is grounded in the mechanic
 * that building owns, so none of them is a wish: the well answers a village too
 * big to walk for water, the tavern a population that needs somewhere to unwind,
 * the school children who exist, the church the scandal pressure `churchStrength`
 * actually modifies, storage the shelf that is nearly full, and the preserve
 * ground an ecosystem under strain needs back.
 *
 * Whether any of it may be *placed* is not restated: `canPlaceBuilding` refuses a
 * locked research, an unaffordable price and a blocked site, so `findPlacementSpot`
 * returns no spot and the step simply waits its turn — the same contract
 * `decideCivic` documents.
 *
 * Deliberately behind food, housing, repair and demolition, and behind a real food
 * reserve: a community building is the first thing a colony should be able to
 * postpone. Storage comes before the services that merely want building, so the
 * colony widens its shelves before it spends on comfort.
 */
function decideCommunity(state: WorldState): VirtualPlayerDecision | null {
  if (adultSettlerCount(state) < VirtualPlayer.COMMUNITY_MIN_SETTLERS) return null;

  for (const { type, needed, foodReserveDays } of COMMUNITY_BUILD_ORDER) {
    // The reserve is per entry: a comfort building waits for the strict community reserve, while a
    // storehouse for a shelf that is already full only clears the general food buffer.
    if (!hasFoodMargin(state, foodReserveDays ?? VirtualPlayer.COMMUNITY_FOOD_RESERVE_DAYS)) continue;
    if (needed(state) && canAfford(state, BUILDING_CONFIGS[type].cost)) {
      const spot = findPlacementSpot(state, type, 0);
      if (spot) {
        return {
          command: { proto: WORKER_CMD_PROTO, op: 'startBuilding', type, x: spot.x, y: spot.y, rotation: 0 },
          reason: `build a ${BUILDING_CONFIGS[type].label} — the settlement is big enough to need one`,
        };
      }
    }
  }

  return null;
}

/**
 * The community buildings, in the order the bot wants them, with the condition that
 * justifies each. Repair and expansion are not here — they are `decideRepairs` and
 * the upgrade half of `decideUpkeep`.
 */
const COMMUNITY_BUILD_ORDER: readonly ServiceBuildOption[] = [
  {
    type: BuildingType.Well,
    needed: (state) => !ownsBuildingOfType(state, BuildingType.Well),
  },
  {
    type: BuildingType.Tavern,
    needed: (state) => !ownsBuildingOfType(state, BuildingType.Tavern),
  },
  {
    type: BuildingType.Workshop,
    needed: (state) =>
      !ownsBuildingOfType(state, BuildingType.Workshop)
      && hasCompletedBuildingOfType(state, BuildingType.Blacksmith),
  },
  {
    type: BuildingType.School,
    needed: (state) => !ownsBuildingOfType(state, BuildingType.School) && hasJuvenileSettler(state),
  },
  {
    type: BuildingType.Church,
    needed: (state) => !ownsBuildingOfType(state, BuildingType.Church),
  },
  {
    type: BuildingType.Barn,
    needed: (state) =>
      !ownsBuildingOfType(state, BuildingType.Barn)
      && storageNearlyFull(state, 'wood'),
    // A full shelf is production going to waste, not a comfort spend, so storage only has to clear
    // the general food buffer instead of the stricter community reserve.
    foodReserveDays: VirtualPlayer.FOOD_BUFFER_DAYS,
  },
  {
    type: BuildingType.Silo,
    // The storage owner's own table (`computeStorageMax`): a Silo adds food and cuts spoilage; it
    // holds no gold at all, so `storageNearlyFull('gold')` made it effectively unbuildable.
    needed: (state) =>
      !ownsBuildingOfType(state, BuildingType.Silo)
      && storageNearlyFull(state, 'food'),
    foodReserveDays: VirtualPlayer.FOOD_BUFFER_DAYS,
  },
  {
    type: BuildingType.WoodStorehouse,
    needed: (state) =>
      !ownsBuildingOfType(state, BuildingType.WoodStorehouse)
      && storageNearlyFull(state, 'wood'),
    foodReserveDays: VirtualPlayer.FOOD_BUFFER_DAYS,
  },
  {
    type: BuildingType.Mill,
    needed: (state) => !ownsBuildingOfType(state, BuildingType.Mill),
  },
  {
    type: BuildingType.Hotel,
    needed: (state) =>
      !ownsBuildingOfType(state, BuildingType.Hotel)
      && (state.visitorGroups?.length ?? 0) > 0,
  },
  {
    type: BuildingType.TamingPost,
    needed: (state) => !ownsBuildingOfType(state, BuildingType.TamingPost),
  },
  {
    type: BuildingType.WildlifePreserve,
    needed: (state) =>
      !ownsBuildingOfType(state, BuildingType.WildlifePreserve)
      && getEcosystemHealth(state) < VirtualPlayer.ECOLOGY_HEALTHY_THRESHOLD,
  },
  // Everything else the catalogue offers, one of each, appended after the list that already had a
  // rule — the owner's *"all buildings should be buildable by the bot"*. Each is priced, gated and
  // sited by its own owners (research, `canPlaceBuilding`, the river rule for a Bridge), and the
  // ladder position keeps them behind food, housing, defence and diplomacy. The functional ones
  // clear the general food buffer rather than the comfort reserve, because a Market, a Hospital or a
  // prison is not a comfort spend; comfort and decor stay last and strict.
  {
    type: BuildingType.Market,
    needed: (state) => !ownsBuildingOfType(state, BuildingType.Market),
    foodReserveDays: VirtualPlayer.FOOD_BUFFER_DAYS,
  },
  {
    type: BuildingType.Hospital,
    needed: (state) => !ownsBuildingOfType(state, BuildingType.Hospital),
    foodReserveDays: VirtualPlayer.FOOD_BUFFER_DAYS,
  },
  {
    type: BuildingType.Prison,
    needed: (state) => !ownsBuildingOfType(state, BuildingType.Prison),
    foodReserveDays: VirtualPlayer.FOOD_BUFFER_DAYS,
  },
  {
    type: BuildingType.Mansion,
    needed: (state) => !ownsBuildingOfType(state, BuildingType.Mansion),
  },
  {
    type: BuildingType.Bridge,
    needed: (state) => !ownsBuildingOfType(state, BuildingType.Bridge),
    foodReserveDays: VirtualPlayer.FOOD_BUFFER_DAYS,
  },
  {
    type: BuildingType.Garden,
    needed: (state) => !ownsBuildingOfType(state, BuildingType.Garden),
  },
  {
    type: BuildingType.Statue,
    needed: (state) => !ownsBuildingOfType(state, BuildingType.Statue),
  },
  {
    type: BuildingType.Lamp,
    needed: (state) => !ownsBuildingOfType(state, BuildingType.Lamp),
  },
];

/**
 * Whether the colony can pay an upgrade **and keep an upgrade's worth in reserve**.
 *
 * `getBuildingUpgradeEligibility` already answers "can we pay this" — the upgrade half of
 * `decideUpkeep` asks the stricter question, because a level is the most postponable thing the
 * bot spends on: raising one out of the shelf that the next house or farm needs is how a colony
 * starves with a fine set of level-3 buildings. Food is the shared reserve policy
 * (`hasFoodMargin`), and the materials must clear `UPGRADE_COST_RESERVE_MULT` times their own
 * price, so the reserve scales with the level being bought.
 */
function canAffordUpgradeWithReserve(state: WorldState, building: Building): boolean {
  if (!hasFoodMargin(state, VirtualPlayer.UPGRADE_FOOD_RESERVE_DAYS)) return false;
  const cost = getBuildingUpgradeCost(building);
  const reserve = VirtualPlayer.UPGRADE_COST_RESERVE_MULT;
  return (
    state.resources.wood >= cost.wood * reserve
    && state.resources.stone >= cost.stone * reserve
    && state.resources.gold >= cost.gold * reserve
  );
}

/**
 * 23 — rival relations, peaceful first: a gift to a tense neighbour, a show of
 * strength when there is nothing to give, a truce, a trade pact, a trade route,
 * and only then a raid — and a raid solely against an already-tense rival with
 * three times the march provisions in store. The bot is a settler, not a
 * warmonger.
 */
function decideRivalRelations(state: WorldState): VirtualPlayerDecision | null {
  const rivals = state.rivalSettlements ?? [];

  for (const rival of rivals) {
    if (rival.relationship !== 'tense') continue;
    if (!hasFoodMargin(state, VirtualPlayer.RIVAL_FOOD_RESERVE_DAYS)) continue;
    if (!getRivalGiftEligibility(state, rival.id).ok) continue;
    return {
      command: { proto: WORKER_CMD_PROTO, op: 'sendRivalGift', rivalId: rival.id },
      reason: `send food to ${rival.name} — tense neighbours and a full larder`,
    };
  }

  // Nothing to give, but spears and settlers to show: a parade cools a tense
  // neighbour a step (at a small reputation cost) when a gift cannot be afforded.
  for (const rival of rivals) {
    if (rival.relationship !== 'tense') continue;
    if (getRivalGiftEligibility(state, rival.id).ok) continue;
    if (!getShowStrengthEligibility(state, rival.id).ok) continue;
    return {
      command: { proto: WORKER_CMD_PROTO, op: 'showStrengthToRival', rivalId: rival.id },
      reason: `parade the militia past ${rival.name} — no food to spare, but spears to show`,
    };
  }

  for (const rival of rivals) {
    if (!hasFoodMargin(state, VirtualPlayer.RIVAL_FOOD_RESERVE_DAYS)) continue;
    if (!getPeaceTreatyEligibility(state, rival.id).ok) continue;
    return {
      command: { proto: WORKER_CMD_PROTO, op: 'signPeaceTreaty', rivalId: rival.id },
      reason: `sign peace with ${rival.name} — a truce is affordable`,
    };
  }

  // A pact turns a wary neighbour friendly for good — the durable answer to a
  // competitive one, once the treasury can carry the gift.
  for (const rival of rivals) {
    if (!getRivalTradePactEligibility(state, rival.id).ok) continue;
    return {
      command: { proto: WORKER_CMD_PROTO, op: 'establishRivalTradePact', rivalId: rival.id },
      reason: `sign a trade pact with ${rival.name} — gold buys lasting friendship`,
    };
  }

  for (const route of state.tradeRoutes ?? []) {
    if (!canEstablishTradeRoute(state, route.id).ok) continue;
    return {
      command: { proto: WORKER_CMD_PROTO, op: 'establishTradeRoute', routeId: route.id },
      reason: `open the ${route.targetName} trade route — the market is ready`,
    };
  }

  for (const rival of rivals) {
    if (rival.relationship !== 'tense') continue;
    const raid = canLaunchRaidOnRival(state, rival);
    if (!raid.ok) continue;
    if ((state.resources.food ?? 0) < raid.foodCost * VirtualPlayer.RAID_FOOD_SURPLUS_MULT) continue;
    return {
      command: { proto: WORKER_CMD_PROTO, op: 'launchRaidOnRival', rivalId: rival.id },
      reason: `raid ${rival.name} — tense relations and provisions to spare`,
    };
  }

  return null;
}

/**
 * 26 — the defence a village raises once words have failed: a watchtower, a barracks, then a wall,
 * its gate and a fence.
 *
 * Walls, gates and fences are strip types (`STRIP_BUILD_TYPES`), so they are placed with the same
 * placement owner preview the road step uses, one short run per act — a designed enclosure stays the
 * player's. It runs before the gift step because a wall is a standing answer, and it waits for
 * `giftsGiven`: the colony tries the cheap answer first and only fortifies a neighbour it has
 * already paid and who is still hostile.
 */
const DEFENCE_BUILD_ORDER: readonly BuildingType[] = [
  BuildingType.Watchtower,
  BuildingType.Barracks,
];

const PERIMETER_ORDER: readonly BuildingType[] = [
  BuildingType.Wall,
  BuildingType.WallGate,
  BuildingType.Fence,
];

/** Tiles one perimeter act may lay, so a wall appears a piece at a time. */
const PERIMETER_RUN_SEGMENTS = 4;

/** One short run of a strip type out of the village centre, or none when no tile is legal. */
function buildPerimeterRun(state: WorldState, type: BuildingType): StripSegment[] {
  const camp = getPlayerCampCenter(state, state.buildings);
  const reach = PATH_CELL * PERIMETER_RUN_SEGMENTS;
  const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;

  for (const [dx, dy] of directions) {
    const to = { x: camp.x + dx * reach, y: camp.y + dy * reach };
    const preview = buildStripPreview(
      state,
      type,
      camp.x,
      camp.y,
      to.x,
      to.y,
      inferStripRotation(camp.x, camp.y, to.x, to.y),
    );
    if (preview.segments.some((segment) => segment.valid)) return [...preview.segments];
  }
  return [];
}

function decidePerimeter(state: WorldState): VirtualPlayerDecision | null {
  if (adultSettlerCount(state) < VirtualPlayer.COMMUNITY_MIN_SETTLERS) return null;
  const hostile = (state.rivalSettlements ?? []).filter(
    (rival) => rival.relationship === 'tense' || rival.relationship === 'competitive',
  );
  // Only a neighbour the colony has already paid and who is still hostile is worth a wall.
  if (!hostile.some((rival) => rival.giftsGiven > 0)) return null;

  for (const type of DEFENCE_BUILD_ORDER) {
    if (ownsBuildingOfType(state, type)) continue;
    // Wood and stone, so the materials floor applies and the larder is not defence's business.
    if (!canAffordKeepingRepair(state, BUILDING_CONFIGS[type].cost)) continue;
    const spot = findPlacementSpot(state, type, 0);
    if (!spot) continue;
    return {
      command: { proto: WORKER_CMD_PROTO, op: 'startBuilding', type, x: spot.x, y: spot.y, rotation: 0 },
      reason: `raise a ${BUILDING_CONFIGS[type].label} — a neighbour took the gift and stayed hostile`,
    };
  }

  for (const type of PERIMETER_ORDER) {
    if (ownsBuildingOfType(state, type)) continue;
    // A gate joins a wall; it is not the first thing a colony puts up.
    if (type === BuildingType.WallGate && !ownsBuildingOfType(state, BuildingType.Wall)) continue;
    if (!canAffordKeepingRepair(state, BUILDING_CONFIGS[type].cost)) continue;
    const segments = buildPerimeterRun(state, type);
    if (segments.length === 0) continue;

    return {
      command: { proto: WORKER_CMD_PROTO, op: 'placeStripChain', type, segments, rotation: 0 },
      reason: `raise a ${BUILDING_CONFIGS[type].label} run — a neighbour took the gift and stayed hostile`,
    };
  }

  return null;
}

/**
 * Decides at most ONE action for the given world, or `null` when the colony
 * needs nothing the bot knows how to fix. Pure: it never writes to `state`.
 */
export function decideVirtualPlayerAction(state: WorldState): VirtualPlayerDecision | null {
  return (
    answerOpenCard(state)
    ?? decideLeaderHouse(state)
    ?? decideStaffing(state)
    ?? decideHousing(state)
    ?? decideFood(state)
    ?? decideCivic(state)
    ?? decideResearch(state)
    ?? decideFestival(state)
    ?? decideIndustry(state)
    ?? decideRepairs(state)
    ?? decideForgeOrders(state)
    ?? decideBuildingTuning(state)
    ?? decideRecruitment(state)
    ?? decideVisitorRelations(state)
    ?? decideManualStaffing(state)
    ?? decideStaffingMode(state)
    ?? decideWorkSchedule(state)
    ?? decideVenueSchedules(state)
    ?? decideSurplusWorkers(state)
    ?? decideRoads(state)
    ?? decideDemolish(state)
    ?? decideUpkeep(state)
    // Defence of the village outranks one more gift: fortifying waits until gifting has failed.
    ?? decidePerimeter(state)
    ?? decideRivalRelations(state)
    // Last two on purpose: a community building and a building upgrade are the only proposals
    // that may spend an hour nothing else wanted, so neither can shadow defence or diplomacy.
    ?? decideCommunity(state)
    ?? decideUpgrades(state)
  );
}

/**
 * The owner's own wording for a building the colony wants and cannot raise yet: the research it
 * waits on, the price it has not saved, or the plot the placement owner refuses. `withReserve` asks
 * the same stricter affordability an ahead-of-need build uses, so the reason names the real refusal.
 */
function buildingBlockReason(state: WorldState, type: BuildingType, withReserve = false): string {
  const label = BUILDING_CONFIGS[type].label;
  const requirement = BUILDING_CONFIGS[type].unlockRequirement;
  if (requirement && !isBuildingTechUnlocked(requirement, state.unlockedTechs, state.researchNodes)) {
    return `${getPlaceBuildingFailureLabel(type, 'research', state.researchNodes)} for a ${label}`;
  }
  const affordable = withReserve
    ? canSpendKeepingReserve(state, BUILDING_CONFIGS[type].cost)
    : canAfford(state, BUILDING_CONFIGS[type].cost);
  if (!affordable) {
    return `${formatResourceCostNeed(BUILDING_CONFIGS[type].cost)} for a ${label}`;
  }
  return `${PLACEMENT_FAILURE_LABELS.blocked} for a ${label}`;
}

/**
 * Why the ladder stopped: the larder, the beds or the shelf it cannot serve yet, said with the
 * owners' own reasons. `null` only when every need the ladder acts on is met, which is the one case
 * the status line may call healthy. Pure, and read-only like the ladder.
 *
 * It reads the ladder's own tables (`INDUSTRY_BUILD_ORDER`, `FOOD_PRODUCER_TYPES`, the spare-bed
 * reserve), so it can only name a need some step really serves — never a second policy of its own.
 * Famine comes first: a spare bed is headroom, an empty larder is settlers dying.
 */
export function virtualPlayerWaitingReason(state: WorldState): string | null {
  const settlers = playerHumanCount(state.entities);
  if (settlers > 0) {
    const food = Math.floor(state.resources.food ?? 0);
    if (food < foodNeedPerDay(settlers) * VirtualPlayer.FOOD_BUFFER_DAYS) {
      const goingUp = FOOD_PRODUCER_TYPES.find((type) => isUnderConstruction(state, type));
      if (goingUp) {
        return `the larder is short — ${food} food left and the ${BUILDING_CONFIGS[goingUp].label} is still going up`;
      }
      const placeable = FOOD_PRODUCER_TYPES.find(
        (type) => canAfford(state, BUILDING_CONFIGS[type].cost) && findPlacementSpot(state, type, 0),
      );
      if (!placeable) {
        return `the larder is short — ${food} food left, ${buildingBlockReason(state, FOOD_PRODUCER_TYPES[0])}`;
      }
    }
  }

  const homeless = countHomelessSettlers(state);
  const openBeds = getOpenPlayerBeds(state);
  if (homeless > 0 && openBeds === 0) {
    return `${homeless} settler${homeless === 1 ? '' : 's'} homeless — ${buildingBlockReason(state, BuildingType.House)}`;
  }
  if (homeless === 0 && openBeds < spareBedReserve(state)) {
    if (isUnderConstruction(state, BuildingType.House) || isUnderConstruction(state, BuildingType.Mansion)) {
      return `${openBeds} spare bed${openBeds === 1 ? '' : 's'} left — the next House is still going up`;
    }
    return `${openBeds} spare bed${openBeds === 1 ? '' : 's'} for ${adultSettlerCount(state)} settlers — ${buildingBlockReason(state, BuildingType.House)}`;
  }

  const buildingNow = INDUSTRY_BUILD_ORDER
    .map((entry) => entry.type)
    .find((type) => isUnderConstruction(state, type));
  const wanted = wantedProducerCount(state, VirtualPlayer.SETTLERS_PER_INDUSTRY_PRODUCER);

  for (const entry of INDUSTRY_BUILD_ORDER) {
    const stock = Math.floor(state.resources[entry.stock] ?? 0);
    const short = stock < entry.minimumStock;
    const built = completedProducerCount(state, entry.type);
    // The Store is storage rather than a producer, so it stays a first-copy answer.
    const scaling = entry.type !== BuildingType.Store && built >= 1 && built < wanted;
    if (!short && !scaling) continue;

    const label = BUILDING_CONFIGS[entry.type].label;
    const owned = state.buildings.filter(
      (building) => building.type === entry.type && building.faction !== 'rival',
    );
    if (owned.some((building) => !building.completed)) {
      return `${label} is still going up — ${stock} ${entry.stock} left`;
    }
    const standing = owned.find((building) => building.completed);
    if (standing) {
      if (countWorkersAtBuilding(state.entities, standing.id) === 0) {
        return `${label} stands unmanned — ${stock} ${entry.stock} left and no settler free to work it`;
      }
      // No standing producer cannot "keep up": the ones that are missing are named by price below.
      if (!scaling) return `${stock} ${entry.stock} left — the ${label} cannot keep up`;
      return `${built} producer${built === 1 ? '' : 's'} for ${adultSettlerCount(state)} settlers — ${buildingBlockReason(state, entry.type, true)}`;
    }
    if (buildingNow) {
      return `${BUILDING_CONFIGS[buildingNow].label} is still going up — a ${label} waits its turn`;
    }
    return `${short ? `${stock} ${entry.stock} left` : `${built} for ${adultSettlerCount(state)} settlers`} — ${buildingBlockReason(state, entry.type, scaling)}`;
  }

  return null;
}
