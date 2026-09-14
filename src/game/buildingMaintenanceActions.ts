import type { Building, Entity, WorldState } from './gameTypes';
import { BUILDING_CONFIGS, BuildingType } from './gameTypes';
import { addResource } from './economy';
import { addFloatingText, addNotification, createDeathParticles, impulseScreenShake } from './simEffects';
import { assignMissingWorkers, removeWorkerTransition } from './workforce';
import { unindexAdjacency } from './adjacencyIndex';
import { isPlayerHuman } from './playerHuman';
import { getResidenceCapacity, isResidenceBuildingType } from './residencyOccupancy';
import { assignMissingResidences } from './residencyReconciliation';

const REPAIR_COST = { wood: 10, stone: 5 } as const;
const BUILDING_REFUND_RATIO = 0.5;
/** Upgrade ceiling: a completed building may reach this level, no further. */
const MAX_BUILDING_LEVEL = 3;

/**
 * Whether `repairBuilding` would actually restore this building: it exists,
 * stands complete, is damaged, and its fixed cost is affordable.
 *
 * Single definition of the repair rule — `repairBuilding` refuses to spend
 * anything unless this says `ok`, and the auto-play bot
 * (`virtualPlayer.ts`) proposes a repair only when it does, so the bot can
 * never claim an in-game hour with a command the owner would refuse.
 */
export function getRepairBuildingEligibility(
  state: WorldState,
  buildingId: number,
): { ok: boolean; blockReason?: string } {
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  if (!building) return { ok: false, blockReason: 'No such building' };
  if (!building.completed) return { ok: false, blockReason: 'Still under construction' };
  if (building.health >= building.maxHealth) return { ok: false, blockReason: 'Already at full health' };
  if (state.resources.wood < REPAIR_COST.wood || state.resources.stone < REPAIR_COST.stone) {
    return { ok: false, blockReason: `Need ${REPAIR_COST.wood}w ${REPAIR_COST.stone}s` };
  }
  return { ok: true };
}

function listPlayerHumans(state: WorldState): Entity[] {
  return state.entities.filter(isPlayerHuman);
}

function reconcileAssignmentsAfterBuildingRemoval(state: WorldState): void {
  const humans = listPlayerHumans(state);
  assignMissingResidences(humans, state.buildings, state.entities);
  assignMissingWorkers(humans, state.buildings);
}

/** Repair a completed damaged building for the established fixed resource cost. */
export function repairBuilding(originalState: WorldState, buildingId: number): WorldState {
  const state = structuredClone(originalState);
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  if (!building) return state;

  const eligibility = getRepairBuildingEligibility(originalState, buildingId);
  if (!eligibility.ok) {
    // A building that is unfinished or already whole stays silent (the UI never
    // offers the button); a real repair the colony cannot pay for shows the cost.
    const structural = !building.completed || building.health >= building.maxHealth;
    if (!structural) {
      addFloatingText(
        state,
        building.x + building.width / 2,
        building.y,
        eligibility.blockReason ?? 'Cannot repair',
        '#ef4444',
      );
    }
    return state;
  }

  state.resources.wood -= REPAIR_COST.wood;
  state.resources.stone -= REPAIR_COST.stone;
  building.health = building.maxHealth;
  createDeathParticles(state, building.x + building.width / 2, building.y, '#22c55e', 10, 'sparkle');
  addFloatingText(state, building.x, building.y - 10, 'Repaired!', '#22c55e');
  return state;
}

export function getBuildingUpgradeCost(building: Building): { wood: number; stone: number; gold: number } {
  return {
    wood: 50 * building.level,
    stone: 25 * building.level,
    gold: 50 * building.level,
  };
}

/**
 * Whether `upgradeBuilding` would actually raise this building a level:
 * it exists, stands complete, is below the level ceiling, is not the
 * already-complete Leader's House, and its cost is affordable.
 *
 * Single definition of the upgrade rule, shared with the auto-play bot
 * (`virtualPlayer.ts`) exactly like `getRepairBuildingEligibility`.
 */
export function getBuildingUpgradeEligibility(
  state: WorldState,
  buildingId: number,
): { ok: boolean; blockReason?: string } {
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  if (!building) return { ok: false, blockReason: 'No such building' };
  if (!building.completed) return { ok: false, blockReason: 'Still under construction' };
  if (building.level >= MAX_BUILDING_LEVEL) {
    return { ok: false, blockReason: `Already level ${MAX_BUILDING_LEVEL}` };
  }
  if (building.type === BuildingType.LeaderHouse) {
    return { ok: false, blockReason: "The Leader's House is fully built" };
  }

  const { wood: costWood, stone: costStone, gold: costGold } = getBuildingUpgradeCost(building);
  if (state.resources.wood < costWood || state.resources.stone < costStone || state.resources.gold < costGold) {
    return { ok: false, blockReason: `Need ${costWood}w ${costStone}s ${costGold}g` };
  }
  return { ok: true };
}

