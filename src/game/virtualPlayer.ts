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
 *  14. visitors 15. manual staffing  16. upkeep & agency  17. rival relations
 *
 * Costs, affordability, placement validity, staffing eligibility, research
 * gating, festival readiness, repair/upgrade rules, recruitment, forging, taming,
 * visitor trade, peace and raid eligibility are all delegated to
 * their existing owner modules (`canAfford`, `canPlaceBuilding`,
 * `canAssignWorkerToBuilding`, `canStartResearch`, `canHostTownFestival`,
 * `getOpenPlayerBeds`, `getDiplomacyChoiceEligibility`, `getRaidChoiceEligibility`,
 * `getStoryChoiceEligibility`, `getRepairBuildingEligibility`,
 * `getBuildingUpgradeEligibility`, `getForgeBlockReason`,
 * `getRecruitSettlerEligibility`, `getTameEntityEligibility`,
 * `getVisitorTradeEligibility`, `getRivalGiftEligibility`,
 * `getPeaceTreatyEligibility`, `canEstablishTradeRoute`, `canLaunchRaidOnRival`).
 * This file adds no new game rule, and it never proposes a card answer an owner
 * would refuse: a refused command still claims its in-game hour, so it would
 * repeat every hour until the card expired while nothing else got done.
 */
import type { Building, HuntingSpotPrey, VisitorGroup, WorldState } from './gameTypes';
import { BUILDING_CONFIGS, BuildingType, GRID_SIZE } from './gameTypes';
import type { ForgeOrderId } from './gameTypes';
import { WORKER_CMD_PROTO, type WorkerCommand } from './simWorker/commands';
import { canPlaceBuilding } from './buildingPlacementActions';
import {
  getBuildingFootprintForType,
  snapBuildingCenter,
  type BuildingRotation,
} from './buildingRotation';
import { canAfford, getAvailableStorageHeadroom } from './resourceUtils';
import { hasResidenceAssignment, hasWorkAssignment, isResidenceBuilding } from './residencyOccupancy';
import { isPlayerHuman, playerHumanCount } from './playerHuman';
import { getPlayerCampCenter, getRaidChoiceEligibility, canLaunchRaidOnRival } from './frontierCombat';
import { canAssignWorkerToBuilding } from './buildingStaffingActions';
import { isManualStaffingBuilding } from './workforce';
import { getOpenPlayerBeds } from './populationGrowth';
import { canHostTownFestival, findPlayerTownHall } from './townHall';
import { canStartResearch } from './research';
import {
  getDiplomacyChoiceEligibility,
  getPeaceTreatyEligibility,
  getRivalGiftEligibility,
  getVisitorLeaderTalkMeta,
  getVisitorTradeEligibility,
  VILLAGE_REQUEST_PROVISIONS_COST_GOLD,
  VILLAGE_REQUEST_PROVISIONS_FOOD,
  type VisitorTradeAction,
} from './groupEvents';
import { Human, VirtualPlayer } from './gameConstants';
import { getStoryChoiceEligibility } from './storyEvents';
import type { DiplomacyEvent, RaidEvent, StoryEvent } from './gameTypes';
import {
  getBuildingUpgradeEligibility,
  getRepairBuildingEligibility,
} from './buildingMaintenanceActions';
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

/** Idle adults the staffing owner would actually accept for a workplace. */
function countIdleAdults(state: WorldState): number {
  let count = 0;
  for (const entity of state.entities) {
    if (!entity.alive || !isPlayerHuman(entity) || entity.isJuvenile) continue;
    if (!hasWorkAssignment(entity)) count++;
  }
  return count;
}

/** Living player settlers with no residence assignment (the housing problem). */
function countHomelessSettlers(state: WorldState): number {
  let count = 0;
  for (const entity of state.entities) {
    if (!entity.alive || !isPlayerHuman(entity)) continue;
    if (!hasResidenceAssignment(entity)) count++;
  }
  return count;
}

function findPlacementSpot(
  state: WorldState,
  type: BuildingType,
  rotation: BuildingRotation,
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
        if (canPlaceBuilding(state, type, spot.x, spot.y, rotation)) return spot;
      }
    }
  }
  return null;
}

