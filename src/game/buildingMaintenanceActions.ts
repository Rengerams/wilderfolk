import type { Building, Entity, WorldState } from './gameTypes';
import { BUILDING_CONFIGS, BuildingType } from './gameTypes';
import { addResource } from './economy';
import { addFloatingText, addNotification, createDeathParticles, impulseScreenShake } from './simEffects';
import { assignMissingWorkers, removeWorkerTransition } from './workforce';
import { removeAdjacencyById } from './adjacencyIndex';
import { isPlayerHuman } from './playerHuman';
import {
  assignMissingResidences,
  getResidenceCapacity,
  isResidenceBuildingType,
} from './residency';

const REPAIR_COST = { wood: 10, stone: 5 } as const;
const BUILDING_REFUND_RATIO = 0.5;

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
  if (!building || !building.completed || building.health >= building.maxHealth) return state;

  if (state.resources.wood < REPAIR_COST.wood || state.resources.stone < REPAIR_COST.stone) {
    addFloatingText(
      state,
      building.x + building.width / 2,
      building.y,
      `Need ${REPAIR_COST.wood}w ${REPAIR_COST.stone}s`,
      '#ef4444',
    );
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

export function upgradeBuilding(originalState: WorldState, buildingId: number): WorldState {
  const state = structuredClone(originalState);
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  if (!building || !building.completed || building.level >= 3) return state;
  // The Leader's House comes with the office fully built — no upgrades.
  if (building.type === BuildingType.LeaderHouse) return state;

  const { wood: costWood, stone: costStone, gold: costGold } = getBuildingUpgradeCost(building);
  if (state.resources.wood < costWood || state.resources.stone < costStone || state.resources.gold < costGold) {
    addFloatingText(
      state,
      building.x + building.width / 2,
      building.y,
      `Need ${costWood}w ${costStone}s ${costGold}g`,
      '#ef4444',
    );
    return state;
  }

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
  addResource(state, 'wood', refundWood);
  addResource(state, 'stone', refundStone);
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
  addFloatingText(state, building.x, building.y - 10, `Refunded: ${refundWood}w ${refundStone}s`, '#eab308');
  impulseScreenShake(state, 4);

  removeAdjacencyById(state, buildingId);

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