export function upgradeBuilding(originalState: WorldState, buildingId: number): WorldState {
  const state = structuredClone(originalState);
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  if (!building) return state;

  const eligibility = getBuildingUpgradeEligibility(originalState, buildingId);
  if (!eligibility.ok) {
    // Unfinished, capped, or the Leader's House stay silent (no button in the UI);
    // an affordable-looking upgrade the colony cannot pay for shows the price.
    const structural =
      !building.completed || building.level >= MAX_BUILDING_LEVEL || building.type === BuildingType.LeaderHouse;
    if (!structural) {
      addFloatingText(
        state,
        building.x + building.width / 2,
        building.y,
        eligibility.blockReason ?? 'Cannot upgrade',
        '#ef4444',
      );
    }
    return state;
  }

  const { wood: costWood, stone: costStone, gold: costGold } = getBuildingUpgradeCost(building);
  state.resources.wood -= costWood;
  state.resources.stone -= costStone;
  state.resources.gold -= costGold;
  building.level += 1;

  if (isResidenceBuildingType(building.type)) {
    const capacity = getResidenceCapacity(building);
    assignMissingResidences(listPlayerHumans(state), state.buildings, state.entities);
    addFloatingText(state, building.x, building.y - 15, `Expanded! Fits ${capacity} residents`, '#3b82f6');
    addNotification(
      state,
      'Home expanded',
      `${BUILDING_CONFIGS[building.type].label} now holds ${capacity} family members.`,
      'success',
    );
  } else {
    addFloatingText(state, building.x, building.y - 15, `Upgraded to Lv.${building.level}!`, '#3b82f6');
  }

  createDeathParticles(state, building.x + building.width / 2, building.y, '#3b82f6', 15, 'star');
  impulseScreenShake(state, 3);
  return state;
}

/** Clear every assignment which references a building before it leaves authoritative state. */
function clearAssignmentsForDemolishedBuilding(state: WorldState, buildingId: number): void {
  for (const entity of state.entities) {
    // Workforce cleanup through the owner's transition keeps work fields consistent.
    if (entity.homeBuildingId === buildingId) removeWorkerTransition(entity, state.buildings);
    if (entity.residenceBuildingId === buildingId) entity.residenceBuildingId = undefined;
    if (entity.prisonBuildingId === buildingId) {
      entity.prisonBuildingId = undefined;
      entity.prisonerUntilTick = undefined;
      entity.prisonSentenceCrime = undefined;
    }
  }
}

export function demolishBuilding(originalState: WorldState, buildingId: number): WorldState {
  const state = structuredClone(originalState);
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  if (!building) return state;

  const config = BUILDING_CONFIGS[building.type];
  const refundWood = Math.floor(config.cost.wood * BUILDING_REFUND_RATIO);
  const refundStone = Math.floor(config.cost.stone * BUILDING_REFUND_RATIO);
  const refundGold = Math.floor(config.cost.gold * BUILDING_REFUND_RATIO);
  // `addResource` clamps to `storageMax` and returns what was actually added, so report that
  // rather than the nominal refund (a full store used to announce a refund it never received).
  const gotWood = addResource(state, 'wood', refundWood);
  const gotStone = addResource(state, 'stone', refundStone);
  addResource(state, 'gold', refundGold);

  clearAssignmentsForDemolishedBuilding(state, buildingId);
  createDeathParticles(
    state,
    building.x + building.width / 2,
    building.y + building.height / 2,
    '#71717a',
    25,
    'smoke',
  );
  addFloatingText(state, building.x, building.y - 10, `Refunded: ${gotWood}w ${gotStone}s`, '#eab308');
  impulseScreenShake(state, 4);

  unindexAdjacency(state, buildingId);
  state.adjacency = undefined;
  if (building.type === BuildingType.Road) {
    state.roadAvoidance = undefined;
    state.roadAvoidanceStamp = undefined;
  }
  state.buildings = state.buildings.filter((candidate) => candidate.id !== buildingId);
  // Keep the denormalized completed-building counter consistent with load-time recomputation.
  if (building.completed && building.faction !== 'rival') {
    state.totalBuildingsCompleted = Math.max(0, state.totalBuildingsCompleted - 1);
  }
  reconcileAssignmentsAfterBuildingRemoval(state);
  return state;
}