function isUnderConstruction(state: WorldState, type: BuildingType): boolean {
  return state.buildings.some(
    (building) => building.faction !== 'rival' && building.type === type && !building.completed,
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
    // Match resolveVillageRequest gates: enough gold and granary headroom for the food.
    // A failed accept leaves the request open and would burn every auto-play hour.
    const accept =
      (state.resources.gold ?? 0) >= VILLAGE_REQUEST_PROVISIONS_COST_GOLD
      && getAvailableStorageHeadroom(state, 'food') >= VILLAGE_REQUEST_PROVISIONS_FOOD;
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
  const idleAdults = countIdleAdults(state);
  if (idleAdults === 0) return null;

  for (const building of state.buildings) {
    if (!building.completed || building.faction === 'rival') continue;
    // Generic auto-staffing deliberately never fills manual workplaces
    // (Church, Prison, Barracks, School, Town Hall) — those stay the player's call.
    if (isManualStaffingBuilding(building)) continue;
    // The staffing owner is the whole eligibility test: it refuses a full
    // workplace, so the first building it accepts has a slot `autoStaffWorkers`
    // will actually fill — whether that workplace stands empty or half staffed.
    if (!canAssignWorkerToBuilding(state, building.id)) continue;
    return {
      command: { proto: WORKER_CMD_PROTO, op: 'autoStaffWorkers' },
      reason: `staff the open slots at ${BUILDING_CONFIGS[building.type].label} — ${idleAdults} idle settler${idleAdults === 1 ? '' : 's'}`,
    };
  }

  return null;
}

/** 4 — a settler with nowhere to sleep and no housing already on the way. */
function decideHousing(state: WorldState): VirtualPlayerDecision | null {
  const homeless = countHomelessSettlers(state);
  if (homeless === 0) return null;
  // Spare beds mean an assignment was missed, not that beds are short — but the
  // Leader's House beds belong to the leader's household, so they are not spare
  // housing for anyone else (`getOpenPlayerBeds` excludes them).
  if (getOpenPlayerBeds(state) > 0) return null;
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
    reason: `build a House — ${homeless} settler${homeless === 1 ? '' : 's'} homeless`,
  };
}

/** 5 — stores below a small buffer of days of settler need. */
function decideFood(state: WorldState): VirtualPlayerDecision | null {
  const settlers = playerHumanCount(state.entities);
  if (settlers <= 0) return null;

  const needPerDay = foodNeedPerDay(settlers);
  const food = state.resources.food ?? 0;
  if (food >= needPerDay * VirtualPlayer.FOOD_BUFFER_DAYS) return null;
  // One producer at a time, so a food shortage cannot drain the treasury in a day.
  if (FOOD_PRODUCER_TYPES.some((type) => isUnderConstruction(state, type))) return null;

  const daysLeft = Math.max(0, Math.floor(food / needPerDay));
  for (const type of FOOD_PRODUCER_TYPES) {
    // A locked producer simply finds no legal spot: the placement owner owns the
    // unlock rule (`getPlaceBuildingFailureReason` → 'research'), so the bot does
    // not restate it and cannot disagree with a human click.
    if (!canAfford(state, BUILDING_CONFIGS[type].cost)) continue;
    const spot = findPlacementSpot(state, type, 0);
    if (!spot) continue;
    return {
      command: { proto: WORKER_CMD_PROTO, op: 'startBuilding', type, x: spot.x, y: spot.y, rotation: 0 },
      reason: `build a ${BUILDING_CONFIGS[type].label} — ${daysLeft} day${daysLeft === 1 ? '' : 's'} of food left`,
    };
  }

  return null;
}

