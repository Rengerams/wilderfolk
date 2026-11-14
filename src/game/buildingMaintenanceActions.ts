import { moveResident } from './housingPipeline';
import { isStripBuildType, MAX_STRIP_SEGMENTS } from './stripBuild';
import type { Building, WorldState } from './gameTypes';
import { BuildingType, LEVEL_BENEFIT_BUILDING_TYPES } from './gameTypes';
import { getBuildingConfig } from './buildingConfig';
import { addResource, updateStorageCaps } from './economy';
import { getBuildingCenter } from './buildingGeometry';
import { addFloatingText, addNotification, createDeathParticles, impulseScreenShake } from './simEffects';
import { assignMissingWorkers, removeWorkerTransition } from './workforce';
import { unindexAdjacency } from './adjacencyIndex';
import { allPlayerHumans } from './playerHuman';
import { getResidenceCapacity, isResidenceBuildingType } from './housingModel';
import { assignMissingResidences } from './housingPipeline';
import { buildHousingUnits } from './housingPipeline';
import { invalidatePopulationSnapshotCache } from './populationGrowth';

/** The repair owner's materials. Exported so a spender can leave the price of one repair behind. */
export const REPAIR_COST = { wood: 10, stone: 5 } as const;
const BUILDING_REFUND_RATIO = 0.5;
const MAX_DEMOLITION_EFFECTS = 8;
/** Upgrade ceiling: a completed building may reach this level, no further. */
const MAX_BUILDING_LEVEL = 3;

/** Reason returned for a type whose level buys nothing; the UI hides the upgrade button for it. */
export const NO_LEVEL_BENEFIT_REASON = 'This building does not have levels';

/**
 * Whether a level of this building type changes anything at all. The whole rule is membership of
 * `LEVEL_BENEFIT_BUILDING_TYPES`, which lists every type whose level some code reads.
 */
export function buildingTypeHasLevelBenefit(type: BuildingType): boolean {
  return LEVEL_BENEFIT_BUILDING_TYPES.has(type);
}

/** Reason returned for a rival settlement's structure: the player owns no maintenance on it. */
export const NOT_PLAYER_OWNED_REASON = 'Not your building';

/**
 * The shared ownership gate: rival structures are never the player's to repair, upgrade or demolish.
 * `buildings.isCompletedPlayerBuilding` adds the completed half of the same boundary.
 */
export function isPlayerOwnedBuilding(building: Building): boolean {
  return building.faction !== 'rival';
}

/**
 * Whether `repairBuilding` would actually restore this building: it exists, stands complete,
 * is player-owned, is damaged, and its fixed cost is affordable. Single definition of the repair rule.
 */
export function getRepairBuildingEligibility(
  state: WorldState,
  buildingId: number,
): { ok: boolean; blockReason?: string } {
  return getRepairBuildingEligibilityFor(state, state.buildings.find((candidate) => candidate.id === buildingId));
}

/** Same repair rule without an O(buildings) ID lookup inside a batch sweep. */
export function getRepairBuildingEligibilityFor(
  state: Pick<WorldState, 'resources'>,
  building: Building | undefined,
): { ok: boolean; blockReason?: string } {
  if (!building) return { ok: false, blockReason: 'No such building' };
  if (!isPlayerOwnedBuilding(building)) return { ok: false, blockReason: NOT_PLAYER_OWNED_REASON };
  if (!building.completed) return { ok: false, blockReason: 'Still under construction' };
  if (building.health >= building.maxHealth) return { ok: false, blockReason: 'Already at full health' };
  if (state.resources.wood < REPAIR_COST.wood || state.resources.stone < REPAIR_COST.stone) {
    return { ok: false, blockReason: `Need ${REPAIR_COST.wood}w ${REPAIR_COST.stone}s` };
  }
  return { ok: true };
}

