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
 *   2. staffing       3. housing       4. food       5. research       6. festival
 *
 * Costs, affordability, placement validity, staffing eligibility, research
 * gating, and festival readiness are all delegated to their existing owner
 * modules. This file adds no new game rule.
 */
import type { WorldState } from './gameTypes';
import { BUILDING_CONFIGS, BuildingType, GRID_SIZE } from './gameTypes';
import { WORKER_CMD_PROTO, type WorkerCommand } from './simWorker/commands';
import { canPlaceBuilding } from './buildingPlacementActions';
import {
  getBuildingFootprintForType,
  snapBuildingCenter,
  type BuildingRotation,
} from './buildingRotation';
import { canAfford, getAvailableStorageHeadroom } from './resourceUtils';
import { hasResidenceAssignment, hasWorkAssignment } from './residencyOccupancy';
import { isPlayerHuman, playerHumanCount } from './playerHuman';
import { getPlayerCampCenter } from './frontierCombat';
import { canAssignWorkerToBuilding } from './buildingStaffingActions';
import { isManualStaffingBuilding } from './workforce';
import { getOpenBeds } from './populationGrowth';
import { canHostTownFestival, findPlayerTownHall } from './townHall';
import { canStartResearch } from './research';
import {
  getDiplomacyChoiceEligibility,
  VILLAGE_REQUEST_PROVISIONS_COST_GOLD,
  VILLAGE_REQUEST_PROVISIONS_FOOD,
} from './groupEvents';
import { Human, VirtualPlayer } from './gameConstants';
import type { DiplomacyEvent } from './gameTypes';

/** One proposed auto-play action plus the short player-facing reason for it. */
export interface VirtualPlayerDecision {
  command: WorkerCommand;
  reason: string;
}

/**
 * Bot policy: food producers in preference order. These are the food-category
 * buildings that actually produce food (see BUILDING_CATEGORIES → 'food');
 * Barn, Silo, and Mill are boosters and storage, so the bot never builds them
 * to answer hunger. A Farm is the no-research default.
 */
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

/**
 * Preference for a card answer: anything that reads as defending, standing
 * firm, signing peace, accepting, or helping. Falls back to the card's first
 * declared choice so an unrecognised card is still answered.
 */
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

/** Days of settler need currently in the larder. */
function foodNeedPerDay(settlers: number): number {
  return settlers * Human.DAILY_FOOD_CONSUMPTION;
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

/**
 * Bounded spiral search outward from the village anchor (one footprint plus one
 * grid cell per ring step). Snapping and validity come from the real placement
 * owner, so the bot can only ever pick a spot a human click could also pick.
 * Returns `null` when nothing legal exists inside the bounded search.
 */
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
    const choice = pickChoice(raid.choices);
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
    const choice = pickChoice(story.choices);
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

/** 2 — an idle adult plus a completed, auto-staffable workplace standing empty. */
function decideStaffing(state: WorldState): VirtualPlayerDecision | null {
  const idleAdults = countIdleAdults(state);
  if (idleAdults === 0) return null;

  for (const building of state.buildings) {
    if (!building.completed || building.faction === 'rival') continue;
    if (building.occupants.length > 0) continue;
    // Generic auto-staffing deliberately never fills manual workplaces
    // (Church, Prison, Barracks, School, Town Hall) — those stay the player's call.
    if (isManualStaffingBuilding(building)) continue;
    if (!canAssignWorkerToBuilding(state, building.id)) continue;
    return {
      command: { proto: WORKER_CMD_PROTO, op: 'autoStaffWorkers' },
      reason: `staff the empty ${BUILDING_CONFIGS[building.type].label} — ${idleAdults} idle settler${idleAdults === 1 ? '' : 's'}`,
    };
  }

  return null;
}

/** 3 — a settler with nowhere to sleep and no housing already on the way. */
function decideHousing(state: WorldState): VirtualPlayerDecision | null {
  const homeless = countHomelessSettlers(state);
  if (homeless === 0) return null;
  // Spare beds mean an assignment was missed, not that beds are short.
  if (getOpenBeds(state) > 0) return null;
  // One house at a time — a new house only helps once it stands.
  if (isUnderConstruction(state, BuildingType.House)) return null;

  const type = BuildingType.House;
  if (!canAfford(state, BUILDING_CONFIGS[type].cost)) return null;
  const spot = findPlacementSpot(state, type, 0);
  if (!spot) return null;

  return {
    command: { proto: WORKER_CMD_PROTO, op: 'startBuilding', type, x: spot.x, y: spot.y, rotation: 0 },
    reason: `build a House — ${homeless} settler${homeless === 1 ? '' : 's'} homeless`,
  };
}

/** 4 — stores below a small buffer of days of settler need. */
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

/** 5 — start the first research the owner would actually accept. */
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

/** 6 — a staffed, stocked Town Hall whose festival cooldown has elapsed. */
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
 * Decides at most ONE action for the given world, or `null` when the colony
 * needs nothing the bot knows how to fix. Pure: it never writes to `state`.
 */
export function decideVirtualPlayerAction(state: WorldState): VirtualPlayerDecision | null {
  return (
    answerOpenCard(state)
    ?? decideStaffing(state)
    ?? decideHousing(state)
    ?? decideFood(state)
    ?? decideResearch(state)
    ?? decideFestival(state)
  );
}