/** 7 — start the first research the owner would actually accept. */
function decideResearch(state: WorldState): VirtualPlayerDecision | null {
  if (state.activeResearch) return null;
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
 * research ladder something to forge and what gates `decideIndustry`'s Mine. Both
 * are research-gated, and that gate is not restated here: `canPlaceBuilding`
 * refuses a locked building, so `findPlacementSpot` simply returns no spot and the
 * step waits until the owner research lands.
 */
const CIVIC_BUILD_ORDER: readonly BuildingType[] = [
  BuildingType.TownHall,
  BuildingType.Blacksmith,
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

const INDUSTRY_BUILD_ORDER: readonly {
  type: BuildingType;
  stock: keyof WorldState['resources'];
  minimumStock: number;
}[] = [
  { type: BuildingType.LumberMill, stock: 'wood', minimumStock: LOW_WOOD_STOCK },
  { type: BuildingType.Quarry, stock: 'stone', minimumStock: 60 },
  { type: BuildingType.Mine, stock: 'iron', minimumStock: 20 },
  { type: BuildingType.Store, stock: 'gold', minimumStock: 80 },
];

/**
 * 9 — the economy answer to a resource the colony is running out of.
 *
 * One economy build at a time, first copy only, and every owner still decides:
 * `canAfford` prices it and `canPlaceBuilding` refuses a locked or illegal spot,
 * so a research-gated building simply waits its turn. A Mine waits for a
 * Blacksmith — there is no point mining iron with nothing to forge.
 */
function decideIndustry(state: WorldState): VirtualPlayerDecision | null {
  if (INDUSTRY_BUILD_ORDER.some((entry) => isUnderConstruction(state, entry.type))) return null;

  const hasBlacksmith = state.buildings.some(
    (building) => building.type === BuildingType.Blacksmith && building.completed && building.faction !== 'rival',
  );

  for (const entry of INDUSTRY_BUILD_ORDER) {
    if (state.buildings.some((building) => building.type === entry.type && building.faction !== 'rival')) continue;
    if (entry.type === BuildingType.Mine && !hasBlacksmith) continue;
    const stock = state.resources[entry.stock] ?? 0;
    if (stock >= entry.minimumStock) continue;
    if (!canAfford(state, BUILDING_CONFIGS[entry.type].cost)) continue;
    const spot = findPlacementSpot(state, entry.type, 0);
    if (!spot) continue;

    return {
      command: { proto: WORKER_CMD_PROTO, op: 'startBuilding', type: entry.type, x: spot.x, y: spot.y, rotation: 0 },
      reason: `build a ${BUILDING_CONFIGS[entry.type].label} — only ${Math.floor(stock)} ${entry.stock} left`,
    };
  }

  return null;
}


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
      const desired: MineMode = (state.resources.gold ?? 0) < VirtualPlayer.MINE_GOLD_TREASURY_GOLD ? 'gold' : 'iron';
      if (mineOreForMode(building.mineMode) === desired) continue;
      return {
        command: { proto: WORKER_CMD_PROTO, op: 'setMineMode', buildingId: building.id, mode: desired },
        reason: desired === 'gold'
          ? `mine gold — only ${Math.floor(state.resources.gold ?? 0)} gold in the treasury`
          : 'mine iron — the treasury can spare the gold seam',
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
 * shortage, then top up wood below the industry shelf, and only then sell food
 * the colony has far more of than it can eat.
 */
function chooseVisitorTrade(state: WorldState, group: VisitorGroup): VisitorTradeAction | null {
  const wanted: VisitorTradeAction[] = [];
  if (!hasFoodMargin(state, VirtualPlayer.FOOD_BUFFER_DAYS)) wanted.push('buy_food');
  if ((state.resources.wood ?? 0) < LOW_WOOD_STOCK) wanted.push('buy_wood');
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
 * `deliverVisitorQuest` needs the goods actually in store, and
 * `getVisitorTradeEligibility` prices the whole deal — the bot never spends an
 * hour on a visitor action the owner would refuse. Refugee groups are left alone:
 * the bot does not decide who gets to settle, and merely talking to them opens
 * that negotiation.
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
  if (countIdleAdults(state) === 0) return null;

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
 * 16 — upkeep and agency, only where the owner accepts and the gain is real.
 *
 *  - `upgradeBuilding` only as a last resort: settlers are homeless, no bed is
 *    free, and there is no legal plot left to build another house on.
 *  - `tameEntity` only from a deep larder, for a creature a Taming Post can
 *    actually reach.
 *
 * Two deliberate omissions:
 *  - `moveOutOfFamilyHome` — the owner accepts the command but its own
 *    reconciliation immediately re-homes the grown child into the parent's
 *    housing unit, so the proposal could never retire (see
 *    BUG_REPORTS/2026-09-13-move-out-reverted-by-residency-reconciliation.md).
 *  - `placeStripChain` (roads) — no owner exposes a rule for *where* a corridor
 *    should run, and inventing one would be gameplay.
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

  return null;
}

/**
 * 17 — rival relations, peaceful first: a gift to a tense neighbour, a truce, a
 * trade route, and only then a raid — and a raid solely against an already-tense
 * rival with three times the march provisions in store. The bot is a settler, not
 * a warmonger.
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

  for (const rival of rivals) {
    if (!hasFoodMargin(state, VirtualPlayer.RIVAL_FOOD_RESERVE_DAYS)) continue;
    if (!getPeaceTreatyEligibility(state, rival.id).ok) continue;
    return {
      command: { proto: WORKER_CMD_PROTO, op: 'signPeaceTreaty', rivalId: rival.id },
      reason: `sign peace with ${rival.name} — a truce is affordable`,
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
    ?? decideUpkeep(state)
    ?? decideRivalRelations(state)
  );
}