/** Repair a completed damaged building for the established fixed resource cost. */
export function repairBuilding(originalState: WorldState, buildingId: number): WorldState {
  const state = structuredClone(originalState);
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  if (!building) return state;

  const eligibility = getRepairBuildingEligibility(originalState, buildingId);
  if (!eligibility.ok) {
    // A building that is unfinished, already whole or not the player's stays silent (the UI never
    // offers the button); a real repair the colony cannot pay for shows the cost.
    const structural = !building.completed || building.health >= building.maxHealth
      || !isPlayerOwnedBuilding(building);
    if (!structural) {
      const centre = getBuildingCenter(building);
      addFloatingText(
        state,
        centre.x,
        centre.y,
        eligibility.blockReason ?? 'Cannot repair',
        '#ef4444',
      );
    }
    return state;
  }

  state.resources.wood -= REPAIR_COST.wood;
  state.resources.stone -= REPAIR_COST.stone;
  building.health = building.maxHealth;
  createDeathParticles(state, building.x, building.y, '#22c55e', 10, 'sparkle');
  addFloatingText(state, building.x, building.y - 10, 'Repaired!', '#22c55e');
  return state;
}

/**
 * Repair several damaged structures in one authoritative action: one world clone, each target
 * checked against the *remaining* budget by the repair owner.
 */
export function repairBuildings(originalState: WorldState, buildingIds: readonly number[]): WorldState {
  if (buildingIds.length === 0) return originalState;
  const state = structuredClone(originalState);
  const requested = new Set(buildingIds);
  let repaired = 0;
  let first: Building | undefined;

  for (const building of state.buildings) {
    if (!requested.has(building.id)) continue;
    if (!getRepairBuildingEligibilityFor(state, building).ok) continue;
    state.resources.wood -= REPAIR_COST.wood;
    state.resources.stone -= REPAIR_COST.stone;
    building.health = building.maxHealth;
    repaired++;
    first ??= building;
  }

  if (first && repaired > 0) {
    // One brief effect per batch, not hundreds of notifications or particles.
    addFloatingText(state, first.x, first.y - 10, `Repaired ${repaired} structures`, '#22c55e');
  }
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
 * Whether `upgradeBuilding` would actually raise this building a level: it exists, stands complete,
 * is below the ceiling, has a level benefit, and its cost is affordable.
 */
export function getBuildingUpgradeEligibility(
  state: WorldState,
  buildingId: number,
): { ok: boolean; blockReason?: string } {
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  if (!building) return { ok: false, blockReason: 'No such building' };
  if (!isPlayerOwnedBuilding(building)) return { ok: false, blockReason: NOT_PLAYER_OWNED_REASON };
  if (!building.completed) return { ok: false, blockReason: 'Still under construction' };
  if (building.level >= MAX_BUILDING_LEVEL) {
    return { ok: false, blockReason: `Already level ${MAX_BUILDING_LEVEL}` };
  }
  // A type whose level nothing reads must not offer the upgrade: reported as `structural` below,
  // so it stays silent and the button simply does not render.
  if (!buildingTypeHasLevelBenefit(building.type)) {
    return { ok: false, blockReason: NO_LEVEL_BENEFIT_REASON };
  }

  const { wood: costWood, stone: costStone, gold: costGold } = getBuildingUpgradeCost(building);
  if (state.resources.wood < costWood || state.resources.stone < costStone || state.resources.gold < costGold) {
    return { ok: false, blockReason: `Need ${costWood}w ${costStone}s ${costGold}g` };
  }
  return { ok: true };
}

export function upgradeBuilding(
  originalState: WorldState,
  buildingId: number,
  ownership: 'isolated' | 'owned' = 'isolated',
): WorldState {
  const originalBuilding = originalState.buildings.find((candidate) => candidate.id === buildingId);
  if (!originalBuilding || !isPlayerOwnedBuilding(originalBuilding)) return originalState;

  const eligibility = getBuildingUpgradeEligibility(originalState, buildingId);
  const structural = !originalBuilding.completed
    || originalBuilding.level >= MAX_BUILDING_LEVEL
    || !buildingTypeHasLevelBenefit(originalBuilding.type);
  if (!eligibility.ok && structural) return originalState;

  // The worker already owns its state. Isolated callers retain their copy-on-write contract.
  const state = ownership === 'owned' ? originalState : structuredClone(originalState);
  const building = state.buildings.find((candidate) => candidate.id === buildingId)!;
  if (!eligibility.ok) {
    const centre = getBuildingCenter(building);
    addFloatingText(
      state,
      centre.x,
      centre.y,
      eligibility.blockReason ?? 'Cannot upgrade',
      '#ef4444',
    );
    return state;
  }

  const { wood: costWood, stone: costStone, gold: costGold } = getBuildingUpgradeCost(building);
  state.resources.wood -= costWood;
  state.resources.stone -= costStone;
  state.resources.gold -= costGold;
  building.level += 1;
  if (building.type === BuildingType.Silo || building.type === BuildingType.WoodStorehouse) {
    updateStorageCaps(state);
  }
  // Bed capacity is level-dependent, and the population snapshot cache would keep reporting the
  // pre-upgrade count until the next tick.
  invalidatePopulationSnapshotCache(state);

  if (isResidenceBuildingType(building.type)) {
    const capacity = getResidenceCapacity(building);
    assignMissingResidences(allPlayerHumans(state.entities), state.buildings, state.entities);
    addFloatingText(state, building.x, building.y - 15, `Expanded! Fits ${capacity} residents`, '#3b82f6');
    addNotification(
      state,
      'Home expanded',
      `${getBuildingConfig(building.type).label} now holds ${capacity} family members.`,
      'success',
    );
  } else {
    addFloatingText(state, building.x, building.y - 15, `Upgraded to Lv.${building.level}!`, '#3b82f6');
  }

  createDeathParticles(state, building.x, building.y, '#3b82f6', 15, 'star');
  impulseScreenShake(state, 3);
  return state;
}

/** Clear every assignment which references a building before it leaves authoritative state. */
function clearAssignmentsForDemolishedBuilding(
  state: WorldState,
  buildingIds: ReadonlySet<number>,
): { residents: Set<number>; workforce: boolean } {
  const affected = { residents: new Set<number>(), workforce: false };
  for (const entity of state.entities) {
    if (entity.workerBuildingId != null && buildingIds.has(entity.workerBuildingId)) {
      removeWorkerTransition(entity, state.buildings);
      affected.workforce = true;
    }
    if (entity.residenceBuildingId != null && buildingIds.has(entity.residenceBuildingId)) {
      moveResident(entity, undefined, 'demolition', { buildings: state.buildings });
      affected.residents.add(entity.id);
    }
    if (entity.prisonBuildingId != null && buildingIds.has(entity.prisonBuildingId)) {
      entity.prisonBuildingId = undefined;
      entity.prisonerUntilTick = undefined;
      entity.prisonSentenceCrime = undefined;
      affected.residents.add(entity.id);
      affected.workforce = true;
    }
  }
  return affected;
}

/** The one owner of "a building leaves authoritative state": the completed-building counter, the
 *  adjacency index, its `state.adjacency` shadow and the road cache. Callers own why + assignments. */
export function removeBuildingFromState(state: WorldState, building: Building): void {
  removeBuildingsFromState(state, [building]);
}

/** Remove a batch through the same topology and completed-building counter owner. */
function removeBuildingsFromState(state: WorldState, buildings: readonly Building[]): void {
  const removedIds = new Set<number>();
  let completed = 0;
  for (const building of buildings) {
    removedIds.add(building.id);
    unindexAdjacency(state, building.id);
    if (building.type === BuildingType.Road) {
      state.roadAvoidance = undefined;
      state.roadAvoidanceStamp = undefined;
    }
    if (building.completed && building.faction !== 'rival') completed++;
  }
  state.adjacency = undefined;
  state.buildings = state.buildings.filter((candidate) => !removedIds.has(candidate.id));
  state.totalBuildingsCompleted = Math.max(0, state.totalBuildingsCompleted - completed);
}

/**
 * Half a removed building's build cost, credited through `addResource` (storage-cap owner) so the
 * refund clamps. One owner for the refund rule; returns what was actually accepted.
 */
export function refundBuildingCost(
  state: WorldState,
  type: BuildingType,
): { wood: number; stone: number; gold: number } {
  const config = getBuildingConfig(type);
  const refundWood = Math.floor(config.cost.wood * BUILDING_REFUND_RATIO);
  const refundStone = Math.floor(config.cost.stone * BUILDING_REFUND_RATIO);
  const refundGold = Math.floor(config.cost.gold * BUILDING_REFUND_RATIO);
  return {
    wood: addResource(state, 'wood', refundWood),
    stone: addResource(state, 'stone', refundStone),
    gold: addResource(state, 'gold', refundGold),
  };
}

/** A completed player gate toggles between an open passage and a solid obstacle. */
export function toggleWallGate(originalState: WorldState, buildingId: number): WorldState {
  const gate = originalState.buildings.find((building) => building.id === buildingId);
  if (!gate || gate.type !== BuildingType.WallGate || !isPlayerOwnedBuilding(gate) || !gate.completed) {
    return originalState;
  }
  const state = structuredClone(originalState);
  const replacement = state.buildings.find((building) => building.id === buildingId)!;
  replacement.gateClosed = replacement.gateClosed !== true;
  return state;
}

export function demolishBuildingInPlace(state: WorldState, buildingId: number, cause: 'demolition' | 'raid' = 'demolition'): WorldState {
  return demolishBuildingsInPlace(state, [buildingId], cause);
}

/** Batch destruction clears assignments once and reconciles only after every structure is gone. */
export function demolishBuildingsInPlace(state: WorldState, buildingIds: readonly number[], cause: 'demolition' | 'raid' = 'demolition'): WorldState {
  if (buildingIds.length === 0) return state;
  const requested = new Set(buildingIds);
  const buildings = state.buildings.filter(
    (building) => requested.has(building.id) && isPlayerOwnedBuilding(building),
  );
  if (buildings.length === 0) return state;
  const affected = clearAssignmentsForDemolishedBuilding(state, new Set(buildings.map((building) => building.id)));
  for (const [index, building] of buildings.entries()) {
    if (!building.completed && building.occupants.length > 0) affected.workforce = true;
    const refund = cause === 'raid' ? { wood: 0, stone: 0 } : refundBuildingCost(state, building.type);
    if (index >= MAX_DEMOLITION_EFFECTS) continue;
    createDeathParticles(state, building.x, building.y, '#71717a', 25, 'smoke');
    addFloatingText(state, building.x, building.y - 10, cause === 'raid' ? 'Destroyed in battle'
      : `Refunded: ${refund.wood}w ${refund.stone}s`, '#eab308');
  }
  impulseScreenShake(state, 4);
  removeBuildingsFromState(state, buildings);
  updateStorageCaps(state);
  invalidatePopulationSnapshotCache(state);
  if (affected.residents.size > 0 || affected.workforce) {
    const humans = allPlayerHumans(state.entities);
    if (affected.residents.size > 0) {
      const displacedHouseholds = buildHousingUnits(humans)
        .filter((unit) => unit.some((human) => affected.residents.has(human.id)))
        .flat();
      if (displacedHouseholds.length > 0) {
        assignMissingResidences(displacedHouseholds, state.buildings, state.entities, state.tick);
      }
    }
    if (affected.workforce) assignMissingWorkers(humans, state.buildings, state);
  }
  return state;
}

/** Immutable public API used outside the worker-command owner. */
export function demolishBuilding(originalState: WorldState, buildingId: number): WorldState {
  return demolishBuildingInPlace(structuredClone(originalState), buildingId);
}
/** Strip selection delegates demolition, assignment cleanup, and refunds to the shared batch owner. */
export function demolishStripBuildingsInPlace(state: WorldState, buildingIds: readonly number[]): WorldState {
  if (buildingIds.length === 0 || buildingIds.length > MAX_STRIP_SEGMENTS) return state;
  const wanted = new Set(buildingIds);
  if (wanted.size !== buildingIds.length) return state;
  const selected = state.buildings.filter((building) => wanted.has(building.id)
    && isPlayerOwnedBuilding(building) && isStripBuildType(building.type));
  return demolishBuildingsInPlace(state, selected.map((building) => building.id));
}
